ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS resolved_language TEXT;

UPDATE submissions
SET language = 'cpp14'
WHERE language = 'cpp';

UPDATE submissions
SET resolved_language = 'cpp14'
WHERE resolved_language IS NULL
  AND language IN ('cpp11','cpp14','cpp17','cpp20','cpp23');

UPDATE submissions
SET resolved_language = 'c'
WHERE resolved_language IS NULL
  AND language = 'c';

UPDATE submissions
SET resolved_language = 'python3'
WHERE resolved_language IS NULL
  AND language = 'python3';

UPDATE submissions
SET resolved_language = 'cpp14'
WHERE resolved_language IS NULL
  AND language = 'auto';

ALTER TABLE submissions
  ALTER COLUMN language SET DEFAULT 'auto';

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_language_valid;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_language_valid
  CHECK (language IN ('auto','c','cpp11','cpp14','cpp17','cpp20','cpp23','python3'));

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_resolved_language_valid;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_resolved_language_valid
  CHECK (resolved_language IS NULL OR resolved_language IN ('c','cpp11','cpp14','cpp17','cpp20','cpp23','python3'));
