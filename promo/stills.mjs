// Quick review: node promo/stills.mjs wide|reel 1.2 4.6 ... → promo/out/still-<format>-<t>.jpg
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
const dir = dirname(fileURLToPath(import.meta.url))
const format = process.argv[2] === 'reel' ? 'reel' : 'wide'
const [W, H] = format === 'reel' ? [1080, 1920] : [1920, 1080]
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--allow-file-access-from-files'] })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H })
await page.evaluateOnNewDocument((s) => (window.__SCRIPT__ = s), JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8')).lines)
await page.goto(`file://${join(dir, process.env.SCENE || 'scene.html')}?format=${format}`, { waitUntil: 'networkidle0' })
await page.evaluate(() => window.ready)
for (const t of process.argv.slice(3).map(Number)) {
  await page.evaluate((tt) => window.seek(tt), t)
  await page.screenshot({ path: join(dir, 'out', `still-${format}-${t}.jpg`), type: 'jpeg', quality: 80 })
}
await browser.close()
