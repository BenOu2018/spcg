CREATE TABLE IF NOT EXISTS user_entitlements (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL DEFAULT 'experience'
    CHECK (user_type IN ('experience', 'invite_test', 'paid_49', 'paid_99')),
  note TEXT,
  expires_at TIMESTAMPTZ,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_type
  ON user_entitlements (user_type);

CREATE TABLE IF NOT EXISTS upgrade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_type TEXT NOT NULL
    CHECK (target_user_type IN ('invite_test', 'paid_49', 'paid_99')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  message TEXT,
  handled_by UUID REFERENCES users(id),
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upgrade_requests_user_status
  ON upgrade_requests (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status_created
  ON upgrade_requests (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_user_entitlements_updated_at ON user_entitlements;
CREATE TRIGGER trg_user_entitlements_updated_at
BEFORE UPDATE ON user_entitlements
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_upgrade_requests_updated_at ON upgrade_requests;
CREATE TRIGGER trg_upgrade_requests_updated_at
BEFORE UPDATE ON upgrade_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
