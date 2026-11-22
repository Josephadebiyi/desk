// ZionDesk desktop app (macOS + Windows).
// A native window around the live ZionDesk web app, so churches always get the latest version
// without reinstalling. Sign-in, payments and Google connect all happen inside the window and
// come back to ZionDesk; ordinary outside links open in the computer's own browser.
// Google sign-in is the exception: Google refuses embedded windows ("This browser or app may not be
// secure"), so it runs in the computer's own browser and comes back through a ziondesk:// link.
const { app, BrowserWindow, Menu, shell, session, screen, ipcMain } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { setupUpdates } = require('./updates')

const HOME = new URL(process.env.ZIONDESK_URL || 'https://ziondesk.com/dashboard')
const APP_HOSTS = new Set([HOME.host, 'ziondesk.com', 'www.ziondesk.com', 'admin.ziondesk.com', 'api.ziondesk.com', 'desk-noae.onrender.com'])
// Full-page flows that leave ZionDesk and come straight back: sign-in, checkout, billing portal.
const FLOW_HOST_SUFFIXES = [
  'supabase.co',
  'accounts.google.com',
  'paystack.com',
  'paystack.co',
  'flutterwave.com',
  'stripe.com',
]
const BG = '#07050d'
const PROTOCOL = 'ziondesk'

const isAppUrl = (u) => {
  try {
    const url = new URL(u)
    return APP_HOSTS.has(url.host)
  } catch {
    return false
  }
}
const isFlowUrl = (u) => {
  try {
    const { hostname } = new URL(u)
    return FLOW_HOST_SUFFIXES.some((s) => hostname === s || hostname.endsWith('.' + s))
  } catch {
    return false
  }
}
// Pages the desktop app shows. Anything else on the website (home page, pricing, features…) is
// the marketing site and is replaced by the sign-in screen.
const LOGIN = new URL('/login', HOME).href
const APP_PATHS = /^\/(login|register|forgot-password|reset-password|dashboard|admin|join|give|checkin|api|desktop-auth|legal|privacy|terms|cookies|dpa|subprocessors|refunds|acceptable-use|email-preview)(\/|$)/
const isLandingUrl = (u) => {
  try {
    const url = new URL(u)
    if (!isAppUrl(u) || url.host.startsWith('admin.') || url.host.startsWith('api.') || url.host.endsWith('onrender.com')) return false
    return !APP_PATHS.test(url.pathname)
  } catch {
    return false
  }
}
const openExternal = (u) => {
  if (/^(https?|mailto|tel):/i.test(u)) shell.openExternal(u)
}

// ── Remember window size and position ──
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')
function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y)
    return visible ? b : { width: b.width, height: b.height, maximized: b.maximized }
  } catch {
    return { width: 1360, height: 860 }
  }
}
function saveBounds(win) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }))
  } catch {}
}

let win = null
let updates = null
let quitting = false

// ── Google sign-in in the computer's own browser ──
// The app opens ziondesk.com/desktop-auth in the browser with a one-time code. After Google, that page
// opens ziondesk://auth#ds=<code>&at=…&rt=…&to=…; only a link carrying the code we just issued is accepted,
// so another website can't slip a different account into the app.
let pendingSignIn = null // { code, expires }
const SIGN_IN_TTL = 15 * 60 * 1000
const safePath = (p) => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : '/dashboard')

function startGoogleSignIn(returnTo) {
  pendingSignIn = { code: crypto.randomBytes(24).toString('hex'), expires: Date.now() + SIGN_IN_TTL }
  const u = new URL('/desktop-auth', HOME)
  u.searchParams.set('ds', pendingSignIn.code)
  u.searchParams.set('to', safePath(returnTo))
  shell.openExternal(u.href)
}

let queuedLink = null
function handleDeepLink(link) {
  if (typeof link !== 'string' || !link.toLowerCase().startsWith(PROTOCOL + '://')) return
  if (!app.isReady() || !win) {
    queuedLink = link
    return
  }
  let p
  try {
    const u = new URL(link)
    p = new URLSearchParams(u.hash.slice(1))
  } catch {
    return
  }
  const ok = pendingSignIn && Date.now() < pendingSignIn.expires && p.get('ds') === pendingSignIn.code && p.get('at') && p.get('rt')
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (!ok) return
  pendingSignIn = null
  const back = new URL('/desktop-auth', HOME)
  back.hash = new URLSearchParams({ at: p.get('at'), rt: p.get('rt'), to: safePath(p.get('to')) }).toString()
  win.loadURL(back.href)
}

// Messages from ZionDesk pages (preload.js): Google sign-in and the Back / Forward buttons.
const fromApp = (e) => win && e.sender === win.webContents && isAppUrl(e.senderFrame?.url || e.sender.getURL())
ipcMain.handle('zd:google-sign-in', (e, returnTo) => {
  if (!fromApp(e)) return false
  startGoogleSignIn(returnTo)
  return true
})
ipcMain.on('zd:nav', (e, dir) => {
  if (!win || e.sender !== win.webContents) return
  const h = win.webContents.navigationHistory
  if (dir === 'back' && h.canGoBack()) h.goBack()
  if (dir === 'forward' && h.canGoForward()) h.goForward()
})
function navState() {
  const h = win.webContents.navigationHistory
  return { back: h.canGoBack(), forward: h.canGoForward() }
}
function sendNavState() {
  if (!win || win.webContents.isDestroyed()) return
  win.webContents.send('zd:nav-state', navState())
}
ipcMain.handle('zd:nav-state', (e) => (win && e.sender === win.webContents ? navState() : { back: false, forward: false }))

