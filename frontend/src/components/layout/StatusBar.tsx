import type {
  CursorPosition,
  EditorSettings,
  LanguageId,
} from '../../types/ide'
import { languageLabel } from '../../types/ide'

interface StatusBarProps {
  language: LanguageId | null
  cursor: CursorPosition
  status: string
  editorSettings: EditorSettings
}

export default function StatusBar({
  language,
  cursor,
  status,
  editorSettings,
}: StatusBarProps) {
  return (
    <footer className="flex h-6 shrink-0 items-center justify-between gap-3 border-t border-[var(--cc-border)] bg-[var(--cc-surface)] px-3 text-[11px] text-[var(--cc-text-muted)]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-[var(--cc-primary)]">{status}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span>
          {language ? `Ln ${cursor.line}, Col ${cursor.column}` : 'Ln —, Col —'}
        </span>
        <span>Spaces: {editorSettings.tabSize}</span>
        <span>Wrap: {editorSettings.wordWrap === 'on' ? 'On' : 'Off'}</span>
        <span>UTF-8</span>
        <span>{language ? languageLabel(language) : '—'}</span>
      </div>
    </footer>
  )
}
