# dev/litellm: a real LiteLLM on your laptop

LiteLLM **v1.99.1** + Postgres in Docker, on `127.0.0.1:4000`. Virtual keys, budgets, teams, spend and the router
fallbacks are the real thing; only the model answers can be canned. Used to homologate `litellm-key` and to take the
screenshots in the root README.

```bash
docker compose -f dev/litellm/docker-compose.yml up -d      # config.mock.yaml: zero provider keys
curl -fsS http://127.0.0.1:4000/health/liveliness            # "I'm alive!"
bun dev/litellm/smoke.ts                                     # live homologation of the plugin's own modules
docker compose -f dev/litellm/docker-compose.yml down -v     # stop and wipe the database
```

Admin UI: <http://127.0.0.1:4000/ui/> (user `admin`, password = the master key). The local master key is
`sk-local-master-key`: a throwaway for this lab, never a real credential.

## Files

| File | What |
| --- | --- |
| `docker-compose.yml` | Postgres 16 + `litellm-database:v1.99.1`. `LITELLM_CONFIG` picks the config (default `config.mock.yaml`). |
| `config.mock.yaml` | **Committed.** Mirrors a real "auto" setup: a weighted `cloud/auto` group, fallback and context-window chains, and `demo/always-429`, a model that always fails so the router visibly falls back. Demo prices ($1 per 1k tokens) make a few requests move a budget. |
| `from-cluster.py` | Builds `config.cluster.yaml` + `.env` from the proxy running in your Kubernetes cluster (read-only `kubectl`). Copies **only** the provider variables the `model_list` references. Never prints a secret. |
| `config.cluster.yaml`, `.env` | **Git-ignored, generated.** Your cluster's routing and provider keys. This repository is public: never commit them. |
| `smoke.ts` | Runs the plugin's real modules against the proxy: `key new`, snapshot, spend through `cloud/auto`, `grant`, `block`/`unblock`, `keys`, `fallbacks`, a forced fallback, failure modes, cleanup. Creates `smoke-*` keys and deletes them. |

## Using your cluster's routing

```bash
python dev/litellm/from-cluster.py --namespace NS --configmap CM --secret SECRET
LITELLM_CONFIG=config.cluster.yaml docker compose -f dev/litellm/docker-compose.yml up -d
```

`from-cluster.py` also adds `demo/always-429` and a demo price, and turns on
`dangerously_allow_mock_testing_request_params` (local only) so a request may carry `mock_testing_fallbacks` to force the
fallback chain. Requests to real providers cost real quota: the smoke test sends a handful of one-word prompts.

## Things this lab taught

- LiteLLM writes spend to Postgres in batches (about every 10 s), so a number lags the request that caused it.
- `model_max_budget` (per-model budgets) and `temp_budget_increase` need an enterprise license on the proxy; the
  open-source proxy refuses the first and ignores the second.
- A key that does not exist in the database (the master key, a `config.yaml` key) has no `/key/info` record.
- `/user/info` answers 404 for a key with no user, and `/team/info` for one with no team: not an error for the plugin.
