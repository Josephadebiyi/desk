// Lets the web app know it is running inside the desktop app (window.ziondeskDesktop).
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('ziondeskDesktop', {
  isDesktop: true,
  platform: process.platform,
})
