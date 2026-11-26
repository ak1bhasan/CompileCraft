import { useEffect, useRef } from 'react'
import {
  IDE_SHORTCUT_REFERENCE,
  shortcutLabel,
} from './keyboardShortcuts'

interface KeyboardShortcutsMenuProps {
  open: boolean
  onClose: () => void
}

export default function KeyboardShortcutsMenu({
  open,
  onClose,
}: KeyboardShortcutsMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current && !panelRef.current.contains(target)) {
        const trigger = (event.target as HTMLElement | null)?.closest(
          '[data-shortcuts-trigger="true"]',
        )
        if (!trigger) {
          onClose()
        }
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  const ideShortcuts = IDE_SHORTCUT_REFERENCE.filter(
    (entry) => entry.owner === 'ide',
  )
  const monacoShortcuts = IDE_SHORTCUT_REFERENCE.filter(
    (entry) => entry.owner === 'monaco',
  )

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="Keyboard shortcuts"
      style={{ boxShadow: 'var(--cc-shadow)' }}
      className="absolute top-full right-0 z-40 mt-1 w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] p-3"
    >
      <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--cc-text)]">
        Keyboard shortcuts
      </p>

      <ShortcutGroup title="IDE" entries={ideShortcuts} />
      <ShortcutGroup title="Editor" entries={monacoShortcuts} />

      <p className="mt-3 text-[10px] leading-relaxed text-[var(--cc-text-muted)]">
        Session save updates the in-memory baseline only — nothing is written to
        disk.
      </p>
    </div>
  )
}

function ShortcutGroup({
  title,
  entries,
}: {
  title: string
  entries: typeof IDE_SHORTCUT_REFERENCE
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-text-muted)]">
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="text-[var(--cc-text-muted)]">{entry.action}</span>
            <kbd className="shrink-0 rounded border border-[var(--cc-border)] bg-[var(--cc-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--cc-primary-hover)]">
              {shortcutLabel(entry)}
            </kbd>
          </li>
        ))}
      </ul>
    </div>
  )
}
