// Bounding boxes (as fractions of the 1600x1000 screenshot) of the UI elements the camera zooms into.
import puppeteer from 'puppeteer-core'
const base = 'http://localhost:5181'
const want = {
  overview: ['Newcomer follow-up', 'Discipleship funnel', 'Upcoming birthdays', 'Coming up', 'Giving recorded'],
  members: ['Newcomers', 'Converts', 'Add member', 'Esther Bello', 'Import'],
  giving: ['Giving — last 6 months', 'By fund', 'Recent gifts', 'Record gift'],
  messaging: ['WhatsApp', 'Send to 47', 'Write with Ellen', 'Each person receives', 'Grace Chapel'],
  links: ['New convert form', 'Member registration', 'Newcomer card', 'Offerings & giving'],
  design: ['Create a flyer with AI', 'Create flyer', 'Your flyer will appear here'],
  events: ['October 2026', 'Coming up', 'Create with Ellen'],
  ai: ['How can I help', 'Ask Ellen anything', 'Today’s attention'],
}
const paths = { overview: '/dashboard', members: '/dashboard/members', giving: '/dashboard/giving', messaging: '/dashboard/messaging', events: '/dashboard/events', design: '/dashboard/design', ai: '/dashboard/ai', links: '/dashboard/links' }
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await b.newPage()
await p.setViewport({ width: 1600, height: 1000 })
await p.goto(base + '/', { waitUntil: 'networkidle0' })
await p.evaluate(() => { localStorage.setItem('ziondesk-theme', 'light'); localStorage.setItem('ziondesk-language-v1', JSON.stringify({ ui: 'en', comm: 'en', chosen: true })); localStorage.setItem('ziondesk-role', 'admin') })
const out = {}
for (const [k, texts] of Object.entries(want)) {
  await p.goto(base + paths[k], { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 600))
  out[k] = await p.evaluate((texts) => {
    const res = {}
    for (const t of texts) {
      const els = [...document.querySelectorAll('h1,h2,h3,b,button,span,a,p,small,label,div')].filter((e) => e.childElementCount < 4 && e.textContent.trim().startsWith(t))
      const e = els[0]
      if (!e) { res[t] = null; continue }
      // climb to the nearest card/panel
      let c = e
      for (let i = 0; i < 6 && c.parentElement; i++) { if (/panel|card|d-kpi|lk-card|st-|kpi|pipe|stage/.test(c.className || '') && c.getBoundingClientRect().width > 120) break; c = c.parentElement }
      const r = e.getBoundingClientRect(), R = c.getBoundingClientRect()
      const f = (v, d) => Math.round((v / d) * 1000) / 1000
      res[t] = { el: [f(r.x, 1600), f(r.y, 1000), f(r.width, 1600), f(r.height, 1000)], box: [f(R.x, 1600), f(R.y, 1000), f(R.width, 1600), f(R.height, 1000)] }
    }
    return res
  }, texts)
}
await b.close()
console.log(JSON.stringify(out, null, 1))
