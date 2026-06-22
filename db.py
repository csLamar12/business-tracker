import queue
import re
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import libsql

from config import TURSO_URL, TURSO_TOKEN

REPLICA_PATH = Path(__file__).parent / "replica.db"

_conn = None
_lock = threading.RLock()


def _connect():
    """Embedded replica: local file mirrors the remote Turso DB.
    Reads hit the local file (fast); writes go to remote and replicate back.
    """
    return libsql.connect(
        str(REPLICA_PATH),
        sync_url=TURSO_URL,
        auth_token=TURSO_TOKEN,
    )


def get_connection():
    global _conn
    with _lock:
        if _conn is None:
            _conn = _connect()
            _conn.sync()
            try:
                _conn.execute("PRAGMA foreign_keys = ON")
            except Exception:
                pass
        return _conn


def sync():
    """Pull remote changes + push local writes."""
    with _lock:
        try:
            get_connection().sync()
        except Exception as e:
            print(f"[db.sync] {e}")


_sync_thread = None
_sync_stop = threading.Event()
_sync_pending = threading.Event()  # set after a local write; wakes the loop


def schedule_sync():
    """Mark that there are unsynced writes. The background loop will pick this
    up on its next iteration (immediately, since it waits on the event)."""
    _sync_pending.set()


def flush_sync(timeout: float = 5.0) -> bool:
    """Force a sync now and block until done (or timeout). Called on app close
    so the last writes hit Turso before exit. Returns True on success."""
    try:
        with _lock:
            get_connection().sync()
        _sync_pending.clear()
        return True
    except Exception as e:
        print(f"[db.flush_sync] {e}")
        return False


def start_background_sync(interval_seconds=10, on_synced=None, on_error=None):
    """Periodically sync with remote so changes from other clients show up,
    AND pushes local writes promptly (within ~50ms) without blocking the UI.

    The loop waits on a Condition that is woken either by the periodic timer
    OR by schedule_sync() being called after a local write. This means saves
    are non-blocking from the UI's perspective: write locally, return
    immediately, sync happens shortly after on this background thread.

    Failures are exponentially backed off (max 5 minutes) and only logged on
    transitions, so a network blip doesn't flood the console.
    """
    global _sync_thread

    def _loop():
        wait = interval_seconds
        max_wait = 300
        failures = 0
        last_logged_failure = False
        while not _sync_stop.is_set():
            # Wake on pending-write event OR after the timeout.
            triggered = _sync_pending.wait(timeout=wait)
            if _sync_stop.is_set():
                break
            _sync_pending.clear()
            try:
                with _lock:
                    get_connection().sync()
                if failures > 0:
                    print(f"[db.background_sync] recovered after {failures} failures")
                failures = 0
                last_logged_failure = False
                wait = interval_seconds
                if on_synced:
                    on_synced()
            except Exception as e:
                failures += 1
                if not last_logged_failure:
                    print(f"[db.background_sync] sync error: {e}")
                    last_logged_failure = True
                if on_error:
                    try:
                        on_error(e, failures)
                    except Exception:
                        pass
                wait = min(max_wait, interval_seconds * (2 ** min(failures, 5)))
                # Re-mark pending so we retry on next loop instead of waiting
                # for the next user write.
                _sync_pending.set()

    if _sync_thread is None:
        _sync_thread = threading.Thread(target=_loop, daemon=True)
        _sync_thread.start()


def stop_background_sync():
    _sync_stop.set()
    _sync_pending.set()  # wake the loop so it can observe the stop flag


# ---------- Write worker ----------
#
# libsql's embedded replica forwards every write to the remote Turso primary
# synchronously. That makes `INSERT`/`UPDATE` calls take ~1s each over a
# typical home internet connection. If those run on the Tk main thread, the
# UI freezes for that whole second on every save.
#
# Solution: a single dedicated writer thread that drains a queue. The UI
# submits a write callable + an on-done callback, returns immediately, and
# keeps repainting / accepting input. Writes serialize through this thread
# so we never have two writes contending on the same connection.

