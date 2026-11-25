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

export type FontSizeOption = 12 | 13 | 14 | 16 | 18

export type TabSizeOption = 2 | 4 | 8

export type WordWrapOption = 'on' | 'off'

export type LineNumbersOption = 'on' | 'off'

export interface EditorSettings {
  fontSize: FontSizeOption
  wordWrap: WordWrapOption
  minimap: boolean
  lineNumbers: LineNumbersOption
  tabSize: TabSizeOption
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [12, 13, 14, 16, 18]

export const TAB_SIZE_OPTIONS: TabSizeOption[] = [2, 4, 8]

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 13,
  wordWrap: 'on',
  minimap: false,
  lineNumbers: 'on',
  tabSize: 4,
}
