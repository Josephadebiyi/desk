import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
const dir = dirname(fileURLToPath(import.meta.url))
const base = process.env.APP_URL || 'http://localhost:5181'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })
await page.goto(base + '/', { waitUntil: 'networkidle0' })
await page.evaluate(() => { localStorage.setItem('ziondesk-theme', 'light'); localStorage.setItem('ziondesk-language-v1', JSON.stringify({ ui: 'en', comm: 'en', chosen: true })) })
await page.goto(base + '/dashboard/links', { waitUntil: 'networkidle0' })
const urls = await page.evaluate(() => [...document.body.innerText.matchAll(/(\/(?:join|give)\/[^\s]+)/g)].map((m) => m[1]))
console.log(urls)
await page.setViewport({ width: 400, height: 860, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const join_ = urls.find((u) => u.includes('type=convert')) || urls.find((u) => u.includes('/join/'))
const give = urls.find((u) => u.includes('/give/'))
for (const [name, u] of [['join', join_], ['give', give]]) {
  if (!u) continue
  await page.goto(base + u, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 800))
  await page.screenshot({ path: join(dir, 'shots', `phone-${name}.png`) })
}
await browser.close()
