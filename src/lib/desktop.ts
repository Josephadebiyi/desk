/**
 * ZionDesk desktop apps (desktop/ in this repo, built by .github/workflows/desktop.yml).
 * The installers are attached to the newest GitHub Release under fixed names, so these links
 * always download the latest version. Override with VITE_DESKTOP_MAC_URL / VITE_DESKTOP_WIN_URL
 * if the files are hosted somewhere else.
 */
const RELEASES = 'https://github.com/Josephadebiyi/desk/releases/latest/download'

export const DESKTOP_MAC_URL = ((import.meta.env.VITE_DESKTOP_MAC_URL as string | undefined) || `${RELEASES}/ZionDesk-mac.dmg`).trim()
export const DESKTOP_WIN_URL = ((import.meta.env.VITE_DESKTOP_WIN_URL as string | undefined) || `${RELEASES}/ZionDesk-Setup.exe`).trim()

/** True inside the ZionDesk desktop app (its preload script sets window.ziondeskDesktop). */
export const isDesktopApp = () => typeof window !== 'undefined' && !!(window as { ziondeskDesktop?: { isDesktop?: boolean } }).ziondeskDesktop?.isDesktop

export type DesktopOS = 'mac' | 'win' | 'other'

/** The visitor's computer, from the browser. Phones and Linux get "other". */
export function detectOS(): DesktopOS {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return 'other'
  if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return navigator.maxTouchPoints > 1 ? 'other' : 'mac' // iPadOS reports "Mac"
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'win'
  return 'other'
}
