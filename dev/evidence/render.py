"""Render a pyte screen to a PNG with macOS-style window chrome."""
from __future__ import annotations

from typing import Any, NamedTuple

from PIL import Image, ImageDraw, ImageFilter

from fonts import FontSet, get_fontset, ui_font
from glyphs import box_spec, draw_block, draw_box
from themes import DIM_MARK, RGB, THEMES, Theme, blend, resolve

DIM_BLEND = 0.5  # how far SGR 2 pulls the foreground toward the background
_LIGHTS = ((255, 95, 87), (254, 188, 46), (40, 200, 64))


class Style(NamedTuple):
    fg: RGB
    bg: RGB
    bold: bool
    italic: bool
    underline: bool
    strike: bool


class Cell(NamedTuple):
    ch: str  # "" marks the right half of a wide char
    style: Style


def snapshot(screen: Any, theme: Theme, cursor: bool) -> list[list[Cell]]:
    """Resolve every cell to concrete colors under the lock-holder's view of the screen."""
    cur = screen.cursor
    show = cursor and not cur.hidden
    rows: list[list[Cell]] = []
    for y in range(screen.lines):
        line = screen.buffer[y]
        row = []
        for x in range(screen.columns):
            c = line[x]
            fg = resolve(c.fg, theme, theme.fg)
            bg = resolve(c.bg, theme, theme.bg)
            if c.reverse:
                fg, bg = bg, fg
            if c.fg.startswith(DIM_MARK):
                fg = blend(fg, bg, DIM_BLEND)
            if show and (x, y) == (cur.x, cur.y):
                fg, bg = theme.bg, theme.cursor
            style = Style(fg, bg, bool(c.bold), bool(c.italics), bool(c.underscore), bool(c.strikethrough))
            row.append(Cell(c.data, style))
        rows.append(row)
    return rows


def trim_blank_rows(rows: list[list[Cell]], theme: Theme) -> list[list[Cell]]:
    """Drop empty rows at the bottom, keeping at least one."""
    def blank(row: list[Cell]) -> bool:
        return all(c.ch in ("", " ") and c.style.bg == theme.bg and not c.style.underline for c in row)

    end = len(rows)
    while end > 1 and blank(rows[end - 1]):
        end -= 1
    return rows[:end]


def _runs(row: list[Cell]) -> list[tuple[int, int, Style]]:
    runs: list[tuple[int, int, Style]] = []
    for x, cell in enumerate(row):
        if runs and runs[-1][2] == cell.style:
            runs[-1] = (runs[-1][0], x + 1, cell.style)
        else:
            runs.append((x, x + 1, cell.style))
    return runs


def _draw_text(img: Image.Image, d: ImageDraw.ImageDraw, fs: FontSet, xy: tuple[float, float],
               text: str, st: Style, font: Any = None, color: bool = False) -> None:
    font = font or fs.font(st.bold)
    stroke = 1 if st.bold and fs.fake_bold and font is fs.bold else 0
    if st.italic and not color:
        _draw_italic(img, fs, xy, text, st, font, stroke)
    else:
        d.text(xy, text, font=font, fill=st.fg, anchor="ls", embedded_color=color, stroke_width=stroke)


def _draw_italic(img: Image.Image, fs: FontSet, xy: tuple[float, float], text: str, st: Style,
                 font: Any, stroke: int) -> None:
    """No italic face is installed; shear the upright glyphs around the baseline."""
    pad = fs.cell_h // 3
    w = round(font.getlength(text)) + 2 * pad
    mask = Image.new("L", (w, fs.cell_h), 0)
    ImageDraw.Draw(mask).text((pad, fs.baseline), text, font=font, fill=255, anchor="ls", stroke_width=stroke)
    k = 0.2
    mask = mask.transform(mask.size, Image.AFFINE, (1, k, -k * fs.baseline, 0, 1, 0), Image.BICUBIC)
    img.paste(st.fg, (round(xy[0]) - pad, round(xy[1]) - fs.baseline), mask)


