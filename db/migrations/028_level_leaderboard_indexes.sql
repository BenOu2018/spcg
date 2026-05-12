CREATE INDEX IF NOT EXISTS reward_ledger_level_first_ac_leaderboard_idx
  ON reward_ledger (source, (metadata->>'spcgLevel'), user_id, created_at)
  INCLUDE (coin_delta, source_ref)
  WHERE source = 'level_first_ac' AND coin_delta > 0;
