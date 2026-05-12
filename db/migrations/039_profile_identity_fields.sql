ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS real_name TEXT,
  ADD COLUMN IF NOT EXISTS id_card_number TEXT,
  ADD COLUMN IF NOT EXISTS id_card_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_real_name
  ON profiles (real_name)
  WHERE real_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_id_card_number_unique_idx
  ON profiles (id_card_number)
  WHERE id_card_number IS NOT NULL AND length(trim(id_card_number)) > 0;
