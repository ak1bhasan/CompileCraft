import type { Monaco } from '@monaco-editor/react'
import type { ThemeOption } from '../../types/ide'

export const DARK_THEME_NAME = 'compilecraft-dark'
export const LIGHT_THEME_NAME = 'compilecraft-light'

let registered = false

export function ensureMonacoSetup(monaco: Monaco): void {
  if (registered) {
    return
  }

  monaco.editor.defineTheme(DARK_THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b6b80', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'a78bfa' },
      { token: 'number', foreground: 'f0abfc' },
      { token: 'number.float', foreground: 'f0abfc' },
      { token: 'identifier', foreground: 'e8e8f0' },
      { token: 'operator', foreground: 'c4b5fd' },
      { token: 'delimiter', foreground: '9b9bb0' },
      { token: 'string', foreground: '34d399' },
      { token: 'type', foreground: '60a5fa' },
    ],
    colors: {
      // Keep in sync with --cc-editor-bg in styles/index.css
      'editor.background': '#0f0f18',
      'editor.foreground': '#f4f4f8',
      'editorLineNumber.foreground': '#5c5c72',
      'editorLineNumber.activeForeground': '#a78bfa',
      'editorCursor.foreground': '#a78bfa',
      'editor.selectionBackground': '#8b5cf633',
      'editor.inactiveSelectionBackground': '#8b5cf622',
      'editor.lineHighlightBackground': '#1a1a28',
      'editorIndentGuide.background': '#2a2a3c',
      'editorIndentGuide.activeBackground': '#8b5cf655',
      'editorWidget.background': '#12121c',
      'editorWidget.border': '#2a2a3c',
      'editorSuggestWidget.background': '#12121c',
      'editorSuggestWidget.border': '#2a2a3c',
      'scrollbarSlider.background': '#2a2a3c88',
      'scrollbarSlider.hoverBackground': '#8b5cf655',
    },
  })

  monaco.editor.defineTheme(LIGHT_THEME_NAME, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8791a3', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7049d8', fontStyle: 'bold' },
      { token: 'keyword.directive', foreground: '9a3412' },
      { token: 'meta.preprocessor', foreground: '9a3412' },
      { token: 'number', foreground: 'b45309' },
      { token: 'number.float', foreground: 'b45309' },
      { token: 'identifier', foreground: '202638' },
      { token: 'identifier.function', foreground: '0f766e' },
      { token: 'operator', foreground: '5b21b6' },
      { token: 'delimiter', foreground: '687387' },
      { token: 'string', foreground: '15803d' },
      { token: 'type', foreground: '1d4ed8' },
    ],
    colors: {
      // Keep in sync with --cc-editor-bg in styles/index.css for light theme
      'editor.background': '#fcfcfe',
      'editor.foreground': '#202638',
      'editorLineNumber.foreground': '#8791a3',
      'editorLineNumber.activeForeground': '#7049d8',
      'editorCursor.foreground': '#7049d8',
      'editor.selectionBackground': '#eae3fc',
      'editor.inactiveSelectionBackground': '#eae3fc99',
      'editor.lineHighlightBackground': '#f3f5fa',
      'editor.lineHighlightBorder': '#eaeff7',
      'editorBracketMatch.background': '#eae3fc',
      'editorBracketMatch.border': '#7049d866',
      'editorIndentGuide.background': '#e3e8f0',
      'editorIndentGuide.activeBackground': '#7049d855',
      'editorWidget.background': '#f7f8fc',
      'editorWidget.border': '#d9dfe9',
      'editorSuggestWidget.background': '#fcfcfe',
      'editorSuggestWidget.border': '#d9dfe9',
      'scrollbarSlider.background': '#c8d1e088',
      'scrollbarSlider.hoverBackground': '#7049d855',
    },
  })

  registered = true
}

export function getMonacoThemeName(theme: ThemeOption): string {
  return theme === 'light' ? LIGHT_THEME_NAME : DARK_THEME_NAME
}
