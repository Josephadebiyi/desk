/**
 * Sunday check-ins (QR) and the optional "we missed you" follow-up.
 *
 * Follow-ups are deliberately gentle:
 *   • off by default — each church switches them on (Ministry Plus and Ministry Max plans)
 *   • only people who were attending (checked in at least twice in the last 8 tracked Sundays)
 *   • only after they miss the last N tracked Sundays in a row (N = 2 by default)
 *   • at most one follow-up per person every 30 days
 * A "tracked Sunday" is one where the church used check-ins (3+ people checked in).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { withChurchName } from '../src/emails/sender'
import { asEmailLang } from '../src/emails/strings'
import { db } from './db'
import { configured, env } from './env'
import { logOutbound } from './inbox'
import { compose, sendEmail } from './mail'
import { phoneOf, twilio, smsSenderOf } from './messaging'
import { sendWhatsApp } from './whatsapp'

/** Plans that include automatic follow-ups. */
export const FOLLOWUP_PLANS = ['plus', 'max']
const day = 864e5

/* ───────── remembered check-in on a phone ───────── */
const secret = () => env.cronSecret || env.supabaseServiceKey || 'dev'
const sign = (memberId: string) => createHmac('sha256', secret()).update(`checkin:${memberId}`).digest('base64url').slice(0, 24)
export const checkinToken = (memberId: string) => `${memberId}.${sign(memberId)}`
export function memberFromToken(token: string) {
  const [id, s] = token.split('.')
  if (!id || !s || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const a = Buffer.from(sign(id))
  const b = Buffer.from(s)
  return a.length === b.length && timingSafeEqual(a, b) ? id : null
}

/** Date the church considers "today" (sent by the phone), within a day of the server clock. */
export function serviceDate(raw: unknown) {
  const s = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10)
  const diff = Math.abs(new Date(`${s}T12:00:00Z`).getTime() - Date.now())
  return diff < 1.6 * day ? s : new Date().toISOString().slice(0, 10)
}

export async function checkIn(churchId: string, memberId: string, date: string, method: 'qr' | 'manual', byName = '') {
  const { error } = await db().from('attendance').upsert({ church_id: churchId, member_id: memberId, service_date: date, method, by_name: byName }, { onConflict: 'member_id,service_date', ignoreDuplicates: true })
  if (error) throw error
}

const isSunday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0

/** Last `weeks` Sundays on which the church tracked attendance (3+ check-ins), newest first. */
export async function trackedSundays(churchId: string, weeks = 8) {
  const since = new Date(Date.now() - (weeks * 7 + 1) * day).toISOString().slice(0, 10)
  const { data } = await db().from('attendance').select('service_date').eq('church_id', churchId).gte('service_date', since)
  const counts = new Map<string, number>()
  for (const r of data ?? []) if (isSunday(r.service_date)) counts.set(r.service_date, (counts.get(r.service_date) ?? 0) + 1)
  return [...counts.entries()].filter(([, n]) => n >= 3).map(([d]) => d).sort().reverse()
}

export interface Absentee {
  memberId: string
  name: string
  phone: string
  whatsapp: string
  email: string
  language: string
  lastSeen: string
  missed: number
  followedUpAt: string | null
}

/** Regular attendees who missed the last `missed` tracked Sundays in a row. */
export async function absentees(churchId: string, missed: number): Promise<Absentee[]> {
  const sundays = await trackedSundays(churchId, 8)
  if (sundays.length < missed) return []
  const { data: rows } = await db().from('attendance').select('member_id, service_date').eq('church_id', churchId).in('service_date', sundays)
  const byMember = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    if (!byMember.has(r.member_id)) byMember.set(r.member_id, new Set())
    byMember.get(r.member_id)!.add(r.service_date)
  }
  const recent = sundays.slice(0, missed)
  const flagged = [...byMember.entries()].filter(([, dates]) => dates.size >= 2 && recent.every((d) => !dates.has(d))).map(([id]) => id)
  if (!flagged.length) return []
  const { data: members } = await db().from('members').select('id, full_name, phone, whatsapp, email, language, membership_status, last_followup_at').in('id', flagged)
  const missedCount = (dates: Set<string>) => {
    let n = 0
    for (const d of sundays) {
      if (dates.has(d)) break
      n++
    }
    return n
  }
  return (members ?? [])
    .filter((m) => m.membership_status === 'Active')
    .map((m) => {
      const dates = byMember.get(m.id)!
      return {
        memberId: m.id,
        name: m.full_name,
        phone: m.phone,
        whatsapp: m.whatsapp,
        email: m.email,
        language: m.language,
        lastSeen: [...dates].sort().reverse()[0] ?? '',
        missed: missedCount(dates),
        followedUpAt: m.last_followup_at,
      }
    })
    .sort((a, b) => b.missed - a.missed)
}

