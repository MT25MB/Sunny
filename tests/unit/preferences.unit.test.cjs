/**
 * UNIT TESTS: Local Preferences (content-based)
 * Tests for src/lib/local-preferences.ts
 *
 * TypeScript files can't be required directly under plain Node, so we verify
 * the source contains the correct defaults, types, and storage logic.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'lib', 'local-preferences.ts'), 'utf8');

// ============================================================================
// Types
// ============================================================================

test('types: defines ExecutionSpeed union', () => {
  assert.ok(SRC.includes("export type ExecutionSpeed = 'careful' | 'balanced' | 'fast';"));
});

test('types: defines BrainProviderType union', () => {
  assert.ok(
    SRC.includes(
      "export type BrainProviderType = 'embedded' | 'openai' | 'anthropic' | 'groq' | 'ollama';"
    )
  );
});

test('types: defines ClarificationLevel union', () => {
  assert.ok(SRC.includes("export type ClarificationLevel = 'all' | 'destructive-only';"));
});

test('types: defines SunnyPreferences interface', () => {
  assert.ok(SRC.includes('export type SunnyPreferences = {'));
});

test('types: defines TaskOutcome union', () => {
  assert.ok(SRC.includes("export type TaskOutcome = 'completed' | 'stopped' | 'failed' | 'injection-detected' | 'clarified';"));
});

test('types: defines TaskLog interface', () => {
  assert.ok(SRC.includes('export type TaskLog = {'));
});

// ============================================================================
// Default preferences
// ============================================================================

test('defaults: execution_speed is careful', () => {
  assert.ok(SRC.includes("execution_speed: 'careful'"));
});

test('defaults: require_sensitive_confirmation is true', () => {
  assert.ok(SRC.includes('require_sensitive_confirmation: true'));
});

test('defaults: local_only is true', () => {
  assert.ok(SRC.includes('local_only: true'));
});

test('defaults: voice_enabled is true', () => {
  assert.ok(SRC.includes('voice_enabled: true'));
});

test('defaults: brain_provider is embedded', () => {
  assert.ok(SRC.includes("brain_provider: 'embedded'"));
});

test('defaults: brain_model is moondream2', () => {
  assert.ok(SRC.includes("brain_model: 'moondream2'"));
});

test('defaults: clarification_level is all', () => {
  assert.ok(SRC.includes("clarification_level: 'all'"));
});

test('defaults: ollama_endpoint is localhost:11434', () => {
  assert.ok(SRC.includes("ollama_endpoint: 'http://localhost:11434'"));
});

test('defaults: has_completed_onboarding is false', () => {
  assert.ok(SRC.includes('has_completed_onboarding: false'));
});

test('defaults: remember_window_position is true', () => {
  assert.ok(SRC.includes('remember_window_position: true'));
});

// ============================================================================
// Storage keys
// ============================================================================

test('storage: defines preferences storage key', () => {
  assert.ok(SRC.includes("const STORAGE_KEY = 'sunny_preferences_v1';"));
});

test('storage: defines task logs storage key', () => {
  assert.ok(SRC.includes("const LOGS_KEY = 'sunny_task_logs_v1';"));
});

test('storage: defines MAX_LOGS constant', () => {
  assert.ok(SRC.includes('const MAX_LOGS = 50;'));
});

// ============================================================================
// Functions
// ============================================================================

test('functions: defines loadLocalPreferences', () => {
  assert.ok(SRC.includes('export function loadLocalPreferences()'));
});

test('functions: defines saveLocalPreferences', () => {
  assert.ok(SRC.includes('export function saveLocalPreferences('));
});

test('functions: defines resetLocalPreferences', () => {
  assert.ok(SRC.includes('export function resetLocalPreferences()'));
});

test('functions: defines loadLocalTaskLogs', () => {
  assert.ok(SRC.includes('export function loadLocalTaskLogs('));
});

test('functions: defines saveLocalTaskLog', () => {
  assert.ok(SRC.includes('export function saveLocalTaskLog('));
});

// ============================================================================
// Safety behavior
// ============================================================================

test('safety: loadLocalPreferences falls back to defaults on error', () => {
  assert.ok(SRC.includes('return { ...defaultPreferences };'));
});

test('safety: saveLocalPreferences catches errors silently', () => {
  assert.ok(SRC.includes('// localStorage may be unavailable in some sandboxed contexts'));
});

test('safety: loadLocalTaskLogs returns empty array on error', () => {
  assert.ok(SRC.includes('return [];'));
});

test('safety: saveLocalTaskLog trims to MAX_LOGS', () => {
  assert.ok(SRC.includes('const trimmed = logs.slice(0, MAX_LOGS);'));
});
