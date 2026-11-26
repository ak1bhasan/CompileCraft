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
