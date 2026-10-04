"""Terminal color themes and pyte color resolution."""
from __future__ import annotations

from dataclasses import dataclass

RGB = tuple[int, int, int]

# Marks a foreground that SGR 2 (faint) applied to; pyte has no dim attribute.
DIM_MARK = "~"

# pyte calls ANSI yellow "brown".
_NAMES = ("black", "red", "green", "brown", "blue", "magenta", "cyan", "white")
NAME_INDEX: dict[str, int] = {n: i for i, n in enumerate(_NAMES)}
NAME_INDEX.update({"bright" + n: i + 8 for i, n in enumerate(_NAMES)})
NAME_INDEX["bfightmagenta"] = 13  # typo in pyte.graphics.BG_AIXTERM[105]


def rgb(value: str) -> RGB:
    v = value.lstrip("#")
    return int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)


@dataclass(frozen=True)
class Theme:
    bg: RGB
    fg: RGB
    cursor: RGB
    ansi: tuple[RGB, ...]
    bar: RGB  # title bar fill
    border: RGB
    title_fg: RGB
    shadow_alpha: int


DARK = Theme(
    bg=rgb("0d1117"),
    fg=rgb("e6edf3"),
    cursor=rgb("e6edf3"),
    ansi=tuple(rgb(c) for c in (
        "484f58", "ff7b72", "3fb950", "d29922", "58a6ff", "bc8cff", "39c5cf", "b1bac4",
        "6e7681", "ffa198", "56d364", "e3b341", "79c0ff", "d2a8ff", "56d4dd", "f0f6fc",
    )),
    bar=rgb("161b22"),
    border=rgb("30363d"),
    title_fg=rgb("8b949e"),
    shadow_alpha=150,
)

LIGHT = Theme(
    bg=rgb("ffffff"),
    fg=rgb("1f2328"),
    cursor=rgb("1f2328"),
    ansi=tuple(rgb(c) for c in (
        "24292f", "cf222e", "116329", "4d2d00", "0969da", "8250df", "1b7c83", "6e7781",
        "57606a", "a40e26", "1a7f37", "633c01", "218bff", "a475f9", "3192aa", "8c959f",
    )),
    bar=rgb("f6f8fa"),
    border=rgb("d0d7de"),
    title_fg=rgb("57606a"),
    shadow_alpha=70,
)

THEMES: dict[str, Theme] = {"dark": DARK, "light": LIGHT}


def blend(a: RGB, b: RGB, t: float) -> RGB:
    """Mix a toward b by t (0 keeps a, 1 gives b)."""
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b, strict=True))  # type: ignore[return-value]


def resolve(color: str, theme: Theme, default: RGB) -> RGB:
    """Map a pyte color (name, 6-digit hex, or 'default') to RGB."""
    color = color.removeprefix(DIM_MARK)
    if color == "default":
        return default
    if color in NAME_INDEX:
        return theme.ansi[NAME_INDEX[color]]
    if len(color) == 6:
        try:
            return rgb(color)
        except ValueError:
            pass
    return default
