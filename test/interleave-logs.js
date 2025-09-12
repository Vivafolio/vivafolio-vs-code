#!/usr/bin/env node
// Merge multiple log files into a single stream ordered by timestamp.
// Usage:
//   node test/interleave-logs.js <glob-or-files...>
// Example:
//   node test/interleave-logs.js ~/.config/Code/logs/**/exthost*.log vivafolio/**/vivafolio-*.log

const fs = require('fs')
const path = require('path')

function parseTimestamp(line) {
  // Accept ISO timestamps and [I] formats in VS Code logs
  // Expected extension line prefix: 2025-09-11T12:34:56.789Z [LEVEL] ...
  const isoMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/)
  if (isoMatch) {
    const t = Date.parse(isoMatch[1])
    if (!isNaN(t)) return t
  }
  // Fallback: try to parse bracketed timestamps like [2025-09-11 12:34:56.789]
  const bracket = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\]/)
  if (bracket) {
    const t = Date.parse(bracket[1].replace(' ', 'T') + 'Z')
    if (!isNaN(t)) return t
  }
  return NaN
}

function readLines(file) {
  try {
    const data = fs.readFileSync(file, 'utf8')
    return data.split(/\r?\n/).filter(Boolean).map(l => ({ ts: parseTimestamp(l), file, line: l }))
  } catch {
    return []
  }
}

function expandGlobs(args) {
  // Minimal glob expansion: ** is not implemented; rely on shell where possible.
  // If a path exists, use it; otherwise, return as-is (the caller shell should expand).
  const out = []
  for (const a of args) {
    if (fs.existsSync(a)) {
      const stat = fs.statSync(a)
      if (stat.isDirectory()) {
        const walk = (dir) => {
          for (const e of fs.readdirSync(dir)) {
            const p = path.join(dir, e)
            const s = fs.statSync(p)
            if (s.isDirectory()) walk(p); else out.push(p)
          }
        }
        walk(a)
      } else {
        out.push(a)
      }
    } else {
      out.push(a) // hope shell expanded
    }
  }
  return out
}

const inputs = process.argv.slice(2)
if (inputs.length === 0) {
  console.error('Usage: node test/interleave-logs.js <files...>')
  process.exit(2)
}

const files = Array.from(new Set(expandGlobs(inputs)))
let entries = []
for (const f of files) entries = entries.concat(readLines(f))

entries.sort((a, b) => {
  const at = isNaN(a.ts) ? Infinity : a.ts
  const bt = isNaN(b.ts) ? Infinity : b.ts
  if (at !== bt) return at - bt
  if (a.file !== b.file) return a.file.localeCompare(b.file)
  return a.line.localeCompare(b.line)
})

for (const e of entries) {
  const ts = isNaN(e.ts) ? 'NO_TS' : new Date(e.ts).toISOString()
  process.stdout.write(`${ts} ${path.basename(e.file)} | ${e.line}\n`)
}


