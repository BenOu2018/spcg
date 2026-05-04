ALTER TABLE levels
  ADD COLUMN IF NOT EXISTS sister_problem JSONB;

ALTER TABLE levels
  DROP CONSTRAINT IF EXISTS levels_sister_problem_object;

ALTER TABLE levels
  ADD CONSTRAINT levels_sister_problem_object CHECK (
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
  );

DROP VIEW IF EXISTS levels_public;

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

GRANT SELECT ON levels_public TO anon, authenticated;
