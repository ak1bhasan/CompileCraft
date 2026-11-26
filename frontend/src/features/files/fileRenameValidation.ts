const INVALID_WINDOWS_CHARS_RE = /[<>:"/\\|?*]/
const RESERVED_WINDOWS_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) < 32) {
      return true
    }
  }
  return false
}

export interface SplitFilename {
  stem: string
  extension: string
}

export function splitFilename(filename: string): SplitFilename {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0) {
    return { stem: filename, extension: '' }
  }
  return {
    stem: filename.slice(0, dotIndex),
    extension: filename.slice(dotIndex),
  }
}

export interface RenameValidationResult {
  valid: boolean
  nextName: string
  error: string
}

export function validateRenameStem(
  fileId: string,
  rawStem: string,
  currentName: string,
  allFiles: ReadonlyArray<{ id: string; name: string }>,
): RenameValidationResult {
  const { extension } = splitFilename(currentName)

  if (rawStem.trim().length === 0) {
    return { valid: false, nextName: currentName, error: 'Filename cannot be empty.' }
  }

  if (/^\s|\s$/.test(rawStem) || rawStem.endsWith('.')) {
    return {
      valid: false,
      nextName: currentName,
      error: 'Filename cannot have leading/trailing spaces or end with a period.',
    }
  }

  if (INVALID_WINDOWS_CHARS_RE.test(rawStem) || hasControlChar(rawStem)) {
    return {
      valid: false,
      nextName: currentName,
      error: 'Filename cannot contain < > : " / \\ | ? * or control characters.',
    }
  }

  const baseSegment = rawStem.split('.')[0]
  if (RESERVED_WINDOWS_NAME_RE.test(rawStem) || RESERVED_WINDOWS_NAME_RE.test(baseSegment)) {
    return {
      valid: false,
      nextName: currentName,
      error: 'Reserved Windows filenames (CON, PRN, AUX, NUL, COM1-9, LPT1-9) are not allowed.',
    }
  }

  const nextName = `${rawStem}${extension}`
  const duplicate = allFiles.some(
    (other) => other.id !== fileId && other.name.toLowerCase() === nextName.toLowerCase(),
  )
  if (duplicate) {
    return {
      valid: false,
      nextName: currentName,
      error: `A file named "${nextName}" already exists.`,
    }
  }

  return { valid: true, nextName, error: '' }
}

export interface FolderValidationResult {
  valid: boolean
  folderName: string
  folderPath: string
  error: string
}

export function normalizeRelativePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('/')
}

export function parentFolderOf(filePath: string): string {
  const normalized = normalizeRelativePath(filePath)
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(0, idx) : ''
}

export function validateFolderName(
  parentPath: string,
  rawName: string,
  existingFolders: ReadonlyArray<string>,
  existingFiles: ReadonlyArray<{ path: string; name: string }>,
): FolderValidationResult {
  const normalizedParent = normalizeRelativePath(parentPath)

  if (rawName.trim().length === 0) {
    return { valid: false, folderName: '', folderPath: '', error: 'Folder name cannot be empty.' }
  }

  if (rawName === '.' || rawName === '..' || rawName.includes('..')) {
    return {
      valid: false,
      folderName: '',
      folderPath: '',
      error: 'Path traversal or relative segments (. or ..) are not allowed.',
    }
  }

  if (/^\s|\s$/.test(rawName) || rawName.endsWith('.')) {
    return {
      valid: false,
      folderName: '',
      folderPath: '',
      error: 'Folder name cannot have leading/trailing spaces or end with a period.',
    }
  }

  if (INVALID_WINDOWS_CHARS_RE.test(rawName) || hasControlChar(rawName)) {
    return {
      valid: false,
      folderName: '',
      folderPath: '',
      error: 'Folder name cannot contain < > : " / \\ | ? * or control characters.',
    }
  }

  const baseSegment = rawName.split('.')[0]
  if (RESERVED_WINDOWS_NAME_RE.test(rawName) || RESERVED_WINDOWS_NAME_RE.test(baseSegment)) {
    return {
      valid: false,
      folderName: '',
      folderPath: '',
      error: 'Reserved Windows folder names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) are not allowed.',
    }
  }

  const parentSegments = normalizedParent ? normalizedParent.split('/') : []
  if (parentSegments.some((seg) => seg === '.' || seg === '..')) {
    return {
      valid: false,
      folderName: '',
      folderPath: '',
      error: 'Invalid parent directory path.',
    }
  }

  const folderPath = normalizedParent ? `${normalizedParent}/${rawName}` : rawName
  const targetLower = folderPath.toLowerCase()

  const duplicateFolder = existingFolders.some(
    (existing) => normalizeRelativePath(existing).toLowerCase() === targetLower,
  )
  if (duplicateFolder) {
    return {
      valid: false,
      folderName: rawName,
      folderPath: '',
      error: `A folder named "${rawName}" already exists in this directory.`,
    }
  }

  const collidingFile = existingFiles.some(
    (file) => normalizeRelativePath(file.path).toLowerCase() === targetLower,
  )
  if (collidingFile) {
    return {
      valid: false,
      folderName: rawName,
      folderPath: '',
      error: `A file named "${rawName}" already exists in this directory.`,
    }
  }

  return { valid: true, folderName: rawName, folderPath, error: '' }
}
