// Copies the backend's rule packs into src/generated/rules so the in-browser demo reads the same
// numbers as the API. Vercel and the frontend Docker image only see frontend/, so the copy is
// committed; `node scripts/sync-rules.mjs --check` (run in CI) fails if it drifts from the backend.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = new URL('../../backend/app/engine/rules_data/', import.meta.url).pathname
const OUT = new URL('../src/generated/rules/', import.meta.url).pathname
const check = process.argv.includes('--check')

const files = []
const walk = dir => readdirSync(dir).forEach(f => {
  const p = join(dir, f)
  if (statSync(p).isDirectory()) walk(p)
  else if (f.endsWith('.json') && f !== 'schema.json') files.push(p)
})
walk(SRC)

let drift = 0
for (const f of files) {
  const target = join(OUT, relative(SRC, f).replaceAll('/', '__'))
  const body = JSON.stringify(JSON.parse(readFileSync(f, 'utf8')), null, 2) + '\n'
  let current = ''
  try { current = readFileSync(target, 'utf8') } catch { /* missing */ }
  if (current !== body) {
    drift++
    if (!check) { mkdirSync(OUT, { recursive: true }); writeFileSync(target, body) }
    console.log(`${check ? 'DRIFT' : 'synced'} ${relative(SRC, f)}`)
  }
}
if (check && drift) { console.error('Rule packs in frontend/src/generated/rules are out of date. Run: npm run sync:rules'); process.exit(1) }
if (!drift) console.log('Rule packs in sync')
