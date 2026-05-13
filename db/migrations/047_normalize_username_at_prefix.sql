DO $$
DECLARE
  user_record RECORD;
  base_username TEXT;
  candidate_username TEXT;
  suffix INT;
  suffix_text TEXT;
BEGIN
  FOR user_record IN
    SELECT id, username
    FROM users
    WHERE username LIKE '@%'
    ORDER BY created_at ASC, id ASC
  LOOP
    base_username := lower(regexp_replace(btrim(user_record.username), '^@+', ''));
    base_username := substring(base_username from 1 for 24);

    IF char_length(base_username) < 3 THEN
      base_username := 'user-' || replace(substring(user_record.id::text from 1 for 8), '-', '');
    END IF;

    candidate_username := base_username;
    suffix := 1;

    WHILE EXISTS (
      SELECT 1
      FROM users
      WHERE lower(username) = lower(candidate_username)
        AND id <> user_record.id
    ) LOOP
      suffix := suffix + 1;
      suffix_text := '-' || suffix::text;
      candidate_username := substring(base_username from 1 for GREATEST(3, 24 - char_length(suffix_text))) || suffix_text;
    END LOOP;

    UPDATE users
    SET username = candidate_username
    WHERE id = user_record.id;
  END LOOP;
END $$;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_username_no_at_prefix;

ALTER TABLE users
  ADD CONSTRAINT users_username_no_at_prefix CHECK (username !~ '^@+');
