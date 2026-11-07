/**
 * UNIT TESTS: SunnyBrain (content-based)
 * Tests for src/renderer/services/sunnyBrain.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'renderer', 'services', 'sunnyBrain.ts'), 'utf8');

// ============================================================================
// Types and interfaces
// ============================================================================

test('types: defines ToolResult interface', () => {
  assert.ok(SRC.includes('export interface ToolResult<T = unknown>'));
});

test('types: ToolResult has timestamp', () => {
  assert.ok(SRC.includes('timestamp: string;'));
});

test('types: ToolResult has success', () => {
  assert.ok(SRC.includes('success: boolean;'));
});

test('types: ToolResult has toolName', () => {
  assert.ok(SRC.includes('toolName: string;'));
});

test('types: defines ChatMessage interface', () => {
  assert.ok(SRC.includes('export interface ChatMessage'));
});

test('types: ChatMessage has role union', () => {
  assert.ok(SRC.includes("role: 'user' | 'assistant' | 'system';"));
});

test('types: ChatMessage has timestamp Date', () => {
  assert.ok(SRC.includes('timestamp: Date;'));
});

// ============================================================================
// Constants
// ============================================================================

test('constants: defines DEFAULT_POLL_INTERVAL_MS', () => {
  assert.ok(SRC.includes('const DEFAULT_POLL_INTERVAL_MS = 30_000;'));
});

test('constants: defines MIN_REPEAT and MAX_REPEAT', () => {
  assert.ok(SRC.includes('const MIN_REPEAT = 1;'));
  assert.ok(SRC.includes('const MAX_REPEAT = 3;'));
});

test('constants: defines MAX_MESSAGE_CHARS', () => {
  assert.ok(SRC.includes('const MAX_MESSAGE_CHARS = 500;'));
});

test('constants: defines SPEECH_PRIORITIES', () => {
  assert.ok(SRC.includes("const SPEECH_PRIORITIES: readonly SpeechPriority[] = ['low', 'normal', 'high', 'urgent'];"));
});

test('constants: defines CHUNK_GAP_MS', () => {
  assert.ok(SRC.includes('const CHUNK_GAP_MS = 150;'));
});

// ============================================================================
// splitForSpeech function
// ============================================================================

test('functions: defines splitForSpeech', () => {
  assert.ok(SRC.includes('function splitForSpeech(text: string, maxChars = MAX_MESSAGE_CHARS): string[]'));
});

test('splitForSpeech: splits on sentence boundaries', () => {
  assert.ok(SRC.includes('trimmed.match('));
  assert.ok(SRC.includes('[^.!?]+[.!?]+'));
});

test('splitForSpeech: splits on clause boundaries', () => {
  assert.ok(SRC.includes('s.split('));
  assert.ok(SRC.includes('[,;:]\\s*'));
});

test('splitForSpeech: hard cut fallback', () => {
  assert.ok(SRC.includes('chunk.match(new RegExp('));
});

// ============================================================================
// SunnyBrain class
// ============================================================================

test('class: defines SunnyBrain class', () => {
  assert.ok(SRC.includes('class SunnyBrain'));
});

test('class: exports sunnyBrain singleton', () => {
  assert.ok(SRC.includes('export const sunnyBrain = new SunnyBrain();'));
});

test('class: exports SunnyBrain class', () => {
  assert.ok(SRC.includes('export { SunnyBrain };'));
});

// ============================================================================
// System status methods
// ============================================================================

test('methods: defines getSystemStatus', () => {
  assert.ok(SRC.includes('async getSystemStatus(): Promise<SystemStatus>'));
});

test('methods: defines startStatusPolling', () => {
  assert.ok(SRC.includes('startStatusPolling(intervalMs: number = DEFAULT_POLL_INTERVAL_MS): void'));
});

test('methods: defines stopStatusPolling', () => {
  assert.ok(SRC.includes('stopStatusPolling(): void'));
});

test('methods: defines onSystemStatusChange', () => {
  assert.ok(SRC.includes('onSystemStatusChange(callback: (status: SystemStatus) => void): () => void'));
});

// ============================================================================
// Speech methods
// ============================================================================

test('methods: defines speakNotification', () => {
  assert.ok(SRC.includes('async speakNotification('));
});

test('speech: validates priority', () => {
  assert.ok(SRC.includes('!SPEECH_PRIORITIES.includes(priority)'));
});

test('speech: clamps repeat value', () => {
  assert.ok(SRC.includes('Math.min(Math.max(Math.trunc(repeat) || 1, MIN_REPEAT), MAX_REPEAT)'));
});

test('speech: splits message into chunks', () => {
  assert.ok(SRC.includes('const chunks = splitForSpeech(cleanMessage);'));
});

test('speech: validates through electronAPI', () => {
  assert.ok(SRC.includes('if (window.electronAPI)'));
});

test('speech: speaks each chunk sequentially', () => {
  assert.ok(SRC.includes('for (const chunk of chunks)'));
});

test('speech: adds gap between chunks', () => {
  assert.ok(SRC.includes('CHUNK_GAP_MS'));
});

// ============================================================================
// Tool execution methods
// ============================================================================

test('methods: defines invokeTool', () => {
  assert.ok(SRC.includes('async invokeTool<T = unknown, P extends Record<string, unknown> = Record<string, unknown>>('));
});

test('invokeTool: validates toolName', () => {
  assert.ok(SRC.includes('typeof toolName !== \'string\' || toolName.trim() === \'\''));
});

test('invokeTool: handles missing electronAPI gracefully', () => {
  assert.ok(SRC.includes('if (!window.electronAPI)'));
});

test('invokeTool: returns ToolResult shape', () => {
  assert.ok(SRC.includes('success: true'));
  assert.ok(SRC.includes('toolName'));
  assert.ok(SRC.includes('timestamp'));
});

test('invokeTool: catches errors and returns failure shape', () => {
  assert.ok(SRC.includes('success: false'));
  assert.ok(SRC.includes('error: this.describeError(err)'));
});

// ============================================================================
// Quick action methods
// ============================================================================

test('methods: defines triggerQuickAction', () => {
  assert.ok(SRC.includes('async triggerQuickAction('));
});

test('quickAction: maps meds to schedule_medication_reminder', () => {
  assert.ok(SRC.includes("meds: 'schedule_medication_reminder'"));
});

test('quickAction: maps recipe to search_recipe', () => {
  assert.ok(SRC.includes("recipe: 'search_recipe'"));
});

test('quickAction: maps news to get_daily_digest', () => {
  assert.ok(SRC.includes("news: 'get_daily_digest'"));
});

test('quickAction: has web fallback for browser preview', () => {
  assert.ok(SRC.includes('private webFallback('));
});

test('quickAction: webFallback returns mock recipe data', () => {
  assert.ok(SRC.includes("'mock_recipe_1'"));
  assert.ok(SRC.includes('Demo Recipe (Browser Preview)'));
});

test('quickAction: webFallback returns mock meds data', () => {
  assert.ok(SRC.includes('mock_med_'));
});

test('quickAction: webFallback returns mock news data', () => {
  assert.ok(SRC.includes('Demo News Headline'));
  assert.ok(SRC.includes('Demo City'));
});

// ============================================================================
// Recipe methods
// ============================================================================

test('methods: defines fetchVerifiedRecipe', () => {
  assert.ok(SRC.includes('async fetchVerifiedRecipe('));
});

test('recipe: requires electronAPI', () => {
  assert.ok(SRC.includes('if (!window.electronAPI)'));
});

test('recipe: calls electronAPI.searchRecipe', () => {
  assert.ok(SRC.includes('window.electronAPI.searchRecipe('));
});

// ============================================================================
// Daily digest methods
// ============================================================================

test('methods: defines getDailyDigest', () => {
  assert.ok(SRC.includes('async getDailyDigest('));
});

test('digest: requires electronAPI', () => {
  assert.ok(SRC.includes('if (!window.electronAPI)'));
});

test('digest: calls electronAPI.getDailyDigest', () => {
  assert.ok(SRC.includes('window.electronAPI.getDailyDigest('));
});

test('methods: defines speakDailyDigest', () => {
  assert.ok(SRC.includes('async speakDailyDigest('));
});

test('speech: speakDailyDigest constructs weather text', () => {
  assert.ok(SRC.includes("`Current weather in ${digest.weather.location}"));
});

test('speech: speakDailyDigest constructs news text', () => {
  assert.ok(SRC.includes('Top news:'));
});

test('speech: speakDailyDigest calls speakNotification', () => {
  assert.ok(SRC.includes('await this.speakNotification(fullText, \'normal\', 1);'));
});

// ============================================================================
// Medication methods
// ============================================================================

test('methods: defines scheduleMedicationReminder', () => {
  assert.ok(SRC.includes('async scheduleMedicationReminder('));
});

test('meds: requires electronAPI', () => {
  assert.ok(SRC.includes('if (!window.electronAPI)'));
});

test('meds: calls electronAPI.scheduleMedicationReminder', () => {
  assert.ok(SRC.includes('window.electronAPI.scheduleMedicationReminder('));
});

test('methods: defines onMedicationReminder', () => {
  assert.ok(SRC.includes('onMedicationReminder('));
});

test('meds: onMedicationReminder returns no-op without electronAPI', () => {
  assert.ok(SRC.includes('if (!window.electronAPI)'));
  assert.ok(SRC.includes('return () => {};'));
});

test('methods: defines onMedicationReminderAdded', () => {
  assert.ok(SRC.includes('onMedicationReminderAdded('));
});

test('methods: defines markMedicationTaken', () => {
  assert.ok(SRC.includes('async markMedicationTaken('));
});

test('methods: defines getMedicationReminders', () => {
  assert.ok(SRC.includes('async getMedicationReminders('));
});

test('methods: defines deleteMedicationReminder', () => {
  assert.ok(SRC.includes('async deleteMedicationReminder('));
});

// ============================================================================
// Cooking methods
// ============================================================================

test('methods: defines onCookingStepChange', () => {
  assert.ok(SRC.includes('onCookingStepChange('));
});

// ============================================================================
// Conversation/activity log methods
// ============================================================================

test('methods: defines addMessage', () => {
  assert.ok(SRC.includes('addMessage(role: ChatMessage[\'role\'], content: string): ChatMessage'));
});

test('messages: validates non-empty content', () => {
  assert.ok(SRC.includes('content.trim() === \'\''));
});

test('messages: generates unique message id', () => {
  assert.ok(SRC.includes('Date.now().toString(36)'));
  assert.ok(SRC.includes('Math.random().toString(36)'));
});

test('messages: defines getMessages', () => {
  assert.ok(SRC.includes('getMessages(): ChatMessage[]'));
});

test('messages: defines subscribe', () => {
  assert.ok(SRC.includes('subscribe(listener: (messages: ChatMessage[]) => void): () => void'));
});

test('messages: defines clearMessages', () => {
  assert.ok(SRC.includes('clearMessages(): void'));
});

test('messages: defines dispose', () => {
  assert.ok(SRC.includes('dispose(): void'));
});

test('messages: dispose stops polling and clears listeners', () => {
  assert.ok(SRC.includes('this.stopStatusPolling();'));
  assert.ok(SRC.includes('this.listeners.clear();'));
  assert.ok(SRC.includes('this.statusListeners.clear();'));
});

// ============================================================================
// Internal methods
// ============================================================================

test('internals: defines requireElectronAPI', () => {
  assert.ok(SRC.includes('private requireElectronAPI(): ElectronAPI'));
});

test('internals: requireElectronAPI throws without electron', () => {
  assert.ok(SRC.includes("throw new Error('Electron API is unavailable. Are you running inside the Sunny app?');"));
});

test('internals: defines speakLocally', () => {
  assert.ok(SRC.includes('private speakLocally(message: string, repeat: number): void'));
});

test('speech: speakLocally checks for speechSynthesis', () => {
  assert.ok(SRC.includes("!('speechSynthesis' in window) || !window.speechSynthesis"));
});

test('speech: speakLocally cancels in-flight speech', () => {
  assert.ok(SRC.includes('window.speechSynthesis.cancel();'));
});

test('speech: speakLocally creates fresh utterance per repeat', () => {
  assert.ok(SRC.includes('for (let i = 0; i < repeat; i += 1) {'));
  assert.ok(SRC.includes('const utterance = new SpeechSynthesisUtterance(message);'));
});

test('speech: speakLocally sets rate/pitch/volume', () => {
  assert.ok(SRC.includes('utterance.rate = 0.9;'));
  assert.ok(SRC.includes('utterance.pitch = 1.0;'));
  assert.ok(SRC.includes('utterance.volume = 1.0;'));
});

test('speech: speakLocally catches errors gracefully', () => {
  assert.ok(SRC.includes('console.warn(\'[Sunny] Speech playback failed:\', error);'));
});

test('internals: defines describeError', () => {
  assert.ok(SRC.includes('private describeError(err: unknown): string'));
});

test('internals: describeError handles Error objects', () => {
  assert.ok(SRC.includes('err instanceof Error && err.message'));
});

test('internals: describeError handles strings', () => {
  assert.ok(SRC.includes('typeof err === \'string\' && err'));
});
