import {
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileType,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Pencil,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExampleFile } from '../../types/ide'
import {
  normalizeRelativePath,
  parentFolderOf,
  splitFilename,
  validateFolderName,
  validateRenameStem,
} from './fileRenameValidation'

interface FileExplorerProps {
  workspaceLabel?: string
  diskRoot?: string | null
  files: ExampleFile[]
  folders?: string[]
  activeFileId: string | null
  openFileIds: string[]
  dirtyFileIds: string[]
  newFolderTrigger?: { parentPath: string; seq: number } | null
  onSelectFile: (fileId: string) => void
  onRenameFile?: (fileId: string, nextName: string) => void | Promise<boolean | void>
  onCreateFolder?: (parentPath: string, folderName: string) => void | Promise<boolean | void>
  onMoveFile?: (fileId: string, targetFolderPath: string) => void | Promise<boolean | void>
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
  onFileContextMenu: (file: ExampleFile, x: number, y: number) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

interface FolderSessionProps {
  expandedFolders: Record<string, boolean>
  onToggleFolder: (folderPath: string) => void
  newFolderParentPath: string | null
  newFolderDraft: string
  newFolderError: string
  onNewFolderDraftChange: (value: string) => void
  onStartNewFolder: (parentPath: string) => void
  onConfirmNewFolder: () => void
  onCancelNewFolder: () => void
  onFolderContextMenu: (folderPath: string, x: number, y: number) => void
  dragOverFolderPath: string | null
  onDragStartFile: (fileId: string) => void
  onDragOverFolder: (folderPath: string | null) => void
  onDropOnFolder: (folderPath: string, draggedFileId: string | null) => void
  newFolderInputRef: React.RefObject<HTMLInputElement | null>
}

function buildTree(
  files: ExampleFile[],
  explicitFolders: ReadonlyArray<string>,
  rootLabel: string,
): TreeFolder {
  const root: TreeFolder = { name: rootLabel, path: '', folders: [], files: [] }

  const ensureFolderPath = (relPath: string): TreeFolder => {
    const normalized = normalizeRelativePath(relPath)
    if (!normalized) {
      return root
    }
    const parts = normalized.split('/')
    let node = root
    for (let index = 0; index < parts.length; index += 1) {
      const segment = parts[index]
      let child = node.folders.find(
        (folder) => folder.name.toLowerCase() === segment.toLowerCase(),
      )
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
    return node
  }

  for (const folderPath of explicitFolders) {
    ensureFolderPath(folderPath)
  }

  for (const file of files) {
    const parent = parentFolderOf(file.path)
    const targetNode = ensureFolderPath(parent)
    targetNode.files.push(file)
  }

  return root
}

function fileIcon(language: ExampleFile['language']) {
  switch (language) {
    case 'c':
      return <FileCode2 size={14} className="text-[var(--cc-icon-c)]" />
    case 'cpp':
      return <FileCode2 size={14} className="text-[var(--cc-icon-cpp)]" />
    case 'java':
      return <FileType size={14} className="text-[var(--cc-icon-java)]" />
    default:
      return <FileCode2 size={14} className="text-[var(--cc-text-muted)]" />
  }
}

function NewFolderInlineRow({
  depth,
  draft,
  error,
  inputRef,
  onDraftChange,
  onConfirm,
  onCancel,
}: {
  depth: number
  draft: string
  error: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onDraftChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const paddingLeft = 8 + depth * 12

  return (
    <div className="space-y-1 py-1 pr-2" style={{ paddingLeft }}>
      <div className="flex items-center gap-1 rounded border border-[var(--cc-primary)] bg-[var(--cc-bg)] px-1.5 py-0.5">
        <Folder size={13} className="shrink-0 text-[var(--cc-primary)]" />
        <input
          ref={inputRef}
          type="text"
          data-testid="new-folder-input"
          aria-label="New folder name"
          placeholder="folder-name"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onConfirm()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
          }}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-[var(--cc-text)] outline-none placeholder:text-[var(--cc-text-muted)]"
        />
        <button
          type="button"
          data-testid="new-folder-confirm-btn"
          aria-label="Create folder"
          onClick={onConfirm}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--cc-success)] hover:bg-[var(--cc-hover)]"
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          data-testid="new-folder-cancel-btn"
          aria-label="Cancel new folder"
          onClick={onCancel}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--cc-text-muted)] hover:bg-[var(--cc-hover)] hover:text-[var(--cc-text)]"
        >
          <X size={12} />
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          data-testid="new-folder-error"
          className="text-[11px] leading-snug text-[var(--cc-danger-text)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

