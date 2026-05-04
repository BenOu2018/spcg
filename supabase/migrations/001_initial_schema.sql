CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  age INT,
  parent_email TEXT,
  parent_consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE levels (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  "order" INT NOT NULL,
  title TEXT NOT NULL,
  knowledge_point TEXT NOT NULL,
  difficulty JSONB NOT NULL,
  description TEXT NOT NULL,
  statement_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_format TEXT NOT NULL,
  output_format TEXT NOT NULL,
  test_cases JSONB NOT NULL,
  hints JSONB NOT NULL,
  solution JSONB NOT NULL,
  official_code TEXT NOT NULL,
  solution_video_url TEXT,
  time_limit_ms INT NOT NULL DEFAULT 1000,
  memory_limit_mb INT NOT NULL DEFAULT 64,
  starter_code TEXT NOT NULL,
  source JSONB NOT NULL DEFAULT '{}'::jsonb,
  sister_problem JSONB,
  import_meta JSONB NOT NULL DEFAULT '{}'::jsonb,

  guardian_id TEXT,
  story TEXT,
  pass_out_problem_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT levels_test_cases_count CHECK (
    jsonb_typeof(test_cases) = 'array'
    AND jsonb_array_length(test_cases) = 20
  ),
  CONSTRAINT levels_hints_count CHECK (
    jsonb_typeof(hints) = 'array'
    AND jsonb_array_length(hints) = 3
  ),
  CONSTRAINT levels_difficulty_object CHECK (
    jsonb_typeof(difficulty) = 'object'
    AND (difficulty->>'spcgLevel') IS NOT NULL
    AND (difficulty->>'stars') IS NOT NULL
    AND (difficulty->>'label') IS NOT NULL
    AND difficulty ? 'lglevel'
    AND jsonb_typeof(difficulty->'spcgLevel') = 'number'
    AND jsonb_typeof(difficulty->'stars') = 'number'
    AND jsonb_typeof(difficulty->'label') = 'string'
    AND (
      difficulty->'lglevel' = 'null'::jsonb
      OR jsonb_typeof(difficulty->'lglevel') = 'string'
    )
    AND CASE
      WHEN (difficulty->>'spcgLevel') ~ '^[0-9]+$'
      THEN (difficulty->>'spcgLevel')::int >= 1
      ELSE FALSE
    END
    AND (difficulty->>'stars') ~ '^[1-5]$'
    AND difficulty->>'label' IN ('入门','基础','提高','挑战','综合')
  ),
  CONSTRAINT levels_statement_assets_array CHECK (
    jsonb_typeof(statement_assets) = 'array'
  ),
  CONSTRAINT levels_sister_problem_object CHECK (
    sister_problem IS NULL
    OR (
      jsonb_typeof(sister_problem) = 'object'
      AND sister_problem ? 'levelId'
      AND sister_problem ? 'title'
      AND sister_problem ? 'relation'
      AND sister_problem ? 'note'
      AND jsonb_typeof(sister_problem->'levelId') = 'string'
      AND jsonb_typeof(sister_problem->'title') = 'string'
      AND jsonb_typeof(sister_problem->'relation') = 'string'
      AND (
        sister_problem->'note' = 'null'::jsonb
        OR jsonb_typeof(sister_problem->'note') = 'string'
      )
      AND length(trim(sister_problem->>'levelId')) > 0
      AND length(trim(sister_problem->>'title')) > 0
      AND sister_problem->>'relation' IN ('same-pattern','same-knowledge','review')
    )
  ),
  CONSTRAINT levels_official_code_present CHECK (length(trim(official_code)) > 0)
);

CREATE INDEX levels_chapter_order_idx ON levels (chapter_id, "order");

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER levels_set_updated_at
BEFORE UPDATE ON levels
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id),
  code TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'cpp',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','judging','done','error')),
  verdict JSONB,
  is_pass_out BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX submissions_user_level_idx
  ON submissions (user_id, level_id, created_at DESC);

CREATE INDEX submissions_status_created_idx
  ON submissions (status, created_at DESC);

CREATE TRIGGER submissions_set_updated_at
BEFORE UPDATE ON submissions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES levels(id),
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INT NOT NULL DEFAULT 0,
  best_runtime_ms INT,
  last_submitted_at TIMESTAMPTZ,
  passed_out BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, level_id)
);

CREATE TRIGGER progress_set_updated_at
BEFORE UPDATE ON progress
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE VIEW levels_public AS
SELECT
  l.id,
  l.chapter_id,
  l."order",
  l.title,
  l.knowledge_point,
  l.difficulty,
  l.sister_problem,
  l.description,
  l.statement_assets,
  l.input_format,
  l.output_format,
  COALESCE(public_cases.value, '[]'::jsonb) AS public_cases,
  COALESCE(hidden_cases.hidden_count, 0) AS hidden_count,
  l.hints,
  EXISTS (
    SELECT 1
    FROM progress p
    WHERE p.user_id = auth.uid()
      AND p.level_id = l.id
      AND p.passed = TRUE
  ) AS solution_unlocked,
  l.time_limit_ms,
  l.memory_limit_mb,
  l.starter_code,
  l.source,
  l.guardian_id,
  l.story,
  l.pass_out_problem_id
FROM levels l
LEFT JOIN LATERAL (
  SELECT jsonb_agg(tc.elem ORDER BY tc.ord) AS value
  FROM jsonb_array_elements(l.test_cases) WITH ORDINALITY AS tc(elem, ord)
  WHERE tc.elem->>'visibility' = 'public'
) public_cases ON TRUE
LEFT JOIN LATERAL (
  SELECT count(*)::int AS hidden_count
  FROM jsonb_array_elements(l.test_cases) AS tc(elem)
  WHERE tc.elem->>'visibility' = 'hidden'
) hidden_cases ON TRUE;

CREATE OR REPLACE FUNCTION get_level_unlockables(p_level_id TEXT)
RETURNS TABLE (
  level_id TEXT,
  solution JSONB,
  official_code TEXT,
  solution_video_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT l.id, l.solution, l.official_code, l.solution_video_url
  FROM levels l
  JOIN progress p
    ON p.level_id = l.id
   AND p.user_id = auth.uid()
   AND p.passed = TRUE
  WHERE l.id = p_level_id;
END;
$$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self" ON profiles
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE levels ENABLE ROW LEVEL SECURITY;

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submissions self select" ON submissions
  FOR SELECT
  USING (user_id = auth.uid());

ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress self select" ON progress
  FOR SELECT
  USING (user_id = auth.uid());

GRANT SELECT ON levels_public TO anon, authenticated;
REVOKE ALL ON FUNCTION get_level_unlockables(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_level_unlockables(TEXT) TO authenticated;

ALTER TABLE submissions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE submissions;
