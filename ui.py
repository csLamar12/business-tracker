import tkinter as tk
import customtkinter as ctk
from tkinter import ttk, messagebox
from datetime import date, datetime
from tkcalendar import Calendar as _RawCalendar

import threading
import webbrowser

import db
import notify
import profile as user_profile
import updater
from mentions_ui import MentionAutocomplete
from version import __version__


# Profiles whose @-mention has a fresh notification fired on save. Used by the
# add/edit pipelines; runs on the writer thread so the UI never blocks.
def process_mentions(entity_type, entity_id, field, text, business_id, author):
    """Detect newly-@-mentioned profiles in `text` and, for each, enqueue a
    cross-machine notification + send an email. Dedupes via mention_state so
    re-saving the same note doesn't re-notify. Safe to call off the UI thread."""
    try:
        new_names = db.newly_mentioned(entity_type, entity_id, field, text or "")
    except Exception as e:
        print(f"[mentions] detect failed: {e}")
        return
    if not new_names:
        return
    db.record_mentions(entity_type, entity_id, field, new_names)
    biz = db.get_business(business_id) if business_id else None
    bizname = biz["name"] if biz else "a business"
    label = {"income": "income note", "expense": "expense note",
             "plan": "plan", "phase": "phase notes"}.get(entity_type, entity_type)
    for name in new_names:
        if name == author:
            continue  # don't notify yourself
        try:
            db.enqueue_notification(
                recipient=name, kind="mention",
                title=f"{author} mentioned you",
                body=f"In {bizname} ({label}): {(text or '').strip()[:200]}",
                business_id=business_id, created_by=author,
            )
        except Exception as e:
            print(f"[mentions] enqueue failed: {e}")
        email = db.get_profile_email(name)
        if email:
            notify.send_email(
                email,
                subject=f"[Business Tracker] {author} mentioned you in {bizname}",
                body=(f"{author} mentioned you in {bizname} ({label}).\n\n"
                      f"{(text or '').strip()}\n\n"
                      f"— Open Business Tracker to view."),
            )


def mention_names():
    """Profile names available to @-mention (best-effort; never raises)."""
    try:
        return [p["name"] for p in db.list_profiles_full()]
    except Exception:
        return []


class _CalendarModal(ctk.CTkToplevel):
    """Modal date picker. Shows a tkcalendar.Calendar inside a CTkToplevel
    we control (instead of tkcalendar.DateEntry's flaky popup Toplevel,
    which renders broken in CTk+macOS).
    """

    def __init__(self, master, initial: date, on_pick):
        super().__init__(master)
        self.title("Pick a date")
        self.geometry("320x320")
        self.resizable(False, False)
        self.transient(master.winfo_toplevel())
        try:
            self.grab_set()
        except Exception:
            pass
        self.on_pick = on_pick

        self._cal = _RawCalendar(
            self, selectmode="day",
            year=initial.year, month=initial.month, day=initial.day,
            date_pattern="yyyy-mm-dd",
            background="#1f6aa5", foreground="white",
            selectbackground="#1f6aa5", selectforeground="white",
            normalbackground="#2b2b2b", normalforeground="white",
            weekendbackground="#2b2b2b", weekendforeground="#cccccc",
            othermonthbackground="#1f1f1f", othermonthforeground="gray50",
            headersbackground="#1f1f1f", headersforeground="white",
            bordercolor="#1f1f1f",
        )
        self._cal.pack(fill="both", expand=True, padx=10, pady=10)
        self._cal.bind("<<CalendarSelected>>", lambda _e: None)
        self._cal.bind("<Double-1>", lambda _e: self._ok())

        btns = ctk.CTkFrame(self, fg_color="transparent")
        btns.pack(fill="x", padx=10, pady=(0, 10))
        ctk.CTkButton(btns, text="Cancel", fg_color="gray30",
                      width=80, command=self.destroy).pack(side="right", padx=4)
        ctk.CTkButton(btns, text="OK", width=80, command=self._ok).pack(side="right", padx=4)

        self.bind("<Return>", lambda _e: self._ok())
        self.bind("<Escape>", lambda _e: self.destroy())

        # Ensure we're actually visible + focused on macOS.
        self.update_idletasks()
        self.lift()
        self.focus_force()

    def _ok(self):
        try:
            value = self._cal.selection_get()  # returns datetime.date
        except Exception:
            value = date.today()
        try:
            self.on_pick(value)
        finally:
            self.destroy()


class DateEntry(ctk.CTkButton):
    """API-compatible drop-in for tkcalendar.DateEntry: get_date() / set_date().
    Click opens a modal _CalendarModal. Replaces the flaky tkcalendar popup.
    """

    def __init__(self, master, date_pattern="yyyy-mm-dd", width=110, height=28,
                 **kwargs):
        # Discard tkcalendar-specific kwargs we don't use.
        for k in ("background", "foreground", "borderwidth", "date_pattern"):
            kwargs.pop(k, None)
        self._date = date.today()
        super().__init__(
            master,
            text=self._date.isoformat(),
            width=width, height=height,
            fg_color="#1f6aa5", hover_color="#144870",
            anchor="w",
            command=self._open_picker,
            **kwargs,
        )

    def get_date(self) -> date:
        return self._date

    def set_date(self, d):
        if isinstance(d, str):
            try:
                d = date.fromisoformat(d.strip())
            except Exception:
                d = date.today()
        self._date = d
        try:
            self.configure(text=d.isoformat())
        except Exception:
            pass

    def get(self) -> str:
        """tkcalendar parity — return the date as the formatted string."""
        return self._date.isoformat()

    def _open_picker(self):
        _CalendarModal(self, self._date, on_pick=self.set_date)


ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")


CURRENCY_SYMBOL = {"USD": "$", "JMD": "J$"}


def fmt_money(v, currency="USD"):
    return f"{CURRENCY_SYMBOL.get(currency, '')}{v:,.2f} {currency}"


def _fmt_edit(field, value):
    """Format an edited value for optimistic in-table display (amount/rate get
    thousands separators like the refresh() rows; everything else as-is)."""
    if field in ("amount", "fx_rate"):
        try:
            return f"{float(value):,.2f}"
        except (TypeError, ValueError):
            return value
    return value


class BusinessForm(ctk.CTkToplevel):
    """Modal for adding a new business or subsidiary."""

    def __init__(self, master, parent_id=None, on_save=None):
        super().__init__(master)
        self.parent_id = parent_id
        self.on_save = on_save
        self.title("New Subsidiary" if parent_id else "New Business")
        self.geometry("400x180")
        self.transient(master)
        self.grab_set()

        ctk.CTkLabel(self, text="Name", anchor="w").pack(fill="x", padx=20, pady=(20, 4))
        self.name_entry = ctk.CTkEntry(self, placeholder_text="e.g. AnchorPoint Systems")
        self.name_entry.pack(fill="x", padx=20)
        self.name_entry.focus()

        btn_row = ctk.CTkFrame(self, fg_color="transparent")
        btn_row.pack(fill="x", padx=20, pady=20)
        ctk.CTkButton(btn_row, text="Cancel", fg_color="gray30", command=self.destroy).pack(
            side="right", padx=(8, 0)
        )
        ctk.CTkButton(btn_row, text="Create", command=self._save).pack(side="right")

        self.bind("<Return>", lambda _e: self._save())

    def _save(self):
        name = self.name_entry.get().strip()
        if not name:
            messagebox.showwarning("Missing name", "Please enter a name.", parent=self)
            return
        owner = user_profile.get_active() or ""
        pid = self.parent_id
        on_save = self.on_save
        master = self.master  # survives self.destroy(), used to marshal on_done
        db.submit_write(
            lambda: db.add_business(name, pid, owner=owner),
            on_done=(lambda: master.after(0, on_save)) if on_save else None,
        )
        self.destroy()


class ProfilePicker(ctk.CTkToplevel):
    """Modal: pick an existing profile from Turso, or create a new one.
    Used on first launch and when switching profile.
    """

    def __init__(self, master, on_pick, allow_cancel=False):
        super().__init__(master)
        self.on_pick = on_pick
        self.allow_cancel = allow_cancel
        self.title("Choose Profile")
        self.geometry("400x460")
        self.transient(master)
        self.grab_set()
        if not allow_cancel:
            self.protocol("WM_DELETE_WINDOW", lambda: None)

        ctk.CTkLabel(
            self, text="Who's using this app?",
            font=ctk.CTkFont(size=18, weight="bold"),
        ).pack(pady=(20, 4), padx=20, anchor="w")
        ctk.CTkLabel(
            self, text="Pick an existing profile or create a new one.",
            text_color="gray60",
        ).pack(padx=20, anchor="w")

        self.list_frame = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.list_frame.pack(fill="both", expand=True, padx=20, pady=12)

        # New-profile section
        new_row = ctk.CTkFrame(self)
        new_row.pack(fill="x", padx=20, pady=(0, 12))
        ctk.CTkLabel(new_row, text="New profile:").pack(
            anchor="w", padx=12, pady=(8, 0)
        )
        self.new_entry = ctk.CTkEntry(new_row, placeholder_text="Name (e.g. Lamar)")
        self.new_entry.pack(fill="x", padx=12, pady=(6, 0))
        email_row = ctk.CTkFrame(new_row, fg_color="transparent")
        email_row.pack(fill="x", padx=8, pady=8)
        self.new_email = ctk.CTkEntry(
            email_row, placeholder_text="Email (for @-mention alerts)")
        self.new_email.pack(side="left", fill="x", expand=True, padx=4)
        ctk.CTkButton(email_row, text="Create", width=80,
                      command=self._create).pack(side="right", padx=4)
        self.new_entry.bind("<Return>", lambda _e: self.new_email.focus())
        self.new_email.bind("<Return>", lambda _e: self._create())

        if allow_cancel:
            ctk.CTkButton(self, text="Cancel", fg_color="gray30",
                          command=self.destroy).pack(pady=(0, 12))

        self._refresh_profiles()
        self.new_entry.focus()

    def _refresh_profiles(self):
        for w in self.list_frame.winfo_children():
            w.destroy()
        try:
            profiles = db.list_profiles_full()
        except Exception as e:
            ctk.CTkLabel(self.list_frame,
                         text=f"Couldn't load profiles: {e}",
                         text_color="#ef5350", justify="left").pack(padx=8, pady=8)
            return
        if not profiles:
            ctk.CTkLabel(self.list_frame,
                         text="No profiles yet. Create one below.",
                         text_color="gray60").pack(padx=8, pady=12)
            return
        for p in profiles:
            name = p["name"]
            color = user_profile.color_for(name)
            online = db.is_online(p["last_seen"])
            row = ctk.CTkFrame(self.list_frame, fg_color="transparent")
            row.pack(fill="x", pady=3)
            # Presence dot (green online / gray offline) + identity color dot.
            ctk.CTkLabel(row, text="●",
                         text_color="#2e7d32" if online else "#555555",
                         font=ctk.CTkFont(size=14)).pack(side="left", padx=(8, 0))
            ctk.CTkLabel(row, text="●", text_color=color,
                         font=ctk.CTkFont(size=18)).pack(side="left", padx=(2, 4))
            ctk.CTkButton(
                row, text=name, anchor="w", height=34,
                fg_color="transparent", hover_color="#1f6aa5",
                command=lambda n=name: self._pick(n),
            ).pack(side="left", fill="x", expand=True, padx=4)

    def _create(self):
        name = self.new_entry.get().strip()
        if not name:
            messagebox.showwarning("Missing name", "Enter a profile name.", parent=self)
            return
        email = self.new_email.get().strip()
        # Persist in the background; the active profile is tracked locally so we
        # don't need to block on the ~1.8s remote write to proceed.
        db.submit_write(lambda: db.add_profile(name, email))
        self._pick(name)

    def _pick(self, name):
        user_profile.set_active(name)
        self.on_pick(name)
        self.destroy()


