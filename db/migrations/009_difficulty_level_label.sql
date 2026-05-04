UPDATE levels
SET difficulty = jsonb_set(
  difficulty,
  '{levelLabel}',
  to_jsonb(('SPCG ' || (difficulty->>'spcgLevel') || '级')::text),
  TRUE
)
WHERE jsonb_typeof(difficulty) = 'object'
  AND (difficulty->>'spcgLevel') ~ '^[0-9]+$'
  AND (
    NOT difficulty ? 'levelLabel'
    OR difficulty->>'levelLabel' <> ('SPCG ' || (difficulty->>'spcgLevel') || '级')
  );

ALTER TABLE levels DROP CONSTRAINT IF EXISTS levels_difficulty_object;

ALTER TABLE levels
  ADD CONSTRAINT levels_difficulty_object CHECK (
    jsonb_typeof(difficulty) = 'object'
    AND (difficulty->>'spcgLevel') IS NOT NULL
    AND (difficulty->>'levelLabel') IS NOT NULL
    AND (difficulty->>'stars') IS NOT NULL
    AND (difficulty->>'label') IS NOT NULL
    AND difficulty ? 'lglevel'
    AND jsonb_typeof(difficulty->'spcgLevel') = 'number'
    AND jsonb_typeof(difficulty->'levelLabel') = 'string'
    AND jsonb_typeof(difficulty->'stars') = 'number'
    AND jsonb_typeof(difficulty->'label') = 'string'
    AND (
      difficulty->'lglevel' = 'null'::jsonb
      OR jsonb_typeof(difficulty->'lglevel') = 'string'
    )
    AND CASE
      WHEN (difficulty->>'spcgLevel') ~ '^[0-9]+$'
      THEN (difficulty->>'spcgLevel')::int BETWEEN 1 AND 10
      ELSE FALSE
    END
    AND difficulty->>'levelLabel' = ('SPCG ' || (difficulty->>'spcgLevel') || '级')
    AND (difficulty->>'stars') ~ '^[1-5]$'
    AND difficulty->>'label' IN ('入门','基础','提高','挑战','综合')
  );
