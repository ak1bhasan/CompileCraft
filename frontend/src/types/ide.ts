import type { editor } from 'monaco-editor'

export type LanguageId = 'c' | 'cpp' | 'java'

export type ResultsTabId = 'tokens' | 'ast' | 'symtab' | 'tac' | 'errors'

export type BottomTabId = 'output' | 'problems' | 'terminal'

export interface ExampleFile {
  id: string
  name: string
  path: string
  language: LanguageId
  content: string
}

export type EditorViewState = editor.ICodeEditorViewState

export interface WorkspaceDocument {
  id: string
  name: string
  path: string
  language: LanguageId
  content: string
  baseline: string
  viewState: EditorViewState | null
}

export interface CursorPosition {
  line: number
  column: number
}

export interface LanguageOption {
  id: LanguageId
  label: string
  monacoLanguage: string
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: 'c', label: 'C', monacoLanguage: 'c' },
  { id: 'cpp', label: 'C++', monacoLanguage: 'cpp' },
  { id: 'java', label: 'Java', monacoLanguage: 'java' },
]

export function monacoLanguageFor(language: LanguageId): string {
  return (
    LANGUAGE_OPTIONS.find((option) => option.id === language)?.monacoLanguage ??
    'plaintext'
  )
}

export function languageLabel(language: LanguageId): string {
  return LANGUAGE_OPTIONS.find((option) => option.id === language)?.label ?? language
}

export interface CompileToken {
  line: number
  tokenType: string
  lexeme: string
}

export interface CompileSymbol {
  line: number
  name: string
  dataType: string
  scope: number
}

export type DiagnosticStage =
  | 'Lexical'
  | 'Syntax'
  | 'Semantic'
  | 'Runtime'
  | 'Compiler'
  | 'System'
  | 'Validation'

export type ExecutionStatus =
  | 'not_run'
  | 'running'
  | 'succeeded'
  | 'runtime_error'
  | 'aborted'

export type ConsoleEntryKind = 'stdout' | 'stderr' | 'stdin' | 'system'

export interface ConsoleEntry {
  id: string
  kind: ConsoleEntryKind
  text: string
}

export type ExecutionEvent =
  | { runId: string; type: 'stdout'; data: string }
  | { runId: string; type: 'stderr'; data: string }
  | {
      runId: string
      type: 'exit'
      exitCode: number
      aborted: boolean
      durationMs: number
      executionStatus: Exclude<ExecutionStatus, 'not_run' | 'running'>
      diagnostics: CompileDiagnostic[]
      errorSummary: string
    }

export interface StartRunResponse {
  started: boolean
  runId: string
  compileResult: CompileResult
}

export interface CompileDiagnostic {
  stage: DiagnosticStage | string
  line: number | null
  message: string
  raw: string
}

export interface CompileRequest {
  language: LanguageId
  source: string
  fileName?: string
  runId?: string
}

export interface CompileResult {
  ok: boolean
  exitCode: number
  language: LanguageId
  durationMs: number
  cliPath: string
  cliMissing: boolean
  tokens: CompileToken[]
  tokensRaw: string
  ast: string
  symbols: CompileSymbol[]
  symtabRaw: string
  tac: string
  executionStatus: ExecutionStatus
  executionOk: boolean
  executionExitCode: number | null
  executionDurationMs: number | null
  programOutput: string
  executionStderr: string
  diagnostics: CompileDiagnostic[]
  rawStderr: string
  errorSummary: string
}

export interface CompilerHealth {
  found: boolean
  cliPath: string
  supportedLanguages: LanguageId[]
}

export type FontSizeOption = 12 | 13 | 14 | 16 | 18

export type TabSizeOption = 2 | 4 | 8

export type WordWrapOption = 'on' | 'off'

export type LineNumbersOption = 'on' | 'off'

export type ThemeOption = 'dark' | 'light'

export interface EditorSettings {
  theme: ThemeOption
  fontSize: FontSizeOption
  wordWrap: WordWrapOption
  minimap: boolean
  lineNumbers: LineNumbersOption
  tabSize: TabSizeOption
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [12, 13, 14, 16, 18]

export const TAB_SIZE_OPTIONS: TabSizeOption[] = [2, 4, 8]

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  theme: 'dark',
  fontSize: 13,
  wordWrap: 'on',
  minimap: false,
  lineNumbers: 'on',
  tabSize: 4,
}
