/**
 * Records the ZionDesk tutorial from the real app (demo workspace, Ministry Max unlocked) with the overlay in overlay.js.
 *   APP_URL=http://localhost:5175 node promo/tutorial/record.mjs [--only b13,b14] [--shots]
 * Each beat runs its on-screen actions while its voice line would play; beat start times are logged to
 * out/timeline.json so build.py can lay the voice exactly where each beat began.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const dir = dirname(fileURLToPath(import.meta.url))
const out = join(dir, 'out')
mkdirSync(out, { recursive: true })
const base = process.env.APP_URL || 'http://localhost:5175'
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null }
const only = arg('only')?.split(',')
const shots = process.argv.includes('--shots')
const TEMPO = 0.92 // voice is slowed to 92% in build.py → beats last 1/0.92 as long
const GAP = 0.75 // breath after each line
const CHAPTER_CARD = 2.6

const script = JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'))
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())
const beats = script.beats.map((b) => ({ ...b, voice: dur(join(dir, 'vo', `${b.id}.mp3`)) / TEMPO }))
const flyerSvg = readFileSync(join(dir, 'flyer.svg'), 'utf8')
const overlay = readFileSync(join(dir, 'overlay.js'), 'utf8')

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--window-size=1440,810', '--disable-features=Translate'],
})
const page = await browser.newPage()
// App laid out at 1440×810 CSS px, rendered at 4/3 → 1920×1080 frames (bigger, readable UI).
await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 4 / 3 })
page.on('console', (m) => m.text().startsWith('[tut]') && console.log('   ', m.text()))
page.on('pageerror', (e) => console.log('   page error:', e.message))

// The demo has no API server: answer the few calls the recorded screens make.
await page.setRequestInterception(true)
page.on('request', (r) => {
  const u = new URL(r.url())
  if (!u.pathname.startsWith('/api/')) return r.continue()
  if (process.env.DEBUG) console.log('    api', r.method(), u.pathname)
  const json = (b, status = 200) => r.respond({ status, contentType: 'application/json', body: JSON.stringify(b) })
  if (u.pathname === '/api/design/generate') return setTimeout(() => json({ svg: flyerSvg, width: 1080, height: 1350, used: 4, limit: null }), 1800)
  if (u.pathname === '/api/design/usage') return json({ used: 3, limit: null })
  if (u.pathname === '/api/design/requests/quota') return json({ used: 2, included: 8 })
  if (u.pathname === '/api/ai') return json({ error: 'off' }, 404)
  return json({})
})

// Clean demo state: English, light theme, admin, Ministry Max, messages already sent.
await page.goto(base + '/', { waitUntil: 'networkidle0' })
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('ziondesk-theme', 'light')
  localStorage.setItem('ziondesk-language-v1', JSON.stringify({ ui: 'en', comm: 'en', chosen: true }))
  localStorage.setItem('ziondesk-role', 'admin')
  localStorage.setItem('ziondesk-settings-v1', JSON.stringify({ plan: 'max', planStatus: 'active' }))
})
await page.evaluateOnNewDocument(overlay)
await page.goto(base + '/dashboard', { waitUntil: 'networkidle0' })
await page.evaluate(() => {
  const k = 'ziondesk-campaigns-v1'
  const c = JSON.parse(localStorage.getItem(k) || '[]')
  if (c.length) localStorage.setItem(k, JSON.stringify(c.map((x) => ({ ...x, status: 'Sent' }))))
})
await page.reload({ waitUntil: 'networkidle0' })
await page.evaluate(() => document.fonts.ready)

/* ───────── helpers ───────── */
const ev = (code) => page.evaluate(`(async()=>{ ${code} })()`).catch((e) => console.log('    eval error:', e.message.split('\n')[0]))
const T = new Proxy({}, { get: (_, k) => (...a) => ev(`return T.${String(k)}(${a.map((x) => JSON.stringify(x)).join(',')})`) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const go = async (path, settle = 900) => {
  await T.zoom(null, 1)
  await T.unring()
  await T.go(path)
  await sleep(settle)
}
let beatStart = 0
let beatDur = 0
let beatText = ''
/** Waits until `s` seconds into the current beat. */
const at = async (s) => { const w = beatStart + s * 1000 - Date.now(); if (w > 0) await sleep(w) }
/** Seconds into the beat where `word` is spoken (proportional to its position in the line). */
const cue = (word, shift = -0.15) => {
  const i = beatText.toLowerCase().indexOf(word.toLowerCase())
  if (i < 0) { console.log('    cue missing:', word); return 0 }
  return Math.max(0, (i / beatText.length) * (beatDur - GAP) + shift)
}
const atw = (word, shift) => at(cue(word, shift))

/* ───────── scenes ───────── */
const card = (html, cls = '') => T.card(html, cls)
const reveal = (i) => T.reveal(i)
const chapterCard = async (n, title, sub = '') => {
  await card(`<div style="text-align:center"><div class="zt-chapnum">${n}</div><h2 class="zt-mid">${title}</h2>${sub ? `<p class="zt-sub">${sub}</p>` : ''}</div>`, 'dark')
}

const S = {
  // ───── Part 1: why ZionDesk ─────
  b01: async () => {
    await card(`<div class="zt-glow"></div><div style="text-align:center;position:relative"><h1 class="zt-big zt-in">Sunday service is over.</h1><p class="zt-sub zt-in" style="font-size:40px">But the work of the church…</p><p class="zt-mid zt-in zt-lime" style="margin-top:18px">never really stops.</p></div>`, 'dark')
    await sleep(300); await reveal(0)
    await atw('but the work'); await reveal(1)
    await atw('never'); await reveal(2)
  },
  b02: async () => {
    await card(`<div style="text-align:center"><p class="zt-sub zt-in on" style="margin:0 0 40px;opacity:.6;font-size:28px;letter-spacing:.12em;text-transform:uppercase">Sound familiar?</p><div class="zt-pains">
      <div class="zt-pain zt-in"><i>📒</i>Members’ details in a notebook</div>
      <div class="zt-pain zt-in"><i>💬</i>Announcements lost across 5 WhatsApp groups</div>
      <div class="zt-pain zt-in"><i>📊</i>Offerings in a spreadsheet only one person understands</div>
      <div class="zt-pain zt-in"><i>📞</i>A first-time guest nobody called back</div></div></div>`, 'dark')
    await atw('notebook', -0.6); await reveal(1)
    await atw('announcements'); await reveal(2)
    await atw('offering'); await reveal(3)
    await atw('first-time'); await reveal(4)
  },
  b03: async () => {
    await card(`<div style="text-align:center"><img class="zt-logo zt-in" src="/brand/logo-color.png" alt=""><h2 class="zt-mid zt-in">One simple place to <span class="zt-purple">run your church.</span></h2><div class="zt-pills">
      <span class="zt-pill zt-in">People</span><span class="zt-pill zt-in l">Giving</span><span class="zt-pill zt-in">Messages</span><span class="zt-pill zt-in l">Events</span></div></div>`)
    await sleep(250); await reveal(0)
    await atw('one simple'); await reveal(1)
    await atw('your people'); await reveal(2)
    await atw('your giving'); await reveal(3)
    await atw('your messages'); await reveal(4)
    await atw('your events'); await reveal(5)
  },
  b04: async () => {
    await go('/dashboard/members', 700)
    await card('')
    await T.chapter('', '')
    await sleep(500)
    await T.ring('css:.d-stages, .m-stages, main section'); await T.move('Members', 900)
    await atw('follow-ups'); await go('/dashboard'); await T.ring('Newcomer follow-up'); await T.move('Newcomer follow-up')
    await atw('tithes'); await go('/dashboard/giving'); await T.ring('Giving — last 6 months'); await T.move('Giving — last 6 months')
  },
  b05: async () => {
    await go('/dashboard/messaging')
    await T.click('SMS'); await atw('whatsapp'); await T.click('WhatsApp'); await atw('or email'); await T.click('Email')
    await atw('to the whole'); await T.ring('Send to'); await T.move('Send to')
    await atw('own language'); await T.unring(); await T.ring('css:.msg-langs, [class*=lang]'); await T.move('Français')
  },
  b06: async () => {
    await go('/dashboard/ai', 800)
    if (await ev(`return !!T.q('New chat','button')`)) { await T.click('New chat'); await sleep(300) }
    await T.click('Write announcement')
    await atw('design your sunday'); await go('/dashboard/design'); await T.ring('Create a flyer with AI'); await T.move('Create flyer')
  },
  d01: async () => {
    await card(`<div style="text-align:center"><h2 class="zt-mid zt-in">Built for <span class="zt-lime">every team</span><br>in your church.</h2><div class="zt-list">
      <span class="zt-in">Pastors & admin</span><span class="zt-in">Ushers & welcome</span><span class="zt-in">Follow-up</span><span class="zt-in">Finance</span><span class="zt-in">Media & publicity</span><span class="zt-in">Choir, youth & children</span></div></div>`, 'purple')
    await sleep(250); await reveal(0)
    for (let i = 1; i <= 6; i++) { await at(1.2 + i * 0.55); await reveal(i) }
  },
  d02: async () => {
    await go('/dashboard/attendance', 700); await card('')
    await T.lower('Ushers & welcome team', 'Every new face, captured', 'First-timers check in with a QR code on their very first Sunday.')
    await T.ring('Your Sunday check-in QR code'); await T.move('Your Sunday check-in QR code')
  },
  d03: async () => {
    await go('/dashboard/members', 700)
    await T.lower('Follow-up & evangelism', 'Nobody slips away', 'See who visited, who’s new in faith, and who hasn’t been around.')
    await T.ring('First-time guests'); await T.move('First-time guests')
    await atw('new convert'); await T.ring('New believers'); await T.move('New believers')
  },
  d04: async () => {
    await go('/dashboard/giving', 700)
    await T.lower('Finance team', 'Every offering, accounted for', 'Tithes, offerings and expenses — visible only to finance and admins.')
    await T.ring('By fund'); await T.move('By fund')
  },
  d05: async () => {
    await go('/dashboard/design', 700)
    await T.lower('Media & publicity', 'Flyers in minutes', 'Design for Sunday, then announce it to the whole church in one go.')
    await T.move('Create flyer')
  },
  d06: async () => {
    await go('/dashboard/messaging', 700)
    await T.lower('Choir · Youth · Children · Prayer', 'Your department, your people', 'Message just your team, and plan rehearsals on the calendar.')
    await T.ring('Send to'); await T.select('Send to', 'A department')
    await atw('plan rehearsals'); await go('/dashboard/events'); await T.ring('Choir Rehearsal'); await T.move('Choir Rehearsal')
  },
  d07: async () => {
    await go('/dashboard/branches', 700)
    await T.lower('Branch pastors', 'The whole picture at HQ', 'Each branch sends a simple monthly report.')
    await T.ring('css:table, .br-table'); await T.move('Remind all missing')
  },
  b07: async () => {
    await T.lower('', '')
    await card(`<div style="text-align:center"><h2 class="zt-mid zt-in">Simple, safe and affordable.</h2><div class="zt-tiles">
      <div class="zt-tile zt-in"><i>📱</i><h5>Phone & computer</h5><p>Use it anywhere — Sunday morning or midweek.</p></div>
      <div class="zt-tile zt-in"><i>🔒</i><h5>Private & secure</h5><p>Your church data stays yours. Roles control who sees what.</p></div>
      <div class="zt-tile zt-in"><i>💜</i><h5>From $8.99 / month</h5><p>Shown in your own local currency.</p></div></div></div>`)
    await sleep(250); await reveal(0); await reveal(1)
    await atw('private'); await reveal(2)
    await atw('plans start'); await reveal(3)
  },
  b08: async () => {
    await card(`<div style="text-align:center"><p class="zt-sub zt-in" style="margin:0 0 20px">Less paperwork. More time for people.</p><h2 class="zt-big zt-in">Let’s walk through it.</h2><div class="zt-list">
      <span class="zt-in">Getting around</span><span class="zt-in">Members</span><span class="zt-in">Attendance</span><span class="zt-in">Giving</span><span class="zt-in">Messaging</span><span class="zt-in">Events</span><span class="zt-in">Ellen (AI)</span><span class="zt-in">Flyers</span><span class="zt-in">Links & QR</span><span class="zt-in">Reports & branches</span><span class="zt-in">Settings & plans</span><span class="zt-in">Help</span></div></div>`, 'purple')
    await sleep(200); await reveal(0)
    await atw('let me show'); await reveal(1)
    for (let i = 2; i <= 13; i++) { await sleep(220); await reveal(i) }
  },

  // ───── Part 2: tutorials ─────
  b09: async () => {
    await go('/dashboard', 600); await card(''); await T.chapter('1', 'Getting around')
    await sleep(400); await T.move('css:main h1, main h2'); await T.zoom('css:main h1, main h2', 1.18)
  },
  b10: async () => {
    await T.zoom(null, 1); await sleep(300)
    await T.ring('Newcomer follow-up'); await T.move('Newcomer follow-up')
    await atw('discipleship'); await T.ring('Discipleship funnel'); await T.move('Discipleship funnel')
    await atw('birthdays'); await T.ring('Upcoming birthdays'); await T.move('Upcoming birthdays')
    await atw("what's coming"); await T.ring('Coming up'); await T.move('Coming up')
  },
  b11: async () => {
    await T.unring(); await T.ring('css:.d-nav'); await T.move('css:.d-nav')
    await atw('people holds'); await T.unring(); await T.click('css:div.d-navgroup:nth-of-type(1) > button')
    await atw('finance holds'); await T.click('css:div.d-navgroup:nth-of-type(1) > button'); await T.click('css:div.d-navgroup:nth-of-type(2) > button')
    await atw('outreach'); await T.click('css:div.d-navgroup:nth-of-type(2) > button'); await T.click('css:div.d-navgroup:nth-of-type(3) > button')
    await at(beatDur - 1.2); await T.click('css:div.d-navgroup:nth-of-type(3) > button')
  },
  b12: async () => {
    await T.click('css:button.d-me')
    await atw('on a phone'); await T.click('css:button.d-me')
    await T.lower('On your phone', 'Tap the grid button', 'The same menu, right at the top of the screen.')
  },
  b13: async () => {
    await T.lower('', ''); await chapterCard('2', 'Members', 'Everyone in one place, grouped by stage')
  },
  b14: async () => {
    await T.click('Add member')
    await sleep(500); await T.type('Full name', 'Grace Okafor', 14)
    await atw('phone'); await T.type('css:.d-modal input[type=tel]', '803 555 0142', 14)
    await atw('email'); await T.type('Email', 'grace.okafor@gmail.com', 22)
    await atw('country code'); await T.ring('css:.d-modal label:has(input[type=tel])'); await T.move('css:.d-modal label:has(input[type=tel]) select')
    await atw('birthday'); await T.unring(); await T.select('Branch', 'Main'); await atw('department'); await T.select('Department', 'Worship')
  },
  b15: async () => {
    await T.click('css:.d-modal .d-btn-ink, .d-modal button[type=submit]'); await sleep(700); await T.click('css:.cf-actions .d-btn-ink'); await sleep(700)
    await T.click('Esther Bello'); await sleep(600)
    await atw('giving'); await T.move('Detailed information')
  },
  b16: async () => {
    await T.unring(); await ev(`const b=[...document.querySelectorAll('button[aria-label]')].find(b=>/close/i.test(b.getAttribute('aria-label'))&&b.getBoundingClientRect().width>0); return b && T.click(b)`); await sleep(500)
    await T.ring('Import'); await T.move('Import')
    await atw('export'); await T.ring('Export'); await T.move('Export')
  },
  b17: async () => {
    await T.unring(); await go('/dashboard/attendance', 500); await T.chapter('3', 'Attendance & check-in')
    await T.ring('Your Sunday check-in QR code'); await T.move('Download QR'); await T.zoom('Your Sunday check-in QR code', 1.25)
  },
  b18: async () => {
    await T.zoom(null, 1); await sleep(400)
    await T.ring('Follow up when someone misses church'); await T.click('Send automatic check-ups')
  },
  b19: async () => {
    await T.unring(); await go('/dashboard/giving', 500); await T.chapter('4', 'Giving')
    await T.ring('Giving — last 6 months'); await T.move('Giving — last 6 months')
    await atw('by fund'); await T.ring('By fund'); await T.move('By fund')
  },
  b20: async () => {
    await T.unring(); await T.click('Record gift'); await sleep(600)
    await atw('the member'); await T.ring('css:.d-modal select'); await atw('the amount'); await T.type('css:.d-modal input[type=number]', '50', 6)
  },
  b21: async () => {
    await T.unring(); await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(400)
    await T.click('Expenses')
  },
  b22: async () => {
    await go('/dashboard/messaging', 500); await T.chapter('5', 'Messaging')
    await atw('sms'); await T.click('SMS'); await atw('whatsapp'); await T.click('WhatsApp'); await atw('or email'); await T.click('Email'); await sleep(500); await T.click('WhatsApp')
  },
  b23: async () => {
    await T.ring('Send to'); await T.select('Send to', 'Everyone')
    await atw('one stage'); await T.select('Send to', 'A stage')
    await atw('department'); await T.select('Send to', 'A department')
    await atw('branch'); await T.select('Send to', 'A branch')
  },
  b24: async () => {
    await T.unring(); await T.click('Welcome newcomer')
    await atw('service reminder'); await T.click('Service reminder')
    await atw('thank-you'); await T.click('Thank you for giving')
    await atw('own language'); await T.ring('Français'); await T.move('Français')
  },
  b25: async () => {
    await T.unring(); await T.click('css:main button.d-btn-ink'); await sleep(900)
    await T.click('css:.cf-actions .d-btn-ink')
    await atw('reply'); await T.click('Inbox')
    await atw('birthdays'); await go('/dashboard'); await T.ring('Upcoming birthdays'); await T.move('Upcoming birthdays')
  },
  b26: async () => {
    await T.unring(); await go('/dashboard/events', 500); await T.chapter('6', 'Events')
    await atw('new event'); await T.click('New event'); await sleep(500)
    await atw('add the date'); await T.type('css:.d-modal input:not([type=date]):not([type=time])', 'Youth Conference', 14)
    await atw("if it's online"); await T.click('Online'); await sleep(300); await atw('google meet'); await T.ring('css:.ev-meet'); await T.move('css:.ev-meet')
  },
  b27: async () => {
    await T.unring(); await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(400)
    await T.ring('Worship Night'); await T.move('Worship Night')
  },
  b28: async () => {
    await T.unring(); await go('/dashboard/ai', 600); await T.chapter('7', 'Ellen, your AI assistant')
    if (await ev(`return !!T.q('New chat','button')`)) { await T.click('New chat'); await sleep(300) }
    await T.zoom('css:main h1, main h2', 1.2); await T.move('css:main h1, main h2')
  },
  b29: async () => {
    await T.zoom(null, 1); await sleep(300)
    await T.click('Check follow-ups')
    await atw('finance summary'); await T.click('New chat'); await sleep(300); await T.click('Finance summary')
    await atw('announcement'); await T.click('New chat'); await sleep(300); await T.click('Write announcement')
  },
  b30: async () => {
    await go('/dashboard/design', 600); await T.chapter('8', 'Flyers & Design Studio')
    await atw('event title'); await T.type('Event title', 'Worship Night', 12)
    await atw('the date'); await T.type('Date & time', 'Friday, Oct 16 · 7 PM', 18)
    await atw('the place'); await T.type('Location', 'Main Auditorium', 16)
    await atw('bold'); await T.click('Bold')
    await atw('create flyer', -0.5); await T.click('Create flyer')
  },
  b31: async () => {
    for (let i = 0; i < 40 && !(await ev(`return !!document.querySelector('main img[src^="data:image/png"]')`)); i++) await sleep(150)
    await T.ring('css:main img[src^="data:image/png"]', 14); await T.move('css:main img[src^="data:image/png"]')
    await T.zoom('css:main img[src^="data:image/png"]', 1.25)
    await atw('ready to download'); await T.zoom(null, 1); await T.unring(); await T.click('Save design'); await sleep(500); await T.click('css:.cf-actions .d-btn-ink')
    await atw('saved under'); await T.click('My designs')
  },
  b32: async () => {
    await T.click('Design team'); await sleep(700)
    await atw('short brief'); await T.ring('Let our designers make it for you'); await T.click('Request a flyer'); await sleep(600); await T.unring()
    await atw('chat'); await T.unring()
    await atw('order number'); await T.lower('Ministry Max', 'Order FLY-7C2A91E4', 'Delivered within 48 hours — follow it by email and in the app.')
  },
  b33: async () => {
    await T.lower('', ''); await go('/dashboard/links', 600); await T.chapter('9', 'Links & QR codes')
    await T.ring('css:.lk-card'); await T.move('css:.lk-card')
    await atw('qr code'); await T.ring('css:.lk-qr'); await T.move('css:.lk-qr')
  },
  b34: async () => {
    await T.unring(); await go('/dashboard/reports', 600); await T.chapter('10', 'Reports & branches')
    await T.ring('New people per month'); await T.move('New people per month')
    await atw('discipleship'); await T.ring('Discipleship stages'); await T.move('Discipleship stages')
    await atw('download'); await T.ring('CSV'); await T.move('CSV')
  },
  b35: async () => {
    await T.unring(); await go('/dashboard/branches', 600)
    await T.ring('css:main table'); await T.move('css:main table')
    await atw('reminders'); await T.ring('Remind all missing'); await T.move('Remind all missing')
  },
  b36: async () => {
    await T.unring(); await go('/dashboard/settings?tab=church', 600); await T.chapter('11', 'Settings, team & plans')
    await T.click('Church profile'); await sleep(400)
    await atw('currency'); await T.ring('Currency'); await T.move('Currency')
    await atw('text messages'); await T.ring('SMS sender name'); await T.move('SMS sender name')
  },
  b37: async () => {
    await T.unring(); await T.click('Team & roles'); await sleep(500)
    await atw('each role'); await T.move('css:main select, main table')
  },
  b38: async () => {
    await T.click('Plan'); await sleep(600)
    await atw('essentials covers'); await T.ring('css:.st-plan:nth-child(1), .plan-card:nth-child(1)'); await T.move('Essentials')
    await atw('ministry plus'); await T.ring('css:.st-plan:nth-child(2), .plan-card:nth-child(2)'); await T.move('Ministry Plus')
    await atw('ministry max'); await T.ring('css:.st-plan:nth-child(3), .plan-card:nth-child(3)'); await T.move('Ministry Max')
    await atw('upgrade'); await T.unring()
  },
  b39: async () => {
    await go('/dashboard/help', 600); await T.chapter('12', 'Help & support')
    await T.click('How do I import my existing members?')
    await atw('send a message'); await T.ring('Still need help?'); await T.move('Still need help?')
    await atw('ticket number'); await T.lower('Support', 'Ticket ZD-1FDA5C19', 'Confirmed by email · we reply right inside ZionDesk.')
  },
  b40: async () => {
    await T.lower('', ''); await T.chapter('', '')
    await card(`<div style="text-align:center"><img class="zt-logo zt-in" src="/brand/logo-lime.png" alt=""><h2 class="zt-mid zt-in">Start with your members.<br><span class="zt-lime">Send your first message this week.</span></h2><p class="zt-sub zt-in" style="font-size:36px;opacity:.9">ziondesk.com</p></div>`, 'purple')
    await sleep(300); await reveal(0)
    await atw('start with'); await reveal(1)
    await atw('we\'re really'); await reveal(2)
  },
}

/* ───────── run ───────── */
const list = beats.filter((b) => !only || only.includes(b.id))
const recPath = join(out, only ? `test-${only.join('-')}.mp4` : 'screen.mp4')
// Own recorder: CDP screencast frames at full device resolution (1920×1080), written at a steady 30 fps
// (the newest frame is repeated when nothing changed), so video time = wall-clock time = beat timeline.
const cdp = await page.createCDPSession()
let latest = null
cdp.on('Page.screencastFrame', (f) => {
  latest = Buffer.from(f.data, 'base64')
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
})
const { spawn } = await import('node:child_process')
const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-', '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', recPath], { stdio: ['pipe', 'inherit', 'inherit'] })
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
while (!latest) await sleep(20)
const t0 = Date.now()
let written = 0
const ticker = setInterval(() => {
  const due = Math.floor(((Date.now() - t0) / 1000) * 30)
  while (written <= due) { ff.stdin.write(latest); written++ }
}, 1000 / 60)
const recorder = { stop: async () => { clearInterval(ticker); await cdp.send('Page.stopScreencast'); ff.stdin.end(); await new Promise((r) => ff.on('close', r)) } }
const timeline = []
for (const b of list) {
  // Tutorial chapters open with a short title card (no voice).
  const chapterIdx = ['b09', 'b13', 'b17', 'b19', 'b22', 'b26', 'b28', 'b30', 'b33', 'b34', 'b36', 'b39'].indexOf(b.id)
  if (chapterIdx >= 0 && b.id !== 'b13') {
    const names = ['Getting around', '', 'Attendance & check-in', 'Giving', 'Messaging', 'Events', 'Ellen, your AI assistant', 'Flyers & Design Studio', 'Links & QR codes', 'Reports & branches', 'Settings, team & plans', 'Help & support']
    await T.lower('', '')
    await chapterCard(String(chapterIdx + 1), names[chapterIdx])
    await sleep(CHAPTER_CARD * 1000)
  }
  beatStart = Date.now()
  beatDur = b.voice + GAP
  beatText = b.text
  timeline.push({ id: b.id, start: (beatStart - t0) / 1000, voice: b.voice, chapter: b.chapter ?? null })
  process.stdout.write(`${b.id} @${((beatStart - t0) / 1000).toFixed(1)}s (${beatDur.toFixed(1)}s)\n`)
  if (b.id === 'b13') {
    // Members chapter: the title card is the first part of the line, then the page.
    await S.b13(); await at(1.6); await go('/dashboard/members', 400); await card(''); await T.chapter('2', 'Members')
    await T.ring('First-time guests'); await T.move('First-time guests')
    await atw('new believers'); await T.ring('New believers'); await T.move('New believers')
    await atw('church family'); await T.ring('Church family'); await T.move('Church family')
    await atw('workers'); await T.ring('Serving teams'); await T.move('Serving teams')
    await at(beatDur - 0.4); await T.unring()
  } else {
    if (chapterIdx >= 0) await card('')
    await S[b.id]?.()
  }
  if (shots) await page.screenshot({ path: join(out, `shot-${b.id}.jpg`), type: 'jpeg', quality: 70 })
  await at(beatDur)
}
await sleep(1500)
const total = (Date.now() - t0) / 1000
await recorder.stop()
writeFileSync(join(out, only ? 'timeline-test.json' : 'timeline.json'), JSON.stringify({ lead: 0, total, beats: timeline }, null, 1))
console.log(`recorded ${total.toFixed(1)}s → ${recPath}`)
await browser.close()
