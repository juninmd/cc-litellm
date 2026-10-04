#!/usr/bin/env python3
"""A stand-in for the LiteLLM proxy endpoints the litellm-key plugin reads.

Try the plugin without a real proxy:

    python3 dev/mock-litellm.py --scenario warning &
    ANTHROPIC_BASE_URL=http://127.0.0.1:4000 ANTHROPIC_AUTH_TOKEN=sk-demo-key-12345 \
      claude --plugin-dir ./plugins/litellm-key

Scenarios: healthy, warning (default), over, expiring, blocked, nocap. Flags change one
thing on top of a scenario: --spend, --max-budget, --expires-hours, --blocked, --delay
(seconds before /key/info answers) and --fail-after (answer 502 after that many reads).

The answers are shaped like the real ones (litellm/proxy/management_endpoints). Any other
key gets the same 401 body LiteLLM sends. Nothing is stored and nothing leaves localhost.
"""
import argparse
import hashlib
import json
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

KEY = "sk-demo-key-12345"
HASH = hashlib.sha256(KEY.encode()).hexdigest()
START = datetime.now(timezone.utc).replace(microsecond=0)

SCENARIOS = {
    "healthy": dict(spend=12.5, window=0.42, model=1.2, team=412.0, user=26.1),
    "warning": dict(spend=41.37, window=1.12, model=6.2, team=912.5, user=63.4),
    "over": dict(spend=52.0, window=5.4, model=10.6, team=988.0, user=131.0),
    "expiring": dict(spend=12.5, window=0.42, model=1.2, team=412.0, user=26.1, expires_hours=20),
    "blocked": dict(spend=12.5, window=0.42, model=1.2, team=412.0, user=26.1, blocked=True),
    "nocap": dict(spend=12.5, window=0.42, model=1.2, team=412.0, user=26.1, max_budget=None),
}


def at(delta):
    return (START + delta).isoformat()


def key_info(c):
    capped = c["max_budget"] is not None
    info = {
        "key_name": "sk-...2345",
        "key_alias": "claude-code-demo",
        "spend": c["spend"],
        "total_spend": c["spend"] + (87.5 if capped else 0),
        "max_budget": c["max_budget"],
        "budget_duration": "30d" if capped else None,
        "budget_reset_at": at(timedelta(days=9, hours=3)) if capped else None,
        "expires": at(timedelta(hours=c["expires_hours"])),
        "models": [],
        "user_id": "demo",
        "team_id": "platform",
        "tpm_limit": 400000,
        "rpm_limit": 120,
        "max_parallel_requests": 8,
        "blocked": True if c["blocked"] else None,
        "status": "revoked" if c["blocked"] else "active",
    }
    if capped:
        info.update(
            model_max_budget={"claude-opus-4-1": {"budget_limit": 10.0, "time_period": "1d"}},
            model_max_budget_usage={"claude-opus-4-1": {"current_spend": c["model"], "budget_limit": 10.0, "time_period": "1d"}},
            budget_limits=[{"budget_duration": "1h", "max_budget": 5.0, "reset_at": at(timedelta(minutes=38))}],
            budget_limits_usage={"1h": {"current_spend": c["window"]}},
        )
    return {"key": HASH, "info": info}


def user_info(c):
    return {
        "user_id": "demo",
        "user_info": {
            "user_id": "demo",
            "user_email": "demo@example.com",
            "user_role": "internal_user",
            "spend": c["user"],
            "max_budget": 150.0,
            "budget_duration": "30d",
            "budget_reset_at": at(timedelta(days=9, hours=3)),
        },
        "keys": [],
        "teams": [],
    }


def team_info(c):
    return {
        "team_id": "platform",
        "team_info": {
            "team_id": "platform",
            "team_alias": "platform-eng",
            "spend": c["team"],
            "max_budget": 1000.0,
            "budget_duration": "30d",
            "budget_reset_at": at(timedelta(days=4)),
        },
        "keys": [],
        "team_memberships": [],
    }


def models():
    names = ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5", "gpt-5"]
    return {"object": "list", "data": [{"id": name, "object": "model", "owned_by": "openai"} for name in names]}


def daily_activity():
    today = datetime.now(timezone.utc).date()
    results = []
    for back, spend in zip(range(6, -1, -1), [3.1, 5.4, 0.0, 7.9, 9.2, 4.4, 11.37]):
        if spend == 0:
            continue
        results.append(
            {
                "date": (today - timedelta(days=back)).isoformat(),
                "metrics": {
                    "spend": spend,
                    "api_requests": int(spend * 9),
                    "total_tokens": int(spend * 210000),
                    "prompt_tokens": int(spend * 170000),
                    "completion_tokens": int(spend * 40000),
                    "cache_read_input_tokens": int(spend * 120000),
                },
                "breakdown": {
                    "models": {
                        "claude-sonnet-4-5": {"metrics": {"spend": spend * 0.7}},
                        "claude-opus-4-1": {"metrics": {"spend": spend * 0.3}},
                    }
                },
            }
        )
    return {"results": results, "metadata": {"total_spend": sum(r["metrics"]["spend"] for r in results)}}


def handler(config, delay, fail_after):
    reads = {"key": 0}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, body):
            raw = body.encode() if isinstance(body, str) else json.dumps(body).encode()
            self.send_response(status)
            self.send_header("content-type", "text/plain" if isinstance(body, str) else "application/json")
            self.send_header("content-length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            path = urlparse(self.path).path
            sent = self.headers.get("x-litellm-api-key") or self.headers.get("authorization") or ""
            if KEY not in sent:
                shown = sent.replace("Bearer ", "")
                return self.reply(
                    401,
                    {
                        "error": {
                            "message": f"Authentication Error, Invalid proxy server token passed. Received API Key = {shown}",
                            "type": "auth_error",
                            "param": "None",
                            "code": "401",
                        }
                    },
                )
            if path == "/key/info":
                reads["key"] += 1
                if fail_after is not None and reads["key"] > fail_after:
                    return self.reply(502, "Bad Gateway")
                if delay:
                    time.sleep(delay)
            routes = {
                "/key/info": lambda: key_info(config),
                "/user/info": lambda: user_info(config),
                "/team/info": lambda: team_info(config),
                "/v1/models": models,
                "/user/daily/activity": daily_activity,
            }
            if path in routes:
                return self.reply(200, routes[path]())
            return self.reply(404, {"detail": "Not Found"})

    return Handler


def parse_budget(text):
    return None if text.lower() in ("none", "null", "no") else float(text)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--port", type=int, default=4000)
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), default="warning")
    parser.add_argument("--spend", type=float, help="what /key/info reports as spend")
    parser.add_argument("--max-budget", help="the key budget in dollars, or none")
    parser.add_argument("--expires-hours", type=float, help="hours until the key expires (negative: already expired)")
    parser.add_argument("--blocked", action="store_true")
    parser.add_argument("--delay", type=float, default=0.0)
    parser.add_argument("--fail-after", type=int)
    args = parser.parse_args()

    config = {"max_budget": 50.0, "expires_hours": 960.0, "blocked": False, **SCENARIOS[args.scenario]}
    if args.spend is not None:
        config["spend"] = args.spend
    if args.max_budget is not None:
        config["max_budget"] = parse_budget(args.max_budget)
    if args.expires_hours is not None:
        config["expires_hours"] = args.expires_hours
    if args.blocked:
        config["blocked"] = True
    print(f"mock LiteLLM ({args.scenario}) on http://127.0.0.1:{args.port}  key: {KEY}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), handler(config, args.delay, args.fail_after)).serve_forever()
