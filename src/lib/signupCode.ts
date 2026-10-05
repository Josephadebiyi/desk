/**
 * Promo / referral codes for sign-up attribution (PR campaigns, partners, events).
 * A link like ziondesk.com/?promo=EASTER26 or /register?ref=PARTNER1 is remembered for 30 days,
 * pre-fills the sign-up form and the promo box in Settings → Plan.
 */
const KEY = 'ziondesk-signup-code'
const clean = (v: string | null | undefined) => (v ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32)

export function captureSignupCode() {
  try {
    const p = new URLSearchParams(window.location.search)
    const code = clean(p.get('promo') ?? p.get('code') ?? p.get('ref'))
    if (code.length >= 3) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }))
  } catch {
    /* storage blocked */
  }
}

export function getSignupCode(): string {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code: string; at: number } | null
    return v && Date.now() - v.at < 30 * 864e5 ? clean(v.code) : ''
  } catch {
    return ''
  }
}

export const normalizeCode = clean
