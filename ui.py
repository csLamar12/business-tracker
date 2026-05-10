import tkinter as tk
import customtkinter as ctk
from tkinter import ttk, messagebox
from datetime import date, datetime
from tkcalendar import DateEntry as _RawDateEntry

import threading
import webbrowser

import db
import profile as user_profile
import updater
from version import __version__


class DateEntry(_RawDateEntry):
    """tkcalendar.DateEntry binds <<ThemeChanged>> with a lambda that requires
    an event arg, but CustomTkinter triggers theme-change events without one,
    which spams TypeErrors. Rebind it to swallow any args.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.bind(
            "<<ThemeChanged>>",
            lambda *_a, **_k: self.after(10, self._on_theme_change),
        )


ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")


CURRENCY_SYMBOL = {"USD": "$", "JMD": "J$"}


def fmt_money(v, currency="USD"):
    return f"{CURRENCY_SYMBOL.get(currency, '')}{v:,.2f} {currency}"


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
        db.add_business(name, self.parent_id)
        if self.on_save:
            self.on_save()
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
        ctk.CTkLabel(new_row, text="New profile name:").pack(
            anchor="w", padx=12, pady=(8, 0)
        )
        entry_row = ctk.CTkFrame(new_row, fg_color="transparent")
        entry_row.pack(fill="x", padx=8, pady=8)
        self.new_entry = ctk.CTkEntry(entry_row, placeholder_text="e.g. Lamar")
        self.new_entry.pack(side="left", fill="x", expand=True, padx=4)
        ctk.CTkButton(entry_row, text="Create", width=80,
                      command=self._create).pack(side="right", padx=4)
        self.new_entry.bind("<Return>", lambda _e: self._create())

        if allow_cancel:
            ctk.CTkButton(self, text="Cancel", fg_color="gray30",
                          command=self.destroy).pack(pady=(0, 12))

        self._refresh_profiles()
        self.new_entry.focus()

    def _refresh_profiles(self):
        for w in self.list_frame.winfo_children():
            w.destroy()
        try:
            profiles = db.list_profiles()
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
            row = ctk.CTkFrame(self.list_frame, fg_color="transparent")
            row.pack(fill="x", pady=3)
            dot = ctk.CTkLabel(row, text="●", text_color=color,
                               font=ctk.CTkFont(size=18))
            dot.pack(side="left", padx=(8, 4))
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
        try:
            db.add_profile(name)
        except Exception as e:
            messagebox.showerror("Couldn't create", str(e), parent=self)
            return
        self._pick(name)

    def _pick(self, name):
        user_profile.set_active(name)
        self.on_pick(name)
        self.destroy()


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

        top = db.list_top_level()
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

    def __init__(self, master, columns, on_delete=None, editable=None, on_edit=None):
        super().__init__(master, fg_color="transparent")
        self.columns = columns
        self.col_keys = [c[0] for c in columns]
        self.editable = editable or {}
        self.on_edit = on_edit
        self.on_delete = on_delete

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
            editor = DateEntry(self.tree, date_pattern="yyyy-mm-dd",
                               background="#1f6aa5", foreground="white",
                               borderwidth=0)
            try:
                editor.set_date(str(current) if current else date.today().isoformat())
            except Exception:
                editor.set_date(date.today())
            editor.place(x=x, y=y, width=w, height=h)
            editor.focus_set()
            editor.bind("<<DateEntrySelected>>",
                        lambda _e: self._commit(editor, row_id, col_key, kind))
            editor.bind("<Return>",
                        lambda _e: self._commit(editor, row_id, col_key, kind))
            editor.bind("<Escape>", lambda _e: self._cancel_edit())
        else:
            editor = tk.Entry(self.tree, bg="#3a3a3a", fg="white",
                              insertbackground="white", relief="flat")
            editor.insert(0, "" if current is None else str(current))
            editor.place(x=x, y=y, width=w, height=h)
            editor.focus_set()
            editor.select_range(0, "end")
            editor.bind("<Return>",
                        lambda _e: self._commit(editor, row_id, col_key, kind))
            editor.bind("<FocusOut>",
                        lambda _e: self._commit(editor, row_id, col_key, kind))
            editor.bind("<Escape>", lambda _e: self._cancel_edit())

        self._editor = editor

    def _commit(self, editor, row_id, col_key, kind):
        if editor is not self._editor:
            return
        try:
            if kind == "date":
                value = editor.get_date().isoformat()
            elif kind == "number":
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

        self.notes_entry = self._labeled(form, "Notes", 4)

        ctk.CTkButton(form, text="Add Income", command=self._add).grid(
            row=0, column=5, rowspan=2, padx=12, pady=8, sticky="ns"
        )

        self.total_label = ctk.CTkLabel(
            self, text="Total: $0.00", font=ctk.CTkFont(size=14, weight="bold")
        )
        self.total_label.pack(anchor="w", padx=16)

        self.table = DataTable(
            self,
            [("id", "ID", 50), ("date", "Date", 110), ("source", "Source", 170),
             ("amount", "Amount", 100), ("currency", "Cur", 60),
             ("converted", "In " + db.get_display_currency(), 120),
             ("notes", "Notes", 200), ("created_by", "By", 100)],
            on_delete=self._delete,
            editable={
                "date": {"type": "date"},
                "source": {"type": "text"},
                "amount": {"type": "number"},
                "currency": {"type": "options", "options": db.CURRENCIES},
                "notes": {"type": "text"},
            },
            on_edit=self._edit,
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
        db.add_income(
            self.business_id,
            self.date_entry.get_date().isoformat(),
            source,
            amount,
            self.currency_var.get(),
            self.notes_entry.get().strip(),
            user_profile.get_active() or "",
        )
        self.source_entry.delete(0, "end")
        self.amount_entry.delete(0, "end")
        self.notes_entry.delete(0, "end")
        self.refresh()

    def _delete(self, row_id):
        db.delete_income(row_id)
        self.refresh()

    def _edit(self, row_id, field, value):
        db.update_income(row_id, field, value)
        self.refresh()

    def refresh(self):
        display = db.get_display_currency()
        rate = db.get_fx_rate()
        rows = db.list_income(self.business_id)
        self.table.tree.heading("converted", text="In " + display)
        self.table.set_rows(
            [
                (
                    r["id"], r["date"], r["source"],
                    f"{r['amount']:,.2f}", r["currency"],
                    fmt_money(db.convert(r["amount"], r["currency"], display, rate), display),
                    r["notes"], r["created_by"] or "—",
                )
                for r in rows
            ],
            raw_rows=rows,
        )
        self.total_label.configure(
            text=f"Total: {fmt_money(db.total_income(self.business_id, display), display)}"
        )


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

        self.notes_entry = self._labeled(form, "Notes", 4)

        ctk.CTkButton(form, text="Add Expense", command=self._add).grid(
            row=0, column=5, rowspan=2, padx=12, pady=8, sticky="ns"
        )

        self.total_label = ctk.CTkLabel(
            self, text="Total: $0.00", font=ctk.CTkFont(size=14, weight="bold")
        )
        self.total_label.pack(anchor="w", padx=16)

        self.table = DataTable(
            self,
            [("id", "ID", 50), ("date", "Date", 110), ("category", "Category", 170),
             ("amount", "Amount", 100), ("currency", "Cur", 60),
             ("converted", "In " + db.get_display_currency(), 120),
             ("notes", "Notes", 200), ("created_by", "By", 100)],
            on_delete=self._delete,
            editable={
                "date": {"type": "date"},
                "category": {"type": "text"},
                "amount": {"type": "number"},
                "currency": {"type": "options", "options": db.CURRENCIES},
                "notes": {"type": "text"},
            },
            on_edit=self._edit,
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
        db.add_expense(
            self.business_id,
            self.date_entry.get_date().isoformat(),
            category,
            amount,
            self.currency_var.get(),
            self.notes_entry.get().strip(),
            user_profile.get_active() or "",
        )
        self.category_entry.delete(0, "end")
        self.amount_entry.delete(0, "end")
        self.notes_entry.delete(0, "end")
        self.refresh()

    def _delete(self, row_id):
        db.delete_expense(row_id)
        self.refresh()

    def _edit(self, row_id, field, value):
        db.update_expense(row_id, field, value)
        self.refresh()

    def refresh(self):
        display = db.get_display_currency()
        rate = db.get_fx_rate()
        rows = db.list_expenses(self.business_id)
        self.table.tree.heading("converted", text="In " + display)
        self.table.set_rows(
            [
                (
                    r["id"], r["date"], r["category"],
                    f"{r['amount']:,.2f}", r["currency"],
                    fmt_money(db.convert(r["amount"], r["currency"], display, rate), display),
                    r["notes"], r["created_by"] or "—",
                )
                for r in rows
            ],
            raw_rows=rows,
        )
        self.total_label.configure(
            text=f"Total: {fmt_money(db.total_expenses(self.business_id, display), display)}"
        )


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

        ctk.CTkLabel(form, text="Description").grid(row=0, column=3, padx=8, pady=(8, 0), sticky="w")
        self.desc_entry = ctk.CTkEntry(form, width=260)
        self.desc_entry.grid(row=1, column=3, padx=8, pady=(0, 8))

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
        )
        self.table.pack(fill="both", expand=True, padx=12, pady=12)

        self.refresh()

    def _add(self):
        title = self.title_entry.get().strip()
        if not title:
            messagebox.showwarning("Missing title", "Please enter a plan title.")
            return
        db.add_plan(
            self.business_id,
            title,
            self.desc_entry.get().strip(),
            self.target_entry.get_date().isoformat(),
            self.status_var.get(),
            user_profile.get_active() or "",
        )
        self.title_entry.delete(0, "end")
        self.target_entry.set_date(date.today())
        self.desc_entry.delete(0, "end")
        self.refresh()

    def _delete(self, row_id):
        db.delete_plan(row_id)
        self.refresh()

    def _edit(self, row_id, field, value):
        db.update_plan(row_id, field, value)
        self.refresh()

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

        ctk.CTkLabel(self, text="Notes / what's happening now").pack(
            anchor="w", padx=20, pady=(20, 4)
        )
        self.notes = ctk.CTkTextbox(self, height=200)
        self.notes.pack(fill="both", expand=True, padx=20, pady=(0, 12))
        self.notes.insert("1.0", biz["phase_notes"] or "")

        ctk.CTkButton(self, text="Save Phase", command=self._save).pack(
            anchor="e", padx=20, pady=(0, 20)
        )

    def _save(self):
        db.update_phase(
            self.business_id,
            self.phase_var.get(),
            self.notes.get("1.0", "end").strip(),
        )
        messagebox.showinfo("Saved", "Phase updated.")


class OverviewTab(ctk.CTkFrame):
    def __init__(self, master, business_id, on_rename, on_delete):
        super().__init__(master, fg_color="transparent")
        self.business_id = business_id
        self.on_rename = on_rename
        self.on_delete = on_delete

        biz = db.get_business(business_id)
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

        sub = "Subsidiary" if biz["parent_id"] else "Top-level Business"
        ctk.CTkLabel(self, text=sub, text_color="gray60").pack(anchor="w", padx=20)

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
        biz = db.get_business(self.business_id)
        dlg = ctk.CTkInputDialog(text="New name:", title="Rename")
        new_name = dlg.get_input()
        if new_name and new_name.strip():
            db.rename_business(self.business_id, new_name.strip())
            self.on_rename()

    def _delete(self):
        biz = db.get_business(self.business_id)
        msg = f"Delete '{biz['name']}'?"
        if not biz["parent_id"]:
            msg += "\n\nThis will also delete all its subsidiaries and their data."
        if messagebox.askyesno("Confirm delete", msg):
            db.delete_business(self.business_id)
            self.on_delete()


class DetailPane(ctk.CTkFrame):
    def __init__(self, master, on_change):
        super().__init__(master, fg_color="transparent")
        self.on_change = on_change
        self.business_id = None
        self._show_empty()

    def _show_empty(self):
        for w in self.winfo_children():
            w.destroy()
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

        for name in ("Overview", "Income", "Expenses", "Plans", "Phase"):
            tabs.add(name)

        OverviewTab(tabs.tab("Overview"), business_id,
                    on_rename=self.on_change, on_delete=self.on_change).pack(fill="both", expand=True)
        IncomeTab(tabs.tab("Income"), business_id).pack(fill="both", expand=True)
        ExpenseTab(tabs.tab("Expenses"), business_id).pack(fill="both", expand=True)
        PlansTab(tabs.tab("Plans"), business_id).pack(fill="both", expand=True)
        PhaseTab(tabs.tab("Phase"), business_id).pack(fill="both", expand=True)


class TopBar(ctk.CTkFrame):
    def __init__(self, master, on_currency_change, on_switch_profile, on_check_updates):
        super().__init__(master, height=56, corner_radius=0, fg_color="#1f1f1f")
        self.pack_propagate(False)
        self.on_currency_change = on_currency_change
        self.on_switch_profile = on_switch_profile
        self.on_check_updates = on_check_updates

        ctk.CTkLabel(
            self, text="Business Tracker",
            font=ctk.CTkFont(size=16, weight="bold"),
        ).pack(side="left", padx=20)

        self.sync_label = ctk.CTkLabel(
            self, text="Connecting...", text_color="gray60",
            font=ctk.CTkFont(size=11),
        )
        self.sync_label.pack(side="left", padx=8)

        # Profile badge — colored pill with current profile name; click to switch.
        active = user_profile.get_active() or "?"
        self.profile_btn = ctk.CTkButton(
            self, text=f"●  {active}", width=140, height=30,
            fg_color=user_profile.color_for(active),
            hover_color="#333333",
            command=self.on_switch_profile,
            font=ctk.CTkFont(size=12, weight="bold"),
        )
        self.profile_btn.pack(side="left", padx=(16, 0))

        # Version + manual check
        ctk.CTkButton(
            self, text="Check for updates", width=130, height=24,
            fg_color="transparent", hover_color="#333333",
            text_color="gray70", font=ctk.CTkFont(size=11, underline=True),
            command=self.on_check_updates,
        ).pack(side="left", padx=(12, 4))
        ctk.CTkLabel(
            self, text=f"v{__version__}", text_color="gray50",
            font=ctk.CTkFont(size=11),
        ).pack(side="left")

        # FX rate (right side first so currency picker sits inside it visually)
        ctk.CTkButton(
            self, text="Save Rate", width=90, command=self._save_rate
        ).pack(side="right", padx=(4, 16))

        self.rate_entry = ctk.CTkEntry(self, width=80)
        self.rate_entry.insert(0, f"{db.get_fx_rate():.2f}")
        self.rate_entry.pack(side="right", padx=4)

        ctk.CTkLabel(self, text="JMD per 1 USD:").pack(side="right", padx=(16, 4))

        self.currency_var = ctk.StringVar(value=db.get_display_currency())
        ctk.CTkOptionMenu(
            self, values=db.CURRENCIES, variable=self.currency_var,
            width=90, command=self._change_currency,
        ).pack(side="right", padx=4)

        ctk.CTkLabel(self, text="Display Currency:").pack(side="right", padx=(16, 4))

    def set_sync_status(self, text):
        try:
            self.sync_label.configure(text=text)
        except Exception:
            pass

    def refresh_profile_badge(self):
        active = user_profile.get_active() or "?"
        self.profile_btn.configure(
            text=f"●  {active}",
            fg_color=user_profile.color_for(active),
        )

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


class UpdateBanner(ctk.CTkFrame):
    """Yellow strip shown above the body when a newer release is on GitHub.
    Click 'Download' to open the release page in the default browser.
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
            hover_color="#dddddd", command=self._open,
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

    def _open(self):
        if self._info:
            webbrowser.open(self._info.html_url)