function FolderNode({
  folder,
  depth,
  activeFileId,
  openFileIds,
  dirtyFileIds,
  diskRoot,
  onSelectFile,
  canRename,
  canCreateFolder,
  canMoveFile,
  rename,
  folderOps,
}: {
  folder: TreeFolder
  depth: number
  activeFileId: string | null
  openFileIds: string[]
  dirtyFileIds: string[]
  diskRoot: string | null
  onSelectFile: (fileId: string) => void
  canRename: boolean
  canCreateFolder: boolean
  canMoveFile: boolean
  rename: RenameSessionProps
  folderOps: FolderSessionProps
}) {
  const open = folderOps.expandedFolders[folder.path] ?? true
  const isDragOver = folderOps.dragOverFolderPath === folder.path
  const paddingLeft = 8 + depth * 12

  return (
    <div>
      <div
        data-testid={
          folder.path
            ? `explorer-folder-${folder.path.replace(/\//g, '__')}`
            : 'explorer-folder-root'
        }
        onContextMenu={(event) => {
          if (!canCreateFolder) {
            return
          }
          event.preventDefault()
          folderOps.onFolderContextMenu(folder.path, event.clientX, event.clientY)
        }}
        onDragOver={(event) => {
          if (!canMoveFile) {
            return
          }
          event.preventDefault()
          folderOps.onDragOverFolder(folder.path)
        }}
        onDragLeave={() => {
          if (folderOps.dragOverFolderPath === folder.path) {
            folderOps.onDragOverFolder(null)
          }
        }}
        onDrop={(event) => {
          if (!canMoveFile) {
            return
          }
          event.preventDefault()
          folderOps.onDragOverFolder(null)
          const draggedId = event.dataTransfer.getData('text/compilecraft-file-id') || null
          folderOps.onDropOnFolder(folder.path, draggedId)
        }}
        className={`group flex w-full items-center pr-1.5 transition-colors ${
          isDragOver
            ? 'bg-[var(--cc-selection)] ring-1 ring-inset ring-[var(--cc-primary)]'
            : 'hover:bg-[var(--cc-hover)]'
        }`}
      >
        <button
          type="button"
          onClick={() => folderOps.onToggleFolder(folder.path)}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} folder ${folder.name}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-xs text-[var(--cc-text-secondary)] hover:text-[var(--cc-text)]"
          style={{ paddingLeft }}
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {open ? <FolderOpen size={14} /> : <Folder size={14} />}
          <span className="truncate">{folder.name}</span>
        </button>
        {canCreateFolder ? (
          <button
            type="button"
            data-testid={
              folder.path
                ? `new-folder-in-${folder.path.replace(/\//g, '__')}`
                : 'new-folder-in-root'
            }
            aria-label={`New folder in ${folder.name}`}
            title={`New folder in ${folder.name}`}
            onClick={(event) => {
              event.stopPropagation()
              folderOps.onStartNewFolder(folder.path)
            }}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-[var(--cc-surface-elevated)] text-[var(--cc-text-muted)] hover:text-[var(--cc-text)]"
          >
            <FolderPlus size={12} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div>
          {folderOps.newFolderParentPath === folder.path ? (
            <NewFolderInlineRow
              depth={depth + 1}
              draft={folderOps.newFolderDraft}
              error={folderOps.newFolderError}
              inputRef={folderOps.newFolderInputRef}
              onDraftChange={folderOps.onNewFolderDraftChange}
              onConfirm={folderOps.onConfirmNewFolder}
              onCancel={folderOps.onCancelNewFolder}
            />
          ) : null}

          {folder.folders.map((child) => (
            <FolderNode
              key={child.path}
              folder={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              openFileIds={openFileIds}
              dirtyFileIds={dirtyFileIds}
              diskRoot={diskRoot}
              onSelectFile={onSelectFile}
              canRename={canRename}
              canCreateFolder={canCreateFolder}
              canMoveFile={canMoveFile}
              rename={rename}
              folderOps={folderOps}
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
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--cc-success)] hover:bg-[var(--cc-hover)]"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      data-testid="rename-cancel-btn"
                      aria-label="Cancel rename"
                      onClick={rename.onCancelRename}
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--cc-text-muted)] hover:bg-[var(--cc-hover)] hover:text-[var(--cc-text)]"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {rename.renameError ? (
                    <p
                      role="alert"
                      data-testid="rename-error-message"
                      className="text-[11px] leading-snug text-[var(--cc-danger-text)]"
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
                draggable={canMoveFile}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/compilecraft-file-id', file.id)
                  event.dataTransfer.effectAllowed = 'move'
                  folderOps.onDragStartFile(file.id)
                }}
                onDragEnd={() => folderOps.onDragOverFolder(null)}
                onContextMenu={(event) => {
                  if (!canRename && !canMoveFile) {
                    return
                  }
                  event.preventDefault()
                  rename.onFileContextMenu(file, event.clientX, event.clientY)
                }}
                className={`group flex w-full items-center gap-1.5 py-1 pr-2 text-xs transition-colors ${
                  active
                    ? 'bg-[var(--cc-selection)] font-medium text-[var(--cc-text)]'
                    : 'text-[var(--cc-text-secondary)] hover:bg-[var(--cc-hover)] hover:text-[var(--cc-text)]'
                }`}
                style={{ paddingLeft: paddingLeft + 16 }}
              >
                <button
                  type="button"
                  data-testid={`explorer-file-${file.id}`}
                  onClick={() => onSelectFile(file.id)}
                  aria-current={active ? 'page' : undefined}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  title={diskRoot ? `${file.path} (${diskRoot})` : `${file.path} (in-memory demo)`}
                >
                  {fileIcon(file.language)}
                  <span className={`truncate ${isOpen && !active ? 'text-[var(--cc-text)]' : ''}`}>
                    {file.name}
                  </span>
                </button>
                {dirty ? (
                  <span
                    className="shrink-0 text-[var(--cc-primary-hover)]"
                    title={diskRoot ? 'Unsaved changes' : 'Unsaved changes (session only)'}
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

type ExplorerContextMenu =
  | { kind: 'file'; file: ExampleFile; x: number; y: number }
  | { kind: 'folder'; folderPath: string; x: number; y: number }

export default function FileExplorer({
  workspaceLabel = 'demo-workspace',
  diskRoot = null,
  files,
  folders = [],
  activeFileId,
  openFileIds,
  dirtyFileIds,
  newFolderTrigger = null,
  onSelectFile,
  onRenameFile,
  onCreateFolder,
  onMoveFile,
}: FileExplorerProps) {
  const tree = useMemo(
    () => buildTree(files, folders, diskRoot ? workspaceLabel : 'demo-workspace'),
    [diskRoot, files, folders, workspaceLabel],
  )

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ '': true })
  const [editingFileId, setEditingFileId] = useState<string | null>(null)
  const [draftStem, setDraftStem] = useState('')
  const [renameError, setRenameError] = useState('')

  const [newFolderParentPath, setNewFolderParentPath] = useState<string | null>(null)
  const [newFolderDraft, setNewFolderDraft] = useState('')
  const [newFolderError, setNewFolderError] = useState('')

  const [draggedFileId, setDraggedFileId] = useState<string | null>(null)
  const [dragOverFolderPath, setDragOverFolderPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenu | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const newFolderInputRef = useRef<HTMLInputElement | null>(null)
  const lastTriggerSeqRef = useRef<number>(0)

  const expandWithAncestors = (folderPath: string) => {
    const normalized = normalizeRelativePath(folderPath)
    setExpandedFolders((previous) => {
      const next: Record<string, boolean> = { ...previous, '': true }
      if (normalized) {
        const parts = normalized.split('/')
        for (let i = 0; i < parts.length; i += 1) {
          next[parts.slice(0, i + 1).join('/')] = true
        }
      }
      return next
    })
  }

  const startNewFolder = (parentPath: string) => {
    setContextMenu(null)
    setEditingFileId(null)
    expandWithAncestors(parentPath)
    setNewFolderParentPath(normalizeRelativePath(parentPath))
    setNewFolderDraft('')
    setNewFolderError('')
  }

  useEffect(() => {
    if (newFolderTrigger && newFolderTrigger.seq !== lastTriggerSeqRef.current) {
      lastTriggerSeqRef.current = newFolderTrigger.seq
      startNewFolder(newFolderTrigger.parentPath)
    }
  })

  useEffect(() => {
    if (editingFileId) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingFileId])

  useEffect(() => {
    if (newFolderParentPath !== null) {
      newFolderInputRef.current?.focus()
    }
  }, [newFolderParentPath])

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
    setNewFolderParentPath(null)
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
      void onRenameFile?.(file.id, result.nextName)
    }
    cancelRename()
  }

  const cancelNewFolder = () => {
    setNewFolderParentPath(null)
    setNewFolderDraft('')
    setNewFolderError('')
  }

  const confirmNewFolder = async () => {
    if (newFolderParentPath === null) {
      return
    }
    const validation = validateFolderName(newFolderParentPath, newFolderDraft, folders, files)
    if (!validation.valid) {
      setNewFolderError(validation.error)
      newFolderInputRef.current?.focus()
      return
    }
    const created = await onCreateFolder?.(newFolderParentPath, validation.folderName)
    if (created === false) {
      setNewFolderError('Could not create folder at this location.')
      newFolderInputRef.current?.focus()
      return
    }
    expandWithAncestors(validation.folderPath)
    cancelNewFolder()
  }

  const handleDropOnFolder = (targetFolderPath: string, dataTransferFileId: string | null) => {
    const fileId = dataTransferFileId || draggedFileId
    setDraggedFileId(null)
    if (!fileId || !onMoveFile) {
      return
    }
    void onMoveFile(fileId, targetFolderPath)
  }

  const availableMoveTargets = useMemo(() => {
    const unique = new Set<string>([''])
    for (const f of folders) {
      const norm = normalizeRelativePath(f)
      if (norm) {
        unique.add(norm)
      }
    }
    return [...unique]
  }, [folders])

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 overflow-auto py-1">
        <FolderNode
          folder={tree}
          depth={0}
          activeFileId={activeFileId}
          openFileIds={openFileIds}
          dirtyFileIds={dirtyFileIds}
          diskRoot={diskRoot}
          onSelectFile={onSelectFile}
          canRename={Boolean(onRenameFile)}
          canCreateFolder={Boolean(onCreateFolder)}
          canMoveFile={Boolean(onMoveFile)}
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
            onFileContextMenu: (file, x, y) => setContextMenu({ kind: 'file', file, x, y }),
            inputRef,
          }}
          folderOps={{
            expandedFolders,
            onToggleFolder: (folderPath) => {
              setExpandedFolders((prev) => ({
                ...prev,
                [folderPath]: !(prev[folderPath] ?? true),
              }))
            },
            newFolderParentPath,
            newFolderDraft,
            newFolderError,
            onNewFolderDraftChange: (value) => {
              setNewFolderDraft(value)
              if (newFolderError) {
                setNewFolderError('')
              }
            },
            onStartNewFolder: startNewFolder,
            onConfirmNewFolder: () => {
              void confirmNewFolder()
            },
            onCancelNewFolder: cancelNewFolder,
            onFolderContextMenu: (folderPath, x, y) =>
              setContextMenu({ kind: 'folder', folderPath, x, y }),
            dragOverFolderPath,
            onDragStartFile: setDraggedFileId,
            onDragOverFolder: setDragOverFolderPath,
            onDropOnFolder: handleDropOnFolder,
            newFolderInputRef,
          }}
        />
      </div>

      {contextMenu?.kind === 'folder' ? (
        <div
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 min-w-36 rounded-md border border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="context-menu-new-folder"
            onClick={() => startNewFolder(contextMenu.folderPath)}
            className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-[var(--cc-text)] hover:bg-[var(--cc-primary)]/20"
          >
            <FolderPlus size={12} />
            New Folder
          </button>
        </div>
      ) : null}

      {contextMenu?.kind === 'file' ? (
        <div
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 min-w-44 rounded-md border border-[var(--cc-border)] bg-[var(--cc-surface-elevated)] py-1 shadow-lg"
        >
          {onRenameFile ? (
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
          ) : null}
          {onMoveFile ? (
            <div className="mt-1 border-t border-[var(--cc-border)] pt-1">
              <p className="px-3 py-0.5 text-[10px] font-semibold tracking-wider text-[var(--cc-text-muted)] uppercase">
                Move to folder
              </p>
              <div className="max-h-36 overflow-auto">
                {availableMoveTargets
                  .filter((target) => target !== parentFolderOf(contextMenu.file.path))
                  .map((target) => (
                    <button
                      key={target || '__root__'}
                      type="button"
                      role="menuitem"
                      data-testid={
                        target
                          ? `context-menu-move-${target.replace(/\//g, '__')}`
                          : 'context-menu-move-root'
                      }
                      onClick={() => {
                        const targetFileId = contextMenu.file.id
                        setContextMenu(null)
                        void onMoveFile(targetFileId, target)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs text-[var(--cc-text-secondary)] hover:bg-[var(--cc-primary)]/20 hover:text-[var(--cc-text)]"
                    >
                      <FolderInput size={12} />
                      <span className="truncate">{target || '/ (workspace root)'}</span>
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <p
        data-testid="explorer-storage-status"
        title={diskRoot || 'In-memory workspace (use Save Workspace As... to persist to Desktop)'}
        className="truncate border-t border-[var(--cc-border)] px-3 py-2 text-[10px] text-[var(--cc-text-muted)]"
      >
        {diskRoot ? 'Saved workspace • Compiles via CLI' : 'In-memory demos • Compiles via CLI'}
      </p>
    </div>
  )
}
