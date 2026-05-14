ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS student_enrollment_type TEXT NOT NULL DEFAULT 'online';

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_student_enrollment_type_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_student_enrollment_type_check
    CHECK (student_enrollment_type IN ('online', 'offline'));

INSERT INTO profiles (user_id, student_enrollment_type)
SELECT DISTINCT ts.student_user_id, 'offline'
FROM teacher_students ts
WHERE ts.status = 'active'
  AND ts.access_level = 'owner'
ON CONFLICT (user_id)
DO UPDATE SET
  student_enrollment_type = 'offline',
  updated_at = NOW()
WHERE profiles.student_enrollment_type <> 'offline';

CREATE INDEX IF NOT EXISTS idx_profiles_student_enrollment_type
  ON profiles (student_enrollment_type);
