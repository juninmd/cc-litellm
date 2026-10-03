#!/usr/bin/env python3
"""A stand-in for the LiteLLM proxy endpoints the litellm-key plugin reads.

Try the plugin without a real proxy:

    python3 dev/mock-litellm.py --spend 41.37 &
    ANTHROPIC_BASE_URL=http://127.0.0.1:4000 ANTHROPIC_AUTH_TOKEN=sk-demo-key-12345 \
      claude --plugin-dir ./plugins/litellm-key

The answers are shaped like the real ones (litellm/proxy/management_endpoints). Any other
key gets the same 401 body LiteLLM sends. Nothing is stored and nothing leaves localhost.
"""
import argparse
import hashlib
import json
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

KEY = "sk-demo-key-12345"
HASH = hashlib.sha256(KEY.encode()).hexdigest()
START = datetime.now(timezone.utc).replace(microsecond=0)


def at(delta):
    return (START + delta).isoformat()


def key_info(spend):
    return {
        "key": HASH,
        "info": {
            "key_name": "sk-...2345",
            "key_alias": "claude-code-demo",
            "spend": spend,
            "total_spend": spend + 87.5,
            "max_budget": 50.0,
            "budget_duration": "30d",
            "budget_reset_at": at(timedelta(days=9, hours=3)),
            "expires": at(timedelta(days=40)),
            "models": [],
            "user_id": "demo",
            "team_id": "platform",
            "tpm_limit": 400000,
            "rpm_limit": 120,
            "max_parallel_requests": 8,
            "model_max_budget": {"claude-opus-4-1": {"budget_limit": 10.0, "time_period": "1d"}},
            "model_max_budget_usage": {"claude-opus-4-1": {"current_spend": 6.2, "budget_limit": 10.0, "time_period": "1d"}},
            "budget_limits": [{"budget_duration": "1h", "max_budget": 5.0, "reset_at": at(timedelta(minutes=38))}],
            "budget_limits_usage": {"1h": {"current_spend": 1.12}},
            "blocked": None,
            "status": "active",
        },
    }


def user_info():
    return {
        "user_id": "demo",
        "user_info": {
            "user_id": "demo",
            "user_email": "demo@example.com",
            "spend": 63.4,
            "max_budget": 150.0,
            "budget_duration": "30d",
            "budget_reset_at": at(timedelta(days=9, hours=3)),
        },
        "keys": [],
        "teams": [],
    }


def team_info():
    return {
        "team_id": "platform",
        "team_info": {
            "team_id": "platform",
            "team_alias": "platform-eng",
            "spend": 912.5,
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


def handler(spend):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, body):
            raw = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
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
            routes = {
                "/key/info": lambda: key_info(spend),
                "/user/info": user_info,
                "/team/info": team_info,
                "/v1/models": models,
                "/user/daily/activity": daily_activity,
            }
            if path in routes:
                return self.reply(200, routes[path]())
            return self.reply(404, {"detail": "Not Found"})

    return Handler


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--port", type=int, default=4000)
    parser.add_argument("--spend", type=float, default=41.37, help="what /key/info reports as spend (budget is $50)")
    args = parser.parse_args()
    print(f"mock LiteLLM on http://127.0.0.1:{args.port}  key: {KEY}")
    ThreadingHTTPServer(("127.0.0.1", args.port), handler(args.spend)).serve_forever()
