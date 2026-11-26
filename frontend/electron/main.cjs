const { app, BrowserWindow, dialog, ipcMain, session } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const { createWorkspaceHandlers } = require('./workspaceManager.cjs')

if (
  typeof process.env.COMPILECRAFT_USER_DATA_DIR === 'string' &&
  process.env.COMPILECRAFT_USER_DATA_DIR.trim().length > 0
) {
  app.setPath('userData', path.resolve(process.env.COMPILECRAFT_USER_DATA_DIR.trim()))
}

const ALLOWED_LANGUAGES = new Set(['c', 'cpp', 'java'])
const EXTENSION_BY_LANGUAGE = {
  c: '.c',
  cpp: '.cpp',
  java: '.java',
}
const DEFAULT_FILENAME_BY_LANGUAGE = {
  c: 'main.c',
  cpp: 'main.cpp',
  java: 'Main.java',
}

const MAX_SOURCE_BYTES = 512 * 1024
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
const CLI_TIMEOUT_MS = 8000

const activeJobs = new Map()
const activeRuns = new Map()
let nextJobSeq = 1

/**
 * Resolve the unified CompileCraft CLI executable without relying on shell PATH.
 */
async function resolveCliPath() {
  const exeName = process.platform === 'win32' ? 'compilecraft.exe' : 'compilecraft'
  const envOverride = process.env.COMPILECRAFT_CLI_PATH
  const candidates = []

  if (typeof envOverride === 'string' && envOverride.trim().length > 0) {
    candidates.push(path.resolve(envOverride.trim()))
  } else {
    candidates.push(path.resolve(__dirname, '..', '..', 'bin', exeName))
    if (process.resourcesPath) {
      candidates.push(path.resolve(process.resourcesPath, 'bin', exeName))
    }
  }

  for (const candidate of candidates) {
    try {
      const stat = await fs.promises.stat(candidate)
      if (stat.isFile()) {
        return { found: true, cliPath: candidate, candidates }
      }
    } catch {
      // Try next candidate
    }
  }

  return {
    found: false,
    cliPath: candidates[0] || path.resolve(__dirname, '..', '..', 'bin', exeName),
    candidates,
  }
}

function terminateProcessTree(child) {
  if (!child || child.killed) {
    return
  }
  if (process.platform === 'win32' && child.pid) {
    try {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.on('error', () => {
        try {
          child.kill()
        } catch {
          // Ignore already-exited child
        }
      })
      return
    } catch {
      // Fallback below
    }
  }
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL')
      return
    } catch {
      // Fallback below
    }
  }
  try {
    child.kill('SIGKILL')
  } catch {
    try {
      child.kill()
    } catch {
      // Ignore already-exited child
    }
  }
}

/**
 * Spawn a native binary directly (shell: false) with bounded output and timeout.
 */
function runBinary(cliPath, args, workingDir, jobCtx) {
  return new Promise((resolve) => {
    if (jobCtx && jobCtx.aborted) {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: '',
        spawnError: null,
        timedOut: false,
        aborted: true,
        durationMs: 0,
      })
      return
    }

    const startedAt = Date.now()
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let finished = false
    let timedOut = false

    const child = spawn(cliPath, args, {
      cwd: workingDir,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
    })

    if (jobCtx) {
      jobCtx.children.add(child)
    }

    const timer = setTimeout(() => {
      if (!finished) {
        timedOut = true
        terminateProcessTree(child)
      }
    }, CLI_TIMEOUT_MS)

    const appendChunk = (current, byteCount, chunk) => {
      if (byteCount >= MAX_OUTPUT_BYTES) {
        return { text: current, bytes: byteCount }
      }
      const nextText = chunk.toString('utf8')
      const remaining = MAX_OUTPUT_BYTES - byteCount
      const slice = Buffer.from(nextText, 'utf8').subarray(0, remaining).toString('utf8')
      return {
        text: current + slice,
        bytes: byteCount + chunk.length,
      }
    }

    child.stdout.on('data', (chunk) => {
      const next = appendChunk(stdout, stdoutBytes, chunk)
      stdout = next.text
      stdoutBytes = next.bytes
    })

    child.stderr.on('data', (chunk) => {
      const next = appendChunk(stderr, stderrBytes, chunk)
      stderr = next.text
      stderrBytes = next.bytes
    })

    child.on('error', (error) => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)
      if (jobCtx) {
        jobCtx.children.delete(child)
      }
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr || error.message,
        spawnError: error.message,
        timedOut,
        aborted: Boolean(jobCtx && jobCtx.aborted),
        durationMs: Date.now() - startedAt,
      })
    })

    child.on('close', (code) => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)
      if (jobCtx) {
        jobCtx.children.delete(child)
      }
      resolve({
        exitCode: typeof code === 'number' ? code : 1,
        stdout,
        stderr,
        spawnError: null,
        timedOut,
        aborted: Boolean(jobCtx && jobCtx.aborted),
        durationMs: Date.now() - startedAt,
      })
    })
  })
}

