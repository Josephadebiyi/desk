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
import { audienceMembers, sendCampaign, type Audience } from './messaging'

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
  return { campaigns, reminders }
}

export async function runDaily() {
  const billing = await runBilling().catch((e) => (console.error('[billing]', e), null))
  if (!configured.email) return { birthdays: 0, billing }
  const today = new Date()
  const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const stamp = `birthday:${today.toISOString().slice(0, 10)}`
  // Postgres: members whose dob month-day is today (dob stored as date).
  const { data: people } = await db().from('members').select('id, church_id, full_name, email, language, dob').not('dob', 'is', null).neq('email', '').eq('membership_status', 'Active')
  const todays = (people ?? []).filter((m) => String(m.dob).slice(5) === mmdd)
  const churchIds = [...new Set(todays.map((m) => m.church_id))]
  const { data: churches } = churchIds.length ? await db().from('churches').select('id, name').in('id', churchIds) : { data: [] }
  const name = (id: string) => churches?.find((c) => c.id === id)?.name ?? ''
  const { data: sent } = await db().from('deliveries').select('member_id').eq('provider_id', stamp)
  const already = new Set((sent ?? []).map((s) => s.member_id))
  const list = todays.filter((m) => !already.has(m.id))
  if (list.length) {
    await sendEmails(list.map((m) => compose('birthday', m.language, m.email, { church: name(m.church_id), name: m.full_name.split(' ')[0] })))
    await db().from('deliveries').insert(list.map((m) => ({ church_id: m.church_id, member_id: m.id, channel: 'Email', language: asEmailLang(m.language), to_address: m.email, status: 'sent', provider_id: stamp })))
  }
  return { birthdays: list.length, billing }
}

/* ───────── billing lifecycle (runs daily) ─────────
 * trial → reminder 3 days before → expired when it ends without a plan
 * active → past_due 3 days after a missed renewal → expired after 10 days
 * cancelled → expired when the paid month ends
 * Expired churches keep all data; the dashboard asks them to choose a plan.
 */
const PLAN_LABEL: Record<string, string> = { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' }

async function tellAdmins(churchId: string, churchName: string, kind: 'trialEnding' | 'paymentFailed' | 'planExpired', extra: Record<string, string | number> = {}) {
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
