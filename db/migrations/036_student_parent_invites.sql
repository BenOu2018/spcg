CREATE TABLE IF NOT EXISTS student_parent_invites (
  student_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  invite_code_hash TEXT NOT NULL,
  code_preview TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT student_parent_invites_hash_present CHECK (length(trim(invite_code_hash)) > 0)
);

CREATE INDEX IF NOT EXISTS student_parent_invites_status_idx
  ON student_parent_invites (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS parent_invite_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  student_identifier TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parent_invite_attempts_identifier_present CHECK (length(trim(student_identifier)) > 0)
);

CREATE INDEX IF NOT EXISTS parent_invite_attempts_parent_created_idx
  ON parent_invite_attempts (parent_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS parent_invite_attempts_identifier_created_idx
  ON parent_invite_attempts (student_identifier, created_at DESC);

INSERT INTO student_parent_invites (student_user_id, invite_code_hash, code_preview, status)
SELECT
  u.id,
  md5(u.id::text || ':' || gen_random_uuid()::text),
  NULL,
  'active'
FROM users u
JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'student'
ON CONFLICT (student_user_id) DO NOTHING;

DROP TRIGGER IF EXISTS student_parent_invites_set_updated_at ON student_parent_invites;
CREATE TRIGGER student_parent_invites_set_updated_at
BEFORE UPDATE ON student_parent_invites
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
