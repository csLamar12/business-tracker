"""Offline tests for the collaboration/privacy features.

Runs the new db.py logic against a throwaway WAL sqlite file instead of the
real Turso DB, so it never touches production data or the network.

Run:  .venv/bin/python tests/test_features.py
"""

import os
import sqlite3
import sys
import tempfile
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db  # noqa: E402


def _fresh_db():
    tmp = os.path.join(tempfile.mkdtemp(), "test.db")
    w = sqlite3.connect(tmp, check_same_thread=False)
    w.execute("PRAGMA journal_mode=WAL")
    w.commit()
    db._conn = w               # writes bypass libsql
    db.REPLICA_PATH = tmp      # reader reads same file
    db._reader_local = threading.local()
    db.init_db()               # real schema + ALTER migrations (matches prod)
    return tmp


def test_parse_mentions():
    names = ["Ann", "Anna", "Anna Maria", "Lamar", "Bob", "Annabelle"]
    cases = {
        "hey @Anna Maria and @Lamar": {"Anna Maria", "Lamar"},
        "ping @Anna please": {"Anna"},
        "just @Ann here": {"Ann"},
        "lowercase @bob": {"Bob"},
        "nothing here": set(),
        "@Anna Maria": {"Anna Maria"},
        "hi @Annabelle": {"Annabelle"},
        "@Ann and @Anna and @Anna Maria": {"Ann", "Anna", "Anna Maria"},
        "notify@Lamar.com is an email": set(),
        "someone@example.com": set(),
    }
    for text, expect in cases.items():
        got = db.parse_mentions(text, names)
        assert got == expect, f"{text!r}: got {got}, expected {expect}"
    print("parse_mentions OK")


def test_presence():
    _fresh_db()
    db.add_profile("Lamar", "lamar@x.com")
    db.touch_presence("Lamar")
    assert db.is_online(db.get_profile("Lamar")["last_seen"]) is True
    assert db.is_online("") is False
    assert db.is_online("2000-01-01T00:00:00Z") is False
    print("presence OK")


def test_ownership_and_sharing():
    _fresh_db()
    db.add_profile("Lamar", "lamar@x.com")
    db.add_profile("Anna", "anna@x.com")

    bid = db.add_business("AnchorPoint", owner="Lamar")
    sub = db.add_business("Sub Co", parent_id=bid, owner="Lamar")
    assert db.get_owner(bid) == "Lamar"
    assert db.root_business_id(sub) == bid

    assert [b["name"] for b in db.list_top_level_for("Lamar")] == ["AnchorPoint"]
    assert db.list_top_level_for("Anna") == []
    assert db.has_access(bid, "Lamar") and not db.has_access(bid, "Anna")
    assert [s["name"] for s in db.list_subsidiaries(bid)] == ["Sub Co"]

    # legacy (unowned) businesses are visible to everyone
    db.add_business("Legacy", owner="")
    assert "Legacy" in [b["name"] for b in db.list_top_level_for("Anna")]

    # invite via a subsidiary resolves to the root; dup pending is a no-op;
    # self-invite is refused
    inv = db.create_invite(sub, "Lamar", "Anna")
    assert inv and "Anna" in db.list_pending_invitees(bid)
    assert db.create_invite(bid, "Lamar", "Anna") == inv
    assert db.create_invite(bid, "Lamar", "Lamar") is None

    db.accept_invite(inv)
    assert db.has_access(bid, "Anna")
    assert "AnchorPoint" in [b["name"] for b in db.list_top_level_for("Anna")]
    assert any(n["kind"] == "invite_accepted"
               for n in db.list_recent_notifications("Lamar"))
    print("ownership/sharing OK")


def test_notifications_and_mention_dedupe():
    _fresh_db()
    db.add_profile("Anna")
    db.add_profile("Bob")
    db.add_profile("Lamar")

    db.enqueue_notification("Bob", "mention", "title", "body")
    unseen = db.list_unseen_notifications("Bob")
    assert len(unseen) == 1
    db.mark_notifications_seen([unseen[0]["id"]])
    assert db.list_unseen_notifications("Bob") == []

    first = db.newly_mentioned("income", 1, "notes", "hi @Anna and @Bob")
    assert set(first) == {"Anna", "Bob"}
    db.record_mentions("income", 1, "notes", first)
    # re-saving with the same names + one new name only fires the new one
    again = db.newly_mentioned("income", 1, "notes", "hi @Anna @Bob @Lamar")
    assert again == ["Lamar"]
    print("notifications/mention dedupe OK")


def test_mention_widget():
    """The @-mention popup accepts via Return/Tab and suppresses the host's
    own Return handler while the suggestion list is open. Skipped without a
    display."""
    import tkinter as tk
    try:
        root = tk.Tk()
    except Exception:
        print("mention_widget SKIPPED (no display)")
        return
    root.withdraw()
    from mentions_ui import MentionAutocomplete
    top = tk.Toplevel(root)
    e = tk.Entry(top); e.pack(); e.focus_force()
    mac = MentionAutocomplete(e, lambda: ["Lamar", "Anna"])
    commits = []
    e.bind("<Return>", lambda _e: commits.append(e.get()), add="+")
    root.update()

    e.insert(0, "@La"); e.icursor("end")
    e.event_generate("<KeyRelease>", keysym="a"); root.update()
    assert mac._visible()
    e.event_generate("<Return>", keysym="Return"); root.update()
    assert e.get() == "@Lamar ", e.get()       # mention inserted
    assert commits == []                        # host Return suppressed
    e.event_generate("<Return>", keysym="Return"); root.update()
    assert commits == ["@Lamar "]               # commits once popup closed
    root.destroy()
    print("mention_widget OK")


if __name__ == "__main__":
    test_parse_mentions()
    test_presence()
    test_ownership_and_sharing()
    test_notifications_and_mention_dedupe()
    test_mention_widget()
    print("\nALL TESTS PASSED")
