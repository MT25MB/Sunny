/**
 * Type contract for the Sunny IPC bridge.
 *
 * This file is the single source of truth for `window.electronAPI`. The main
 * process (`src/electron/main.cjs`) registers the handlers; the preload script
 * (`src/electron/preload.cjs`) exposes them on the global `window` object; and
 * the renderer (`src/renderer/services/sunnyBrain.ts`) consumes them.
 *
 * Both `executeTool` and `invokeTool` are exposed and behave identically -
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

  /**
   * Simple summary accessors.
   *
   * These mirror the detail blocks below in a flat, easy-to-read form, so a
   * caller that only needs "what's the battery and are we online" can write
   * `status.batteryLevel` and `status.isOnline` instead of reaching into the
   * nested objects.
   *
   * Note: a flat `battery: number` field is impossible here because `battery`
   * below is the structured `BatteryInfo`. Use `batteryLevel` for the plain
   * percentage, or `battery.batteryPercent` - they are the same value.
   */
  /** Battery percentage 0–100, or `null` when the machine has no battery. */
  batteryLevel: number | null;
  /** True when the internet has been verified reachable. */
  isOnline: boolean;

  /** Structured battery detail. `batteryPercent` equals `batteryLevel`. */
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
export type SunnyToolName = 'get_system_status' | 'speak_notification' | 'search_recipe' | 'get_daily_digest' | 'schedule_medication_reminder' | 'emit_cooking_step';

/** Recipe data structure */
export interface Recipe {
  id: string;
  title: string;
  imageUrl?: string;
  ingredients: string[];
  instructions: string[];
  servings: number;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  sourceUrl?: string;
}

/** Medication reminder data */
export interface MedicationReminder {
  id: string;
  pillName: string;
  timeString: string; // HH:MM format
  enabled: boolean;
  lastTaken?: string; // ISO timestamp
  triggeredAt?: string; // ISO timestamp when reminder was triggered
}

/** Daily digest data */
export interface DailyDigest {
  weather: {
    temperature: number;
    condition: string;
    location: string;
  };
  news: Array<{
    title: string;
    summary: string;
    url: string;
  }>;
  date: string;
}

/** Cooking step data */
export interface CookingStep {
  stepIndex: number;
  totalSteps: number;
  instruction: string;
}

/** Medication reminder parameters */
export interface ScheduleMedicationParams {
  pillName: string;
  timeString: string; // HH:MM format
}

/** Recipe search parameters */
export interface SearchRecipeParams {
  query: string;
  maxResults?: number;
}

