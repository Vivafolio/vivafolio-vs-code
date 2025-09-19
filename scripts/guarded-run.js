#!/usr/bin/env node
/*
 Cross-platform guard to prevent duplicate dev servers.
 - Detects running processes matching provided patterns (and/or PID file).
 - If found, prompts the user to kill them interactively (or auto with --yes).
 - Then runs the given command, writes a PID file, and cleans it up on exit.

 Usage:
   node scripts/guarded-run.js \
     --name blockprotocol-poc-dev \
     --pid-file .pids/dev.pid \
     --match "src/server.ts|dist/server/server.js" \
     --cwd "." \
     [--yes] \
     -- npm run dev
*/

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

function parseArgs(argv) {
  const args = { match: [], yes: false }
  const sepIndex = argv.indexOf('--')
  const before = sepIndex >= 0 ? argv.slice(0, sepIndex) : argv
  const after = sepIndex >= 0 ? argv.slice(sepIndex + 1) : []
  for (let i = 0; i < before.length; i++) {
    const a = before[i]
    if (a === '--name') args.name = before[++i]
    else if (a === '--pid-file') args.pidFile = before[++i]
    else if (a === '--cwd') args.cwd = before[++i]
    else if (a === '--match') args.match.push(before[++i])
    else if (a === '--yes' || a === '-y') args.yes = true
    else if (a.startsWith('--')) {
      // ignore unknown flags
    }
  }
  if (after.length > 0) {
    args.cmd = after[0]
    args.cmdArgs = after.slice(1)
  }
  return args
}

function fileExists(p) {
  try { fs.accessSync(p, fs.constants.F_OK); return true } catch { return false }
}

function ensureDir(dir) {
  if (!dir) return
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

function readPidFile(pidFile) {
  if (!pidFile || !fileExists(pidFile)) return null
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim()
    const pid = Number.parseInt(raw, 10)
    return Number.isFinite(pid) && processExists(pid) ? pid : null
  } catch {
    return null
  }
}

function removePidFile(pidFile) {
  if (!pidFile) return
  try { fs.unlinkSync(pidFile) } catch {}
}

function listMatchingPids(patterns, cwd) {
  const regex = patterns.length ? new RegExp(patterns.join('|')) : null
  const out = []
  if (process.platform === 'win32') {
    // Use PowerShell for command lines
    const ps = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | Format-Table -HideTableHeaders'
    ], { encoding: 'utf8' })
    if (ps.status === 0 && ps.stdout) {
      const lines = ps.stdout.split(/\r?\n/)
      for (const line of lines) {
        const m = line.trim()
        if (!m) continue
        // Extract PID (first number) and command line (rest)
        const match = m.match(/^(\d+)\s+(.*)$/)
        if (!match) continue
        const pid = Number.parseInt(match[1], 10)
        const cmd = match[2]
        if (!pid || !cmd) continue
        if (pid === process.pid) continue
        if (regex && !regex.test(cmd)) continue
        if (cwd && !cmd.includes(path.resolve(cwd))) continue
        out.push(pid)
      }
    }
  } else {
    const ps = spawnSync('ps', ['-eo', 'pid=,args=', '-ww'], { encoding: 'utf8' })
    if (ps.status === 0 && ps.stdout) {
      const lines = ps.stdout.split(/\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const space = trimmed.indexOf(' ')
        if (space <= 0) continue
        const pid = Number.parseInt(trimmed.slice(0, space), 10)
        const cmd = trimmed.slice(space + 1)
        if (!pid || !cmd) continue
        if (pid === process.pid) continue
        if (regex && !regex.test(cmd)) continue
        if (cwd && !cmd.includes(path.resolve(cwd))) continue
        out.push(pid)
      }
    }
  }
  return Array.from(new Set(out))
}

async function promptYesNo(question, def = false) {
  if (process.env.CI || !process.stdout.isTTY) {
    return true // default to auto-yes in non-interactive to reduce flakiness
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const suffix = def ? ' [Y/n] ' : ' [y/N] '
  const answer = await new Promise((resolve) => rl.question(question + suffix, (a) => resolve(a)))
  rl.close()
  const s = String(answer || '').trim().toLowerCase()
  if (!s) return def
  return s === 'y' || s === 'yes'
}

async function killPids(pids) {
  if (!pids.length) return
  if (process.platform === 'win32') {
    for (const pid of pids) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'])
    }
  } else {
    for (const pid of pids) {
      try { process.kill(pid, 'SIGTERM') } catch {}
    }
    await new Promise((r) => setTimeout(r, 800))
    for (const pid of pids) {
      if (processExists(pid)) {
        try { process.kill(pid, 'SIGKILL') } catch {}
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const name = args.name || 'guarded'
  const pidFile = args.pidFile ? path.resolve(args.cwd || process.cwd(), args.pidFile) : null
  const cwd = args.cwd ? path.resolve(process.cwd(), args.cwd) : process.cwd()
  const patterns = args.match && args.match.length ? args.match : []
  const cmd = args.cmd
  const cmdArgs = args.cmdArgs || []
  if (!cmd) {
    console.error('[guarded-run] Missing command after --')
    process.exit(2)
  }

  // 1) Detect existing process via PID file
  let existing = []
  const fromPidFile = readPidFile(pidFile)
  if (fromPidFile) existing.push(fromPidFile)

  // 2) Detect by matching patterns and cwd
  const found = listMatchingPids(patterns, cwd)
  for (const pid of found) {
    if (!existing.includes(pid)) existing.push(pid)
  }

  if (existing.length) {
    const header = `[guarded-run:${name}] Found ${existing.length} running instance(s): ${existing.join(', ')}`
    console.log(header)
    if (args.yes || process.env.GUARDED_YES === '1') {
      await killPids(existing)
      removePidFile(pidFile)
    } else {
      const ok = await promptYesNo('Kill them?', false)
      if (ok) {
        await killPids(existing)
        removePidFile(pidFile)
      } else {
        console.log('[guarded-run] Aborted by user.')
        process.exit(1)
      }
    }
  }

  // 3) Start command
  ensureDir(pidFile ? path.dirname(pidFile) : null)
  const child = spawn(cmd, cmdArgs, { cwd, stdio: 'inherit', env: process.env, shell: false })
  if (pidFile) {
    try { fs.writeFileSync(pidFile, String(child.pid)) } catch {}
  }

  const cleanup = () => {
    if (pidFile) removePidFile(pidFile)
  }
  child.on('exit', (code, signal) => {
    cleanup()
    if (signal) {
      process.kill(process.pid, signal)
    } else {
      process.exit(code ?? 0)
    }
  })
  process.on('SIGINT', () => child.kill('SIGINT'))
  process.on('SIGTERM', () => child.kill('SIGTERM'))
}

main().catch((err) => {
  console.error('[guarded-run] Fatal error:', err)
  process.exit(1)
})
