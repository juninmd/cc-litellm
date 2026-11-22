# AGENTS.md

`cc-litellm`: Claude Code plugin marketplace with one plugin, `litellm-key`. It shows the budget, limits and usage of the LiteLLM virtual key Claude Code is using, and offers admin commands behind a preview and confirmation.

## Stack

- Claude Code plugin: hooks, slash commands, status line (early-access plugin API)
- TypeScript (`tsc` 7.0.2 in CI), Bun for dev scripts, Python (`uv`) for evidence tooling
- Docker Compose for a local LiteLLM proxy (`dev/litellm/`)

## Commands

- Plugin tests: `claude plugin test plugins/litellm-key`
- Validate: `claude plugin validate .` and `claude plugin validate plugins/litellm-key --strict`
- Typecheck: `tsc -p plugins/litellm-key/.claude-plugin/types/tsconfig.json --noEmit` (types are generated on first plugin load)
- File size: `bash dev/check-file-size.sh` (cap 300 lines)
- PR title: `bash dev/check-pr-title.sh --self-test`
- Local proxy: `docker compose -f dev/litellm/docker-compose.yml up -d --wait`; smoke: `bun dev/litellm/smoke.ts`
- Try without installing: `claude --plugin-dir ./plugins/litellm-key`

## Structure

- `plugins/litellm-key/` — the plugin: `hooks/`, `tests/`, `types/`, `.claude-plugin/`
- `.claude-plugin/marketplace.json` — marketplace entry
- `dev/` — checks (file size, PR title), LiteLLM mock and compose, evidence (screenshot) tooling
- `docs/` — README translations (`docs/i18n/`), evidence screenshots, banner
- `.github/workflows/` — `ci.yml`, `pr-title.yml`, `release.yml`, `validate.yml`, `sast.yml`, `security.yml`
- `RELEASING.md` — how releases are cut

## Conventions

- PR titles must be Conventional Commits. Squash merge makes the title the commit on `main`, and release-please reads it.
- `feat` → minor, `fix`/`perf`/`refactor`/`revert` → patch, `feat!` or `BREAKING CHANGE:` → breaking. `docs`, `test`, `ci`, `build`, `chore`, `style` do not release by themselves.
- Never edit versions by hand and never merge a release PR by hand. To force a version, use a `Release-As: X.Y.Z` footer in a commit body.
- Keep each source file at or under 300 lines. Split by responsibility before the limit.
- Changes to the plugin need `claude plugin test` and both `claude plugin validate` runs green in CI.

## Gotchas

- The plugin API is early access. CI pins `CLAUDE_CODE_VERSION` (2.1.289) and `TYPESCRIPT_VERSION` (7.0.2); keep them in step with the README badges.
- Secrets stay local: `.env*` (except `.env.example`), `dev/litellm/config.cluster.yaml` and `dev/litellm/*.local.*` are git-ignored. Do not paste proxy keys into commits, logs or transcripts.
- The `Release` workflow runs on `workflow_run` after `CI` on `main`. Do not trigger it by hand.
- `plugins/litellm-key/.claude-plugin/types/` is generated and git-ignored.

<!-- base-actions-main-policy -->
## GitHub Actions — padrão obrigatório (@main)

- Referencie as actions internas sempre pelo branch, nunca por SHA:
  - `uses: juninmd/base-actions/<action>@main`
  - `uses: juninmd/base-actions/.github/workflows/<arquivo>.yml@main`
- Não fixe `@<sha>` em `juninmd/base-actions`: a atualização é centralizada no
  `main` e passa a valer no próximo run.
- PRs cujos checks não iniciam por billing/spending limit são mesclados pelo bot central
  `juninmd/base-actions/.github/workflows/auto-merge-billing-blocked.yml`.
  Para impedir o merge automático de um PR, aplique a label `do-not-merge`.