/** Daily digest parameters */
export interface DailyDigestParams {
  location?: string;
  newsCount?: number;
}

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
   *
   * Both call forms are supported:
   *   `speakNotification('Dinner is ready')`
   *   `speakNotification({ message: 'Dinner is ready', priority: 'high' })`
   */
  speakNotification(message: string): Promise<void>;
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

  /** Synchronous tool-name list for code that cannot await. */
  listTools(): string[];

  /** Search for recipes by query */
  searchRecipe(params: SearchRecipeParams): Promise<{ recipes: Recipe[] }>;

  /** Get daily weather and news digest */
  getDailyDigest(params?: DailyDigestParams): Promise<DailyDigest>;

  /** Schedule a medication reminder */
  scheduleMedicationReminder(params: ScheduleMedicationParams): Promise<{ success: boolean; reminderId: string }>;

  /** Mark a medication reminder as taken */
  markMedicationTaken(params: { reminderId: string }): Promise<{ success: boolean }>;

  /** Get all medication reminders */
  getMedicationReminders(): Promise<MedicationReminder[]>;

  /** Delete a medication reminder */
  deleteMedicationReminder(params: { reminderId: string }): Promise<{ success: boolean }>;

  /** Subscribe to medication reminder notifications */
  onMedicationReminder(callback: (reminder: MedicationReminder) => void): Unsubscribe;

  /** Subscribe to medication reminder added events */
  onMedicationReminderAdded(callback: (reminder: MedicationReminder) => void): Unsubscribe;

  /** Subscribe to cooking mode step changes */
  onCookingStepChange(callback: (step: { stepIndex: number; totalSteps: number; instruction: string }) => void): Unsubscribe;

  // -------------------------------------------------------------------------
  // Auto-updater
  // -------------------------------------------------------------------------

  /** Check for updates manually (from Settings). Returns update info if available. */
  checkForUpdates(): Promise<{ success: boolean; updateInfo?: unknown; error?: string }>;

  /**
   * Start downloading an announced update.
   * Downloads are opt-in: autoDownload is off so a compromised release
   * channel cannot install a binary without the user being asked.
   */
  downloadUpdate(): Promise<{ success: boolean; error?: string }>;

  /** Whether the app checks for updates automatically. Defaults to true. */
  getAutoCheckUpdates(): Promise<boolean>;

  /** Persist the "check for updates automatically" preference. */
  setAutoCheckUpdates(enabled: boolean): Promise<boolean>;

  /**
   * Push the renderer's preference patch into the main process, which is the
   * only place that can act on them. Unknown keys and bad values are ignored.
   */
  setPreferences(patch: Record<string, unknown>): Promise<Record<string, unknown>>;

  // Voice input
  // -------------------------------------------------------------------------

  /** Whether local speech-to-text is usable, and its load state. */
  getSpeechStatus(): Promise<{
    available: boolean;
    modelLoaded: boolean;
    model: string;
    error: string;
  }>;

  /**
   * Transcribe 16 kHz mono PCM locally. Resolves `silent: true` rather than
   * inventing text when the recording contained nothing.
   */
  transcribe(samples: Float32Array): Promise<{ text: string; silent: boolean }>;

  /** Quit the app and install the downloaded update. */
  quitAndInstall(): Promise<{ success: boolean }>;

  /** Subscribe to update-available event. */
  onUpdateAvailable(callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void): Unsubscribe;

  /** Subscribe to update-downloaded event. */
  onUpdateDownloaded(callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void): Unsubscribe;

  /** Subscribe to update-error event. */
  onUpdateError(callback: (message: string) => void): Unsubscribe;

  /** Host platform: 'win32' | 'darwin' | 'linux' | ... */
  readonly platform: NodeJS.Platform;

  /** Application version from package.json. */
  readonly appVersion: string;

  /** Whether the app is running from a development server. */
  readonly isDev: boolean;
}

/**
 * Window chrome controls. The window is frameless (`frame: false`), so the
 * renderer draws the title bar and routes clicks through these.
 */
/**
 * The window's current geometry, in device-independent pixels.
 */
export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The size preset currently in effect. */
  preset: WindowSizePreset;
  /** True when the window is filling the screen. */
  filled: boolean;
}

/** Preset window sizes. Each scales to the current display's work area. */
export type WindowSizePreset = 'compact' | 'comfortable' | 'large';

export interface WindowControls {
  /** Hide the window to the system tray. */
  minimizeToTray(): Promise<boolean>;
  /** Toggle visibility. Resolves to the new visible state. */
  toggleWindow(): Promise<boolean>;
  /** Fully quit the app (bypasses close-to-tray). */
  quitApp(): Promise<boolean>;
  /** Pin the window above all others. */
  setAlwaysOnTop(value: boolean): Promise<boolean>;
  /** Current always-on-top state. */
  getAlwaysOnTop(): Promise<boolean>;
  /** Subscribe to always-on-top changes made from the tray menu. */
  onAlwaysOnTopChanged(callback: (value: boolean) => void): () => void;

  /**
   * The window is not edge-resizable. Its size is picked from the presets
   * below, each of which scales to the usable area of the display the
   * window is on, so the same choice works on an old panel and a large
   * monitor alike.
   */
  getWindowState(): Promise<WindowState | null>;
  setWindowPreset(preset: WindowSizePreset): Promise<WindowState | null>;
  /** Move the window back to the bottom-right corner of its display. */
  resetWindowPosition(): Promise<{ x: number; y: number } | null>;

  /** Toggle between filling the screen and the current preset size. */
  toggleWindowFilled(): Promise<boolean>;
  isWindowFilled(): Promise<boolean>;
  /** Subscribe to the window filling or leaving the screen. */
  onWindowFilledChanged(callback: (filled: boolean) => void): () => void;
}

declare global {
  interface Window {
    /** Sunny's IPC bridge. Present when running inside Electron. */
    electronAPI: ElectronAPI;
    /** Window chrome controls. Present when running inside Electron. */
    windowControls?: WindowControls;
  }
}

export {};