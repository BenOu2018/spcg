CREATE TABLE IF NOT EXISTS knowledge_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id TEXT NOT NULL,
  classification TEXT NOT NULL
    CHECK (classification IN ('编程算法','数学')),
  zh_name TEXT NOT NULL,
  en_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  band_or_level TEXT NOT NULL,
  common_problem_types TEXT NOT NULL DEFAULT '',
  recommendation TEXT NOT NULL DEFAULT '',
  source_file TEXT NOT NULL,
  source_section TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_points_tag_id_format CHECK (tag_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT knowledge_points_zh_name_present CHECK (length(trim(zh_name)) > 0),
  CONSTRAINT knowledge_points_en_name_present CHECK (length(trim(en_name)) > 0),
  CONSTRAINT knowledge_points_domain_present CHECK (length(trim(domain)) > 0),
  CONSTRAINT knowledge_points_band_or_level_present CHECK (length(trim(band_or_level)) > 0),
  CONSTRAINT knowledge_points_source_file_present CHECK (length(trim(source_file)) > 0),
  CONSTRAINT knowledge_points_sort_order_positive CHECK (sort_order > 0),
  CONSTRAINT knowledge_points_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT knowledge_points_classification_tag_unique UNIQUE (classification, tag_id)
);

CREATE INDEX IF NOT EXISTS knowledge_points_tag_id_idx
  ON knowledge_points (tag_id);

CREATE INDEX IF NOT EXISTS knowledge_points_classification_idx
  ON knowledge_points (classification, sort_order);

CREATE INDEX IF NOT EXISTS knowledge_points_domain_idx
  ON knowledge_points (domain);

CREATE INDEX IF NOT EXISTS knowledge_points_band_or_level_idx
  ON knowledge_points (band_or_level);

CREATE INDEX IF NOT EXISTS knowledge_points_source_file_idx
  ON knowledge_points (source_file);

DROP TRIGGER IF EXISTS knowledge_points_set_updated_at ON knowledge_points;
CREATE TRIGGER knowledge_points_set_updated_at
BEFORE UPDATE ON knowledge_points
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
