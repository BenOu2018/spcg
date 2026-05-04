import os from 'node:os'

const privateNetworkDevOrigins = [
  '10.*.*.*',
  '192.168.*.*',
  '169.254.*.*',
  '*.local',
  ...Array.from({ length: 16 }, (_, index) => `172.${16 + index}.*.*`),
  ...Array.from({ length: 64 }, (_, index) => `100.${64 + index}.*.*`),
]
const lanDevOrigins = uniqueDevHosts([...privateNetworkDevOrigins, ...readConfiguredDevHosts(), ...readLocalIPv4Hosts()])

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['localhost', '127.0.0.1', '0.0.0.0', ...lanDevOrigins],
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
}

export default nextConfig

function readConfiguredDevHosts() {
  return [process.env.SPCG_LAN_HOST, process.env.SPCG_LAN_HOSTS]
    .flatMap((value) => String(value ?? '').split(/[\s,]+/))
    .map(normalizeDevHost)
    .filter(Boolean)
}

function readLocalIPv4Hosts() {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)
}

function normalizeDevHost(value) {
  if (!value) return ''
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '').split(':')[0] || ''
}

function uniqueDevHosts(values) {
  return Array.from(new Set(values.filter(Boolean)))
}