function sanitizeSourceFileName(rawName, language) {
  const ext = EXTENSION_BY_LANGUAGE[language]
  const fallback = DEFAULT_FILENAME_BY_LANGUAGE[language]
  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    return fallback
  }

  const base = path.basename(rawName.trim()).replace(/[^A-Za-z0-9._-]/g, '_')
  const stem = base.replace(/\.(c|cpp|java|mc)$/i, '')
  if (!stem || stem === '.' || stem === '..') {
    return fallback
  }
  return `${stem}${ext}`
}

function parseTokensOutput(raw) {
  if (!raw) {
    return []
  }

  const tokens = []
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    const match = trimmed.match(/^Line\s+(\d+):\s+(\S+)\s+'(.*)'$/)
    if (match) {
      tokens.push({
        line: Number(match[1]),
        tokenType: match[2],
        lexeme: match[3],
      })
    }
  }
  return tokens
}

function parseSymtabOutput(raw) {
  if (!raw) {
    return []
  }

  const symbols = []
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    const match = trimmed.match(/^Line\s+(\d+):\s+(\S+)\s+type=(\S+)\s+scope=(\d+)$/)
    if (match) {
      symbols.push({
        line: Number(match[1]),
        name: match[2],
        dataType: match[3],
        scope: Number(match[4]),
      })
    }
  }
  return symbols
}

function parseDiagnostics(stderrText) {
  if (!stderrText) {
    return []
  }

  const diagnostics = []
  const seen = new Set()
  const lines = stderrText.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    const typedMatch = trimmed.match(
      /^(Lexical|Syntax|Semantic|Runtime)\s+Error(?:\s+at\s+line\s+(\d+))?:\s*(.+)$/i,
    )
    if (typedMatch) {
      const stageRaw = typedMatch[1].toLowerCase()
      const stage = stageRaw.charAt(0).toUpperCase() + stageRaw.slice(1)
      const parsedLine = typedMatch[2] ? Number(typedMatch[2]) : null
      const message = typedMatch[3].trim()
      const key = `${stage}:${parsedLine ?? ''}:${message}`
      if (!seen.has(key)) {
        seen.add(key)
        diagnostics.push({
          stage,
          line: parsedLine,
          message,
          raw: trimmed,
        })
      }
      continue
    }

    const lineFallback = trimmed.match(/\bline\s+(\d+)\b/i)
    const fallbackLine = lineFallback ? Number(lineFallback[1]) : null
    const key = `Compiler:${fallbackLine ?? ''}:${trimmed}`
    if (!seen.has(key)) {
      seen.add(key)
      diagnostics.push({
        stage: 'Compiler',
        line: fallbackLine,
        message: trimmed,
        raw: trimmed,
      })
    }
  }

  return diagnostics
}

function makeEarlyFailureResult({
  language = 'c',
  durationMs = 0,
  cliPath = '',
  cliMissing = false,
  stage = 'Validation',
  line = null,
  message,
  raw,
  errorSummary,
}) {
  return {
    ok: false,
    exitCode: 1,
    language,
    durationMs,
    cliPath,
    cliMissing,
    tokens: [],
    tokensRaw: '',
    ast: '',
    symbols: [],
    symtabRaw: '',
    tac: '',
    executionStatus: 'not_run',
    executionOk: false,
    executionExitCode: null,
    executionDurationMs: null,
    programOutput: '',
    executionStderr: '',
    diagnostics: [
      {
        stage,
        line,
        message,
        raw: raw || message,
      },
    ],
    rawStderr: raw || message,
    errorSummary: errorSummary || message,
  }
}

