// Preferences and task logs are now stored locally only (localStorage + OS credential vault).
// This file re-exports the new local-preferences types for backward compatibility.
// Supabase is no longer used for any preference or credential storage.

export type {
  ExecutionSpeed,
  BrainProviderType,
  ClarificationLevel,
  SunnyPreferences,
  TaskOutcome,
  TaskLog,
} from './local-preferences';

export {
  defaultPreferences,
  loadLocalPreferences as loadPreferences,
  saveLocalPreferences as savePreferences,
  resetLocalPreferences,
  loadLocalTaskLogs as loadRecentSummaryLogs,
  saveLocalTaskLog as saveSummaryLog,
} from './local-preferences';

// Supabase client retained for potential future use but no longer used for preferences.
export { supabase } from './supabase-client';
