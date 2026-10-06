<p align="center">
  <img src="docs/assets/banner.svg" alt="cc-litellm: your LiteLLM key, budget and fallbacks inside Claude Code" width="100%">
</p>

<p align="center">
  <a href="#install"><img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude%20Code-plugin-d97757?style=for-the-badge"></a>
  <img alt="LiteLLM v1.99.1 and v1.104.0" src="https://img.shields.io/badge/LiteLLM-v1.99.1%20%C2%B7%20v1.104.0%20tested-6366f1?style=for-the-badge">
  <img alt="Claude Code 2.1.289" src="https://img.shields.io/badge/Claude%20Code-2.1.289%20tested-0ea5e9?style=for-the-badge">
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/juninmd/cc-litellm/ci.yml?branch=main&style=for-the-badge&label=CI">
  <img alt="License: MIT" src="https://img.shields.io/github/license/juninmd/cc-litellm?style=for-the-badge&color=22c55e">
  <img alt="Version 0.3.0" src="https://img.shields.io/badge/version-0.3.0-f472b6?style=for-the-badge">
</p>

<p align="center">
  <b>English</b> ·
  <a href="docs/i18n/README.pt-BR.md">Português</a> ·
  <a href="docs/i18n/README.es.md">Español</a> ·
  <a href="docs/i18n/README.fr.md">Français</a> ·
  <a href="docs/i18n/README.ja.md">日本語</a> ·
  <a href="docs/i18n/README.it.md">Italiano</a> ·
  <a href="docs/i18n/README.zh-CN.md">简体中文</a> ·
  <a href="docs/i18n/README.de.md">Deutsch</a> ·
  <a href="docs/i18n/README.ru.md">Русский</a> ·
  <a href="docs/i18n/README.tr.md">Türkçe</a> ·
  <a href="docs/i18n/README.hi.md">हिन्दी</a>
</p>

# cc-litellm

