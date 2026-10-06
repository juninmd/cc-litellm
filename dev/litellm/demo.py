#!/usr/bin/env python3
"""Stages the local lab for the screenshot walkthrough (dev/evidence/steps/walkthrough-*.json).

    python dev/litellm/demo.py seed KEYFILE       # team platform-eng, user ana@example.com, key claude-code-ana
    python dev/litellm/demo.py spend ALIAS 30     # set a key's recorded spend, to photograph a budget state
    python dev/litellm/demo.py expiring KEYFILE   # a key that expires in 10 s ("old-contractor")

LOCAL ONLY: it writes with the master key, so it refuses any URL that is not loopback. The new key goes to KEYFILE,
never to stdout. Spend set by `spend` is staged (the proxy's own number is overwritten): say so wherever it is shown.
"""
import ipaddress
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("LITELLM_URL", "http://127.0.0.1:4000").rstrip("/")
MASTER = os.environ.get("LITELLM_MASTER_KEY", "sk-local-master-key")


def require_loopback():
    host = urllib.parse.urlparse(BASE).hostname or ""
    try:
        is_local = host == "localhost" or ipaddress.ip_address(host).is_loopback
    except ValueError:
        is_local = False
    if not is_local:
        sys.exit(f"refusing to run against {host!r}: this script writes with the master key and is for the local lab only")


def call(path, body=None):
    req = urllib.request.Request(
        BASE + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {MASTER}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as reply:
            return json.loads(reply.read() or b"{}")
    except urllib.error.HTTPError as error:
        return {"_error": error.code, "_body": error.read().decode()[:200]}


def save_key(response, outfile):
    if "key" not in response:
        sys.exit(f"key creation failed: {response}")
    with open(outfile, "w", encoding="utf-8") as handle:
        handle.write(response["key"])
    print(f"key {response.get('key_alias')} -> {outfile} (sk-...{response['key'][-4:]})")


def seed(outfile):
    for team in call("/v2/team/list").get("teams", []):
        if team.get("team_alias") == "platform-eng":
            call("/team/delete", {"team_ids": [team["team_id"]]})
    team = call("/team/new", {"team_alias": "platform-eng", "max_budget": 200, "budget_duration": "30d", "tpm_limit": 600000, "rpm_limit": 600})
    call("/user/new", {"user_id": "ana@example.com", "user_email": "ana@example.com", "user_role": "internal_user", "max_budget": 100, "budget_duration": "30d", "auto_create_key": False})
    save_key(
        call(
            "/key/generate",
            {"key_alias": "claude-code-ana", "user_id": "ana@example.com", "team_id": team["team_id"], "max_budget": 25, "budget_duration": "30d", "rpm_limit": 120, "tpm_limit": 200000, "duration": "90d", "models": [], "metadata": {"purpose": "claude-code"}},
        ),
        outfile,
    )


def spend(alias, amount):
    rows = call(f"/key/list?return_full_object=true&key_alias={urllib.parse.quote(alias)}").get("keys", [])
    row = next((item for item in rows if item.get("key_alias") == alias), None)
    if row is None:
        sys.exit(f"no key with alias {alias!r}")
    call("/key/update", {"key": row["token"], "spend": float(amount)})
    info = call(f"/key/info?key={row['token']}")["info"]
    print(f"{alias}: spend {info['spend']} of {info['max_budget']}")


def expiring(outfile):
    save_key(call("/key/generate", {"key_alias": "old-contractor", "user_id": "ana@example.com", "max_budget": 10, "duration": "10s"}), outfile)


def main():
    require_loopback()
    command, *args = sys.argv[1:] or [""]
    if command == "seed" and len(args) == 1:
        seed(args[0])
    elif command == "spend" and len(args) == 2:
        spend(args[0], args[1])
    elif command == "expiring" and len(args) == 1:
        expiring(args[0])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
