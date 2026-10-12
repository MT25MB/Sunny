/*
# Remove brain_api_key column and add ollama_endpoint

1. Modified Tables
- `sunny_preferences`: Drops the `brain_api_key` column.
  API keys are now stored locally in the OS credential vault (macOS Keychain, Windows DPAPI, Linux libsecret)
  via Electron's safeStorage API, never in the cloud database.
- `sunny_preferences`: Adds `ollama_endpoint` (text, default 'http://localhost:11434')
  for connecting to a local Ollama instance.

2. Security
- This migration improves security by removing API keys from the cloud database entirely.
- No RLS policy changes needed — existing policies remain valid.

3. Important Notes
- The brain_api_key column is dropped with IF EXISTS to avoid errors if already absent.
- The ollama_endpoint column is added with IF NOT EXISTS guard for idempotency.
- All preferences are now stored locally in the browser's localStorage; this table
  is retained for backward compatibility but is no longer the primary store.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sunny_preferences' AND column_name = 'brain_api_key') THEN
    ALTER TABLE public.sunny_preferences DROP COLUMN brain_api_key;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sunny_preferences' AND column_name = 'ollama_endpoint') THEN
    ALTER TABLE public.sunny_preferences ADD COLUMN ollama_endpoint text NOT NULL DEFAULT 'http://localhost:11434';
  END IF;
END $$;