_write_queue: "queue.Queue" = queue.Queue()
_writer_thread = None
_writer_stop = threading.Event()
_pending_writes = 0
_pending_lock = threading.Lock()
_on_pending_change = None  # optional callback(count) for UI indicators


def _writer_loop():
    while not _writer_stop.is_set():
        try:
            item = _write_queue.get(timeout=0.5)
        except queue.Empty:
            continue
        if item is None:
            break
        fn, on_done, on_error, silent = item
        try:
            fn()
        except Exception as e:
            print(f"[db.writer] {e}")
            if on_error:
                try:
                    on_error(e)
                except Exception:
                    pass
        else:
            if on_done:
                try:
                    on_done()
                except Exception:
                    pass
        finally:
            if not silent:
                _decrement_pending()


def _start_writer():
    global _writer_thread
    if _writer_thread is None:
        _writer_thread = threading.Thread(target=_writer_loop, daemon=True)
        _writer_thread.start()


def _increment_pending():
    global _pending_writes
    with _pending_lock:
        _pending_writes += 1
        count = _pending_writes
    if _on_pending_change:
        try:
            _on_pending_change(count)
        except Exception:
            pass


def _decrement_pending():
    global _pending_writes
    with _pending_lock:
        _pending_writes = max(0, _pending_writes - 1)
        count = _pending_writes
    if _on_pending_change:
        try:
            _on_pending_change(count)
        except Exception:
            pass


def set_pending_writes_callback(cb):
    """Register a callback invoked (from any thread) whenever the count of
    in-flight background writes changes. Use to drive a UI 'Saving...' indicator.
    """
    global _on_pending_change
    _on_pending_change = cb


def submit_write(fn, on_done=None, on_error=None, silent=False):
    """Queue `fn` to run on the background writer thread. UI thread returns
    instantly. on_done() (if provided) runs on the writer thread after a
    successful write — callers should marshal back to the Tk main thread
    via `widget.after(0, ...)` for any UI updates.

    silent=True omits this write from the "Saving..." pending counter — used
    for background housekeeping (e.g. presence heartbeats) that shouldn't flash
    a saving indicator on the user.
    """
    _start_writer()
    if not silent:
        _increment_pending()
    _write_queue.put((fn, on_done, on_error, silent))


def stop_writer():
    _writer_stop.set()
    _write_queue.put(None)


class Row:
    """sqlite3.Row-like wrapper around a tuple result, with column-name access."""
    __slots__ = ("_d",)

    def __init__(self, values, columns):
        self._d = dict(zip(columns, values))

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self._d.values())[key]
        return self._d[key]

    def __contains__(self, key):
        return key in self._d

    def keys(self):
        return list(self._d.keys())


# ---------- Read path ----------
#
# libsql's single connection + global _lock serializes EVERYTHING — reads,
# writes, AND the ~1s network sync(). So a UI read issued right after a save
# (which fires schedule_sync()) blocks behind the sync thread holding _lock for
# the whole network round-trip. That's the "app lags on every save" symptom.
#
# Fix: reads go to a SEPARATE, read-only plain-sqlite3 connection against the
# same replica.db file (WAL mode), which never touches _lock. WAL gives us a
# consistent last-committed snapshot without blocking the writer/sync. The
# connection is thread-local because writer-thread on_done callbacks also read.
_reader_local = threading.local()


