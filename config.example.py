"""Copy this file to `config.py` and fill in your Turso credentials.
`config.py` is gitignored.

Get the URL + token from https://app.turso.tech/<your-org>/databases/<db>/overview
"""
import os

TURSO_URL = os.environ.get("TURSO_URL", "libsql://YOUR-DB-NAME.turso.io")
TURSO_TOKEN = os.environ.get("TURSO_TOKEN", "PASTE-YOUR-AUTH-TOKEN-HERE")
