ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ui_locale TEXT NOT NULL DEFAULT 'zh-CN';

UPDATE profiles
SET ui_locale = 'zh-CN'
WHERE ui_locale IS NULL OR ui_locale NOT IN ('zh-CN', 'en-US');

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_ui_locale_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_ui_locale_check
    CHECK (ui_locale IN ('zh-CN', 'en-US'));
