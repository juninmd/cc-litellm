"""pyte plumbing: faint (SGR 2) support and an input sanitizer for sequences pyte mishandles."""
from __future__ import annotations

import re
from collections.abc import Callable

import pyte

from themes import DIM_MARK

# Sequences pyte cannot parse and would print as text.
_CSI_PRIVATE = re.compile(r"\x1b\[[<=>][0-9;:]*[ -/]*[@-~]")  # kitty keyboard, modifyOtherKeys, DA2
_STRING_SEQ = re.compile(r"\x1b[PX^_].*?(?:\x1b\\|\x07)", re.S)  # DCS, SOS, PM, APC
_SGR_COLON = re.compile(r"\x1b\[([0-9;]*:[0-9;:]*)m")
_COMPLETE = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|[ -/]*[0-Z\\`-~])", re.S)  # CSI or short ESC seq
_STRING_OPEN = re.compile(r"\x1b[\]PX^_]")
_MAX_HOLD = 8192


def _fix_sgr(m: re.Match[str]) -> str:
    """Rewrite colon sub-parameters (38:2::r:g:b, 4:3) into the semicolon forms pyte knows."""
    out: list[str] = []
    for tok in m.group(1).split(";"):
        if ":" not in tok:
            out.append(tok)
            continue
        sub = tok.split(":")
        if sub[0] in ("38", "48", "58"):
            if len(sub) > 1 and sub[1] == "2":
                out += [sub[0], "2", *sub[-3:]]
            elif len(sub) > 2 and sub[1] == "5":
                out += [sub[0], "5", sub[2]]
        elif sub[0] == "4":
            out.append("24" if sub[1:] == ["0"] else "4")
        else:
            out.append(sub[0])
    return f"\x1b[{';'.join(out)}m" if out else ""


def _open_tail(data: str) -> int:
    """Index where an unfinished escape sequence starts, or -1."""
    hold = -1
    intro = list(_STRING_OPEN.finditer(data))
    if intro and not re.search(r"\x1b\\|\x07", data[intro[-1].end():]):
        hold = intro[-1].start()
    last = data.rfind("\x1b")
    if last != -1 and not _COMPLETE.match(data, last):
        hold = last if hold == -1 else min(hold, last)
    return hold


class Sanitizer:
    """Chunk-safe filter: a sequence split across reads is held until it completes."""

    def __init__(self) -> None:
        self.pending = ""

    def feed(self, data: str) -> str:
        data, self.pending = self.pending + data, ""
        hold = _open_tail(data)
        if hold != -1 and len(data) - hold < _MAX_HOLD:
            data, self.pending = data[:hold], data[hold:]
        data = _STRING_SEQ.sub("", data)
        data = _CSI_PRIVATE.sub("", data)
        return _SGR_COLON.sub(_fix_sgr, data)


class DimScreen(pyte.Screen):
    """pyte.Screen plus SGR 2: a faint foreground is marked with DIM_MARK for the renderer."""

    def __init__(self, columns: int, lines: int, reply: Callable[[str], None] | None = None) -> None:
        super().__init__(columns, lines)
        self._dim = False
        self._reply = reply

    def write_process_input(self, data: str) -> None:
        if self._reply:
            self._reply(data)

    def select_graphic_rendition(self, *attrs: int, **kwargs: bool) -> None:
        if kwargs.get("private"):  # CSI ? ... m is not SGR
            return
        kept: list[int] = []
        i, attrs = 0, attrs or (0,)
        while i < len(attrs):
            a = attrs[i]
            if a in (38, 48, 58) and i + 1 < len(attrs):
                n = 3 if attrs[i + 1] == 5 else 5  # 38;5;n or 38;2;r;g;b
                chunk, i = list(attrs[i:i + n]), i + n
                if a != 58:  # pyte has no underline color
                    kept += self._theme_slot(a, chunk)
                continue
            i += 1
            if a == 2:
                self._dim = True
            elif a == 22 or a == 0:
                self._dim = False
                kept.append(a)
            elif a not in (8, 53, 55, 59):
                kept.append(a)
        if kept:
            super().select_graphic_rendition(*kept)
        cur = self.cursor.attrs
        fg = cur.fg.removeprefix(DIM_MARK)
        self.cursor.attrs = cur._replace(fg=DIM_MARK + fg if self._dim else fg)

    @staticmethod
    def _theme_slot(base: int, chunk: list[int]) -> list[int]:
        """38;5;0..15 means the theme's ANSI colors, not pyte's xterm hex table."""
        if len(chunk) == 3 and chunk[1] == 5 and chunk[2] < 16:
            n, fg = chunk[2], base == 38
            return [(30 if fg else 40) + n if n < 8 else (90 if fg else 100) + n - 8]
        return chunk


class Terminal:
    """A pyte screen fed through the sanitizer; not thread-safe, callers lock."""

    def __init__(self, cols: int, rows: int, reply: Callable[[str], None] | None = None) -> None:
        self.screen = DimScreen(cols, rows, reply)
        self.stream = pyte.Stream(self.screen)
        self.sanitizer = Sanitizer()

    def feed(self, data: str) -> None:
        self.stream.feed(self.sanitizer.feed(data))

    def resize(self, cols: int, rows: int) -> None:
        self.screen.resize(rows, cols)

    def text(self) -> str:
        lines = [line.rstrip() for line in self.screen.display]
        while lines and not lines[-1]:
            lines.pop()
        return "\n".join(lines)
