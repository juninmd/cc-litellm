"""Run a command in a Windows ConPTY and mirror its output into a pyte screen."""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from collections.abc import Mapping
from contextlib import suppress

from winpty import PtyProcess

from vt import Terminal

# One write per key so a TUI sees typing, not a paste; escape sequences stay whole.
_KEY_TOKENS = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|O.|.)|.", re.S)
READ_SIZE = 65536
POLL = 0.05


class SessionError(RuntimeError):
    pass


def resolve_command(argv: list[str], env: Mapping[str, str]) -> list[str]:
    exe = shutil.which(argv[0], path=env.get("PATH"))
    if exe is None:
        raise SessionError(f"command not found: {argv[0]}")
    if exe.lower().endswith((".cmd", ".bat")):  # npm shims: CreateProcess cannot run them directly
        return [os.environ.get("COMSPEC", "cmd.exe"), "/c", exe, *argv[1:]]
    return [exe, *argv[1:]]


class Session:
    def __init__(self, argv: list[str], cols: int, rows: int, cwd: str | None, env: Mapping[str, str]) -> None:
        self.cols, self.rows = cols, rows
        self.lock = threading.Lock()
        self.term = Terminal(cols, rows, reply=self._reply)
        self.eof = threading.Event()
        self.read_error: Exception | None = None
        try:
            self.proc = PtyProcess.spawn(resolve_command(argv, env), cwd=cwd, env=dict(env), dimensions=(rows, cols))
        except (OSError, ValueError) as exc:
            raise SessionError(f"cannot start {argv[0]}: {exc}") from exc
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self) -> None:
        try:
            while True:
                data = self.proc.read(READ_SIZE)
                with self.lock:
                    self.term.feed(data)
        except EOFError:
            pass
        except OSError as exc:  # the pty closed under us; remember why for the failure report
            self.read_error = exc
        finally:
            self.eof.set()

    def _reply(self, data: str) -> None:
        """Answer terminal queries (cursor position, device attributes) the child waits on."""
        with suppress(EOFError, OSError):  # child is gone; nothing left to answer
            self.proc.write(data)

    def write(self, data: str) -> None:
        try:
            self.proc.write(data)
        except (EOFError, OSError) as exc:
            raise SessionError(f"child is not accepting input: {exc}") from exc

    def send(self, text: str, delay: float = 0.02) -> None:
        if delay <= 0:
            self.write(text)
            return
        for token in _KEY_TOKENS.findall(text):
            self.write(token)
            time.sleep(delay)

    def screen_text(self) -> str:
        with self.lock:
            return self.term.text()

    def alive(self) -> bool:
        return self.proc.isalive()

    def wait_for(self, text: str, timeout: float) -> bool:
        deadline = time.monotonic() + timeout
        while True:
            if text in self.screen_text():
                return True
            if self.eof.is_set() or time.monotonic() >= deadline:
                return text in self.screen_text()
            time.sleep(POLL)

    def settle(self, quiet: float, limit: float = 5.0) -> None:
        """Wait until the screen stops changing; a spinner that never rests ends at the limit."""
        end = time.monotonic() + limit
        last, since = "", time.monotonic()
        while time.monotonic() < end:
            now = hashlib.sha1(self.screen_text().encode()).hexdigest()
            if now != last:
                last, since = now, time.monotonic()
            elif time.monotonic() - since >= quiet:
                return
            time.sleep(POLL)

    def resize(self, cols: int, rows: int) -> None:
        with self.lock:
            self.term.resize(cols, rows)
            self.cols, self.rows = cols, rows
        self.proc.setwinsize(rows, cols)

    def kill_tree(self) -> None:
        if self.proc.pid:
            subprocess.run(["taskkill", "/PID", str(self.proc.pid), "/T", "/F"], capture_output=True, timeout=15)

    def stop(self, grace: float = 5.0) -> None:
        """Let the child exit by itself, then kill its whole process tree."""
        deadline = time.monotonic() + grace
        while self.alive() and time.monotonic() < deadline:
            time.sleep(0.1)
        if self.alive():
            print("term_shot: child still running after the steps; killing its process tree", file=sys.stderr)
            self.kill_tree()
        try:
            self.proc.close(force=True)
        except OSError as exc:
            print(f"term_shot: pty close failed: {exc}", file=sys.stderr)