def _get_reader():
    conn = getattr(_reader_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(
            f"file:{REPLICA_PATH}?mode=ro", uri=True,
            check_same_thread=False, timeout=5.0,
        )
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA query_only = ON")
        except sqlite3.Error:
            pass
        _reader_local.conn = conn
    return conn


def _query(sql, params=()):
    """Read via the lock-free thread-local sqlite3 reader. Falls back to the
    libsql connection on cold start (replica.db not yet materialized) or if the
    reader hits a transient error. Returns sqlite3.Row / Row objects — both
    support r["col"] and r.keys(), which is all callers rely on."""
    try:
        cur = _get_reader().execute(sql, params)
        return cur.fetchall()
    except sqlite3.Error:
        # Reset a possibly-broken reader so the next call reopens it.
        try:
            getattr(_reader_local, "conn", None) and _reader_local.conn.close()
        except sqlite3.Error:
            pass
        _reader_local.conn = None
        with _lock:
            cur = get_connection().execute(sql, params)
            cols = [d[0] for d in cur.description] if cur.description else []
            return [Row(r, cols) for r in cur.fetchall()]


def _query_one(sql, params=()):
    rows = _query(sql, params)
    return rows[0] if rows else None


def _execute(sql, params=()):
    with _lock:
        conn = get_connection()
        cur = conn.execute(sql, params)
        conn.commit()
        return cur


@contextmanager
def get_conn():
    """Compat shim — yields an object with .execute() that mirrors the old API.
    Writes are committed to the local replica only; the background sync thread
    pushes them to Turso shortly after (non-blocking, so the UI stays snappy).
    """
    with _lock:
        conn = get_connection()
        shim = _ConnShim(conn)
        yield shim
        conn.commit()
    if shim.had_write:
        schedule_sync()


_WRITE_VERBS = ("INSERT", "UPDATE", "DELETE", "ALTER", "CREATE", "DROP", "REPLACE")

# Safety rail: refuse bulk DELETE/DROP/TRUNCATE statements unless the caller
# explicitly sets BT_ALLOW_DESTRUCTIVE=1. The Tk app never issues these — only
# ad-hoc smoke tests / cleanup scripts do, and those have wiped real data in
# the past. Hard NO by default.
import os as _os
_ALLOW_DESTRUCTIVE = _os.environ.get("BT_ALLOW_DESTRUCTIVE") == "1"


def _is_destructive_bulk(sql: str) -> bool:
    s = sql.strip().upper()
    # Per-row updates/deletes that scope to a single id are fine; only block
    # statements that could wipe many rows.
    if s.startswith("DROP "):
        return True
    if s.startswith("TRUNCATE"):
        return True
    if s.startswith("DELETE FROM") and "WHERE" not in s:
        return True
    if s.startswith("UPDATE ") and "WHERE" not in s:
        return True
    return False


class _ConnShim:
    def __init__(self, conn):
        self._conn = conn
        self.had_write = False

    def execute(self, sql, params=()):
        if _is_destructive_bulk(sql) and not _ALLOW_DESTRUCTIVE:
            raise RuntimeError(
                "Refusing bulk destructive SQL (DELETE-all / UPDATE-all / "
                "DROP / TRUNCATE) against the shared Turso DB. If you really "
                "mean it, set BT_ALLOW_DESTRUCTIVE=1. SQL: "
                + sql.strip()[:120]
            )
        if sql.lstrip().upper().startswith(_WRITE_VERBS):
            self.had_write = True
        cur = self._conn.execute(sql, params)
        return _CursorShim(cur)

    def executescript(self, script):
        self.had_write = True
        try:
            self._conn.executescript(script)
        except AttributeError:
            for stmt in [s.strip() for s in script.split(";") if s.strip()]:
                self._conn.execute(stmt)


class _CursorShim:
    def __init__(self, cur):
        self._cur = cur
        self._cols = [d[0] for d in cur.description] if cur.description else []

    @property
    def lastrowid(self):
        return self._cur.lastrowid

    def fetchone(self):
        row = self._cur.fetchone()
        return Row(row, self._cols) if row else None

    def fetchall(self):
        return [Row(r, self._cols) for r in self._cur.fetchall()]

PHASES = [
    "Ideation",
    "Launch",
    "Growth",
    "Scaling",
    "Maintenance",
    "Wind-down",
]

PLAN_STATUSES = ["Not Started", "In Progress", "Done", "On Hold"]

CURRENCIES = ["USD", "JMD"]
DEFAULT_FX_RATE = 157.0  # JMD per 1 USD


SCHEMA = """
CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
    phase TEXT DEFAULT 'Ideation',
    phase_notes TEXT DEFAULT '',
    owner TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    source TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    fx_rate REAL,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    fx_rate REAL,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    target_date TEXT DEFAULT '',
    status TEXT DEFAULT 'Not Started'
);

CREATE TABLE IF NOT EXISTS profiles (
    name TEXT PRIMARY KEY,
    email TEXT DEFAULT '',
    last_seen TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS business_members (
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    profile TEXT NOT NULL,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (business_id, profile)
);

CREATE TABLE IF NOT EXISTS business_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    inviter TEXT NOT NULL,
    invitee TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    business_id INTEGER,
    created_by TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    seen INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unseen
    ON notifications(recipient, seen);

CREATE TABLE IF NOT EXISTS mention_state (
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    field TEXT NOT NULL,
    profile TEXT NOT NULL,
    notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entity_type, entity_id, field, profile)
);
"""


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        # Migrate older DBs that pre-date the currency column.
        for table in ("income", "expenses"):
            try:
                conn.execute(
                    f"ALTER TABLE {table} ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'"
                )
            except Exception:
                pass
        # Migrate to add the created_by audit column on transactional tables.
        for table in ("income", "expenses", "plans"):
            try:
                conn.execute(
                    f"ALTER TABLE {table} ADD COLUMN created_by TEXT DEFAULT ''"
                )
            except Exception:
                pass
        # Migrate to add the locked-in fx_rate column on currency tables.
        for table in ("income", "expenses"):
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN fx_rate REAL")
            except Exception:
                pass
        # Snapshot FX rate at time of entry — historical conversions stay
        # frozen at the rate that was active when the row was created.
        for table in ("income", "expenses"):
            try:
                conn.execute(
                    f"ALTER TABLE {table} ADD COLUMN fx_rate REAL"
                )
            except Exception:
                pass
        # Collaboration / privacy columns (mentions, presence, ownership).
        for ddl in (
            "ALTER TABLE profiles ADD COLUMN email TEXT DEFAULT ''",
            "ALTER TABLE profiles ADD COLUMN last_seen TEXT DEFAULT ''",
            "ALTER TABLE businesses ADD COLUMN owner TEXT DEFAULT ''",
        ):
            try:
                conn.execute(ddl)
            except Exception:
                pass


# ---------- Profiles ----------

def list_profiles():
    return _query("SELECT * FROM profiles ORDER BY name")


def add_profile(name, email=""):
    name = name.strip()
    if not name:
        raise ValueError("profile name required")
    email = (email or "").strip()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO profiles (name, email) VALUES (?, ?) "
            "ON CONFLICT(name) DO NOTHING",
            (name, email),
        )
        # Set the email on first registration even if the row already existed
        # but had no email (e.g. profile created on another machine).
        if email:
            conn.execute(
                "UPDATE profiles SET email = ? WHERE name = ? AND (email IS NULL OR email = '')",
                (email, name),
            )


