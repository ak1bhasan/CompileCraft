import './monacoSetup'
import Editor, { type BeforeMount, type Monaco, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import type {
  CursorPosition,
  EditorSettings,
  EditorViewState,
  LanguageId,
} from '../../types/ide'
import { monacoLanguageFor } from '../../types/ide'
import {
  applyEditorSettings,
  toMonacoEditorOptions,
  toMonacoModelOptions,
} from './editorSettings'
import { ensureMonacoSetup, getMonacoThemeName } from './monacoTheme'

export interface EditorJumpTarget {
  fileId: string
  line: number
  column?: number
  nonce: number
}

export interface EditorPaneHandle {
  getValue: () => string | null
  captureViewState: () => EditorViewState | null
  resetView: () => void
  revealLine: (line: number, column?: number) => void
  clearHighlight: () => void
}

interface EditorPaneProps {
  fileId: string | null
  value: string
  language: LanguageId | null
  viewState: EditorViewState | null
  settings: EditorSettings
  jumpTarget?: EditorJumpTarget | null
  onChange: (value: string) => void
  onCursorChange: (position: CursorPosition) => void
}

const BASE_EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  detectIndentation: false,
  folding: true,
  renderLineHighlight: 'line',
  smoothScrolling: true,
  padding: { top: 8, bottom: 8 },
  bracketPairColorization: { enabled: true },
  insertSpaces: true,
}

