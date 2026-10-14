import type { ElectronAPI, SpeakNotificationParams, SystemStatus } from '@/types/electron';
import type { Recipe, MedicationReminder, DailyDigest, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CookingStep } from '@/types/electron';

/** Result of invoking a Sunny tool. `success: false` always carries `error`. */
export interface ToolResult<T = unknown> {
  timestamp: string;
  success: boolean;
  toolName: string;
  result?: T;
  error?: string;
}

/** One entry in the conversation / activity log. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

type SpeechPriority = NonNullable<SpeakNotificationParams['priority']>;

/** How long between automatic status refreshes. */
const DEFAULT_POLL_INTERVAL_MS = 30_000;

/** Bounds applied before a repeat count reaches the main process. */
const MIN_REPEAT = 1;
const MAX_REPEAT = 3;
const MAX_MESSAGE_CHARS = 500;
const SPEECH_PRIORITIES: readonly SpeechPriority[] = ['low', 'normal', 'high', 'urgent'];

/**
 * Client-side agent service.
 *
 * Every call goes through `window.electronAPI`, which only exists inside
 * Electron. Outside Electron (for example, running the renderer in a browser
 * during UI work) each method degrades gracefully instead of crashing.
 */
class SunnyBrain {
  private messageHistory: ChatMessage[] = [];
  private listeners = new Set<(messages: ChatMessage[]) => void>();
  private statusListeners = new Set<(status: SystemStatus) => void>();
  private statusInterval: number | null = null;

  // -------------------------------------------------------------------------
  // System status
  // -------------------------------------------------------------------------

  /** Fetch the machine's current health snapshot. */
  async getSystemStatus(): Promise<SystemStatus> {
    this.requireElectronAPI();
    return window.electronAPI.getSystemStatus();
  }

  /** Begin polling the main process for status changes. */
  startStatusPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void {
    if (this.statusInterval || !Number.isFinite(intervalMs) || intervalMs <= 0) return;

    const poll = async (): Promise<void> => {
      try {
        const status = await this.getSystemStatus();
        this.statusListeners.forEach((listener) => listener(status));
      } catch {
        // A failed poll is not fatal: keep the last known state and try again.
      }
    };

    poll();
    this.statusInterval = window.setInterval(poll, intervalMs);
  }

  /** Stop polling. Safe to call more than once. */
  stopStatusPolling(): void {
    if (this.statusInterval === null) return;
    window.clearInterval(this.statusInterval);
    this.statusInterval = null;
  }

