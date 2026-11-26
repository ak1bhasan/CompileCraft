const { contextBridge, ipcRenderer } = require('electron')

/**
 * Restricted IPC bridge exposed to the renderer process.
 * Zero Node.js or filesystem APIs cross this boundary.
 */
contextBridge.exposeInMainWorld('compilecraft', {
  compile: (request) => ipcRenderer.invoke('compilecraft:compile', request),
  startRun: (request) => ipcRenderer.invoke('compilecraft:start-run', request),
  sendInput: (runId, input) =>
    ipcRenderer.invoke('compilecraft:send-input', { runId, input }),
  sendEof: (runId) => ipcRenderer.invoke('compilecraft:send-eof', runId),
  stopExecution: (runId) => ipcRenderer.invoke('compilecraft:stop', runId),
  onExecutionEvent: (listener) => {
    if (typeof listener !== 'function') {
      return () => {}
    }
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on('compilecraft:exec-event', handler)
    return () => {
      ipcRenderer.removeListener('compilecraft:exec-event', handler)
    }
  },
  checkCompiler: () => ipcRenderer.invoke('compilecraft:health'),
  getPlatformInfo: () => ({
    runtime: 'electron',
    platform: process.platform,
  }),
})
