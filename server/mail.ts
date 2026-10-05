/**
 * Email via Resend (https://resend.com/docs/api-reference). Every email is rendered in the
 * recipient's language from src/emails/catalog.ts.
 */
import { renderEmail } from '../src/emails/render'
import type { EmailKind } from '../src/emails/catalog'
import { asEmailLang } from '../src/emails/strings'
import { configured, env } from './env'
import { HttpError } from './db'

export interface Outgoing {
  to: string
  replyTo?: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

export function compose(kind: EmailKind, lang: unknown, to: string, vars: Record<string, string | number>, url?: string, opts: { unsubscribeUrl?: string } = {}): Outgoing {
  const r = renderEmail({ kind, lang: asEmailLang(lang), vars, url, siteUrl: env.siteUrl, unsubscribeUrl: opts.unsubscribeUrl })
  // One-click unsubscribe (Gmail / Yahoo bulk-sender rules) for marketing-type emails.
  const headers = opts.unsubscribeUrl ? { 'List-Unsubscribe': `<${opts.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined
  return { to, ...r, ...(headers ? { headers } : {}) }
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

const payload = (m: Outgoing) => ({
  from: env.emailFrom,
  to: [m.to],
  subject: m.subject,
  html: m.html,
  text: m.text,
  ...(m.headers ? { headers: m.headers } : {}),
  ...(m.replyTo ? { reply_to: m.replyTo } : env.emailReplyTo ? { reply_to: env.emailReplyTo } : {}),
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
