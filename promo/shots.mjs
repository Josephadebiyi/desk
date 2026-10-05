// Captures the real ZionDesk dashboard (preview mode, sample data) for the launch reel.
//   node promo/shots.mjs  → promo/shots/<page>.png at 1600x1000 @2x
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
const dir = dirname(fileURLToPath(import.meta.url))
const base = process.env.APP_URL || 'http://localhost:5181'
mkdirSync(join(dir, 'shots'), { recursive: true })
const PAGES = { overview: '/dashboard', members: '/dashboard/members', giving: '/dashboard/giving', messaging: '/dashboard/messaging', events: '/dashboard/events', design: '/dashboard/design', ai: '/dashboard/ai', links: '/dashboard/links', reports: '/dashboard/reports' }
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 })
await page.goto(base + '/', { waitUntil: 'networkidle0' })
// English, light theme, language prompt dismissed, admin role
await page.evaluate(() => {
  localStorage.setItem('ziondesk-theme', 'light')
  localStorage.setItem('ziondesk-language-v1', JSON.stringify({ ui: 'en', comm: 'en', chosen: true }))
  localStorage.setItem('ziondesk-role', 'admin')
})
for (const [name, path] of Object.entries(PAGES)) {
  await page.goto(base + path, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 900))
  await page.screenshot({ path: join(dir, 'shots', `${name}.png`) })
  console.log(name)
}
await browser.close()
