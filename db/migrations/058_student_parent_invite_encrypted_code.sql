ALTER TABLE student_parent_invites
  ADD COLUMN IF NOT EXISTS invite_code_encrypted JSONB;

ALTER TABLE student_parent_invites
  DROP CONSTRAINT IF EXISTS student_parent_invites_encrypted_code_object;

ALTER TABLE student_parent_invites
  ADD CONSTRAINT student_parent_invites_encrypted_code_object
    CHECK (
      invite_code_encrypted IS NULL
      OR jsonb_typeof(invite_code_encrypted) = 'object'
    );
