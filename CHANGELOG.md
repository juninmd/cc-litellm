# Changelog

## Unreleased

### Changed
- **Pane redesign.** The key's status is a chip (`● active`); in the dock the pane gets titled sections (`BUDGETS`, `KEY`, `LAST 7 DAYS`) with a hairline, and labels, bars and values sit on shared columns. Bars fill in eighths of a cell over a dim track, so 0% reads as empty and 100% as full. The week has a letter under each day, and a day with no spend is `·`, never a short bar. Each button names its key (`Refresh (r)`, `Copy (c)`, `Close (q)`), because no surface draws the hotkey itself; the separate hint line is gone, so the compact layout has the keys too.
- **Color is never the only signal.** `▲` marks a budget that is close to its cap and `✖` one that is spent up, in every layout (compact included). The amounts, the percentage, the keys and the weekday letters are never drawn dim.
- **Over-budget banner** is a block: a `✖ BUDGET USED UP` pill, one row per spent-up budget (name, full red bar, percentage, amounts and reset), and the way out (`/litellm grant`).
- **Status line** carries an 8-cell gauge: `██░░░░░░ 25% of budget · $12.50 of $50.00 · resets in 6d 12h (30d)`.
- **Internal:** the plugin is split by responsibility behind injected ports (`ports.ts`); `register.tsx` is the only file that touches `$`. No file is over 300 lines. The split changes no behavior.

### Added
- **Runway forecast.** A `Runway` row in the pane and in `/litellm info` sets the pace of the last 7 days (a younger key is averaged over its own days, never fewer than one) against the cap: `lasts until the reset at $2.18/day`, or `out in 2d 6h at $2.18/day · resets in 6d 12h`. The status line adds `out in 2d 6h at this pace` only when the budget runs out before its reset, or within 3 days when there is none. No forecast for a key with no cap, one spent up, or one whose reset is due.
- **Top models.** The dock lists the five models that spent most of the week, each with a share bar (default color: it compares parts, it does not judge them), the share and the amount; the amount goes under the bar in a narrow pane. `/litellm info` and the copied summary carry a `Top models` row. Inline and compact panes leave it out: rows are scarce there.
- **MIT license** (`LICENSE`, and `license` in the plugin manifest).

### Fixed
- A key at 99.6% was drawn as spent up (red, `✖`, "100%") although the proxy still answers; red and `✖` now mean exactly what the banner means, and that key is a warning (`▲`).
- A cap of `$0` read "no cap" in the pane and `(null%)` in the details; it is used up everywhere, as the banner already said.
- A share above 999% showed five digits glued to the amounts; it reads `999%+`.
- The compact footer no longer runs off the pane at 70 to 73 columns while refreshing: the status sits beside the buttons, shortened (`every Ns` dropped) when it must be, or under them.
- In a stacked pane narrower than 40 columns the label gives way, so mark, label, bar and share still fit on a line; the button row wraps instead of overflowing.
- Labels that would collide when cut (`Model claude…et-20241022` and `Model claude…et-20250101`) are cut in the middle, in the pane and in the copied summary.

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
