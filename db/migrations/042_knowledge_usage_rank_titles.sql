CREATE TABLE IF NOT EXISTS user_knowledge_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  assessment_attempt_id UUID REFERENCES assessment_attempts(id) ON DELETE SET NULL,
  classification TEXT NOT NULL DEFAULT '编程算法'
    CHECK (classification IN ('编程算法','数学')),
  tag_id TEXT NOT NULL,
  zh_name TEXT NOT NULL,
  en_name TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT 'algorithm',
  band_or_level TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'first_ac'
    CHECK (source IN ('first_ac','migration')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_knowledge_usage_events_tag_id_present CHECK (length(trim(tag_id)) > 0),
  CONSTRAINT user_knowledge_usage_events_zh_name_present CHECK (length(trim(zh_name)) > 0),
  CONSTRAINT user_knowledge_usage_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS user_knowledge_usage_events_once_idx
  ON user_knowledge_usage_events (user_id, level_id, classification, tag_id);

CREATE INDEX IF NOT EXISTS user_knowledge_usage_events_user_used_idx
  ON user_knowledge_usage_events (user_id, used_at DESC);

CREATE TABLE IF NOT EXISTS user_knowledge_usage (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classification TEXT NOT NULL DEFAULT '编程算法'
    CHECK (classification IN ('编程算法','数学')),
  tag_id TEXT NOT NULL,
  zh_name TEXT NOT NULL,
  en_name TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT 'algorithm',
  band_or_level TEXT NOT NULL DEFAULT '',
  usage_count INT NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  passed_level_count INT NOT NULL DEFAULT 0 CHECK (passed_level_count >= 0),
  first_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, classification, tag_id),
  CONSTRAINT user_knowledge_usage_tag_id_present CHECK (length(trim(tag_id)) > 0),
  CONSTRAINT user_knowledge_usage_zh_name_present CHECK (length(trim(zh_name)) > 0)
);

CREATE INDEX IF NOT EXISTS user_knowledge_usage_user_last_idx
  ON user_knowledge_usage (user_id, last_used_at DESC);

DROP TRIGGER IF EXISTS user_knowledge_usage_set_updated_at ON user_knowledge_usage;
CREATE TRIGGER user_knowledge_usage_set_updated_at
BEFORE UPDATE ON user_knowledge_usage
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_title_records
  DROP CONSTRAINT IF EXISTS user_title_records_source_check;

ALTER TABLE user_title_records
  DROP CONSTRAINT IF EXISTS user_title_records_source_ref_level;

ALTER TABLE user_title_records
  ALTER COLUMN level_id DROP NOT NULL;

ALTER TABLE user_title_records
  ADD CONSTRAINT user_title_records_source_check
  CHECK (source IN ('level_first_ac','rank_reached'));

ALTER TABLE user_title_records
  ADD CONSTRAINT user_title_records_source_ref_valid
  CHECK (
    (
      source = 'level_first_ac'
      AND level_id IS NOT NULL
      AND source_ref = level_id
    )
    OR (
      source = 'rank_reached'
      AND source_ref = rank_at_award
    )
  );

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, rank_at_award
      ORDER BY awarded_at ASC, created_at ASC, id ASC
    ) AS row_no
  FROM user_title_records
)
DELETE FROM user_title_records records
USING ranked
WHERE records.id = ranked.id
  AND ranked.row_no > 1;

CREATE UNIQUE INDEX IF NOT EXISTS user_title_records_user_rank_once_idx
  ON user_title_records (user_id, rank_at_award);

WITH snapshot_events AS (
  SELECT DISTINCT
    p.user_id,
    p.level_id,
    NULL::uuid AS submission_id,
    NULL::uuid AS assessment_attempt_id,
    snapshot.value->>'classification' AS classification,
    snapshot.value->>'tagId' AS tag_id,
    snapshot.value->>'zhName' AS zh_name,
    COALESCE(snapshot.value->>'enName', '') AS en_name,
    COALESCE(snapshot.value->>'domain', 'algorithm') AS domain,
    COALESCE(snapshot.value->>'bandOrLevel', '') AS band_or_level,
    jsonb_build_object('backfilledFrom', 'progress') AS metadata,
    COALESCE(p.last_submitted_at, p.updated_at, NOW()) AS used_at
  FROM progress p
  JOIN levels l ON l.id = p.level_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(l.import_meta->'knowledgePointSnapshots') = 'array'
      THEN l.import_meta->'knowledgePointSnapshots'
      ELSE '[]'::jsonb
    END
  ) AS snapshot(value)
  WHERE p.passed = TRUE
    AND snapshot.value->>'classification' = '编程算法'
    AND length(trim(COALESCE(snapshot.value->>'tagId', ''))) > 0
    AND length(trim(COALESCE(snapshot.value->>'zhName', ''))) > 0
)
INSERT INTO user_knowledge_usage_events (
  user_id,
  level_id,
  submission_id,
  assessment_attempt_id,
  classification,
  tag_id,
  zh_name,
  en_name,
  domain,
  band_or_level,
  source,
  metadata,
  used_at
)
SELECT
  user_id,
  level_id,
  submission_id,
  assessment_attempt_id,
  classification,
  tag_id,
  zh_name,
  en_name,
  domain,
  band_or_level,
  'migration',
  metadata,
  used_at
FROM snapshot_events
ON CONFLICT (user_id, level_id, classification, tag_id) DO NOTHING;

INSERT INTO user_knowledge_usage (
  user_id,
  classification,
  tag_id,
  zh_name,
  en_name,
  domain,
  band_or_level,
  usage_count,
  passed_level_count,
  first_used_at,
  last_used_at
)
SELECT
  user_id,
  classification,
  tag_id,
  (ARRAY_AGG(zh_name ORDER BY used_at DESC))[1],
  (ARRAY_AGG(en_name ORDER BY used_at DESC))[1],
  (ARRAY_AGG(domain ORDER BY used_at DESC))[1],
  (ARRAY_AGG(band_or_level ORDER BY used_at DESC))[1],
  COUNT(*)::int,
  COUNT(DISTINCT level_id)::int,
  MIN(used_at),
  MAX(used_at)
FROM user_knowledge_usage_events
GROUP BY user_id, classification, tag_id
ON CONFLICT (user_id, classification, tag_id)
DO UPDATE SET
  zh_name = EXCLUDED.zh_name,
  en_name = EXCLUDED.en_name,
  domain = EXCLUDED.domain,
  band_or_level = EXCLUDED.band_or_level,
  usage_count = EXCLUDED.usage_count,
  passed_level_count = EXCLUDED.passed_level_count,
  first_used_at = EXCLUDED.first_used_at,
  last_used_at = EXCLUDED.last_used_at,
  updated_at = NOW();
