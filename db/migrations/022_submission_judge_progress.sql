ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS judge_progress JSONB;
