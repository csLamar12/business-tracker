import queue
import threading
from contextlib import contextmanager
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
        fn, on_done, on_error = item
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


def submit_write(fn, on_done=None, on_error=None):
    """Queue `fn` to run on the background writer thread. UI thread returns
    instantly. on_done() (if provided) runs on the writer thread after a
    successful write — callers should marshal back to the Tk main thread
    via `widget.after(0, ...)` for any UI updates.
    """
    _start_writer()
    _increment_pending()
    _write_queue.put((fn, on_done, on_error))


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


def _query(sql, params=()):
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
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


# ---------- Profiles ----------

def list_profiles():
    with get_conn() as conn:
        return conn.execute("SELECT * FROM profiles ORDER BY name").fetchall()


def add_profile(name):
    name = name.strip()
    if not name:
        raise ValueError("profile name required")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO profiles (name) VALUES (?) "
            "ON CONFLICT(name) DO NOTHING",
            (name,),
        )


# ---------- Settings / FX ----------

def _get_setting(key, default):
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def _set_setting(key, value):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )


def get_display_currency():
    return _get_setting("display_currency", "USD")


def set_display_currency(currency):
    _set_setting("display_currency", currency)


def get_fx_rate():
    """JMD per 1 USD."""
    try:
        return float(_get_setting("fx_jmd_per_usd", DEFAULT_FX_RATE))
    except (TypeError, ValueError):
        return DEFAULT_FX_RATE


def set_fx_rate(rate):
    _set_setting("fx_jmd_per_usd", float(rate))


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

def add_business(name, parent_id=None):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO businesses (name, parent_id) VALUES (?, ?)",
            (name, parent_id),
        )
        return cur.lastrowid


def rename_business(business_id, name):
    with get_conn() as conn:
        conn.execute("UPDATE businesses SET name = ? WHERE id = ?", (name, business_id))


def delete_business(business_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM businesses WHERE id = ?", (business_id,))


def list_top_level():
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM businesses WHERE parent_id IS NULL ORDER BY name"
        ).fetchall()


def list_subsidiaries(parent_id):
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM businesses WHERE parent_id = ? ORDER BY name",
            (parent_id,),
        ).fetchall()


def get_business(business_id):
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM businesses WHERE id = ?", (business_id,)
        ).fetchone()


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
        conn.execute(
            "INSERT INTO income (business_id, date, source, amount, currency, notes, created_by, fx_rate) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (business_id, date, source, amount, currency, notes, created_by or "", fx_rate),
        )


def list_income(business_id):
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM income WHERE business_id = ? ORDER BY date DESC, id DESC",
            (business_id,),
        ).fetchall()


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
        conn.execute(
            "INSERT INTO expenses (business_id, date, category, amount, currency, notes, created_by, fx_rate) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (business_id, date, category, amount, currency, notes, created_by or "", fx_rate),
        )


def list_expenses(business_id):
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM expenses WHERE business_id = ? ORDER BY date DESC, id DESC",
            (business_id,),
        ).fetchall()


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
        conn.execute(
            "INSERT INTO plans (business_id, title, description, target_date, status, created_by) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (business_id, title, description, target_date, status, created_by or ""),
        )


def list_plans(business_id):
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM plans WHERE business_id = ? ORDER BY id DESC",
            (business_id,),
        ).fetchall()


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