def get_profile(name):
    return _query_one("SELECT * FROM profiles WHERE name = ?", (name,))


def list_profiles_full():
    """Profiles with email + presence, for pickers and online/offline dots."""
    return _query(
        "SELECT name, email, last_seen, created_at FROM profiles ORDER BY name"
    )


def set_profile_email(name, email):
    with get_conn() as conn:
        conn.execute(
            "UPDATE profiles SET email = ? WHERE name = ?",
            ((email or "").strip(), name),
        )


def get_profile_email(name):
    row = _query_one("SELECT email FROM profiles WHERE name = ?", (name,))
    return (row["email"] if row else "") or ""


# ---------- Presence ----------

def _utcnow_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def touch_presence(name):
    """Heartbeat: stamp the active profile's last_seen. Commits locally but
    deliberately does NOT schedule_sync() — otherwise a heartbeat would wake the
    sync loop, which would heartbeat again, in a tight storm. Presence rides the
    next periodic sync instead. Safe to call from the sync thread."""
    if not name:
        return
    with _lock:
        conn = get_connection()
        conn.execute(
            "UPDATE profiles SET last_seen = ? WHERE name = ?",
            (_utcnow_iso(), name),
        )
        conn.commit()


def is_online(last_seen_iso, window_seconds=45):
    """A profile is online if it heartbeated within `window_seconds`
    (> 4x the 10s sync interval, so one slow/missed sync doesn't flap)."""
    if not last_seen_iso:
        return False
    try:
        ts = datetime.strptime(last_seen_iso, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc
        )
    except (ValueError, TypeError):
        return False
    return (datetime.now(timezone.utc) - ts).total_seconds() <= window_seconds


