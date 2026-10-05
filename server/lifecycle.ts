/**
 * ZionDesk's own emails to account holders:
 *   welcome (the moment a church is created) · subscription confirmed / monthly receipt ·
 *   account deleted · newsletter · weekly "finish your sign-up" reminders (4 max).
 * Marketing-type emails (newsletter, reminders) carry a signed one-click unsubscribe link.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { EmailKind } from '../src/emails/catalog'
import { asEmailLang } from '../src/emails/strings'
import { db } from './db'
import { configured, env } from './env'
import { compose, sendEmail, sendEmails, type Outgoing } from './mail'

export const PLAN_LABEL: Record<string, string> = { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' }
const LOCALE: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' }
const first = (name: string, email: string) => (name || email.split('@')[0]).trim().split(' ')[0]
const day = 864e5

/* ───────── unsubscribe links ───────── */
const secret = () => env.cronSecret || env.supabaseServiceKey || 'dev'
const sig = (userId: string) => createHmac('sha256', secret()).update(`unsub:${userId}`).digest('base64url').slice(0, 32)
export const unsubscribeUrl = (userId: string) => `${env.apiUrl}/api/email/unsubscribe?u=${userId}&s=${sig(userId)}`
export function validUnsubscribe(userId: string, s: string) {
  const a = Buffer.from(sig(userId))
  const b = Buffer.from(s)
  return /^[0-9a-f-]{36}$/i.test(userId) && a.length === b.length && timingSafeEqual(a, b)
}

async function profileOf(userId: string) {
  const { data } = await db().from('profiles').select('id, email, full_name, comm_language, newsletter_opt_out').eq('id', userId).maybeSingle()
  return data
}

/* ───────── welcome ───────── */
/** Sends the welcome email once per church (claimed atomically), to its admins. */
export async function sendWelcome(churchId: string) {
  if (!configured.email) return false
  const { data: claimed } = await db().from('churches').update({ welcome_sent_at: new Date().toISOString() }).eq('id', churchId).is('welcome_sent_at', null).select('id, name, plan, trial_ends_at')
  const c = claimed?.[0]
  if (!c) return false
  const days = c.trial_ends_at ? Math.max(1, Math.round((new Date(c.trial_ends_at).getTime() - Date.now()) / day)) : 7
  const { data: team } = await db().from('church_users').select('user_id').eq('church_id', churchId).eq('role', 'admin')
  const { data: people } = await db().from('profiles').select('email, full_name, comm_language').in('id', (team ?? []).map((t) => t.user_id))
  const mails = (people ?? []).filter((p) => p.email).map((p) => compose('welcomeAccount', p.comm_language, p.email, { name: first(p.full_name, p.email), church: c.name, days, plan: PLAN_LABEL[c.plan] ?? c.plan }, `${env.siteUrl}/dashboard`))
  try {
    if (mails.length) await sendEmails(mails)
    return true
  } catch (e) {
    await db().from('churches').update({ welcome_sent_at: null }).eq('id', churchId) // let the hourly job retry
    throw e
  }
}

/** Safety net (hourly): churches created in the last 3 days that never got their welcome email. */
export async function runWelcomeFallback() {
  const since = new Date(Date.now() - 3 * day).toISOString()
  const before = new Date(Date.now() - 10 * 60e3).toISOString()
  const { data } = await db().from('churches').select('id').is('welcome_sent_at', null).gte('created_at', since).lte('created_at', before).limit(200)
  let sent = 0
  for (const c of data ?? []) if (await sendWelcome(c.id).catch((e) => (console.error('[welcome]', e), false))) sent++
  return sent
}

/* ───────── billing ───────── */
export async function sendBillingEmail(kind: 'subscriptionConfirmed' | 'paymentReceipt', churchId: string, p: { email: string; amount: number; currency: string; plan: string; renews: Date }) {
  if (!configured.email || !p.email) return
  const { data: church } = await db().from('churches').select('name').eq('id', churchId).single()
  const { data: prof } = await db().from('profiles').select('full_name, comm_language').ilike('email', p.email.replace(/[\\%_]/g, '\\$&')).maybeSingle()
  const lang = asEmailLang(prof?.comm_language)
  const loc = LOCALE[lang]
  await sendEmail(
    compose(kind, lang, p.email, {
      name: first(prof?.full_name ?? '', p.email),
      church: church?.name ?? '',
      plan: PLAN_LABEL[p.plan] ?? p.plan,
      amount: new Intl.NumberFormat(loc, { style: 'currency', currency: p.currency }).format(p.amount),
      date: p.renews.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }),
    }, `${env.siteUrl}/dashboard/settings?tab=plan`),
  ).catch((e) => console.error('[billing email]', e))
}

