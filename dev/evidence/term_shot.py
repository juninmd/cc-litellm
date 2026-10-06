# /// script
# requires-python = ">=3.10"
# dependencies = ["pywinpty>=3", "pyte>=0.8.2", "pillow>=10.1", "fonttools>=4.40"]
# ///
"""Screenshot a terminal TUI on Windows: drive it in a ConPTY, render the screen to PNG + TXT.

    uv run dev/evidence/term_shot.py --script steps/example.json --out shots -- claude --plugin-dir ./plugins/x
    uv run dev/evidence/term_shot.py --selftest --out shots
"""
from __future__ import annotations

import argparse
import os
import sys
import threading
from pathlib import Path

sys.dont_write_bytecode = True  # keep __pycache__ out of the public repo
sys.path.insert(0, str(Path(__file__).resolve().parent))

from render import render_screen  # noqa: E402,F401  (re-exported: import term_shot; term_shot.render_screen)
from steps import RunOptions, StepError, StepFailure, load_script, run_steps, save_shot  # noqa: E402

# Variables that would make a nested Claude Code session behave differently from a clean one.
_SCRUB_PREFIXES = ("ANTHROPIC_", "CLAUDE_", "CLAUDECODE")


def parse_args(argv: list[str]) -> tuple[argparse.Namespace, list[str]]:
    split = argv.index("--") if "--" in argv else len(argv)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
                                 usage="term_shot.py [options] -- COMMAND [ARGS...]")
    ap.add_argument("--script", type=Path, help="JSON list of steps")
    ap.add_argument("--out", type=Path, default=Path("."), help="output directory (default: .)")
    ap.add_argument("--cols", type=int, default=120)
    ap.add_argument("--rows", type=int, default=36)
    ap.add_argument("--cwd", help="working directory of the command")
    ap.add_argument("--env", action="extend", nargs="+", default=[], metavar="KEY=VAL")
    ap.add_argument("--keep-env", action="store_true", help="keep inherited ANTHROPIC_*/CLAUDE_* variables")
    ap.add_argument("--theme", choices=("dark", "light"), default="dark")
    ap.add_argument("--title", default=None, help="default window title (default: the command name)")
    ap.add_argument("--no-cursor", action="store_true", help="do not draw the cursor cell")
    ap.add_argument("--trim", action="store_true", help="crop empty rows at the bottom of each shot")
    ap.add_argument("--font-size", type=float, default=14.0, help="logical px (default 14)")
    ap.add_argument("--scale", type=int, default=2, help="device scale (default 2)")
    ap.add_argument("--max-time", type=float, default=300.0, help="kill the child after this many seconds")
    ap.add_argument("--selftest", action="store_true", help="render a synthetic screen to OUT/selftest.png")
    return ap.parse_args(argv[:split]), argv[split + 1:]


def build_env(pairs: list[str], keep: bool) -> dict[str, str]:
    env = dict(os.environ)
    if not keep:
        env = {k: v for k, v in env.items() if not k.upper().startswith(_SCRUB_PREFIXES)}
    env.setdefault("TERM", "xterm-256color")
    env.setdefault("COLORTERM", "truecolor")  # TUIs emit 24-bit color only when told it is supported
    for pair in pairs:
        key, sep, value = pair.partition("=")
        if not key or not sep:
            raise StepError(f"--env expects KEY=VAL, got {pair!r}")
        env[key] = value
    return env


def run(args: argparse.Namespace, command: list[str]) -> int:
    from pty_session import Session, SessionError

    steps = load_script(args.script)
    env = build_env(args.env, args.keep_env)
    opts = RunOptions(args.out, args.theme, args.title if args.title is not None else Path(command[0]).stem,
                      not args.no_cursor, args.font_size, args.scale, args.trim)
    try:
        session = Session(command, args.cols, args.rows, args.cwd, env)
    except SessionError as exc:
        print(f"term_shot: {exc}", file=sys.stderr)
        return 1
    watchdog = threading.Timer(args.max_time, session.kill_tree)
    watchdog.daemon = True
    watchdog.start()
    code = 0
    try:
        run_steps(session, steps, opts, lambda msg: print(msg, flush=True))
    except (StepFailure, SessionError) as exc:
        print(f"term_shot: {exc}", file=sys.stderr)
        print("--- screen at failure ---", file=sys.stderr)
        print(session.screen_text(), file=sys.stderr)
        save_shot(session, "_failure", "term_shot: failure", opts)
        code = 1
    finally:
        watchdog.cancel()
        session.stop()
    return code


def main(argv: list[str]) -> int:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    args, command = parse_args(argv)
    if args.selftest:
        import selftest

        return selftest.run(args.out, args.theme, args.scale)
    if not args.script or not command:
        print("term_shot: need --script FILE and a command after --  (or --selftest)", file=sys.stderr)
        return 2
    try:
        return run(args, command)
    except (StepError, OSError) as exc:
        print(f"term_shot: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
