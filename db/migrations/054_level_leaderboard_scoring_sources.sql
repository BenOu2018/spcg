CREATE INDEX IF NOT EXISTS reward_ledger_level_score_sources_idx
  ON reward_ledger (source, (metadata->>'spcgLevel'), user_id, created_at)
  INCLUDE (coin_delta, source_ref)
  WHERE source IN ('level_first_ac', 'daily_review_complete', 'assessment_complete', 'assessment_rank_bonus')
    AND coin_delta > 0;
