import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { promisify } from 'node:util'
import { isDatabaseConfigured } from '@/lib/repositories/database-repository'
import {
  getOrCreateNetworkDailyBaseline,
  replaceNetworkDailyBaseline,
  type NetworkDailyBaseline,
} from '@/lib/repositories/system-metric-repository'

const execFileAsync = promisify(execFile)
const NETWORK_SAMPLE_DELAY_MS = 250

export type ServerMetricValue = {
  available: boolean
  value: number | null
  label: string
  detail: string | null
  error?: string
}

export type ServerMetrics = {
  cpu: ServerMetricValue
  memory: ServerMetricValue
  disk: ServerMetricValue
  networkInbound: ServerMetricValue
  networkOutbound: ServerMetricValue
  networkTodayInbound: ServerMetricValue
  networkTodayOutbound: ServerMetricValue
}

type NetworkCounters = {
  interfaceName: string
  rxBytes: number
  txBytes: number
  sampledAt: number
}

export async function getServerMetrics(): Promise<ServerMetrics> {
  const [disk, network] = await Promise.all([getDiskMetric(), getNetworkMetrics()])

  return {
    cpu: getCpuMetric(),
    memory: getMemoryMetric(),
    disk,
    networkInbound: network.inbound,
    networkOutbound: network.outbound,
    networkTodayInbound: network.todayInbound,
    networkTodayOutbound: network.todayOutbound,
  }
}

function getCpuMetric(): ServerMetricValue {
  const coreCount = Math.max(1, os.cpus().length)
  const loadAverage = os.loadavg()[0] ?? 0
  const loadPercent = Math.max(0, Math.round((loadAverage / coreCount) * 100))

  return {
    available: true,
    value: loadPercent,
    label: `${loadPercent}%`,
    detail: `1m load ${loadAverage.toFixed(2)} / ${coreCount} cores`,
  }
}

function getMemoryMetric(): ServerMetricValue {
  const total = os.totalmem()
  const free = os.freemem()
  const used = Math.max(0, total - free)
  const percent = total > 0 ? Math.round((used / total) * 100) : 0

  return {
    available: total > 0,
    value: percent,
    label: `${percent}%`,
    detail: `${formatBytes(used)} / ${formatBytes(total)}`,
  }
}

async function getDiskMetric(): Promise<ServerMetricValue> {
  const diskPath = process.env.SERVER_METRICS_DISK_PATH || '/'

  try {
    const { stdout } = await execFileAsync('df', ['-kP', diskPath], { timeout: 2000 })
    const line = stdout
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)[1]
    if (!line) throw new Error('df output is empty')

    const parts = line.split(/\s+/)
    const totalKb = Number(parts[1])
    const usedKb = Number(parts[2])
    const percentText = parts[4] ?? ''
    const percent = Number.parseInt(percentText.replace('%', ''), 10)
    if (!Number.isFinite(totalKb) || !Number.isFinite(usedKb) || !Number.isFinite(percent)) {
      throw new Error('df output is not parseable')
    }

    return {
      available: true,
      value: percent,
      label: `${percent}%`,
      detail: `${formatBytes(usedKb * 1024)} / ${formatBytes(totalKb * 1024)}`,
    }
  } catch (error) {
    return unavailableMetric('disk unavailable', error)
  }
}

async function getNetworkMetrics(): Promise<{
  inbound: ServerMetricValue
  outbound: ServerMetricValue
  todayInbound: ServerMetricValue
  todayOutbound: ServerMetricValue
}> {
  try {
    const first = await readNetworkCounters()
    await delay(NETWORK_SAMPLE_DELAY_MS)
    const second = await readNetworkCounters()
    const elapsedSeconds = Math.max(0.001, (second.sampledAt - first.sampledAt) / 1000)
    const rxBytesPerSecond = Math.max(0, (second.rxBytes - first.rxBytes) / elapsedSeconds)
    const txBytesPerSecond = Math.max(0, (second.txBytes - first.txBytes) / elapsedSeconds)
    const baseline = await readNetworkBaseline(second)
    const todayRxBytes = baseline ? Math.max(0, second.rxBytes - baseline.rxBytes) : null
    const todayTxBytes = baseline ? Math.max(0, second.txBytes - baseline.txBytes) : null

    return {
      inbound: {
        available: true,
        value: rxBytesPerSecond,
        label: `${formatBitsPerSecond(rxBytesPerSecond)}`,
        detail: second.interfaceName,
      },
      outbound: {
        available: true,
        value: txBytesPerSecond,
        label: `${formatBitsPerSecond(txBytesPerSecond)}`,
        detail: second.interfaceName,
      },
      todayInbound:
        todayRxBytes === null
          ? unavailableMetric('daily baseline unavailable')
          : {
              available: true,
              value: todayRxBytes,
              label: formatBytes(todayRxBytes),
              detail: 'today',
            },
      todayOutbound:
        todayTxBytes === null
          ? unavailableMetric('daily baseline unavailable')
          : {
              available: true,
              value: todayTxBytes,
              label: formatBytes(todayTxBytes),
              detail: 'today',
            },
    }
  } catch (error) {
    const unavailable = unavailableMetric('network unavailable', error)
    return {
      inbound: unavailable,
      outbound: unavailable,
      todayInbound: unavailable,
      todayOutbound: unavailable,
    }
  }
}

