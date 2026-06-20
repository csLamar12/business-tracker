"""Reusable @-mention autocomplete for Tk text inputs.

Attaches to the underlying Tk widget of either a CTkEntry (`entry._entry`,
a tk.Entry), a bare inline tk.Entry (the DataTable cell editor), or a
CTkTextbox (`textbox._textbox`, a tk.Text — pass is_text=True).

Typing '@' opens a small borderless popup listing matching profile names.
Up/Down navigate, Return/Tab pick, Escape dismisses, click also picks. The
host widget keeps keyboard focus the whole time; the popup is purely visual.
"""

import tkinter as tk


def _is_word_char(ch):
    return ch.isalnum() or ch == "_"


class MentionAutocomplete:
    def __init__(self, widget, get_names, is_text=False):
        self.widget = widget
        self.get_names = get_names
        self.is_text = is_text
        self.popup = None
        self.listbox = None
        self._at_index = None  # char offset of the active '@' within the line/text

        widget.bind("<KeyRelease>", self._on_key_release, add="+")
        for seq in ("<Up>", "<Down>", "<Return>", "<Tab>", "<Escape>"):
            widget.bind(seq, self._on_nav, add="+")
        widget.bind("<FocusOut>", self._on_focus_out, add="+")
        widget.bind("<Button-1>", lambda _e: self._hide(), add="+")

    # ---------- text accessors (Entry vs Text) ----------

    def _text_before_cursor(self):
        if self.is_text:
            return self.widget.get("1.0", "insert")
        s = self.widget.get()
        try:
            pos = self.widget.index("insert")
        except tk.TclError:
            pos = len(s)
        return s[:pos]

    def _caret_bbox(self):
        try:
            if self.is_text:
                return self.widget.bbox("insert")
            return self.widget.bbox(self.widget.index("insert"))
        except tk.TclError:
            return None

    def _replace_token_with(self, name):
        """Replace the active '@<partial>' (from self._at_index to cursor) with
        '@<name> '."""
        if self._at_index is None:
            return
        replacement = f"@{name} "
        if self.is_text:
            start = self.widget.index(f"1.0+{self._at_index}c")
            self.widget.delete(start, "insert")
            self.widget.insert(start, replacement)
        else:
            cursor = self.widget.index("insert")
            self.widget.delete(self._at_index, cursor)
            self.widget.insert(self._at_index, replacement)
            self.widget.icursor(self._at_index + len(replacement))

    # ---------- token detection ----------

    def _active_token(self):
        """Return (at_index, partial) if the cursor is inside an @-mention being
        typed, else None. at_index is the char offset of '@' from the start of
        the text (Text) or the line (Entry — single line so same thing)."""
        before = self._text_before_cursor()
        at = before.rfind("@")
        if at < 0:
            return None
        # '@' must start the text or follow a non-word char (so emails like
        # foo@bar don't trigger the picker).
        if at > 0 and _is_word_char(before[at - 1]):
            return None
        partial = before[at + 1:]
        if "\n" in partial:
            return None
        return at, partial

    # ---------- popup lifecycle ----------

    def _candidates(self, partial):
        names = self.get_names() or []
        p = partial.lower()
        return [n for n in names if n and n.lower().startswith(p)]

    def _on_key_release(self, event):
        # Navigation keys are handled in _on_nav; ignore them here.
        if event.keysym in ("Up", "Down", "Return", "Tab", "Escape",
                            "Left", "Right"):
            return
        tok = self._active_token()
        if tok is None:
            self._hide()
            return
        at_index, partial = tok
        cands = self._candidates(partial)
        if not cands:
            self._hide()
            return
        self._at_index = at_index
        self._show(cands)

    def _show(self, candidates):
        bbox = self._caret_bbox()
        if bbox is None:
            self._hide()
            return
        x, y, _w, h = bbox
        rx = self.widget.winfo_rootx() + x
        ry = self.widget.winfo_rooty() + y + h + 2

        if self.popup is None or not self.popup.winfo_exists():
            self.popup = tk.Toplevel(self.widget)
            self.popup.wm_overrideredirect(True)
            try:
                self.popup.wm_attributes("-topmost", True)
            except tk.TclError:
                pass
            self.listbox = tk.Listbox(
                self.popup, activestyle="none", exportselection=False,
                bg="#2b2b2b", fg="white", highlightthickness=1,
                highlightbackground="#1f6aa5", selectbackground="#1f6aa5",
                selectforeground="white", borderwidth=0, font=("", 12),
            )
            self.listbox.pack(fill="both", expand=True)
            self.listbox.bind("<ButtonRelease-1>", self._on_click)

        self.listbox.delete(0, "end")
        for name in candidates:
            self.listbox.insert("end", name)
        self.listbox.selection_clear(0, "end")
        self.listbox.selection_set(0)
        self.listbox.activate(0)

        height = min(6, len(candidates))
        self.listbox.configure(height=height)
        width = max((len(n) for n in candidates), default=10)
        self.listbox.configure(width=min(40, max(12, width + 2)))
        self.popup.wm_geometry(f"+{rx}+{ry}")
        self.popup.deiconify()
        self.popup.lift()

    def _hide(self):
        self._at_index = None
        if self.popup is not None:
            try:
                self.popup.destroy()
            except tk.TclError:
                pass
        self.popup = None
        self.listbox = None

    def _visible(self):
        return self.popup is not None and self.popup.winfo_exists()

    # ---------- navigation / selection ----------

    def _move(self, delta):
        if not self.listbox:
            return
        size = self.listbox.size()
        if not size:
            return
        cur = self.listbox.curselection()
        idx = (cur[0] if cur else 0) + delta
        idx = max(0, min(size - 1, idx))
        self.listbox.selection_clear(0, "end")
        self.listbox.selection_set(idx)
        self.listbox.activate(idx)
        self.listbox.see(idx)

    def _accept(self):
        if not self.listbox:
            return
        cur = self.listbox.curselection()
        idx = cur[0] if cur else 0
        try:
            name = self.listbox.get(idx)
        except tk.TclError:
            name = None
        # Replace BEFORE hiding — _hide() clears self._at_index.
        if name:
            self._replace_token_with(name)
        self._hide()

    def _on_nav(self, event):
        if not self._visible():
            return  # let the widget/toplevel handle it normally
        key = event.keysym
        if key == "Up":
            self._move(-1)
        elif key == "Down":
            self._move(1)
        elif key in ("Return", "Tab"):
            self._accept()
        elif key == "Escape":
            self._hide()
        return "break"  # consume so the host form doesn't also act on it

    def _on_click(self, _event):
        self._accept()
        try:
            self.widget.focus_set()
        except tk.TclError:
            pass
        return "break"

    def _on_focus_out(self, _event):
        # Defer: a click on the listbox momentarily steals focus; only hide if
        # focus didn't move into our popup.
        self.widget.after(120, self._maybe_hide_on_blur)

    def _maybe_hide_on_blur(self):
        if not self._visible():
            return
        try:
            focused = self.widget.focus_get()
        except (KeyError, tk.TclError):
            focused = None
        if focused is not self.listbox:
            self._hide()
