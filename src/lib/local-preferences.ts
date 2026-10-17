export type ExecutionSpeed = 'careful' | 'balanced' | 'fast';
export type BrainProviderType = 'embedded' | 'openai' | 'anthropic' | 'groq' | 'ollama';
export type ClarificationLevel = 'all' | 'destructive-only';

export type SunnyPreferences = {
  execution_speed: ExecutionSpeed;
  require_sensitive_confirmation: boolean;
  local_only: boolean;
  voice_enabled: boolean;
  brain_provider: BrainProviderType;
  brain_model: string;
  clarification_level: ClarificationLevel;
  ollama_endpoint: string;
  has_completed_onboarding: boolean;
};

export const defaultPreferences: SunnyPreferences = {
  execution_speed: 'careful',
  require_sensitive_confirmation: true,
  local_only: true,
  voice_enabled: false,
  brain_provider: 'embedded',
  brain_model: 'moondream2',
  clarification_level: 'all',
  ollama_endpoint: 'http://localhost:11434',
  has_completed_onboarding: false,
};

const STORAGE_KEY = 'sunny_preferences_v1';

export function loadLocalPreferences(): SunnyPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultPreferences };
    const parsed = JSON.parse(raw) as Partial<SunnyPreferences>;
    return { ...defaultPreferences, ...parsed };
  } catch {
    return { ...defaultPreferences };
  }
}

export function saveLocalPreferences(prefs: SunnyPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be unavailable in some sandboxed contexts
  }
}

export function resetLocalPreferences(): SunnyPreferences {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return { ...defaultPreferences };
}

export type TaskOutcome = 'completed' | 'stopped' | 'failed' | 'injection-detected' | 'clarified';

export type TaskLog = {
  id: string;
  request_text: string;
  summary: string;
  outcome: TaskOutcome;
  action_count: number;
  required_approval: boolean;
  created_at: string;
};

const LOGS_KEY = 'sunny_task_logs_v1';
const MAX_LOGS = 50;

export function loadLocalTaskLogs(limit = 10): TaskLog[] {
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    if (!raw) return [];
    const logs = JSON.parse(raw) as TaskLog[];
    if (!Array.isArray(logs)) return [];
    return logs.slice(0, limit);
  } catch {
    return [];
  }
}

export function saveLocalTaskLog(log: Omit<TaskLog, 'id' | 'created_at'>): void {
  try {
    const raw = localStorage.getItem(LOGS_KEY);
    const logs = raw ? (JSON.parse(raw) as TaskLog[]) : [];
    const entry: TaskLog = {
      ...log,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_at: new Date().toISOString(),
    };
    logs.unshift(entry);
    const trimmed = logs.slice(0, MAX_LOGS);
    localStorage.setItem(LOGS_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage errors
  }
}
