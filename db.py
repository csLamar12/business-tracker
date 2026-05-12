import threading
from contextlib import contextmanager
from pathlib import Path

import libsql_experimental as libsql

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


def start_background_sync(interval_seconds=10, on_synced=None, on_error=None):
    """Periodically sync with remote so changes from other clients show up.
    on_synced(): invoked (from the sync thread) after each successful sync.
    on_error(exc, consecutive_failures): invoked when a sync attempt fails.

    Failures are exponentially backed off (max 5 minutes) and only logged on
    transitions, so a network blip doesn't flood the console.
    """
    global _sync_thread

    def _loop():
        wait = interval_seconds
        max_wait = 300
        failures = 0
        last_logged_failure = False
        while not _sync_stop.wait(wait):
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

    if _sync_thread is None:
        _sync_thread = threading.Thread(target=_loop, daemon=True)
        _sync_thread.start()


def stop_background_sync():
    _sync_stop.set()


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
    Writes are committed locally then synced to Turso on exit.
    """
    with _lock:
        conn = get_connection()
        shim = _ConnShim(conn)
        yield shim
        conn.commit()
        if shim.had_write:
            try:
                conn.sync()
            except Exception as e:
                print(f"[db.sync after write] {e}")


_WRITE_VERBS = ("INSERT", "UPDATE", "DELETE", "ALTER", "CREATE", "DROP", "REPLACE")


class _ConnShim:
    def __init__(self, conn):
        self._conn = conn
        self.had_write = False

    def execute(self, sql, params=()):
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
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
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
