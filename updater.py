"""Check GitHub Releases for a newer version of the app.

Set GITHUB_REPO below to your repo (e.g. 'csLamar12/business-tracker').
The check is best-effort: any network/HTTP error is swallowed and treated as
'no update available' so the app never blocks on it.
"""

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass

from version import __version__

# IMPORTANT: change this to your real GitHub repo before packaging.
# Format: "<owner>/<repo>". Works for both public and private repos as long as
# releases are visible (private repos require a GITHUB_TOKEN, see below).
GITHUB_REPO = "csLamar12/business-tracker"

# Optional. For private repos, set this to a GitHub personal access token with
# 'repo' scope. Leave None for public repos.
GITHUB_TOKEN = None

_API = "https://api.github.com/repos/{repo}/releases/latest"


@dataclass
class UpdateInfo:
    current: str
    latest: str
    html_url: str  # release page (browser-friendly)
    name: str
    notes: str

    @property
    def newer(self) -> bool:
        return _is_newer(self.latest, self.current)


def _normalize(v: str) -> tuple:
    """Parse 'v1.2.3' / '1.2.3-beta1' into a comparable tuple. Anything that
    doesn't parse becomes (0,) so 'unknown' versions never look newer."""
    v = v.strip().lstrip("vV")
    parts = re.split(r"[.\-+]", v)
    out = []
    for p in parts:
        if p.isdigit():
            out.append(int(p))
        else:
            # Pre-release strings (alpha, beta, rc) sort lower than numerics.
            out.append(-1)
            out.append(p)
    return tuple(out) if out else (0,)


def _is_newer(latest: str, current: str) -> bool:
    try:
        return _normalize(latest) > _normalize(current)
    except Exception:
        return False


def check(timeout: float = 5.0) -> UpdateInfo | None:
    """Return UpdateInfo if a release exists (newer or not), else None on error.
    Caller checks `.newer` to decide whether to show the banner.
    """
    if not GITHUB_REPO or "/" not in GITHUB_REPO:
        return None
    url = _API.format(repo=GITHUB_REPO)
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "BusinessTracker-Updater",
    })
    if GITHUB_TOKEN:
        req.add_header("Authorization", f"Bearer {GITHUB_TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError) as e:
        print(f"[updater] check failed: {e}")
        return None

    tag = (data.get("tag_name") or "").strip()
    if not tag:
        return None
    return UpdateInfo(
        current=__version__,
        latest=tag,
        html_url=data.get("html_url") or f"https://github.com/{GITHUB_REPO}/releases",
        name=data.get("name") or tag,
        notes=(data.get("body") or "")[:500],
    )
