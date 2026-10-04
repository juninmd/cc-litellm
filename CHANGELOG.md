# Changelog

<!-- Written by release-please from Conventional Commits (see RELEASING.md). Edit the release PR, not this file. -->

## 0.3.0

Homologated against a real LiteLLM v1.99.1 (Postgres, virtual keys, router fallbacks) and Claude Code 2.1.289.

### Added
- **Admin commands**, with a preview, a native confirmation (`--yes` skips it, `--dry-run` stops at the preview) and a read-back of the result:
  `/litellm keys`, `/litellm key new`, `/litellm key block` / `unblock`, `/litellm grant` (key, user or team; increment or `--set`) and `/litellm fallbacks [model]`.
- `litellm_admin_key` option (sensitive: credential store, never printed, sent only to the proxy that accepted the session key).
- A new key goes to the **clipboard**, never to the transcript; if the clipboard cannot take it the key is deleted again (`--reveal` prints it, with a warning).
- **Over-budget banner** above the prompt: stays while any budget (key, user, team, window, model) is spent up, leaves when the numbers are normal.
- The user's proxy **role** (`internal_user`, `proxy_admin`…) in the pane and in `/litellm info`; shown in the `grant --user` preview.
- Blocked and expired keys are named as such (status line, pane, toast) instead of a generic 401.
- README rewritten (English) with translations in `docs/i18n` (pt-BR, es, fr, ja, it, zh-CN, de, ru, tr, hi) and real screenshots.
- `dev/litellm`: a local LiteLLM lab (mock config, optional cluster-derived config, live smoke test) and the screenshot harness `dev/evidence`.

### Fixed
- A key with no user or team no longer produces "unavailable" notes (`/user/info` and `/team/info` answering 404 are expected).
- Raising the budget re-arms the budget warnings (the notified id now includes the limit).
- `$49.99 / $50.00` was shown as "over budget" because 99.98% rounds to 100%: spent up now means spend ≥ limit.
- The "admin commands wait" case explains itself when the session key is rejected.
- Found by an independent review of this release:
  - `--yes=false`, `--reveal=0` and the like read as `true` (a confirmation skipped, a secret printed): a switch now takes no value and the command stops with an error.
  - With `litellm_admin_key` set and the virtual key sent as `x-litellm-api-key`, both went out and LiteLLM v1.99.1 picked the virtual key (HTTP 403 on an admin route). The admin call now carries only the admin key.
  - The admin key could follow an old proxy after the URL or the key changed: it only goes to the root that accepted the current URL and key, and a change makes the plugin ask again first.
  - A clipboard that throws (not just answers "not copied") left the new key behind: it is rolled back like any refusal, and the success line says how to block the key.
  - A grant whose read-back failed was reported as failed although the proxy had applied it, inviting a retry that adds twice: it is reported as applied. A write that timed out says it may still have gone through.
  - A forced refresh asked while another read was in flight was dropped, leaving the status line on the old budget after a grant; it now reads again once the first one ends.
  - Two teams with one alias are refused instead of picking the first; an expiry without a zone is read as UTC; a `$0` cap no longer prints `(null%)`; a key whose cap lives in `litellm_budget_table` is treated as capped by `grant` and `keys`.

### Known limits
- Per-model budgets (`model_max_budget`), temporary budget increases and key regeneration are enterprise-only on the proxy; not offered.
- LiteLLM writes spend in batches, so numbers lag a request by about 10 seconds.
