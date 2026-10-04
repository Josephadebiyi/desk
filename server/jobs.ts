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
  if (!configured.email) return { birthdays: 0 }
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
  return { birthdays: list.length }
}
