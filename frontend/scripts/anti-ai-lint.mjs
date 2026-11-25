#!/usr/bin/env node
// Keeps the interface from looking and sounding machine-made, and keeps Kannada complete.
// Fails on: hype words in copy, emoji, smooth gradients, glass blur, the "sparkles" icon,
// and any English string key with no Kannada translation.   npm run lint:style
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const files = []
const walk = d => readdirSync(d).forEach(n => {
  const p = join(d, n)
  if (statSync(p).isDirectory()) { if (n !== 'generated') walk(p) }
  else if (/\.(tsx?|css)$/.test(n)) files.push(p)
})
walk(join(root, 'src'))
files.push(join(root, 'index.html'))

const WORDS = ['seamless', 'empower', 'revolutioni', 'cutting-edge', 'unlock', 'leverage', 'delve', 'game-chang',
  'ai-powered', 'magic', 'effortless', 'supercharge', 'next-gen', 'transformative', 'harness', 'elevate', "in today's"]
const RULES = [
  [new RegExp(`\\b(${WORDS.join('|')})`, 'i'), 'hype word'],
  [/\p{Extended_Pictographic}/u, 'emoji'],
  [/radial-gradient|conic-gradient/, 'smooth gradient'],
  [/backdrop-filter/, 'glass blur'],
  [/\bSparkles\b/, 'sparkles icon'],
]

const problems = []
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes('anti-ai-lint: allow')) return
    const at = `${relative(root, f)}:${i + 1}`
    for (const [re, why] of RULES) if (re.test(line)) problems.push(`${at}: ${why}: ${line.trim().slice(0, 90)}`)
    // Hatching (repeating-linear-gradient) and 1px ruled paper are drawing; a smooth linear fade is not.
    for (const m of line.matchAll(/(repeating-)?linear-gradient\(/g)) {
      if (!m[1] && !/\b1px\b/.test(line.slice(m.index, m.index + 90))) problems.push(`${at}: smooth gradient (use flat fills, hatching or 1px ruling)`)
    }
  })
}

const i18n = readFileSync(join(root, 'src/lib/i18n.tsx'), 'utf8')
const block = name => {
  const start = i18n.indexOf(`const ${name}`)
  const body = i18n.slice(start, i18n.indexOf('\n}', start))
  return new Set([...body.matchAll(/'([a-zA-Z0-9_.]+)':/g)].map(m => m[1]))
}
const en = block('en'), kn = block('kn')
const missing = [...en].filter(k => !kn.has(k) && !/\.(en|kn)$/.test(k))
for (const k of missing) problems.push(`src/lib/i18n.tsx: no Kannada for '${k}'`)

problems.forEach(p => console.log(p))
console.log(`anti-ai-lint: ${files.length} files, ${en.size} strings, ${problems.length} problem(s)`)
process.exit(problems.length ? 1 : 0)
