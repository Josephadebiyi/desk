/**
 * i18n check: every key used in the code exists in English, and every language has
 * exactly the same keys as English (no missing / no leftover English copies).
 * Run: npm run i18n:check
 */
import { createServer } from 'vite'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const langs = ['en', 'es', 'fr', 'de', 'pt']
const dicts = {}
for (const l of langs) dicts[l] = (await server.ssrLoadModule(`/src/i18n/locales/${l}/index.ts`)).default
await server.close()

const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
const en = new Map(flat(dicts.en))
let problems = 0

// 1. Same keys everywhere; flag values identical to English (likely untranslated) unless they're names/brands.
const SAME_OK = /^(Ellen|ZionDesk.*|Plus|SMS|WhatsApp|Email|E-Mail|Google Meet|Instagram.*|Design|Designs|Designer|Admin|Notes|Status|Note|Total|Online|Dashboard|Feedback|FAQ|Clips|Chat|Live|Flyer.*|Links|.*\{.*\}.*|[^a-zA-Z]*|.{0,3})$/
for (const l of langs.slice(1)) {
  const m = new Map(flat(dicts[l]))
  for (const k of en.keys()) if (!m.has(k)) (problems++, console.log(`[${l}] missing ${k}`))
  for (const k of m.keys()) if (!en.has(k)) (problems++, console.log(`[${l}] extra ${k}`))
  const same = [...en].filter(([k, v]) => m.get(k) === v && v.length > 3 && !SAME_OK.test(v))
  if (same.length) console.log(`[${l}] ${same.length} values identical to English (check): ${same.slice(0, 8).map(([k]) => k).join(', ')}${same.length > 8 ? '…' : ''}`)
}

// 2. Static keys used in code exist.
const files = []
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f)
  if (statSync(p).isDirectory()) { if (!p.includes('locales')) walk(p) } else if (/\.(tsx?|mjs)$/.test(f)) files.push(p)
})
walk('src')
const plural = (k) => en.has(`${k}_one`) || en.has(`${k}_other`)
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\b(?:t|tr)\(\s*'([a-zA-Z][\w]*\.[\w.]+)'/g)) {
    const k = m[1]
    if (!en.has(k) && !plural(k)) (problems++, console.log(`${f}: unknown key ${k}`))
  }
}
console.log(problems ? `\n✗ ${problems} problem(s)` : `✓ ${en.size} keys, ${langs.length} languages, all consistent`)
process.exit(problems ? 1 : 0)
