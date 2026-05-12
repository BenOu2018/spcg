INSERT INTO system_settings (setting_key, setting_value)
VALUES (
  'growth_report',
  jsonb_build_object(
    'enabled', true,
    'triggerMode', 'manual',
    'frequency', 'weekly',
    'periodDays', 7,
    'tokenTtlDays', 30,
    'channels', jsonb_build_array('email', 'sms')
  )
)
ON CONFLICT (setting_key) DO NOTHING;
