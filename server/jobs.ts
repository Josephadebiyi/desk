/**
 * Scheduled work (run by Render Cron Jobs, see render.yaml):
 *   hourly → send scheduled campaigns whose time has come; event reminders 24h ahead
 *   daily  → birthday emails to members, in each member's language
 * Each job is idempotent: it records what it sent so a re-run doesn't send twice.
 */
import { asEmailLang } from '../src/emails/strings'
import { db } from './db'
import { configured } from './env'
import { compose, sendEmails } from './mail'
import { audienceMembers, sendCampaign, twilio, type Audience } from './messaging'
import { ageOn, birthdayPrayers } from './prayers'
import { sendWhatsApp } from './whatsapp'
import { withChurchName } from '../src/emails/sender'
import { cancelSubscription, listSubscriptions } from './flutterwave'
import { disableSubscription, subscriptionsOf } from './paystack'
import { stripe } from './stripe'
import { runSignupReminders, runWelcomeFallback } from './lifecycle'
import { runFollowups } from './attendance'
import { runBranchReminders } from './branches'

const LOCALE: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' }

export async function runHourly() {
  const now = new Date()
  // 1. Scheduled campaigns that are due.
  const { data: due } = await db().from('campaigns').select('id').eq('status', 'Scheduled').lte('scheduled_for', now.toISOString())
  let campaigns = 0
  for (const c of due ?? []) {
    await sendCampaign(c.id, 'ZionDesk').catch((e) => console.error('[cron campaign]', c.id, e))
    campaigns++
  }

  // 2. Event reminders ~24h before start, once per event.
  let reminders = 0
  if (configured.email) {
    const from = new Date(now.getTime() + 23 * 3600e3)
    const to = new Date(now.getTime() + 24 * 3600e3)
    const days = [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)]
    const { data: events } = await db().from('events').select('id, church_id, title, date, start_time, google_meet, meet_link, audience').in('date', [...new Set(days)])
    for (const e of events ?? []) {
      const start = new Date(`${e.date}T${e.start_time}`)
      if (start < from || start >= to) continue
      const { count } = await db().from('deliveries').select('id', { count: 'exact', head: true }).eq('provider_id', `reminder:${e.id}`)
      if (count) continue
      const { data: church } = await db().from('churches').select('name').eq('id', e.church_id).single()
      const people = (await audienceMembers(e.church_id, e.audience as Audience)).filter((m) => m.email)
      const mails = people.map((m) => {
        const lang = asEmailLang(m.language)
        const loc = LOCALE[lang]
        const vars = {
          church: church?.name ?? '',
          name: m.full_name.split(' ')[0],
          event: e.title,
          date: start.toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric' }),
          time: start.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' }),
        }
        return compose(e.google_meet && e.meet_link ? 'meetingInvite' : 'eventReminder', lang, m.email, vars, e.meet_link ?? undefined)
      })
      if (mails.length) await sendEmails(mails)
      await db().from('deliveries').insert(people.map((m) => ({ church_id: e.church_id, member_id: m.id, channel: 'Email', language: asEmailLang(m.language), to_address: m.email, status: 'sent', provider_id: `reminder:${e.id}` })))
      reminders += mails.length
    }
  }
  const welcomes = await runWelcomeFallback().catch((e) => (console.error('[welcome fallback]', e), 0))
  return { campaigns, reminders, welcomes }
}

export async function runDaily() {
  const promos = await endPromos().catch((e) => (console.error('[promos]', e), null)) // before billing
  const billing = await runBilling().catch((e) => (console.error('[billing]', e), null))
  const birthdays = await runBirthdays().catch((e) => (console.error('[birthdays]', e), 0))
  const signupReminders = await runSignupReminders().catch((e) => (console.error('[signup reminders]', e), null))
  const followups = await runFollowups().catch((e) => (console.error('[followups]', e), null))
  const branchReports = await runBranchReminders().catch((e) => (console.error('[branch reminders]', e), null))
  return { birthdays, billing, promos, signupReminders, followups, branchReports }
}

/**
 * Birthday greetings, once per person per year, in each member's language. With ANTHROPIC_API_KEY set, Claude writes
 * every celebrant their own prayer; otherwise the standard greeting.
 * Email when the member has one, otherwise WhatsApp (when configured).
 */
