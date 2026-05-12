ALTER TABLE levels
  ADD COLUMN IF NOT EXISTS algorithm_graphs JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'levels_algorithm_graphs_array'
  ) THEN
    ALTER TABLE levels
      ADD CONSTRAINT levels_algorithm_graphs_array CHECK (jsonb_typeof(algorithm_graphs) = 'array');
  END IF;
END $$;

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
  l.algorithm_graphs,
  l.input_format,
  l.output_format,
  COALESCE(public_cases.value, '[]'::jsonb) AS public_cases,
  COALESCE(hidden_cases.hidden_count, 0) AS hidden_count,
  l.hints,
  FALSE AS solution_unlocked,
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
) hidden_cases ON TRUE
WHERE l.status = 'published';
