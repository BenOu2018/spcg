CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student'
    CHECK (role IN ('admin','teacher','student')),
  assigned_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO user_roles (user_id, role, assigned_by)
SELECT
  u.id,
  CASE WHEN ar.user_id IS NOT NULL AND ar.active = TRUE THEN 'admin' ELSE 'student' END,
  ar.created_by
FROM users u
LEFT JOIN admin_roles ar ON ar.user_id = u.id
ON CONFLICT (user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS user_roles_role_idx ON user_roles (role);

CREATE TABLE IF NOT EXISTS teacher_students (
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','removed')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (teacher_user_id, student_user_id),
  CONSTRAINT teacher_students_no_self CHECK (teacher_user_id <> student_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS teacher_students_one_active_teacher_idx
  ON teacher_students (student_user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS teacher_students_teacher_status_idx
  ON teacher_students (teacher_user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS user_roles_set_updated_at ON user_roles;
CREATE TRIGGER user_roles_set_updated_at
BEFORE UPDATE ON user_roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS teacher_students_set_updated_at ON teacher_students;
CREATE TRIGGER teacher_students_set_updated_at
BEFORE UPDATE ON teacher_students
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
