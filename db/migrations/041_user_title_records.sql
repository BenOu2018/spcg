CREATE TABLE IF NOT EXISTS user_title_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_key TEXT NOT NULL,
  title_label TEXT NOT NULL,
  rank_at_award TEXT NOT NULL
    CHECK (
      rank_at_award IN (
        'scrap_iron',
        'bronze',
        'silver',
        'gold',
        'platinum',
        'diamond',
        'stellar',
        'king',
        'master',
        'grandmaster',
        'legend',
        'server'
      )
    ),
  pool_key TEXT NOT NULL
    CHECK (
      pool_key IN (
        'scrap_iron',
        'bronze',
        'silver',
        'gold',
        'platinum',
        'diamond',
        'stellar',
        'king',
        'master',
        'grandmaster'
      )
    ),
  source TEXT NOT NULL DEFAULT 'level_first_ac'
    CHECK (source IN ('level_first_ac')),
  source_ref TEXT NOT NULL,
  level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_title_records_title_key_present CHECK (length(trim(title_key)) > 0),
  CONSTRAINT user_title_records_title_label_present CHECK (length(trim(title_label)) > 0),
  CONSTRAINT user_title_records_source_ref_present CHECK (length(trim(source_ref)) > 0),
  CONSTRAINT user_title_records_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT user_title_records_source_ref_level CHECK (source_ref = level_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_title_records_once_idx
  ON user_title_records (user_id, source, source_ref);

CREATE INDEX IF NOT EXISTS user_title_records_user_awarded_idx
  ON user_title_records (user_id, awarded_at DESC);

CREATE INDEX IF NOT EXISTS user_title_records_user_pool_idx
  ON user_title_records (user_id, pool_key);

DROP TRIGGER IF EXISTS user_title_records_set_updated_at ON user_title_records;
CREATE TRIGGER user_title_records_set_updated_at
BEFORE UPDATE ON user_title_records
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
