import type { editor } from 'monaco-editor'
import type { EditorSettings } from '../../types/ide'

export function toMonacoEditorOptions(
  settings: EditorSettings,
): editor.IEditorOptions & editor.IGlobalEditorOptions {
  return {
    fontSize: settings.fontSize,
    lineHeight: Math.round(settings.fontSize * 1.55),
    wordWrap: settings.wordWrap,
    minimap: { enabled: settings.minimap },
    lineNumbers: settings.lineNumbers,
  }
}

export function toMonacoModelOptions(
  settings: EditorSettings,
): editor.ITextModelUpdateOptions {
  return {
    tabSize: settings.tabSize,
    insertSpaces: true,
  }
}

export function applyEditorSettings(
  editorInstance: editor.IStandaloneCodeEditor,
  settings: EditorSettings,
): void {
  editorInstance.updateOptions(toMonacoEditorOptions(settings))
  editorInstance.getModel()?.updateOptions(toMonacoModelOptions(settings))
}
