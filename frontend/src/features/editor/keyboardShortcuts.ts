export interface ShortcutReference {
  id: string
  action: string
  keys: {
    win: string
    mac: string
  }
  owner: 'ide' | 'monaco'
}

export const IDE_SHORTCUT_REFERENCE: ShortcutReference[] = [
  {
    id: 'save',
    action: 'Save session baseline',
    keys: { win: 'Ctrl+S', mac: '⌘S' },
    owner: 'ide',
  },
  {
    id: 'close-tab',
    action: 'Close active tab',
    keys: { win: 'Ctrl+Alt+W', mac: '⌘⌥W' },
    owner: 'ide',
  },
  {
    id: 'next-tab',
    action: 'Next editor tab',
    keys: { win: 'Ctrl+Alt+→', mac: '⌘⌥→' },
    owner: 'ide',
  },
  {
    id: 'prev-tab',
    action: 'Previous editor tab',
    keys: { win: 'Ctrl+Alt+←', mac: '⌘⌥←' },
    owner: 'ide',
  },
  {
    id: 'find',
    action: 'Find',
    keys: { win: 'Ctrl+F', mac: '⌘F' },
    owner: 'monaco',
  },
  {
    id: 'replace',
    action: 'Replace',
    keys: { win: 'Ctrl+H', mac: '⌘H' },
    owner: 'monaco',
  },
  {
    id: 'undo',
    action: 'Undo',
    keys: { win: 'Ctrl+Z', mac: '⌘Z' },
    owner: 'monaco',
  },
  {
    id: 'redo',
    action: 'Redo',
    keys: { win: 'Ctrl+Y', mac: '⌘Y' },
    owner: 'monaco',
  },
]

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

export function shortcutLabel(entry: ShortcutReference): string {
  return isApplePlatform() ? entry.keys.mac : entry.keys.win
}

export function shouldSuppressIdeShortcuts(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const dialog = target.closest('[role="dialog"]')
  if (dialog) {
    const label = dialog.getAttribute('aria-label') || ''
    // Settings / shortcuts help popovers own keyboard focus while open.
    if (label === 'Editor settings' || label === 'Keyboard shortcuts') {
      return true
    }
  }

  // Monaco uses a textarea; IDE shortcuts must still run when the editor is focused.
  if (target.closest('.monaco-editor')) {
    return false
  }

  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    return true
  }

  return target.isContentEditable
}
