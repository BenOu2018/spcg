CREATE TABLE IF NOT EXISTS user_action_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  scope_key TEXT NOT NULL DEFAULT 'global',
  last_hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_action_rate_limits_action_present CHECK (length(trim(action_key)) > 0),
  CONSTRAINT user_action_rate_limits_scope_present CHECK (length(trim(scope_key)) > 0),
  UNIQUE (user_id, action_key, scope_key)
);

CREATE INDEX IF NOT EXISTS user_action_rate_limits_user_action_idx
  ON user_action_rate_limits (user_id, action_key, last_hit_at DESC);

DROP TRIGGER IF EXISTS user_action_rate_limits_set_updated_at ON user_action_rate_limits;
CREATE TRIGGER user_action_rate_limits_set_updated_at
BEFORE UPDATE ON user_action_rate_limits
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
