-- Allow anonymous browser sessions to own resume data without an auth.users row.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_user_id_fkey;

ALTER TABLE public.resumes
  DROP CONSTRAINT IF EXISTS resumes_user_id_fkey;

ALTER TABLE public.ai_usage_events
  DROP CONSTRAINT IF EXISTS ai_usage_events_user_id_fkey;

ALTER TABLE public.ai_usage_events
  ALTER COLUMN user_id DROP NOT NULL;
