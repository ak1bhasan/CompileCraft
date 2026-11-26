import type {
  CompileRequest,
  CompileResult,
  CompilerHealth,
} from '../types/ide'

declare global {
  interface Window {
    compilecraft?: {
      compile: (request: CompileRequest) => Promise<CompileResult>
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

export async function compileSource(request: CompileRequest): Promise<CompileResult> {
  if (!isElectronHost() || !window.compilecraft) {
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

  return window.compilecraft.compile(request)
}