def send_invite(business_id, inviter, invitee):
    """Create a pending invite + notify/email the invitee. Runs on the writer
    thread (called inside submit_write). Returns nothing; best-effort."""
    invite_id = db.create_invite(business_id, inviter, invitee)
    if not invite_id:
        return
    biz = db.get_business(business_id)
    bizname = biz["name"] if biz else "a business"
    db.enqueue_notification(
        recipient=invitee, kind="invite",
        title=f"{inviter} invited you to {bizname}",
        body=f'{inviter} shared "{bizname}" with you. Open the bell to Accept.',
        business_id=business_id, created_by=inviter,
    )
    email = db.get_profile_email(invitee)
    if email:
        notify.send_email(
            email,
            subject=f"[Business Tracker] {inviter} shared {bizname} with you",
            body=(f'{inviter} invited you to access "{bizname}" in Business '
                  f"Tracker.\n\nOpen the app and click the bell icon to Accept."),
        )


class InvitePicker(ctk.CTkToplevel):
    """Pick a profile to invite to a specific business (owner-initiated share)."""

    def __init__(self, master, business_id, business_name):
        super().__init__(master)
        self.business_id = business_id
        self.business_name = business_name
        self.title(f"Share “{business_name}”")
        self.geometry("400x460")
        self.transient(master.winfo_toplevel())
        self.grab_set()

        ctk.CTkLabel(
            self, text=f"Invite someone to “{business_name}”",
            font=ctk.CTkFont(size=16, weight="bold"), wraplength=360, justify="left",
        ).pack(pady=(20, 2), padx=20, anchor="w")
        ctk.CTkLabel(
            self, text="They'll get the same full access once they accept.",
            text_color="gray60",
        ).pack(padx=20, anchor="w")

        self.list_frame = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.list_frame.pack(fill="both", expand=True, padx=20, pady=12)

        ctk.CTkButton(self, text="Close", fg_color="gray30",
                      command=self.destroy).pack(pady=(0, 12))

        self._optimistic_pending = set()
        self.update_idletasks()
        self.lift()
        self.focus_force()
        self._refresh()

    def _refresh(self):
        for w in self.list_frame.winfo_children():
            w.destroy()
        me = user_profile.get_active() or ""
        members = set(db.list_members(self.business_id))
        pending = set(db.list_pending_invitees(self.business_id)) | self._optimistic_pending
        try:
            profiles = db.list_profiles_full()
        except Exception as e:
            ctk.CTkLabel(self.list_frame, text=f"Couldn't load profiles: {e}",
                         text_color="#ef5350").pack(padx=8, pady=8)
            return
        shown = 0
        for p in profiles:
            name = p["name"]
            if name == me or name in members:
                continue
            shown += 1
            online = db.is_online(p["last_seen"])
            row = ctk.CTkFrame(self.list_frame, fg_color="transparent")
            row.pack(fill="x", pady=3)
            ctk.CTkLabel(row, text="●",
                         text_color="#2e7d32" if online else "#555555",
                         font=ctk.CTkFont(size=14)).pack(side="left", padx=(8, 2))
            ctk.CTkLabel(row, text=name, anchor="w").pack(
                side="left", fill="x", expand=True, padx=6)
            if name in pending:
                ctk.CTkLabel(row, text="Invited ⏳", text_color="gray60").pack(
                    side="right", padx=8)
            else:
                ctk.CTkButton(
                    row, text="Invite", width=72, height=28,
                    command=lambda n=name: self._invite(n),
                ).pack(side="right", padx=4)
        if shown == 0:
            ctk.CTkLabel(self.list_frame,
                         text="Everyone already has access or is invited.",
                         text_color="gray60").pack(padx=8, pady=12)

    def _invite(self, invitee):
        inviter = user_profile.get_active() or ""
        bid = self.business_id
        self._optimistic_pending.add(invitee)
        db.submit_write(lambda: send_invite(bid, inviter, invitee))
        self._refresh()


class Sidebar(ctk.CTkFrame):
    """Left-hand list of businesses + subsidiaries."""

    def __init__(self, master, on_select):
        super().__init__(master, width=260, corner_radius=0)
        self.on_select = on_select
        self.pack_propagate(False)

        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=16, pady=(16, 8))
        ctk.CTkLabel(
            header, text="Businesses", font=ctk.CTkFont(size=18, weight="bold")
        ).pack(side="left")

        ctk.CTkButton(
            self,
            text="+ Add Business",
            command=self._add_top_level,
            height=32,
        ).pack(fill="x", padx=16, pady=(0, 8))

        self.scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.scroll.pack(fill="both", expand=True, padx=8, pady=8)

        self.selected_id = None
        self.refresh()

    def _add_top_level(self):
        BusinessForm(self, parent_id=None, on_save=self.refresh)

    def _add_subsidiary(self, parent_id):
        BusinessForm(self, parent_id=parent_id, on_save=self.refresh)

    def refresh(self):
        for w in self.scroll.winfo_children():
            w.destroy()

        active = user_profile.get_active() or ""
        top = db.list_top_level_for(active)
        if not top:
            ctk.CTkLabel(
                self.scroll,
                text="No businesses yet.\nClick '+ Add Business' to start.",
                text_color="gray60",
                justify="left",
            ).pack(padx=8, pady=20)
            return

        for biz in top:
            self._render_business(biz, depth=0)
            for sub in db.list_subsidiaries(biz["id"]):
                self._render_business(sub, depth=1)

    def _render_business(self, biz, depth):
        row = ctk.CTkFrame(self.scroll, fg_color="transparent")
        row.pack(fill="x", padx=(8 + depth * 16, 8), pady=2)

        is_selected = self.selected_id == biz["id"]
        btn = ctk.CTkButton(
            row,
            text=("↳ " if depth else "") + biz["name"],
            anchor="w",
            height=32,
            fg_color="#1f6aa5" if is_selected else "transparent",
            hover_color="#144870",
            text_color=("white" if is_selected else None),
            command=lambda b=biz: self._select(b["id"]),
        )
        btn.pack(side="left", fill="x", expand=True)

        if depth == 0:
            add_btn = ctk.CTkButton(
                row,
                text="+",
                width=28,
                height=32,
                fg_color="gray30",
                hover_color="gray40",
                command=lambda b=biz: self._add_subsidiary(b["id"]),
            )
            add_btn.pack(side="right", padx=(4, 0))

            # Owner-only Share button — invite another profile to this business.
            active = user_profile.get_active() or ""
            owner = biz["owner"] if "owner" in biz.keys() else ""
            if owner == active and owner != "":
                ctk.CTkButton(
                    row, text="⤷", width=28, height=32,
                    fg_color="gray30", hover_color="#1f6aa5",
                    command=lambda b=biz: InvitePicker(self, b["id"], b["name"]),
                ).pack(side="right", padx=(4, 0))

    def _select(self, business_id):
        self.selected_id = business_id
        self.refresh()
        self.on_select(business_id)


