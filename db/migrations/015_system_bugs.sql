CREATE TABLE IF NOT EXISTS system_bugs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  pathname TEXT NOT NULL,
  description TEXT NOT NULL,
  ide_level_id TEXT,
  ide_level_title TEXT,
  ide_language TEXT,
  ide_resolved_language TEXT,
  ide_code TEXT,
  user_agent TEXT,
  viewport JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','triaged','resolved','ignored')),
  admin_note TEXT,
  handled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT system_bugs_url_present CHECK (length(trim(url)) > 0),
  CONSTRAINT system_bugs_pathname_present CHECK (length(trim(pathname)) > 0),
  CONSTRAINT system_bugs_description_length CHECK (
    length(trim(description)) BETWEEN 1 AND 2000
  ),
  CONSTRAINT system_bugs_viewport_object CHECK (jsonb_typeof(viewport) = 'object'),
  CONSTRAINT system_bugs_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS system_bugs_status_created_idx
  ON system_bugs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS system_bugs_user_created_idx
  ON system_bugs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS system_bugs_level_created_idx
  ON system_bugs (ide_level_id, created_at DESC);
