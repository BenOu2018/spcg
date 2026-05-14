ALTER TABLE user_action_rate_limits
  ADD COLUMN IF NOT EXISTS hit_timestamps TIMESTAMPTZ[] NOT NULL DEFAULT ARRAY[]::TIMESTAMPTZ[];

UPDATE user_action_rate_limits
SET hit_timestamps = ARRAY[last_hit_at]::TIMESTAMPTZ[]
WHERE COALESCE(array_length(hit_timestamps, 1), 0) = 0;
