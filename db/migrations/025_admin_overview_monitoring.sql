CREATE TABLE IF NOT EXISTS system_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL DEFAULT 'error'
    CHECK (level IN ('debug','info','warn','error','fatal')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  path TEXT,
  method TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT system_error_logs_source_present CHECK (length(trim(source)) > 0),
  CONSTRAINT system_error_logs_message_present CHECK (length(trim(message)) > 0),
  CONSTRAINT system_error_logs_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS system_error_logs_created_idx
  ON system_error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS system_error_logs_level_created_idx
  ON system_error_logs (level, created_at DESC);

CREATE INDEX IF NOT EXISTS system_error_logs_source_created_idx
  ON system_error_logs (source, created_at DESC);

CREATE TABLE IF NOT EXISTS system_network_daily_baselines (
  sample_date DATE PRIMARY KEY,
  rx_bytes BIGINT NOT NULL CHECK (rx_bytes >= 0),
  tx_bytes BIGINT NOT NULL CHECK (tx_bytes >= 0),
  interface_name TEXT NOT NULL DEFAULT 'aggregate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS system_network_daily_baselines_set_updated_at ON system_network_daily_baselines;
CREATE TRIGGER system_network_daily_baselines_set_updated_at
BEFORE UPDATE ON system_network_daily_baselines
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
