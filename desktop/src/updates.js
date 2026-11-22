// Update notices and announcements for desktop users, controlled from the website.
//
// The app reads https://ziondesk.com/desktop.json (public/desktop.json in the web app) when it starts and
// every few hours:
//   {
//     "latest": "1.1.0",                       ← newest desktop app version; older apps offer to update
//     "notes": "What's new in this version",   ← shown in the update prompt
//     "required": false,                       ← true: "Later" isn't offered
//     "message": {                             ← optional announcement, shown once as a notification
//       "id": "2026-12-christmas",             ← change the id to send a new message
//       "title": "Christmas service rota",
//       "body": "The new rota is ready in Events.",
//       "url": "/dashboard/events"             ← optional page to open when clicked
//     }
//   }
// Website changes never need this: the app always loads the live ZionDesk.
const { app, dialog, Notification } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const CHECK_EVERY = 6 * 60 * 60 * 1000
const seenFile = () => path.join(app.getPath('userData'), 'notices.json')

function readSeen() {
  try {
    return JSON.parse(fs.readFileSync(seenFile(), 'utf8'))
  } catch {
    return { messages: [] }
  }
}
function markSeen(id) {
  const seen = readSeen()
  seen.messages = [...new Set([...(seen.messages || []), id])].slice(-200)
  try {
    fs.writeFileSync(seenFile(), JSON.stringify(seen))
  } catch {}
}

/** 1.10.0 > 1.9.2 */
function newer(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  }
  return false
}

/**
 * @param {{ origin: string, getWindow: () => Electron.BrowserWindow | null, openExternal: (u: string) => void, openInApp: (u: string) => void }} opts
 */
function setupUpdates({ origin, getWindow, openExternal, openInApp }) {
  const manifestUrl = new URL('/desktop.json', origin).href
  const downloadPage = new URL('/download', origin).href
  let promptedThisSession = ''
  let prompting = false

  async function fetchManifest() {
    const res = await fetch(manifestUrl, { cache: 'no-store' })
    if (!res.ok) throw new Error(`desktop.json: ${res.status}`)
    return res.json() // a missing file comes back as the web app's HTML → throws, ignored
  }

  async function promptUpdate(m, manual) {
    if (prompting) return
    prompting = true
    try {
      const required = m.required === true
      const { response } = await dialog.showMessageBox(getWindow() || undefined, {
        type: 'info',
        title: 'Update available',
        message: `A new version of ZionDesk (${m.latest}) is available.`,
        detail: `${m.notes ? m.notes + '\n\n' : ''}You have version ${app.getVersion()}. Download the new version from the ZionDesk website and install it over this one — your sign-in and settings stay as they are.`,
        buttons: required ? ['Download update'] : ['Download update', 'Later'],
        defaultId: 0,
        cancelId: required ? 0 : 1,
        noLink: true,
      })
      if (response === 0) openExternal(downloadPage)
      else if (!manual) promptedThisSession = m.latest // ask again next time the app starts
    } finally {
      prompting = false
    }
  }

  function showMessage(msg) {
    if (!msg || !msg.id || !msg.title || readSeen().messages.includes(msg.id)) return
    if (!Notification.isSupported()) return
    markSeen(msg.id)
    const n = new Notification({ title: String(msg.title), body: String(msg.body || ''), silent: false })
    n.on('click', () => {
      const w = getWindow()
      if (w) {
        if (w.isMinimized()) w.restore()
        w.show()
        w.focus()
      }
      if (msg.url) openInApp(new URL(msg.url, origin).href)
    })
    n.show()
  }

  async function check(manual = false) {
    let m
    try {
      m = await fetchManifest()
    } catch (e) {
      if (manual) dialog.showMessageBox(getWindow() || undefined, { type: 'warning', message: 'Couldn’t check for updates.', detail: 'Check your internet connection and try again.' })
      return
    }
    if (m.latest && newer(m.latest, app.getVersion())) {
      if (manual || m.required === true || promptedThisSession !== m.latest) await promptUpdate(m, manual)
    } else if (manual) {
      dialog.showMessageBox(getWindow() || undefined, { type: 'info', message: 'ZionDesk is up to date.', detail: `You have the latest version (${app.getVersion()}).` })
    }
    if (!manual) showMessage(m.message)
  }

  setTimeout(() => check(), 8000)
  setInterval(() => check(), CHECK_EVERY)
  return { checkNow: () => check(true) }
}

module.exports = { setupUpdates, newer }
