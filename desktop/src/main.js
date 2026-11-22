// ZionDesk desktop app (macOS + Windows).
// A native window around the live ZionDesk web app, so churches always get the latest version
// without reinstalling. Sign-in, payments and Google connect all happen inside the window and
// come back to ZionDesk; ordinary outside links open in the computer's own browser.
const { app, BrowserWindow, Menu, shell, session, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

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
let quitting = false

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
    const fromApp = isAppUrl(wc.getURL()) || wc.getURL().startsWith('file:')
    if (!fromApp || isAppUrl(url) || isFlowUrl(url)) return
    e.preventDefault()
    openExternal(url)
  })

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
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const go = (p) => win && win.loadURL(new URL(p, HOME).href)
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
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
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// One ZionDesk at a time: opening it again brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
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
