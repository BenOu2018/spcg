WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY submission_id, provider
      ORDER BY created_at DESC, id DESC
    ) AS row_no
  FROM submission_error_analyses
)
DELETE FROM submission_error_analyses sea
USING ranked r
WHERE sea.id = r.id
  AND r.row_no > 1;

CREATE UNIQUE INDEX IF NOT EXISTS submission_error_analyses_once_idx
  ON submission_error_analyses (submission_id, provider);