class DataTable(ctk.CTkFrame):
    """Reusable ttk.Treeview wrapper with optional inline cell editing.

    columns: list of (key, label, width)
    editable: dict of col_key -> {"type": "text"|"number"|"date"|"options",
                                  "options": [...] (for options type)}
    on_edit: callable(row_id, col_key, new_value)
    on_delete: callable(row_id)
    """

    def __init__(self, master, columns, on_delete=None, editable=None, on_edit=None,
                 mention_cols=None, get_mention_names=None):
        super().__init__(master, fg_color="transparent")
        self.columns = columns
        self.col_keys = [c[0] for c in columns]
        self.editable = editable or {}
        self.on_edit = on_edit
        self.on_delete = on_delete
        self.mention_cols = set(mention_cols or ())
        self.get_mention_names = get_mention_names

        style = ttk.Style()
        style.theme_use("default")
        style.configure(
            "Treeview",
            background="#2b2b2b",
            foreground="white",
            fieldbackground="#2b2b2b",
            rowheight=28,
            borderwidth=0,
        )
        style.configure(
            "Treeview.Heading",
            background="#1f1f1f",
            foreground="white",
            relief="flat",
        )
        style.map("Treeview", background=[("selected", "#1f6aa5")])

        self.tree = ttk.Treeview(
            self, columns=self.col_keys, show="headings", height=10
        )
        for key, label, width in columns:
            self.tree.heading(key, text=label)
            self.tree.column(key, width=width, anchor="w")
        self.tree.pack(side="left", fill="both", expand=True)

        sb = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")

        self._raw_by_id = {}
        self._editor = None

        if on_delete:
            self.tree.bind("<Delete>", self._handle_delete)
            self.tree.bind("<BackSpace>", self._handle_delete)
        if self.editable and self.on_edit:
            self.tree.bind("<Double-1>", self._on_double_click)

    def is_editing(self):
        return self._editor is not None

    # ---------- optimistic updates ----------
    # Apply a change to the visible table instantly; the real background write
    # reconciles via the next refresh(). Keeps the UI "snappy" despite ~1.8s
    # remote writes.

    def _item_for(self, row_id):
        for item in self.tree.get_children():
            try:
                if int(self.tree.set(item, "id")) == int(row_id):
                    return item
            except (ValueError, tk.TclError):
                continue
        return None

    def optimistic_update(self, row_id, col_key, value):
        item = self._item_for(row_id)
        if item is not None:
            try:
                self.tree.set(item, col_key, value)
            except tk.TclError:
                return
            if row_id in self._raw_by_id:
                self._raw_by_id[row_id][col_key] = value

    def optimistic_delete(self, row_id):
        item = self._item_for(row_id)
        if item is not None:
            try:
                self.tree.delete(item)
            except tk.TclError:
                pass
            self._raw_by_id.pop(row_id, None)

    def optimistic_insert(self, values):
        try:
            self.tree.insert("", 0, values=values)
        except tk.TclError:
            pass

    def _handle_delete(self, _e):
        sel = self.tree.selection()
        if not sel:
            return
        row_id = int(self.tree.item(sel[0])["values"][0])
        if messagebox.askyesno("Delete", "Delete this entry?"):
            self.on_delete(row_id)

    def set_rows(self, rows, raw_rows=None):
        self._cancel_edit()
        for r in self.tree.get_children():
            self.tree.delete(r)
        for row in rows:
            self.tree.insert("", "end", values=row)
        self._raw_by_id = {}
        if raw_rows:
            for r in raw_rows:
                # sqlite3.Row supports keys()
                self._raw_by_id[r["id"]] = {k: r[k] for k in r.keys()}

    # ---------- inline editing ----------

    def _cancel_edit(self):
        if self._editor is not None:
            try:
                self._editor.destroy()
            except tk.TclError:
                pass
            self._editor = None

    def _on_double_click(self, event):
        region = self.tree.identify("region", event.x, event.y)
        if region != "cell":
            return
        col_id = self.tree.identify_column(event.x)  # "#1", "#2", ...
        item = self.tree.identify_row(event.y)
        if not item or not col_id:
            return
        try:
            idx = int(col_id.replace("#", "")) - 1
        except ValueError:
            return
        if idx < 0 or idx >= len(self.col_keys):
            return
        col_key = self.col_keys[idx]
        cfg = self.editable.get(col_key)
        if not cfg:
            return

        bbox = self.tree.bbox(item, col_id)
        if not bbox:
            return
        x, y, w, h = bbox
        try:
            row_id = int(self.tree.set(item, "id"))
        except (ValueError, tk.TclError):
            return
        raw = self._raw_by_id.get(row_id, {})
        current = raw.get(col_key, self.tree.set(item, col_key))
        self._begin_edit(item, col_key, cfg, x, y, w, h, row_id, current)

    def _begin_edit(self, item, col_key, cfg, x, y, w, h, row_id, current):
        self._cancel_edit()
        kind = cfg["type"]

        if kind == "options":
            editor = ttk.Combobox(
                self.tree, values=cfg["options"], state="readonly"
            )
            editor.set(str(current) if current is not None else "")
            editor.place(x=x, y=y, width=w, height=h)
            editor.focus_set()
            editor.bind("<<ComboboxSelected>>",
                        lambda _e: self._commit(editor, row_id, col_key, kind))
            editor.bind("<Escape>", lambda _e: self._cancel_edit())
        elif kind == "date":
            # Date columns get a modal calendar picker (no in-cell widget).
            # On OK, commit straight away via on_edit; on Cancel, do nothing.
            try:
                initial = date.fromisoformat(str(current))
            except Exception:
                initial = date.today()

            def _commit_date(picked):
                if self.on_edit:
                    self.on_edit(row_id, col_key, picked.isoformat())

            _CalendarModal(self.tree, initial, on_pick=_commit_date)
            self._editor = None
            return
        else:
            editor = tk.Entry(self.tree, bg="#3a3a3a", fg="white",
                              insertbackground="white", relief="flat")
            editor.insert(0, "" if current is None else str(current))
            editor.place(x=x, y=y, width=w, height=h)
            editor.focus_set()
            editor.select_range(0, "end")
            # @-mention autocomplete on note/description columns. Attach BEFORE
            # the commit bindings, and bind commits with add="+", so the popup's
            # Return/Escape/FocusOut handlers run first and can consume the key
            # (return "break") when the suggestion list is open.
            if col_key in self.mention_cols and self.get_mention_names:
                MentionAutocomplete(editor, self.get_mention_names)
            editor.bind("<Return>",
                        lambda _e: self._commit(editor, row_id, col_key, kind),
                        add="+")
            editor.bind("<FocusOut>",
                        lambda _e: self._commit(editor, row_id, col_key, kind),
                        add="+")
            editor.bind("<Escape>", lambda _e: self._cancel_edit(), add="+")

        self._editor = editor

    def _commit(self, editor, row_id, col_key, kind):
        if editor is not self._editor:
            return
        try:
            if kind == "number":
                raw = editor.get().strip()
                if raw == "":
                    self._cancel_edit()
                    return
                value = float(raw)
            else:
                value = editor.get()
        except (ValueError, tk.TclError):
            messagebox.showwarning("Invalid value", "Could not save: invalid value.")
            self._cancel_edit()
            return
        self._cancel_edit()
        if self.on_edit:
            self.on_edit(row_id, col_key, value)


class IncomeTab(ctk.CTkFrame):
    def __init__(self, master, business_id):
        super().__init__(master, fg_color="transparent")
        self.business_id = business_id

        form = ctk.CTkFrame(self)
        form.pack(fill="x", padx=12, pady=12)

        ctk.CTkLabel(form, text="Date").grid(row=0, column=0, padx=8, pady=(8, 0), sticky="w")
        self.date_entry = DateEntry(form, date_pattern="yyyy-mm-dd",
                                    background="#1f6aa5", foreground="white",
                                    borderwidth=0, width=12)
        self.date_entry.set_date(date.today())
        self.date_entry.grid(row=1, column=0, padx=8, pady=(0, 8))

        self.source_entry = self._labeled(form, "Source", 1)
        self.amount_entry = self._labeled(form, "Amount", 2, width=120)

        ctk.CTkLabel(form, text="Currency").grid(row=0, column=3, padx=8, pady=(8, 0), sticky="w")
        self.currency_var = ctk.StringVar(value=db.get_display_currency())
        ctk.CTkOptionMenu(form, values=db.CURRENCIES, variable=self.currency_var, width=90).grid(
            row=1, column=3, padx=8, pady=(0, 8)
        )

        self.notes_entry = self._labeled(form, "Notes (@ to mention)", 4)
        MentionAutocomplete(self.notes_entry._entry, mention_names)

        ctk.CTkButton(form, text="Add Income", command=self._add).grid(
            row=0, column=5, rowspan=2, padx=12, pady=8, sticky="ns"
        )

        self.total_label = ctk.CTkLabel(
            self, text="Total: $0.00", font=ctk.CTkFont(size=14, weight="bold")
        )
        self.total_label.pack(anchor="w", padx=16)

        self.table = DataTable(
            self,
            [("id", "ID", 50), ("date", "Date", 110), ("source", "Source", 160),
             ("amount", "Amount", 90), ("currency", "Cur", 55),
             ("fx_rate", "Rate", 70),
             ("converted", "In " + db.get_display_currency(), 115),
             ("notes", "Notes", 180), ("created_by", "By", 90)],
            on_delete=self._delete,
            editable={
                "date": {"type": "date"},
                "source": {"type": "text"},
                "amount": {"type": "number"},
                "currency": {"type": "options", "options": db.CURRENCIES},
                "fx_rate": {"type": "number"},
                "notes": {"type": "text"},
            },
            on_edit=self._edit,
            mention_cols={"notes"},
            get_mention_names=mention_names,
        )
        self.table.pack(fill="both", expand=True, padx=12, pady=12)

        self.refresh()

    def _labeled(self, parent, label, col, default="", width=160):
        ctk.CTkLabel(parent, text=label).grid(row=0, column=col, padx=8, pady=(8, 0), sticky="w")
        e = ctk.CTkEntry(parent, width=width)
        e.grid(row=1, column=col, padx=8, pady=(0, 8))
        if default:
            e.insert(0, default)
        return e

    def _add(self):
        try:
            amount = float(self.amount_entry.get())
        except ValueError:
            messagebox.showwarning("Invalid amount", "Amount must be a number.")
            return
        source = self.source_entry.get().strip()
        if not source:
            messagebox.showwarning("Missing source", "Please enter a source.")
            return
        # Snapshot form values, clear form, dispatch write off the UI thread.
        bid = self.business_id
        date_val = self.date_entry.get_date().isoformat()
        currency = self.currency_var.get()
        notes = self.notes_entry.get().strip()
        profile_name = user_profile.get_active() or ""
        self.source_entry.delete(0, "end")
        self.amount_entry.delete(0, "end")
        self.notes_entry.delete(0, "end")

        # Optimistic row so the entry appears instantly; the background write
        # reconciles (real id + converted total) on refresh ~1-2s later.
        display = db.get_display_currency()
        fx = db.get_fx_rate()
        conv = fmt_money(db.convert(amount, currency, display, fx), display)
        self.table.optimistic_insert(
            ("…", date_val, source, f"{amount:,.2f}", currency, f"{fx:,.2f}",
             conv, notes, profile_name or "—"))

        def work():
            new_id = db.add_income(bid, date_val, source, amount, currency, notes, profile_name)
            process_mentions("income", new_id, "notes", notes, bid, profile_name)

        db.submit_write(work, on_done=lambda: self.after(0, self.refresh),
                        on_error=lambda _e: self.after(0, self.refresh))

    def _delete(self, row_id):
        self.table.optimistic_delete(row_id)
        db.submit_write(
            lambda: db.delete_income(row_id),
            on_done=lambda: self.after(0, self.refresh),
            on_error=lambda _e: self.after(0, self.refresh),
        )

    def _edit(self, row_id, field, value):
        bid = self.business_id
        author = user_profile.get_active() or ""
        self.table.optimistic_update(row_id, field, _fmt_edit(field, value))

        def work():
            db.update_income(row_id, field, value)
            if field == "notes":
                process_mentions("income", row_id, "notes", value, bid, author)

        db.submit_write(work, on_done=lambda: self.after(0, self.refresh),
                        on_error=lambda _e: self.after(0, self.refresh))

    def refresh(self):
        display = db.get_display_currency()
        fallback = db.get_fx_rate()
        rows = db.list_income(self.business_id)
        self.table.tree.heading("converted", text="In " + display)
        self.table.set_rows(
            [
                (
                    r["id"], r["date"], r["source"],
                    f"{r['amount']:,.2f}", r["currency"],
                    f"{(r['fx_rate'] or fallback):,.2f}",
                    fmt_money(
                        db.convert(r["amount"], r["currency"], display,
                                   r["fx_rate"] or fallback),
                        display,
                    ),
                    r["notes"], r["created_by"] or "—",
                )
                for r in rows
            ],
            raw_rows=rows,
        )
        self.total_label.configure(
            text=f"Total: {fmt_money(db.total_income(self.business_id, display), display)}"
        )
        self._sig = self._signature()

    def _signature(self):
        display = db.get_display_currency()
        rows = db.list_income(self.business_id)
        return (display, db.get_fx_rate(), tuple(
            (r["id"], r["date"], r["source"], r["amount"], r["currency"],
             r["fx_rate"], r["notes"], r["created_by"]) for r in rows))

    def live_refresh(self):
        # Repaint on remote sync only when (a) no cell is being edited and
        # (b) the data actually changed — otherwise we'd clear selection/scroll
        # and flicker the table every sync tick.
        if self.table.is_editing():
            return
        sig = self._signature()
        if sig == getattr(self, "_sig", None):
            return
        self._sig = sig
        self.refresh()


