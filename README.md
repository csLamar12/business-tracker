# Business Tracker

Cross-platform desktop app (Python + CustomTkinter) for tracking multiple businesses, their subsidiaries, income, expenses, plans, and current operating phase. Backed by [Turso](https://turso.tech) so multiple users share the same data.

## Features

- Multiple top-level businesses, each with nested subsidiaries
- Income & expense entries per business, per-row currency (USD / JMD), global display-currency picker with FX rate
- Plans with status, target dates
- Current operating phase + free-text notes per business
- Inline cell editing (double-click any cell), date pickers, dropdowns
- Subsidiary totals roll up into parent dashboards
- Per-row audit: who created each entry (profile name)
- Persistent local profile (no expiring login)
- **@-mentions** in any notes field — type `@` to mention a profile; they get an
  email + a desktop/tray notification + an in-app alert
- **Profile emails + online/offline presence** (green/gray dots)
- **Per-business privacy + sharing** — each business has an owner; invite another
  profile to a specific business (they Accept in-app to get the same full access)
- Live overview that updates when another client changes data
- Background sync to Turso every 10s + push on every write (reads are lock-free,
  so the UI never stalls while a sync is in flight)
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

# 3. Configure Turso credentials (+ email for @-mention alerts)
cp config.example.py config.py
# edit config.py with your TURSO_URL and TURSO_TOKEN
# for @-mention emails, set SMTP_USER + SMTP_APP_PASSWORD (Gmail App Password).
# Leave the password blank to disable email — in-app + desktop alerts still work.

# 4. Run
.venv/bin/python main.py
```

On first launch you'll be prompted to pick or create a profile (with an optional
email). After this update you'll also get a one-time screen to assign an owner to
each existing business — until you do, existing businesses stay visible to
everyone, so nothing disappears.

### Email setup (Gmail App Password)

`SMTP_USER`/`SMTP_APP_PASSWORD` live in `config.py` (gitignored) or env vars.
Gmail requires an **App Password** (Google Account → Security → 2-Step
Verification → App passwords), not your normal password. Set it via:

```bash
export SMTP_APP_PASSWORD="xxxx xxxx xxxx xxxx"
```

## Releasing a new version

1. Bump `__version__` in `version.py`
2. Build the Mac `.app` and Windows `.exe`
3. `git tag vX.Y.Z && git push --tags`
4. Create a GitHub Release at that tag, attach the binaries
5. Other clients see the update banner on next launch
