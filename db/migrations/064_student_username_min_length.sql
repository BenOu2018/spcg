ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_username_length;

ALTER TABLE users
  ADD CONSTRAINT users_username_length CHECK (char_length(username) BETWEEN 2 AND 24);
