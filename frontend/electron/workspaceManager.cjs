const fs = require('node:fs')
const path = require('node:path')

const INVALID_WINDOWS_CHARS_RE = /[<>:"/\\|?*]/
const RESERVED_WINDOWS_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const ALLOWED_LANGUAGES = new Set(['c', 'cpp', 'java'])
const MAX_SOURCE_BYTES = 512 * 1024
const MAX_WORKSPACE_FILES = 500
const MAX_WALK_DEPTH = 16

const DEFAULT_ID_BY_PATH = {
  'src/c/Main.c': 'demo-c',
  'src/cpp/Main.cpp': 'demo-cpp',
  'src/java/Main.java': 'demo-java',
  'src/error-examples/undeclared_var.c': 'invalid-c',
  'src/error-examples/type_mismatch.cpp': 'invalid-cpp',
  'src/error-examples/SyntaxError.java': 'invalid-java',
}

function hasControlChar(value) {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) < 32) {
      return true
    }
  }
  return false
}

function isValidEntryName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return false
  }
  if (/^\s|\s$/.test(name) || name.endsWith('.')) {
    return false
  }
  if (name === '.' || name === '..' || name.includes('..')) {
    return false
  }
  if (INVALID_WINDOWS_CHARS_RE.test(name) || hasControlChar(name)) {
    return false
  }
  const baseSegment = name.split('.')[0]
  if (RESERVED_WINDOWS_NAME_RE.test(name) || RESERVED_WINDOWS_NAME_RE.test(baseSegment)) {
    return false
  }
  return true
}

function normalizeRelativePath(relPath) {
  if (typeof relPath !== 'string') {
    return null
  }
  const trimmed = relPath.trim()
  if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-zA-Z]:/.test(trimmed)) {
    return null
  }
  const rawSegments = trimmed.replace(/\\/g, '/').split('/')
  if (rawSegments.some((seg) => !isValidEntryName(seg))) {
    return null
  }
  return rawSegments.join('/')
}

function resolveInsideRoot(rootDir, normalizedRelPath) {
  const resolvedRoot = path.resolve(rootDir)
  const segments = normalizedRelPath ? normalizedRelPath.split('/') : []
  const target = path.resolve(resolvedRoot, ...segments)
  const rel = path.relative(resolvedRoot, target)
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return null
  }
  return target
}

function inferLanguageFromFilename(filename) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.c')) return 'c'
  if (lower.endsWith('.cpp')) return 'cpp'
  if (lower.endsWith('.java')) return 'java'
  return null
}

function formatFsError(err, fallback) {
  const msg = err && typeof err.message === 'string' ? err.message : fallback
  return msg || fallback
}