async function runBirthdays() {
  if (!configured.email && !configured.whatsapp) return 0
  const today = new Date()
  const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const stamp = `birthday:${today.toISOString().slice(0, 10)}`
  const { data: people } = await db().from('members').select('id, church_id, full_name, email, whatsapp, language, dob, gender, department, stage').not('dob', 'is', null).eq('membership_status', 'Active')
  const todays = (people ?? []).filter((m) => String(m.dob).slice(5) === mmdd && (m.email || m.whatsapp))
  if (!todays.length) return 0
  const { data: sent } = await db().from('deliveries').select('member_id').eq('provider_id', stamp)
  const already = new Set((sent ?? []).map((s) => s.member_id))
  const list = todays.filter((m) => !already.has(m.id))
  const churchIds = [...new Set(list.map((m) => m.church_id))]
  const { data: churches } = churchIds.length ? await db().from('churches').select('id, name').in('id', churchIds) : { data: [] }
  const name = (id: string) => churches?.find((c) => c.id === id)?.name ?? ''
  let count = 0
  for (const churchId of churchIds) {
    const members = list.filter((m) => m.church_id === churchId)
    const prayers = await birthdayPrayers(
      name(churchId),
      members.map((m) => ({ id: m.id, firstName: m.full_name.split(' ')[0], age: ageOn(String(m.dob), today), gender: m.gender, department: m.department, stage: m.stage, language: asEmailLang(m.language) })),
    )
    const rows: Record<string, unknown>[] = []
    const mails = []
    for (const m of members) {
      const lang = asEmailLang(m.language)
      const first = m.full_name.split(' ')[0]
      const prayer = prayers[m.id]
      if (m.email && configured.email) {
        mails.push(prayer ? compose('birthdayPrayer', lang, m.email, { church: name(churchId), name: first, prayer }) : compose('birthday', lang, m.email, { church: name(churchId), name: first }))
        rows.push({ church_id: churchId, member_id: m.id, channel: 'Email', language: lang, to_address: m.email, status: 'sent', provider_id: stamp, body: prayer ?? null })
      } else if (m.whatsapp && configured.whatsapp) {
        const text = withChurchName(`🎉 ${first} — ${prayer ?? BIRTHDAY_LINE[lang]}`, name(churchId))
        try {
          if (configured.whatsappCloud) await sendWhatsApp(m.whatsapp, text, lang)
          else await twilio('WhatsApp', m.whatsapp.replace(/[^\d+]/g, ''), text)
          rows.push({ church_id: churchId, member_id: m.id, channel: 'WhatsApp', language: lang, to_address: m.whatsapp, status: 'sent', provider_id: stamp, body: text })
        } catch (e) {
          rows.push({ church_id: churchId, member_id: m.id, channel: 'WhatsApp', language: lang, to_address: m.whatsapp, status: 'failed', provider_id: stamp, error: e instanceof Error ? e.message : 'failed' })
        }
      }
    }
    if (mails.length) await sendEmails(mails)
    if (rows.length) await db().from('deliveries').insert(rows)
    count += rows.length
  }
  return count
}

const BIRTHDAY_LINE: Record<string, string> = {
  en: 'Happy birthday! May God bless you abundantly in your new year.',
  es: '¡Feliz cumpleaños! Que Dios te bendiga abundantemente en tu nuevo año.',
  fr: 'Joyeux anniversaire ! Que Dieu te bénisse abondamment pour cette nouvelle année.',
  de: 'Alles Gute zum Geburtstag! Gott segne dich reich im neuen Lebensjahr.',
  pt: 'Feliz aniversário! Que Deus o abençoe abundantemente no seu novo ano.',
}

/* ───────── billing lifecycle (runs daily) ─────────
 * trial → reminder 3 days before → expired when it ends without a plan
 * active → past_due 3 days after a missed renewal → expired after 10 days
 * cancelled → expired when the paid month ends
 * Expired churches keep all data; the dashboard asks them to choose a plan.
 */
