-- Let server-side anonymous sessions own resumes without an auth.users row.
-- Existing authenticated/legacy rows keep their user_id values.
ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS anonymous_session_id uuid;

ALTER TABLE public.resumes
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.resumes
  DROP CONSTRAINT IF EXISTS resumes_user_id_fkey;

ALTER TABLE public.resumes
  DROP CONSTRAINT IF EXISTS resumes_ownership_check;

ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_ownership_check
  CHECK (user_id IS NOT NULL OR anonymous_session_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS resumes_anonymous_session_id_idx
  ON public.resumes (anonymous_session_id);
