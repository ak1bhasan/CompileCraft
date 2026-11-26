import { AlertTriangle, FolderOpen } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

interface SaveWorkspaceDialogProps {
  open: boolean
  parentDir: string
  initialProjectName: string
  needsOverwriteConfirmation: boolean
  existingEntriesCount: number
  isSaving: boolean
  errorMessage: string
  onChangeDirectory: () => void
  onConfirm: (projectName: string, overwrite: boolean) => void
  onCancel: () => void
}

const INVALID_WINDOWS_CHARS_RE = /[<>:"/\\|?*]/
const RESERVED_WINDOWS_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

function validateProjectName(name: string): string {
  if (name.trim().length === 0) {
    return 'Project folder name cannot be empty.'
  }
  if (/^\s|\s$/.test(name) || name.endsWith('.')) {
    return 'Folder name cannot have leading/trailing spaces or end with a period.'
  }
  if (name === '.' || name === '..' || name.includes('..')) {
    return 'Invalid folder name.'
  }
  if (INVALID_WINDOWS_CHARS_RE.test(name)) {
    return 'Folder name cannot contain < > : " / \\ | ? *.'
  }
  const baseSegment = name.split('.')[0]
  if (RESERVED_WINDOWS_NAME_RE.test(name) || RESERVED_WINDOWS_NAME_RE.test(baseSegment)) {
    return 'Reserved Windows folder names are not allowed.'
  }
  return ''
}

function previewJoinedPath(parentDir: string, projectName: string): string {
  const cleanName = projectName || '<project-name>'
  if (!parentDir) {
    return cleanName
  }
  const sep = parentDir.includes('\\') ? '\\' : '/'
  return parentDir.endsWith('\\') || parentDir.endsWith('/')
    ? `${parentDir}${cleanName}`
    : `${parentDir}${sep}${cleanName}`
}

export default function SaveWorkspaceDialog({
  open,
  parentDir,
  initialProjectName,
  needsOverwriteConfirmation,
  existingEntriesCount,
  isSaving,
  errorMessage,
  onChangeDirectory,
  onConfirm,
  onCancel,
}: SaveWorkspaceDialogProps) {
  const [projectName, setProjectName] = useState(initialProjectName)
  const [localError, setLocalError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, parentDir])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!isSaving) {
          onCancel()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, isSaving, onCancel])

  if (!open) {
    return null
  }

  const displayedError = localError || errorMessage

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (isSaving) {
      return
    }
    const validationError = validateProjectName(projectName)
    if (validationError) {
      setLocalError(validationError)
      inputRef.current?.focus()
      return
    }
    setLocalError('')
    onConfirm(projectName, needsOverwriteConfirmation)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onCancel()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="save-workspace-dialog"
        style={{ boxShadow: 'var(--cc-shadow)' }}
        className="w-full max-w-md rounded-lg border border-[var(--cc-border)] bg-[var(--cc-surface)] p-5"
      >
        <h2 id={titleId} className="text-sm font-semibold text-[var(--cc-text)]">
          Save Workspace to Disk
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--cc-text-secondary)]">
          Save all folders, source files, and unsaved editor changes into a project directory.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <span className="block text-[11px] font-medium text-[var(--cc-text-secondary)]">
              Destination folder
            </span>
            <div className="mt-1 flex items-center gap-2">
              <div
                data-testid="save-workspace-parent-dir"
                title={parentDir}
                className="min-w-0 flex-1 truncate rounded-md border border-[var(--cc-border)] bg-[var(--cc-bg)] px-2.5 py-1.5 font-mono text-xs text-[var(--cc-text)]"
              >
                {parentDir}
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={onChangeDirectory}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] px-2.5 text-xs text-[var(--cc-text)] transition-colors hover:bg-[var(--cc-hover)] disabled:opacity-50"
              >
                <FolderOpen size={13} />
                Change…
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="save-workspace-project-name"
              className="block text-[11px] font-medium text-[var(--cc-text-secondary)]"
            >
              Project folder name
            </label>
            <input
              id="save-workspace-project-name"
              ref={inputRef}
              type="text"
              data-testid="save-workspace-name-input"
              disabled={isSaving}
              value={projectName}
              onChange={(event) => {
                setProjectName(event.target.value)
                if (localError) {
                  setLocalError('')
                }
              }}
              className="mt-1 h-8 w-full rounded-md border border-[var(--cc-border)] bg-[var(--cc-bg)] px-2.5 font-mono text-xs text-[var(--cc-text)] outline-none focus:border-[var(--cc-primary)]"
            />
            <p className="mt-1 truncate font-mono text-[11px] text-[var(--cc-text-muted)]">
              {previewJoinedPath(parentDir, projectName)}
            </p>
          </div>

          {needsOverwriteConfirmation ? (
            <div
              role="alert"
              data-testid="save-workspace-overwrite-warning"
              className="flex items-start gap-2 rounded-md border border-[var(--cc-warning)]/40 bg-[var(--cc-warning)]/10 p-2.5 text-xs text-[var(--cc-text)]"
            >
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--cc-warning)]" />
              <div>
                <p className="font-medium">Destination folder is not empty</p>
                <p className="mt-0.5 text-[11px] text-[var(--cc-text-secondary)]">
                  "{projectName}" already exists ({existingEntriesCount} item
                  {existingEntriesCount === 1 ? '' : 's'}). Existing files with matching paths
                  will be overwritten if you proceed, or choose a different project name.
                </p>
              </div>
            </div>
          ) : null}

          {displayedError ? (
            <p
              role="alert"
              data-testid="save-workspace-error"
              className="text-xs text-[var(--cc-danger-text)]"
            >
              {displayedError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isSaving}
              data-testid="save-workspace-cancel-btn"
              onClick={onCancel}
              className="h-8 rounded-md border border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] px-3 text-xs font-medium text-[var(--cc-text)] transition-colors hover:bg-[var(--cc-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              data-testid={
                needsOverwriteConfirmation
                  ? 'save-workspace-confirm-overwrite-btn'
                  : 'save-workspace-confirm-btn'
              }
              className={`h-8 rounded-md px-3 text-xs font-medium text-white transition-colors disabled:opacity-60 ${
                needsOverwriteConfirmation
                  ? 'bg-[var(--cc-danger)] hover:opacity-90'
                  : 'bg-[var(--cc-primary)] hover:bg-[var(--cc-primary-hover)]'
              }`}
            >
              {isSaving
                ? 'Saving…'
                : needsOverwriteConfirmation
                  ? 'Overwrite & Save'
                  : 'Save Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