  /** Subscribe to status changes. Returns an unsubscribe function. */
  onSystemStatusChange(callback: (status: SystemStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  // -------------------------------------------------------------------------
  // Spoken notifications
  // -------------------------------------------------------------------------

  /**
   * Speak a notification aloud.
   *
   * The payload is first validated by the main process (which also applies rate
   * limiting), then the renderer performs the actual speech via the platform
   * Web Speech API so the user's installed voices are used.
   *
   * @throws Error when the message is invalid, or the main process refuses the
   *         request (for example, because of rate limiting).
   */
  async speakNotification(
    message: string,
    priority: SpeechPriority = 'normal',
    repeat: number = 1
  ): Promise<void> {
    const cleanMessage = typeof message === 'string' ? message.trim() : '';
    if (!cleanMessage) throw new Error('Notification message must be a non-empty string.');
    if (cleanMessage.length > MAX_MESSAGE_CHARS) {
      throw new Error(`Notification message must be ${MAX_MESSAGE_CHARS} characters or fewer.`);
    }
    if (!SPEECH_PRIORITIES.includes(priority)) {
      throw new Error(`priority must be one of: ${SPEECH_PRIORITIES.join(', ')}`);
    }
    const clampedRepeat = Math.min(Math.max(Math.trunc(repeat) || 1, MIN_REPEAT), MAX_REPEAT);

    // Only validate/acknowledge through Electron when it is available.
    if (window.electronAPI) {
      await window.electronAPI.speakNotification({
        message: cleanMessage,
        priority,
        repeat: clampedRepeat,
      });
    }

    this.speakLocally(cleanMessage, clampedRepeat);
  }

  // -------------------------------------------------------------------------
  // Tool execution
  // -------------------------------------------------------------------------

  /**
   * Invoke a Sunny tool by name and capture the outcome.
   * Failures are returned as a rejected-shape result, never thrown, so callers
   * can display the problem without an unhandled rejection.
   */
  async invokeTool<T = unknown, P extends Record<string, unknown> = Record<string, unknown>>(
    toolName: string,
    params: P
  ): Promise<ToolResult<T>> {
    const stamp = new Date().toISOString();

    if (typeof toolName !== 'string' || toolName.trim() === '') {
      return {
        timestamp: stamp,
        success: false,
        toolName: String(toolName),
        error: 'toolName must be a non-empty string.',
      };
    }

    if (!window.electronAPI) {
      return {
        timestamp: stamp,
        success: false,
        toolName,
        error: 'Electron API is not available. Tool execution requires the Sunny desktop app.',
      };
    }

    try {
      const result = await window.electronAPI.executeTool(toolName, params as Record<string, unknown>);
      return {
        timestamp: new Date().toISOString(),
        success: true,
        toolName,
        result: result as T,
      };
    } catch (err) {
      return {
        timestamp: new Date().toISOString(),
        success: false,
        toolName,
        error: this.describeError(err),
      };
    }
  }

  // -------------------------------------------------------------------------
  // Recipe search
  // -------------------------------------------------------------------------

  /**
   * Search for recipes by query.
   * @param query - Food or recipe name to search for
   * @param maxResults - Maximum number of recipes to return (default 5, max 10)
   * @returns Array of recipes with ingredients and step-by-step instructions
   */
  async fetchVerifiedRecipe(query: string, maxResults: number = 5): Promise<{ recipes: Recipe[] }> {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available. Recipe search requires the Sunny desktop app.');
    }
    return window.electronAPI.searchRecipe({ query, maxResults });
  }

  // -------------------------------------------------------------------------
  // Daily digest
  // -------------------------------------------------------------------------

  /**
   * Get daily weather and news digest.
   * @param location - Optional location for weather (default: auto-detect)
   * @param newsCount - Number of news items to fetch (default 5, max 10)
   * @returns Daily digest with weather and news
   */
  async getDailyDigest(location?: string, newsCount: number = 5): Promise<DailyDigest> {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available. Daily digest requires the Sunny desktop app.');
    }
    return window.electronAPI.getDailyDigest({ location, newsCount });
  }

  // -------------------------------------------------------------------------
  // Medication reminders
  // -------------------------------------------------------------------------

