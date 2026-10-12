/*
# Extend preferences and create task logs table

1. Modified Tables
- `sunny_preferences` gains four new columns:
  - `brain_provider` (text, default 'embedded') -- selects the AI model provider: 'embedded' (local Transformers.js), 'openai', or 'anthropic'.
  - `brain_model` (text, default 'moondream2') -- the model name to use with the selected provider.
  - `brain_api_key` (text, nullable) -- API key for cloud providers; empty for embedded. Never logged or exposed in debug logs.
  - `clarification_level` (text, default 'all') -- controls when Sunny asks clarifying questions: 'all' (all vague requests) or 'destructive-only'.
- All new columns have safe defaults so existing rows continue to work.

2. New Tables
- `sunny_task_logs` stores lightweight user-facing task summaries.
  - `id` (uuid, primary key) -- unique log entry ID.
  - `request_text` (text) -- the original user request.
  - `summary` (text) -- plain-language summary of what Sunny did (e.g. "Opened browser, found recipe, needed approval: No").
  - `outcome` (text) -- task result: 'completed', 'stopped', 'failed', 'injection-detected', or 'clarified'.
  - `action_count` (integer) -- number of desktop actions performed.
  - `required_approval` (boolean) -- whether user approval was needed for a destructive action.
  - `created_at` (timestamptz) -- when the task was logged.
- No screenshots, screen contents, coordinates, or credentials are stored in this table.
- Detailed debug logs (with coordinates and screenshots) are stored locally on disk, not in this database.

3. Security
- Row-level security is enabled on `sunny_task_logs`.
- This is a single-device, no-sign-in app, so anon and authenticated clients may manage task log entries.
- Four separate CRUD policies are provided (select, insert, update, delete) instead of a broad FOR ALL policy.
- The existing `sunny_preferences` RLS policies already allow anon + authenticated CRUD and do not need changes.

4. Important Notes
- The new preference columns use IF NOT EXISTS guards via a DO block to avoid errors on re-run.
- Existing preference rows are backfilled with default values automatically by the column defaults.
- The `sunny_task_logs` table is intentionally limited to non-sensitive summary data.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sunny_preferences' AND column_name = 'brain_provider') THEN
    ALTER TABLE public.sunny_preferences ADD COLUMN brain_provider text NOT NULL DEFAULT 'embedded';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sunny_preferences' AND column_name = 'brain_model') THEN
    ALTER TABLE public.sunny_preferences ADD COLUMN brain_model text NOT NULL DEFAULT 'moondream2';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sunny_preferences' AND column_name = 'brain_api_key') THEN
    ALTER TABLE public.sunny_preferences ADD COLUMN brain_api_key text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sunny_preferences' AND column_name = 'clarification_level') THEN
    ALTER TABLE public.sunny_preferences ADD COLUMN clarification_level text NOT NULL DEFAULT 'all';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sunny_task_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_text text NOT NULL,
  summary text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT 'completed',
  action_count integer NOT NULL DEFAULT 0,
  required_approval boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sunny_task_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sunny task logs can be read" ON public.sunny_task_logs;
CREATE POLICY "Sunny task logs can be read"
ON public.sunny_task_logs FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Sunny task logs can be created" ON public.sunny_task_logs;
CREATE POLICY "Sunny task logs can be created"
ON public.sunny_task_logs FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Sunny task logs can be updated" ON public.sunny_task_logs;
CREATE POLICY "Sunny task logs can be updated"
ON public.sunny_task_logs FOR UPDATE
TO anon, authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Sunny task logs can be deleted" ON public.sunny_task_logs;
CREATE POLICY "Sunny task logs can be deleted"
ON public.sunny_task_logs FOR DELETE
TO anon, authenticated
USING (true);
