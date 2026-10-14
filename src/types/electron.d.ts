/**
 * Type contract for the Sunny IPC bridge.
 *
 * This file is the single source of truth for `window.electronAPI`. The main
 * process (`src/electron/main.cjs`) registers the handlers; the preload script
 * (`src/electron/preload.cjs`) exposes them on the global `window` object; and
 * the renderer (`src/renderer/services/sunnyBrain.ts`) consumes them.
 *
 * Both `executeTool` and `invokeTool` are exposed and behave identically —
 * `executeTool` is canonical, `invokeTool` is retained so older callers keep
 * working.
 */

/** Battery state. `batteryPercent` is `null` on desktops with no battery. */
export interface BatteryInfo {
  batteryPercent: number | null;
  isCharging: boolean;
  health: 'good' | 'low' | 'error' | 'unknown';
}

/** Wi-Fi / local network state. */
export interface WifiInfo {
  connected: boolean;
  networkName: string | null;
  signalStrength: number | null;
}

/** Host machine resource state. */
export interface SystemInfo {
  cpuUsage: number;
  memoryAvailableGB: number;
  uptime: number;
  platform: string;
  nodeVersion: string;
}

/** Internet reachability, verified by a real round-trip. */
export interface InternetInfo {
  reachable: boolean;
  testServer: string;
  latency: string;
}

/** Plain-language advice derived from the raw status. */
export interface SystemRecommendations {
  recommendations: string[];
  userFriendlyMessage: string;
}

/** Snapshot of the machine's health, as served to the renderer. */
export interface SystemStatus extends SystemRecommendations {
  timestamp: string;
  success: boolean;
  toolName: string;
  battery: BatteryInfo;
  wifi: WifiInfo;
  system: SystemInfo;
  internet: InternetInfo;
  error?: string;
  /** Alternative copy of the above, kept when a probe partially failed. */
  fallback?: {
    battery: BatteryInfo;
    wifi: WifiInfo;
    system: SystemInfo;
    internet: InternetInfo;
    recommendations: string[];
    userFriendlyMessage: string;
  };
}

/** Parameters accepted by `speakNotification`. */
export interface SpeakNotificationParams {
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  repeat?: number;
}

/** A subscription cleanup function returned by every listener. */
export type Unsubscribe = () => void;

/** Names of the tools the main process is willing to run. */
export type SunnyToolName = 'get_system_status' | 'speak_notification';

/**
 * The IPC surface exposed to the renderer via the preload script.
 */
export interface ElectronAPI {
  /**
   * Read the machine's current health snapshot.
   * Battery is a percentage (`null` on desktops); the Wi-Fi, CPU and memory
   * fields are always populated.
   */
  getSystemStatus(): Promise<SystemStatus>;

  /**
   * Validate and acknowledge a spoken notification. The renderer performs the
   * actual speech so the platform voices are used.
   */
  speakNotification(params: SpeakNotificationParams): Promise<void>;

  /**
   * Execute a Sunny tool by name (canonical form).
   */
  executeTool(toolName: SunnyToolName | string, params: Record<string, unknown>): Promise<unknown>;

  /**
   * Execute a Sunny tool by name (alias of `executeTool`, kept for
   * backwards compatibility with existing callers).
   */
  invokeTool(toolName: SunnyToolName | string, params: Record<string, unknown>): Promise<unknown>;

  /** Subscribe to periodic or significant status changes. */
  onSystemStatusChange(callback: (status: SystemStatus) => void): Unsubscribe;

  /** Subscribe to window show/hide transitions. */
  onWindowVisibilityChange(callback: (payload: { visible: boolean }) => void): Unsubscribe;

  /** Subscribe to model download / load progress. */
  onModelProgress(callback: (status: { status: string; progress: number; message: string }) => void): Unsubscribe;

  /** Names of every tool the main process will execute. */
  getAvailableTools(): Promise<string[]>;

  /** Whether a specific tool is available. */
  isToolAvailable(toolName: string): Promise<boolean>;

  /** Strip instruction-like content out of untrusted text before display. */
  sanitizeContent(text: string): Promise<string>;

  /** Synchronous tool-name list for code that cannot await. */
  listTools(): string[];

  /** Host platform: 'win32' | 'darwin' | 'linux' | ... */
  readonly platform: NodeJS.Platform;

  /** Application version from package.json. */
  readonly appVersion: string;

  /** Whether the app is running from a development server. */
  readonly isDev: boolean;
}

declare global {
  interface Window {
    /** Sunny's IPC bridge. Present when running inside Electron. */
    electronAPI: ElectronAPI;
  }
}

export {};