class ExpenseTab(ctk.CTkFrame):
    def __init__(self, master, business_id):
        super().__init__(master, fg_color="transparent")
        self.business_id = business_id

        form = ctk.CTkFrame(self)
        form.pack(fill="x", padx=12, pady=12)

        ctk.CTkLabel(form, text="Date").grid(row=0, column=0, padx=8, pady=(8, 0), sticky="w")
        self.date_entry = DateEntry(form, date_pattern="yyyy-mm-dd",
                                    background="#1f6aa5", foreground="white",
                                    borderwidth=0, width=12)
        self.date_entry.set_date(date.today())
        self.date_entry.grid(row=1, column=0, padx=8, pady=(0, 8))

        self.category_entry = self._labeled(form, "Category", 1)
        self.amount_entry = self._labeled(form, "Amount", 2, width=120)

        ctk.CTkLabel(form, text="Currency").grid(row=0, column=3, padx=8, pady=(8, 0), sticky="w")
        self.currency_var = ctk.StringVar(value=db.get_display_currency())
        ctk.CTkOptionMenu(form, values=db.CURRENCIES, variable=self.currency_var, width=90).grid(
            row=1, column=3, padx=8, pady=(0, 8)
        )

        self.notes_entry = self._labeled(form, "Notes (@ to mention)", 4)
        MentionAutocomplete(self.notes_entry._entry, mention_names)

        ctk.CTkButton(form, text="Add Expense", command=self._add).grid(
            row=0, column=5, rowspan=2, padx=12, pady=8, sticky="ns"
        )

        self.total_label = ctk.CTkLabel(
            self, text="Total: $0.00", font=ctk.CTkFont(size=14, weight="bold")
        )
        self.total_label.pack(anchor="w", padx=16)

        self.table = DataTable(
            self,
            [("id", "ID", 50), ("date", "Date", 110), ("category", "Category", 160),
             ("amount", "Amount", 90), ("currency", "Cur", 55),
             ("fx_rate", "Rate", 70),
             ("converted", "In " + db.get_display_currency(), 115),
             ("notes", "Notes", 180), ("created_by", "By", 90)],
            on_delete=self._delete,
            editable={
                "date": {"type": "date"},
                "category": {"type": "text"},
                "amount": {"type": "number"},
                "currency": {"type": "options", "options": db.CURRENCIES},
                "fx_rate": {"type": "number"},
                "notes": {"type": "text"},
            },
            on_edit=self._edit,
            mention_cols={"notes"},
            get_mention_names=mention_names,
        )
        self.table.pack(fill="both", expand=True, padx=12, pady=12)

        self.refresh()

    def _labeled(self, parent, label, col, default="", width=160):
        ctk.CTkLabel(parent, text=label).grid(row=0, column=col, padx=8, pady=(8, 0), sticky="w")
        e = ctk.CTkEntry(parent, width=width)
        e.grid(row=1, column=col, padx=8, pady=(0, 8))
        if default:
            e.insert(0, default)
        return e

    def _add(self):
        try:
            amount = float(self.amount_entry.get())
        except ValueError:
            messagebox.showwarning("Invalid amount", "Amount must be a number.")
            return
        category = self.category_entry.get().strip()
        if not category:
            messagebox.showwarning("Missing category", "Please enter a category.")
            return
        bid = self.business_id
        date_val = self.date_entry.get_date().isoformat()
        currency = self.currency_var.get()
        notes = self.notes_entry.get().strip()
        profile_name = user_profile.get_active() or ""
        self.category_entry.delete(0, "end")
        self.amount_entry.delete(0, "end")
        self.notes_entry.delete(0, "end")

        display = db.get_display_currency()
        fx = db.get_fx_rate()
        conv = fmt_money(db.convert(amount, currency, display, fx), display)
        self.table.optimistic_insert(
            ("…", date_val, category, f"{amount:,.2f}", currency, f"{fx:,.2f}",
             conv, notes, profile_name or "—"))

        def work():
            new_id = db.add_expense(bid, date_val, category, amount, currency, notes, profile_name)
            process_mentions("expense", new_id, "notes", notes, bid, profile_name)

        db.submit_write(work, on_done=lambda: self.after(0, self.refresh),
                        on_error=lambda _e: self.after(0, self.refresh))

    def _delete(self, row_id):
        self.table.optimistic_delete(row_id)
        db.submit_write(
            lambda: db.delete_expense(row_id),
            on_done=lambda: self.after(0, self.refresh),
            on_error=lambda _e: self.after(0, self.refresh),
        )

    def _edit(self, row_id, field, value):
        bid = self.business_id
        author = user_profile.get_active() or ""
        self.table.optimistic_update(row_id, field, _fmt_edit(field, value))

        def work():
            db.update_expense(row_id, field, value)
            if field == "notes":
                process_mentions("expense", row_id, "notes", value, bid, author)

        db.submit_write(work, on_done=lambda: self.after(0, self.refresh),
                        on_error=lambda _e: self.after(0, self.refresh))

    def refresh(self):
        display = db.get_display_currency()
        fallback = db.get_fx_rate()
        rows = db.list_expenses(self.business_id)
        self.table.tree.heading("converted", text="In " + display)
        self.table.set_rows(
            [
                (
                    r["id"], r["date"], r["category"],
                    f"{r['amount']:,.2f}", r["currency"],
                    f"{(r['fx_rate'] or fallback):,.2f}",
                    fmt_money(
                        db.convert(r["amount"], r["currency"], display,
                                   r["fx_rate"] or fallback),
                        display,
                    ),
                    r["notes"], r["created_by"] or "—",
                )
                for r in rows
            ],
            raw_rows=rows,
        )
        self.total_label.configure(
            text=f"Total: {fmt_money(db.total_expenses(self.business_id, display), display)}"
        )
        self._sig = self._signature()

    def _signature(self):
        display = db.get_display_currency()
        rows = db.list_expenses(self.business_id)
        return (display, db.get_fx_rate(), tuple(
            (r["id"], r["date"], r["category"], r["amount"], r["currency"],
             r["fx_rate"], r["notes"], r["created_by"]) for r in rows))

    def live_refresh(self):
        if self.table.is_editing():
            return
        sig = self._signature()
        if sig == getattr(self, "_sig", None):
            return
        self._sig = sig
        self.refresh()


