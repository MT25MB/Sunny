/**
 * Electron Preload Script (CommonJS)
 *
 * Runs in a privileged context (Node/Electron access) but is isolated from the
 * renderer by `contextIsolation: true`. Only the objects explicitly passed to
 * `contextBridge.exposeInMainWorld` are reachable from the renderer.
 *
 * Two surfaces are exposed:
 *   1. `electronAPI`  — the Sunny tool bridge used by sunnyBrain.ts
 *                        (getSystemStatus / speakNotification / executeTool /
 *                         invokeTool / event subscriptions / utility methods)
 *   2. `sunnyDesktop` — legacy desktop-automation surface (capture, actions,
 *                        credentials, debug logs) kept for existing callers.
 *
 * Security notes:
 *   - Every channel is namespaced with the `sunny:` prefix.
 *   - Nothing here interpolates renderer input into a command string; the main
 *     process is the only place that spawns processes, and it uses an allowlist.
 *   - Event listeners return unsubscribe functions so the renderer can clean up.
 */

const { contextBridge, ipcRenderer } = require('electron');

/** Names of every tool the main process will execute. Mirrors main.cjs. */
const SUNNY_TOOLS = ['get_system_status', 'speak_notification'];

/**
 * Build a listener on an IPC channel and return an unsubscribe function.
 * @param {string} channel
 * @param {(payload: unknown) => void} callback
 * @returns {() => void}
 */
function createListener(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const electronAPI = {
  // -------------------------------------------------------------------------
  // Tool execution
  // -------------------------------------------------------------------------

  /**
   * Execute a tool by name. `executeTool` is the canonical name; `invokeTool`
   * is the historical alias kept so older callers keep working.
   * @param {string} toolName
   * @param {Record<string, unknown>} params
   * @returns {Promise<unknown>}
   */
  executeTool: async (toolName, params) => {
    if (typeof toolName !== 'string' || toolName.trim() === '') {
      throw new Error('toolName must be a non-empty string.');
    }
    if (params !== undefined && (params === null || typeof params !== 'object' || Array.isArray(params))) {
      throw new Error('params must be an object.');
    }
    return ipcRenderer.invoke('sunny:execute-tool', toolName, params || {});
  },

  invokeTool: async (toolName, params) => {
    const api = electronAPI;
    return api.executeTool(toolName, params || {});
  },

  /** Current battery / Wi-Fi / CPU / memory snapshot. */
  getSystemStatus: async () => ipcRenderer.invoke('sunny:get-system-status'),

  // -------------------------------------------------------------------------
  // Spoken notifications
  // -------------------------------------------------------------------------

  /**
   * Ask the main process to validate and acknowledge a spoken notification.
   * @param {{ message: string, priority?: string, repeat?: number }} params
   * @returns {Promise<void>}
   */
  speakNotification: async (params) => {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      throw new Error('speakNotification requires an object with a message.');
    }
    if (typeof params.message !== 'string' || params.message.trim() === '') {
      throw new Error('Notification message must be a non-empty string.');
    }
    return ipcRenderer.invoke('sunny:speak-notification', params);
  },

  // -------------------------------------------------------------------------
  // Main-process -> renderer subscriptions
  // -------------------------------------------------------------------------

  onSystemStatusChange: (callback) => createListener('sunny:system-status-change', callback),

  onToolResult: (callback) =>
    createListener('sunny:tool-result', callback),

  onNotification: (callback) =>
    createListener('sunny:notification', callback),

  onModelProgress: (callback) => createListener('sunny:model-progress', callback),

  onWindowVisibilityChange: (callback) =>
    createListener('sunny:window-visibility-change', callback),

  onDebugLog: (callback) => createListener('sunny:debug-log', callback),

  // -------------------------------------------------------------------------
  // Utility methods
  // -------------------------------------------------------------------------

  getAvailableTools: async () => ipcRenderer.invoke('sunny:get-available-tools'),

  isToolAvailable: async (toolName) => {
    if (typeof toolName !== 'string') return false;
    return ipcRenderer.invoke('sunny:is-tool-available', toolName);
  },

  sanitizeContent: async (text) => {
    if (typeof text !== 'string') return '';
    return ipcRenderer.invoke('sunny:sanitize-content', text);
  },

  /** Synchronous list of tool names, for code that cannot await. */
  listTools: () => SUNNY_TOOLS.slice(),

  // -------------------------------------------------------------------------
  // Static metadata (resolved at preload time)
  // -------------------------------------------------------------------------

  platform: process.platform,
  appVersion: process.env.APP_VERSION || '0.0.0',
  isDev: !process.env.NODE_ENV || process.env.NODE_ENV === 'development',
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// ============================================================================
// Legacy desktop-automation surface (unchanged, kept for existing callers)
// ============================================================================

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

console.log('[Sunny Preload] electronAPI and sunnyDesktop exposed successfully');
