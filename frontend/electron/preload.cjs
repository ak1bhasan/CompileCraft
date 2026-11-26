const { contextBridge, ipcRenderer } = require('electron')

/**
 * Restricted IPC bridge exposed to the renderer process.
 * Zero Node.js or filesystem APIs cross this boundary.
 */
contextBridge.exposeInMainWorld('compilecraft', {
  compile: (request) => ipcRenderer.invoke('compilecraft:compile', request),
  checkCompiler: () => ipcRenderer.invoke('compilecraft:health'),
  getPlatformInfo: () => ({
    runtime: 'electron',
    platform: process.platform,
  }),
})
