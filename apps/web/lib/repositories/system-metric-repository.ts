import { queryOne } from '@/lib/db'

export type NetworkDailyBaseline = {
  sampleDate: string
  rxBytes: number
  txBytes: number
  interfaceName: string
}

type NetworkDailyBaselineRow = {
  sample_date: Date | string
  rx_bytes: string | number
  tx_bytes: string | number
  interface_name: string
} & Record<string, unknown>

export async function getOrCreateNetworkDailyBaseline(input: {
  sampleDate: string
  rxBytes: number
  txBytes: number
  interfaceName: string
}): Promise<NetworkDailyBaseline | null> {
  const row = await queryOne<NetworkDailyBaselineRow>(
    `
    WITH inserted AS (
      INSERT INTO system_network_daily_baselines
        (sample_date, rx_bytes, tx_bytes, interface_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (sample_date) DO NOTHING
      RETURNING sample_date, rx_bytes, tx_bytes, interface_name
    )
    SELECT sample_date, rx_bytes, tx_bytes, interface_name
    FROM inserted
    UNION ALL
    SELECT sample_date, rx_bytes, tx_bytes, interface_name
    FROM system_network_daily_baselines
    WHERE sample_date = $1
      AND NOT EXISTS (SELECT 1 FROM inserted)
    LIMIT 1
    `,
    [input.sampleDate, Math.max(0, Math.round(input.rxBytes)), Math.max(0, Math.round(input.txBytes)), input.interfaceName],
  )

  return row ? mapNetworkDailyBaselineRow(row) : null
}

export async function replaceNetworkDailyBaseline(input: {
  sampleDate: string
  rxBytes: number
  txBytes: number
  interfaceName: string
}): Promise<NetworkDailyBaseline | null> {
  const row = await queryOne<NetworkDailyBaselineRow>(
    `
    UPDATE system_network_daily_baselines
    SET
      rx_bytes = $2,
      tx_bytes = $3,
      interface_name = $4,
      updated_at = NOW()
    WHERE sample_date = $1
    RETURNING sample_date, rx_bytes, tx_bytes, interface_name
    `,
    [input.sampleDate, Math.max(0, Math.round(input.rxBytes)), Math.max(0, Math.round(input.txBytes)), input.interfaceName],
  )

  return row ? mapNetworkDailyBaselineRow(row) : null
}

function mapNetworkDailyBaselineRow(row: NetworkDailyBaselineRow): NetworkDailyBaseline {
  return {
    sampleDate: row.sample_date instanceof Date ? row.sample_date.toISOString().slice(0, 10) : String(row.sample_date),
    rxBytes: toNumber(row.rx_bytes),
    txBytes: toNumber(row.tx_bytes),
    interfaceName: row.interface_name,
  }
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
