ALTER TABLE teacher_students
  ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS shared_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS teacher_note TEXT;

UPDATE teacher_students
SET access_level = 'owner'
WHERE access_level IS NULL OR access_level NOT IN ('owner', 'viewer');

UPDATE teacher_students
SET shared_at = COALESCE(shared_at, created_at)
WHERE access_level = 'viewer' AND shared_at IS NULL;

DROP INDEX IF EXISTS teacher_students_one_active_teacher_idx;

ALTER TABLE teacher_students
  DROP CONSTRAINT IF EXISTS teacher_students_access_level_check;

ALTER TABLE teacher_students
  ADD CONSTRAINT teacher_students_access_level_check
    CHECK (access_level IN ('owner', 'viewer'));

CREATE UNIQUE INDEX IF NOT EXISTS teacher_students_one_active_owner_idx
  ON teacher_students (student_user_id)
  WHERE status = 'active' AND access_level = 'owner';

CREATE INDEX IF NOT EXISTS teacher_students_teacher_access_status_idx
  ON teacher_students (teacher_user_id, access_level, status, created_at DESC);

CREATE INDEX IF NOT EXISTS teacher_students_student_access_status_idx
  ON teacher_students (student_user_id, access_level, status, created_at DESC);
