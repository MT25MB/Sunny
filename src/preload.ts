/**
 * Electron Preload Script (TypeScript)
 *
 * Runs in a privileged context (Node/Electron access) but is isolated from the
 * renderer by `contextIsolation: true` in `src/electron/main.cjs`.
 *
 * This file mirrors the hand-written CommonJS preload at
 * `src/electron/preload.cjs`, which is the file the Electron entry point
 * actually loads. Keep both in step: this one is type-checked and documents the
 * contract, the `.cjs` one is what ships.
 *
 * It exposes two surfaces on `window`:
 *   1. `electronAPI`  — the Sunny tool bridge consumed by sunnyBrain.ts.
 *   2. `sunnyDesktop` — the legacy desktop-automation surface.
 *
 * Security notes:
 *   - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
 *   - Only the objects passed to `contextBridge.exposeInMainWorld` are reachable
 *     from the renderer.
 *   - Every channel is namespaced with the `sunny:` prefix.
 *   - Nothing here interpolates renderer input into a command string; the main
 *     process owns all process spawning and uses a fixed allowlist.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  ElectronAPI,
  SpeakNotificationParams,
  SystemStatus,
} from './types/electron';

// ============================================================================
// Typed IPC event helper
// ============================================================================

/**
 * Subscribe to a channel and return an unsubscribe function.
 * @param channel - channel name, must match the main process
 * @param callback - receives the payload
 */
function createListener<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// ============================================================================
// electronAPI implementation
// ============================================================================

const electronAPI: ElectronAPI = {
  // -------------------------------------------------------------------------
  // Tool execution
  // -------------------------------------------------------------------------

  /** Execute a tool by name (canonical form). */
  executeTool: async (toolName, params) => {
    if (typeof toolName !== 'string' || toolName.trim() === '') {
      throw new Error('toolName must be a non-empty string.');
    }
    if (
      params !== undefined &&
      (params === null || typeof params !== 'object' || Array.isArray(params))
    ) {
      throw new Error('params must be an object.');
    }
    return ipcRenderer.invoke('sunny:execute-tool', toolName, params || {});
  },

  /** Alias of `executeTool`, kept for existing callers. */
  invokeTool: async (toolName, params) => {
    return ipcRenderer.invoke('sunny:execute-tool', toolName, params || {});
  },

  /** Current battery / Wi-Fi / CPU / memory snapshot. */
  getSystemStatus: async () => {
    return ipcRenderer.invoke('sunny:get-system-status') as Promise<SystemStatus>;
  },

  // -------------------------------------------------------------------------
  // Spoken notifications
  // -------------------------------------------------------------------------

  /**
   * Validate and acknowledge a spoken notification. The renderer performs the
   * actual speech so the platform text-to-speech voices are used.
   *
   * Accepts either a bare message string or a full parameter object.
   */
  speakNotification: async (input: string | SpeakNotificationParams) => {
    const params: SpeakNotificationParams = typeof input === 'string' ? { message: input } : input;

    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      throw new Error('speakNotification requires a message string or an object with a message.');
    }
    if (typeof params.message !== 'string' || params.message.trim() === '') {
      throw new Error('Notification message must be a non-empty string.');
    }
    return ipcRenderer.invoke('sunny:speak-notification', params) as Promise<void>;
  },

  // -------------------------------------------------------------------------
  // Main process -> renderer subscriptions
  // -------------------------------------------------------------------------

  onSystemStatusChange: (callback) => createListener<SystemStatus>('sunny:system-status-change', callback),

  onWindowVisibilityChange: (callback) => createListener<{ visible: boolean }>('sunny:window-visibility-change', callback),

  onModelProgress: (callback) =>
    createListener<{ status: string; progress: number; message: string }>('sunny:model-progress', callback),

  // -------------------------------------------------------------------------
  // Utility methods
  // -------------------------------------------------------------------------

  getAvailableTools: async () => {
    return ipcRenderer.invoke('sunny:get-available-tools') as Promise<string[]>;
  },

  isToolAvailable: async (toolName: string) => {
    if (typeof toolName !== 'string') return false;
    return ipcRenderer.invoke('sunny:is-tool-available', toolName) as Promise<boolean>;
  },

  sanitizeContent: async (text: string) => {
    if (typeof text !== 'string') return '';
    return ipcRenderer.invoke('sunny:sanitize-content', text) as Promise<string>;
  },

  listTools: () => ['get_system_status', 'speak_notification'],

  // -------------------------------------------------------------------------
  // Static metadata (resolved at preload time)
  // -------------------------------------------------------------------------

  platform: process.platform,
  appVersion: process.env.APP_VERSION || '0.0.0',
  isDev: !process.env.NODE_ENV || process.env.NODE_ENV === 'development',
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// ============================================================================
// Legacy desktop-automation surface (kept for existing callers)
// ============================================================================

contextBridge.exposeInMainWorld('sunnyDesktop', {
  captureScreen: () => ipcRenderer.invoke('sunny:capture-screen'),

  analyzeScreen: (payload: { prompt: string; image: string }) =>
    ipcRenderer.invoke('sunny:analyze-screen', payload),

  decideAction: (payload: { prompt: string }) => ipcRenderer.invoke('sunny:decide-action', payload),

  executeActions: (actions: unknown[]) => ipcRenderer.invoke('sunny:execute-actions', actions),

  cancelActions: () => ipcRenderer.invoke('sunny:cancel-actions'),

  windowAction: (action: 'hide' | 'show' | 'close') => ipcRenderer.invoke('sunny:window-action', action),

  getModelStatus: () => ipcRenderer.invoke('sunny:get-model-status'),

  initModel: () => ipcRenderer.invoke('sunny:init-model'),

  onModelProgress: (callback: (data: unknown) => void) =>
    createListener('sunny:model-progress', callback),

  writeDebugLog: (entry: unknown) => ipcRenderer.invoke('sunny:write-debug-log', entry),

  sanitizeContent: (text: string) => ipcRenderer.invoke('sunny:sanitize-content', text),

  clearDebugLogs: () => ipcRenderer.invoke('sunny:clear-debug-logs'),

  exportDebugLogs: () => ipcRenderer.invoke('sunny:export-debug-logs'),

  getDebugLogCount: () => ipcRenderer.invoke('sunny:get-debug-log-count'),

  saveCredential: (key: string, value: string) =>
    ipcRenderer.invoke('sunny:save-credential', key, value),

  loadCredential: (key: string) => ipcRenderer.invoke('sunny:load-credential', key),

  deleteCredential: (key: string) => ipcRenderer.invoke('sunny:delete-credential', key),
});

console.log('[Sunny Preload] electronAPI and sunnyDesktop exposed successfully');
