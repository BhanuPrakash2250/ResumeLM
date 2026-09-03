-- Let anonymous browser sessions own jobs without an auth.users row.
-- Existing authenticated/legacy rows keep their user_id values.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS anonymous_session_id uuid;

ALTER TABLE public.jobs
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_user_id_fkey;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_ownership_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_ownership_check
  CHECK (user_id IS NOT NULL OR anonymous_session_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS jobs_anonymous_session_id_idx
  ON public.jobs (anonymous_session_id);