const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(
  function EditorPane(
    {
      fileId,
      value,
      language,
      viewState,
      settings,
      jumpTarget = null,
      onChange,
      onCursorChange,
    },
    ref,
  ) {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const monacoRef = useRef<Monaco | null>(null)
    const viewStateRef = useRef(viewState)
    const activeFileIdRef = useRef(fileId)
    const settingsRef = useRef(settings)
    const jumpTargetRef = useRef(jumpTarget)
    const lastRestoredFileIdRef = useRef<string | null>(null)
    const consumedJumpNonceRef = useRef<number | null>(null)
    const cursorDisposableRef = useRef<{ dispose: () => void } | null>(null)
    const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)

    viewStateRef.current = viewState
    activeFileIdRef.current = fileId
    settingsRef.current = settings
    jumpTargetRef.current = jumpTarget

    useEffect(() => {
      return () => {
        cursorDisposableRef.current?.dispose()
        cursorDisposableRef.current = null
        decorationsRef.current?.clear()
        decorationsRef.current = null
      }
    }, [])

    const applyHighlightAndReveal = useCallback(
      (
        editorInstance: editor.IStandaloneCodeEditor,
        monacoInstance: Monaco,
        line: number,
        column = 1,
      ) => {
        const model = editorInstance.getModel()
        const lineCount = model?.getLineCount() ?? Math.max(1, Math.floor(line))
        const safeLine = Math.max(1, Math.min(lineCount, Math.floor(line)))
        const maxCol = model?.getLineMaxColumn(safeLine) ?? Math.max(1, Math.floor(column))
        const safeColumn = Math.max(1, Math.min(maxCol, Math.floor(column)))

        editorInstance.revealLineInCenter(safeLine)
        editorInstance.setPosition({ lineNumber: safeLine, column: safeColumn })
        editorInstance.focus()

        if (!decorationsRef.current) {
          decorationsRef.current = editorInstance.createDecorationsCollection([])
        }
        decorationsRef.current.set([
          {
            range: new monacoInstance.Range(safeLine, 1, safeLine, Math.max(1, maxCol)),
            options: {
              isWholeLine: true,
              className: 'cc-editor-error-line',
              glyphMarginClassName: 'cc-editor-error-glyph',
            },
          },
        ])

        onCursorChange({ line: safeLine, column: safeColumn })
      },
      [onCursorChange],
    )

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => editorRef.current?.getValue() ?? null,
        captureViewState: () => editorRef.current?.saveViewState() ?? null,
        resetView: () => {
          const editorInstance = editorRef.current
          if (!editorInstance) {
            return
          }
          decorationsRef.current?.clear()
          editorInstance.setPosition({ lineNumber: 1, column: 1 })
          editorInstance.setScrollTop(0)
          editorInstance.setScrollLeft(0)
          lastRestoredFileIdRef.current = activeFileIdRef.current
          onCursorChange({ line: 1, column: 1 })
        },
        revealLine: (line: number, column = 1) => {
          const editorInstance = editorRef.current
          const monacoInstance = monacoRef.current
          if (!editorInstance || !monacoInstance) {
            return
          }
          applyHighlightAndReveal(editorInstance, monacoInstance, line, column)
        },
        clearHighlight: () => {
          decorationsRef.current?.clear()
        },
      }),
      [applyHighlightAndReveal, onCursorChange],
    )

    const handleBeforeMount: BeforeMount = (monaco) => {
      ensureMonacoSetup(monaco)
    }

    const handleMount: OnMount = (editorInstance, monaco) => {
      editorRef.current = editorInstance
      monacoRef.current = monaco
      decorationsRef.current = editorInstance.createDecorationsCollection([])
      monaco.editor.setTheme(getMonacoThemeName(settingsRef.current.theme))
      applyEditorSettings(editorInstance, settingsRef.current)

      const updateCursor = () => {
        const position = editorInstance.getPosition()
        if (!position) {
          return
        }
        onCursorChange({ line: position.lineNumber, column: position.column })
      }

      updateCursor()
      cursorDisposableRef.current?.dispose()
      cursorDisposableRef.current =
        editorInstance.onDidChangeCursorPosition(updateCursor)

      const pendingJump = jumpTargetRef.current
      if (
        fileId &&
        pendingJump &&
        pendingJump.fileId === fileId &&
        consumedJumpNonceRef.current !== pendingJump.nonce
      ) {
        consumedJumpNonceRef.current = pendingJump.nonce
        lastRestoredFileIdRef.current = fileId
        applyHighlightAndReveal(
          editorInstance,
          monaco,
          pendingJump.line,
          pendingJump.column ?? 1,
        )
        return
      }

      if (fileId && viewStateRef.current) {
        editorInstance.restoreViewState(viewStateRef.current)
        lastRestoredFileIdRef.current = fileId
      } else if (fileId) {
        lastRestoredFileIdRef.current = fileId
      }
      editorInstance.focus()
    }

    useEffect(() => {
      const editorInstance = editorRef.current
      if (!editorInstance) {
        return
      }
      applyEditorSettings(editorInstance, settings)
    }, [settings])

    useEffect(() => {
      if (monacoRef.current) {
        monacoRef.current.editor.setTheme(getMonacoThemeName(settings.theme))
      }
    }, [settings.theme])

    useEffect(() => {
      const editorInstance = editorRef.current
      if (!editorInstance || !fileId) {
        lastRestoredFileIdRef.current = null
        return
      }

      // Keep tab size on the active model when switching documents.
      editorInstance.getModel()?.updateOptions(toMonacoModelOptions(settingsRef.current))

      const pendingJump =
        jumpTarget &&
        jumpTarget.fileId === fileId &&
        consumedJumpNonceRef.current !== jumpTarget.nonce
          ? jumpTarget
          : null

      const modelMatchesFile = () => {
        const modelPath = editorInstance.getModel()?.uri.path ?? ''
        return modelPath === fileId || modelPath === `/${fileId}`
      }

      if (pendingJump) {
        let rafId = 0
        let attempts = 0
        const tryJump = () => {
          const monacoInstance = monacoRef.current
          if (!monacoInstance) {
            return
          }
          if (modelMatchesFile() || attempts >= 6) {
            consumedJumpNonceRef.current = pendingJump.nonce
            lastRestoredFileIdRef.current = fileId
            applyHighlightAndReveal(
              editorInstance,
              monacoInstance,
              pendingJump.line,
              pendingJump.column ?? 1,
            )
            return
          }
          attempts += 1
          rafId = window.requestAnimationFrame(tryJump)
        }

        if (modelMatchesFile()) {
          tryJump()
        } else {
          rafId = window.requestAnimationFrame(tryJump)
        }
        return () => {
          if (rafId) {
            window.cancelAnimationFrame(rafId)
          }
        }
      }

      if (lastRestoredFileIdRef.current === fileId) {
        return
      }

      const frame = window.requestAnimationFrame(() => {
        const state = viewStateRef.current
        if (state) {
          editorInstance.restoreViewState(state)
        }
        lastRestoredFileIdRef.current = fileId
        editorInstance.focus()

        const position = editorInstance.getPosition()
        if (position) {
          onCursorChange({
            line: position.lineNumber,
            column: position.column,
          })
        }
      })

      return () => window.cancelAnimationFrame(frame)
    }, [applyHighlightAndReveal, fileId, jumpTarget, onCursorChange])

    if (!fileId || !language) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-[var(--cc-editor-bg)] px-6 text-center">
          <p className="text-sm font-medium text-[var(--cc-text)]">No file open</p>
          <p className="max-w-sm text-xs leading-relaxed text-[var(--cc-text-muted)]">
            Open an in-memory example from the Explorer to start editing.
          </p>
        </div>
      )
    }

    return (
      <div className="min-h-0 flex-1 bg-[var(--cc-editor-bg)]">
        <Editor
          path={fileId}
          value={value}
          language={monacoLanguageFor(language)}
          theme={getMonacoThemeName(settings.theme)}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          onChange={(next) => onChange(next ?? '')}
          options={{
            ...BASE_EDITOR_OPTIONS,
            ...toMonacoEditorOptions(settings),
            ...toMonacoModelOptions(settings),
          }}
          loading={
            <div className="flex h-full items-center justify-center text-sm text-[var(--cc-text-muted)]">
              Loading editor…
            </div>
          }
        />
      </div>
    )
  },
)

export default EditorPane
