ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_role_check
    CHECK (role IN ('admin','teacher','student','parent'));

CREATE TABLE IF NOT EXISTS parent_students (
  parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','removed')),
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parent_user_id, student_user_id),
  CONSTRAINT parent_students_no_self CHECK (parent_user_id <> student_user_id)
);

CREATE INDEX IF NOT EXISTS parent_students_parent_status_idx
  ON parent_students (parent_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS parent_students_student_status_idx
  ON parent_students (student_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS growth_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated','revoked')),
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_hash TEXT NOT NULL UNIQUE,
  token_expires_at TIMESTAMPTZ NOT NULL,
  generated_by UUID REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_reports_period_valid CHECK (period_start <= period_end),
  CONSTRAINT growth_reports_markdown_present CHECK (length(trim(markdown)) > 0),
  CONSTRAINT growth_reports_summary_object CHECK (jsonb_typeof(summary) = 'object')
);

CREATE INDEX IF NOT EXISTS growth_reports_student_created_idx
  ON growth_reports (student_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS growth_reports_token_lookup_idx
  ON growth_reports (token_hash, token_expires_at)
  WHERE status = 'generated' AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS growth_report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES growth_reports(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_report_deliveries_target_present CHECK (length(trim(target)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_report_deliveries_once_idx
  ON growth_report_deliveries (report_id, parent_user_id, channel, target);

CREATE INDEX IF NOT EXISTS growth_report_deliveries_status_idx
  ON growth_report_deliveries (status, created_at DESC);

DROP TRIGGER IF EXISTS parent_students_set_updated_at ON parent_students;
CREATE TRIGGER parent_students_set_updated_at
BEFORE UPDATE ON parent_students
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS growth_reports_set_updated_at ON growth_reports;
CREATE TRIGGER growth_reports_set_updated_at
BEFORE UPDATE ON growth_reports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS growth_report_deliveries_set_updated_at ON growth_report_deliveries;
CREATE TRIGGER growth_report_deliveries_set_updated_at
BEFORE UPDATE ON growth_report_deliveries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