# ---------- Settings / FX ----------

# Transient in-memory override for settings the user just changed. Holds the new
# value for the ~1-2s until the background write persists, so currency/FX-rate
# changes apply to the UI INSTANTLY instead of freezing on the remote write.
_settings_override = {}


def _get_setting(key, default):
    if key in _settings_override:
        return _settings_override[key]
    row = _query_one("SELECT value FROM settings WHERE key = ?", (key,))
    return row["value"] if row else default


def _set_setting(key, value):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )


def _set_setting_optimistic(key, value):
    """Apply a setting instantly (in-memory) and persist in the background.
    Returns immediately — never blocks the UI on the ~1.8s remote write."""
    _settings_override[key] = str(value)

    def _persist():
        _set_setting(key, value)
        # DB is now authoritative; drop the override so remote changes win.
        _settings_override.pop(key, None)

    submit_write(_persist, silent=True)


def get_display_currency():
    return _get_setting("display_currency", "USD")


def set_display_currency(currency):
    _set_setting_optimistic("display_currency", currency)


def get_fx_rate():
    """JMD per 1 USD."""
    try:
        return float(_get_setting("fx_jmd_per_usd", DEFAULT_FX_RATE))
    except (TypeError, ValueError):
        return DEFAULT_FX_RATE


def set_fx_rate(rate):
    _set_setting_optimistic("fx_jmd_per_usd", float(rate))


def convert(amount, from_curr, to_curr, rate=None):
    if from_curr == to_curr:
        return amount
    r = rate if rate is not None else get_fx_rate()
    if from_curr == "USD" and to_curr == "JMD":
        return amount * r
    if from_curr == "JMD" and to_curr == "USD":
        return amount / r
    return amount


# ---------- Businesses ----------

def add_business(name, parent_id=None, owner=""):
    # Only top-level businesses carry an owner; subsidiaries inherit access
    # from their root (they're only reachable through a visible parent).
    owner = (owner or "") if parent_id is None else ""
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO businesses (name, parent_id, owner) VALUES (?, ?, ?)",
            (name, parent_id, owner),
        )
        return cur.lastrowid


# ---------- Ownership / access / sharing ----------

def root_business_id(business_id):
    """Walk parent_id up to the top-level business."""
    seen = set()
    bid = business_id
    while bid is not None and bid not in seen:
        seen.add(bid)
        row = _query_one("SELECT parent_id FROM businesses WHERE id = ?", (bid,))
        if row is None or row["parent_id"] is None:
            return bid
        bid = row["parent_id"]
    return bid


def get_owner(business_id):
    row = _query_one(
        "SELECT owner FROM businesses WHERE id = ?", (root_business_id(business_id),)
    )
    return (row["owner"] if row else "") or ""


def set_owner(business_id, owner):
    root = root_business_id(business_id)
    with get_conn() as conn:
        conn.execute("UPDATE businesses SET owner = ? WHERE id = ?", (owner, root))


def list_unowned_top_level():
    return _query(
        "SELECT * FROM businesses WHERE parent_id IS NULL "
        "AND (owner = '' OR owner IS NULL) ORDER BY name"
    )


def add_member(business_id, profile):
    root = root_business_id(business_id)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO business_members (business_id, profile) VALUES (?, ?) "
            "ON CONFLICT(business_id, profile) DO NOTHING",
            (root, profile),
        )


def remove_member(business_id, profile):
    root = root_business_id(business_id)
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM business_members WHERE business_id = ? AND profile = ?",
            (root, profile),
        )


def list_members(business_id):
    """Profiles with access to a business (owner + accepted members), at root."""
    root = root_business_id(business_id)
    owner = get_owner(root)
    members = [
        r["profile"]
        for r in _query(
            "SELECT profile FROM business_members WHERE business_id = ?", (root,)
        )
    ]
    out = []
    if owner:
        out.append(owner)
    for m in members:
        if m not in out:
            out.append(m)
    return out


