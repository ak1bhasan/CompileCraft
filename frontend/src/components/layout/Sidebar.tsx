import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { ExampleFile } from '../../types/ide'
import FileExplorer from '../../features/files/FileExplorer'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  files: ExampleFile[]
  activeFileId: string
  onSelectFile: (fileId: string) => void
}

export default function Sidebar({
  collapsed,
  onToggle,
  files,
  activeFileId,
  onSelectFile,
}: SidebarProps) {
  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-[var(--cc-border)] bg-[var(--cc-surface)] transition-[width] duration-200 ${
        collapsed ? 'w-10' : 'w-60'
      }`}
    >
      <div className="flex h-9 items-center justify-end border-b border-[var(--cc-border)] px-1.5">
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--cc-text-muted)] transition-colors hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]"
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {collapsed ? (
        <div className="flex flex-1 items-start justify-center pt-3">
          <span className="rotate-180 text-[10px] tracking-[0.2em] text-[var(--cc-text-muted)] [writing-mode:vertical-rl]">
            EXPLORER
          </span>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <FileExplorer
            files={files}
            activeFileId={activeFileId}
            onSelectFile={onSelectFile}
          />
        </div>
      )}
    </aside>
  )
}
