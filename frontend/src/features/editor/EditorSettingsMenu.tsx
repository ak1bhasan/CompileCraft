import { useEffect, useId, useRef, type ReactNode } from 'react'
import {
  DEFAULT_EDITOR_SETTINGS,
  FONT_SIZE_OPTIONS,
  TAB_SIZE_OPTIONS,
  type EditorSettings,
  type FontSizeOption,
  type LineNumbersOption,
  type TabSizeOption,
  type WordWrapOption,
} from '../../types/ide'

interface EditorSettingsMenuProps {
  open: boolean
  settings: EditorSettings
  onChange: (next: EditorSettings) => void
  onClose: () => void
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-xs text-[var(--cc-text-muted)]">
        {label}
      </label>
      {children}
    </div>
  )
}

const selectClassName =
  'h-7 min-w-[5.5rem] rounded-md border border-[var(--cc-border)] bg-[var(--cc-bg)] px-2 text-xs text-[var(--cc-text)] outline-none transition-colors hover:border-[var(--cc-primary)]/40 focus-visible:border-[var(--cc-primary)]'

export default function EditorSettingsMenu({
  open,
  settings,
  onChange,
  onClose,
}: EditorSettingsMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const baseId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current && !panelRef.current.contains(target)) {
        const trigger = (event.target as HTMLElement | null)?.closest(
          '[data-settings-trigger="true"]',
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

  const patch = (partial: Partial<EditorSettings>) => {
    onChange({ ...settings, ...partial })
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="Editor settings"
      className="absolute top-full right-0 z-40 mt-1 w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-[var(--cc-border)] bg-[var(--cc-surface)] p-3 shadow-xl shadow-black/40"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-[var(--cc-text)]">
          Editor settings
        </p>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_EDITOR_SETTINGS })}
          className="h-6 rounded-md px-2 text-[11px] text-[var(--cc-primary-hover)] transition-colors hover:bg-[var(--cc-surface-elevated)]"
        >
          Reset to Defaults
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <Field id={`${baseId}-font`} label="Font size">
          <select
            id={`${baseId}-font`}
            className={selectClassName}
            value={settings.fontSize}
            onChange={(event) =>
              patch({ fontSize: Number(event.target.value) as FontSizeOption })
            }
          >
            {FONT_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} px
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${baseId}-wrap`} label="Word wrap">
          <select
            id={`${baseId}-wrap`}
            className={selectClassName}
            value={settings.wordWrap}
            onChange={(event) =>
              patch({ wordWrap: event.target.value as WordWrapOption })
            }
          >
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </Field>

        <Field id={`${baseId}-minimap`} label="Minimap">
          <select
            id={`${baseId}-minimap`}
            className={selectClassName}
            value={settings.minimap ? 'on' : 'off'}
            onChange={(event) => patch({ minimap: event.target.value === 'on' })}
          >
            <option value="on">Enabled</option>
            <option value="off">Disabled</option>
          </select>
        </Field>

        <Field id={`${baseId}-lines`} label="Line numbers">
          <select
            id={`${baseId}-lines`}
            className={selectClassName}
            value={settings.lineNumbers}
            onChange={(event) =>
              patch({ lineNumbers: event.target.value as LineNumbersOption })
            }
          >
            <option value="on">Visible</option>
            <option value="off">Hidden</option>
          </select>
        </Field>

        <Field id={`${baseId}-tab`} label="Tab size">
          <select
            id={`${baseId}-tab`}
            className={selectClassName}
            value={settings.tabSize}
            onChange={(event) =>
              patch({ tabSize: Number(event.target.value) as TabSizeOption })
            }
          >
            {TAB_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} spaces
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-[var(--cc-text-muted)]">
        Session only — settings reset when the app reloads.
      </p>
    </div>
  )
}
