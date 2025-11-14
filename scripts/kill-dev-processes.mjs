#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const DEFAULT_PATTERNS = [
  '[n]pm run watch',
  '[j]ust watch-blocks',
  '[b]lock-dev-server',
  '[c]ode-insiders'
]

function readPidFiles(pidDir) {
  const entries = fs.existsSync(pidDir) ? fs.readdirSync(pidDir) : []
  const results = []
  for (const entry of entries) {
    if (!entry.endsWith('.pid')) continue
    const full = path.join(pidDir, entry)
    try {
      const pid = Number.parseInt(fs.readFileSync(full, 'utf8').trim(), 10)
      if (Number.isFinite(pid)) {
        results.push({ pid, file: full })
      }
    } catch {
      // ignore malformed files
    }
  }
  return results
}

function processExists(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function terminatePid(pid) {
  try { process.kill(pid, 'SIGTERM') } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (processExists(pid)) {
    try { process.kill(pid, 'SIGKILL') } catch {}
  }
}

function cleanPidFile(file) {
  try { fs.unlinkSync(file) } catch {}
}

function fallbackKill(patterns) {
  if (process.platform === 'win32') {
    return // rely on PID files on Windows
  }
  for (const pattern of patterns) {
    const res = spawnSync('pkill', ['-f', pattern], { stdio: 'ignore' })
    // Ignore exit code 1 (no processes matched)
    if (res.status !== 0 && res.status !== 1) {
      console.warn(`[kill-dev] pkill -f ${pattern} exited with ${res.status}`)
    }
  }
}

async function main() {
  const pidDir = path.resolve(process.cwd(), '.pids')
  const pidEntries = readPidFiles(pidDir)
  if (!pidEntries.length) {
    console.log('[kill-dev] no tracked background processes')
  }
  for (const entry of pidEntries) {
    if (processExists(entry.pid)) {
      console.log(`[kill-dev] terminating pid ${entry.pid} (${entry.file})`)
      await terminatePid(entry.pid)
    }
    cleanPidFile(entry.file)
  }
  fallbackKill(DEFAULT_PATTERNS)
}

try {
  await main()
} catch (err) {
  console.error(`[kill-dev] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
