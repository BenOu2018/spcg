ALTER TABLE problem_sets
  DROP CONSTRAINT IF EXISTS problem_sets_type_check;

ALTER TABLE problem_sets
  ADD CONSTRAINT problem_sets_type_check
  CHECK (type IN ('chapter','practice','review','challenge','import-review','lesson','assessment'));

ALTER TABLE problem_sets
  DROP CONSTRAINT IF EXISTS problem_sets_lesson_fields;

ALTER TABLE problem_sets
  ADD CONSTRAINT problem_sets_lesson_fields
  CHECK (
    (
      type <> 'lesson'
      AND track IS NULL
    )
    OR (
      type = 'lesson'
      AND spcg_level IS NOT NULL
      AND spcg_level BETWEEN 1 AND 10
      AND stage_no IS NOT NULL
      AND stage_no > 0
      AND track IS NOT NULL
      AND track IN ('A','B')
      AND lesson_focus IS NOT NULL
      AND length(trim(lesson_focus)) > 0
    )
  );

ALTER TABLE assessment_attempts
  DROP CONSTRAINT IF EXISTS assessment_attempts_status_check;

ALTER TABLE assessment_attempts
  ADD CONSTRAINT assessment_attempts_status_check
  CHECK (status IN ('in_progress','scoring','completed','expired','abandoned'));

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS assessment_attempt_id UUID REFERENCES assessment_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assessment_phase TEXT,
  ADD COLUMN IF NOT EXISTS judge_mode TEXT,
  ADD COLUMN IF NOT EXISTS score INT NOT NULL DEFAULT 0 CHECK (score >= 0),
  ADD COLUMN IF NOT EXISTS max_score INT CHECK (max_score IS NULL OR max_score >= 0),
  ADD COLUMN IF NOT EXISTS case_results JSONB;

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_assessment_phase_valid;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_assessment_phase_valid
  CHECK (
    assessment_phase IS NULL
    OR assessment_phase IN ('realtime','final')
  );

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_judge_mode_valid;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_judge_mode_valid
  CHECK (
    judge_mode IS NULL
    OR judge_mode IN ('fast','full')
  );

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_assessment_fields_consistent;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_assessment_fields_consistent
  CHECK (
    (
      assessment_attempt_id IS NULL
      AND assessment_phase IS NULL
      AND judge_mode IS NULL
      AND max_score IS NULL
    )
    OR (
      assessment_attempt_id IS NOT NULL
      AND assessment_phase IS NOT NULL
      AND judge_mode IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS submissions_assessment_attempt_idx
  ON submissions (assessment_attempt_id, level_id, assessment_phase, created_at DESC);

CREATE TABLE IF NOT EXISTS assessment_attempt_items (
  attempt_id UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id),
  position INT NOT NULL CHECK (position > 0),
  display_mode TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('lesson','exam-only')),
  max_score INT NOT NULL CHECK (max_score > 0),
  latest_realtime_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  final_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','scoring','done')),
  passed_cases INT NOT NULL DEFAULT 0 CHECK (passed_cases >= 0),
  total_cases INT NOT NULL DEFAULT 20 CHECK (total_cases > 0),
  score INT NOT NULL DEFAULT 0 CHECK (score >= 0),
  verdict JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, level_id),
  UNIQUE (attempt_id, position)
);

CREATE INDEX IF NOT EXISTS assessment_attempt_items_attempt_position_idx
  ON assessment_attempt_items (attempt_id, position);

DROP TRIGGER IF EXISTS assessment_attempt_items_set_updated_at ON assessment_attempt_items;
CREATE TRIGGER assessment_attempt_items_set_updated_at
BEFORE UPDATE ON assessment_attempt_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