def has_access(business_id, profile):
    root = root_business_id(business_id)
    row = _query_one("SELECT owner FROM businesses WHERE id = ?", (root,))
    if row is None:
        return False
    owner = (row["owner"] or "")
    if owner == "" or owner == profile:
        # Unowned/legacy businesses are visible to everyone; owner always has access.
        return True
    member = _query_one(
        "SELECT 1 FROM business_members WHERE business_id = ? AND profile = ?",
        (root, profile),
    )
    return member is not None


def list_top_level_for(profile):
    """Top-level businesses the profile can see: ones they own, ones they're a
    member of, OR legacy unowned ones (owner='' ⇒ visible to all). The legacy
    rule is the migration-safety net so nobody loses data the instant they
    update, before the one-time owner-assignment screen runs."""
    return _query(
        "SELECT * FROM businesses WHERE parent_id IS NULL AND ("
        "  owner = '' OR owner IS NULL OR owner = ? "
        "  OR id IN (SELECT business_id FROM business_members WHERE profile = ?)"
        ") ORDER BY name",
        (profile, profile),
    )


def rename_business(business_id, name):
    with get_conn() as conn:
        conn.execute("UPDATE businesses SET name = ? WHERE id = ?", (name, business_id))


def delete_business(business_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM businesses WHERE id = ?", (business_id,))


def list_top_level():
    return _query("SELECT * FROM businesses WHERE parent_id IS NULL ORDER BY name")


def list_subsidiaries(parent_id):
    # No profile filter: if you can see the parent (root), you inherit all subs.
    return _query(
        "SELECT * FROM businesses WHERE parent_id = ? ORDER BY name",
        (parent_id,),
    )


def get_business(business_id):
    return _query_one("SELECT * FROM businesses WHERE id = ?", (business_id,))


def update_phase(business_id, phase, notes):
    with get_conn() as conn:
        conn.execute(
            "UPDATE businesses SET phase = ?, phase_notes = ? WHERE id = ?",
            (phase, notes, business_id),
        )


# ---------- Income ----------

def add_income(business_id, date, source, amount, currency, notes, created_by="", fx_rate=None):
    if fx_rate is None:
        fx_rate = get_fx_rate()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO income (business_id, date, source, amount, currency, notes, created_by, fx_rate) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (business_id, date, source, amount, currency, notes, created_by or "", fx_rate),
        )
        return cur.lastrowid


def list_income(business_id):
    return _query(
        "SELECT * FROM income WHERE business_id = ? ORDER BY date DESC, id DESC",
        (business_id,),
    )


def delete_income(income_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM income WHERE id = ?", (income_id,))


_INCOME_FIELDS = {"date", "source", "amount", "currency", "notes", "fx_rate"}


def update_income(income_id, field, value):
    if field not in _INCOME_FIELDS:
        raise ValueError(f"cannot edit {field}")
    with get_conn() as conn:
        conn.execute(f"UPDATE income SET {field} = ? WHERE id = ?", (value, income_id))


def total_income(business_id, display_currency=None):
    if display_currency is None:
        display_currency = get_display_currency()
    fallback = get_fx_rate()
    rows = list_income(business_id)
    return sum(
        convert(r["amount"], r["currency"], display_currency, r["fx_rate"] or fallback)
        for r in rows
    )


# ---------- Expenses ----------

def add_expense(business_id, date, category, amount, currency, notes, created_by="", fx_rate=None):
    if fx_rate is None:
        fx_rate = get_fx_rate()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO expenses (business_id, date, category, amount, currency, notes, created_by, fx_rate) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (business_id, date, category, amount, currency, notes, created_by or "", fx_rate),
        )
        return cur.lastrowid


def list_expenses(business_id):
    return _query(
        "SELECT * FROM expenses WHERE business_id = ? ORDER BY date DESC, id DESC",
        (business_id,),
    )


def delete_expense(expense_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))


_EXPENSE_FIELDS = {"date", "category", "amount", "currency", "notes", "fx_rate"}