A [Claude Code](https://code.claude.com) plugin for people who reach their models through a **[LiteLLM](https://docs.litellm.ai) proxy**. It shows what the proxy knows about the **virtual key** Claude Code is using (budget, spend, limits, expiry, models, 30 days of usage) and, for admins, lets you **create and edit keys, give someone extra budget, block a key and read the router's fallback chains** without leaving the terminal.

This repository is a plugin marketplace (`cc-litellm`) with one plugin: [`litellm-key`](plugins/litellm-key).

<p align="center">
  <img src="docs/evidence/pane.png" alt="The /litellm pane beside the conversation, against a real LiteLLM proxy" width="92%">
</p>

## What you get

| | | |
| --- | --- | --- |
| 👀 **Watch** | **Status line** under the prompt, always visible | `⚠ litellm-key: 86% of budget · $30.00 of $35.00 · resets in 27d (30d)` |
| | **`/litellm` pane** | meters for key, team, user and **team-member** budgets, the user's **role**, limits, expiry, models, 7-day sparkline, **top models** of the week, and a **runway** forecast; refreshes itself |
| | **Pane tabs** | **Usage** (spend, requests or tokens per day as bars over 7, 14 or 30 days, a day to pick, how each model moved), **Models** (what each spent, a filter, a sort), **Details** (the key's fields, LiteLLM's version and database, latency) |
| | **Guidance** | **Allowance** (what to spend a day to last until the reset), **Headroom** (how many more requests the cap holds), **Today** against the usual day, **Session** (what this Claude Code session spent, and at what rate) |
| | **Toasts** | at 80% (configurable), 95%, 100%; key about to expire; key blocked or expired; today over your **daily alert**. Once per budget window, even across sessions |
| 📊 **Report** | **`/litellm pace`**, `usage`, `compare`, `day`, `status` | where the budget is heading, the days and models as tables, what changed against the days before, one day by model |
| | **`/litellm check`** | `OK`, `WARNING`, `CRITICAL` or `UNKNOWN` **and the exit code of a `claude -p` run** (0 to 3), for scripts and monitoring |
| | **`/litellm json`** / `csv` | everything as JSON, the days as CSV; **`copy`** puts any report on the clipboard, **`share`** hands it to Claude to ask about |
| | **Over-budget banner** | a red band above the prompt that **stays for as long as a budget is spent up** (key, user, team, window or model) and leaves only when the numbers are normal again |
| 🛠️ **Manage** *(admin)* | **`/litellm key new`** | create a virtual key; the secret goes to your **clipboard, never the transcript** |
| | **`/litellm grant`** | extra budget for a key, a user, a team or an organization, with a preview and a confirmation |
| | **`/litellm key set`** / `reset-spend` | change a key's models, limits, expiry or alias; zero its spend counter |
| | **`/litellm key block`** / `unblock` | stop (or restore) a key in one line |
| | **`/litellm org`** | an organization's budget, which a virtual key cannot read |
| | **`/litellm keys`** | list keys: yours, a user's, a team's, or all |
| | **`/litellm fallbacks`** | the router's fallback chains (`cloud/auto → cloud/auto-long → …`), plus context-window fallbacks |

Every change shows a **preview first**, asks in Claude Code's **native dialog**, applies, then **reads the result back** from the proxy.

## Install

Needs a recent Claude Code: the plugin uses function hooks (an early-access API), tested on 2.1.289.

```text
/plugin marketplace add juninmd/cc-litellm
/plugin install litellm-key@cc-litellm
```

Try it from a clone without installing: `claude --plugin-dir ./plugins/litellm-key`.

If Claude Code already talks to LiteLLM, **there is nothing to configure**: the plugin reads the same URL and key Claude Code uses. Admin commands also want `litellm_admin_key` (see [Admin commands](#admin-commands)).

## A tour

### Watch the budget

<p align="center">
  <img src="docs/evidence/statusline.png" alt="Claude Code with the litellm-key status line under the prompt" width="92%">
</p>

`/litellm models` lists what the key may call, `/litellm keys` the keys you own:

<p align="center">
  <img src="docs/evidence/keys.png" alt="/litellm models and /litellm keys output" width="92%">
</p>

### Look closer: usage, models, details

The pane has four tabs. Overview is the dashboard above; **Usage** draws the last 7, 14 or 30 days as bars, counting spend, requests or tokens, lets you pick a day for its models, and says which model moved against the days before:

```text
 1: Overview   2: Usage   3: Models  4: Details

 Spend per day (UTC)                7d   d: 14d  30d  m: chart: spend  v: CSV

 $11.4                                                               ██████
                                       ▁▁▁▁▁▁    ▇▇▇▇▇▇              ██████
                                       ██████    ██████              ██████
                   ▇▇▇▇▇▇              ██████    ██████    ▃▃▃▃▃▃    ██████
         ▅▅▅▅▅▅    ██████              ██████    ██████    ██████    ██████
    $0   ██████    ██████              ██████    ██████    ██████    ██████
           Wed       Thu       Fri       Sat       Sun       Mon       Tue
         $3.10     $5.40       ·       $7.90     $9.20     $4.40     $11.4

 Spend        $41.37 · $5.91/day
 Requests     369 · $0.112 each
 Failed       4 requests (1.1%)
 Peak day     $11.37 on Tue Oct 6
 Trend        ▲ 34% vs the 7 days before (full days)

 By model, last 7 days · ▲▼ vs the 7 before ─────────────────────────────────
 claude-sonnet-4-5  ▄▄▄▄▄▄▄▄▄▄▁▁▁▁▁▁▁▁▁▁  52%  $21.51 ▲ 34% · 189 requests
 claude-opus-4-1    ▄▄▄▄▄▄▁▁▁▁▁▁▁▁▁▁▁▁▁▁  28%  $11.58 ▲ 34% · 99 requests
```

**Models** lists what the key may call with what each spent over the range (sort by spend or name, and type in the filter to narrow a long list); **Details** groups what the proxy said of the key, its LiteLLM version and database state, and how long `/key/info` took. The range, sort and chart you pick are kept for next time, and `/litellm` opens the pane on the tab you left it.

### Ask for a report, or hand it to a script

```text
/litellm pace
Budget     $41.37 / $50.00 (83%) · $8.63 left · resets in 9d 3h (30d)
Runway     out in 1d 6h at $6.75/day · resets in 9d 3h
Allowance  $0.95/day to last · 86% less than lately
Headroom   about 76 more requests at $0.112 each
Today      $11.37 · 102 requests · 2.2× the usual day ($5.21)
Session    +$0.40 since 03:03 (12m ago)
```

```bash
claude -p "/litellm check"; echo $?    # WARNING · 83% of budget … (exit 1)
claude -p "/litellm json" | jq .budget.percent
claude -p "/litellm csv 30" > usage.csv
```

### Spot trouble early, and name it

The plugin tells a blocked key from an expired one from a wrong one, instead of a generic *401*:

<table>
  <tr>
    <td width="50%"><img src="docs/evidence/warning.png" alt="86% of the budget used"><br><sub><b>86%</b>: warning toast and status line</sub></td>
    <td width="50%"><img src="docs/evidence/over-budget.png" alt="Over budget"><br><sub><b>Over budget</b>: a banner that stays until the budget is normal</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/evidence/blocked.png" alt="Key blocked"><br><sub><b>Blocked</b> key, named as blocked</sub></td>
    <td width="50%"><img src="docs/evidence/expired.png" alt="Key expired"><br><sub><b>Expired</b> key, named as expired</sub></td>
  </tr>
</table>

### Generate a key

<table>
  <tr>
    <td width="50%"><img src="docs/evidence/key-new-dialog.png" alt="Native confirmation before creating a key"><br><sub>Preview, then Claude Code's native confirmation</sub></td>
    <td width="50%"><img src="docs/evidence/key-new-done.png" alt="The key was copied to the clipboard"><br><sub>The secret goes to the clipboard. The transcript only sees <code>sk-…9FKg</code></sub></td>
  </tr>
</table>

### Give extra budget

<table>
  <tr>
    <td width="50%"><img src="docs/evidence/grant-dialog.png" alt="Preview of a budget grant"><br><sub><code>$25 → $35 (+$10)</code>, what is spent, what would be left</sub></td>
    <td width="50%"><img src="docs/evidence/grant-recovers.png" alt="The key has room again after a grant"><br><sub>Applied and read back; the status line follows (101% → 79%)</sub></td>
  </tr>
</table>

### When the team caps each member

A team can cap what each member spends (`team_member_budget`). The proxy refuses the request while the key's own budget is fine, so the plugin reads the cap and shows it as a `Member` meter, and the over-budget banner names it:

<p align="center">
  <img src="docs/evidence/member-cap.png" alt="The pane with a Member meter over its cap, the banner above the prompt, and the key's organization named" width="92%">
</p>

<sub>Shot against `dev/mock-litellm.py --scenario member`. The proxy does not report a member's total to a virtual key, so the meter counts <b>this key's spend</b> and says so. It can read low, and against a cap that resets it can read high (a reset zeroes the member's spend, not the key's), so the banner is raised only for a cap that never resets. The key's organization is named too; its budget is admin-only, <code>/litellm org</code> reads it.</sub>

### Read the fallback chains

<p align="center">
  <img src="docs/evidence/fallbacks-filtered.png" alt="/litellm fallbacks cloud/auto" width="92%">
</p>

### Know what a model costs

<p align="center">
  <img src="docs/evidence/models-prices.png" alt="/litellm models with the price per million tokens in and out and the context window" width="92%">
</p>

### And the proxy agrees

Everything above is the real LiteLLM v1.99.1 admin UI reflecting what the plugin did:

<table>
  <tr>
    <td width="50%"><img src="docs/evidence/litellm-ui-keys.png" alt="LiteLLM UI, Virtual Keys"><br><sub>Keys created and raised from Claude Code; one expired</sub></td>
    <td width="50%"><img src="docs/evidence/litellm-ui-usage.png" alt="LiteLLM UI, Usage"><br><sub>Spend shows up in Usage</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/evidence/litellm-ui-users.png" alt="LiteLLM UI, Internal Users"><br><sub>The user's proxy role (<code>internal_user</code>, <code>proxy_admin</code>) is what the pane's <b>Role</b> line shows</sub></td>
    <td width="50%"></td>
  </tr>
</table>

## Commands

| Command | Does |
| --- | --- |
| `/litellm` | Open the pane, on the tab you left it (and answer with a one-line summary). No screen: print that tab as text. |
| `/litellm tab <name>` | Open the pane on `overview`, `usage`, `models` or `details` (or 1 to 4). |
| `/litellm refresh` | Read again now. |
| `/litellm info` | Print the full summary in the transcript. |
| `/litellm status` | Print the status line as text. |
| `/litellm pace` | Where the budget is heading, what it can spend a day to last, and the same for the team and the user. |
| `/litellm usage [7\|14\|30]` | The spend, requests and tokens per day as a table, with the totals and the models. |
| `/litellm compare [7\|14]` | The last full days against the same number before them, as a whole and model by model. |
| `/litellm day [when]` | One day by model: `today`, `yesterday`, `2026-10-03`, `10-03` or a weekday (`mon`). |
| `/litellm models [text]` | List the models this key can call, with their price per million tokens and context window; with a text, only those whose name has it. |
| `/litellm check [warn%]` | `OK`, `WARNING`, `CRITICAL` or `UNKNOWN`, and the exit code of a `claude -p` run: 0, 1, 2, 3. A budget over its cap, or a key the proxy says is blocked, expired or rejected, is `CRITICAL`; a proxy that does not answer is `UNKNOWN`. |
| `/litellm json` | Everything the plugin knows of the key as JSON (no key, no hash). |
| `/litellm csv [7\|14\|30]` | The days as CSV. |
| `/litellm copy [what]` | Put a report on the clipboard: `overview`, `usage`, `models`, `details`, `pace`, `compare`, `csv` or `json`. |
| `/litellm share [what]` | Hand a report to Claude, out of sight, so the next question can be about it. |
| `/litellm ping` | Try every endpoint the plugin reads, with its status and time. |
| `/litellm debug` | Show where the URL and the keys come from (always masked), what was tried, the result. |
| `/litellm close` | Close the pane. |
| `/litellm keys [--user ID \| --team ID \| --all]` | List keys. Default: the keys of your own user. 🔐 |
| `/litellm key new <alias> [flags]` | Create a key. 🔐 |
| `/litellm key block <alias\|hash>` / `unblock` | Block or restore a key. 🔐 |
| `/litellm key set <alias\|hash> [flags]` | Change the models, limits, expiry or alias of a key. 🔐 |
| `/litellm key reset-spend <alias\|hash>` | Set a key's spend counter back to zero. 🔐 |
| `/litellm grant <amount> [--key \| --user \| --team \| --org] [--set]` | Add budget. 🔐 |
| `/litellm org [id\|alias]` | An organization's budget; no name: the key's own organization, else the list. 🔐 |
| `/litellm fallbacks [model]` | Router fallback chains, optionally for models matching a name. 🔐 |

🔐 = admin command, see below. In the pane (focus it with a click or `ctrl+x` `tab`): `1` to `4` switch tab, `r` refreshes, `c` copies the tab you are on, `q` closes, arrows scroll; each button names its key (`Refresh (r)`, `Copy (c)`, `Close (q)`). On Usage, `d` steps through 7, 14 and 30 days, `m` through spend, requests and tokens, `v` copies the days as CSV; on Models, `s` sorts and `f` goes to the filter. `Esc` also closes the pane on an empty prompt (on Models it only leaves the filter).

A mistyped command gets a guess (`Did you mean "usage"?`). A command that cannot do what it was asked says so in a sentence, and the ones meant for scripts (`check`, `json`, `csv`, `ping`) end with exit code 3 when there is nothing to report.

The pane adapts to the space: beside the conversation (full screen, from 110 columns) each meter takes two lines; above the prompt, from 122 columns, the meters become a table; in narrower terminals it keeps two lines per meter, or turns **compact** if you enable `compact_pane`. Beside the conversation the pane gets titled sections (`BUDGETS`, `KEY`, `LAST 7 DAYS`, `TOP MODELS`) and a letter under each day of the week; `TOP MODELS` ranks the five models that spent most, each with its share of the week as a bar. A long name is cut in the middle, so `claude-sonnet-4-5` and `claude-sonnet-4-6` stay apart. Color is never the only signal: `▲` marks a budget that is close to its cap, `✖` one that is spent up, and a day with no spend is a `·`, never a short bar.

**Runway.** The `Runway` row (in the pane and in `/litellm info`) sets the pace of the last 7 days (fewer for a key younger than that, never fewer than one) against the cap: `lasts until the reset at $2.18/day`, or `out in 2d 6h at $2.18/day · resets in 6d 12h` when the budget would run out first. The status line adds `out in 2d 6h at this pace` only when that is coming: before the reset, or within 3 days for a key with no reset. A key with no cap, one already spent up, and one whose reset is due get no forecast.

<p align="center">
  <img src="docs/evidence/runway.png" alt="The pane for a key on course to run out: the Runway row and the status line warn, and the week is split by model" width="92%">
</p>

<sub>Shot against `dev/mock-litellm.py --scenario warning`: the local lab has no week of history to forecast from.</sub>

<p align="center">
  <img src="docs/evidence/help.png" alt="/litellm help" width="92%">
</p>

## Admin commands

Reads and changes of keys need a proxy admin. Set the **`litellm_admin_key`** option (stored in your OS credential store, never in `settings.json`). Without it the plugin tries with your virtual key and, if the proxy refuses, tells you exactly that.

```text
/litellm key new ci-runner --budget 5 --every 7d --rpm 60 --user ana@example.com
/litellm key new batch --budget 20 --models cloud/auto,cloud/auto-long --expires 30d --team platform-eng
/litellm grant 10 --key claude-code-ana          # +$10 on top of the current budget
/litellm grant 200 --team platform-eng --set     # cap the team at exactly $200
/litellm grant 25 --org acme                     # +$25 on the organization (LiteLLM before 1.102, or enterprise)
/litellm key set ci-runner --models cloud/auto --rpm 30 --expires 14d
/litellm key set ci-runner --rpm none --expires never   # none removes a limit; --models all clears the list
/litellm key reset-spend ci-runner               # the budget counter back to $0
/litellm key block old-contractor
/litellm fallbacks cloud/auto
```

| `key new` flag | Meaning |
| --- | --- |
| `--budget 10` | Spend cap in dollars. |
| `--every 30d` | Budget window: it resets every 30 days (`s m h d w mo`). |
| `--soft 8` | Soft alert threshold. |
| `--models a,b` | Models the key may call (default: all). |
| `--rpm 60` / `--tpm 100000` / `--parallel 4` | Rate limits. |
| `--expires 30d` | The key stops working after this long. |
| `--user ID` / `--team ID` | Who owns it (and whose budget also applies). |

| `key set` flag | Meaning |
| --- | --- |
| `--models a,b` / `--models all` | Replace the models the key may call (`all`: every model). |
| `--rpm N` / `--tpm N` / `--parallel N` | Set a limit; `none` removes it. |
| `--expires 30d` / `--expires never` | Expire after this long from now, or never. |
| `--alias NEW` | Rename the key. |

A field you leave out stays as it is. The preview shows `before → after` for each field, and warns when the key is the one Claude Code is using.

Safety rails, on every admin command:

- **Preview first.** `--dry-run` stops there; `--yes` skips the confirmation; otherwise Claude Code's native dialog asks (**Apply** / **Cancel**).
- **Read-back.** After a grant the plugin re-reads the budget from the proxy and reports what is *there*, not what it sent.
- **The new secret never lands in the transcript.** It goes to the clipboard. If the clipboard cannot take it, the key is **deleted again** (rolled back) instead of kept unreadable. `--reveal` prints it, with a warning that it is now saved in the transcript.
- **Raw `sk-…` values are refused** as key references: use an alias or the key hash. Unknown flags are errors, not silently ignored.
- **Honest numbers.** `grant` says when the spend already exceeds the new budget, when there is no cap to add to (use `--set`), when nothing would change, and when `--user` would create a user the proxy has never seen.
- **The admin key** is sent only to the proxy that already accepted your session's own key, and never printed (errors are redacted).

What *can* be given as extra budget today, on LiteLLM v1.99.1 and v1.104.0: raise a **key** budget, a **user** budget, or a **team** budget (`--team`, which needs a proxy admin), as an increment or an absolute value (`--set`). An **organization** budget (`--org`) works up to v1.101; from v1.102 the proxy keeps organizations for enterprise licenses and the plugin says so. A *temporary* budget increase (`temp_budget_increase`) and per-model budgets are enterprise-only on the proxy side (see [Budgets](#budgets-what-litellm-can-and-cannot-do)), so the plugin does not offer them rather than pretend.

## Budgets: what LiteLLM can and cannot do

Checked live against LiteLLM v1.99.1 (open-source proxy, no license); the member cap and organizations were also checked on v1.104.0:

| Budget | Works? | How |
| --- | --- | --- |
| Per **key** (cap + reset window) | ✅ | `/litellm key new --budget 10 --every 30d`; raise with `/litellm grant 5 --key NAME` |
| Per **user** | ✅ | `/litellm grant 5 --user ID` (applies to every key the user owns) |
| Per **team** | ✅ | `/litellm grant 50 --team NAME` (needs a proxy admin) |
| Per **member** of a team (`team_member_budget`) | 👀 read-only | blocks the user's requests in that team (HTTP 429, 422 from v1.104). The pane shows the cap as `Member…`; set it in the LiteLLM UI or API. A virtual key cannot read the member's total, so the meter counts **this key's spend** and says so. A reset zeroes the member's spend but not the key's, so the over-budget banner is raised only for a cap that never resets; against a cap that resets the meter warns, it does not claim a block |
| Per **organization** | ✅ up to v1.101 · ⛔ enterprise from v1.102 | blocks every key in it (HTTP 429). A virtual key cannot read it: the pane names the organization, `/litellm org` shows the budget (admin), `grant --org` raises it |
| Several windows on one key (`budget_limits`, e.g. $5/hour + $50/month) | read-only | shown as `Window 1h` meters when the proxy has them |
| Per **model** on a key (`model_max_budget`) | ⛔ enterprise | the proxy answers *"You must have an enterprise license to set model_max_budget"*, also for `/budget/new`. If your proxy has the license, the pane shows those meters (`Model gpt-4o`) |
| Temporary budget increase (`temp_budget_increase`) | ⛔ enterprise | the open-source proxy accepts the field and never enforces it |

**Per-model budget without the license:** make one key per model, each with its own cap, e.g.
`/litellm key new auto-only --models cloud/auto --budget 5 --every 30d`. The key can call only that model and stops at $5.

## Configuration

The plugin reads the same URL and key Claude Code uses, in this order (process variables first, then the `env` block of `settings.json`):

| What | From |
| --- | --- |
| URL | option `litellm_url`, `ANTHROPIC_BASE_URL`, `LITELLM_PROXY_API_BASE` |
| Key | option `litellm_key`, the `x-litellm-api-key` header in `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `LITELLM_PROXY_API_KEY` |

If the URL ends in a pass-through route (`/anthropic`, `/bedrock`, `/v1`…), the plugin also tries the proxy root. A key is only used with the URL it belongs to: environment keys never go to a `litellm_url` on another host, and `LITELLM_PROXY_API_BASE` only pairs with `LITELLM_PROXY_API_KEY`.

All options are optional (Claude Code says at install that they are "not set"; that is harmless). Change them with `/plugin configure litellm-key@cc-litellm`, or `claude plugin configure litellm-key@cc-litellm --values-stdin` with a JSON object of strings.

| Option | Default | For |
| --- | --- | --- |
| `litellm_url` | empty | A proxy at a non-default place (Bedrock/Vertex via LiteLLM, URL with a prefix). |
| `litellm_key` | empty | An explicit key. 🔒 stored in the credential store, not in `settings.json`. |
| `litellm_admin_key` | empty | Admin key for `keys`, `key new/set/reset-spend/block/unblock`, `grant`, `org`, `fallbacks`. 🔒 same storage. Never printed. |
| `refresh_seconds` | 60 | Read interval (15 to 3600). Also reads after each turn, at most every 20 s. |
| `warn_percent` | 80 | First budget warning (it also warns at 95% and 100%). |
| `daily_alert` | 0 (off) | Warn once today's spend on the key reaches this many dollars: a toast once a day, the status line and the pane. With it on, the usage history is read every 3 minutes. |
| `show_toasts` | yes | The toasts that warn about the budget, the daily alert, an expiring key and a failing proxy. Off keeps the warnings to the status line and the pane. |
| `show_status_line` | yes | The line under the prompt. |
| `show_related` | yes | Read `/user/info` and `/team/info`: those budgets can block requests too. |
| `show_usage` | yes | Read `/user/daily/activity` (a beta LiteLLM endpoint): the last 30 days of usage, which the Usage and Models tabs, the reports, the runway and the daily alert draw on. |
| `compact_pane` | no | Compact pane above the prompt in narrow terminals (74 to 121 columns): one meter per line, facts side by side. |

## Where the data comes from

**Watching** only reads (`GET`), always with your own key:

| Endpoint | For |
| --- | --- |
| `/key/info` | Alias, spend, budget and windows, reset, limits, expiry, status, models, per-model budgets. Every read. |
| `/user/info`, `/team/info` | Budget of the key's user and team, and the team's per-member cap, when capped. Every read. |
| `/v1/models` | The models actually allowed. Every 10 min. |
| `/model_group/info` | Price per token and context window of those models (the proxy answers for all of its models; the plugin keeps the allowed ones). Every 10 min. |
| `/user/daily/activity` | Spend, requests, tokens and models of the last 30 days, day by day. Every 10 min. |
| `/health/readiness` | LiteLLM's version and whether its database is connected. Every 10 min; when the proxy will not say, nothing is shown, not even a note. |

The reads marked every 10 min happen every 3 minutes while a `daily_alert` is set: today's spend is what it watches.

**Managing** only happens when you type an admin command: `GET /key/list`, `/key/info`, `/user/info`, `/team/info`, `/v2/team/list`, `/organization/info`, `/organization/list`, `/router/settings`, and `POST /key/generate`, `/key/delete` (rollback only), `/key/block`, `/key/unblock`, `/key/update`, `/key/{hash}/reset_spend`, `/user/update`, `/team/update`, `PATCH /organization/update`.

Each request waits at most 4 s (15 s for admin commands). An optional read that fails (403, 404…) becomes a quiet note in the pane, never an error. If the proxy goes down, the pane keeps the last good reading, marked as stale. LiteLLM writes spend to its database in batches, so numbers lag a request by about 10 seconds.

## Privacy and security

- Your key only travels to the proxy Claude Code already uses, in the `Authorization` (or `x-litellm-api-key`) header. Never in a URL, log, toast, state or the plugin's storage; error messages pass a filter that masks it.
- The admin key is only sent to the proxy root that already accepted your session key, and only when you type an admin command.
- The plugin stores only the ids of warnings it already showed, to avoid repeating them.
- `litellm-key` reads `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_CUSTOM_HEADERS`, `LITELLM_PROXY_API_BASE` and `LITELLM_PROXY_API_KEY`, the `env` block of `settings.json`, and makes HTTP requests. `claude plugin validate plugins/litellm-key` lists all of it.

## If something does not show

| Symptom | Likely cause |
| --- | --- |
| Nothing in the status line, toast says "not configured" | Claude Code is not behind a proxy (`ANTHROPIC_BASE_URL` missing or `api.anthropic.com`). |
| "The proxy has no database record for this key" | It is the master key, or a `config.yaml`-only key. Only keys made with `/key/generate` have data. |
| "The proxy has no database" | The proxy runs without `DATABASE_URL`: there are no virtual keys to read. |
| "does not look like a LiteLLM proxy" | The URL points at something else. Set `litellm_url` to the proxy root. |
| "key blocked" / "key expired" | Exactly that. Ask an admin, or run `/litellm key unblock` from another session. |
| "key rejected (401)" | Invalid key. |
| Usage history is missing | The key has no `user_id`, or the beta endpoint is absent in your LiteLLM version. |
| Admin command says it needs an admin key | Set `litellm_admin_key`. |
| Admin command waits "until the proxy accepts this session's key" | By design, the admin key is only sent to a proxy that accepted your own key. Fix that key from another session or the LiteLLM UI. |

`/litellm debug` shows what the plugin resolved.

## Try it with a real LiteLLM on your laptop

`dev/litellm` is a complete lab: LiteLLM v1.104.0 with Postgres 18 in Docker, so virtual keys, budgets and spend are real. CI starts it and runs the smoke test on every change.

```bash
docker compose -f dev/litellm/docker-compose.yml up -d          # zero provider keys: canned answers
bun dev/litellm/smoke.ts                                         # live homologation of the plugin's own modules
```

- **`config.mock.yaml`** (the default) mirrors a real "auto" setup: a weighted `cloud/auto` group, a fallback chain, a context-window fallback and a model (`demo/always-429`) that always fails so the router visibly falls back. Nothing leaves your machine.
- **Your own cluster's routing:** `python dev/litellm/from-cluster.py --namespace NS --configmap CM --secret SECRET` reads (read-only, `kubectl`) your proxy's `config.yaml` and **only** the provider variables it references, and writes a local `config.cluster.yaml` + `.env` (git-ignored: never commit them). Then `LITELLM_CONFIG=config.cluster.yaml docker compose -f dev/litellm/docker-compose.yml up -d`.
- **`dev/mock-litellm.py`** is a tiny fake proxy for the UI states (`--scenario warning|blocked|…`), without Docker.
- **`dev/evidence/`** is the harness that took every screenshot in this README: a real Claude Code in a ConPTY, rendered to PNG. See [`dev/evidence/README.md`](dev/evidence/README.md).

## Development

```bash
claude plugin validate .                                # marketplace
claude plugin validate plugins/litellm-key --strict     # plugin
claude plugin test plugins/litellm-key                  # tests (they use Claude Code's engine)
tsc -p plugins/litellm-key                              # types (.claude-plugin/types appears on first load)
bash dev/check-file-size.sh                             # no source file over 300 lines
```

Layout of the plugin: `hooks/register.tsx` is the only file that touches Claude Code's `$`; it builds the injected ports (`hooks/ports.ts`) and wires events, commands, timers and toasts. Everything else is plain functions that take those ports, so it runs under test without booting the engine. `hooks/session.ts` is the reading cycle (config, ticker, queued forced refresh); `hooks/credentials.ts` and `hooks/settings.ts` resolve the key and the options; `hooks/litellm.ts` reads the proxy, `hooks/parsers.ts` and `hooks/json.ts` normalize the answers and `hooks/failures.ts` names what went wrong; `hooks/alerts.ts` decides the toasts. `hooks/commands.ts` is the `/litellm` command table and `hooks/admin*.ts` the admin commands (`admin.ts` the proxy reads, `admin-targets.ts` the key, user and team lookups, `admin-writes.ts` its writes, `admin-plan.ts` the previews and plans, `admin-link.ts` the admin key's link to the proxy, `admin-commands.ts` the flow, `args.ts` the argument parser). `hooks/exceeded.ts` and `hooks/band.tsx` are the over-budget banner; `hooks/summary.ts` builds the text, `hooks/view.tsx` and `hooks/parts.tsx` the pane (gauge, section titles, status chip, meter rows); `hooks/format.ts` has the pure formatters; `types/index.d.ts` is the state contract. The tabs are `hooks/tab-*.tsx` (`tab-overview.tsx` is the dashboard above all else, `parts-tabs.tsx` their shared parts, `chart.ts` the bars); the reports are `hooks/report-*.ts`, `details.ts` and `probe.ts` (`/litellm ping`), over `history.ts` (the 30 days, totals and comparisons) and `guidance.ts` (allowance, headroom, today and the session). `hooks/commands-reports.ts` and `commands-share.ts` are the commands that print or hand over a report.

## Known limits

- `apiKeyHelper` is not read (running a user command is out of scope). Use `litellm_key`.
- `/user/daily/activity` is beta in LiteLLM and may change.
- Per-model budgets (`model_max_budget`), temporary budget increases and key regeneration are enterprise-only on the proxy side, so they are not offered (see [Budgets](#budgets-what-litellm-can-and-cannot-do)). Editing fallback chains needs `STORE_MODEL_IN_DB=True` on the proxy, so `/litellm fallbacks` stays read-only.
- An **organization's** budget is not in the key's own answer and a virtual key may not read it, so the pane only names the organization; `/litellm org` reads it with an admin key. The admin key is still sent only when you type an admin command, never on the refresh timer.
- A team **member's** total is not reported to a virtual key: the `Member` meter counts this key's spend only, so it can read low: if the user has several keys in the team, the proxy may block earlier than the meter says. Against a cap that resets it can also read high (a reset zeroes the member's spend, not the key's), so there it warns and the banner stays quiet.
- The usage history reads one page of the proxy's activity rows; when there are more, the pane says it is partial. Days are UTC, as the proxy counts them; today's is still going, so the comparisons leave it out.
- The **Session** row counts what the key's spend grew by since the first reading of this Claude Code session. It cannot tell this session's spend from another session's on the same key.
- The over-budget banner is drawn on the terminal and desktop surfaces (Claude Code only offers the band there); on others, the status line and the pane say it.
- The `⚠` before the status line is drawn by Claude Code for every plugin status entry; it does not mean the key is in trouble (the text does).
- The plugin API of Claude Code is early-access and may change between versions.

## License

[MIT](LICENSE).

## Other languages

[Português (Brasil)](docs/i18n/README.pt-BR.md) · [Español](docs/i18n/README.es.md) · [Français](docs/i18n/README.fr.md) · [日本語](docs/i18n/README.ja.md) · [Italiano](docs/i18n/README.it.md) · [简体中文](docs/i18n/README.zh-CN.md) · [Deutsch](docs/i18n/README.de.md) · [Русский](docs/i18n/README.ru.md) · [Türkçe](docs/i18n/README.tr.md) · [हिन्दी](docs/i18n/README.hi.md)
