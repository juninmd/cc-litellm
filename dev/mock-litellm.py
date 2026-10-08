#!/usr/bin/env python3
"""A stand-in for the LiteLLM proxy endpoints the litellm-key plugin reads.

Try the plugin without a real proxy:

    python3 dev/mock-litellm.py --scenario warning &
    ANTHROPIC_BASE_URL=http://127.0.0.1:4000 ANTHROPIC_AUTH_TOKEN=sk-demo-key-12345 \
      claude --plugin-dir ./plugins/litellm-key

Scenarios: healthy, warning (default), over, expiring, blocked, nocap. Flags change one
thing on top of a scenario: --spend, --max-budget, --expires-hours, --blocked, --delay
(seconds before /key/info answers), --fail-after (answer 502 after that many reads),
--today (what today has spent, to try the daily alert), --no-usage (no usage history, as
on a proxy without the beta endpoint) and --no-health (no /health/readiness).

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
    # the team caps each member at $10 (a cap that never resets) and the key alone has spent $12.50: the proxy refuses it, the key's own budget is fine
    "member": dict(spend=12.5, window=0.42, model=1.2, team=412.0, user=26.1, member_cap=10.0, organization="acme-org"),
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
        "organization_id": c.get("organization"),
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
            "user_role": "proxy_admin" if c.get("admin") else "internal_user",
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
            "team_member_budget_table": {"max_budget": c["member_cap"], "budget_duration": None} if c.get("member_cap") else None,
        },
        "keys": [],
        "team_memberships": [],
    }


def model_groups():
    # per-token dollars, like /model_group/info; the proxy lists every group, the plugin keeps the key's
    groups = {"claude-sonnet-4-5": (3e-6, 1.5e-5, 200000), "claude-opus-4-1": (1.5e-5, 7.5e-5, 200000), "claude-haiku-4-5": (1e-6, 5e-6, 200000), "gpt-5": (1.25e-6, 1e-5, 400000)}
    return {"data": [{"model_group": name, "input_cost_per_token": i, "output_cost_per_token": o, "max_input_tokens": ctx} for name, (i, o, ctx) in groups.items()]}


def models():
    names = ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5", "gpt-5"]
    return {"object": "list", "data": [{"id": name, "object": "model", "owned_by": "openai"} for name in names]}


# What the key spent each day, oldest first: 23 earlier days (a steady wobble, a quiet day now and then), then a week.
EARLIER = [0.0 if at % 6 == 5 else round(1.5 + ((at * 37) % 17) / 3, 2) for at in range(23)]
WEEK = [3.1, 5.4, 0.0, 7.9, 9.2, 4.4, 11.37]
SHARES = {"claude-sonnet-4-5": 0.52, "claude-opus-4-1": 0.28, "claude-haiku-4-5": 0.14, "gpt-5": 0.06}


def daily_activity(config):
    today = datetime.now(timezone.utc).date()
    spends = EARLIER + WEEK[:-1] + [config["today"] if config.get("today") is not None else WEEK[-1]]
    results = []
    for back, spend in zip(range(len(spends) - 1, -1, -1), spends):
        if spend == 0:
            continue
        requests = int(spend * 9)
        results.append(
            {
                "date": (today - timedelta(days=back)).isoformat(),
                "metrics": {
                    "spend": spend,
                    "api_requests": requests,
                    "failed_requests": 2 if spend > 9 else 0,
                    "total_tokens": int(spend * 210000),
                    "prompt_tokens": int(spend * 170000),
                    "completion_tokens": int(spend * 40000),
                    "cache_read_input_tokens": int(spend * 120000),
                },
                "breakdown": {
                    "models": {
                        name: {
                            "metrics": {
                                "spend": spend * share,
                                "api_requests": int(requests * share),
                                "total_tokens": int(spend * 210000 * share),
                            }
                        }
                        for name, share in SHARES.items()
                    }
                },
            }
        )
    return {"results": results, "metadata": {"total_spend": sum(r["metrics"]["spend"] for r in results)}}


def admin_keys(state):
    return {"keys": state["keys"], "total_count": len(state["keys"]), "current_page": 1, "total_pages": 1}


def admin_state():
    def key(n, alias, spend, cap, **extra):
        return {"token": f"{n:02x}" * 32, "key_alias": alias, "key_name": f"sk-...{n:04d}", "spend": spend, "max_budget": cap, "user_id": extra.get("user"), "team_id": extra.get("team"), "blocked": False}

    return {
        "keys": [
            key(1, "claude-code-demo", 41.37, 50.0, user="demo"),
            key(2, "ci-runner", 18.2, 25.0, team="platform-eng"),
            key(3, "batch-nightly", 63.9, 100.0, team="data"),
            key(4, "old-contractor", 7.5, None, user="temp"),
        ],
        "teams": [
            {"team_id": "platform-eng", "team_alias": "platform-eng", "spend": 212.4, "max_budget": 300.0},
            {"team_id": "data", "team_alias": "data", "spend": 96.0, "max_budget": 100.0},
        ],
    }


def spend_models():
    return [{"model": "claude-sonnet-4-5", "total_spend": 188.2}, {"model": "claude-opus-4-1", "total_spend": 96.7}, {"model": "claude-haiku-4-5", "total_spend": 12.1}]


def health():
    return {"status": "healthy", "db": "connected", "cache": None, "litellm_version": "1.77.0", "success_callbacks": []}


def handler(config, delay, fail_after, off=()):
    reads = {"key": 0}
    state = admin_state()

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
                "/model_group/info": model_groups,
                "/user/daily/activity": lambda: daily_activity(config),
                "/health/readiness": health,
                "/key/list": lambda: admin_keys(state),
                "/team/list": lambda: state["teams"],
                "/global/spend/models": spend_models,
                "/model/info": lambda: {"data": [{"model_name": m["model"]} for m in spend_models()]},
            }
            if path in ("/key/list", "/team/list", "/global/spend/models", "/model/info") and not config.get("admin"):
                return self.reply(401, {"error": {"message": "Authentication Error, Only proxy admin can be used. Your role=internal_user", "type": "auth_error", "param": "None", "code": "401"}})
            if path in off or path not in routes:
                return self.reply(404, {"detail": "Not Found"})
            if path in routes:
                return self.reply(200, routes[path]())
            return self.reply(404, {"detail": "Not Found"})

        def do_POST(self):
            sent = self.headers.get("x-litellm-api-key") or self.headers.get("authorization") or ""
            body = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"{}")
            if KEY not in sent or not config.get("admin"):
                return self.reply(401, {"error": {"message": "Only proxy admin", "type": "auth_error", "param": "None", "code": "401"}})
            path = urlparse(self.path).path
            if path in ("/key/block", "/key/unblock"):
                for row in state["keys"]:
                    if row["token"] == body.get("key"):
                        row["blocked"] = path == "/key/block"
                return self.reply(200, {"token": body.get("key"), "blocked": path == "/key/block"})
            if path == "/team/update":
                for row in state["teams"]:
                    if row["team_id"] == body.get("team_id"):
                        row["max_budget"] = body.get("max_budget")
                return self.reply(200, {"team_id": body.get("team_id")})
            if path == "/key/update":
                for row in state["keys"]:
                    if row["token"] == body.get("key"):
                        row["max_budget"] = body.get("max_budget", row["max_budget"])
                return self.reply(200, {"key": body.get("key")})
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
    parser.add_argument("--admin", action="store_true", help="the key is a proxy admin: answer the management endpoints")
    parser.add_argument("--delay", type=float, default=0.0)
    parser.add_argument("--fail-after", type=int)
    parser.add_argument("--today", type=float, help="what today has spent in the usage history")
    parser.add_argument("--no-usage", action="store_true", help="answer 404 to /user/daily/activity")
    parser.add_argument("--no-health", action="store_true", help="answer 404 to /health/readiness")
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
    config["today"] = args.today
    config["admin"] = args.admin
    off = tuple(path for flag, path in ((args.no_usage, "/user/daily/activity"), (args.no_health, "/health/readiness")) if flag)
    print(f"mock LiteLLM ({args.scenario}) on http://127.0.0.1:{args.port}  key: {KEY}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), handler(config, args.delay, args.fail_after, off)).serve_forever()
