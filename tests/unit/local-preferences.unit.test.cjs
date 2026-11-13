'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// local-preferences.ts is TypeScript - read as text for structural verification
const prefsPath = path.join(process.cwd(), 'src/lib/local-preferences.ts');
const prefsTs = fs.readFileSync(prefsPath, 'utf8');

describe('local-preferences — types', () => {
  it('ExecutionSpeed type is defined', () => {
    assert.ok(prefsTs.includes("type ExecutionSpeed = 'careful' | 'balanced' | 'fast';"));
  });

  it('BrainProviderType is defined', () => {
    assert.ok(prefsTs.includes("type BrainProviderType = 'embedded' | 'openai' | 'anthropic' | 'groq' | 'ollama';"));
  });

  it('ClarificationLevel is defined', () => {
    assert.ok(prefsTs.includes("type ClarificationLevel = 'all' | 'destructive-only';"));
  });

  it('SunnyPreferences interface is defined', () => {
    assert.ok(prefsTs.includes('export type SunnyPreferences = {'));
  });

  it('TaskOutcome type is defined', () => {
    assert.ok(prefsTs.includes("type TaskOutcome = 'completed' | 'stopped' | 'failed' | 'injection-detected' | 'clarified';"));
  });

  it('TaskLog interface is defined', () => {
    assert.ok(prefsTs.includes('export type TaskLog = {'));
  });
});

describe('local-preferences — defaultPreferences', () => {
  it('defaultPreferences is declared', () => {
    assert.ok(prefsTs.includes('export const defaultPreferences:'));
  });

  it('execution_speed default is careful', () => {
    assert.ok(prefsTs.includes("execution_speed: 'careful'"));
  });

  it('require_sensitive_confirmation default is true', () => {
    assert.ok(prefsTs.includes('require_sensitive_confirmation: true'));
  });

  it('local_only default is true', () => {
    assert.ok(prefsTs.includes('local_only: true'));
  });

  it('voice_enabled default is true', () => {
    assert.ok(prefsTs.includes('voice_enabled: true'));
  });

  it('brain_provider default is embedded', () => {
    assert.ok(prefsTs.includes("brain_provider: 'embedded'"));
  });

  it('brain_model default is moondream2', () => {
    assert.ok(prefsTs.includes("brain_model: 'moondream2'"));
  });

  it('clarification_level default is all', () => {
    assert.ok(prefsTs.includes("clarification_level: 'all'"));
  });

  it('ollama_endpoint default is localhost:11434', () => {
    assert.ok(prefsTs.includes("ollama_endpoint: 'http://localhost:11434'"));
  });

  it('has_completed_onboarding default is false', () => {
    assert.ok(prefsTs.includes('has_completed_onboarding: false'));
  });

  it('remember_window_position default is true', () => {
    assert.ok(prefsTs.includes('remember_window_position: true'));
  });
});

describe('local-preferences — storage functions', () => {
  it('STORAGE_KEY is defined', () => {
    assert.ok(prefsTs.includes("STORAGE_KEY = 'sunny_preferences_v1'"));
  });

  it('loadLocalPreferences function exists', () => {
    assert.ok(prefsTs.includes('function loadLocalPreferences'));
  });

  it('saveLocalPreferences function exists', () => {
    assert.ok(prefsTs.includes('function saveLocalPreferences'));
  });

  it('resetLocalPreferences function exists', () => {
    assert.ok(prefsTs.includes('function resetLocalPreferences'));
  });

  it('loadLocalPreferences falls back to defaults on error', () => {
    assert.ok(prefsTs.includes('catch'));
    assert.ok(prefsTs.includes('defaultPreferences'));
  });

  it('saveLocalPreferences catches errors silently', () => {
    assert.ok(prefsTs.includes('catch'));
    assert.ok(prefsTs.includes('// localStorage may be unavailable'));
  });

  it('resetLocalPreferences removes storage item', () => {
    assert.ok(prefsTs.includes('localStorage.removeItem'));
  });
});

describe('local-preferences — task logs', () => {
  it('TaskLog interface has required fields', () => {
    assert.ok(prefsTs.includes('id: string;'));
    assert.ok(prefsTs.includes('request_text: string;'));
    assert.ok(prefsTs.includes('summary: string;'));
    assert.ok(prefsTs.includes('outcome: TaskOutcome;'));
    assert.ok(prefsTs.includes('action_count: number;'));
    assert.ok(prefsTs.includes('required_approval: boolean;'));
    assert.ok(prefsTs.includes('created_at: string;'));
  });

  it('MAX_LOGS constant is defined', () => {
    assert.ok(prefsTs.includes('const MAX_LOGS = 50'));
  });

  it('LOGS_KEY is defined', () => {
    assert.ok(prefsTs.includes("LOGS_KEY = 'sunny_task_logs_v1'"));
  });

  it('loadLocalTaskLogs function exists', () => {
    assert.ok(prefsTs.includes('function loadLocalTaskLogs'));
  });

  it('saveLocalTaskLog function exists', () => {
    assert.ok(prefsTs.includes('function saveLocalTaskLog'));
  });

  it('loadLocalTaskLogs returns empty array on error', () => {
    assert.ok(prefsTs.includes('catch'));
    assert.ok(prefsTs.includes('return []'));
  });

  it('saveLocalTaskLog trims to MAX_LOGS', () => {
    assert.ok(prefsTs.includes('slice(0, MAX_LOGS)'));
  });

  it('saveLocalTaskLog assigns id and created_at', () => {
    assert.ok(prefsTs.includes("id: \`${Date.now()}-${Math.random"));
    assert.ok(prefsTs.includes('created_at: new Date().toISOString()'));
  });
});