const PLAN_LABEL: Record<string, string> = { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' }

async function tellAdmins(churchId: string, churchName: string, kind: 'trialEnding' | 'paymentFailed' | 'planExpired' | 'promoEnded', extra: Record<string, string | number> = {}) {
  if (!configured.email) return
  const { data: team } = await db().from('church_users').select('user_id').eq('church_id', churchId).eq('role', 'admin')
  const ids = (team ?? []).map((t) => t.user_id)
  if (!ids.length) return
  const { data: people } = await db().from('profiles').select('email, full_name, comm_language').in('id', ids)
  const mails = (people ?? []).filter((p) => p.email).map((p) => compose(kind, p.comm_language, p.email, { church: churchName, name: (p.full_name || p.email).split(' ')[0], ...extra }, `${process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || ''}/dashboard/settings?tab=plan`))
  if (mails.length) await sendEmails(mails)
}

export async function runBilling() {
  const now = Date.now()
  const day = 864e5
  const { data: churches } = await db().from('churches').select('id, name, plan, plan_status, plan_renews_at, trial_ends_at')
  const counts = { reminders: 0, pastDue: 0, expired: 0 }
  for (const c of churches ?? []) {
    const renews = c.plan_renews_at ? new Date(c.plan_renews_at).getTime() : null
    const trialEnd = c.trial_ends_at ? new Date(c.trial_ends_at).getTime() : null
    if (c.plan_status === 'trial' && trialEnd) {
      const daysLeft = Math.ceil((trialEnd - now) / day)
      if (daysLeft === 3) {
        await tellAdmins(c.id, c.name, 'trialEnding', { days: 3 })
        counts.reminders++
      }
      if (trialEnd < now) {
        await db().from('churches').update({ plan_status: 'expired' }).eq('id', c.id)
        await tellAdmins(c.id, c.name, 'planExpired')
        counts.expired++
      }
    } else if (c.plan_status === 'active' && renews && renews + 3 * day < now) {
      await db().from('churches').update({ plan_status: 'past_due' }).eq('id', c.id)
      await tellAdmins(c.id, c.name, 'paymentFailed', { plan: PLAN_LABEL[c.plan] ?? c.plan })
      counts.pastDue++
    } else if ((c.plan_status === 'past_due' && renews && renews + 10 * day < now) || (c.plan_status === 'cancelled' && renews && renews < now)) {
      await db().from('churches').update({ plan_status: 'expired' }).eq('id', c.id)
      await tellAdmins(c.id, c.name, 'planExpired')
      counts.expired++
    }
  }
  return counts
}

/**
 * Promo codes that run out: free-day promos and limited-month discounts. The discounted Flutterwave
 * subscription is cancelled (no surprise charges); the church keeps access until the paid/free
 * period ends and is invited to subscribe at the regular price.
 */
async function endPromos() {
  const { data: due } = await db().from('promo_redemptions').select('id, church_id, plan').eq('status', 'active').lt('ends_at', new Date().toISOString())
  for (const r of due ?? []) {
    const { data: c } = await db().from('churches').select('id, name, currency, flw_subscription_email, paystack_customer_code, stripe_subscription_id').eq('id', r.church_id).single()
    if (!c) continue
    if (c.flw_subscription_email) for (const s of await listSubscriptions(c.flw_subscription_email)) if (s.status === 'active') await cancelSubscription(s.id).catch(() => undefined)
    // Stop the discounted Paystack subscription (no surprise charges); the church re-subscribes at the regular price.
    if (c.paystack_customer_code) {
      const pc = ['NGN', 'GHS', 'KES', 'ZAR', 'XOF'].includes(c.currency) ? c.currency : 'NGN'
      for (const s of await subscriptionsOf(c.paystack_customer_code, pc)) if (s.status === 'active' || s.status === 'attention') await disableSubscription(s.subscription_code, s.email_token, pc).catch(() => undefined)
    }
    // Stripe: the coupon ends by itself; stop renewing at period end so nobody is charged full price without choosing it.
    if (c.stripe_subscription_id && configured.stripe) await stripe().subscriptions.update(c.stripe_subscription_id, { cancel_at_period_end: true }).catch(() => undefined)
    await db().from('churches').update({ plan_status: 'cancelled' }).eq('id', c.id)
    await db().from('promo_redemptions').update({ status: 'ended' }).eq('id', r.id)
    await tellAdmins(c.id, c.name, 'promoEnded', { plan: PLAN_LABEL[r.plan] ?? r.plan })
  }
  return { ended: due?.length ?? 0 }
}

/* ───────── running the jobs ───────── */

/**
 * Runs a job at most once per slot (a day or an hour), whoever triggers it: Render Cron Jobs,
 * the built-in scheduler, or both. Needs the job_runs table (migration 0010).
 */
export async function once<T>(job: 'daily' | 'hourly', slot: string, fn: () => Promise<T>): Promise<T | { skipped: string }> {
  const { error } = await db().from('job_runs').insert({ job, slot })
  if (error) {
    if (error.code === '23505') return { skipped: `${job} already ran for ${slot}` }
    // job_runs not created yet (migration 0010): run without the lock, as before.
    if (error.code !== '42P01' && error.code !== 'PGRST205') throw error
    console.warn('[job] job_runs table missing — run migration 0010')
  }
  console.log(`[job] ${job} ${slot} started`)
  const result = await fn()
  console.log(`[job] ${job} ${slot} done ${JSON.stringify(result)}`)
  return result
}
export const dailySlot = (d = new Date()) => d.toISOString().slice(0, 10)
export const hourlySlot = (d = new Date()) => d.toISOString().slice(0, 13)

/** Last time each job ran (for /api/health; cached for a minute). */
let runsCache: { at: number; value: { daily: string | null; hourly: string | null } } | null = null
export async function lastRuns() {
  if (runsCache && Date.now() - runsCache.at < 60_000) return runsCache.value
  runsCache = { at: Date.now(), value: await readRuns() }
  return runsCache.value
}
async function readRuns() {
  const pick = async (job: string) => (await db().from('job_runs').select('slot').eq('job', job).order('slot', { ascending: false }).limit(1).maybeSingle()).data?.slot ?? null
  try {
    return { daily: await pick('daily'), hourly: await pick('hourly') }
  } catch {
    return { daily: null, hourly: null }
  }
}

/**
 * Built-in scheduler (RUN_SCHEDULER=1): hourly jobs every hour, daily jobs once a day from 07:00 UTC.
 * Use it when the service has no Render Cron Jobs. Safe alongside them — each slot runs once.
 */
export function startScheduler() {
  const tick = async () => {
    const now = new Date()
    await once('hourly', hourlySlot(now), runHourly).catch((e) => console.error('[scheduler hourly]', e))
    if (now.getUTCHours() >= 7) await once('daily', dailySlot(now), runDaily).catch((e) => console.error('[scheduler daily]', e))
  }
  setTimeout(tick, 60_000)
  setInterval(tick, 5 * 60_000)
  console.log('[scheduler] built-in scheduler on (hourly + daily at 07:00 UTC)')
}
