import { FileCode2, RotateCcw, Save, X } from 'lucide-react'
import type { WorkspaceDocument } from '../../types/ide'
import { isDocumentDirty } from './useWorkspace'

interface EditorTabsProps {
  tabs: WorkspaceDocument[]
  activeTabId: string | null
  onActivate: (fileId: string) => void
  onClose: (fileId: string) => void
  onSave: () => void
  onRevert: () => void
  canSave: boolean
  canRevert: boolean
}

export default function EditorTabs({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onSave,
  onRevert,
  canSave,
  canRevert,
}: EditorTabsProps) {
  return (
    <div className="flex h-9 min-w-0 shrink-0 items-stretch border-b border-[var(--cc-border)] bg-[var(--cc-surface)]">
      <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto overflow-y-hidden px-1">
        {tabs.length === 0 ? (
          <div className="flex h-8 items-center px-3 text-[11px] text-[var(--cc-text-muted)]">
            No files open
          </div>
        ) : (
          tabs.map((tab) => {
            const active = tab.id === activeTabId
            const dirty = isDocumentDirty(tab)
            return (
              <div
                key={tab.id}
                className={`group flex h-8 max-w-[160px] shrink-0 items-center gap-1 rounded-t-md border border-b-0 px-2 text-xs transition-colors ${
                  active
                    ? 'border-[var(--cc-border)] border-t-2 border-t-[var(--cc-primary)] bg-[var(--cc-editor-bg)] font-medium text-[var(--cc-text)]'
                    : 'border-transparent text-[var(--cc-text-secondary)] hover:bg-[var(--cc-hover)] hover:text-[var(--cc-text)]'
                }`}
                title={tab.path}
              >
                <button
                  type="button"
                  onClick={() => onActivate(tab.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <FileCode2
                    size={13}
                    className={
                      active
                        ? 'shrink-0 text-[var(--cc-primary)]'
                        : 'shrink-0 text-[var(--cc-text-muted)]'
                    }
                  />
                  <span className="truncate">{tab.name}</span>
                  {dirty ? (
                    <span
                      className="shrink-0 text-[var(--cc-primary-hover)]"
                      title="Unsaved changes (session only)"
                      aria-label="Unsaved changes"
                    >
                      ●
                    </span>
                  ) : (
                    <span className="w-2 shrink-0" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose(tab.id)
                  }}
                  title={`Close ${tab.name}`}
                  aria-label={`Close ${tab.name}`}
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--cc-text-muted)] opacity-70 transition-colors hover:bg-[var(--cc-bg)] hover:text-[var(--cc-text)] group-hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1 border-l border-[var(--cc-border)] bg-[var(--cc-bg)] px-1.5">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          title="Save active file (Ctrl+S)"
          aria-label="Save session baseline"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-[var(--cc-text-muted)] transition-colors enabled:hover:bg-[var(--cc-surface-elevated)] enabled:hover:text-[var(--cc-text)] disabled:opacity-40"
        >
          <Save size={12} />
          Save
        </button>
        <button
          type="button"
          onClick={onRevert}
          disabled={!canRevert}
          title="Revert to last session baseline"
          aria-label="Revert session changes"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-[var(--cc-text-muted)] transition-colors enabled:hover:bg-[var(--cc-surface-elevated)] enabled:hover:text-[var(--cc-text)] disabled:opacity-40"
        >
          <RotateCcw size={12} />
          Revert
        </button>
      </div>
    </div>
  )
}
