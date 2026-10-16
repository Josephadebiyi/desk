// Renders public/brand/email-video.jpg: the walkthrough thumbnail with a play button baked in (for emails).
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const thumb = 'data:image/jpeg;base64,' + readFileSync(process.env.HOME + '/Desktop/ZionDesk-Tutorial/YouTube-thumbnail-1280x720.jpg').toString('base64')
const html = `<html><body style="margin:0;width:1200px;height:675px;position:relative;overflow:hidden">
<img src="${thumb}" style="width:1200px;height:675px;object-fit:cover;display:block">
<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(0,0,0,.18),rgba(0,0,0,0) 60%)"></div>
<div style="position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;background:#ffffff;box-shadow:0 18px 50px rgba(20,0,60,.45);display:grid;place-items:center">
<div style="width:0;height:0;border-left:50px solid #6c34ff;border-top:32px solid transparent;border-bottom:32px solid transparent;margin-left:12px"></div></div>
<div style="position:absolute;right:28px;bottom:26px;background:rgba(17,16,21,.85);color:#fff;font:700 30px Arial;padding:8px 16px;border-radius:10px">8:03</div>
</body></html>`
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await b.newPage()
await p.setViewport({ width: 1200, height: 675 })
await p.setContent(html)
await p.screenshot({ path: 'public/brand/email-video.jpg', type: 'jpeg', quality: 82 })
await b.close()
console.log('ok')
