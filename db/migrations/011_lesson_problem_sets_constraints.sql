ALTER TABLE problem_sets
  DROP CONSTRAINT IF EXISTS problem_sets_lesson_fields;

ALTER TABLE problem_sets
  ADD CONSTRAINT problem_sets_lesson_fields
  CHECK (
    (
      type <> 'lesson'
      AND track IS NULL
    )
    OR (
      type = 'lesson'
      AND spcg_level IS NOT NULL
      AND spcg_level BETWEEN 1 AND 10
      AND stage_no IS NOT NULL
      AND stage_no > 0
      AND track IS NOT NULL
      AND track IN ('A','B')
      AND lesson_focus IS NOT NULL
      AND length(trim(lesson_focus)) > 0
    )
  );
