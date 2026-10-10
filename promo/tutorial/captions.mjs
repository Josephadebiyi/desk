/**
 * Captions for the tutorial: splits each voice line into short phrases, times them across the line, renders each
 * as a transparent 1920×1080 PNG (Chrome) and writes:
 *   out/captions/*.png + out/captions.txt (ffmpeg concat list → one transparent caption track)
 *   out/ZionDesk-Tutorial.srt (for YouTube / Facebook upload)
 * Run after record.mjs (needs out/timeline.json).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const dir = dirname(fileURLToPath(import.meta.url))
const out = join(dir, 'out')
const VO_DELAY = 0.15 // voice starts this long after its beat (build.py uses the same)
const tl = JSON.parse(readFileSync(join(out, 'timeline.json'), 'utf8'))
const script = Object.fromEntries(JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8')).beats.map((b) => [b.id, b.text]))

/** Phrases of at most ~8 words, broken at punctuation where possible. */
function phrases(text) {
  const clean = text.replace(/\.\.\./g, '…')
  const parts = clean.split(/(?<=[.?!…])\s+|(?<=[,:;])\s+/).filter(Boolean)
  const out = []
  for (const p of parts) {
    const w = p.split(' ')
    if (w.length <= 9) { out.push(p); continue }
    const n = Math.ceil(w.length / 8)
    const size = Math.ceil(w.length / n)
    for (let i = 0; i < w.length; i += size) out.push(w.slice(i, i + size).join(' '))
  }
  // merge very short fragments into the previous phrase
  return out.reduce((a, p) => (a.length && p.split(' ').length <= 2 && a[a.length - 1].split(' ').length <= 6 ? (a[a.length - 1] += ' ' + p, a) : (a.push(p), a)), [])
}

const cues = []
for (const b of tl.beats) {
  const ph = phrases(script[b.id])
  const total = ph.reduce((s, p) => s + p.length + 6, 0)
  let t = b.start + VO_DELAY
  for (const p of ph) {
    const d = ((p.length + 6) / total) * b.voice
    cues.push({ start: t, end: t + d - 0.04, text: p.replace(/[,;:]$/, '') })
    t += d
  }
}

const srtTime = (s) => {
  const ms = Math.round(s * 1000)
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`
}
writeFileSync(join(out, 'ZionDesk-Tutorial.srt'), cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'))

// Render each caption as a transparent frame.
const capDir = join(out, 'captions')
rmSync(capDir, { recursive: true, force: true })
mkdirSync(capDir, { recursive: true })
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1080 })
await page.setContent(`<html><head><style>
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700&display=swap');
  html,body{margin:0;background:transparent;width:1920px;height:1080px}
  #c{position:absolute;left:820px;bottom:44px;transform:translateX(-50%);max-width:820px;width:max-content;text-align:center;
     padding:14px 26px;border-radius:20px;background:rgba(17,16,21,.82);color:#fff;font:600 36px/1.3 'Inter Tight',system-ui,sans-serif;letter-spacing:-.01em}
  #c:empty{display:none}
</style></head><body><div id="c"></div></body></html>`)
await page.evaluate(() => document.fonts.ready)
const list = []
let last = 0
const blank = join(capDir, 'blank.png')
await page.evaluate(() => (document.getElementById('c').textContent = ''))
await page.screenshot({ path: blank, omitBackground: true })
for (const [i, c] of cues.entries()) {
  if (c.start > last) list.push(`file '${blank}'\nduration ${(c.start - last).toFixed(3)}`)
  const f = join(capDir, `c${String(i).padStart(4, '0')}.png`)
  await page.evaluate((t) => (document.getElementById('c').textContent = t), c.text)
  await page.screenshot({ path: f, omitBackground: true })
  list.push(`file '${f}'\nduration ${(c.end - c.start).toFixed(3)}`)
  last = c.end
}
list.push(`file '${blank}'\nduration ${Math.max(1, tl.total - last).toFixed(3)}`, `file '${blank}'`)
writeFileSync(join(out, 'captions.txt'), list.join('\n') + '\n')
await browser.close()
console.log(`${cues.length} captions → out/captions.txt, out/ZionDesk-Tutorial.srt`)
