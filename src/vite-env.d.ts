/// <reference types="vite/client" />

import type { SunnyToolName, ToolParameters, SunnyTool } from './types/tools';
import type { SystemStatus as SystemStatusType } from './types/electron';

type SunnySpeechResult = {
  [index: number]: { transcript: string };
};

type SunnySpeechEvent = Event & {
  results: { [index: number]: SunnySpeechResult };
};

export type SunnySpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SunnySpeechEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SunnySpeechRecognitionConstructor = new () => SunnySpeechRecognition;

export type ModelStatus = {
  status: 'not-downloaded' | 'downloading' | 'loading' | 'ready' | 'error';
  progress: number;
  message: string;
};

// ============================================================================
// New electronAPI Type Definitions
// ============================================================================

/** Tool result payload for onToolResult listener */
export interface ToolResultPayload {
  toolName: string;
  result?: unknown;
  error?: string;
}

/** Application notification payload */
export interface NotificationPayload {
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

/** Debug log entry payload */
export interface DebugLogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

/** Window visibility change payload */
export interface WindowVisibilityPayload {
  visible: boolean;
}

/** Main electronAPI interface exposed to renderer */
export interface ElectronAPI {
  /** Execute a tool by name with parameters */
  invokeTool<T extends SunnyToolName>(
    toolName: T,
    params: ToolParameters<Extract<SunnyTool, { name: T }>>
  ): Promise<unknown>;

  /** Get current system status (battery, Wi-Fi, health) */
  getSystemStatus(): Promise<SystemStatusType>;

  /** Speak a notification via text-to-speech */
  speakNotification(params: {
    message: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    repeat?: number;
  }): Promise<void>;

  // State Update Listeners (return unsubscribe functions)
  onSystemStatusChange(callback: (status: SystemStatusType) => void): () => void;
  onToolResult(callback: (payload: ToolResultPayload) => void): () => void;
  onNotification(callback: (notification: NotificationPayload) => void): () => void;
  onModelProgress(callback: (status: string) => void): () => void;
  onWindowVisibilityChange(callback: (payload: WindowVisibilityPayload) => void): () => void;
  onDebugLog(callback: (entry: DebugLogEntry) => void): () => void;

  // Utility Methods
  getAvailableTools(): Promise<SunnyToolName[]>;
  isToolAvailable(toolName: string): Promise<boolean>;
  sanitizeContent(text: string): Promise<string>;

  // Static Properties
  platform: NodeJS.Platform;
  appVersion: string;
  isDev: boolean;
}

// ============================================================================
// Legacy sunnyDesktop Type (for backward compatibility)
// ============================================================================

type SunnyDesktop = {
  captureScreen: () => Promise<{ dataUrl: string; width: number; height: number }>;
  analyzeScreen: (payload: { prompt: string; image: string }) => Promise<{ response: string }>;
  decideAction: (payload: { prompt: string }) => Promise<{ response: string }>;
  executeActions: (actions: unknown[]) => Promise<{ completed: number; cancelled: boolean }>;
  cancelActions: () => Promise<{ cancelled: boolean }>;
  windowAction: (action: 'hide' | 'show' | 'close') => Promise<void>;
  getModelStatus: () => Promise<ModelStatus>;
  initModel: () => Promise<ModelStatus>;
  onModelProgress: (callback: (status: ModelStatus) => void) => () => void;
  writeDebugLog: (entry: unknown) => Promise<{ success: boolean }>;
  sanitizeContent: (text: string) => Promise<string>;
  clearDebugLogs: () => Promise<{ success: boolean }>;
  exportDebugLogs: () => Promise<{ content: string }>;
  getDebugLogCount: () => Promise<{ count: number }>;
  saveCredential: (key: string, value: string) => Promise<{ success: boolean }>;
  loadCredential: (key: string) => Promise<{ value: string }>;
  deleteCredential: (key: string) => Promise<{ success: boolean }>;
};

declare global {
  interface Window {
    SpeechRecognition?: SunnySpeechRecognitionConstructor;
    webkitSpeechRecognition?: SunnySpeechRecognitionConstructor;
    sunnyDesktop?: SunnyDesktop;
    electronAPI?: ElectronAPI;
  }
}

export {};
