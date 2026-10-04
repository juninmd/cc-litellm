"""Parse and run the JSON step list."""
from __future__ import annotations

import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from render import render_screen

KEYS = {
    "enter": "\r", "return": "\r", "esc": "\x1b", "escape": "\x1b", "tab": "\t", "shift+tab": "\x1b[Z",
    "up": "\x1b[A", "down": "\x1b[B", "right": "\x1b[C", "left": "\x1b[D", "space": " ",
    "backspace": "\x7f", "delete": "\x1b[3~", "home": "\x1b[H", "end": "\x1b[F",
    "pageup": "\x1b[5~", "pagedown": "\x1b[6~",
}
_ESCAPES = re.compile(r"\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[rntae0\\])")
_SIMPLE = {"r": "\r", "n": "\n", "t": "\t", "a": "\a", "e": "\x1b", "0": "\0", "\\": "\\"}
# \xHH and \e are not valid JSON; accept them unless the backslash is itself escaped.
_NON_JSON = re.compile(r"(?<!\\)((?:\\\\)*)\\(?:x([0-9a-fA-F]{2})|(e))")
_NAME = re.compile(r"[\w.-]+")
KINDS = ("wait", "wait_for", "send", "key", "shot", "resize")


class StepError(Exception):
    """Invalid step list (exit 2)."""


class StepFailure(Exception):
    """A step failed while running (exit 1)."""


@dataclass
class Step:
    kind: str
    args: dict[str, Any] = field(default_factory=dict)


def unescape(text: str) -> str:
    """Turn literal \\r \\x1b \\t \\uXXXX into characters; other text, unicode included, is untouched."""
    def sub(m: re.Match[str]) -> str:
        code = m.group(1)
        return chr(int(code[1:], 16)) if code[0] in "xu" else _SIMPLE[code]

    return _ESCAPES.sub(sub, text)


def load_script(path: Path) -> list[Step]:
    text = path.read_text(encoding="utf-8")
    text = _NON_JSON.sub(lambda m: f"{m.group(1)}\\u00{m.group(2) or '1b'}", text)
    try:
        return parse_steps(json.loads(text))
    except json.JSONDecodeError as exc:
        raise StepError(f"{path}: {exc}") from exc


def key_sequence(name: str) -> str:
    lower = name.strip().lower()
    if lower in KEYS:
        return KEYS[lower]
    if m := re.fullmatch(r"ctrl\+([a-z\[\\\]])", lower):
        return chr(ord(m.group(1)) & 0x1F)
    if m := re.fullmatch(r"alt\+(.)", lower):
        return "\x1b" + m.group(1)
    raise StepError(f"unknown key {name!r}; known: {', '.join(sorted(KEYS))}, ctrl+<letter>, alt+<char>")


def _number(raw: dict[str, Any], key: str, default: float | None = None) -> float:
    value = raw.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
        raise StepError(f"{key!r} must be a non-negative number in {raw}")
    return float(value)


def parse_steps(raw_steps: Any) -> list[Step]:
    if not isinstance(raw_steps, list):
        raise StepError("the script must be a JSON list of steps")
    steps: list[Step] = []
    for i, raw in enumerate(raw_steps, 1):
        kinds = [k for k in KINDS if isinstance(raw, dict) and k in raw]
        if len(kinds) != 1:
            raise StepError(f"step {i}: need exactly one of {', '.join(KINDS)}: {raw!r}")
        kind = kinds[0]
        if kind == "wait":
            args: dict[str, Any] = {"seconds": _number(raw, "wait")}
        elif kind == "wait_for":
            if not isinstance(raw["wait_for"], str) or not raw["wait_for"]:
                raise StepError(f"step {i}: wait_for needs a non-empty string")
            args = {"text": raw["wait_for"], "timeout": _number(raw, "timeout", 30)}
        elif kind in ("send", "key"):
            if not isinstance(raw[kind], str):
                raise StepError(f"step {i}: {kind} needs a string")
            text = unescape(raw[kind]) if kind == "send" else key_sequence(raw[kind])
            args = {"text": text, "delay": _number(raw, "delay", 0.02 if kind == "send" else 0)}
        elif kind == "shot":
            if not isinstance(raw["shot"], str) or not _NAME.fullmatch(raw["shot"]):
                raise StepError(f"step {i}: shot name must match [A-Za-z0-9_.-]+")
            args = {"name": raw["shot"], "title": raw.get("title"), "settle": _number(raw, "settle", 0.4)}
        else:
            size = raw["resize"]
            if not (isinstance(size, list) and len(size) == 2 and all(isinstance(n, int) and n > 0 for n in size)):
                raise StepError(f"step {i}: resize needs [cols, rows]")
            args = {"cols": size[0], "rows": size[1]}
        steps.append(Step(kind, args))
    return steps


@dataclass
class RunOptions:
    out_dir: Path
    theme: str = "dark"
    title: str = ""
    cursor: bool = True
    font_size: float = 14.0
    scale: int = 2
    trim: bool = False


def save_shot(session: Any, name: str, title: str, opts: RunOptions) -> Path:
    """Write <name>.png and <name>.txt from one consistent snapshot of the screen."""
    opts.out_dir.mkdir(parents=True, exist_ok=True)
    with session.lock:
        img = render_screen(session.term.screen, title, opts.theme, font_size=opts.font_size,
                            scale=opts.scale, cursor=opts.cursor, trim=opts.trim)
        text = session.term.text()
    path = opts.out_dir / f"{name}.png"
    img.save(path)
    (opts.out_dir / f"{name}.txt").write_text(text + "\n", encoding="utf-8")
    return path


def run_steps(session: Any, steps: list[Step], opts: RunOptions, log: Callable[[str], None]) -> None:
    for i, step in enumerate(steps, 1):
        a = step.args
        if step.kind == "wait":
            time.sleep(a["seconds"])  # the reader thread keeps draining the pty meanwhile
        elif step.kind == "wait_for":
            if not session.wait_for(a["text"], a["timeout"]):
                why = "child exited" if session.eof.is_set() else f"not seen in {a['timeout']:g}s"
                raise StepFailure(f"step {i}: wait_for {a['text']!r} failed ({why})")
        elif step.kind in ("send", "key"):
            session.send(a["text"], a["delay"])
        elif step.kind == "shot":
            session.settle(a["settle"])
            path = save_shot(session, a["name"], a["title"] or opts.title, opts)
            log(f"shot: {path}")
        else:
            session.resize(a["cols"], a["rows"])

