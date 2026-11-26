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
      { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7c3aed', fontStyle: 'bold' },
      { token: 'number', foreground: 'c026d3' },
      { token: 'number.float', foreground: 'c026d3' },
      { token: 'identifier', foreground: '1e293b' },
      { token: 'operator', foreground: '6d28d9' },
      { token: 'delimiter', foreground: '475569' },
      { token: 'string', foreground: '059669' },
      { token: 'type', foreground: '2563eb' },
    ],
    colors: {
      // Keep in sync with --cc-editor-bg in styles/index.css for light theme
      'editor.background': '#ffffff',
      'editor.foreground': '#0f172a',
      'editorLineNumber.foreground': '#94a3b8',
      'editorLineNumber.activeForeground': '#7c3aed',
      'editorCursor.foreground': '#7c3aed',
      'editor.selectionBackground': '#7c3aed25',
      'editor.inactiveSelectionBackground': '#7c3aed15',
      'editor.lineHighlightBackground': '#f8fafc',
      'editorIndentGuide.background': '#e2e8f0',
      'editorIndentGuide.activeBackground': '#7c3aed66',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#e2e8f0',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#e2e8f0',
      'scrollbarSlider.background': '#cbd5e188',
      'scrollbarSlider.hoverBackground': '#7c3aed55',
    },
  })

  registered = true
}

export function getMonacoThemeName(theme: ThemeOption): string {
  return theme === 'light' ? LIGHT_THEME_NAME : DARK_THEME_NAME
}
