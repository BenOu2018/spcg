CREATE TABLE IF NOT EXISTS user_behavior_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_session_id TEXT NOT NULL,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT user_behavior_sessions_client_session_present CHECK (length(trim(client_session_id)) > 0),
  CONSTRAINT user_behavior_sessions_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (user_id, client_session_id)
);

CREATE INDEX IF NOT EXISTS user_behavior_sessions_user_last_seen_idx
  ON user_behavior_sessions (user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS user_page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  behavior_session_id UUID REFERENCES user_behavior_sessions(id) ON DELETE SET NULL,
  client_page_view_id TEXT NOT NULL,
  path TEXT NOT NULL,
  sanitized_url TEXT NOT NULL,
  title TEXT,
  duration_ms INT NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  visible_duration_ms INT NOT NULL DEFAULT 0 CHECK (visible_duration_ms >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_page_views_client_page_present CHECK (length(trim(client_page_view_id)) > 0),
  CONSTRAINT user_page_views_path_present CHECK (length(trim(path)) > 0),
  CONSTRAINT user_page_views_url_present CHECK (length(trim(sanitized_url)) > 0),
  CONSTRAINT user_page_views_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (user_id, client_page_view_id)
);

CREATE INDEX IF NOT EXISTS user_page_views_user_started_idx
  ON user_page_views (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS user_page_views_path_started_idx
  ON user_page_views (path, started_at DESC);

DROP TRIGGER IF EXISTS user_page_views_set_updated_at ON user_page_views;
CREATE TRIGGER user_page_views_set_updated_at
BEFORE UPDATE ON user_page_views
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS user_behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  behavior_session_id UUID REFERENCES user_behavior_sessions(id) ON DELETE SET NULL,
  page_view_id UUID REFERENCES user_page_views(id) ON DELETE SET NULL,
  client_event_id TEXT NOT NULL,
  client_page_view_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'page_view_start',
      'page_view_end',
      'click',
      'ide_session',
      'ide_edit_summary',
      'ide_run',
      'ide_submit',
      'ide_error',
      'repair_success',
      'history_load',
      'ai_error_analysis',
      'whiteboard',
      'hint',
      'solution_video'
    )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level_id TEXT REFERENCES levels(id) ON DELETE SET NULL,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  assessment_attempt_id UUID REFERENCES assessment_attempts(id) ON DELETE SET NULL,
  duration_ms INT CHECK (duration_ms IS NULL OR duration_ms >= 0),
  count INT CHECK (count IS NULL OR count >= 0),
  result TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_behavior_events_client_event_present CHECK (length(trim(client_event_id)) > 0),
  CONSTRAINT user_behavior_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (user_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS user_behavior_events_user_occurred_idx
  ON user_behavior_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS user_behavior_events_type_occurred_idx
  ON user_behavior_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS user_behavior_events_level_occurred_idx
  ON user_behavior_events (level_id, occurred_at DESC)
  WHERE level_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_behavior_events_submission_idx
  ON user_behavior_events (submission_id)
  WHERE submission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS behavior_analysis_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'local'
    CHECK (provider IN ('minimax','local')),
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generated','failed')),
  analysis JSONB NOT NULL,
  markdown TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT behavior_analysis_reports_period_valid CHECK (period_start <= period_end),
  CONSTRAINT behavior_analysis_reports_analysis_object CHECK (
    jsonb_typeof(analysis) = 'object'
    AND jsonb_typeof(analysis->'overview') = 'string'
    AND jsonb_typeof(analysis->'learningRhythm') = 'string'
    AND jsonb_typeof(analysis->'routeFindings') = 'array'
    AND jsonb_typeof(analysis->'ideHabits') = 'array'
    AND jsonb_typeof(analysis->'debuggingPattern') = 'string'
    AND jsonb_typeof(analysis->'repairProgress') = 'string'
    AND jsonb_typeof(analysis->'stuckRisks') = 'array'
    AND jsonb_typeof(analysis->'nextActions') = 'array'
    AND jsonb_typeof(analysis->'confidence') = 'string'
  )
);

CREATE INDEX IF NOT EXISTS behavior_analysis_reports_student_created_idx
  ON behavior_analysis_reports (student_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS behavior_analysis_reports_period_idx
  ON behavior_analysis_reports (period_start, period_end, created_at DESC);
