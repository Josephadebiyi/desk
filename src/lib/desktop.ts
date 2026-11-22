import { useEffect, useState } from 'react'

/**
 * ZionDesk desktop apps (desktop/ in this repo, built by .github/workflows/desktop.yml).
 *
 * Preferred: the installers shipped with the website itself in /downloads/ (npm run desktop:fetch puts them
 * in public/downloads/ before a build). If this deployment doesn't have them, the links fall back to the newest
 * GitHub Release. VITE_DESKTOP_MAC_URL / VITE_DESKTOP_WIN_URL override both.
 */
const RELEASES = 'https://github.com/Josephadebiyi/desk/releases/latest/download'
const env = (k: string) => ((import.meta.env[k] as string | undefined) ?? '').trim()

export const SELF_HOSTED = { mac: '/downloads/ZionDesk-mac.dmg', win: '/downloads/ZionDesk-Setup.exe' }
export const GITHUB_DOWNLOADS = { mac: `${RELEASES}/ZionDesk-mac.dmg`, win: `${RELEASES}/ZionDesk-Setup.exe` }
const OVERRIDE = { mac: env('VITE_DESKTOP_MAC_URL'), win: env('VITE_DESKTOP_WIN_URL') }

/** Is an installer really on this site? (A missing file would come back as the app's index.html.) */
async function hosted(path: string): Promise<boolean> {
  try {
    const r = await fetch(path, { method: 'HEAD', cache: 'no-store' })
    return r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')
  } catch {
    return false
  }
}

/** Download links for the Mac and Windows installers. */
export function useDesktopLinks(): { mac: string; win: string } {
  const [links, setLinks] = useState({ mac: OVERRIDE.mac || GITHUB_DOWNLOADS.mac, win: OVERRIDE.win || GITHUB_DOWNLOADS.win })
  useEffect(() => {
    let live = true
    for (const os of ['mac', 'win'] as const) {
      if (OVERRIDE[os]) continue
      hosted(SELF_HOSTED[os]).then((ok) => live && ok && setLinks((l) => ({ ...l, [os]: SELF_HOSTED[os] })))
    }
    return () => {
      live = false
    }
  }, [])
  return links
}

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
