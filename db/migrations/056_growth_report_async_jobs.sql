ALTER TABLE growth_reports
  ADD COLUMN IF NOT EXISTS public_token_encrypted JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE growth_reports
  DROP CONSTRAINT IF EXISTS growth_reports_status_check;

ALTER TABLE growth_reports
  ADD CONSTRAINT growth_reports_status_check
    CHECK (status IN ('pending','generated','failed','revoked'));

ALTER TABLE growth_reports
  DROP CONSTRAINT IF EXISTS growth_reports_markdown_present;

ALTER TABLE growth_reports
  ADD CONSTRAINT growth_reports_markdown_present
    CHECK (status <> 'generated' OR length(trim(markdown)) > 0);

UPDATE system_settings
SET setting_value = jsonb_set(setting_value, '{periodDays}', '14'::jsonb, true)
WHERE setting_key = 'growth_report'
  AND COALESCE(setting_value->>'periodDays', '7') = '7';
