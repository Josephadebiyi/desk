/**
 * Email via Resend (https://resend.com/docs/api-reference). Every email is rendered in the
 * recipient's language from src/emails/catalog.ts.
 */
import { renderEmail } from '../src/emails/render'
import type { EmailKind } from '../src/emails/catalog'
import { asEmailLang } from '../src/emails/strings'
import { configured, env } from './env'
import { db, HttpError } from './db'

export interface Outgoing {
  to: string
  /** Optional sender display name (address stays EMAIL_FROM's). */
  fromName?: string
  replyTo?: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

/**
 * opts.church: an email from the church to its own people (not a ZionDesk account email) — the church's name and
 * logo instead of ZionDesk's, sent as the church, and replies go to the church's email address.
 */
export function compose(kind: EmailKind, lang: unknown, to: string, vars: Record<string, string | number>, url?: string, opts: { unsubscribeUrl?: string; church?: { name: string; logoUrl?: string | null; email?: string | null } } = {}): Outgoing {
  const r = renderEmail({ kind, lang: asEmailLang(lang), vars, url, siteUrl: env.siteUrl, unsubscribeUrl: opts.unsubscribeUrl, church: opts.church })
  if (opts.church) {
    // One address, or a few admins' addresses separated by commas (from churchBrand).
    const replyTo = opts.church.email && opts.church.email.split(',').every((e) => EMAIL_OK.test(e.trim())) ? opts.church.email : undefined
    return { to, ...r, fromName: opts.church.name.slice(0, 70) || undefined, ...(replyTo ? { replyTo } : {}) }
  }
  // One-click unsubscribe (Gmail / Yahoo bulk-sender rules) for marketing-type emails.
  const headers = opts.unsubscribeUrl ? { 'List-Unsubscribe': `<${opts.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined
  return { to, ...r, ...(headers ? { headers } : {}) }
}

const EMAIL_OK = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/
export type ChurchBrand = { name: string; logoUrl?: string | null; email?: string | null }
const brands = new Map<string, { at: number; brand: ChurchBrand }>()
/** A church's name, logo and email for emails it sends to its own people (cached for 5 minutes). */
export async function churchBrand(churchId: string): Promise<ChurchBrand> {
  const hit = brands.get(churchId)
  if (hit && Date.now() - hit.at < 300_000) return hit.brand
  const { data } = await db().from('churches').select('name, logo_url, email').eq('id', churchId).maybeSingle()
  let email = String(data?.email ?? '').trim()
  // No church email in Church profile: replies go to the church's admins, never to ZionDesk.
  if (!EMAIL_OK.test(email)) {
    const { data: admins } = await db().from('church_users').select('profiles(email)').eq('church_id', churchId).eq('role', 'admin').limit(3)
    email = ((admins ?? []) as unknown as { profiles: { email: string } | null }[]).map((a) => a.profiles?.email ?? '').filter((e) => EMAIL_OK.test(e)).join(', ')
  }
  const brand = { name: (data?.name as string) ?? '', logoUrl: (data?.logo_url as string | null) ?? null, email: email || null }
  brands.set(churchId, { at: Date.now(), brand })
  return brand
}

async function resend(path: string, body: unknown) {
  if (!configured.email) throw new HttpError(503, 'Email is not configured on the server (RESEND_API_KEY).')
  const res = await fetch(`https://api.resend.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new HttpError(502, `Email provider error: ${String(data.message ?? res.status)}`)
  return data
}

const fromWithName = (name: string) => `${name.replace(/[<>"]/g, '').trim()} <${env.emailFrom.match(/<([^>]+)>/)?.[1] ?? env.emailFrom}>`
const payload = (m: Outgoing) => ({
  from: m.fromName ? fromWithName(m.fromName) : env.emailFrom,
  to: [m.to],
  subject: m.subject,
  html: m.html,
  text: m.text,
  ...(m.headers ? { headers: m.headers } : {}),
  ...(m.replyTo ? { reply_to: m.replyTo.split(',').map((e) => e.trim()) } : env.emailReplyTo ? { reply_to: env.emailReplyTo } : {}),
})

export async function sendEmail(m: Outgoing): Promise<string | undefined> {
  const data = await resend('/emails', payload(m))
  return data.id as string | undefined
}

/** Up to 100 emails per call (Resend batch API). Returns provider ids in order. */
export async function sendEmails(list: Outgoing[]): Promise<(string | undefined)[]> {
  const ids: (string | undefined)[] = []
  for (let i = 0; i < list.length; i += 100) {
    const data = (await resend('/emails/batch', list.slice(i, i + 100).map(payload))) as { data?: { id: string }[] }
    ids.push(...(data.data ?? []).map((d) => d.id))
  }
  return ids
}