def update_expense(expense_id, field, value):
    if field not in _EXPENSE_FIELDS:
        raise ValueError(f"cannot edit {field}")
    with get_conn() as conn:
        conn.execute(f"UPDATE expenses SET {field} = ? WHERE id = ?", (value, expense_id))


def total_expenses(business_id, display_currency=None):
    if display_currency is None:
        display_currency = get_display_currency()
    fallback = get_fx_rate()
    rows = list_expenses(business_id)
    return sum(
        convert(r["amount"], r["currency"], display_currency, r["fx_rate"] or fallback)
        for r in rows
    )


def total_income_with_subs(business_id, display_currency=None):
    total = total_income(business_id, display_currency)
    for sub in list_subsidiaries(business_id):
        total += total_income(sub["id"], display_currency)
    return total


def total_expenses_with_subs(business_id, display_currency=None):
    total = total_expenses(business_id, display_currency)
    for sub in list_subsidiaries(business_id):
        total += total_expenses(sub["id"], display_currency)
    return total


# ---------- Plans ----------

def add_plan(business_id, title, description, target_date, status, created_by=""):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO plans (business_id, title, description, target_date, status, created_by) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (business_id, title, description, target_date, status, created_by or ""),
        )
        return cur.lastrowid


def list_plans(business_id):
    return _query(
        "SELECT * FROM plans WHERE business_id = ? ORDER BY id DESC",
        (business_id,),
    )


def update_plan_status(plan_id, status):
    with get_conn() as conn:
        conn.execute("UPDATE plans SET status = ? WHERE id = ?", (status, plan_id))


_PLAN_FIELDS = {"title", "description", "target_date", "status"}


def update_plan(plan_id, field, value):
    if field not in _PLAN_FIELDS:
        raise ValueError(f"cannot edit {field}")
    with get_conn() as conn:
        conn.execute(f"UPDATE plans SET {field} = ? WHERE id = ?", (value, plan_id))


def delete_plan(plan_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM plans WHERE id = ?", (plan_id,))


# ---------- Invitations ----------

def create_invite(business_id, inviter, invitee):
    """Owner invites a profile to a (root) business. Refuses a duplicate pending
    invite and no-ops if the invitee already has access. Returns the invite id,
    or None if nothing was created."""
    root = root_business_id(business_id)
    if not invitee or invitee == inviter:
        return None
    if has_access(root, invitee):
        return None
    existing = _query_one(
        "SELECT id FROM business_invites WHERE business_id = ? AND invitee = ? "
        "AND status = 'pending'",
        (root, invitee),
    )
    if existing is not None:
        return existing["id"]
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO business_invites (business_id, inviter, invitee) "
            "VALUES (?, ?, ?)",
            (root, inviter, invitee),
        )
        return cur.lastrowid


def get_invite(invite_id):
    return _query_one("SELECT * FROM business_invites WHERE id = ?", (invite_id,))


def list_incoming_invites(profile):
    return _query(
        "SELECT bi.*, b.name AS business_name FROM business_invites bi "
        "JOIN businesses b ON b.id = bi.business_id "
        "WHERE bi.invitee = ? AND bi.status = 'pending' ORDER BY bi.id DESC",
        (profile,),
    )


def list_outgoing_invites(profile):
    return _query(
        "SELECT bi.*, b.name AS business_name FROM business_invites bi "
        "JOIN businesses b ON b.id = bi.business_id "
        "WHERE bi.inviter = ? AND bi.status = 'pending' ORDER BY bi.id DESC",
        (profile,),
    )


def list_pending_invitees(business_id):
    root = root_business_id(business_id)
    return [
        r["invitee"]
        for r in _query(
            "SELECT invitee FROM business_invites WHERE business_id = ? "
            "AND status = 'pending'",
            (root,),
        )
    ]


