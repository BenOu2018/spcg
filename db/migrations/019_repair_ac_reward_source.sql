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
      'admin_adjustment'
    )
  );
