import { useEffect, useRef } from 'react'
import { shouldSuppressIdeShortcuts } from './keyboardShortcuts'

export interface IdeKeyboardShortcutHandlers {
  onRun: () => void
  onSave: () => void
  onCloseActiveTab: () => void
  onNextTab: () => void
  onPreviousTab: () => void
}

interface UseIdeKeyboardShortcutsOptions {
  enabled: boolean
  handlers: IdeKeyboardShortcutHandlers
}

function isModKey(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey
}

/**
 * Document-level IDE shortcuts. Monaco Find/Replace/Undo/Redo are left to Monaco.
 * Skip while a modal is open or while focusing non-editor form controls.
 */
export function useIdeKeyboardShortcuts({
  enabled,
  handlers,
}: UseIdeKeyboardShortcutsOptions): void {
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) {
        return
      }

      if (shouldSuppressIdeShortcuts(event.target)) {
        return
      }

      const { onRun, onSave, onCloseActiveTab, onNextTab, onPreviousTab } =
        handlersRef.current

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

      // Ctrl/Cmd + Enter → compile active editor buffer (intercept before Monaco's insertLineAfter)
      if (isModKey(event) && !event.altKey && !event.shiftKey && key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        onRun()
        return
      }

      // Ctrl/Cmd + S → session save
      if (isModKey(event) && !event.altKey && !event.shiftKey && key === 's') {
        event.preventDefault()
        event.stopPropagation()
        onSave()
        return
      }

      // Ctrl/Cmd + Alt + W → close active tab (avoid Ctrl+W browser close)
      if (isModKey(event) && event.altKey && !event.shiftKey && key === 'w') {
        event.preventDefault()
        event.stopPropagation()
        onCloseActiveTab()
        return
      }

      // Ctrl/Cmd + Alt + Arrow → cycle tabs
      if (isModKey(event) && event.altKey && !event.shiftKey) {
        if (key === 'ArrowRight') {
          event.preventDefault()
          event.stopPropagation()
          onNextTab()
          return
        }
        if (key === 'ArrowLeft') {
          event.preventDefault()
          event.stopPropagation()
          onPreviousTab()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled])
}
