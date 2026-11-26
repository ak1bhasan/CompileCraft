import { FolderPlus, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useState } from 'react'
import type { ExampleFile } from '../../types/ide'
import FileExplorer from '../../features/files/FileExplorer'
import { SIDEBAR_WIDTH_BOUNDS } from '../../features/layout/panelLayout'
import ResizeHandle from './ResizeHandle'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  width: number
  onWidthChange: (width: number) => void
  workspaceLabel?: string
  diskRoot?: string | null
  files: ExampleFile[]
  folders?: string[]
  activeFileId: string | null
  openFileIds: string[]
  dirtyFileIds: string[]
  onSelectFile: (fileId: string) => void
  onRenameFile?: (fileId: string, nextName: string) => void | Promise<boolean | void>
  onCreateFolder?: (parentPath: string, folderName: string) => void | Promise<boolean | void>
  onMoveFile?: (fileId: string, targetFolderPath: string) => void | Promise<boolean | void>
}

export default function Sidebar({
  collapsed,
  onToggle,
  width,
  onWidthChange,
  workspaceLabel,
  diskRoot = null,
  files,
  folders = [],
  activeFileId,
  openFileIds,
  dirtyFileIds,
  onSelectFile,
  onRenameFile,
  onCreateFolder,
  onMoveFile,
}: SidebarProps) {
  const [dragging, setDragging] = useState(false)
  const [newFolderTrigger, setNewFolderTrigger] = useState<{
    parentPath: string
    seq: number
  } | null>(null)

  return (
    <div className="flex shrink-0">
      <aside
        data-testid="explorer-sidebar"
        style={collapsed ? undefined : { width: `${width}px`, maxWidth: '45vw' }}
        className={`flex shrink-0 flex-col border-r border-[var(--cc-border)] bg-[var(--cc-sidebar)] ${
          collapsed ? 'w-10 transition-[width] duration-200' : dragging ? 'select-none' : ''
        }`}
        aria-label="Explorer sidebar"
      >
      <div className="flex h-9 items-center gap-1 border-b border-[var(--cc-border)] px-1.5">
        {!collapsed ? (
          <h2 className="min-w-0 flex-1 truncate px-1.5 text-[11px] font-semibold tracking-[0.08em] text-[var(--cc-text-secondary)] uppercase">
            Explorer
          </h2>
        ) : (
          <span className="flex-1" aria-hidden="true" />
        )}
        {!collapsed && onCreateFolder ? (
          <button
            type="button"
            data-testid="explorer-new-folder-btn"
            onClick={() =>
              setNewFolderTrigger((prev) => ({
                parentPath: '',
                seq: (prev?.seq ?? 0) + 1,
              }))
            }
            aria-label="New Folder"
            title="New Folder"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--cc-text-muted)] transition-colors hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]"
          >
            <FolderPlus size={14} />
          </button>
        ) : null}
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
            workspaceLabel={workspaceLabel}
            diskRoot={diskRoot}
            files={files}
            folders={folders}
            activeFileId={activeFileId}
            openFileIds={openFileIds}
            dirtyFileIds={dirtyFileIds}
            newFolderTrigger={newFolderTrigger}
            onSelectFile={onSelectFile}
            onRenameFile={onRenameFile}
            onCreateFolder={onCreateFolder}
            onMoveFile={onMoveFile}
          />
        </div>
      )}
    </aside>
    {!collapsed ? (
      <ResizeHandle
        orientation="vertical"
        direction={1}
        value={width}
        min={SIDEBAR_WIDTH_BOUNDS.min}
        max={SIDEBAR_WIDTH_BOUNDS.max}
        label="Resize Explorer sidebar"
        testId="resize-sidebar"
        onChange={onWidthChange}
        onDragStateChange={setDragging}
      />
    ) : null}
    </div>
  )
}
