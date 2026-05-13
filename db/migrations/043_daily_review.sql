ALTER TABLE assessment_sessions
  DROP CONSTRAINT IF EXISTS assessment_sessions_type_check;

ALTER TABLE assessment_sessions
  ADD CONSTRAINT assessment_sessions_type_check
  CHECK (type IN ('exam','contest','daily_review'));

ALTER TABLE assessment_attempt_items
  DROP CONSTRAINT IF EXISTS assessment_attempt_items_source_check;

ALTER TABLE assessment_attempt_items
  ADD CONSTRAINT assessment_attempt_items_source_check
  CHECK (source IN ('lesson','exam-only','daily-review'));

ALTER TABLE reward_ledger
  DROP CONSTRAINT IF EXISTS reward_ledger_source_check;

ALTER TABLE reward_ledger
  ADD CONSTRAINT reward_ledger_source_check
  CHECK (
    source IN (
      'level_first_ac',
      'hidden_garlic_drop',
      'repair_ac',
      'assessment_complete',
      'assessment_rank_bonus',
      'daily_review_complete',
      'admin_adjustment'
    )
  );