class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Business Tracker")
        self.geometry("1280x760")
        self.minsize(960, 600)

        self.topbar = TopBar(
            self,
            on_currency_change=self._on_currency_change,
            on_switch_profile=self._switch_profile,
            on_check_updates=lambda: self._check_for_updates(manual=True),
        )
        self.topbar.pack(side="top", fill="x")

        # Update banner sits between topbar and body — hidden until needed.
        self.update_banner = UpdateBanner(self)

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

    def _switch_profile(self):
        def _picked(_name):
            self.topbar.refresh_profile_badge()
            self.detail.show(self.sidebar.selected_id)
        ProfilePicker(self, on_pick=_picked, allow_cancel=True)

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
        """Called on the Tk main thread after a successful background sync."""
        from datetime import datetime as _dt
        self.topbar.set_sync_status(f"Synced {_dt.now().strftime('%H:%M:%S')}")
        # Refresh sidebar (new businesses might have been added remotely) and
        # the active detail view (totals may have changed).
        self.sidebar.refresh()
        self.detail.show(self.sidebar.selected_id)


def run():
    db.init_db()

    # Ensure we have an active profile before showing the main window.
    active = user_profile.get_active()
    if active:
        # Re-register in case the profile was created on another machine and
        # this client never inserted it locally / this is a fresh DB.
        try:
            db.add_profile(active)
        except Exception:
            pass
    else:
        # Modal profile picker on a tiny hidden root.
        picker_root = ctk.CTk()
        picker_root.withdraw()
        chosen = {"name": None}

        def _on_pick(name):
            chosen["name"] = name
            picker_root.quit()

        ProfilePicker(picker_root, on_pick=_on_pick, allow_cancel=False)
        picker_root.mainloop()
        picker_root.destroy()
        if not chosen["name"]:
            return  # user closed somehow; abort

    app = App()

    # Periodic background sync — pulls remote changes every 10s. Callbacks
    # fire on the sync thread, so we hop back to the Tk main loop.
    def _on_synced():
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
    try:
        app.mainloop()
    finally:
        db.stop_background_sync()
