import type { Monaco } from '@monaco-editor/react'

const THEME_NAME = 'compilecraft-dark'
let registered = false

export function ensureMonacoSetup(monaco: Monaco): string {
  if (!registered) {
    monaco.languages.register({ id: 'compilecraft-mc' })
    monaco.languages.setMonarchTokensProvider('compilecraft-mc', {
      keywords: [
        'int',
        'float',
        'bool',
        'true',
        'false',
        'if',
        'else',
        'while',
        'print',
      ],
      operators: [
        '=',
        '+',
        '-',
        '*',
        '/',
        '%',
        '==',
        '!=',
        '<',
        '>',
        '<=',
        '>=',
        '&&',
        '||',
        '!',
      ],
      symbols: /[=><!~?:&|+\-*/%]+/,
      tokenizer: {
        root: [
          [/[a-zA-Z_]\w*/, {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier',
            },
          }],
          [/\/\/.*$/, 'comment'],
          [/\d+\.\d+/, 'number.float'],
          [/\d+/, 'number'],
          [/[{}()[\]]/, '@brackets'],
          [/@symbols/, {
            cases: {
              '@operators': 'operator',
              '@default': '',
            },
          }],
          [/[;,.]/, 'delimiter'],
          [/\s+/, 'white'],
        ],
      },
    })

    monaco.editor.defineTheme(THEME_NAME, {
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
      ],
      colors: {
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

    registered = true
  }

  return THEME_NAME
}
