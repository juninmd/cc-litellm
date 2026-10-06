"""Procedural box-drawing and block glyphs so adjacent cells join without seams."""
from __future__ import annotations

import unicodedata
from functools import cache, lru_cache

from PIL import Image, ImageDraw

from themes import RGB, blend

_WEIGHT = {"LIGHT": 1, "HEAVY": 2, "DOUBLE": 3}
_SIDES = {
    "UP": ("up",), "DOWN": ("down",), "LEFT": ("left",), "RIGHT": ("right",),
    "VERTICAL": ("up", "down"), "HORIZONTAL": ("left", "right"),
}
# Quadrant bits: UL=1 UR=2 LL=4 LR=8, for U+2596..U+259F.
_QUADRANTS = (4, 8, 1, 13, 9, 7, 11, 2, 6, 14)
_SS = 4  # supersampling for the cached box masks

Spec = tuple[int, int, int, int, bool]  # up, down, left, right weights; arc


@cache
def box_spec(ch: str) -> Spec | None:
    """Parse a U+2500 box-drawing char from its Unicode name; None to use the font glyph."""
    if not 0x2500 <= ord(ch) <= 0x257F:
        return None
    name = unicodedata.name(ch, "")
    if "DASH" in name or "DIAGONAL" in name:
        return None
    words = name.removeprefix("BOX DRAWINGS ").split()
    arc = "ARC" in words
    words = [w for w in words if w != "ARC"]
    lead = _WEIGHT.get(words[0], 1)
    sides = {"up": 0, "down": 0, "left": 0, "right": 0}
    for part in " ".join(words).split(" AND "):
        toks = part.split()
        weight = next((_WEIGHT[t] for t in toks if t in _WEIGHT), lead)
        for t in toks:
            for side in _SIDES.get(t, ()):
                sides[side] = weight
    spec = (sides["up"], sides["down"], sides["left"], sides["right"], arc)
    up, down, left, right = spec[:4]
    straight = bool((up and down and not left and not right) or (left and right and not up and not down))
    if 3 in spec[:4] and not (straight and not arc):
        return None  # mixed or joined double lines: the font draws those junctions right
    return spec


@lru_cache(maxsize=512)
def _box_mask(spec: Spec, w: int, h: int, t: int) -> Image.Image:
    up, down, left, right, arc = spec
    k = _SS
    mask = Image.new("L", (w * k, h * k), 0)
    d = ImageDraw.Draw(mask)
    cx, cy = w // 2, h // 2  # edge coordinates; strokes span [c - th/2, c + th/2)

    def rect(x0: int, y0: int, x1: int, y1: int) -> None:
        if x1 > x0 and y1 > y0:
            d.rectangle([x0 * k, y0 * k, x1 * k - 1, y1 * k - 1], fill=255)

    def thick(weight: int) -> int:
        return t * 2 if weight == 2 else t

    if up == down == 3:  # double vertical
        for off in (-t, t):
            rect(cx + off - t // 2, 0, cx + off + t // 2, h)
    elif left == right == 3:
        for off in (-t, t):
            rect(0, cy + off - t // 2, w, cy + off + t // 2)
    elif arc:
        r = min(w, h) // 2
        radius = r + t // 2
        sx = 1 if right else -1
        sy = 1 if down else -1
        ccx, ccy = cx + sx * r, cy + sy * r
        start = {(1, 1): 180, (-1, 1): 270, (1, -1): 90, (-1, -1): 0}[(sx, sy)]
        d.arc([(ccx - radius) * k, (ccy - radius) * k, (ccx + radius) * k, (ccy + radius) * k],
              start, start + 90, fill=255, width=t * k)
        v, hz = thick(down or up), thick(left or right)
        if down:
            rect(cx - v // 2, ccy, cx - v // 2 + v, h)
        else:
            rect(cx - v // 2, 0, cx - v // 2 + v, ccy)
        if right:
            rect(ccx, cy - hz // 2, w, cy - hz // 2 + hz)
        else:
            rect(0, cy - hz // 2, ccx, cy - hz // 2 + hz)
    else:
        vert = max(thick(up), thick(down)) if (up or down) else 0
        horz = max(thick(left), thick(right)) if (left or right) else 0
        ext_v, ext_h = horz // 2, vert // 2  # arms run past the center to fill the corner
        for weight, arm in ((up, "u"), (down, "d"), (left, "l"), (right, "r")):
            if not weight:
                continue
            th = thick(weight)
            lo = cx - th // 2
            if arm == "u":
                rect(lo, 0, lo + th, cy + ext_v)
            elif arm == "d":
                rect(lo, cy - ext_v, lo + th, h)
            elif arm == "l":
                rect(0, cy - th // 2, cx + ext_h, cy - th // 2 + th)
            else:
                rect(cx - ext_h, cy - th // 2, w, cy - th // 2 + th)
    return mask.resize((w, h), Image.BOX)


def draw_box(img: Image.Image, spec: Spec, x: int, y: int, w: int, h: int, fg: RGB, scale: int) -> None:
    t = 2 * max(1, round(scale / 2))  # even, so strokes center on a pixel edge
    img.paste(fg, (x, y), _box_mask(spec, w, h, t))


def draw_block(d: ImageDraw.ImageDraw, ch: str, x: int, y: int, w: int, h: int, fg: RGB, bg: RGB) -> bool:
    """Draw U+2580..U+259F as rectangles; False when ch is not a block element."""
    cp = ord(ch)
    if not 0x2580 <= cp <= 0x259F:
        return False

    def fill(fx0: float, fy0: float, fx1: float, fy1: float, color: RGB = fg) -> None:
        box = [x + round(w * fx0), y + round(h * fy0), x + round(w * fx1) - 1, y + round(h * fy1) - 1]
        d.rectangle(box, fill=color)

    if cp == 0x2580:
        fill(0, 0, 1, 0.5)
    elif cp <= 0x2588:
        fill(0, 1 - (cp - 0x2580) / 8, 1, 1)
    elif cp <= 0x258F:
        fill(0, 0, (0x2590 - cp) / 8, 1)
    elif cp == 0x2590:
        fill(0.5, 0, 1, 1)
    elif cp <= 0x2593:
        fill(0, 0, 1, 1, blend(bg, fg, (cp - 0x2590) * 0.25))
    elif cp == 0x2594:
        fill(0, 0, 1, 1 / 8)
    elif cp == 0x2595:
        fill(7 / 8, 0, 1, 1)
    else:
        bits = _QUADRANTS[cp - 0x2596]
        for bit, (fx, fy) in ((1, (0, 0)), (2, (0.5, 0)), (4, (0, 0.5)), (8, (0.5, 0.5))):
            if bits & bit:
                fill(fx, fy, fx + 0.5, fy + 0.5)
    return True
