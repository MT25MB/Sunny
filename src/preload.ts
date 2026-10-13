/**
 * Electron Preload Script (TypeScript)
 * 
 * This script runs in a privileged context (access to Node.js/Electron APIs)
 * but is isolated from the renderer via contextIsolation.
 * 
 * It uses contextBridge.exposeInMainWorld to safely expose a curated API
 * surface to the renderer process for:
 * - Invoking tool execution handlers (IPC invoke)
 * - Subscribing to main-process state updates (IPC on/off)
 * 
 * Security Notes:
 * - contextIsolation: true (enforced in main.cjs webPreferences)
 * - nodeIntegration: false
 * - sandbox: true
 * - Only explicitly exposed APIs are accessible to renderer
 * - All IPC channels are prefixed with 'sunny:' for namespacing
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { SunnyToolName, ToolParameters } from './types/tools';
import type { SystemStatus } from './types/electron';

// ============================================================================
// Type Definitions for Exposed API
// ============================================================================

/**
 * Shape of the electronAPI exposed to the renderer process.
 * 
 * Design principles:
 * - All methods return Promises (invoke) or cleanup functions (on/once)
 * - Tool execution uses the unified 'sunny:execute-tool' channel
 * - State updates use dedicated channels per event type
 * - Event listeners return unsubscribe functions for proper cleanup
 */
interface ElectronAPI {
  /** 
   * Execute a tool by name with parameters.
   * Uses a single unified IPC channel for all tool invocations.
   * 
   * @param toolName - Name of the tool to execute (validated against SunnyToolName)
   * @param params - Parameters matching the tool's schema
   * @returns Promise resolving to the tool's result payload
   * 
   * @example
   * const status = await electronAPI.invokeTool('get_system_status', {});
   * await electronAPI.invokeTool('speak_notification', { 
   *   message: 'Your medication is ready',
   *   priority: 'high'
   * });
   */
  invokeTool<T extends SunnyToolName>(
    toolName: T,
    params: ToolParameters<Extract<import('./types/tools').SunnyTool, { name: T }>>
  ): Promise<unknown>;

  /** 
   * Get current system status (battery, Wi-Fi, health).
   * Convenience wrapper for invokeTool('get_system_status', {}).
   */
  getSystemStatus(): Promise<SystemStatus>;

  /** 
   * Speak a notification via text-to-speech.
   * Convenience wrapper for invokeTool('speak_notification', params).
   */
  speakNotification(params: {
    message: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    repeat?: number;
  }): Promise<void>;

  // ---------------------------------------------------------------------------
  // State Update Listeners (Main Process â†’ Renderer)
  // ---------------------------------------------------------------------------

  /** 
   * Subscribe to system status changes (battery, connectivity, etc.).
   * Main process emits this periodically or on significant changes.
   * 
   * @param callback - Receives SystemStatus payload
   * @returns Unsubscribe function
   */
  onSystemStatusChange(callback: (status: SystemStatus) => void): () => void;

  /** 
   * Subscribe to tool execution results (for async tools with progress).
   * 
   * @param callback - Receives { toolName, result, error? }
   * @returns Unsubscribe function
   */
  onToolResult(callback: (payload: {
    toolName: string;
    result?: unknown;
    error?: string;
  }) => void): () => void;

  /** 
   * Subscribe to application-level notifications (alerts, reminders).
   * 
   * @param callback - Receives { title, message, priority }
   * @returns Unsubscribe function
   */
  onNotification(callback: (notification: {
    title: string;
    message: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
  }) => void): () => void;

  /** 
   * Subscribe to model loading/progress updates.
   * 
   * @param callback - Receives progress status string
   * @returns Unsubscribe function
   */
  onModelProgress(callback: (status: string) => void): () => void;

  /** 
   * Subscribe to window visibility changes.
   * 
   * @param callback - Receives { visible: boolean }
   * @returns Unsubscribe function
   */
  onWindowVisibilityChange(callback: (payload: { visible: boolean }) => void): () => void;

  /** 
   * Subscribe to debug log entries (for development).
   * 
   * @param callback - Receives log entry object
   * @returns Unsubscribe function
   */
  onDebugLog(callback: (entry: {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    timestamp: string;
    context?: Record<string, unknown>;
  }) => void): () => void;

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /** 
   * Get the list of available tool names.
   * Useful for dynamic UI rendering of available actions.
   */
  getAvailableTools(): Promise<SunnyToolName[]>;

  /** 
   * Check if a specific tool is available.
   */
  isToolAvailable(toolName: string): Promise<boolean>;

  /** 
   * Sanitize untrusted content for safe display.
   * Delegates to main process security interceptor.
   */
  sanitizeContent(text: string): Promise<string>;