function createWorkspaceHandlers({ app, dialog, ipcMain, getMainWindow }) {
  const authorizedPickDirsBySender = new Map()
  const activeWorkspaceRootBySender = new Map()

  function getStateFilePath() {
    return path.join(app.getPath('userData'), 'workspace-state.json')
  }

  function getDesktopPath() {
    return app.getPath('desktop')
  }

  function rememberAuthorizedDir(senderId, dirPath) {
    let set = authorizedPickDirsBySender.get(senderId)
    if (!set) {
      set = new Set()
      authorizedPickDirsBySender.set(senderId, set)
    }
    set.add(path.resolve(dirPath))
  }

  async function readPersistedMeta() {
    try {
      const raw = await fs.promises.readFile(getStateFilePath(), 'utf8')
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || typeof parsed.workspaceRoot !== 'string') {
        return null
      }
      return {
        workspaceRoot: path.resolve(parsed.workspaceRoot),
        activeFilePath: typeof parsed.activeFilePath === 'string' ? parsed.activeFilePath : null,
        openFilePaths: Array.isArray(parsed.openFilePaths)
          ? parsed.openFilePaths.filter((p) => typeof p === 'string')
          : [],
        fileIdsByPath:
          parsed.fileIdsByPath && typeof parsed.fileIdsByPath === 'object'
            ? parsed.fileIdsByPath
            : {},
      }
    } catch {
      return null
    }
  }

  async function writePersistedMeta(meta) {
    const stateFile = getStateFilePath()
    await fs.promises.mkdir(path.dirname(stateFile), { recursive: true })
    await fs.promises.writeFile(stateFile, JSON.stringify(meta, null, 2), 'utf8')
  }

  async function clearPersistedMeta() {
    try {
      await fs.promises.unlink(getStateFilePath())
    } catch {
      // Ignore if absent
    }
  }

  async function selectDirectoryFromSystem() {
    const desktopPath = getDesktopPath()
    const e2eResponseFile = process.env.COMPILECRAFT_E2E_DIALOG_RESPONSE_FILE
    if (typeof e2eResponseFile === 'string' && e2eResponseFile.trim().length > 0) {
      const raw = await fs.promises.readFile(path.resolve(e2eResponseFile.trim()), 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed.canceled) {
        return { canceled: true, desktopPath }
      }
      if (parsed.useDesktop) {
        return { canceled: false, filePaths: [desktopPath], desktopPath }
      }
      if (Array.isArray(parsed.filePaths) && parsed.filePaths[0]) {
        return { canceled: false, filePaths: [path.resolve(parsed.filePaths[0])], desktopPath }
      }
      return { canceled: true, desktopPath }
    }

    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win || undefined, {
      title: 'Choose Destination Folder for CompileCraft Workspace',
      defaultPath: desktopPath,
      buttonLabel: 'Select Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    return {
      canceled: Boolean(result.canceled),
      filePaths: Array.isArray(result.filePaths) ? result.filePaths : [],
      desktopPath,
    }
  }

  async function handleSelectDirectory(event) {
    const senderId = event?.sender?.id ?? 0
    try {
      const dialogResult = await selectDirectoryFromSystem()
      if (dialogResult.canceled || !dialogResult.filePaths[0]) {
        return { canceled: true, desktopPath: dialogResult.desktopPath }
      }
      const chosenDir = path.resolve(dialogResult.filePaths[0])
      const stat = await fs.promises.stat(chosenDir).catch(() => null)
      if (!stat || !stat.isDirectory()) {
        return { canceled: true, error: 'Selected location is not a readable directory.' }
      }
      rememberAuthorizedDir(senderId, chosenDir)
      return {
        canceled: false,
        parentDir: chosenDir,
        defaultProjectName: 'CompileCraft-Workspace',
        desktopPath: dialogResult.desktopPath,
      }
    } catch (err) {
      return { canceled: true, error: formatFsError(err, 'Failed to select destination folder.') }
    }
  }

  async function handleSaveAs(event, payload) {
    const senderId = event?.sender?.id ?? 0
    try {
      if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'Invalid save workspace request.' }
      }

      const rawParent = typeof payload.parentDir === 'string' ? path.resolve(payload.parentDir) : ''
      const authorizedSet = authorizedPickDirsBySender.get(senderId)
      if (!rawParent || !authorizedSet || !authorizedSet.has(rawParent)) {
        return { ok: false, error: 'Selected destination folder is not authorized.' }
      }

      const projectName = typeof payload.projectName === 'string' ? payload.projectName : ''
      if (!isValidEntryName(projectName)) {
        return { ok: false, error: 'Invalid project folder name.' }
      }

      const targetRoot = resolveInsideRoot(rawParent, projectName)
      if (!targetRoot) {
        return { ok: false, error: 'Target workspace path escapes the selected destination.' }
      }

      const folders = Array.isArray(payload.folders) ? payload.folders : []
      const normalizedFolders = []
      const folderSetLower = new Set()
      for (const folder of folders) {
        const norm = normalizeRelativePath(folder)
        if (!norm) {
          return { ok: false, error: `Invalid folder path: ${String(folder)}` }
        }
        const key = norm.toLowerCase()
        if (!folderSetLower.has(key)) {
          folderSetLower.add(key)
          normalizedFolders.push(norm)
        }
      }

      const files = Array.isArray(payload.files) ? payload.files : []
      const normalizedFiles = []
      const fileIdsByPath = {}
      const filePathLowerSet = new Set()
      for (const file of files) {
        if (!file || typeof file !== 'object') {
          return { ok: false, error: 'Invalid file payload.' }
        }
        const normPath = normalizeRelativePath(file.path)
        if (!normPath) {
          return { ok: false, error: `Invalid file path: ${String(file.path)}` }
        }
        const lang = typeof file.language === 'string' ? file.language : inferLanguageFromFilename(normPath)
        if (!lang || !ALLOWED_LANGUAGES.has(lang)) {
          return { ok: false, error: `Unsupported file type: ${normPath}` }
        }
        if (typeof file.content !== 'string' || Buffer.byteLength(file.content, 'utf8') > MAX_SOURCE_BYTES) {
          return { ok: false, error: `Invalid or oversized file content for ${normPath}` }
        }
        const lowerPath = normPath.toLowerCase()
        if (folderSetLower.has(lowerPath) || filePathLowerSet.has(lowerPath)) {
          return { ok: false, error: `Duplicate or conflicting path: ${normPath}` }
        }
        filePathLowerSet.add(lowerPath)
        normalizedFiles.push({
          id: typeof file.id === 'string' ? file.id : normPath,
          path: normPath,
          content: file.content,
        })
        if (typeof file.id === 'string' && file.id.length > 0) {
          fileIdsByPath[normPath] = file.id
        }
      }

      const existingStat = await fs.promises.stat(targetRoot).catch(() => null)
      if (existingStat) {
        if (!existingStat.isDirectory()) {
          return { ok: false, error: 'A regular file with that project name already exists.' }
        }
        const entries = await fs.promises.readdir(targetRoot).catch(() => [])
        if (entries.length > 0 && payload.overwrite !== true) {
          return {
            ok: false,
            needsConfirmation: true,
            existingEntriesCount: entries.length,
            targetPath: targetRoot,
          }
        }
      }

      await fs.promises.mkdir(targetRoot, { recursive: true })

      for (const folderPath of normalizedFolders) {
        const destFolder = resolveInsideRoot(targetRoot, folderPath)
        if (!destFolder) {
          return { ok: false, error: `Invalid folder destination: ${folderPath}` }
        }
        await fs.promises.mkdir(destFolder, { recursive: true })
      }

      for (const file of normalizedFiles) {
        const destFile = resolveInsideRoot(targetRoot, file.path)
        if (!destFile) {
          return { ok: false, error: `Invalid file destination: ${file.path}` }
        }
        await fs.promises.mkdir(path.dirname(destFile), { recursive: true })
        await fs.promises.writeFile(destFile, file.content, 'utf8')
      }

      activeWorkspaceRootBySender.set(senderId, targetRoot)

      const activeNorm = payload.activeFilePath ? normalizeRelativePath(payload.activeFilePath) : null
      const openNorms = Array.isArray(payload.openFilePaths)
        ? payload.openFilePaths.map(normalizeRelativePath).filter(Boolean)
        : []

      await writePersistedMeta({
        workspaceRoot: targetRoot,
        activeFilePath: activeNorm,
        openFilePaths: openNorms,
        fileIdsByPath,
      })

      return {
        ok: true,
        workspaceRoot: targetRoot,
        projectName,
      }
    } catch (err) {
      return { ok: false, error: formatFsError(err, 'Failed to save workspace to disk.') }
    }
  }

  async function handleSaveFile(event, payload) {
    const senderId = event?.sender?.id ?? 0
    try {
      const root = activeWorkspaceRootBySender.get(senderId)
      if (!root) {
        return { ok: false, error: 'Workspace has not been saved to disk yet.' }
      }
      const normPath = normalizeRelativePath(payload?.path)
      if (!normPath) {
        return { ok: false, error: 'Invalid file path.' }
      }
      if (
        typeof payload?.content !== 'string' ||
        Buffer.byteLength(payload.content, 'utf8') > MAX_SOURCE_BYTES
      ) {
        return { ok: false, error: 'Invalid or oversized file content.' }
      }
      const destFile = resolveInsideRoot(root, normPath)
      if (!destFile) {
        return { ok: false, error: 'File path escapes workspace root.' }
      }
      await fs.promises.mkdir(path.dirname(destFile), { recursive: true })
      await fs.promises.writeFile(destFile, payload.content, 'utf8')

      const meta = (await readPersistedMeta()) || { workspaceRoot: root, fileIdsByPath: {} }
      meta.workspaceRoot = root
      if (typeof payload.activeFilePath === 'string') {
        meta.activeFilePath = normalizeRelativePath(payload.activeFilePath)
      }
      if (Array.isArray(payload.openFilePaths)) {
        meta.openFilePaths = payload.openFilePaths.map(normalizeRelativePath).filter(Boolean)
      }
      await writePersistedMeta(meta)

      return { ok: true, filePath: destFile, savedPath: normPath }
    } catch (err) {
      return { ok: false, error: formatFsError(err, 'Failed to save file.') }
    }
  }

  async function handleReadFile(event, payload) {
    const senderId = event?.sender?.id ?? 0
    try {
      const root = activeWorkspaceRootBySender.get(senderId)
      if (!root) {
        return { ok: false, error: 'No disk workspace is active.' }
      }
      const normPath = normalizeRelativePath(payload?.path)
      if (!normPath) {
        return { ok: false, error: 'Invalid file path.' }
      }
      const targetFile = resolveInsideRoot(root, normPath)
      if (!targetFile) {
        return { ok: false, error: 'File path escapes workspace root.' }
      }
      const content = await fs.promises.readFile(targetFile, 'utf8')
      return { ok: true, content }
    } catch (err) {
      return { ok: false, error: formatFsError(err, 'Failed to read file from disk.') }
    }
  }

  async function handleCreateFolder(event, payload) {
    const senderId = event?.sender?.id ?? 0
    try {
      const root = activeWorkspaceRootBySender.get(senderId)
      if (!root) {
        return { ok: true }
      }
      const normFolder = normalizeRelativePath(payload?.folderPath)
      if (!normFolder) {
        return { ok: false, error: 'Invalid folder path.' }
      }
      const targetDir = resolveInsideRoot(root, normFolder)
      if (!targetDir) {
        return { ok: false, error: 'Folder path escapes workspace root.' }
      }
      const parentDir = path.dirname(targetDir)
      await fs.promises.mkdir(parentDir, { recursive: true })
      const leafName = path.basename(targetDir)
      const siblings = await fs.promises.readdir(parentDir).catch(() => [])
      if (siblings.some((entry) => entry.toLowerCase() === leafName.toLowerCase())) {
        return { ok: false, error: `An entry named "${leafName}" already exists in that directory.` }
      }
      await fs.promises.mkdir(targetDir)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: formatFsError(err, 'Failed to create folder on disk.') }
    }
  }

  async function relocateFile(senderId, payload) {
    const root = activeWorkspaceRootBySender.get(senderId)
    if (!root) {
      return { ok: true }
    }
    const oldNorm = normalizeRelativePath(payload?.oldPath)
    const newNorm = normalizeRelativePath(payload?.newPath)
    if (!oldNorm || !newNorm) {
      return { ok: false, error: 'Invalid source or destination path.' }
    }
    const src = resolveInsideRoot(root, oldNorm)
    const dest = resolveInsideRoot(root, newNorm)
    if (!src || !dest) {
      return { ok: false, error: 'Path escapes workspace root.' }
    }

    await fs.promises.mkdir(path.dirname(dest), { recursive: true })

    if (oldNorm.toLowerCase() !== newNorm.toLowerCase()) {
      const existing = await fs.promises.stat(dest).catch(() => null)
      if (existing) {
        return { ok: false, error: `Target path "${newNorm}" already exists on disk.` }
      }
    }

    const srcExists = await fs.promises.stat(src).catch(() => null)
    if (srcExists) {
      await fs.promises.rename(src, dest)
    }

    const meta = (await readPersistedMeta()) || { workspaceRoot: root, fileIdsByPath: {} }
    if (meta.fileIdsByPath) {
      delete meta.fileIdsByPath[oldNorm]
      if (typeof payload?.fileId === 'string' && payload.fileId.length > 0) {
        meta.fileIdsByPath[newNorm] = payload.fileId
      }
    }
    if (typeof payload?.activeFilePath === 'string') {
      meta.activeFilePath = normalizeRelativePath(payload.activeFilePath)
    }
    if (Array.isArray(payload?.openFilePaths)) {
      meta.openFilePaths = payload.openFilePaths.map(normalizeRelativePath).filter(Boolean)
    }
    await writePersistedMeta(meta)
    return { ok: true }
  }

  async function handleRenameFile(event, payload) {
    const senderId = event?.sender?.id ?? 0
    try {
      return await relocateFile(senderId, payload)
    } catch (err) {
      return { ok: false, error: formatFsError(err, 'Failed to rename file on disk.') }
    }
  }

  async function handleMoveFile(event, payload) {
    const senderId = event?.sender?.id ?? 0
    try {
      return await relocateFile(senderId, payload)
    } catch (err) {
      return { ok: false, error: formatFsError(err, 'Failed to move file on disk.') }
    }
  }

  async function handlePersistUiState(event, payload) {
    const senderId = event?.sender?.id ?? 0
    try {
      const root = activeWorkspaceRootBySender.get(senderId)
      if (!root) {
        return { ok: false }
      }
      const meta = (await readPersistedMeta()) || { workspaceRoot: root, fileIdsByPath: {} }
      meta.workspaceRoot = root
      if (payload && typeof payload === 'object') {
        if (payload.activeFilePath === null) {
          meta.activeFilePath = null
        } else if (typeof payload.activeFilePath === 'string') {
          meta.activeFilePath = normalizeRelativePath(payload.activeFilePath)
        }
        if (Array.isArray(payload.openFilePaths)) {
          meta.openFilePaths = payload.openFilePaths.map(normalizeRelativePath).filter(Boolean)
        }
        if (payload.fileIdsByPath && typeof payload.fileIdsByPath === 'object') {
          meta.fileIdsByPath = { ...meta.fileIdsByPath, ...payload.fileIdsByPath }
        }
      }
      await writePersistedMeta(meta)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }

  async function scanWorkspaceDirectory(rootDir, fileIdsByPath) {
    const folders = []
    const files = []

    async function walk(absDir, relPrefix, depth) {
      if (depth > MAX_WALK_DEPTH || files.length >= MAX_WORKSPACE_FILES) {
        return
      }
      const entries = await fs.promises.readdir(absDir, { withFileTypes: true })
      entries.sort((a, b) => a.name.localeCompare(b.name))

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue
        }
        const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
        const absPath = path.join(absDir, entry.name)
        if (entry.isDirectory()) {
          folders.push(relPath)
          await walk(absPath, relPath, depth + 1)
        } else if (entry.isFile()) {
          if (files.length >= MAX_WORKSPACE_FILES) {
            continue
          }
          const language = inferLanguageFromFilename(entry.name)
          if (!language) {
            continue
          }
          const content = await fs.promises.readFile(absPath, 'utf8')
          const stableId =
            fileIdsByPath[relPath] ||
            DEFAULT_ID_BY_PATH[relPath] ||
            `ws_${relPath.replace(/[^a-zA-Z0-9_-]/g, '_')}`
          files.push({
            id: stableId,
            name: entry.name,
            path: relPath,
            language,
            content,
          })
        }
      }
    }

    await walk(rootDir, '', 0)
    return { folders, files }
  }

  async function handleLoadPersisted(event) {
    const senderId = event?.sender?.id ?? 0
    try {
      const meta = await readPersistedMeta()
      if (!meta) {
        return { found: false }
      }
      const stat = await fs.promises.stat(meta.workspaceRoot).catch(() => null)
      if (!stat || !stat.isDirectory()) {
        await clearPersistedMeta()
        return {
          found: false,
          error: `Previously saved workspace directory was not found: ${meta.workspaceRoot}`,
        }
      }
      const { folders, files } = await scanWorkspaceDirectory(
        meta.workspaceRoot,
        meta.fileIdsByPath || {},
      )
      if (files.length === 0 && folders.length === 0) {
        return {
          found: true,
          workspaceRoot: meta.workspaceRoot,
          workspaceName: path.basename(meta.workspaceRoot),
          folders: [],
          files: [],
          activeFilePath: null,
          openFilePaths: [],
        }
      }

      activeWorkspaceRootBySender.set(senderId, meta.workspaceRoot)
      return {
        found: true,
        workspaceRoot: meta.workspaceRoot,
        workspaceName: path.basename(meta.workspaceRoot),
        folders,
        files,
        activeFilePath: meta.activeFilePath,
        openFilePaths: meta.openFilePaths,
      }
    } catch (err) {
      return {
        found: false,
        error: formatFsError(err, 'Failed to load persisted workspace.'),
      }
    }
  }

  function register() {
    ipcMain.handle('compilecraft:workspace:select-dir', handleSelectDirectory)
    ipcMain.handle('compilecraft:workspace:save-as', handleSaveAs)
    ipcMain.handle('compilecraft:workspace:save-file', handleSaveFile)
    ipcMain.handle('compilecraft:workspace:read-file', handleReadFile)
    ipcMain.handle('compilecraft:workspace:create-folder', handleCreateFolder)
    ipcMain.handle('compilecraft:workspace:rename-file', handleRenameFile)
    ipcMain.handle('compilecraft:workspace:move-file', handleMoveFile)
    ipcMain.handle('compilecraft:workspace:persist-ui-state', handlePersistUiState)
    ipcMain.handle('compilecraft:workspace:load-persisted', handleLoadPersisted)
  }

  function clearSender(senderId) {
    authorizedPickDirsBySender.delete(senderId)
    activeWorkspaceRootBySender.delete(senderId)
  }

  return { register, clearSender }
}

module.exports = { createWorkspaceHandlers }
