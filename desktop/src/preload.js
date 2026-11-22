// Lets the web app know it is running inside the desktop app (window.ziondeskDesktop),
// and adds small Back / Forward buttons to every page.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ziondeskDesktop', {
  isDesktop: true,
  platform: process.platform,
  // Google refuses to sign in inside app windows, so the app runs it in the computer's own browser.
  googleSignIn: (returnTo) => ipcRenderer.invoke('zd:google-sign-in', String(returnTo || '/dashboard')),
})

// ── Back / Forward buttons ──
// Drawn in a closed shadow root so the website's styles can't change them (and theirs can't leak out).
const ARROW = (d) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`

let navState = { back: false, forward: false }
let applyNav = () => {}
ipcRenderer.on('zd:nav-state', (_e, s) => {
  navState = s
  applyNav()
})

function mountNav() {
  if (document.getElementById('zd-desktop-nav') || !document.body) return
  const host = document.createElement('div')
  host.id = 'zd-desktop-nav'
  const root = host.attachShadow({ mode: 'closed' })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .bar { position: fixed; left: 14px; bottom: 14px; z-index: 2147483000; display: flex; gap: 4px; padding: 4px;
        border-radius: 999px; background: rgba(20, 16, 32, 0.78); box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); transition: opacity .2s, transform .2s; }
      .bar.hidden { opacity: 0; transform: translateY(8px); pointer-events: none; }
      button { all: unset; box-sizing: border-box; display: grid; place-items: center; width: 34px; height: 34px;
        border-radius: 50%; color: #fff; cursor: pointer; transition: background .15s; }
      button:hover { background: rgba(255,255,255,0.14); }
      button:focus-visible { outline: 2px solid #c4ec62; outline-offset: 1px; }
      button[hidden] { display: none; }
      @media print { .bar { display: none; } }
    </style>
    <div class="bar hidden" role="navigation" aria-label="Page history">
      <button class="back" title="Back" aria-label="Back">${ARROW('M15 18l-6-6 6-6')}</button>
      <button class="fwd" title="Forward" aria-label="Forward" hidden>${ARROW('M9 18l6-6-6-6')}</button>
    </div>`
  const bar = root.querySelector('.bar')
  const back = root.querySelector('.back')
  const fwd = root.querySelector('.fwd')
  back.addEventListener('click', () => ipcRenderer.send('zd:nav', 'back'))
  fwd.addEventListener('click', () => ipcRenderer.send('zd:nav', 'forward'))
  applyNav = () => {
    bar.classList.toggle('hidden', !navState.back && !navState.forward)
    back.hidden = !navState.back
    fwd.hidden = !navState.forward
  }
  applyNav()
  document.body.appendChild(host)
  const refresh = () => ipcRenderer.invoke('zd:nav-state').then((s) => { navState = s; applyNav() }).catch(() => {})
  refresh()
  // Single-page navigation (React Router) doesn't reload the page: ask again whenever the address changes.
  window.addEventListener('popstate', refresh)
  let last = location.href
  setInterval(() => {
    if (location.href !== last) {
      last = location.href
      refresh()
    }
  }, 400)
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', mountNav)
else mountNav()