def accept_invite(invite_id):
    """Invitee accepts: grant membership at root + notify the inviter. Returns
    the invite Row (so the caller can refresh)."""
    inv = get_invite(invite_id)
    if inv is None or inv["status"] != "pending":
        return inv
    with get_conn() as conn:
        conn.execute(
            "UPDATE business_invites SET status = 'accepted', resolved_at = ? WHERE id = ?",
            (_utcnow_iso(), invite_id),
        )
    add_member(inv["business_id"], inv["invitee"])
    biz = get_business(inv["business_id"])
    enqueue_notification(
        recipient=inv["inviter"], kind="invite_accepted",
        title=f"{inv['invitee']} accepted your invite",
        body=f"{inv['invitee']} now has access to {biz['name'] if biz else 'a business'}.",
        business_id=inv["business_id"], created_by=inv["invitee"],
    )
    return inv


def decline_invite(invite_id):
    inv = get_invite(invite_id)
    if inv is None or inv["status"] != "pending":
        return inv
    with get_conn() as conn:
        conn.execute(
            "UPDATE business_invites SET status = 'declined', resolved_at = ? WHERE id = ?",
            (_utcnow_iso(), invite_id),
        )
    return inv


# ---------- Notifications (cross-machine toast delivery) ----------

def enqueue_notification(recipient, kind, title, body="", business_id=None, created_by=""):
    if not recipient:
        return None
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO notifications (recipient, kind, title, body, business_id, created_by) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (recipient, kind, title, body or "", business_id, created_by or ""),
        )
        return cur.lastrowid


def list_unseen_notifications(profile):
    if not profile:
        return []
    return _query(
        "SELECT * FROM notifications WHERE recipient = ? AND seen = 0 ORDER BY id",
        (profile,),
    )


def list_recent_notifications(profile, limit=20):
    if not profile:
        return []
    return _query(
        "SELECT * FROM notifications WHERE recipient = ? ORDER BY id DESC LIMIT ?",
        (profile, int(limit)),
    )


def mark_notifications_seen(ids):
    ids = [int(i) for i in (ids or [])]
    if not ids:
        return
    placeholders = ",".join("?" for _ in ids)
    with get_conn() as conn:
        conn.execute(
            f"UPDATE notifications SET seen = 1 WHERE id IN ({placeholders})",
            tuple(ids),
        )


# ---------- Mentions ----------

MENTION_ENTITY_TYPES = {"income", "expense", "plan", "phase"}


def parse_mentions(text, profile_names):
    """Return the subset of profile_names that appear as @<name> in text.

    Matches longest names first and *masks* each matched span so a shorter name
    can't also match inside it — otherwise '@Anna Maria' would wrongly match
    both 'Anna Maria' and 'Anna'. A trailing word boundary keeps '@Ann' from
    matching profile 'Anna', and '@Anna' from matching 'Annabelle'."""
    if not text:
        return set()
    found = set()
    work = text
    for name in sorted([n for n in profile_names if n], key=len, reverse=True):
        # No word char before '@' so emails (notify@Lamar.com) aren't mentions.
        pattern = r"(?<!\w)@" + re.escape(name) + r"(?!\w)"
        matched = False
        out = []
        last = 0
        for m in re.finditer(pattern, work, flags=re.IGNORECASE):
            matched = True
            out.append(work[last:m.start()])
            out.append(" " * (m.end() - m.start()))  # blank the @name span
            last = m.end()
        if matched:
            found.add(name)
            out.append(work[last:])
            work = "".join(out)
    return found


def newly_mentioned(entity_type, entity_id, field, text):
    """Names @-mentioned in `text` that haven't already been notified for this
    note location (so re-saving / editing the same note doesn't re-notify)."""
    names = [p["name"] for p in list_profiles_full()]
    present = parse_mentions(text, names)
    if not present:
        return []
    already = {
        r["profile"]
        for r in _query(
            "SELECT profile FROM mention_state WHERE entity_type = ? AND entity_id = ? AND field = ?",
            (entity_type, entity_id, field),
        )
    }
    return [n for n in present if n not in already]


def record_mentions(entity_type, entity_id, field, names):
    if not names:
        return
    with get_conn() as conn:
        for name in names:
            conn.execute(
                "INSERT INTO mention_state (entity_type, entity_id, field, profile) "
                "VALUES (?, ?, ?, ?) "
                "ON CONFLICT(entity_type, entity_id, field, profile) DO NOTHING",
                (entity_type, entity_id, field, name),
            )