async function readNetworkBaseline(sample: NetworkCounters): Promise<NetworkDailyBaseline | null> {
  if (!isDatabaseConfigured()) return null

  try {
    const sampleDate = new Date().toISOString().slice(0, 10)
    const baseline = await getOrCreateNetworkDailyBaseline({
      sampleDate,
      rxBytes: sample.rxBytes,
      txBytes: sample.txBytes,
      interfaceName: sample.interfaceName,
    })

    if (!baseline) return null
    if (sample.rxBytes >= baseline.rxBytes && sample.txBytes >= baseline.txBytes) return baseline

    return await replaceNetworkDailyBaseline({
      sampleDate,
      rxBytes: sample.rxBytes,
      txBytes: sample.txBytes,
      interfaceName: sample.interfaceName,
    })
  } catch {
    return null
  }
}

async function readNetworkCounters(): Promise<NetworkCounters> {
  const configuredInterface = process.env.SERVER_NETWORK_INTERFACE || process.env.SPCG_NETWORK_INTERFACE || ''
  const text = await readFile('/proc/net/dev', 'utf8')
  const counters = text
    .split('\n')
    .slice(2)
    .map(parseNetworkLine)
    .filter((item): item is NetworkCounters => Boolean(item))
    .filter((item) => (configuredInterface ? item.interfaceName === configuredInterface : isPrimaryNetworkInterface(item.interfaceName)))

  if (configuredInterface && counters.length === 0) {
    throw new Error(`Network interface ${configuredInterface} was not found`)
  }
  if (counters.length === 0) {
    throw new Error('No primary network interface was found')
  }

  const sampledAt = Date.now()
  const totals = counters.reduce(
    (total, item) => ({
      rxBytes: total.rxBytes + item.rxBytes,
      txBytes: total.txBytes + item.txBytes,
    }),
    { rxBytes: 0, txBytes: 0 },
  )

  return {
    interfaceName: configuredInterface || counters.map((item) => item.interfaceName).join('+'),
    rxBytes: totals.rxBytes,
    txBytes: totals.txBytes,
    sampledAt,
  }
}

function parseNetworkLine(line: string): NetworkCounters | null {
  const [interfacePart, dataPart] = line.split(':')
  if (!interfacePart || !dataPart) return null
  const fields = dataPart.trim().split(/\s+/).map(Number)
  const rxBytes = Number(fields[0])
  const txBytes = Number(fields[8])
  if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) return null
  return {
    interfaceName: interfacePart.trim(),
    rxBytes,
    txBytes,
    sampledAt: Date.now(),
  }
}

function isPrimaryNetworkInterface(name: string): boolean {
  return !(
    name === 'lo' ||
    name.startsWith('docker') ||
    name.startsWith('br-') ||
    name.startsWith('veth') ||
    name.startsWith('virbr') ||
    name.startsWith('tun') ||
    name.startsWith('tap')
  )
}

function unavailableMetric(label: string, error?: unknown): ServerMetricValue {
  return {
    available: false,
    value: null,
    label: '-',
    detail: label,
    error: error instanceof Error ? error.message : undefined,
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function formatBitsPerSecond(bytesPerSecond: number): string {
  const bitsPerSecond = Math.max(0, bytesPerSecond * 8)
  if (bitsPerSecond < 1000) return `${Math.round(bitsPerSecond)} bps`
  if (bitsPerSecond < 1000 * 1000) return `${(bitsPerSecond / 1000).toFixed(1)} Kbps`
  if (bitsPerSecond < 1000 * 1000 * 1000) return `${(bitsPerSecond / 1000 / 1000).toFixed(1)} Mbps`
  return `${(bitsPerSecond / 1000 / 1000 / 1000).toFixed(1)} Gbps`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