class PlansTab(ctk.CTkFrame):
    def __init__(self, master, business_id):
        super().__init__(master, fg_color="transparent")
        self.business_id = business_id

        form = ctk.CTkFrame(self)
        form.pack(fill="x", padx=12, pady=12)

        ctk.CTkLabel(form, text="Title").grid(row=0, column=0, padx=8, pady=(8, 0), sticky="w")
        self.title_entry = ctk.CTkEntry(form, width=200)
        self.title_entry.grid(row=1, column=0, padx=8, pady=(0, 8))

        ctk.CTkLabel(form, text="Target Date").grid(row=0, column=1, padx=8, pady=(8, 0), sticky="w")
        self.target_entry = DateEntry(form, date_pattern="yyyy-mm-dd",
                                      background="#1f6aa5", foreground="white",
                                      borderwidth=0, width=12)
        self.target_entry.set_date(date.today())
        self.target_entry.grid(row=1, column=1, padx=8, pady=(0, 8))

        ctk.CTkLabel(form, text="Status").grid(row=0, column=2, padx=8, pady=(8, 0), sticky="w")
        self.status_var = ctk.StringVar(value=db.PLAN_STATUSES[0])
        ctk.CTkOptionMenu(form, values=db.PLAN_STATUSES, variable=self.status_var).grid(
            row=1, column=2, padx=8, pady=(0, 8)
        )

        ctk.CTkLabel(form, text="Description (@ to mention)").grid(row=0, column=3, padx=8, pady=(8, 0), sticky="w")
        self.desc_entry = ctk.CTkEntry(form, width=260)
        self.desc_entry.grid(row=1, column=3, padx=8, pady=(0, 8))
        MentionAutocomplete(self.desc_entry._entry, mention_names)

        ctk.CTkButton(form, text="Add Plan", command=self._add).grid(
            row=0, column=4, rowspan=2, padx=12, pady=8, sticky="ns"
        )

        self.table = DataTable(
            self,
            [("id", "ID", 50), ("title", "Title", 200), ("target_date", "Target", 110),
             ("status", "Status", 120), ("description", "Description", 300),
             ("created_by", "By", 100)],
            on_delete=self._delete,
            editable={
                "title": {"type": "text"},
                "target_date": {"type": "date"},
                "status": {"type": "options", "options": db.PLAN_STATUSES},
                "description": {"type": "text"},
            },
            on_edit=self._edit,
            mention_cols={"description"},
            get_mention_names=mention_names,
        )
        self.table.pack(fill="both", expand=True, padx=12, pady=12)

        self.refresh()

    def _add(self):
        title = self.title_entry.get().strip()
        if not title:
            messagebox.showwarning("Missing title", "Please enter a plan title.")
            return
        bid = self.business_id
        description = self.desc_entry.get().strip()
        target_val = self.target_entry.get_date().isoformat()
        status = self.status_var.get()
        profile_name = user_profile.get_active() or ""
        self.title_entry.delete(0, "end")
        self.target_entry.set_date(date.today())
        self.desc_entry.delete(0, "end")

        self.table.optimistic_insert(
            ("…", title, target_val or "—", status, description,
             profile_name or "—"))

        def work():
            new_id = db.add_plan(bid, title, description, target_val, status, profile_name)
            process_mentions("plan", new_id, "description", description, bid, profile_name)

        db.submit_write(work, on_done=lambda: self.after(0, self.refresh),
                        on_error=lambda _e: self.after(0, self.refresh))

    def _delete(self, row_id):
        self.table.optimistic_delete(row_id)
        db.submit_write(
            lambda: db.delete_plan(row_id),
            on_done=lambda: self.after(0, self.refresh),
            on_error=lambda _e: self.after(0, self.refresh),
        )

    def _edit(self, row_id, field, value):
        bid = self.business_id
        author = user_profile.get_active() or ""
        self.table.optimistic_update(row_id, field, value)

        def work():
            db.update_plan(row_id, field, value)
            if field == "description":
                process_mentions("plan", row_id, "description", value, bid, author)

        db.submit_write(work, on_done=lambda: self.after(0, self.refresh),
                        on_error=lambda _e: self.after(0, self.refresh))

    def refresh(self):
        rows = db.list_plans(self.business_id)
        self.table.set_rows(
            [
                (r["id"], r["title"], r["target_date"] or "—", r["status"],
                 r["description"], r["created_by"] or "—")
                for r in rows
            ],
            raw_rows=rows,
        )
        self._sig = self._signature()

    def _signature(self):
        rows = db.list_plans(self.business_id)
        return tuple(
            (r["id"], r["title"], r["target_date"], r["status"],
             r["description"], r["created_by"]) for r in rows)

    def live_refresh(self):
        if self.table.is_editing():
            return
        sig = self._signature()
        if sig == getattr(self, "_sig", None):
            return
        self._sig = sig
        self.refresh()


class PhaseTab(ctk.CTkFrame):
    def __init__(self, master, business_id):
        super().__init__(master, fg_color="transparent")
        self.business_id = business_id
        biz = db.get_business(business_id)

        ctk.CTkLabel(
            self, text="Current Phase of Operations",
            font=ctk.CTkFont(size=16, weight="bold"),
        ).pack(anchor="w", padx=20, pady=(20, 8))

        self.phase_var = ctk.StringVar(value=biz["phase"] or db.PHASES[0])
        ctk.CTkOptionMenu(self, values=db.PHASES, variable=self.phase_var, width=240).pack(
            anchor="w", padx=20
        )

        ctk.CTkLabel(self, text="Notes / what's happening now  (type @ to mention)").pack(
            anchor="w", padx=20, pady=(20, 4)
        )
        self.notes = ctk.CTkTextbox(self, height=200)
        self.notes.pack(fill="both", expand=True, padx=20, pady=(0, 12))
        self._saved_notes = biz["phase_notes"] or ""
        self.notes.insert("1.0", self._saved_notes)
        MentionAutocomplete(self.notes._textbox, mention_names, is_text=True)

        ctk.CTkButton(self, text="Save Phase", command=self._save).pack(
            anchor="e", padx=20, pady=(0, 20)
        )

    def _save(self):
        bid = self.business_id
        phase = self.phase_var.get()
        notes = self.notes.get("1.0", "end").strip()
        author = user_profile.get_active() or ""
        self._saved_notes = notes

        def work():
            db.update_phase(bid, phase, notes)
            process_mentions("phase", bid, "phase_notes", notes, bid, author)

        # Non-blocking save (matches the other tabs); confirm immediately.
        db.submit_write(work)
        messagebox.showinfo("Saved", "Phase updated.")

    def _is_dirty(self):
        try:
            return self.notes.get("1.0", "end").strip() != (self._saved_notes or "")
        except Exception:
            return False

    def live_refresh(self):
        # Never clobber the phase notes the user is editing: skip if the textbox
        # has focus or has unsaved edits.
        try:
            focused = self.focus_get()
        except Exception:
            focused = None
        if focused is self.notes or focused is getattr(self.notes, "_textbox", None):
            return
        if self._is_dirty():
            return
        biz = db.get_business(self.business_id)
        if not biz:
            return
        remote_notes = biz["phase_notes"] or ""
        if remote_notes != self._saved_notes:
            self._saved_notes = remote_notes
            self.notes.delete("1.0", "end")
            self.notes.insert("1.0", remote_notes)
        self.phase_var.set(biz["phase"] or db.PHASES[0])


class OverviewTab(ctk.CTkFrame):
    def __init__(self, master, business_id, on_rename, on_delete):
        super().__init__(master, fg_color="transparent")
        self.business_id = business_id
        self.on_rename = on_rename
        self.on_delete = on_delete
        self._build()
        self._sig = self._signature()

    def refresh(self):
        for w in self.winfo_children():
            w.destroy()
        self._build()
        self._sig = self._signature()

    def _signature(self):
        biz = db.get_business(self.business_id)
        if not biz:
            return None
        display = db.get_display_currency()
        is_parent = not biz["parent_id"]
        if is_parent:
            inc = db.total_income_with_subs(self.business_id, display)
            exp = db.total_expenses_with_subs(self.business_id, display)
        else:
            inc = db.total_income(self.business_id, display)
            exp = db.total_expenses(self.business_id, display)
        subs = tuple(
            (s["id"], s["name"], s["phase"],
             round(db.total_income(s["id"], display) - db.total_expenses(s["id"], display), 2))
            for s in db.list_subsidiaries(self.business_id)
        ) if is_parent else ()
        owner = biz["owner"] if "owner" in biz.keys() else ""
        return (biz["name"], biz["phase"], owner, display, db.get_fx_rate(),
                round(inc, 2), round(exp, 2), subs)

    def live_refresh(self):
        # Overview has no inputs, so it's always safe to rebuild — but only do so
        # when the underlying numbers/structure changed, to avoid flicker on
        # every sync tick. This is what closes the live-sync gap.
        sig = self._signature()
        if sig == getattr(self, "_sig", None):
            return
        self.refresh()

    def _build(self):
        business_id = self.business_id
        biz = db.get_business(business_id)
        if not biz:
            return
        display = db.get_display_currency()
        is_parent = not biz["parent_id"]

        own_income = db.total_income(business_id, display)
        own_expenses = db.total_expenses(business_id, display)

        if is_parent:
            income = db.total_income_with_subs(business_id, display)
            expenses = db.total_expenses_with_subs(business_id, display)
        else:
            income = own_income
            expenses = own_expenses
        net = income - expenses

        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=20, pady=20)

        ctk.CTkLabel(
            header, text=biz["name"], font=ctk.CTkFont(size=26, weight="bold")
        ).pack(side="left")

        ctk.CTkButton(header, text="Rename", width=80, fg_color="gray30",
                      command=self._rename).pack(side="right", padx=4)
        ctk.CTkButton(header, text="Delete", width=80, fg_color="#a52a2a",
                      hover_color="#7a1f1f", command=self._delete).pack(side="right", padx=4)

        # Owner-only Share button (invite a profile to this business).
        active = user_profile.get_active() or ""
        owner = db.get_owner(business_id)
        if is_parent and owner == active and owner != "":
            ctk.CTkButton(header, text="Share", width=80, fg_color="#1f6aa5",
                          command=self._share).pack(side="right", padx=4)

        sub = "Subsidiary" if biz["parent_id"] else "Top-level Business"
        owner_txt = f"   ·   Owner: {owner}" if owner else ""
        ctk.CTkLabel(self, text=sub + owner_txt, text_color="gray60").pack(
            anchor="w", padx=20)

        ctk.CTkLabel(self, text=f"Phase: {biz['phase']}", font=ctk.CTkFont(size=14)).pack(
            anchor="w", padx=20, pady=(16, 0)
        )

        cards_label = "Income (incl. subsidiaries)" if is_parent else "Income"
        exp_label = "Expenses (incl. subsidiaries)" if is_parent else "Expenses"

        cards = ctk.CTkFrame(self, fg_color="transparent")
        cards.pack(fill="x", padx=20, pady=20)
        self._card(cards, cards_label, fmt_money(income, display), "#2e7d32").pack(side="left", expand=True, fill="x", padx=4)
        self._card(cards, exp_label, fmt_money(expenses, display), "#a52a2a").pack(side="left", expand=True, fill="x", padx=4)
        self._card(cards, "Net", fmt_money(net, display),
                   "#2e7d32" if net >= 0 else "#a52a2a").pack(side="left", expand=True, fill="x", padx=4)

        ctk.CTkLabel(
            self,
            text=f"All amounts shown in {display} (FX rate: 1 USD = {db.get_fx_rate():,.2f} JMD)",
            text_color="gray60",
        ).pack(anchor="w", padx=24)

        if is_parent and db.list_subsidiaries(business_id):
            own_net = own_income - own_expenses
            ctk.CTkLabel(
                self,
                text=f"Own only — Income: {fmt_money(own_income, display)}   "
                     f"Expenses: {fmt_money(own_expenses, display)}   "
                     f"Net: {fmt_money(own_net, display)}",
                text_color="gray60",
            ).pack(anchor="w", padx=24, pady=(2, 0))

        if not biz["parent_id"]:
            subs = db.list_subsidiaries(business_id)
            if subs:
                ctk.CTkLabel(self, text="Subsidiaries",
                             font=ctk.CTkFont(size=16, weight="bold")).pack(anchor="w", padx=20, pady=(10, 4))
                for s in subs:
                    s_in = db.total_income(s["id"], display)
                    s_ex = db.total_expenses(s["id"], display)
                    s_net = s_in - s_ex
                    line = ctk.CTkFrame(self)
                    line.pack(fill="x", padx=20, pady=4)
                    ctk.CTkLabel(line, text=s["name"], font=ctk.CTkFont(size=13, weight="bold")).pack(side="left", padx=12, pady=8)
                    ctk.CTkLabel(line, text=f"Phase: {s['phase']}", text_color="gray60").pack(side="left", padx=12)
                    ctk.CTkLabel(line, text=f"Net: {fmt_money(s_net, display)}",
                                 text_color="#4caf50" if s_net >= 0 else "#ef5350").pack(side="right", padx=12)

    def _card(self, parent, label, value, accent):
        f = ctk.CTkFrame(parent, fg_color="#1f1f1f", corner_radius=8)
        ctk.CTkLabel(f, text=label, text_color="gray60").pack(anchor="w", padx=16, pady=(12, 0))
        ctk.CTkLabel(f, text=value, font=ctk.CTkFont(size=22, weight="bold"),
                     text_color=accent).pack(anchor="w", padx=16, pady=(0, 12))
        return f

    def _rename(self):
        bid = self.business_id
        dlg = ctk.CTkInputDialog(text="New name:", title="Rename")
        new_name = dlg.get_input()
        if new_name and new_name.strip():
            name = new_name.strip()
            db.submit_write(lambda: db.rename_business(bid, name),
                            on_done=lambda: self.after(0, self.on_rename))

    def _delete(self):
        biz = db.get_business(self.business_id)
        bid = self.business_id
        msg = f"Delete '{biz['name']}'?"
        if not biz["parent_id"]:
            msg += "\n\nThis will also delete all its subsidiaries and their data."
        if messagebox.askyesno("Confirm delete", msg):
            db.submit_write(lambda: db.delete_business(bid),
                            on_done=lambda: self.after(0, self.on_delete))

    def _share(self):
        biz = db.get_business(self.business_id)
        if biz:
            InvitePicker(self, self.business_id, biz["name"])


