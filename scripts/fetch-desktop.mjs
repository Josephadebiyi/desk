/**
 * Puts the desktop installers in public/downloads/ so every website build ships them in dist/downloads/:
 *   dist/downloads/ZionDesk-mac.dmg      (macOS 12+, Intel + Apple silicon)
 *   dist/downloads/ZionDesk-Setup.exe    (Windows 10/11, x64 + ARM)
 * The /download page then serves them from ziondesk.com itself (falling back to GitHub if they're missing).
 *
 * Where they come from, in order:
 *   1. the newest published GitHub Release (push a desktop-v* tag to make one) — no sign-in needed;
 *   2. the newest successful "Desktop apps" build on GitHub Actions — needs a token: GITHUB_TOKEN=…,
 *      or the GitHub CLI signed in (`gh auth login`). Optional: DESKTOP_BRANCH=<branch>.
 *
 * Run: npm run desktop:fetch   (build:hostinger runs it for you). Never fails the build: if nothing can be
 * fetched it warns and leaves whatever is already in public/downloads/.
 * DESKTOP_LOCAL=1 skips fetching and keeps the installers already in public/downloads/.
 * Add `-- --downloads` to also copy both installers to your computer's Downloads folder.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const REPO = 'Josephadebiyi/desk'
const WEB = process.env.DESKTOP_GH_WEB || 'https://github.com' // overridable for testing
const API = process.env.DESKTOP_GH_API || 'https://api.github.com'
const FILES = ['ZionDesk-mac.dmg', 'ZionDesk-Setup.exe']
const OUT = join(process.cwd(), 'public', 'downloads')
mkdirSync(OUT, { recursive: true })

const mb = (p) => `${(statSync(p).size / 1048576).toFixed(0)} MB`
const token = () => {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

async function download(url, dest, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'ziondesk-build', ...headers }, redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  const tmp = dest + '.part'
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp))
  renameSync(tmp, dest)
}

async function fromRelease() {
  for (const f of FILES) await download(`${WEB}/${REPO}/releases/latest/download/${f}`, join(OUT, f))
  return 'the latest GitHub Release'
}

async function fromActions() {
  const tk = token()
  if (!tk) throw new Error('no GitHub token (set GITHUB_TOKEN or run `gh auth login`)')
  const h = { Authorization: `Bearer ${tk}`, Accept: 'application/vnd.github+json' }
  const api = async (path) => {
    const r = await fetch(`${API}/repos/${REPO}/${path}`, { headers: { 'User-Agent': 'ziondesk-build', ...h } })
    if (!r.ok) throw new Error(`GitHub API ${r.status} for ${path}`)
    return r.json()
  }
  const branch = process.env.DESKTOP_BRANCH ? `&branch=${encodeURIComponent(process.env.DESKTOP_BRANCH)}` : ''
  const { workflow_runs: runs } = await api(`actions/workflows/desktop.yml/runs?status=success&per_page=10${branch}`)
  for (const run of runs) {
    const { artifacts } = await api(`actions/runs/${run.id}/artifacts`)
    const wanted = ['ZionDesk-mac', 'ZionDesk-win'].map((n) => artifacts.find((a) => a.name === n && !a.expired))
    if (wanted.some((a) => !a)) continue
    const work = mkdtempSync(join(tmpdir(), 'ziondesk-'))
    try {
      for (const a of wanted) {
        const zip = join(work, `${a.name}.zip`)
        await download(a.archive_download_url, zip, h)
        execFileSync('unzip', ['-o', '-q', zip, '-d', work])
      }
      for (const f of FILES) {
        if (!existsSync(join(work, f))) throw new Error(`${f} missing from build ${run.id}`)
        renameSync(join(work, f), join(OUT, f))
      }
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
    return `GitHub Actions build #${run.run_number} (${run.head_branch}, ${run.head_sha.slice(0, 7)})`
  }
  throw new Error('no successful "Desktop apps" build with both installers')
}

let source = ''
const errors = []
// DESKTOP_LOCAL=1 keeps installers you built yourself in public/downloads/ (e.g. a version not on GitHub yet).
const keepLocal = process.env.DESKTOP_LOCAL === '1' && FILES.some((f) => existsSync(join(OUT, f)))
if (keepLocal) {
  console.log('✓ DESKTOP_LOCAL=1 — keeping the installers already in public/downloads/:')
  for (const f of FILES.filter((f) => existsSync(join(OUT, f)))) console.log(`  public/downloads/${f}  ${mb(join(OUT, f))}`)
  process.exit(0)
}
for (const get of [fromRelease, fromActions]) {
  try {
    source = await get()
    break
  } catch (e) {
    errors.push(`${get.name}: ${e.message}`)
  }
}
if (source) {
  console.log(`✓ Desktop installers from ${source}:`)
  for (const f of FILES) console.log(`  public/downloads/${f}  ${mb(join(OUT, f))}`)
}
if (process.argv.includes('--downloads')) {
  const dest = join(homedir(), 'Downloads')
  mkdirSync(dest, { recursive: true })
  for (const f of FILES.filter((f) => existsSync(join(OUT, f)))) {
    copyFileSync(join(OUT, f), join(dest, f))
    console.log(`✓ Saved ${join(dest, f)}`)
  }
} else {
  const have = readdirSync(OUT).filter((f) => FILES.includes(f))
  console.warn(`⚠ Couldn't fetch the desktop installers (${errors.join('; ')}).`)
  console.warn(have.length ? `  Keeping the existing ${have.join(', ')}.` : '  The /download page will link to GitHub instead.')
}
