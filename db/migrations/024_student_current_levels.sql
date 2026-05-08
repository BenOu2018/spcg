CREATE TABLE IF NOT EXISTS student_current_levels (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS student_current_levels_level_idx
  ON student_current_levels (level_id);

DROP TRIGGER IF EXISTS student_current_levels_set_updated_at ON student_current_levels;
CREATE TRIGGER student_current_levels_set_updated_at
BEFORE UPDATE ON student_current_levels
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS student_current_level_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  previous_level_id TEXT REFERENCES levels(id),
  new_level_id TEXT NOT NULL REFERENCES levels(id),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS student_current_level_events_student_created_idx
  ON student_current_level_events (student_user_id, created_at DESC);
