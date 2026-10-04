"""Synthetic screen that exercises every glyph class and color mode the renderer supports."""
from __future__ import annotations

import re
from pathlib import Path

from wcwidth import wcswidth

from fonts import get_fontset
from glyphs import box_spec
from render import render_screen
from vt import Terminal

COLS, ROWS = 100, 34
ESC = "\x1b["
_SGR = re.compile(r"\x1b\[[0-9;]*m")


def sgr(text: str, *codes: object) -> str:
    return f"{ESC}{';'.join(map(str, codes))}m{text}{ESC}0m"


def boxed(lines: list[str], width: int) -> list[str]:
    def pad(s: str) -> str:
        return s + " " * (width - 4 - wcswidth(_SGR.sub("", s)))

    out = ["╭" + "─" * (width - 2) + "╮"]
    out += ["│ " + pad(s) + " │" for s in lines]
    return out + ["╰" + "─" * (width - 2) + "╯"]


def screen_text() -> str:
    bar = lambda n: sgr("█" * n, 32) + sgr("░" * (30 - n), 90)  # noqa: E731
    card = boxed([
        sgr("claude-code-demo", 1) + " · sk-...2345  " + sgr("● active", 32),
        "127.0.0.1:4000 · via ANTHROPIC_AUTH_TOKEN",
        "",
        "Budget      " + bar(25) + " 83%",
        sgr("  $41.37 / $50.00 · $8.63 left · resets in 9d 3h (30d)", 2),
        "Last 7 days " + sgr("▃▄▁▆▇▄█", 36) + " · $41.37 · 369 requests · 8.7M tokens",
        sgr("[ Refresh ]", 7) + " [ Copy ] [ Close ]  " + sgr("Updated 14:32:05 · every 60s", 2),
    ], 78)
    swatch16 = "".join(f"{ESC}{40 + i}m  " if i < 8 else f"{ESC}{100 + i - 8}m  " for i in range(16)) + f"{ESC}0m"
    text16 = "".join(sgr("Aa ", 30 + i) if i < 8 else sgr("Aa ", 90 + i - 8) for i in range(16))
    cube = "".join(f"{ESC}48;5;{n}m " for n in range(16, 88)) + f"{ESC}0m"
    gray = "".join(f"{ESC}48;5;{n}m  " for n in range(232, 256)) + f"{ESC}0m"
    n256 = "".join(sgr("x", 38, 5, n) for n in (1, 2, 9, 10, 124, 208, 220, 33, 141)) + " (38;5;n)"
    true = "".join(f"{ESC}48;2;{i * 4};{128 + i * 2};{255 - i * 4}m " for i in range(64)) + f"{ESC}0m"
    halves = "".join(f"{ESC}38;2;{i * 4};120;{255 - i * 4}m{ESC}48;2;{255 - i * 4};40;{i * 4}m▀" for i in range(64))
    halves += f"{ESC}0m"
    attrs = "  ".join([
        sgr("bold", 1), sgr("dim", 2), sgr("italic", 3), sgr("underline", 4), sgr("reverse", 7),
        sgr("strike", 9), sgr("bold+red", 1, 31), sgr("dim green", 2, 32), sgr("dim truecolor", 2, 38, 2, 255, 160, 0),
        sgr("reverse+blue", 7, 34),
    ])
    lines = card + [
        "",
        "symbols : ● ✔ ✗ ⚠ · … → ✓ ✕ ○ ◆ ▶ ★ ↑ ↓ ← ⏺ ⎿ ✻ ✢ ✽ ❯ › ⠋⠙⠹",
        "blocks  : █ ░ ▒ ▓ ▁ ▂ ▃ ▄ ▅ ▆ ▇ ▀ ▌ ▐ ▖ ▗ ▘ ▙ ▚ ▛ ▜ ▝ ▞ ▟ ▏ ▎ ▍ ▋ ▊ ▉",
        "boxes   : ┌─┬─┐ ├─┼─┤ └─┴─┘ ┏━┳━┓ ┃ ╔═╦═╗ ║ ╭─╮ ╰─╯ ╴╶╵╷ ┄ ┈",
        "wide    : 日本語 한국어 🚀 ✅ ❌ café ñ ü",
        "",
        "ansi bg : " + swatch16,
        "ansi fg : " + text16,
        "256 cube: " + cube,
        "256 gray: " + gray,
        "256 fg  : " + n256,
        "truecolor bg: " + true,
        "truecolor ▀ : " + halves,
        "",
        attrs,
        "mixed   : " + sgr("╭──╮ ", 1, 33) + sgr("[ok]", 42, 30) + " " + sgr("err", 1, 97, 41)
        + " plain text with 0123456789 and ~!@#$%^&*()",
        "",
        "cursor on the next cell -> ",
    ]
    return "\r\n".join(lines)


def build_screen() -> Terminal:
    term = Terminal(COLS, ROWS)
    term.feed(screen_text())
    return term


def check_glyphs(term: Terminal, scale: int) -> list[str]:
    """Return glyphs no font covers (they would render as tofu)."""
    fs = get_fontset(14.0 * scale)
    missing: list[str] = []
    seen: set[str] = set()
    for y in range(term.screen.lines):
        row = term.screen.buffer[y]
        for x in range(term.screen.columns):
            ch = row[x].data
            if ch in seen or ch.strip() == "" or box_spec(ch[:1]) or 0x2580 <= ord(ch[0]) <= 0x259F:
                continue
            seen.add(ch)
            ncols = 2 if x + 1 < term.screen.columns and row[x + 1].data == "" else 1
            if fs.resolve(ch[0], ncols) is None:
                missing.append(ch)
    return missing


def run(out_dir: Path, theme: str = "dark", scale: int = 2) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    term = build_screen()
    missing = check_glyphs(term, scale)
    img = render_screen(term.screen, "term_shot selftest", theme, scale=scale)
    path = out_dir / "selftest.png"
    img.save(path)
    (out_dir / "selftest.txt").write_text(term.text() + "\n", encoding="utf-8")
    print(f"selftest: {path} ({img.width}x{img.height}), glyphs without a font: {''.join(missing) or 'none'}")
    return 1 if missing else 0
