#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

function ensureDir(filePath) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
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

function readExistingPid(pidFile) {
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim()
    const pid = Number.parseInt(raw, 10)
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
}

function main() {
  const { values, positionals } = parseArgs({
    options: {
      name: { type: 'string' },
      'pid-file': { type: 'string' },
      cwd: { type: 'string' },
      'inherit-logs': { type: 'boolean', default: false }
    },
    allowPositionals: true
  })

  if (!positionals.length) {
    console.error('[start-background] Missing command after --')
    process.exit(2)
  }

  const name = values.name || 'background-task'
  const cwd = values.cwd ? path.resolve(process.cwd(), values.cwd) : process.cwd()
  const pidFile = path.resolve(process.cwd(), values['pid-file'] || path.join('.pids', `${name}.pid`))

  const existingPid = readExistingPid(pidFile)
  if (existingPid && processExists(existingPid)) {
    console.log(`[start-background] ${name} already running (pid ${existingPid}) -> ${pidFile}`)
    return
  }

  const child = spawn(positionals[0], positionals.slice(1), {
    cwd,
    env: process.env,
    stdio: values['inherit-logs'] ? 'inherit' : 'ignore',
    detached: true
  })

  child.unref()
  ensureDir(pidFile)
  fs.writeFileSync(pidFile, String(child.pid))
  console.log(`[start-background] ${name} started (pid ${child.pid}) -> ${pidFile}`)
}

try {
  main()
} catch (err) {
  console.error(`[start-background] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