class DetailPane(ctk.CTkFrame):
    def __init__(self, master, on_change):
        super().__init__(master, fg_color="transparent")
        self.on_change = on_change
        self.business_id = None
        self.tabs = None
        self._tab_widgets = {}
        self._show_empty()

    def _show_empty(self):
        for w in self.winfo_children():
            w.destroy()
        self.tabs = None
        self._tab_widgets = {}
        ctk.CTkLabel(
            self,
            text="Select a business from the sidebar\nor add a new one to get started.",
            font=ctk.CTkFont(size=16),
            text_color="gray60",
            justify="center",
        ).pack(expand=True)

    def show(self, business_id):
        self.business_id = business_id
        for w in self.winfo_children():
            w.destroy()

        if business_id is None:
            self._show_empty()
            return

        tabs = ctk.CTkTabview(self)
        tabs.pack(fill="both", expand=True, padx=8, pady=8)
        self.tabs = tabs

        for name in ("Overview", "Income", "Expenses", "Plans", "Phase"):
            tabs.add(name)

        overview = OverviewTab(tabs.tab("Overview"), business_id,
                               on_rename=self.on_change, on_delete=self.on_change)
        overview.pack(fill="both", expand=True)
        income = IncomeTab(tabs.tab("Income"), business_id)
        income.pack(fill="both", expand=True)
        expense = ExpenseTab(tabs.tab("Expenses"), business_id)
        expense.pack(fill="both", expand=True)
        plans = PlansTab(tabs.tab("Plans"), business_id)
        plans.pack(fill="both", expand=True)
        phase = PhaseTab(tabs.tab("Phase"), business_id)
        phase.pack(fill="both", expand=True)
        self._tab_widgets = {
            "Overview": overview, "Income": income, "Expenses": expense,
            "Plans": plans, "Phase": phase,
        }

    def live_refresh(self):
        """Refresh read-only views on a remote sync without clobbering input.
        Each tab's live_refresh() self-guards against open editors / dirty
        fields. Overview always refreshes; the others skip while being edited."""
        if not self.tabs or not self._tab_widgets:
            return
        for tab in self._tab_widgets.values():
            fn = getattr(tab, "live_refresh", None)
            if callable(fn):
                try:
                    fn()
                except Exception as e:
                    print(f"[live_refresh] {e}")


class TopBar(ctk.CTkFrame):
    def __init__(self, master, on_switch_profile, on_check_updates, on_backup,
                 on_open_notifications=None, on_edit_email=None):
        super().__init__(master, height=48, corner_radius=0, fg_color="#1f1f1f")
        self.pack_propagate(False)
        self.on_switch_profile = on_switch_profile
        self.on_check_updates = on_check_updates
        self.on_backup = on_backup
        self.on_open_notifications = on_open_notifications
        self.on_edit_email = on_edit_email

        ctk.CTkLabel(
            self, text="Business Tracker",
            font=ctk.CTkFont(size=16, weight="bold"),
        ).pack(side="left", padx=20)

        self.sync_label = ctk.CTkLabel(
            self, text="Connecting...", text_color="gray60",
            font=ctk.CTkFont(size=11),
        )
        self.sync_label.pack(side="left", padx=8)

        # Right-aligned cluster: version, backup, check for updates, profile.
        # Pack in reverse visual order because side="right" stacks right→left.
        # Profile badge — colored pill, click to switch.
        active = user_profile.get_active() or "?"
        self.profile_btn = ctk.CTkButton(
            self, text=f"●  {active}", width=140, height=30,
            fg_color=user_profile.color_for(active),
            hover_color="#333333",
            command=self.on_switch_profile,
            font=ctk.CTkFont(size=12, weight="bold"),
        )
        self.profile_btn.pack(side="right", padx=(8, 16))

        # Notifications bell — count of unseen mentions/invites.
        self.bell_btn = ctk.CTkButton(
            self, text="🔔", width=44, height=30,
            fg_color="transparent", hover_color="#333333",
            command=(self.on_open_notifications or (lambda: None)),
        )
        self.bell_btn.pack(side="right", padx=4)

        ctk.CTkLabel(
            self, text=f"v{__version__}", text_color="gray50",
            font=ctk.CTkFont(size=11),
        ).pack(side="right", padx=(4, 8))
        ctk.CTkButton(
            self, text="Email", width=56, height=24,
            fg_color="transparent", hover_color="#333333",
            text_color="gray70", font=ctk.CTkFont(size=11, underline=True),
            command=(self.on_edit_email or (lambda: None)),
        ).pack(side="right", padx=4)
        ctk.CTkButton(
            self, text="Backup", width=70, height=24,
            fg_color="transparent", hover_color="#333333",
            text_color="gray70", font=ctk.CTkFont(size=11, underline=True),
            command=self.on_backup,
        ).pack(side="right", padx=4)
        ctk.CTkButton(
            self, text="Check for updates", width=130, height=24,
            fg_color="transparent", hover_color="#333333",
            text_color="gray70", font=ctk.CTkFont(size=11, underline=True),
            command=self.on_check_updates,
        ).pack(side="right", padx=4)

    def set_sync_status(self, text):
        try:
            self.sync_label.configure(text=text)
        except Exception:
            pass

    def set_notification_count(self, n):
        try:
            self.bell_btn.configure(
                text=f"🔔 {n}" if n else "🔔",
                fg_color="#a52a2a" if n else "transparent",
            )
        except Exception:
            pass

    def refresh_profile_badge(self):
        active = user_profile.get_active() or "?"
        self.profile_btn.configure(
            text=f"●  {active}",
            fg_color=user_profile.color_for(active),
        )


class BottomBar(ctk.CTkFrame):
    """Footer with currency display picker + FX rate for new transactions."""

    def __init__(self, master, on_currency_change):
        super().__init__(master, height=44, corner_radius=0, fg_color="#1a1a1a")
        self.pack_propagate(False)
        self.on_currency_change = on_currency_change

        # Left side: display currency
        ctk.CTkLabel(self, text="Display:", text_color="gray60",
                     font=ctk.CTkFont(size=11)).pack(side="left", padx=(20, 4))
        self.currency_var = ctk.StringVar(value=db.get_display_currency())
        ctk.CTkOptionMenu(
            self, values=db.CURRENCIES, variable=self.currency_var,
            width=80, height=26, command=self._change_currency,
        ).pack(side="left", padx=4)

        # Right side: rate for NEW transactions
        ctk.CTkButton(
            self, text="Save Rate", width=80, height=26,
            command=self._save_rate,
        ).pack(side="right", padx=(4, 20))

        self.rate_entry = ctk.CTkEntry(self, width=80, height=26)
        self.rate_entry.insert(0, f"{db.get_fx_rate():.2f}")
        self.rate_entry.pack(side="right", padx=4)

        ctk.CTkLabel(
            self,
            text="Rate for new entries (JMD per 1 USD):",
            text_color="gray60", font=ctk.CTkFont(size=11),
        ).pack(side="right", padx=(16, 4))

    def _change_currency(self, value):
        db.set_display_currency(value)
        self.on_currency_change()

    def _save_rate(self):
        try:
            rate = float(self.rate_entry.get())
            if rate <= 0:
                raise ValueError
        except ValueError:
            messagebox.showwarning("Invalid rate", "FX rate must be a positive number.")
            return
        db.set_fx_rate(rate)
        self.on_currency_change()


