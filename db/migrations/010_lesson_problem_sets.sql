ALTER TABLE levels
  ADD COLUMN IF NOT EXISTS teacher_notes TEXT;

ALTER TABLE problem_sets
  DROP CONSTRAINT IF EXISTS problem_sets_type_check;

ALTER TABLE problem_sets
  ADD CONSTRAINT problem_sets_type_check
  CHECK (type IN ('chapter','practice','review','challenge','import-review','lesson'));

ALTER TABLE problem_sets
  ADD COLUMN IF NOT EXISTS spcg_level INT,
  ADD COLUMN IF NOT EXISTS stage_no INT,
  ADD COLUMN IF NOT EXISTS track TEXT,
  ADD COLUMN IF NOT EXISTS lesson_focus TEXT;

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

CREATE UNIQUE INDEX IF NOT EXISTS problem_sets_active_lesson_slot_unique
ON problem_sets (spcg_level, stage_no, track)
WHERE type = 'lesson' AND status <> 'archived';

CREATE TABLE IF NOT EXISTS lesson_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_set_id TEXT NOT NULL REFERENCES problem_sets(id) ON DELETE CASCADE,
  version INT NOT NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai','manual_edit')),
  model TEXT,
  prompt_snapshot TEXT,
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lesson_plans_markdown_present CHECK (length(trim(markdown)) > 0),
  CONSTRAINT lesson_plans_version_positive CHECK (version > 0),
  UNIQUE (problem_set_id, version)
);

CREATE INDEX IF NOT EXISTS lesson_plans_problem_set_created_idx
ON lesson_plans (problem_set_id, created_at DESC);
