ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT;

DO $$
DECLARE
  user_record RECORD;
  base_username TEXT;
  candidate_username TEXT;
  suffix INT;
BEGIN
  FOR user_record IN
    SELECT id, email
    FROM users
    WHERE username IS NULL OR length(trim(username)) = 0
    ORDER BY created_at ASC, id ASC
  LOOP
    base_username := lower(split_part(COALESCE(user_record.email, ''), '@', 1));
    base_username := regexp_replace(base_username, '[^a-z0-9_-]+', '-', 'g');
    base_username := regexp_replace(base_username, '(^-+|-+$)', '', 'g');
    base_username := substring(base_username from 1 for 24);

    IF length(base_username) < 3 THEN
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
      candidate_username := substring(base_username from 1 for GREATEST(3, 24 - length(('-' || suffix)::text))) || '-' || suffix;
    END LOOP;

    UPDATE users
    SET username = candidate_username
    WHERE id = user_record.id;
  END LOOP;
END $$;

ALTER TABLE users
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_username_present,
  DROP CONSTRAINT IF EXISTS users_username_length;

ALTER TABLE users
  ADD CONSTRAINT users_username_present CHECK (length(trim(username)) > 0),
  ADD CONSTRAINT users_username_length CHECK (char_length(username) BETWEEN 3 AND 24);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx
  ON users (lower(username));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_verified_phone_unique_idx
  ON profiles (phone_number)
  WHERE phone_number IS NOT NULL AND phone_verified_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS phone_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT phone_verification_codes_phone_present CHECK (length(trim(phone_number)) >= 8),
  CONSTRAINT phone_verification_codes_hash_present CHECK (length(trim(code_hash)) > 0),
  CONSTRAINT phone_verification_codes_attempt_count CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS phone_verification_codes_user_created_idx
  ON phone_verification_codes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS phone_verification_codes_active_idx
  ON phone_verification_codes (user_id, phone_number, expires_at DESC)
  WHERE consumed_at IS NULL;
