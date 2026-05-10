"""Persistent local profile — which user is signed in on this machine.

The active profile name is written to a small JSON file in the OS-standard
app-data directory. Once set, it persists across launches forever (no expiry).
"""

import hashlib
import json
import os
import sys
from pathlib import Path


PALETTE = [
    "#1f6aa5",  # blue
    "#2e7d32",  # green
    "#a52a2a",  # red
    "#7b1fa2",  # purple
    "#ef6c00",  # orange
    "#00838f",  # teal
    "#5d4037",  # brown
    "#c62828",  # crimson
]


def _data_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "BusinessTracker"
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or str(Path.home())
        return Path(base) / "BusinessTracker"
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "BusinessTracker"


def _profile_file() -> Path:
    return _data_dir() / "profile.json"


def get_active() -> str | None:
    f = _profile_file()
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text()).get("name") or None
    except Exception:
        return None


def set_active(name: str) -> None:
    name = name.strip()
    if not name:
        raise ValueError("name required")
    d = _data_dir()
    d.mkdir(parents=True, exist_ok=True)
    _profile_file().write_text(json.dumps({"name": name}))


def clear_active() -> None:
    f = _profile_file()
    if f.exists():
        f.unlink()


def color_for(name: str) -> str:
    if not name:
        return "#555555"
    h = int(hashlib.md5(name.encode("utf-8")).hexdigest(), 16)
    return PALETTE[h % len(PALETTE)]
