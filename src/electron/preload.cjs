const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sunnyDesktop', {
  captureScreen: () => ipcRenderer.invoke('sunny:capture-screen'),
  analyzeScreen: (payload) => ipcRenderer.invoke('sunny:analyze-screen', payload),
  decideAction: (payload) => ipcRenderer.invoke('sunny:decide-action', payload),
  executeActions: (actions) => ipcRenderer.invoke('sunny:execute-actions', actions),
  cancelActions: () => ipcRenderer.invoke('sunny:cancel-actions'),
  windowAction: (action) => ipcRenderer.invoke('sunny:window-action', action),
  getModelStatus: () => ipcRenderer.invoke('sunny:get-model-status'),
  initModel: () => ipcRenderer.invoke('sunny:init-model'),
  onModelProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('sunny:model-progress', handler);
    return () => ipcRenderer.removeListener('sunny:model-progress', handler);
  },
  writeDebugLog: (entry) => ipcRenderer.invoke('sunny:write-debug-log', entry),
  sanitizeContent: (text) => ipcRenderer.invoke('sunny:sanitize-content', text),
  clearDebugLogs: () => ipcRenderer.invoke('sunny:clear-debug-logs'),
  exportDebugLogs: () => ipcRenderer.invoke('sunny:export-debug-logs'),
  getDebugLogCount: () => ipcRenderer.invoke('sunny:get-debug-log-count'),
  saveCredential: (key, value) => ipcRenderer.invoke('sunny:save-credential', key, value),
  loadCredential: (key) => ipcRenderer.invoke('sunny:load-credential', key),
  deleteCredential: (key) => ipcRenderer.invoke('sunny:delete-credential', key),
});