  /** 
   * Platform information for conditional rendering.
   */
  platform: NodeJS.Platform;

  /** 
   * App version from package.json.
   */
  appVersion: string;

  /** 
   * Whether the app is running in development mode.
   */
  isDev: boolean;
}

// ============================================================================
// Helper: Typed IPC Event Wrapper
// ============================================================================

/**
 * Creates a type-safe event listener that auto-removes on unsubscribe.
 * 
 * @param channel - IPC channel name (must match main process)
 * @param callback - Handler receiving the payload
 * @returns Unsubscribe function
 */
function createListener<T>(
  channel: string,
  callback: (payload: T) => void
): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// ============================================================================
// API Implementation
// ============================================================================

const electronAPI: ElectronAPI = {
  // ---------------------------------------------------------------------------
  // Tool Invocation
  // ---------------------------------------------------------------------------

  invokeTool: async (toolName: SunnyToolName, params: Record<string, unknown>) => {
    // Validate tool name against known tools (additional safety)
    const validTools: SunnyToolName[] = ['get_system_status', 'speak_notification'];
    if (!validTools.includes(toolName)) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    return ipcRenderer.invoke('sunny:execute-tool', toolName, params);
  },

  getSystemStatus: async () => {
    return ipcRenderer.invoke('sunny:execute-tool', 'get_system_status', {});
  },

  speakNotification: async (params) => {
    return ipcRenderer.invoke('sunny:execute-tool', 'speak_notification', params);
  },

  // ---------------------------------------------------------------------------
  // State Update Listeners
  // ---------------------------------------------------------------------------

  onSystemStatusChange: (callback) => {
    return createListener<SystemStatus>('sunny:system-status-change', callback);
  },

  onToolResult: (callback) => {
    return createListener<{
      toolName: string;
      result?: unknown;
      error?: string;
    }>('sunny:tool-result', callback);
  },

  onNotification: (callback) => {
    return createListener<{
      title: string;
      message: string;
      priority: 'low' | 'normal' | 'high' | 'urgent';
    }>('sunny:notification', callback);
  },

  onModelProgress: (callback) => {
    return createListener<string>('sunny:model-progress', callback);
  },

  onWindowVisibilityChange: (callback: (payload: { visible: boolean }) => void) => {
    return createListener<{ visible: boolean }>('sunny:window-visibility-change', callback);
  },

  onDebugLog: (callback) => {
    return createListener<{
      level: 'info' | 'warn' | 'error' | 'debug';
      message: string;
      timestamp: string;
      context?: Record<string, unknown>;
    }>('sunny:debug-log', callback);
  },

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  getAvailableTools: async () => {
    return ipcRenderer.invoke('sunny:get-available-tools');
  },

  isToolAvailable: async (toolName: string) => {
    return ipcRenderer.invoke('sunny:is-tool-available', toolName);
  },

  sanitizeContent: async (text: string) => {
    return ipcRenderer.invoke('sunny:sanitize-content', text);
  },

  // ---------------------------------------------------------------------------
  // Static Properties (evaluated at preload time)
  // ---------------------------------------------------------------------------

  platform: process.platform,
  appVersion: process.env.APP_VERSION || '0.0.0',
  isDev: !process.env.NODE_ENV || process.env.NODE_ENV === 'development',
};

// ============================================================================
// Expose to Renderer
// ============================================================================

/**
 * Expose the electronAPI on the global window object.
 * 
 * In the renderer (React), access via:
 *   window.electronAPI.invokeTool(...)
 *   window.electronAPI.onSystemStatusChange(...)
 * 
 * TypeScript declaration should be added to a .d.ts file or vite-env.d.ts:
 *   interface Window { electronAPI: ElectronAPI; }
 */
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Also expose for compatibility with existing code using 'sunnyDesktop'
contextBridge.exposeInMainWorld('sunnyDesktop', {
  // Legacy aliases - map to new unified tool execution
  captureScreen: () => ipcRenderer.invoke('sunny:capture-screen'),
  analyzeScreen: (payload: { prompt: string; image: string }) =>
    ipcRenderer.invoke('sunny:analyze-screen', payload),
  decideAction: (payload: { prompt: string }) =>
    ipcRenderer.invoke('sunny:decide-action', payload),
  executeActions: (actions: unknown[]) =>
    ipcRenderer.invoke('sunny:execute-actions', actions),
  cancelActions: () => ipcRenderer.invoke('sunny:cancel-actions'),
  windowAction: (action: string) => ipcRenderer.invoke('sunny:window-action', action),
  getModelStatus: () => ipcRenderer.invoke('sunny:get-model-status'),
  initModel: () => ipcRenderer.invoke('sunny:init-model'),
  onModelProgress: (callback: (data: string) => void) =>
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




