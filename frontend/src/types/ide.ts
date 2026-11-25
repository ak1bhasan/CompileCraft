import type { editor } from 'monaco-editor'

export type LanguageId = 'c' | 'cpp' | 'java' | 'mc'

export type ResultsTabId = 'tokens' | 'parser' | 'ast' | 'diagnostics'

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
  { id: 'mc', label: 'Baseline (.mc)', monacoLanguage: 'compilecraft-mc' },
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
