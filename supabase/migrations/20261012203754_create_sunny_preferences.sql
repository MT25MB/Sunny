/*
# Create Sunny preferences storage

1. New Tables
- `sunny_preferences` stores the single-device safety and behavior preferences used by Sunny.
- `id` (text, primary key) identifies the one local app preference record.
- `execution_speed` (text) controls how quickly approved actions are performed.
- `require_sensitive_confirmation` (boolean) keeps confirmations enabled for risky actions.
- `local_only` (boolean) keeps AI processing local by default.
- `voice_enabled` (boolean) controls whether voice interaction is available.
- `updated_at` (timestamptz) records the last preference update.

2. Security
- Row-level security is enabled.
- This is a single-device, no-sign-in app, so anon and authenticated clients may manage the intentionally shared preference record.
- Four separate CRUD policies are provided instead of a broad FOR ALL policy.

3. Important Notes
- The app uses a stable `default` key and creates the row on first save.
- No screenshots, screen contents, credentials, or task payloads are stored.
- The table is intentionally limited to non-sensitive app preferences.
*/

CREATE TABLE IF NOT EXISTS public.sunny_preferences (
  id text PRIMARY KEY,
  execution_speed text NOT NULL DEFAULT 'careful',
  require_sensitive_confirmation boolean NOT NULL DEFAULT true,
  local_only boolean NOT NULL DEFAULT true,
  voice_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sunny_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sunny preferences can be read" ON public.sunny_preferences;
CREATE POLICY "Sunny preferences can be read"
ON public.sunny_preferences FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Sunny preferences can be created" ON public.sunny_preferences;
CREATE POLICY "Sunny preferences can be created"
ON public.sunny_preferences FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Sunny preferences can be updated" ON public.sunny_preferences;
CREATE POLICY "Sunny preferences can be updated"
ON public.sunny_preferences FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Sunny preferences can be deleted" ON public.sunny_preferences;
CREATE POLICY "Sunny preferences can be deleted"
ON public.sunny_preferences FOR DELETE
TO anon, authenticated
USING (true);