  /**
   * Schedule a medication reminder.
   * @param pillName - Name of the medication
   * @param timeString - Time in HH:MM format (24-hour)
   * @returns Object with success status and reminder ID
   */
  async scheduleMedicationReminder(pillName: string, timeString: string): Promise<{ success: boolean; reminderId: string }> {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available. Medication reminders require the Sunny desktop app.');
    }
    return window.electronAPI.scheduleMedicationReminder({ pillName, timeString });
  }

  /**
   * Subscribe to medication reminder notifications.
   * @param callback - Called when a medication reminder is triggered
   * @returns Unsubscribe function
   */
  onMedicationReminder(callback: (reminder: MedicationReminder) => void): () => void {
    if (!window.electronAPI) {
      return () => {};
    }
    return window.electronAPI.onMedicationReminder(callback);
  }

  /**
   * Subscribe to medication reminder added events.
   * @param callback - Called when a new medication reminder is added
   * @returns Unsubscribe function
   */
  onMedicationReminderAdded(callback: (reminder: MedicationReminder) => void): () => void {
    if (!window.electronAPI) {
      return () => {};
    }
    return window.electronAPI.onMedicationReminderAdded(callback);
  }

  /**
   * Mark a medication as taken.
   * @param reminderId - ID of the reminder to mark as taken
   * @returns Success status
   */
  async markMedicationTaken(reminderId: string): Promise<{ success: boolean }> {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available.');
    }
    const result = await window.electronAPI.executeTool('medication_taken', { reminderId });
    return { success: (result as { success: boolean }).success };
  }

  /**
   * Get all medication reminders.
   * @returns Array of medication reminders
   */
  async getMedicationReminders(): Promise<MedicationReminder[]> {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available.');
    }
    const result = await window.electronAPI.executeTool('get_medication_reminders', {});
    return (result as { success: boolean; reminders: MedicationReminder[] }).reminders || [];
  }

  /**
   * Delete a medication reminder.
   * @param reminderId - ID of the reminder to delete
   * @returns Success status
   */
  async deleteMedicationReminder(reminderId: string): Promise<{ success: boolean }> {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available.');
    }
    const result = await window.electronAPI.executeTool('delete_medication_reminder', { reminderId });
    return { success: (result as { success: boolean }).success };
  }

  // -------------------------------------------------------------------------
  // Daily digest
  // -------------------------------------------------------------------------

  /**
   * Speak the daily digest aloud using TTS.
   * @param location - Optional location for weather
   * @param newsCount - Number of news items to include
   */
  async speakDailyDigest(location?: string, newsCount: number = 5): Promise<void> {
    if (!window.electronAPI) {
      throw new Error('Electron API is not available. Daily digest requires the Sunny desktop app.');
    }
    const digest = await this.getDailyDigest(location, newsCount);
    const weatherText = `Current weather in ${digest.weather.location}: ${digest.weather.temperature} degrees, ${digest.weather.condition}.`;
    const newsText = digest.news.length > 0
      ? `Top news: ${digest.news.slice(0, 3).map(n => n.title).join('. ')}.`
      : 'No news available at this time.';
    const fullText = `Good morning! ${weatherText} ${newsText}`;
    await this.speakNotification(fullText, 'normal', 1);
  }

  // -------------------------------------------------------------------------
  // Cooking mode
  // -------------------------------------------------------------------------

  /**
   * Subscribe to cooking step changes.
   * @param callback - Called when cooking step changes
   * @returns Unsubscribe function
   */
  onCookingStepChange(callback: (step: { stepIndex: number; totalSteps: number; instruction: string }) => void): () => void {
    if (!window.electronAPI) {
      return () => {};
    }
    return window.electronAPI.onCookingStepChange(callback);
  }

  // -------------------------------------------------------------------------
  // Conversation / activity log
  // -------------------------------------------------------------------------

  /** Append a message and notify subscribers. */
  addMessage(role: ChatMessage['role'], content: string): ChatMessage {
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('Message content must be a non-empty string.');
    }
    const message: ChatMessage = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      content,
      timestamp: new Date(),
    };
    this.messageHistory.push(message);
    this.notifyListeners();
    return message;
  }

  /** Copy of the log, newest last. */
  getMessages(): ChatMessage[] {
    return [...this.messageHistory];
  }

  /** Subscribe to log changes. Returns an unsubscribe function. */
  subscribe(listener: (messages: ChatMessage[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Clear the log. The welcome message is not re-added automatically. */
  clearMessages(): void {
    this.messageHistory = [];
    this.notifyListeners();
  }

  /** Release every listener and stop polling. */
  dispose(): void {
    this.stopStatusPolling();
    this.listeners.clear();
    this.statusListeners.clear();
    this.messageHistory = [];
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private requireElectronAPI(): ElectronAPI {
    if (!window.electronAPI) {
      throw new Error('Electron API is unavailable. Are you running inside the Sunny app?');
    }
    return window.electronAPI;
  }

  private speakLocally(message: string, repeat: number): void {
    if (!('speechSynthesis' in window) || !window.speechSynthesis) {
      throw new Error('Text-to-speech is unavailable in this environment.');
    }

    // Cancel any in-flight speech so repeat requests start cleanly.
    window.speechSynthesis.cancel();

    // A slower rate, normal pitch, and full volume suit older listeners.
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    for (let i = 0; i < repeat; i += 1) {
      window.speechSynthesis.speak(utterance);
    }
  }

  private notifyListeners(): void {
    const snapshot = this.getMessages();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private describeError(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string' && err) return err;
    return 'Unknown error during tool execution.';
  }
}

/** Shared singleton used by the UI. */
export const sunnyBrain = new SunnyBrain();

export { SunnyBrain };