def _draw_row(img: Image.Image, d: ImageDraw.ImageDraw, fs: FontSet, row: list[Cell], y: int, theme: Theme,
              scale: int) -> None:
    cw, ch = fs.cell_w, fs.cell_h
    top, base = y * ch, y * ch + fs.baseline
    thick = max(1, round(scale))
    for x0, x1, st in _runs(row):
        if st.bg != theme.bg:
            d.rectangle([x0 * cw, top, x1 * cw - 1, top + ch - 1], fill=st.bg)
        if st.underline:
            uy = base + max(2, round(fs.px * 0.1))
            d.rectangle([x0 * cw, uy, x1 * cw - 1, uy + thick - 1], fill=st.fg)
        if st.strike:
            sy = base - round(fs.px * 0.28)
            d.rectangle([x0 * cw, sy, x1 * cw - 1, sy + thick - 1], fill=st.fg)

    seg: list[str] = []  # contiguous primary-font glyphs drawn in one call
    seg_x, seg_style = 0, None

    def flush() -> None:
        nonlocal seg
        if seg:
            _draw_text(img, d, fs, (seg_x * cw, base), "".join(seg), seg_style)  # type: ignore[arg-type]
            seg = []

    for x, cell in enumerate(row):
        text = cell.ch.replace("️", "").replace("︎", "")
        if text in ("", " ") or text < " ":
            flush()
            continue
        st, head = cell.style, text[0]
        ncols = 2 if x + 1 < len(row) and row[x + 1].ch == "" else 1
        if ncols == 1 and (spec := box_spec(head)):
            flush()
            draw_box(img, spec, x * cw, top, cw, ch, st.fg, scale)
            continue
        if ncols == 1 and draw_block(d, head, x * cw, top, cw, ch, st.fg, st.bg):
            flush()
            continue
        choice = fs.resolve(head, ncols)
        if choice is not None and choice.primary and ncols == 1 and fs.run_ok and len(text) == 1:
            if seg and (seg_style != st or seg_x + len(seg) != x):
                flush()
            if not seg:
                seg_x, seg_style = x, st
            seg.append(text)
            continue
        flush()
        if choice is None:  # let the primary font show its own notdef box
            _draw_text(img, d, fs, (x * cw, base), text, st)
            continue
        font = fs.font(st.bold) if choice.primary else fs.fallback_font(choice, head, ncols, st.bold)
        x_off = 0.0 if choice.primary else (ncols * cw - font.getlength(head)) / 2
        _draw_text(img, d, fs, (x * cw + x_off, base), text, st, font, choice.color)
    flush()


def draw_terminal(rows: list[list[Cell]], fs: FontSet, theme: Theme, scale: int) -> Image.Image:
    img = Image.new("RGB", (len(rows[0]) * fs.cell_w, len(rows) * fs.cell_h), theme.bg)
    d = ImageDraw.Draw(img)
    for y, row in enumerate(rows):
        _draw_row(img, d, fs, row, y, theme, scale)
    return img


def _rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    k = 4  # supersample the corners
    m = Image.new("L", (size[0] * k, size[1] * k), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] * k - 1, size[1] * k - 1], radius * k, fill=255)
    return m.resize(size, Image.LANCZOS)


def frame_window(term: Image.Image, title: str, theme: Theme, scale: int) -> Image.Image:
    """Wrap the terminal image in a window: title bar, traffic lights, border, soft shadow."""
    s = scale
    pad_x, pad_top, pad_bot, bar_h, radius, margin = 16 * s, 10 * s, 14 * s, 32 * s, 12 * s, 36 * s
    ww, wh = term.width + 2 * pad_x, bar_h + pad_top + term.height + pad_bot
    win = Image.new("RGB", (ww, wh), theme.bg)
    d = ImageDraw.Draw(win)
    d.rectangle([0, 0, ww, bar_h], fill=theme.bar)
    d.line([0, bar_h, ww, bar_h], fill=theme.border, width=s)
    for i, color in enumerate(_LIGHTS):
        cx, cy, r = 20 * s + i * 20 * s, bar_h // 2, 6 * s
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    if title:
        font = ui_font(13 * s)
        d.text((ww / 2, bar_h / 2), title, font=font, fill=theme.title_fg, anchor="mm")
    win.paste(term, (pad_x, bar_h + pad_top))

    mask = _rounded_mask((ww, wh), radius)
    ring = Image.new("RGB", (ww, wh), theme.border)  # 1px border: border color shows at the rim
    inner = _rounded_mask((ww - 2 * s, wh - 2 * s), radius - s)
    rim = Image.new("L", (ww, wh), 0)
    rim.paste(inner, (s, s))
    win = Image.composite(win, ring, rim)

    out = Image.new("RGBA", (ww + 2 * margin, wh + 2 * margin), (0, 0, 0, 0))
    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, theme.shadow_alpha), (margin, margin + 10 * s), mask)
    out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(14 * s)))
    out.paste(win, (margin, margin), mask)
    return out


def render_screen(screen: Any, title: str = "", theme: str | Theme = "dark", *, font_size: float = 14.0,
                  scale: int = 2, cursor: bool = True, trim: bool = False) -> Image.Image:
    """Render any pyte-like screen (.columns, .lines, .buffer, .cursor) to an RGBA image."""
    th = THEMES[theme] if isinstance(theme, str) else theme
    fs = get_fontset(font_size * scale)
    rows = snapshot(screen, th, cursor)
    return frame_window(draw_terminal(trim_blank_rows(rows, th) if trim else rows, fs, th, scale), title, th, scale)
