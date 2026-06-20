"""Outbound notifications: transactional email (Gmail SMTP) + native desktop
toasts. No Tk imports — safe to call from the background writer thread.

Everything here is best-effort: a failure (no network, bad creds, missing
notifier binary) is swallowed and reported via the return value, never raised
into the writer loop where it would abort a database write.
"""

import shutil
import smtplib
import ssl
import subprocess
import sys
from email.message import EmailMessage

import config


def _cfg(name, default=""):
    return getattr(config, name, default)


def email_configured() -> bool:
    return bool(_cfg("SMTP_USER") and _cfg("SMTP_APP_PASSWORD"))


def send_email(to_addr, subject, body) -> bool:
    """Send a plain-text email via Gmail SMTP over SSL. Returns True on success,
    False if there's no recipient / no SMTP config / any send error."""
    if not to_addr or not email_configured():
        return False
    msg = EmailMessage()
    msg["From"] = _cfg("SMTP_USER")
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        ctx = ssl.create_default_context()
        host = _cfg("SMTP_HOST", "smtp.gmail.com")
        port = int(_cfg("SMTP_PORT", 465) or 465)
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
            s.login(_cfg("SMTP_USER"), _cfg("SMTP_APP_PASSWORD"))
            s.send_message(msg)
        return True
    except Exception as e:  # noqa: BLE001 — best-effort, never propagate
        print(f"[notify.send_email] {e}")
        return False


def desktop_notify(title, message) -> bool:
    """Best-effort native desktop/tray notification. No third-party dep on
    macOS/Linux; uses the optional `winotify` (lazily) on Windows with a
    PowerShell fallback. Returns True if a notifier was invoked."""
    title = str(title or "")
    message = str(message or "")
    try:
        if sys.platform == "darwin":
            t = title.replace("\\", "\\\\").replace('"', '\\"')
            m = message.replace("\\", "\\\\").replace('"', '\\"')
            subprocess.run(
                ["osascript", "-e",
                 f'display notification "{m}" with title "{t}"'],
                timeout=5, check=False,
            )
            return True
        if sys.platform == "win32":
            try:
                from winotify import Notification
                Notification(app_id="Business Tracker",
                             title=title, msg=message).show()
                return True
            except Exception:
                # PowerShell BurntToast-free fallback via balloon tip.
                safe_t = title.replace("'", "''")
                safe_m = message.replace("'", "''")
                ps = (
                    "Add-Type -AssemblyName System.Windows.Forms;"
                    "$n=New-Object System.Windows.Forms.NotifyIcon;"
                    "$n.Icon=[System.Drawing.SystemIcons]::Information;"
                    "$n.Visible=$true;"
                    f"$n.ShowBalloonTip(5000,'{safe_t}','{safe_m}',"
                    "[System.Windows.Forms.ToolTipIcon]::Info)"
                )
                subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                               timeout=6, check=False)
                return True
        # Linux / other: notify-send if present.
        if shutil.which("notify-send"):
            subprocess.run(["notify-send", title, message], timeout=5, check=False)
            return True
    except Exception as e:  # noqa: BLE001
        print(f"[notify.desktop_notify] {e}")
    return False
