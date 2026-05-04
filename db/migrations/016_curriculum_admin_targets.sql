ALTER TABLE problem_set_items
  ALTER COLUMN metadata SET DEFAULT '{"displayMode":"primary"}'::jsonb;

UPDATE problem_set_items
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"displayMode":"primary"}'::jsonb
WHERE metadata->>'displayMode' IS NULL;

ALTER TABLE problem_set_items
  DROP CONSTRAINT IF EXISTS problem_set_items_display_mode_valid;

ALTER TABLE problem_set_items
  ADD CONSTRAINT problem_set_items_display_mode_valid
  CHECK (
    metadata->>'displayMode' IS NULL
    OR metadata->>'displayMode' IN ('primary','backup','exam-only')
  );

ALTER TABLE level_import_batches
  ADD COLUMN IF NOT EXISTS target_spcg_level INT,
  ADD COLUMN IF NOT EXISTS target_problem_set_id TEXT REFERENCES problem_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_item_mode TEXT NOT NULL DEFAULT 'primary';

ALTER TABLE level_import_batches
  DROP CONSTRAINT IF EXISTS level_import_batches_target_spcg_level_valid;

ALTER TABLE level_import_batches
  ADD CONSTRAINT level_import_batches_target_spcg_level_valid
  CHECK (target_spcg_level IS NULL OR target_spcg_level BETWEEN 1 AND 10);

ALTER TABLE level_import_batches
  DROP CONSTRAINT IF EXISTS level_import_batches_default_item_mode_valid;

ALTER TABLE level_import_batches
  ADD CONSTRAINT level_import_batches_default_item_mode_valid
  CHECK (default_item_mode IN ('primary','backup','exam-only'));
