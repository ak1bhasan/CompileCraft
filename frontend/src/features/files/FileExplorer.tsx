import {
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileType,
  Folder,
  FolderOpen,
  Pencil,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExampleFile } from '../../types/ide'
import { splitFilename, validateRenameStem } from './fileRenameValidation'

interface FileExplorerProps {
  files: ExampleFile[]
  activeFileId: string | null
  openFileIds: string[]
  dirtyFileIds: string[]
  onSelectFile: (fileId: string) => void
  onRenameFile?: (fileId: string, nextName: string) => void
}

interface TreeFolder {
  name: string
  path: string
  folders: TreeFolder[]
  files: ExampleFile[]
}

interface RenameSessionProps {
  editingFileId: string | null
  draftStem: string
  renameError: string
  onDraftChange: (value: string) => void
  onStartRename: (file: ExampleFile) => void
  onConfirmRename: (file: ExampleFile) => void
  onCancelRename: () => void
  onContextMenu: (file: ExampleFile, x: number, y: number) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

function buildTree(files: ExampleFile[]): TreeFolder {
  const root: TreeFolder = { name: 'demo-workspace', path: '', folders: [], files: [] }

  for (const file of files) {
    const parts = file.path.split('/')
    let node = root

    for (let index = 0; index < parts.length - 1; index += 1) {
      const segment = parts[index]
      let child = node.folders.find((folder) => folder.name === segment)
      if (!child) {
        child = {
          name: segment,
          path: parts.slice(0, index + 1).join('/'),
          folders: [],
          files: [],
        }
        node.folders.push(child)
      }
      node = child
    }

    node.files.push(file)
  }

  return root
}

function fileIcon(language: ExampleFile['language']) {
  switch (language) {
    case 'c':
      return <FileCode2 size={14} className="text-sky-400" />
    case 'cpp':
      return <FileCode2 size={14} className="text-blue-400" />
    case 'java':
      return <FileType size={14} className="text-amber-400" />
    default:
      return <FileCode2 size={14} className="text-[var(--cc-text-muted)]" />
  }
}

function FolderNode({
  folder,
  depth,
  activeFileId,
  openFileIds,
  dirtyFileIds,
  onSelectFile,
  canRename,
  rename,
}: {
  folder: TreeFolder
  depth: number
  activeFileId: string | null
  openFileIds: string[]
  dirtyFileIds: string[]
  onSelectFile: (fileId: string) => void
  canRename: boolean
  rename: RenameSessionProps
}) {
  const [open, setOpen] = useState(true)
  const paddingLeft = 8 + depth * 12

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} folder ${folder.name}`}
        className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs text-[var(--cc-text-muted)] transition-colors hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]"
        style={{ paddingLeft }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {open ? <FolderOpen size={14} /> : <Folder size={14} />}
        <span className="truncate">{folder.name}</span>
      </button>

      {open ? (
        <div>
          {folder.folders.map((child) => (
            <FolderNode
              key={child.path}
              folder={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              openFileIds={openFileIds}
              dirtyFileIds={dirtyFileIds}
              onSelectFile={onSelectFile}
              canRename={canRename}
              rename={rename}
            />
          ))}
          {folder.files.map((file) => {
            const active = file.id === activeFileId
            const isOpen = openFileIds.includes(file.id)
            const dirty = dirtyFileIds.includes(file.id)
            const isEditing = rename.editingFileId === file.id
            const { extension } = splitFilename(file.name)

            if (isEditing) {
              return (
                <div
                  key={file.id}
                  className="space-y-1 py-1 pr-2"
                  style={{ paddingLeft: paddingLeft + 16 }}
                >
                  <div className="flex items-center gap-1 rounded border border-[var(--cc-primary)] bg-[var(--cc-bg)] px-1.5 py-0.5">
                    {fileIcon(file.language)}
                    <input
                      ref={rename.inputRef}
                      type="text"
                      data-testid="rename-file-input"
                      aria-label={`Rename ${file.name}`}
                      value={rename.draftStem}
                      onChange={(event) => rename.onDraftChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          rename.onConfirmRename(file)
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          rename.onCancelRename()
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent font-mono text-xs text-[var(--cc-text)] outline-none"
                    />
                    {extension ? (
                      <span
                        data-testid="rename-file-ext"
                        className="shrink-0 select-none font-mono text-[11px] text-[var(--cc-text-muted)]"
                      >
                        {extension}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      data-testid="rename-confirm-btn"
                      aria-label="Confirm rename"
                      onClick={() => rename.onConfirmRename(file)}
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-emerald-400 hover:bg-[var(--cc-surface-elevated)]"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      data-testid="rename-cancel-btn"
                      aria-label="Cancel rename"
                      onClick={rename.onCancelRename}
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--cc-text-muted)] hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {rename.renameError ? (
                    <p
                      role="alert"
                      data-testid="rename-error-message"
                      className="text-[11px] leading-snug text-rose-400"
                    >
                      {rename.renameError}
                    </p>
                  ) : null}
                </div>
              )
            }

            return (
              <div
                key={file.id}
                onContextMenu={(event) => {
                  if (!canRename) {
                    return
                  }
                  event.preventDefault()
                  rename.onContextMenu(file, event.clientX, event.clientY)
                }}
                className={`group flex w-full items-center gap-1.5 py-1 pr-2 text-xs transition-colors ${
                  active
                    ? 'bg-[var(--cc-primary)]/15 text-[var(--cc-text)]'
                    : 'text-[var(--cc-text-muted)] hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]'
                }`}
                style={{ paddingLeft: paddingLeft + 16 }}
              >
                <button
                  type="button"
                  data-testid={`explorer-file-${file.id}`}
                  onClick={() => onSelectFile(file.id)}
                  aria-current={active ? 'page' : undefined}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  title={`${file.path} (in-memory example)`}
                >
                  {fileIcon(file.language)}
                  <span className={`truncate ${isOpen && !active ? 'text-[var(--cc-text)]' : ''}`}>
                    {file.name}
                  </span>
                </button>
                {dirty ? (
                  <span
                    className="shrink-0 text-[var(--cc-primary-hover)]"
                    title="Unsaved changes (session only)"
                    aria-label="Unsaved changes"
                  >
                    ●
                  </span>
                ) : null}
                {canRename ? (
                  <button
                    type="button"
                    data-testid={`rename-file-btn-${file.id}`}
                    aria-label={`Rename ${file.name}`}
                    title={`Rename ${file.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      rename.onStartRename(file)
                    }}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-[var(--cc-surface-elevated)] text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
                  >
                    <Pencil size={11} />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default function FileExplorer({
  files,
  activeFileId,
  openFileIds,
  dirtyFileIds,
  onSelectFile,
  onRenameFile,
}: FileExplorerProps) {
  const tree = useMemo(() => buildTree(files), [files])
  const [editingFileId, setEditingFileId] = useState<string | null>(null)
  const [draftStem, setDraftStem] = useState('')
  const [renameError, setRenameError] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    file: ExampleFile
    x: number
    y: number
  } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingFileId) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingFileId])

  useEffect(() => {
    if (!contextMenu) {
      return
    }
    const closeMenu = () => setContextMenu(null)
    window.addEventListener('click', closeMenu)
    window.addEventListener('blur', closeMenu)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('blur', closeMenu)
    }
  }, [contextMenu])

  const startRename = (file: ExampleFile) => {
    const { stem } = splitFilename(file.name)
    setContextMenu(null)
    setEditingFileId(file.id)
    setDraftStem(stem)
    setRenameError('')
  }

  const cancelRename = () => {
    setEditingFileId(null)
    setDraftStem('')
    setRenameError('')
  }

  const confirmRename = (file: ExampleFile) => {
    const result = validateRenameStem(file.id, draftStem, file.name, files)
    if (!result.valid) {
      setRenameError(result.error)
      inputRef.current?.focus()
      return
    }
    if (result.nextName !== file.name) {
      onRenameFile?.(file.id, result.nextName)
    }
    cancelRename()
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 overflow-auto py-1">
        <FolderNode
          folder={tree}
          depth={0}
          activeFileId={activeFileId}
          openFileIds={openFileIds}
          dirtyFileIds={dirtyFileIds}
          onSelectFile={onSelectFile}
          canRename={Boolean(onRenameFile)}
          rename={{
            editingFileId,
            draftStem,
            renameError,
            onDraftChange: (value) => {
              setDraftStem(value)
              if (renameError) {
                setRenameError('')
              }
            },
            onStartRename: startRename,
            onConfirmRename: confirmRename,
            onCancelRename: cancelRename,
            onContextMenu: (file, x, y) => setContextMenu({ file, x, y }),
            inputRef,
          }}
        />
      </div>
      {contextMenu ? (
        <div
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 min-w-28 rounded-md border border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="context-menu-rename"
            onClick={() => startRename(contextMenu.file)}
            className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-[var(--cc-text)] hover:bg-[var(--cc-primary)]/20"
          >
            <Pencil size={12} />
            Rename
          </button>
        </div>
      ) : null}
      <p className="border-t border-[var(--cc-border)] px-3 py-2 text-[10px] text-[var(--cc-text-muted)]">
        In-memory demos • Compiles via CLI
      </p>
    </div>
  )
}
