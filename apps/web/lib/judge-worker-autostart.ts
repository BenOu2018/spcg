import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function wakeJudgeWorker() {
  if (process.env.JUDGE_WORKER_AUTOSTART === 'false') return
  if (!process.env.DATABASE_URL || !process.env.JUDGE0_BASE_URL) return

  const child = spawn('npm', ['run', 'judge:worker', '--', '--once'], {
    cwd: resolveWorkspaceRoot(),
    detached: true,
    env: {
      ...process.env,
      JUDGE_WORKER_AUTOSTART: 'false',
    },
    stdio: 'ignore',
  })

  child.unref()
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