class NotificationsPopup(ctk.CTkToplevel):
    """Bell popup: pending invitations (Accept/Decline) + recent notifications."""

    def __init__(self, master, on_change):
        super().__init__(master)
        self.on_change = on_change
        self.title("Notifications")
        self.geometry("440x480")
        self.transient(master.winfo_toplevel())
        self.grab_set()

        self.scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.scroll.pack(fill="both", expand=True, padx=14, pady=14)
        ctk.CTkButton(self, text="Close", fg_color="gray30",
                      command=self.destroy).pack(pady=(0, 12))

        self.update_idletasks()
        self.lift()
        self.focus_force()
        self._build()

    def _build(self):
        for w in self.scroll.winfo_children():
            w.destroy()
        active = user_profile.get_active() or ""

        invites = db.list_incoming_invites(active)
        if invites:
            ctk.CTkLabel(self.scroll, text="Pending invitations",
                         font=ctk.CTkFont(size=14, weight="bold")).pack(
                anchor="w", pady=(2, 6))
            for inv in invites:
                card = ctk.CTkFrame(self.scroll, fg_color="#1f1f1f", corner_radius=8)
                card.pack(fill="x", pady=4)
                ctk.CTkLabel(
                    card,
                    text=f'{inv["inviter"]} invited you to “{inv["business_name"]}”',
                    wraplength=360, justify="left",
                ).pack(anchor="w", padx=12, pady=(10, 6))
                btns = ctk.CTkFrame(card, fg_color="transparent")
                btns.pack(fill="x", padx=12, pady=(0, 10))
                ctk.CTkButton(btns, text="Accept", width=90,
                              command=lambda i=inv["id"]: self._accept(i)).pack(side="left")
                ctk.CTkButton(btns, text="Decline", width=90, fg_color="gray30",
                              command=lambda i=inv["id"]: self._decline(i)).pack(
                    side="left", padx=8)

        ctk.CTkLabel(self.scroll, text="Recent",
                     font=ctk.CTkFont(size=14, weight="bold")).pack(
            anchor="w", pady=(12, 6))
        recents = db.list_recent_notifications(active, 20)
        if not recents:
            ctk.CTkLabel(self.scroll, text="Nothing yet.",
                         text_color="gray60").pack(anchor="w", padx=4, pady=6)
        for n in recents:
            row = ctk.CTkFrame(self.scroll, fg_color="transparent")
            row.pack(fill="x", pady=2)
            ctk.CTkLabel(row, text=("•" if not n["seen"] else "·"),
                         text_color="#4caf50" if not n["seen"] else "gray50",
                         width=14).pack(side="left", padx=(2, 4), anchor="n")
            txt = n["title"]
            if n["body"]:
                txt += f"\n{n['body']}"
            ctk.CTkLabel(row, text=txt, justify="left", wraplength=360,
                         text_color="white" if not n["seen"] else "gray60").pack(
                side="left", anchor="w")

    def _accept(self, invite_id):
        db.submit_write(lambda: db.accept_invite(invite_id),
                        on_done=lambda: self.after(0, self._after_action))

    def _decline(self, invite_id):
        db.submit_write(lambda: db.decline_invite(invite_id),
                        on_done=lambda: self.after(0, self._after_action))

    def _after_action(self):
        try:
            self._build()
        except tk.TclError:
            return
        if self.on_change:
            self.on_change()


class EmailDialog(ctk.CTkToplevel):
    """Edit the active profile's email (used for @-mention alerts)."""

    def __init__(self, master, profile_name, current_email, on_save):
        super().__init__(master)
        self.on_save = on_save
        self.title("My email")
        self.geometry("400x190")
        self.transient(master.winfo_toplevel())
        self.grab_set()

        ctk.CTkLabel(self, text=f"Email for {profile_name}",
                     font=ctk.CTkFont(size=14, weight="bold")).pack(
            anchor="w", padx=20, pady=(20, 2))
        ctk.CTkLabel(self, text="Where @-mention alerts are sent.",
                     text_color="gray60").pack(anchor="w", padx=20)
        self.entry = ctk.CTkEntry(self, placeholder_text="you@example.com")
        self.entry.pack(fill="x", padx=20, pady=12)
        if current_email:
            self.entry.insert(0, current_email)
        self.entry.focus()

        btns = ctk.CTkFrame(self, fg_color="transparent")
        btns.pack(fill="x", padx=20, pady=(0, 16))
        ctk.CTkButton(btns, text="Cancel", fg_color="gray30",
                      command=self.destroy).pack(side="right", padx=(8, 0))
        ctk.CTkButton(btns, text="Save", command=self._save).pack(side="right")
        self.bind("<Return>", lambda _e: self._save())

    def _save(self):
        email = self.entry.get().strip()
        self.on_save(email)
        self.destroy()


class OwnerAssignmentModal(ctk.CTkToplevel):
    """One-time screen to assign an owner to each pre-existing (unowned)
    top-level business. Defaults every selection to the active profile so the
    migrating user never loses access to their own businesses."""

    def __init__(self, master, on_done):
        super().__init__(master)
        self.on_done = on_done
        self.title("Set business owners")
        self.geometry("480x520")
        self.transient(master.winfo_toplevel())
        self.grab_set()
        self.protocol("WM_DELETE_WINDOW", lambda: None)  # must choose

        active = user_profile.get_active() or ""
        try:
            names = [p["name"] for p in db.list_profiles_full()] or [active]
        except Exception:
            names = [active]
        if active and active not in names:
            names.insert(0, active)

        ctk.CTkLabel(self, text="Who owns each business?",
                     font=ctk.CTkFont(size=18, weight="bold")).pack(
            anchor="w", padx=20, pady=(20, 2))
        ctk.CTkLabel(
            self, wraplength=430, justify="left", text_color="gray60",
            text=("Business Tracker now gates each business to its owner and the "
                  "people they invite. Pick an owner for each existing business "
                  "(defaults to you). You can invite others afterwards."),
        ).pack(anchor="w", padx=20, pady=(0, 8))

        scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=16, pady=8)

        self.choices = {}  # business_id -> StringVar
        unowned = db.list_unowned_top_level()
        for biz in unowned:
            row = ctk.CTkFrame(scroll)
            row.pack(fill="x", pady=4)
            ctk.CTkLabel(row, text=biz["name"], anchor="w",
                         font=ctk.CTkFont(size=13, weight="bold")).pack(
                side="left", padx=12, pady=10)
            var = ctk.StringVar(value=active if active in names else names[0])
            ctk.CTkOptionMenu(row, values=names, variable=var, width=170).pack(
                side="right", padx=12)
            self.choices[biz["id"]] = var

        ctk.CTkButton(self, text="Save owners", command=self._save).pack(
            pady=(4, 16))

        self.update_idletasks()
        self.lift()
        self.focus_force()

    def _save(self):
        assignments = {bid: var.get() for bid, var in self.choices.items()}

        def work():
            for bid, owner in assignments.items():
                if owner:
                    db.set_owner(bid, owner)
            db._set_setting("owner_assignment_done", "1")

        db.submit_write(work, on_done=lambda: self.after(0, self._finish))

    def _finish(self):
        if self.on_done:
            self.on_done()
        try:
            self.destroy()
        except tk.TclError:
            pass


class UpdateBanner(ctk.CTkFrame):
    """Yellow strip shown above the body when a newer release is on GitHub.
    'Download' goes straight to the right .zip for this OS; 'View page' opens
    the branded download site (with install instructions).
    """

    def __init__(self, master):
        super().__init__(master, height=36, corner_radius=0, fg_color="#8a6d00")
        self.pack_propagate(False)
        self._info = None

        self.label = ctk.CTkLabel(
            self, text="", text_color="white",
            font=ctk.CTkFont(size=12, weight="bold"),
        )
        self.label.pack(side="left", padx=16)

        ctk.CTkButton(
            self, text="✕", width=28, height=24,
            fg_color="transparent", hover_color="#705800",
            command=self.hide,
        ).pack(side="right", padx=8)

        ctk.CTkButton(
            self, text="Download", width=110, height=26,
            fg_color="white", text_color="#8a6d00",
            hover_color="#dddddd", command=self._download,
        ).pack(side="right", padx=4)

        ctk.CTkButton(
            self, text="View page", width=84, height=26,
            fg_color="transparent", text_color="white", hover_color="#705800",
            command=self._open_site,
        ).pack(side="right", padx=4)

        self.hide()  # start hidden

    def show(self, info: "updater.UpdateInfo"):
        self._info = info
        self.label.configure(
            text=f"Update available: v{info.latest} (you have v{info.current})"
        )
        self.pack(side="top", fill="x")

    def hide(self):
        try:
            self.pack_forget()
        except Exception:
            pass

    def _download(self):
        # Straight to the correct platform .zip so the browser starts the
        # download immediately (falls back to the branded site / release page).
        if self._info:
            webbrowser.open(self._info.download_url())

    def _open_site(self):
        webbrowser.open(updater.DOWNLOAD_SITE)


