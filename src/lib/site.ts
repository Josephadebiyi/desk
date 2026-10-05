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

/**
 * True when this copy of the app is the staff console: an admin-only build (VITE_ADMIN_ONLY=1,
 * e.g. uploaded to its own domain), the host in VITE_ADMIN_HOST, or any "admin." address.
 */
export function isAdminHost(): boolean {
  if (import.meta.env.VITE_ADMIN_ONLY === '1') return true
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  const configured = (import.meta.env.VITE_ADMIN_HOST as string | undefined)?.trim()
  return configured ? h === configured : h.startsWith('admin.')
}