/* ───────── account deleted ───────── */
export async function sendAccountDeleted(p: { email: string; name: string; lang: string }) {
  if (!configured.email || !p.email) return
  await sendEmail(compose('accountDeleted', p.lang, p.email, { name: first(p.name, p.email) }, `${env.siteUrl}/register`)).catch((e) => console.error('[deleted email]', e))
}

/* ───────── abandoned sign-up reminders ───────── */
const REMINDERS: EmailKind[] = ['finishSignup1', 'finishSignup2', 'finishSignup3', 'finishSignup4']

/**
 * People who verified their email (or used Google) but never created a church. Reminder #1 one day
 * after sign-up, then one a week, four at most. Stops as soon as they finish, join a church, or unsubscribe.
 */
export async function runSignupReminders() {
  if (!configured.email) return { sent: 0 }
  const now = Date.now()
  const candidates: { id: string; email: string; created: number }[] = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      const banned = (u as { banned_until?: string | null }).banned_until
      if (!u.email || !u.email_confirmed_at || (banned && new Date(banned).getTime() > now)) continue
      if (env.adminEmails.includes(u.email.toLowerCase())) continue
      const created = new Date(u.created_at).getTime()
      if (now - created < day || now - created > 40 * day) continue
      candidates.push({ id: u.id, email: u.email, created })
    }
    if (data.users.length < 1000) break
  }
  if (!candidates.length) return { sent: 0 }
  const ids = candidates.map((c) => c.id)
  const { data: links } = await db().from('church_users').select('user_id').in('user_id', ids)
  const inChurch = new Set((links ?? []).map((l) => l.user_id))
  const { data: profiles } = await db().from('profiles').select('id, full_name, comm_language, newsletter_opt_out, signup_reminders, signup_reminded_at').in('id', ids)
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))
  const mails: Outgoing[] = []
  const done: { id: string; n: number }[] = []
  for (const c of candidates) {
    const p = byId.get(c.id)
    if (!p || inChurch.has(c.id) || p.newsletter_opt_out) continue
    const n = p.signup_reminders ?? 0
    if (n >= REMINDERS.length) continue
    const dueAt = c.created + day + n * 7 * day
    const last = p.signup_reminded_at ? new Date(p.signup_reminded_at).getTime() : 0
    if (now < dueAt || now - last < 6 * day) continue
    mails.push(compose(REMINDERS[n], p.comm_language, c.email, { name: first(p.full_name, c.email) }, `${env.siteUrl}/register?step=church`, { unsubscribeUrl: unsubscribeUrl(c.id) }))
    done.push({ id: c.id, n: n + 1 })
  }
  if (mails.length) await sendEmails(mails)
  const at = new Date().toISOString()
  for (const d of done) await db().from('profiles').update({ signup_reminders: d.n, signup_reminded_at: at }).eq('id', d.id)
  return { sent: mails.length }
}

/* ───────── newsletter ───────── */
export type NewsletterAudience = 'all' | 'active' | 'trial' | 'expired' | 'no_church'

/** Account holders for a newsletter (verified email, not unsubscribed). */
export async function newsletterRecipients(audience: NewsletterAudience) {
  const { data: profiles } = await db().from('profiles').select('id, email, full_name, comm_language').eq('newsletter_opt_out', false).neq('email', '')
  let list = profiles ?? []
  if (audience !== 'all') {
    const { data: links } = await db().from('church_users').select('user_id, churches(plan_status)')
    const statusOf = new Map<string, Set<string>>()
    for (const l of links ?? []) {
      const s = (l.churches as unknown as { plan_status: string } | null)?.plan_status ?? ''
      if (!statusOf.has(l.user_id)) statusOf.set(l.user_id, new Set())
      statusOf.get(l.user_id)!.add(s)
    }
    const want: Record<Exclude<NewsletterAudience, 'all' | 'no_church'>, string[]> = { active: ['active', 'past_due'], trial: ['trial'], expired: ['expired', 'cancelled'] }
    list = list.filter((p) => {
      const s = statusOf.get(p.id)
      if (audience === 'no_church') return !s
      return s ? want[audience].some((w) => s.has(w)) : false
    })
  }
  return list
}

export function composeNewsletter(p: { id: string; email: string; full_name: string; comm_language: string }, subject: string, text: string) {
  return compose('newsletter', p.comm_language, p.email, { subject, text, name: first(p.full_name, p.email) }, `${env.siteUrl}/dashboard`, { unsubscribeUrl: unsubscribeUrl(p.id) })
}

export { profileOf }
