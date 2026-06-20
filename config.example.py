"""Copy this file to `config.py` and fill in your Turso credentials.
`config.py` is gitignored.

Get the URL + token from https://app.turso.tech/<your-org>/databases/<db>/overview
"""
import os

TURSO_URL = os.environ.get("TURSO_URL", "libsql://YOUR-DB-NAME.turso.io")
TURSO_TOKEN = os.environ.get("TURSO_TOKEN", "PASTE-YOUR-AUTH-TOKEN-HERE")

# ---- Outbound email (for @-mention notifications) ----
# Gmail: create an App Password (Google Account > Security > 2-Step Verification
# > App passwords). The regular account password will NOT work.
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USER = os.environ.get("SMTP_USER", "you@gmail.com")
SMTP_APP_PASSWORD = os.environ.get("SMTP_APP_PASSWORD", "your-16-char-app-password")
