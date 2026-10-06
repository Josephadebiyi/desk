import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--allow-file-access-from-files'] })
const p = await b.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
await p.setViewport({ width: 1080, height: 1920 })
await p.goto('file:///Users/j/Desktop/CLAUDE/ZIONDESK/ziondesk-web/promo/story.html', { waitUntil: 'networkidle0' })
await p.evaluate(() => window.ready)
const dur = await p.evaluate(() => window.DURATION)
for (let t = 0; t < dur; t += 0.25) {
  try { await p.evaluate((tt) => window.seek(tt), t) } catch (e) { errs.push(t.toFixed(2) + ' ' + e.message.split('\n')[0]); }
}
const shots = (process.argv[2] || '').split(',').filter(Boolean).map(Number)
for (const t of shots) { await p.evaluate((tt) => window.seek(tt), t); await p.screenshot({ path: `/private/tmp/claude-501/-Users-j-Desktop-CLAUDE-ZIONDESK/e8978cf1-7671-4db4-bfb0-3582688c1a9c/scratchpad/f${t}.jpg`, type: 'jpeg', quality: 70 }) }
console.log('duration', dur.toFixed(1), 'errors', [...new Set(errs)].slice(0, 10))
await b.close()
