ALTER TABLE levels
  DROP CONSTRAINT IF EXISTS levels_difficulty_object;

DO $$
DECLARE
  legacy_level_key TEXT := 'ge' || 'spLevel';
BEGIN
  UPDATE levels
  SET difficulty = jsonb_set(difficulty - legacy_level_key, '{spcgLevel}', difficulty->legacy_level_key)
  WHERE difficulty ? legacy_level_key
    AND NOT difficulty ? 'spcgLevel';
END;
$$;

ALTER TABLE levels
  ADD CONSTRAINT levels_difficulty_object CHECK (
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
  );