function createWindow() {
  const b = loadBounds()
  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    minWidth: 960,
    minHeight: 600,
    title: 'ZionDesk',
    backgroundColor: BG,
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })
  if (b.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())

  const wc = win.webContents

  // New windows (target=_blank, window.open): ZionDesk pages stay in the app, everything else
  // opens in the default browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) wc.loadURL(url)
    else openExternal(url)
    return { action: 'deny' }
  })

  // From a ZionDesk page, only ZionDesk and sign-in/payment flows load in the window.
  // Once inside a flow (e.g. a card checkout redirecting to a bank's 3-D Secure page), let it finish.
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith('file:')) return
    if (isLandingUrl(url)) {
      e.preventDefault()
      wc.loadURL(LOGIN)
      return
    }
    const fromApp = isAppUrl(wc.getURL()) || wc.getURL().startsWith('file:')
    if (!fromApp || isAppUrl(url) || isFlowUrl(url)) return
    e.preventDefault()
    openExternal(url)
  })

  // The desktop app is the dashboard, never the marketing website: links to the home page
  // (logo, "back to website", sign-out) go to the sign-in screen, which opens the dashboard
  // straight away when already signed in.
  const toLoginIfLanding = (_e, url, ...rest) => {
    const isMainFrame = typeof rest[0] === 'boolean' ? rest[0] : true
    if (isMainFrame && isLandingUrl(url)) wc.loadURL(LOGIN)
  }
  wc.on('did-navigate', toLoginIfLanding)
  wc.on('did-navigate-in-page', toLoginIfLanding)

  // Keep the in-window Back / Forward buttons in step with the page history.
  wc.on('did-navigate', sendNavState)
  wc.on('did-navigate-in-page', sendNavState)
  wc.on('dom-ready', sendNavState)

  // No connection → a friendly offline page that retries.
  wc.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted, e.g. a redirect */) return
    const retry = isAppUrl(url) ? url : HOME.href
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { retry } })
  })

  win.on('close', (e) => {
    saveBounds(win)
    // macOS: closing the window keeps ZionDesk running in the Dock, like other Mac apps.
    if (process.platform === 'darwin' && !quitting) {
      e.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => (win = null))

  win.loadURL(HOME.href)
  if (queuedLink) wc.once('did-finish-load', () => {
    const l = queuedLink
    queuedLink = null
    handleDeepLink(l)
  })
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const go = (p) => win && win.loadURL(new URL(p, HOME).href)
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { label: 'Check for Updates…', click: () => updates?.checkNow() },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+Shift+H', click: () => go('/dashboard') },
        { label: 'Members', click: () => go('/dashboard/members') },
        { label: 'Giving', click: () => go('/dashboard/giving') },
        { label: 'Messaging', click: () => go('/dashboard/messaging') },
        { label: 'Events', click: () => go('/dashboard/events') },
        { label: 'Design Studio', click: () => go('/dashboard/design') },
        { label: 'Ellen (AI)', click: () => go('/dashboard/ai') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => go('/dashboard/settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Back', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: () => win?.webContents.navigationHistory.goBack() },
        { label: 'Forward', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: () => win?.webContents.navigationHistory.goForward() },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'ZionDesk Help', click: () => go('/dashboard/help') },
        { label: 'Open ZionDesk in Browser', click: () => shell.openExternal(win?.webContents.getURL().startsWith('http') ? win.webContents.getURL() : HOME.href) },
        { label: 'Visit ziondesk.com', click: () => shell.openExternal('https://ziondesk.com') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: 'Check for Updates…', click: () => updates?.checkNow() }]),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ziondesk:// links (the end of Google sign-in) open this app.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}
// macOS delivers the link as an event (register before the app is ready).
app.on('open-url', (e, link) => {
  e.preventDefault()
  handleDeepLink(link)
})
// Windows delivers it on the command line.
queuedLink = process.argv.find((a) => a.toLowerCase().startsWith(PROTOCOL + '://')) || null

// One ZionDesk at a time: opening it again brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const link = argv.find((a) => a.toLowerCase().startsWith(PROTOCOL + '://'))
    if (link && win) return handleDeepLink(link)
    if (link) queuedLink = link
    if (!win) return createWindow()
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.ziondesk.desktop')

    // Look like regular Chrome to websites (Google sign-in refuses unknown embedded browsers).
    const ua = session.defaultSession.getUserAgent().replace(/\s(Electron|ziondesk-desktop|ZionDesk)\/\S+/gi, '')
    session.defaultSession.setUserAgent(ua)
    app.userAgentFallback = ua

    // Notifications, camera (check-in scanning), microphone, clipboard: only for ZionDesk itself.
    const allowed = new Set(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'])
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
      cb(allowed.has(permission) && isAppUrl(details.requestingUrl || wc.getURL()))
    })
    session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => allowed.has(permission) && isAppUrl(origin))

    buildMenu()
    createWindow()

    // New app versions and announcements, published on the website (public/desktop.json).
    updates = setupUpdates({
      origin: HOME.origin,
      getWindow: () => win,
      openExternal,
      openInApp: (url) => {
        if (!win) createWindow()
        if (isAppUrl(url)) win.loadURL(url)
        else openExternal(url)
      },
    })
  })

  app.on('activate', () => {
    if (win) win.show()
    else createWindow()
  })
  app.on('before-quit', () => (quitting = true))
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
