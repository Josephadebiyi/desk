/**
 * Canonical public address for links people keep (QR codes, giving links, flyers).
 * Always the main domain in production, even if the dashboard was opened via *.onrender.com
 * or the admin domain. Override with VITE_PUBLIC_URL. Local development keeps its own origin.
 */
export function publicOrigin(): string {
  const configured = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim().replace(/\/$/, '')
  if (configured) return configured
  if (typeof window === 'undefined') return 'https://ziondesk.com'
  const h = window.location.hostname
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return window.location.origin
  return 'https://ziondesk.com'
}
