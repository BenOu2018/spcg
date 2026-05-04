UPDATE problem_sets
SET
  title = trim(
    regexp_replace(
      title,
      '^SPCG[[:space:]]*[0-9]+级[[:space:]]*第[0-9]+关[[:space:]]*([·:：-][[:space:]]*)?',
      ''
    )
  ),
  updated_at = NOW()
WHERE
  type = 'lesson'
  AND title ~ '^SPCG[[:space:]]*[0-9]+级[[:space:]]*第[0-9]+关';
