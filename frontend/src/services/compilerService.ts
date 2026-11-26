import type {
  CompileRequest,
  CompileResult,
  CompilerHealth,
  ExecutionEvent,
  StartRunResponse,
} from '../types/ide'

declare global {
  interface Window {
    compilecraft?: {
      compile: (request: CompileRequest) => Promise<CompileResult>
      startRun?: (request: CompileRequest) => Promise<StartRunResponse>
      sendInput?: (runId: string, input: string) => Promise<{ ok: boolean }>
      sendEof?: (runId: string) => Promise<{ ok: boolean }>
      stopExecution?: (runId?: string) => Promise<{ stopped: boolean }>
      onExecutionEvent?: (
        listener: (event: ExecutionEvent) => void,
      ) => () => void
      checkCompiler: () => Promise<CompilerHealth>
      getPlatformInfo?: () => { runtime: string; platform: string }
    }
  }
}

export function isElectronHost(): boolean {
  return typeof window !== 'undefined' && typeof window.compilecraft?.compile === 'function'
}

export async function checkCompilerHealth(): Promise<CompilerHealth> {
  if (!isElectronHost() || !window.compilecraft) {
    return {
      found: false,
      cliPath: '',
      supportedLanguages: ['c', 'cpp', 'java'],
    }
  }
  return window.compilecraft.checkCompiler()
}

export async function stopExecution(runId?: string): Promise<boolean> {
  if (!isElectronHost() || !window.compilecraft?.stopExecution) {
    return false
  }
  const response = await window.compilecraft.stopExecution(runId)
  return Boolean(response?.stopped)
}

export async function sendExecutionInput(
  runId: string,
  input: string,
): Promise<boolean> {
  if (!isElectronHost() || !window.compilecraft?.sendInput) {
    return false
  }
  const response = await window.compilecraft.sendInput(runId, input)
  return Boolean(response?.ok)
}

export async function sendExecutionEof(runId: string): Promise<boolean> {
  if (!isElectronHost() || !window.compilecraft?.sendEof) {
    return false
  }
  const response = await window.compilecraft.sendEof(runId)
  return Boolean(response?.ok)
}

export function subscribeExecutionEvents(
  listener: (event: ExecutionEvent) => void,
): () => void {
  if (!isElectronHost() || !window.compilecraft?.onExecutionEvent) {
    return () => {}
  }
  return window.compilecraft.onExecutionEvent(listener)
}

function makeMissingHostResult(request: CompileRequest): CompileResult {
  const message =
    'Electron desktop host is required to invoke bin/compilecraft.exe. Launch the app via Electron ("npm run electron:start") instead of a standalone browser.'
  return {
    ok: false,
    exitCode: 1,
    language: request.language,
    durationMs: 0,
    cliPath: '',
    cliMissing: true,
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
        stage: 'System',
        line: null,
        message,
        raw: message,
      },
    ],
    rawStderr: message,
    errorSummary: 'Electron desktop host not active',
  }
}

export async function compileSource(request: CompileRequest): Promise<CompileResult> {
  if (!isElectronHost() || !window.compilecraft) {
    return makeMissingHostResult(request)
  }

  return window.compilecraft.compile(request)
}

export async function startInteractiveRun(
  request: CompileRequest,
): Promise<StartRunResponse> {
  if (!isElectronHost() || !window.compilecraft) {
    return {
      started: false,
      runId: request.runId ?? '',
      compileResult: makeMissingHostResult(request),
    }
  }

  if (typeof window.compilecraft.startRun === 'function') {
    return window.compilecraft.startRun(request)
  }

  const compileResult = await window.compilecraft.compile(request)
  return {
    started: false,
    runId: request.runId ?? '',
    compileResult,
  }
}
