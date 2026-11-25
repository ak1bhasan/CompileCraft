import { FileCode2 } from 'lucide-react'

interface EditorTabsProps {
  fileName: string
  filePath: string
}

export default function EditorTabs({ fileName, filePath }: EditorTabsProps) {
  return (
    <div className="flex h-9 shrink-0 items-end border-b border-[var(--cc-border)] bg-[var(--cc-bg)] px-2">
      <div
        className="flex h-8 items-center gap-2 rounded-t-md border border-b-0 border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] px-3 text-xs text-[var(--cc-text)]"
        title={filePath}
      >
        <FileCode2 size={13} className="text-[var(--cc-primary)]" />
        <span>{fileName}</span>
        <span className="text-[10px] text-[var(--cc-text-muted)]">example</span>
      </div>
    </div>
  )
}
