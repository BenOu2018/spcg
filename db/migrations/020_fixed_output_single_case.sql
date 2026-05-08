ALTER TABLE levels
  DROP CONSTRAINT IF EXISTS levels_test_cases_count;

ALTER TABLE levels
  ADD CONSTRAINT levels_test_cases_count CHECK (
    jsonb_typeof(test_cases) = 'array'
    AND (
      jsonb_array_length(test_cases) = 20
      OR (
        jsonb_array_length(test_cases) = 1
        AND import_meta->'testCasePolicy'->>'mode' = 'fixed-output-single-case'
      )
    )
  );
