import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const D = '/Users/j/Desktop/CLAUDE/ZIONDESK/ziondesk-web'
const b64 = (p) => 'data:image/' + (p.endsWith('png') ? 'png' : 'jpeg') + ';base64,' + readFileSync(p).toString('base64')
const shot = b64(`${D}/promo/tutorial/out/shot-b09.jpg`)
const logo = b64(`${D}/public/brand/logo-lime.png`)
const html = `<html><head><style>
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@700;800;900&display=swap');
body{margin:0;width:1280px;height:720px;overflow:hidden;font-family:'Inter Tight',sans-serif;background:radial-gradient(900px 700px at 15% 20%,#8a5cff 0%,#6c34ff 45%,#3d17b8 100%);position:relative;color:#fff}
.shot{position:absolute;right:-90px;top:120px;width:760px;border-radius:22px;box-shadow:0 40px 90px -20px rgba(10,0,40,.65);transform:rotate(-4deg);border:6px solid rgba(255,255,255,.9)}
.logo{position:absolute;left:64px;top:56px;height:64px}
h1{position:absolute;left:64px;top:170px;width:560px;margin:0;font-size:82px;line-height:.98;font-weight:900;letter-spacing:-.04em}
h1 span{color:#c4ec62}
.tag{position:absolute;left:64px;bottom:70px;display:flex;gap:12px}
.tag b{background:#c4ec62;color:#18210a;padding:12px 22px;border-radius:999px;font-size:30px;font-weight:800}
.tag i{font-style:normal;background:rgba(255,255,255,.16);padding:12px 22px;border-radius:999px;font-size:30px;font-weight:700}
</style></head><body><img class="shot" src="${shot}"><img class="logo" src="${logo}"><h1>Run your church in <span>one simple app</span></h1><div class="tag"><b>Full walkthrough</b><i>8 min</i></div></body></html>`
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720 })
await page.setContent(html, { waitUntil: 'networkidle0' })
await page.screenshot({ path: '/Users/j/Desktop/ZionDesk-Tutorial/YouTube-thumbnail-1280x720.jpg', type: 'jpeg', quality: 92 })
await browser.close()
console.log('ok')
