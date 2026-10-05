/**
 * Renders the launch film frames with headless Chrome and encodes them with ffmpeg.
 *   node promo/render.mjs wide|reel [--fps 30] [--from 0 --to 30]
 * Output: promo/out/<format>-silent.mp4 (audio is added by promo/build.sh)
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const dir = dirname(fileURLToPath(import.meta.url))
const format = process.argv[2] === 'reel' ? 'reel' : 'wide'
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d }
const fps = arg('fps', 30), from = arg('from', 0), to = arg('to', 30)
const [W, H] = format === 'reel' ? [1080, 1920] : [1920, 1080]
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const script = JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8')).lines
mkdirSync(join(dir, 'out'), { recursive: true })
const outFile = join(dir, 'out', `${format}-silent.mp4`)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--allow-file-access-from-files'] })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
await page.evaluateOnNewDocument((s) => (window.__SCRIPT__ = s), script)
await page.goto(`file://${join(dir, process.env.SCENE || 'scene.html')}?format=${format}`, { waitUntil: 'networkidle0' })
await page.evaluate(() => window.ready)

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] })
const total = Math.round((to - from) * fps)
const started = Date.now()
for (let f = 0; f < total; f++) {
  const t = from + f / fps
  await page.evaluate((tt) => window.seek(tt), t)
  const buf = await page.screenshot({ type: 'jpeg', quality: 95, optimizeForSpeed: true })
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  if (f % 60 === 0) process.stdout.write(`\r${format}: frame ${f}/${total} (${Math.round((Date.now() - started) / 1000)}s)`)
}
ff.stdin.end()
await new Promise((r) => ff.on('close', r))
await browser.close()
console.log(`\n${format}: ${outFile}`)