async function prepareAndCompile(event, payload, { preserveTempOnSuccess = false } = {}) {
  const startedAt = Date.now()

  if (!payload || typeof payload !== 'object') {
    return {
      earlyFailure: makeEarlyFailureResult({
        message: 'Invalid compilation payload.',
        errorSummary: 'Invalid compilation request',
      }),
    }
  }

  const { language, source, fileName, runId } = payload

  if (typeof language !== 'string' || !ALLOWED_LANGUAGES.has(language)) {
    return {
      earlyFailure: makeEarlyFailureResult({
        message: `Unsupported language "${String(language)}". Supported IDE languages: C, C++, Java.`,
        raw: `Unsupported language "${String(language)}".`,
        errorSummary: 'Unsupported language',
      }),
    }
  }

  if (typeof source !== 'string') {
    return {
      earlyFailure: makeEarlyFailureResult({
        language,
        message: 'Source text must be a string.',
        errorSummary: 'Invalid source buffer',
      }),
    }
  }

  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    return {
      earlyFailure: makeEarlyFailureResult({
        language,
        message: 'Source file exceeds the 512 KB limit.',
        errorSummary: 'Source exceeds size limit',
      }),
    }
  }

  if (source.trim().length === 0) {
    return {
      earlyFailure: makeEarlyFailureResult({
        language,
        line: 1,
        message: 'Source editor is empty. Enter C, C++, or Java code before compiling.',
        raw: 'Source editor is empty.',
        errorSummary: 'Source editor is empty',
      }),
    }
  }

  const cliInfo = await resolveCliPath()
  if (!cliInfo.found) {
    const missingMsg = `CompileCraft CLI executable not found at "${cliInfo.cliPath}". Run "mingw32-make all" in the repository root.`
    return {
      earlyFailure: makeEarlyFailureResult({
        language,
        durationMs: Date.now() - startedAt,
        cliPath: cliInfo.cliPath,
        cliMissing: true,
        stage: 'System',
        message: missingMsg,
        errorSummary: 'Compiler executable not found',
      }),
    }
  }

  const jobKey =
    typeof runId === 'string' && runId.trim().length > 0
      ? runId.trim()
      : `job-${nextJobSeq++}`
  const jobCtx = {
    senderId: event?.sender?.id ?? 0,
    aborted: false,
    children: new Set(),
  }
  activeJobs.set(jobKey, jobCtx)

  const cliDir = path.dirname(cliInfo.cliPath)
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'compilecraft-ide-'))
  const safeName = sanitizeSourceFileName(fileName, language)
  const tempFilePath = path.join(tempDir, safeName)
  let keepTempDir = false

  try {
    await fs.promises.writeFile(tempFilePath, source, 'utf8')

    const [tokensRun, tacRun] = await Promise.all([
      runBinary(cliInfo.cliPath, ['--tokens', tempFilePath], cliDir, jobCtx),
      runBinary(cliInfo.cliPath, [tempFilePath], cliDir, jobCtx),
    ])

    const tokensRaw = tokensRun.stdout || ''
    const tokens = parseTokensOutput(tokensRaw)

    const combinedStderr = [tacRun.stderr, tokensRun.stderr].filter(Boolean).join('\n').trim()
    let diagnostics = parseDiagnostics(combinedStderr)

    if (jobCtx.aborted || tacRun.aborted || tokensRun.aborted) {
      diagnostics = [
        {
          stage: 'System',
          line: null,
          message: 'Compilation stopped by user.',
          raw: 'Compilation stopped by user.',
        },
      ]
    } else if (tacRun.timedOut || tokensRun.timedOut) {
      diagnostics = [
        {
          stage: 'System',
          line: null,
          message: `Compiler timed out after ${CLI_TIMEOUT_MS}ms.`,
          raw: `Compiler timed out after ${CLI_TIMEOUT_MS}ms.`,
        },
      ]
    } else if (tacRun.exitCode !== 0 && diagnostics.length === 0) {
      diagnostics = [
        {
          stage: 'Compiler',
          line: null,
          message: `Compilation failed with exit code ${tacRun.exitCode}.`,
          raw: `Compilation failed with exit code ${tacRun.exitCode}.`,
        },
      ]
    }

    let ast = ''
    let symtabRaw = ''
    let symbols = []
    let tac = ''

    const hasLexOrSyntaxError = diagnostics.some(
      (entry) => entry.stage === 'Lexical' || entry.stage === 'Syntax',
    )

    const compileOk =
      !jobCtx.aborted &&
      !tacRun.aborted &&
      !tacRun.timedOut &&
      tacRun.exitCode === 0 &&
      diagnostics.length === 0

    if (compileOk) {
      tac = tacRun.stdout || ''
      const [astRun, symtabRun] = await Promise.all([
        runBinary(cliInfo.cliPath, ['--ast', tempFilePath], cliDir, jobCtx),
        runBinary(cliInfo.cliPath, ['--symtab', tempFilePath], cliDir, jobCtx),
      ])

      if (astRun.exitCode === 0) {
        ast = astRun.stdout || ''
      }
      if (symtabRun.exitCode === 0) {
        symtabRaw = symtabRun.stdout || ''
        symbols = parseSymtabOutput(symtabRaw)
      }

      if (preserveTempOnSuccess && !jobCtx.aborted) {
        keepTempDir = true
      }
    } else if (!hasLexOrSyntaxError && !tacRun.timedOut && !jobCtx.aborted) {
      const astRun = await runBinary(cliInfo.cliPath, ['--ast', tempFilePath], cliDir, jobCtx)
      if (astRun.exitCode === 0) {
        ast = astRun.stdout || ''
      }
    }

    return {
      earlyFailure: null,
      startedAt,
      language,
      cliInfo,
      cliDir,
      tempDir,
      tempFilePath,
      jobKey,
      jobCtx,
      compileOk: compileOk && !jobCtx.aborted,
      tacExitCode: tacRun.exitCode,
      tokens,
      tokensRaw,
      ast,
      symbols,
      symtabRaw,
      tac: compileOk ? tac : '',
      diagnostics,
      combinedStderr,
    }
  } finally {
    activeJobs.delete(jobKey)
    if (!keepTempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

async function handleCompileRequest(event, payload) {
  const prep = await prepareAndCompile(event, payload, { preserveTempOnSuccess: true })
  if (prep.earlyFailure) {
    return prep.earlyFailure
  }

  const {
    startedAt,
    language,
    cliInfo,
    cliDir,
    tempDir,
    tempFilePath,
    jobKey,
    jobCtx,
    compileOk,
    tacExitCode,
    tokens,
    tokensRaw,
    ast,
    symbols,
    symtabRaw,
    tac,
    combinedStderr,
  } = prep
  let diagnostics = prep.diagnostics

  let executionStatus = 'not_run'
  let executionOk = false
  let executionExitCode = null
  let executionDurationMs = null
  let programOutput = ''
  let executionStderr = ''

  try {
    if (compileOk) {
      activeJobs.set(jobKey, jobCtx)
      const execRun = await runBinary(cliInfo.cliPath, ['--run', tempFilePath], cliDir, jobCtx)
      programOutput = execRun.stdout || ''
      executionStderr = (execRun.stderr || '').trim()
      executionDurationMs = execRun.durationMs

      if (jobCtx.aborted || execRun.aborted) {
        executionStatus = 'aborted'
        executionOk = false
        executionExitCode = 130
        diagnostics = [
          ...diagnostics,
          {
            stage: 'Runtime',
            line: null,
            message: 'Program execution stopped by user.',
            raw: 'Runtime Error: Program execution stopped by user.',
          },
        ]
      } else if (execRun.timedOut) {
        executionStatus = 'runtime_error'
        executionOk = false
        executionExitCode = 1
        diagnostics = [
          ...diagnostics,
          {
            stage: 'Runtime',
            line: null,
            message: `Program execution timed out after ${CLI_TIMEOUT_MS}ms.`,
            raw: `Runtime Error: Program execution timed out after ${CLI_TIMEOUT_MS}ms.`,
          },
        ]
      } else if (execRun.exitCode !== 0) {
        executionStatus = 'runtime_error'
        executionOk = false
        executionExitCode = execRun.exitCode
        const execDiags = parseDiagnostics(executionStderr)
        if (execDiags.length > 0) {
          diagnostics = [...diagnostics, ...execDiags]
        } else {
          diagnostics = [
            ...diagnostics,
            {
              stage: 'Runtime',
              line: null,
              message: `Program exited with runtime error (exit code ${execRun.exitCode}).`,
              raw: `Runtime Error: Program exited with code ${execRun.exitCode}.`,
            },
          ]
        }
      } else {
        executionStatus = 'succeeded'
        executionOk = true
        executionExitCode = 0
      }
    }

    const durationMs = Date.now() - startedAt
    const fullStderr = [combinedStderr, executionStderr].filter(Boolean).join('\n').trim()

    return {
      ok: compileOk,
      exitCode: compileOk ? 0 : tacExitCode || 1,
      language,
      durationMs,
      cliPath: cliInfo.cliPath,
      cliMissing: false,
      tokens,
      tokensRaw,
      ast,
      symbols,
      symtabRaw,
      tac: compileOk ? tac : '',
      executionStatus,
      executionOk,
      executionExitCode,
      executionDurationMs,
      programOutput: compileOk ? programOutput : '',
      executionStderr: compileOk ? executionStderr : '',
      diagnostics,
      rawStderr: fullStderr,
      errorSummary:
        compileOk && executionOk
          ? ''
          : diagnostics[0]
            ? diagnostics[0].raw
            : compileOk
              ? 'Runtime error'
              : 'Compilation failed',
    }
  } finally {
    activeJobs.delete(jobKey)
    if (compileOk) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

function emitExecEvent(sender, payload) {
  if (sender && typeof sender.isDestroyed === 'function' && !sender.isDestroyed()) {
    sender.send('compilecraft:exec-event', payload)
  }
}

function handleInteractiveOutputChunk(runCtx, sender, kind, chunk) {
  if (runCtx.finished || runCtx.outputLimitExceeded || !chunk || chunk.length === 0) {
    return
  }

  const remaining = MAX_OUTPUT_BYTES - runCtx.totalOutputBytes
  if (chunk.length <= remaining) {
    runCtx.totalOutputBytes += chunk.length
    const text = chunk.toString('utf8')
    if (kind === 'stderr') {
      runCtx.stderrBuffer += text
    }
    emitExecEvent(sender, { runId: runCtx.runId, type: kind, data: text })
    return
  }

  if (remaining > 0) {
    const partial = chunk.subarray(0, remaining).toString('utf8')
    runCtx.totalOutputBytes = MAX_OUTPUT_BYTES
    if (kind === 'stderr') {
      runCtx.stderrBuffer += partial
    }
    emitExecEvent(sender, { runId: runCtx.runId, type: kind, data: partial })
  }

  runCtx.outputLimitExceeded = true
  const limitMsg = '\nRuntime Error: Output exceeded 2 MB limit; process terminated.\n'
  runCtx.stderrBuffer += limitMsg
  emitExecEvent(sender, { runId: runCtx.runId, type: 'stderr', data: limitMsg })
  terminateProcessTree(runCtx.child)
}

async function handleStartRunRequest(event, payload) {
  const prep = await prepareAndCompile(event, payload, { preserveTempOnSuccess: true })
  if (prep.earlyFailure) {
    return {
      started: false,
      runId: typeof payload?.runId === 'string' ? payload.runId : '',
      compileResult: prep.earlyFailure,
    }
  }

  const {
    startedAt,
    language,
    cliInfo,
    cliDir,
    tempDir,
    tempFilePath,
    jobKey,
    compileOk,
    tacExitCode,
    tokens,
    tokensRaw,
    ast,
    symbols,
    symtabRaw,
    tac,
    diagnostics,
    combinedStderr,
  } = prep

  if (!compileOk) {
    return {
      started: false,
      runId: jobKey,
      compileResult: {
        ok: false,
        exitCode: tacExitCode || 1,
        language,
        durationMs: Date.now() - startedAt,
        cliPath: cliInfo.cliPath,
        cliMissing: false,
        tokens,
        tokensRaw,
        ast,
        symbols,
        symtabRaw,
        tac: '',
        executionStatus: 'not_run',
        executionOk: false,
        executionExitCode: null,
        executionDurationMs: null,
        programOutput: '',
        executionStderr: '',
        diagnostics,
        rawStderr: combinedStderr,
        errorSummary: diagnostics[0] ? diagnostics[0].raw : 'Compilation failed',
      },
    }
  }

  const sender = event?.sender
  const execStartedAt = Date.now()
  const child = spawn(cliInfo.cliPath, ['--run', tempFilePath], {
    cwd: cliDir,
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const runCtx = {
    runId: jobKey,
    senderId: sender?.id ?? 0,
    child,
    tempDir,
    aborted: false,
    stdinClosed: false,
    finished: false,
    outputLimitExceeded: false,
    totalOutputBytes: 0,
    stderrBuffer: '',
  }
  activeRuns.set(jobKey, runCtx)

  if (child.stdin) {
    child.stdin.on('error', () => {
      // Ignore EPIPE when child exits before/during stdin write
    })
  }

  child.stdout.on('data', (chunk) => {
    handleInteractiveOutputChunk(runCtx, sender, 'stdout', chunk)
  })

  child.stderr.on('data', (chunk) => {
    handleInteractiveOutputChunk(runCtx, sender, 'stderr', chunk)
  })

  const finalizeRun = (code, spawnErr) => {
    if (runCtx.finished) {
      return
    }
    runCtx.finished = true
    activeRuns.delete(jobKey)
    void fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})

    const durationMs = Date.now() - execStartedAt
    const rawCode = typeof code === 'number' ? code : 1
    let executionStatus = 'succeeded'
    let exitCode = rawCode
    let exitDiags = []

    if (runCtx.aborted) {
      executionStatus = 'aborted'
      exitCode = 130
      exitDiags = [
        {
          stage: 'Runtime',
          line: null,
          message: 'Program execution stopped by user.',
          raw: 'Runtime Error: Program execution stopped by user.',
        },
      ]
    } else if (spawnErr) {
      executionStatus = 'runtime_error'
      exitCode = 1
      exitDiags = [
        {
          stage: 'Runtime',
          line: null,
          message: spawnErr.message,
          raw: `Runtime Error: ${spawnErr.message}`,
        },
      ]
    } else if (runCtx.outputLimitExceeded || rawCode !== 0) {
      executionStatus = 'runtime_error'
      exitCode = rawCode !== 0 ? rawCode : 1
      exitDiags = parseDiagnostics(runCtx.stderrBuffer.trim())
      if (exitDiags.length === 0) {
        exitDiags = [
          {
            stage: 'Runtime',
            line: null,
            message: `Program exited with runtime error (exit code ${exitCode}).`,
            raw: `Runtime Error: Program exited with code ${exitCode}.`,
          },
        ]
      }
    }

    emitExecEvent(sender, {
      runId: jobKey,
      type: 'exit',
      exitCode,
      aborted: runCtx.aborted,
      durationMs,
      executionStatus,
      diagnostics: exitDiags,
      errorSummary:
        executionStatus === 'succeeded'
          ? ''
          : exitDiags[0]?.raw || 'Runtime error',
    })
  }

  child.on('error', (error) => {
    finalizeRun(1, error)
  })

  child.on('close', (code) => {
    finalizeRun(code, null)
  })

  return {
    started: true,
    runId: jobKey,
    compileResult: {
      ok: true,
      exitCode: 0,
      language,
      durationMs: Date.now() - startedAt,
      cliPath: cliInfo.cliPath,
      cliMissing: false,
      tokens,
      tokensRaw,
      ast,
      symbols,
      symtabRaw,
      tac,
      executionStatus: 'running',
      executionOk: false,
      executionExitCode: null,
      executionDurationMs: null,
      programOutput: '',
      executionStderr: '',
      diagnostics: [],
      rawStderr: combinedStderr,
      errorSummary: '',
    },
  }
}

function handleSendInputRequest(event, payload) {
  const senderId = event?.sender?.id ?? 0
  const runId = typeof payload?.runId === 'string' ? payload.runId.trim() : ''
  const input = payload?.input
  if (!runId || typeof input !== 'string' || Buffer.byteLength(input, 'utf8') > 64 * 1024) {
    return { ok: false }
  }

  const runCtx = activeRuns.get(runId)
  if (
    !runCtx ||
    runCtx.senderId !== senderId ||
    runCtx.aborted ||
    runCtx.stdinClosed ||
    runCtx.finished ||
    !runCtx.child.stdin ||
    runCtx.child.stdin.destroyed ||
    !runCtx.child.stdin.writable
  ) {
    return { ok: false }
  }

  try {
    runCtx.child.stdin.write(input, 'utf8')
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

function handleSendEofRequest(event, runIdRaw) {
  const senderId = event?.sender?.id ?? 0
  const runId = typeof runIdRaw === 'string' ? runIdRaw.trim() : ''
  if (!runId) {
    return { ok: false }
  }

  const runCtx = activeRuns.get(runId)
  if (
    !runCtx ||
    runCtx.senderId !== senderId ||
    runCtx.aborted ||
    runCtx.stdinClosed ||
    runCtx.finished ||
    !runCtx.child.stdin ||
    runCtx.child.stdin.destroyed
  ) {
    return { ok: false }
  }

  runCtx.stdinClosed = true
  try {
    runCtx.child.stdin.end()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

function stopJobsMatching(predicate) {
  let stoppedAny = false
  for (const job of activeJobs.values()) {
    if (!predicate(job)) {
      continue
    }
    job.aborted = true
    for (const child of job.children) {
      terminateProcessTree(child)
    }
    stoppedAny = true
  }
  for (const runCtx of activeRuns.values()) {
    if (!predicate(runCtx)) {
      continue
    }
    runCtx.aborted = true
    terminateProcessTree(runCtx.child)
    stoppedAny = true
  }
  return stoppedAny
}

function handleStopRequest(event, runId) {
  const senderId = event?.sender?.id ?? 0
  if (typeof runId === 'string' && runId.trim().length > 0) {
    const key = runId.trim()
    let stopped = false
    const job = activeJobs.get(key)
    if (job && job.senderId === senderId) {
      job.aborted = true
      for (const child of job.children) {
        terminateProcessTree(child)
      }
      stopped = true
    }
    const runCtx = activeRuns.get(key)
    if (runCtx && runCtx.senderId === senderId) {
      runCtx.aborted = true
      terminateProcessTree(runCtx.child)
      stopped = true
    }
    return { stopped }
  }
  return { stopped: stopJobsMatching((entry) => entry.senderId === senderId) }
}

async function handleHealthCheck() {
  const cliInfo = await resolveCliPath()
  return {
    found: cliInfo.found,
    cliPath: cliInfo.cliPath,
    supportedLanguages: ['c', 'cpp', 'java'],
  }
}

const APP_DIST_DIR = path.resolve(__dirname, '..', 'dist')
const APP_INDEX_HTML = path.join(APP_DIST_DIR, 'index.html')

function isPermittedAppUrl(targetUrl, devUrl) {
  try {
    const parsed = new URL(targetUrl)
    if (devUrl) {
      const parsedDev = new URL(devUrl)
      return parsed.origin === parsedDev.origin
    }
    if (parsed.protocol !== 'file:') {
      return false
    }
    const targetPath = path.resolve(fileURLToPath(parsed))
    return targetPath.toLowerCase() === APP_INDEX_HTML.toLowerCase()
  } catch {
    return false
  }
}

function isPermittedNetworkRequest(requestUrl, devUrl) {
  try {
    const parsed = new URL(requestUrl)
    if (parsed.protocol === 'blob:' || parsed.protocol === 'data:') {
      return true
    }
    if (devUrl) {
      const parsedDev = new URL(devUrl)
      if (parsed.origin === parsedDev.origin) {
        return true
      }
    }
    if (parsed.protocol !== 'file:') {
      return false
    }
    const targetPath = path.resolve(fileURLToPath(parsed))
    const rel = path.relative(APP_DIST_DIR, targetPath)
    return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
  } catch {
    return false
  }
}

let activeMainWindow = null
const workspaceHandlers = createWorkspaceHandlers({
  app,
  dialog,
  ipcMain,
  getMainWindow: () => activeMainWindow,
})

function createMainWindow() {
  const devUrl = process.env.COMPILECRAFT_DEV_URL

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b0b12',
    title: 'CompileCraft',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  activeMainWindow = mainWindow

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (isPermittedAppUrl(targetUrl, devUrl)) {
      return
    }
    event.preventDefault()
  })

  const webContentsId = mainWindow.webContents.id
  mainWindow.on('closed', () => {
    if (activeMainWindow === mainWindow) {
      activeMainWindow = null
    }
    workspaceHandlers.clearSender(webContentsId)
    stopJobsMatching((job) => job.senderId === webContentsId)
  })

  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(APP_INDEX_HTML)
  }

  return mainWindow
}

app.whenReady().then(() => {
  const devUrl = process.env.COMPILECRAFT_DEV_URL
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isPermittedNetworkRequest(details.url, devUrl) })
  })

  ipcMain.handle('compilecraft:compile', handleCompileRequest)
  ipcMain.handle('compilecraft:start-run', handleStartRunRequest)
  ipcMain.handle('compilecraft:send-input', handleSendInputRequest)
  ipcMain.handle('compilecraft:send-eof', handleSendEofRequest)
  ipcMain.handle('compilecraft:stop', handleStopRequest)
  ipcMain.handle('compilecraft:health', handleHealthCheck)
  workspaceHandlers.register()

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('before-quit', () => {
  stopJobsMatching(() => true)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    app.exit(0)
  }
})
