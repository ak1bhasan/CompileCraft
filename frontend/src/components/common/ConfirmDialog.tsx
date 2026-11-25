interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cc-confirm-title"
        aria-describedby="cc-confirm-description"
        className="w-full max-w-md rounded-lg border border-[var(--cc-border)] bg-[var(--cc-surface)] p-5 shadow-xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="cc-confirm-title"
          className="text-sm font-semibold text-[var(--cc-text)]"
        >
          {title}
        </h2>
        <p
          id="cc-confirm-description"
          className="mt-2 text-xs leading-relaxed text-[var(--cc-text-muted)]"
        >
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-md border border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] px-3 text-xs text-[var(--cc-text)] transition-colors hover:border-[var(--cc-primary)]/40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 rounded-md bg-[var(--cc-primary)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--cc-primary-hover)]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