const DEFAULT_TEXT: Record<string, string> = {
  en: 'Hi {first_name}, we’ve missed you at church the last couple of Sundays 💛 Just checking in — is everything okay? Reply here if you’d like prayer or a chat.',
  es: 'Hola, {first_name}: te hemos echado de menos en la iglesia los últimos domingos 💛 Solo queríamos saber cómo estás. Responde aquí si quieres oración o hablar.',
  fr: 'Bonjour {first_name}, vous nous avez manqué à l’église ces derniers dimanches 💛 Nous prenons simplement de vos nouvelles. Répondez ici si vous souhaitez de la prière ou parler.',
  de: 'Hallo {first_name}, wir haben dich an den letzten Sonntagen in der Gemeinde vermisst 💛 Wir wollten nur nachfragen, wie es dir geht. Antworte hier, wenn du Gebet oder ein Gespräch möchtest.',
  pt: 'Olá {first_name}, sentimos a sua falta na igreja nos últimos domingos 💛 Só queríamos saber como está. Responda aqui se quiser oração ou conversar.',
}
export const defaultFollowupText = (lang: string) => DEFAULT_TEXT[asEmailLang(lang)]

/** Sends one check-up message: WhatsApp → SMS → email, whichever the person has. */
export async function sendFollowup(churchId: string, a: Absentee, byName: string, custom = '') {
  const { data: church } = await db().from('churches').select('*').eq('id', churchId).single()
  const churchName = church?.name ?? ''
  const first = a.name.split(' ')[0]
  const text = (custom.trim() || defaultFollowupText(a.language)).replace(/\{first_name\}/g, first).replace(/\{church\}/g, churchName)
  let channel: 'WhatsApp' | 'SMS' | 'Email' | null = null
  let providerId: string | undefined
  const wa = a.whatsapp || a.phone
  if (wa && configured.whatsapp) {
    const body = withChurchName(text, churchName)
    providerId = configured.whatsappCloud ? await sendWhatsApp(wa, body, a.language) : await twilio('WhatsApp', phoneOf(wa), body)
    channel = 'WhatsApp'
    await logOutbound({ churchId, memberId: a.memberId, name: a.name, to: wa, channel, body, providerId, byName })
  } else if (a.phone && configured.sms) {
    const body = withChurchName(text, churchName)
    providerId = await twilio('SMS', phoneOf(a.phone), body, { sender: smsSenderOf(church), churchId })
    channel = 'SMS'
    await logOutbound({ churchId, memberId: a.memberId, name: a.name, to: a.phone, channel, body, providerId, byName })
  } else if (a.email && configured.email) {
    providerId = await sendEmail(compose('message', a.language, a.email, { church: churchName, subject: churchName, text }))
    channel = 'Email'
  }
  if (!channel) throw new Error('No WhatsApp, phone or email for this person.')
  await db().from('members').update({ last_followup_at: new Date().toISOString() }).eq('id', a.memberId)
  await db().from('communications').insert({ church_id: churchId, member_id: a.memberId, channel, summary: `Check-up after ${a.missed} missed Sundays: ${text.slice(0, 80)}`, by_name: byName })
  return channel
}

/** Daily: automatic follow-ups for churches that switched them on. */
export async function runFollowups() {
  const { data: churches } = await db().from('churches').select('id, plan, plan_status, followup_missed, followup_message').eq('followup_enabled', true).in('plan', FOLLOWUP_PLANS).in('plan_status', ['trial', 'active'])
  let sent = 0
  for (const c of churches ?? []) {
    try {
      for (const a of await absentees(c.id, c.followup_missed ?? 2)) {
        if (a.followedUpAt && Date.now() - new Date(a.followedUpAt).getTime() < 30 * day) continue
        await sendFollowup(c.id, a, 'ZionDesk (automatic)', c.followup_message).then(() => sent++).catch((e) => console.error('[followup]', e))
      }
    } catch (e) {
      console.error('[followups]', c.id, e)
    }
  }
  return { sent }
}
