# Business Tracker

Cross-platform desktop app (Python + CustomTkinter) for tracking multiple businesses, their subsidiaries, income, expenses, plans, and current operating phase. Backed by [Turso](https://turso.tech) so multiple users share the same data.

> **Also in this repo:** [`schoolhub/`](schoolhub/README.md) — **SchoolHub Jamaica**, a multi-tenant Next.js website platform for Jamaican high schools (subdomain or custom-domain school sites + an admin CMS). It runs on anchorpointja.com during development and is independent of the desktop app below.

## Features

- Multiple top-level businesses, each with nested subsidiaries
- Income & expense entries per business, per-row currency (USD / JMD), global display-currency picker with FX rate
- Plans with status, target dates
- Current operating phase + free-text notes per business
- Inline cell editing (double-click any cell), date pickers, dropdowns
- Subsidiary totals roll up into parent dashboards
- Per-row audit: who created each entry (profile name)
- Persistent local profile (no expiring login)
- Background sync to Turso every 10s + push on every write
- In-app GitHub Releases update check with banner

## First-time setup

```bash
# 1. Get Tk bindings (macOS)
brew install python-tk@3.13

# 2. Clone + venv
git clone https://github.com/csLamar12/business-tracker.git
cd business-tracker
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 3. Configure Turso credentials
cp config.example.py config.py
# edit config.py with your TURSO_URL and TURSO_TOKEN

# 4. Run
.venv/bin/python main.py
```

On first launch you'll be prompted to pick or create a profile.

## Releasing a new version

1. Bump `__version__` in `version.py`
2. Build the Mac `.app` and Windows `.exe`
3. `git tag vX.Y.Z && git push --tags`
4. Create a GitHub Release at that tag, attach the binaries
5. Other clients see the update banner on next launch
