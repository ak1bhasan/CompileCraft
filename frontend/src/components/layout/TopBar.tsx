import { FolderGit2, Keyboard, Loader2, Play, Settings, Square } from 'lucide-react'
import { useState } from 'react'
import EditorSettingsMenu from '../../features/editor/EditorSettingsMenu'
import KeyboardShortcutsMenu from '../../features/editor/KeyboardShortcutsMenu'
import {
  LANGUAGE_OPTIONS,
  type EditorSettings,
  type LanguageId,
} from '../../types/ide'

interface TopBarProps {
  projectName: string
  language: LanguageId | null
  onLanguageChange: (language: LanguageId) => void
  onRun: () => void
  onStop: () => void
  canRun: boolean
  isCompiling: boolean
  editorSettings: EditorSettings
  onEditorSettingsChange: (settings: EditorSettings) => void
}

export default function TopBar({
  projectName,
  language,
  onLanguageChange,
  onRun,
  onStop,
  canRun,
  isCompiling,
  editorSettings,
  onEditorSettingsChange,
}: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const openSettings = () => {
    setShortcutsOpen(false)
    setSettingsOpen((value) => !value)
  }

  const openShortcuts = () => {
    setSettingsOpen(false)
    setShortcutsOpen((value) => !value)
  }

  return (
    <header className="relative flex h-11 shrink-0 items-center gap-3 border-b border-[var(--cc-border)] bg-[var(--cc-surface)] px-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--cc-primary)]/20 text-[var(--cc-primary)]">
          <FolderGit2 size={15} strokeWidth={2} />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold tracking-wide text-[var(--cc-text)]">
            CompileCraft
          </p>
          <p className="truncate text-[11px] text-[var(--cc-text-muted)]">
            {projectName}
          </p>
        </div>
      </div>

      <div className="mx-auto flex items-center gap-2">
        <label className="sr-only" htmlFor="language-selector">
          Language
        </label>
        <select
          id="language-selector"
          value={language ?? ''}
          onChange={(event) => {
            const next = event.target.value
            if (!next) {
              return
            }
            onLanguageChange(next as LanguageId)
          }}
          className="h-8 rounded-md border border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] px-2 text-xs text-[var(--cc-text)] outline-none transition-colors hover:border-[var(--cc-primary)]/40 focus:border-[var(--cc-primary)]"
        >
          {language === null ? (
            <option value="">Open language…</option>
          ) : null}
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={!canRun || isCompiling}
          aria-busy={isCompiling}
          onClick={onRun}
          aria-label={isCompiling ? 'Running program' : 'Run compiler'}
          title={
            !canRun
              ? 'Open a file to compile and run'
              : isCompiling
                ? 'Compiling & executing active editor…'
                : 'Compile and execute active editor (Ctrl+Enter)'
          }
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
            !canRun || isCompiling
              ? 'border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] text-[var(--cc-text-muted)] opacity-60'
              : 'border-[var(--cc-primary)] bg-[var(--cc-primary)]/20 text-[var(--cc-primary-hover)] hover:bg-[var(--cc-primary)]/30 hover:text-[var(--cc-text)]'
          }`}
        >
          {isCompiling ? (
            <Loader2 size={13} strokeWidth={2} className="animate-spin" />
          ) : (
            <Play size={13} strokeWidth={2} />
          )}
          {isCompiling ? 'Running…' : 'Run'}
        </button>

        {isCompiling ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop execution"
            title="Stop active compilation or execution"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-500/50 bg-rose-500/20 px-2.5 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/30"
          >
            <Square size={12} strokeWidth={2} />
            Stop
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <div className="relative">
          <button
            type="button"
            data-shortcuts-trigger="true"
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            aria-expanded={shortcutsOpen}
            aria-haspopup="dialog"
            onClick={openShortcuts}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              shortcutsOpen
                ? 'bg-[var(--cc-primary)]/20 text-[var(--cc-primary-hover)]'
                : 'text-[var(--cc-text-muted)] hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]'
            }`}
          >
            <Keyboard size={15} strokeWidth={2} />
          </button>
          <KeyboardShortcutsMenu
            open={shortcutsOpen}
            onClose={() => setShortcutsOpen(false)}
          />
        </div>

        <div className="relative">
          <button
            type="button"
            data-settings-trigger="true"
            title="Editor settings"
            aria-label="Editor settings"
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            onClick={openSettings}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              settingsOpen
                ? 'bg-[var(--cc-primary)]/20 text-[var(--cc-primary-hover)]'
                : 'text-[var(--cc-text-muted)] hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]'
            }`}
          >
            <Settings size={15} strokeWidth={2} />
          </button>
          <EditorSettingsMenu
            open={settingsOpen}
            settings={editorSettings}
            onChange={onEditorSettingsChange}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      </div>
    </header>
  )
}
