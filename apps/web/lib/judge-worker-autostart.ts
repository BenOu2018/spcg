import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

let persistentWorker: ReturnType<typeof spawn> | null = null

export function wakeJudgeWorker(options: { drain?: boolean } = {}) {
  if (process.env.JUDGE_WORKER_AUTOSTART === 'false') return
  if (!process.env.DATABASE_URL || !process.env.JUDGE0_BASE_URL) return

  const mode = process.env.JUDGE_WORKER_AUTOSTART_MODE ?? 'once'
  if (mode === 'persistent' && !options.drain) {
    if (persistentWorker) return
    persistentWorker = spawnJudgeWorker([])
    persistentWorker.on('exit', () => {
      persistentWorker = null
    })
    persistentWorker.on('error', () => {
      persistentWorker = null
    })
    return
  }

  const workerArgs = options.drain ? ['--drain'] : ['--once']
  spawnJudgeWorker(workerArgs)
}

function spawnJudgeWorker(workerArgs: string[]) {
  const child = spawn('npm', ['run', 'judge:worker', '--', ...workerArgs], {
    cwd: resolveWorkspaceRoot(),
    detached: true,
    env: {
      ...process.env,
      JUDGE_WORKER_AUTOSTART: 'false',
    },
    stdio: 'ignore',
  })

  child.unref()
  return child
}

function resolveWorkspaceRoot(): string {
  let current = process.cwd()

  while (true) {
    if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'scripts', 'judge-worker.ts'))) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) return process.cwd()
    current = parent
  }
}
