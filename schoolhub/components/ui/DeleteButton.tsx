"use client";

type Action = (formData: FormData) => void | Promise<void>;

export function DeleteButton({
  action,
  id,
  label = "Delete",
  confirmText = "Delete this item? This cannot be undone.",
  className = "btn btn-danger btn-sm",
}: {
  action: Action;
  id: string;
  label?: string;
  confirmText?: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
