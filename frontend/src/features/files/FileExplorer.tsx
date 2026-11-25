import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileType,
  Folder,
  FolderOpen,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ExampleFile } from '../../types/ide'

interface FileExplorerProps {
  files: ExampleFile[]
  activeFileId: string | null
  openFileIds: string[]
  dirtyFileIds: string[]
  onSelectFile: (fileId: string) => void
}

interface TreeFolder {
  name: string
  path: string
  folders: TreeFolder[]
  files: ExampleFile[]
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
    case 'mc':
      return <FileCode2 size={14} className="text-[var(--cc-primary)]" />
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
}: {
  folder: TreeFolder
  depth: number
  activeFileId: string | null
  openFileIds: string[]
  dirtyFileIds: string[]
  onSelectFile: (fileId: string) => void
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
            />
          ))}
          {folder.files.map((file) => {
            const active = file.id === activeFileId
            const isOpen = openFileIds.includes(file.id)
            const dirty = dirtyFileIds.includes(file.id)
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => onSelectFile(file.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors ${
                  active
                    ? 'bg-[var(--cc-primary)]/15 text-[var(--cc-text)]'
                    : 'text-[var(--cc-text-muted)] hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]'
                }`}
                style={{ paddingLeft: paddingLeft + 16 }}
                title={`${file.path} (in-memory example)`}
              >
                {fileIcon(file.language)}
                <span className={`truncate ${isOpen && !active ? 'text-[var(--cc-text)]' : ''}`}>
                  {file.name}
                </span>
                {dirty ? (
                  <span
                    className="ml-auto shrink-0 text-[var(--cc-primary-hover)]"
                    title="Unsaved changes (session only)"
                    aria-label="Unsaved changes"
                  >
                    ●
                  </span>
                ) : null}
              </button>
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
}: FileExplorerProps) {
  const tree = useMemo(() => buildTree(files), [files])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto py-1">
        <FolderNode
          folder={tree}
          depth={0}
          activeFileId={activeFileId}
          openFileIds={openFileIds}
          dirtyFileIds={dirtyFileIds}
          onSelectFile={onSelectFile}
        />
      </div>
      <p className="border-t border-[var(--cc-border)] px-3 py-2 text-[10px] text-[var(--cc-text-muted)]">
        In-memory examples only
      </p>
    </div>
  )
}
