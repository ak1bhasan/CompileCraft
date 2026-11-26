import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { ExampleFile } from '../../types/ide'
import FileExplorer from '../../features/files/FileExplorer'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  files: ExampleFile[]
  activeFileId: string | null
  openFileIds: string[]
  dirtyFileIds: string[]
  onSelectFile: (fileId: string) => void
  onRenameFile?: (fileId: string, nextName: string) => void
}

export default function Sidebar({
  collapsed,
  onToggle,
  files,
  activeFileId,
  openFileIds,
  dirtyFileIds,
  onSelectFile,
  onRenameFile,
}: SidebarProps) {
  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-[var(--cc-border)] bg-[var(--cc-surface)] transition-[width] duration-200 ${
        collapsed ? 'w-10' : 'w-60'
      }`}
      aria-label="Explorer sidebar"
    >
      <div className="flex h-9 items-center gap-2 border-b border-[var(--cc-border)] px-1.5">
        {!collapsed ? (
          <h2 className="min-w-0 flex-1 truncate px-1.5 text-[11px] font-semibold tracking-[0.08em] text-[var(--cc-text-muted)] uppercase">
            Explorer
          </h2>
        ) : (
          <span className="flex-1" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--cc-text-muted)] transition-colors hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]"
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
            openFileIds={openFileIds}
            dirtyFileIds={dirtyFileIds}
            onSelectFile={onSelectFile}
            onRenameFile={onRenameFile}
          />
        </div>
      )}
    </aside>
  )
}
