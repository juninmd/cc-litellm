# term_shot: terminal screenshots for documentation evidence

Drives a TUI in a real Windows ConPTY, mirrors its output into a `pyte` screen, and renders the screen to
`<name>.png` (dark or light window with macOS-style chrome, 2x scale) plus `<name>.txt` (plain text of the same screen).
Everything is deterministic and scripted, so the screenshots can be regenerated whenever the UI changes.

## Run

Needs Windows 10 1809+ (ConPTY) and [`uv`](https://docs.astral.sh/uv/). Dependencies (`pywinpty`, `pyte`, `pillow`,
`fonttools`) come from the PEP 723 header of `term_shot.py`; nothing is installed globally. Tested on Python 3.12 and 3.14.

```bash
uv run dev/evidence/term_shot.py --script dev/evidence/steps/example.json --out shots \
  [--cols 120 --rows 36] [--cwd DIR] [--env KEY=VAL ...] [--theme dark|light] [--title T] [--trim] \
  -- <command and args...>

uv run dev/evidence/term_shot.py --selftest --out shots     # glyph / color / attribute sheet -> shots/selftest.png
```

Exit codes: `0` ok, `1` a step failed or the command could not start (the screen is printed to stderr and saved as
`_failure.png` / `_failure.txt`), `2` bad arguments or script.

Other options: `--no-cursor`, `--font-size 14` (logical px), `--scale 2`, `--max-time 300` (watchdog that kills the
process tree), `--keep-env`. By default `ANTHROPIC_*` and `CLAUDE_*` variables inherited from your shell are dropped
(a nested Claude Code would otherwise behave differently); pass what you need with `--env`.

## Steps

The script is a JSON list; each step has exactly one action key:

| Step | Meaning |
| --- | --- |
| `{"wait": 2.5}` | Sleep; the pty keeps being drained into the screen. |
| `{"wait_for": "text", "timeout": 30}` | Wait until the literal text is on the rendered screen; otherwise fail with a dump. Fails fast if the child exits. |
| `{"send": "/litellm\r"}` | Type text. Escapes: `\r \n \t \e \xHH \uHHHH \\`. One write per key, 20 ms apart, so a TUI sees typing and not a paste (a pasted `\r` is a newline, not Enter). `"delay": 0` sends it as one chunk. |
| `{"key": "enter"}` | Named key: `enter esc tab shift+tab up down left right space backspace delete home end pageup pagedown`, `ctrl+<letter>`, `alt+<char>`. |
| `{"shot": "01-name", "title": "caption", "settle": 0.4}` | Wait until the screen is quiet for `settle` seconds (max 5 s), then write `<out>/01-name.png` and `.txt`. `title` overrides `--title`. Names match `[A-Za-z0-9_.-]+`. |
| `{"resize": [cols, rows]}` | Resize the pty and the screen. |

`\xHH` is not valid JSON; the loader accepts it anyway, as well as `\\x1b` (a literal backslash that `send` decodes).

## Example: Claude Code with the litellm-key plugin

```bash
python dev/mock-litellm.py --scenario warning --port 4010 &          # the mock LiteLLM proxy
python dev/evidence/seed_claude_home.py "$SCRATCH/claude-home" "$SCRATCH/work"
uv run dev/evidence/term_shot.py --script dev/evidence/steps/example.json --out "$SCRATCH/shots" \
  --cols 150 --rows 40 --trim --cwd "$SCRATCH/work" \
  --env CLAUDE_CONFIG_DIR="$SCRATCH/claude-home" ANTHROPIC_BASE_URL=http://127.0.0.1:4010 \
        ANTHROPIC_AUTH_TOKEN=sk-demo-key-12345 ANTHROPIC_MODEL=claude-sonnet-4-5 \
        DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
  -- claude --plugin-dir ./plugins/litellm-key
```

What it takes to start Claude Code at the prompt with an isolated config (your real `~/.claude` is never read):

- `CLAUDE_CONFIG_DIR` pointing at a scratch dir, pre-seeded by `seed_claude_home.py` in `.claude.json`:
  `theme`, `hasCompletedOnboarding`, and the working directory trusted (`projects[<cwd>].hasTrustDialogAccepted`).
  Without it you get the theme picker, then the folder-trust prompt.
- If any parent directory of the cwd has a `CLAUDE.md` that imports files outside it, Claude Code asks "Allow external
  CLAUDE.md file imports?". The seed sets `hasClaudeMdExternalIncludesApproved=false` and `...WarningShown=true`.
  Pick a cwd outside such trees to avoid it altogether.
- `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` (no login screen) and `ANTHROPIC_MODEL` (only changes the header).
- **`DISABLE_AUTOUPDATER=1` matters**: Claude Code updates a global npm install in place when it starts. Without it,
  running the harness can upgrade the `claude` on your PATH.
- The cwd shows in the Claude Code header, so pass a short `--cwd` for tidy screenshots.
- Layout depends on terminal width (side pane from 110 columns) and on server-side flags; capture what you document.

## Rendering notes and known limits

