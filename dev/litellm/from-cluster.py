#!/usr/bin/env python3
"""Builds a local LiteLLM setup from the proxy that already runs in your Kubernetes cluster.

    python dev/litellm/from-cluster.py --namespace NS --configmap CM --secret SECRET

Reads (kubectl, read-only): the proxy's config.yaml from the ConfigMap, and from the Secret ONLY the
variables that config's model_list points at (os.environ/NAME): the provider keys, nothing else
(no master key, no database or redis password).

Writes two files next to this script, both git-ignored:
  .env                  the provider keys, plus a local master key
  config.cluster.yaml   model_list, fallbacks and router settings, trimmed for a laptop

Then:  LITELLM_CONFIG=config.cluster.yaml docker compose -f dev/litellm/docker-compose.yml up -d

Secret values are never printed. The demo price makes spend visible for free models.
"""
import argparse
import base64
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).parent
NAME = re.compile(r"^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$")
ENV_REF = re.compile(r"^os\.environ/([A-Za-z_][A-Za-z0-9_]*)$")
LOCAL_MASTER = "sk-local-master-key"
DEMO_FAIL_MODEL = "demo/always-429"


def kubectl(*args):
    exe = shutil.which("kubectl")
    if not exe:
        sys.exit("kubectl not found on PATH")
    done = subprocess.run([exe, *args], capture_output=True, text=True, timeout=60)
    if done.returncode != 0:
        sys.exit(f"kubectl {args[0]} {args[1]} failed: {done.stderr.strip().splitlines()[-1] if done.stderr.strip() else 'no output'}")
    return done.stdout


def referenced_env(node, found):
    """Names of every os.environ/NAME inside a model_list entry."""
    if isinstance(node, dict):
        for value in node.values():
            referenced_env(value, found)
    elif isinstance(node, list):
        for value in node:
            referenced_env(value, found)
    elif isinstance(node, str) and (match := ENV_REF.match(node)):
        found.add(match.group(1))
    return found


def read_secret(namespace, secret, wanted):
    data = json.loads(kubectl("-n", namespace, "get", "secret", secret, "-o", "json")).get("data") or {}
    values = {name: base64.b64decode(data[name]).decode() for name in sorted(wanted) if name in data}
    return values, sorted(wanted - values.keys())


def with_price(model_list, per_token):
    for entry in model_list:
        params = entry.setdefault("litellm_params", {})
        params.setdefault("input_cost_per_token", per_token)
        params.setdefault("output_cost_per_token", per_token)
    return model_list


def trimmed(source, price):
    router = {k: v for k, v in (source.get("router_settings") or {}).items() if not k.startswith("redis_")}
    model_list = with_price(source["model_list"], price)
    first_group = next(iter(router.get("fallbacks", [{}])[0].keys()), model_list[0]["model_name"])
    model_list.append(
        {
            "model_name": DEMO_FAIL_MODEL,
            "litellm_params": {"model": "openai/mock-broken", "api_key": "mock", "mock_response": "litellm.RateLimitError"},
        }
    )
    router.setdefault("fallbacks", []).append({DEMO_FAIL_MODEL: [first_group]})
    settings = source.get("litellm_settings") or {}

    return {
        "model_list": model_list,
        "litellm_settings": {
            "master_key": "os.environ/LITELLM_MASTER_KEY",
            "database_url": "os.environ/DATABASE_URL",
            "drop_params": True,
            "num_retries": settings.get("num_retries", 2),
            "request_timeout": settings.get("request_timeout", 600),
        },
        "router_settings": router,
        "general_settings": {
            "store_model_in_db": False,
            "allow_requests_on_db_unavailable": False,
            "dangerously_allow_mock_testing_request_params": True,
        },
    }


def summarize(config, found, missing):
    groups = {}
    for entry in config["model_list"]:
        groups.setdefault(entry["model_name"], []).append(entry["litellm_params"]["model"])
    print(f"model groups ({len(groups)}):")
    for name, models in groups.items():
        print(f"  {name:<28} {len(models)} deployment(s)")
    print("fallbacks:")
    for chain in config["router_settings"].get("fallbacks", []):
        for source, targets in chain.items():
            print(f"  {source} -> {' -> '.join(targets)}")
    for chain in config["router_settings"].get("context_window_fallbacks", []):
        for source, targets in chain.items():
            print(f"  (context window) {source} -> {' -> '.join(targets)}")
    print(f"provider variables copied: {', '.join(sorted(found)) or 'none'}")
    if missing:
        print(f"WARNING referenced but not in the secret: {', '.join(missing)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--configmap", required=True)
    parser.add_argument("--secret", required=True)
    parser.add_argument("--config-key", default="config.yaml")
    parser.add_argument("--price", type=float, default=0.00001, help="demo $ per token for models without a price (default 0.00001 = $10 per 1M)")
    parser.add_argument("--master-key", default=LOCAL_MASTER, help="local master key for the dev proxy (never the cluster's)")
    args = parser.parse_args()
    for label, value in (("namespace", args.namespace), ("configmap", args.configmap), ("secret", args.secret)):
        if not NAME.match(value):
            sys.exit(f"--{label} is not a valid Kubernetes name")

    raw = json.loads(kubectl("-n", args.namespace, "get", "configmap", args.configmap, "-o", "json"))["data"][args.config_key]
    source = yaml.safe_load(raw)
    wanted = referenced_env(source["model_list"], set())
    values, missing = read_secret(args.namespace, args.secret, wanted)

    config = trimmed(source, args.price)
    (HERE / "config.cluster.yaml").write_text(
        "# generated by from-cluster.py: local only, not committed\n" + yaml.safe_dump(config, sort_keys=False, width=120),
        encoding="utf-8",
    )
    lines = [f"{name}={value}" for name, value in values.items()] + [f"LITELLM_MASTER_KEY={args.master_key}"]
    (HERE / ".env").write_text("\n".join(lines) + "\n", encoding="utf-8")
    summarize(config, set(values), missing)
    print(f"\nwrote {HERE / 'config.cluster.yaml'}\nwrote {HERE / '.env'} ({len(values)} provider key(s) + local master key)")


if __name__ == "__main__":
    main()
