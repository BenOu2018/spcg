ALTER TABLE problem_set_items
  DROP CONSTRAINT IF EXISTS problem_set_items_display_mode_valid;

ALTER TABLE problem_set_items
  ADD CONSTRAINT problem_set_items_display_mode_valid
  CHECK (
    metadata->>'displayMode' IS NULL
    OR metadata->>'displayMode' IN (
      'template',
      'basic',
      'variant',
      'advanced',
      'challenge',
      'exam-only',
      'primary',
      'backup'
    )
  );
ALTER TABLE level_import_batches
  DROP CONSTRAINT IF EXISTS level_import_batches_default_item_mode_valid;

ALTER TABLE level_import_batches
  ADD CONSTRAINT level_import_batches_default_item_mode_valid
  CHECK (
    default_item_mode IN (
      'template',
      'basic',
      'variant',
      'advanced',
      'challenge',
      'exam-only',
      'primary',
      'backup'
    )
  );