class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Business Tracker")
        self.geometry("1280x760")
        self.minsize(960, 600)

        self.topbar = TopBar(
            self,
            on_switch_profile=self._switch_profile,
            on_check_updates=lambda: self._check_for_updates(manual=True),
            on_backup=self._export_backup,
            on_open_notifications=self._open_notifications,
            on_edit_email=self._edit_email,
        )
        self.topbar.pack(side="top", fill="x")
        # Toast widgets currently on screen (so we can stack + auto-dismiss them).
        self._toasts = []
        # Notification ids already toasted this process — guards against a brief
        # double-toast window before `seen` replicates across this profile's
        # other machines.
        self._toasted_ids = set()

        # Update banner sits between topbar and body — hidden until needed.
        self.update_banner = UpdateBanner(self)

        # Bottom bar packed before body so body fills the middle.
        self.bottombar = BottomBar(self, on_currency_change=self._on_currency_change)
        self.bottombar.pack(side="bottom", fill="x")

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True)

        # Silent startup check — never blocks the UI.
        self.after(2000, lambda: self._check_for_updates(manual=False))

        self.sidebar = Sidebar(body, on_select=self._on_select)
        self.sidebar.pack(side="left", fill="y")

        self.detail = DetailPane(body, on_change=self._on_change)
        self.detail.pack(side="right", fill="both", expand=True)

    def _on_select(self, business_id):
        self.detail.show(business_id)

    def _on_change(self):
        self.sidebar.refresh()
        if self.sidebar.selected_id and not db.get_business(self.sidebar.selected_id):
            self.sidebar.selected_id = None
            self.detail.show(None)
        else:
            self.detail.show(self.sidebar.selected_id)

    def _on_currency_change(self):
        # Re-render the current detail view with new currency / rate.
        self.detail.show(self.sidebar.selected_id)

    def _export_backup(self):
        """Dump every table to a JSON file so the user has an offline snapshot."""
        from tkinter import filedialog
        import json
        from datetime import datetime as _dt

        default_name = f"business-tracker-backup-{_dt.now().strftime('%Y%m%d-%H%M%S')}.json"
        path = filedialog.asksaveasfilename(
            defaultextension=".json",
            initialfile=default_name,
            filetypes=[("JSON backup", "*.json"), ("All files", "*.*")],
        )
        if not path:
            return
        try:
            data = {}
            for table in ("businesses", "income", "expenses", "plans",
                          "profiles", "settings"):
                with db.get_conn() as c:
                    rows = c.execute(f"SELECT * FROM {table}").fetchall()
                data[table] = [{k: r[k] for k in r.keys()} for r in rows]
            with open(path, "w") as f:
                json.dump({
                    "exported_at": _dt.now().isoformat(),
                    "app_version": __version__,
                    "tables": data,
                }, f, indent=2, default=str)
            messagebox.showinfo(
                "Backup saved",
                f"Snapshot saved to:\n{path}\n\n"
                f"Counts: " + ", ".join(f"{k}={len(v)}" for k, v in data.items()),
            )
        except Exception as e:
            messagebox.showerror("Backup failed", str(e))

    def _switch_profile(self):
        def _picked(_name):
            self.topbar.refresh_profile_badge()
            self.detail.show(self.sidebar.selected_id)
            self.sidebar.refresh()
            self._update_notification_badge()
        ProfilePicker(self, on_pick=_picked, allow_cancel=True)

    def _open_notifications(self):
        NotificationsPopup(self, on_change=self._after_notification_action)

    def _after_notification_action(self):
        self.sidebar.refresh()
        self._update_notification_badge()

    def _edit_email(self):
        active = user_profile.get_active()
        if not active:
            return
        current = db.get_profile_email(active)

        def _save(email):
            db.submit_write(lambda: db.set_profile_email(active, email))
            messagebox.showinfo("Saved", "Email updated.")
        EmailDialog(self, active, current, on_save=_save)

    def _update_notification_badge(self):
        active = user_profile.get_active()
        try:
            count = len(db.list_incoming_invites(active)) if active else 0
        except Exception:
            count = 0
        self.topbar.set_notification_count(count)

    def _show_toast(self, title, body):
        """Small in-app toast at the bottom-right; auto-dismisses after ~6s."""
        try:
            toast = ctk.CTkFrame(self, fg_color="#1f6aa5", corner_radius=8)
            ctk.CTkLabel(toast, text=title, font=ctk.CTkFont(size=12, weight="bold"),
                         text_color="white", wraplength=300, justify="left").pack(
                anchor="w", padx=12, pady=(8, 0))
            if body:
                ctk.CTkLabel(toast, text=body, text_color="white",
                             wraplength=300, justify="left").pack(
                    anchor="w", padx=12, pady=(0, 8))
            else:
                toast.configure(height=10)
            self._toasts.append(toast)
            self._restack_toasts()
            self.after(6000, lambda: self._dismiss_toast(toast))
        except Exception as e:
            print(f"[toast] {e}")

    def _restack_toasts(self):
        y = 0.96
        for t in reversed(self._toasts):
            try:
                t.place(relx=0.99, rely=y, anchor="se")
            except tk.TclError:
                pass
            y -= 0.10

    def _dismiss_toast(self, toast):
        if toast in self._toasts:
            self._toasts.remove(toast)
        try:
            toast.destroy()
        except tk.TclError:
            pass
        self._restack_toasts()

    def _poll_notifications(self):
        active = user_profile.get_active()
        if not active:
            return
        try:
            rows = db.list_unseen_notifications(active)
        except Exception as e:
            print(f"[notifications] poll failed: {e}")
            return
        fresh = [r for r in rows if r["id"] not in self._toasted_ids]
        if not fresh:
            return
        ids = [r["id"] for r in fresh]
        for r in fresh:
            self._toasted_ids.add(r["id"])
            self._show_toast(r["title"], r["body"])
            notify.desktop_notify(r["title"], r["body"])
        db.submit_write(lambda: db.mark_notifications_seen(ids))

    def _check_for_updates(self, manual: bool):
        """Hit GitHub Releases on a background thread and show the banner if
        a newer version is published. `manual=True` → also surface a small
        message box on no-update / error so the user gets feedback.
        """
        def _worker():
            info = updater.check()

            def _apply():
                if info is None:
                    if manual:
                        messagebox.showinfo(
                            "Check for updates",
                            "Couldn't reach the update server. "
                            "Check your network or the GITHUB_REPO setting.",
                        )
                    return
                if info.newer:
                    self.update_banner.show(info)
                else:
                    if manual:
                        messagebox.showinfo(
                            "Check for updates",
                            f"You're up to date (v{info.current}).",
                        )
            try:
                self.after(0, _apply)
            except Exception:
                pass

        threading.Thread(target=_worker, daemon=True).start()

    def refresh_from_remote(self):
        """Called on the Tk main thread after a successful background sync.

        Refreshes the sidebar + read-only detail views (Overview always; the
        editable tabs self-guard against clobbering open editors / dirty fields),
        polls for notifications addressed to this profile, and updates the bell.
        """
        from datetime import datetime as _dt
        self.topbar.set_sync_status(f"Synced {_dt.now().strftime('%H:%M:%S')}")
        self.sidebar.refresh()
        self.detail.live_refresh()
        self._poll_notifications()
        self._update_notification_badge()


def run():
    db.init_db()

    app = App()

    # Ensure we have an active profile before showing the main window.
    active = user_profile.get_active()
    if active:
        # Re-register in case the profile was created on another machine and
        # this client never inserted it locally / this is a fresh DB.
        try:
            db.add_profile(active)
        except Exception:
            pass
        app.topbar.refresh_profile_badge()
    else:
        # Show modal picker on top of the (visible) main window.
        chosen = {"name": None}

        def _on_pick(name):
            chosen["name"] = name

        picker = ProfilePicker(app, on_pick=_on_pick, allow_cancel=False)
        picker.update_idletasks()
        picker.lift()
        picker.focus_force()
        app.wait_window(picker)

        if not chosen["name"]:
            return  # user closed somehow; abort
        app.topbar.refresh_profile_badge()

    active = user_profile.get_active()

    # One-time owner assignment for pre-existing (unowned) businesses. Until the
    # user assigns owners, list_top_level_for treats owner='' as visible-to-all,
    # so nothing has disappeared from anyone's sidebar in the meantime.
    try:
        unowned = db.list_unowned_top_level()
        already_done = db._get_setting("owner_assignment_done", "0") == "1"
    except Exception:
        unowned, already_done = [], True
    if unowned and not already_done:
        owner_modal = OwnerAssignmentModal(app, on_done=app.sidebar.refresh)
        app.wait_window(owner_modal)
        app.sidebar.refresh()

    # Initial presence stamp (off the UI thread) + bell badge.
    try:
        db.submit_write(lambda: db.touch_presence(active), silent=True)
    except Exception:
        pass
    app._update_notification_badge()

    # Periodic background sync — pulls remote changes every 10s. Callbacks
    # fire on the sync thread, so we hop back to the Tk main loop.
    _sync_ticks = {"n": 0}

    def _on_synced():
        # Presence is a ~1.8s remote write, so do it sparingly and on the WRITER
        # thread (not here on the sync thread holding _lock) — otherwise every
        # user save would queue behind a heartbeat. Once per ~30s is plenty.
        _sync_ticks["n"] += 1
        if _sync_ticks["n"] % 3 == 0:
            try:
                db.submit_write(
                    lambda: db.touch_presence(user_profile.get_active()),
                    silent=True,
                )
            except Exception:
                pass
        try:
            app.after(0, app.refresh_from_remote)
        except Exception:
            pass

    def _on_error(_exc, failures):
        try:
            app.after(0, lambda: app.topbar.set_sync_status(
                f"Offline (retrying, {failures} fail{'s' if failures != 1 else ''})"
            ))
        except Exception:
            pass

    db.start_background_sync(
        interval_seconds=10, on_synced=_on_synced, on_error=_on_error,
    )
    # Drive a "Saving..." indicator from the writer-queue depth.
    def _on_pending(count):
        try:
            if count > 0:
                msg = f"Saving... ({count})" if count > 1 else "Saving..."
                app.after(0, lambda: app.topbar.set_sync_status(msg))
            else:
                from datetime import datetime as _dt
                ts = _dt.now().strftime("%H:%M:%S")
                app.after(0, lambda: app.topbar.set_sync_status(f"Saved {ts}"))
        except Exception:
            pass

    db.set_pending_writes_callback(_on_pending)

    try:
        app.mainloop()
    finally:
        # Make sure queued writes finish before we exit.
        try:
            import time
            deadline = time.time() + 8
            while db._pending_writes > 0 and time.time() < deadline:
                time.sleep(0.1)
        except Exception:
            pass
        db.flush_sync()
        db.stop_writer()
        db.stop_background_sync()
