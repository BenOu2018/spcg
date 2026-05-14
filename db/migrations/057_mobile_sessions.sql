CREATE TABLE IF NOT EXISTS mobile_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT,
  client_user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mobile_sessions_token_hash_present CHECK (length(trim(token_hash)) > 0),
  CONSTRAINT mobile_sessions_expiry_valid CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS mobile_sessions_user_expires_idx
  ON mobile_sessions (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS mobile_sessions_active_idx
  ON mobile_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS mobile_sessions_set_updated_at ON mobile_sessions;
CREATE TRIGGER mobile_sessions_set_updated_at
BEFORE UPDATE ON mobile_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
