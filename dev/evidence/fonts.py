"""Font discovery and per-glyph fallback on a fixed cell grid."""
from __future__ import annotations

import os
from contextlib import suppress
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import ImageFont
from wcwidth import wcwidth

PRIMARY = ("CascadiaMono.ttf", "CascadiaCode.ttf", "consola.ttf", "DejaVuSansMono.ttf")
BOLD_SIBLING = {"consola.ttf": "consolab.ttf", "DejaVuSansMono.ttf": "DejaVuSansMono-Bold.ttf"}
SYMBOLS = ("seguisym.ttf", "DejaVuSans.ttf", "segoeui.ttf")
EMOJI = ("seguiemj.ttf",)
CJK = ("msgothic.ttc", "YuGothM.ttc", "msyh.ttc", "malgun.ttf", "simsun.ttc")
UI = ("segoeui.ttf", "arial.ttf", "DejaVuSans.ttf")
LINE_HEIGHT = 1.28  # of the font px; Cascadia's own 1.37 looks airy on screenshots
BASIC = ImageFont.Layout.BASIC  # no raqm in the wheels; basic keeps advances exact


@cache
def font_dirs() -> tuple[Path, ...]:
    local = os.environ.get("LOCALAPPDATA", "")
    dirs = [Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"]
    if local:
        dirs.append(Path(local) / "Microsoft" / "Windows" / "Fonts")
    dirs += [Path("/usr/share/fonts/truetype/dejavu"), Path("/Library/Fonts")]
    return tuple(d for d in dirs if d.is_dir())


def find(names: tuple[str, ...]) -> list[Path]:
    return [d / n for n in names for d in font_dirs() if (d / n).is_file()]


@cache
def _cmap(path: Path) -> frozenset[int]:
    return frozenset(TTFont(path, lazy=True, fontNumber=0).getBestCmap())


@cache
def load(path: Path, px: float, bold: bool = False) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(path), px, layout_engine=BASIC)
    if bold:
        with suppress(OSError, ValueError):  # not a variable font
            font.set_variation_by_name("Bold")
    return font


@dataclass(frozen=True)
class Choice:
    path: Path
    color: bool  # draw with embedded color (emoji)
    primary: bool


class FontSet:
    """Cell metrics derived from the primary font so its advance is exact."""

    def __init__(self, font_px: float) -> None:
        paths = find(PRIMARY)
        if not paths:
            raise RuntimeError("no monospaced font found (Cascadia Mono, Consolas, DejaVu Sans Mono)")
        self.primary = paths[0]
        ratio = load(self.primary, 200).getlength("M") / 200
        self.cell_w = max(2, round(font_px * ratio))
        self.px = self.cell_w / ratio
        self.regular = load(self.primary, self.px)
        sibling = find((BOLD_SIBLING.get(self.primary.name, ""),))
        self.bold_path = sibling[0] if sibling else self.primary
        self.bold = load(self.bold_path, self.px, bold=self.bold_path == self.primary)
        asc, desc = self.regular.getmetrics()
        self.cell_h = round(self.px * LINE_HEIGHT)
        self.baseline = round((self.cell_h - (asc + desc)) / 2 + asc)
        # one draw call per run is only safe when the advance is exactly the cell
        self.run_ok = abs(self.regular.getlength("M" * 64) - 64 * self.cell_w) < 0.01
        self._choices: dict[tuple[str, int], Choice | None] = {}
        self.fake_bold = self.bold_path == self.primary and not _is_variable(self.bold)

    def font(self, bold: bool) -> ImageFont.FreeTypeFont:
        return self.bold if bold else self.regular

    def resolve(self, ch: str, ncols: int) -> Choice | None:
        """First font covering ch; wide cells try emoji and CJK fonts before symbols."""
        key = (ch, ncols)
        if key not in self._choices:
            self._choices[key] = self._pick(ch, ncols)
        return self._choices[key]

    def _pick(self, ch: str, ncols: int) -> Choice | None:
        cp = ord(ch)
        wide = ncols == 2 or wcwidth(ch) == 2
        order: list[tuple[tuple[str, ...], bool, bool]] = [(PRIMARY, False, True)]
        tail = [(SYMBOLS[:1], False, False), (CJK, False, False), (EMOJI, True, False), (SYMBOLS[1:], False, False)]
        if wide:
            order = [(EMOJI, True, False), (CJK, False, False), (SYMBOLS, False, False)]
        else:
            order += tail
        for names, color, primary in order:
            for path in find(names):
                if primary and path != self.primary:
                    continue
                if cp in _cmap(path):
                    return Choice(path, color, primary)
        return None

    def fallback_font(self, choice: Choice, ch: str, ncols: int, bold: bool) -> ImageFont.FreeTypeFont:
        """Fallback glyphs are proportional: shrink those that would overflow their cells."""
        font = load(choice.path, self.px, bold and not choice.color)
        limit = ncols * self.cell_w
        width = font.getlength(ch)
        if width > limit * 1.02:
            font = load(choice.path, round(self.px * limit / width, 1), bold and not choice.color)
        return font


def _is_variable(font: ImageFont.FreeTypeFont) -> bool:
    try:
        return bool(font.get_variation_names())
    except (OSError, ValueError):
        return False


@cache
def get_fontset(font_px: float) -> FontSet:
    return FontSet(font_px)


def ui_font(px: float) -> ImageFont.FreeTypeFont:
    paths = find(UI)
    return load(paths[0], px) if paths else load(get_fontset(px).primary, px)
