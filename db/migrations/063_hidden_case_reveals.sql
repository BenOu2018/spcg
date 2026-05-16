CREATE TABLE IF NOT EXISTS hidden_case_reveals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL,
  case_index INTEGER NOT NULL,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hidden_case_reveals_test_case_id_present CHECK (length(trim(test_case_id)) > 0),
  CONSTRAINT hidden_case_reveals_case_index_nonnegative CHECK (case_index >= 0),
  UNIQUE (user_id, level_id, test_case_id)
);

CREATE INDEX IF NOT EXISTS hidden_case_reveals_user_level_idx
  ON hidden_case_reveals (user_id, level_id, created_at ASC);

CREATE INDEX IF NOT EXISTS hidden_case_reveals_submission_idx
  ON hidden_case_reveals (submission_id);
