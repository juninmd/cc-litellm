"""Pre-seed an isolated CLAUDE_CONFIG_DIR so Claude Code starts at the prompt, with no dialogs.

    python seed_claude_home.py HOME_DIR WORK_DIR

Writes HOME_DIR/.claude.json (theme, onboarding done, WORK_DIR trusted). Safe to re-run; it
merges into an existing file. Never point HOME_DIR at your real ~/.claude.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def seed(home: Path, work: Path) -> Path:
    home.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    path = home / ".claude.json"
    cfg = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    cfg.update({
        "theme": "dark",
        "hasCompletedOnboarding": True,
        "lastOnboardingVersion": "2.1.288",
        "autoUpdates": False,
        "numStartups": max(cfg.get("numStartups", 0), 5),
    })
    cfg.setdefault("projects", {})[work.resolve().as_posix()] = {
        "hasTrustDialogAccepted": True,
        "hasCompletedProjectOnboarding": True,
        # An ancestor CLAUDE.md that imports outside files would otherwise open a dialog.
        "hasClaudeMdExternalIncludesApproved": False,
        "hasClaudeMdExternalIncludesWarningShown": True,
        "allowedTools": [],
    }
    path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    return path


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    print(seed(Path(sys.argv[1]), Path(sys.argv[2])))