- **Fonts**: Cascadia Mono (variable; bold via its `Bold` axis), else Consolas / DejaVu Sans Mono, found in
  `C:\Windows\Fonts` and `%LOCALAPPDATA%\Microsoft\Windows\Fonts`. The font size is snapped so the advance is exactly an
  integer cell width; every glyph sits on that grid. Missing glyphs fall back per character to Segoe UI Symbol, MS Gothic
  / Yu Gothic (CJK) and Segoe UI Emoji (color, for wide emoji). `--selftest` fails if any glyph has no font.
- Fallback glyphs are proportional: they are centered in their cell(s) and shrunk if too wide, so `⚠ ⏸ ✻` look smaller
  than text, as they do in Windows Terminal.
- Box drawing (`─│╭╮╰╯┌┐└┘├┤┬┴┼`, heavy, `═║`) and block elements (`█▀▄▌▐░▒▓`, eighths, quadrants) are drawn
  procedurally so neighbors join without seams. Dashed lines, mixed light/heavy and double junctions use the font glyph.
  Shades `░▒▓` are alpha blends, not dithers.
- Colors: default, 16 named (theme palette; `38;5;0..15` also map to it), 256, truecolor. Bold is font weight only (no
  bright-color promotion); dim blends the foreground 50% toward the background; italics are a sheared upright face
  (no italic font is installed); underline, strikethrough, reverse and a block cursor (when not hidden) are drawn.
- `pyte` limits: no alternate screen buffer, no scrollback (only the visible screen is captured), no blink, no underline
  color or style, no images. Colon SGR sub-parameters and kitty/xterm `CSI >`/`CSI =` and DCS/APC sequences are filtered
  before `pyte` sees them. Only cursor-position and primary-DA queries are answered.
- `resize` shrinking drops the top rows (a `pyte` behavior); it relies on the app repainting after the pty resize.
- A screen that never rests (spinner) is captured after the 5 s `settle` limit.
- `.cmd` / `.bat` commands (npm shims) run through `cmd /c`; paths with spaces there are untested.
- Windows only (ConPTY).

## Files

`term_shot.py` CLI, `steps.py` step parsing and execution, `pty_session.py` ConPTY session, `vt.py` pyte plumbing,
`render.py` + `glyphs.py` + `fonts.py` + `themes.py` rendering (`render.render_screen(screen, title, theme) -> PIL.Image`),
`selftest.py`, `seed_claude_home.py`, `steps/example.json`.

## The README walkthrough (real LiteLLM, real Claude Code)

`steps/walkthrough-1..5.json` produced every terminal screenshot in the root README, against the local lab
([`dev/litellm`](../litellm/README.md)) with the committed mock config, so no provider key or cluster routing is involved.

```bash
docker compose -f dev/litellm/docker-compose.yml up -d
python dev/litellm/demo.py seed "$SCRATCH/demo.key"                  # team, user ana@example.com (internal_user), key claude-code-ana
python dev/evidence/seed_claude_home.py "$SCRATCH/home" "$SCRATCH/work"
CLAUDE_CONFIG_DIR="$SCRATCH/home" claude plugin marketplace add .    # the real install flow, in the isolated home
CLAUDE_CONFIG_DIR="$SCRATCH/home" claude plugin install litellm-key@cc-litellm
printf '{"litellm_admin_key":"sk-local-master-key"}' | CLAUDE_CONFIG_DIR="$SCRATCH/home" claude plugin configure litellm-key@cc-litellm --values-stdin
```

Then, for each run, the same command with a different script (`--cols 150 --rows 44 --trim`):

```bash
uv run dev/evidence/term_shot.py --script dev/evidence/steps/walkthrough-1.json --out "$SCRATCH/shots1" --cwd "$SCRATCH/work" \
  --env CLAUDE_CONFIG_DIR="$SCRATCH/home" ANTHROPIC_BASE_URL=http://127.0.0.1:4000 ANTHROPIC_AUTH_TOKEN="$(cat "$SCRATCH/demo.key")" \
        ANTHROPIC_MODEL=cloud/auto DISABLE_AUTOUPDATER=1 DISABLE_TELEMETRY=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 -- claude
```

| Run | Stage first | Shows |
| --- | --- | --- |
| 1 | `demo.py spend claude-code-ana 4.12` | status line, pane (with the user's role), `models`, `keys`, `fallbacks` |
| 2 | (same) | `key new` preview, dialog and result, `grant` dialog and result, filtered `fallbacks` |
| 3 | `demo.py spend claude-code-ana 30` | 86% warning, `key block` dialog, blocked key, unblock, `debug` |
| 4 | `demo.py spend claude-code-ana 35.4` | over-budget banner, `info`, `grant --dry-run`, recovery after `grant`, `help` |
| 5 | `demo.py expiring "$SCRATCH/old.key"`, wait 10 s, use it as `ANTHROPIC_AUTH_TOKEN` | an expired key, named as expired |

Disclosure: the spend of `claude-code-ana` is **staged** with `/key/update` so a budget state can be photographed
(the real requests only cost a few cents); everything the plugin shows comes from the proxy's answers.
`/litellm key new` writes the new key to the system **clipboard**: the harness overwrites yours while it runs.
Screenshots taken against your own cluster's routing go to `dev/evidence/cluster/`, which is git-ignored.
