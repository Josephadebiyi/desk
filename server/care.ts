/**
 * Ellen's pastoral care jobs — the church assistant's routine work:
 *   • Birthdays (daily): a personal prayer to every celebrant on EVERY channel they have — WhatsApp, SMS and email.
 *   • Newcomer follow-up (Mondays): thanks + a personal prayer to Sunday's newcomers and new converts, every channel.
 *   • Birthday reminders (daily): an email to the church's admins and leaders about today's and the week's birthdays.
 * Ellen can also run the first two on request (POST /api/care/…), for one church.
 *
 * Every message is claimed before it's sent (deliveries.dedupe_key, one per person + channel), so re-runs, the
 * scheduler and Ellen never send the same thing twice. Churches switch each one off in Settings → Ask Ellen
 * (ai_settings.newcomerFollowup / birthdayReminders = false).
 */
import { withChurchName } from '../src/emails/sender'
import { asEmailLang, type EmailLang } from '../src/emails/strings'
import { db } from './db'
import { configured } from './env'
import { logOutbound } from './inbox'
import { churchBrand, compose, sendEmails, type Outgoing } from './mail'
import { claimDeliveries, phoneOf, settleDelivery, smsSenderOf, twilio, TwilioError, TWILIO_ACCOUNT_ERRORS } from './messaging'
import { ageOn, birthdayPrayers, fallbackBirthdayPrayer, fallbackNewcomerText, newcomerPrayers, type Celebrant } from './prayers'
import { sendWhatsApp } from './whatsapp'

type Channel = 'WhatsApp' | 'SMS' | 'Email'
const day = 864e5

interface Person {
  id: string
  church_id: string
  full_name: string
  email: string | null
  whatsapp: string | null
  phone: string | null
  language: string
  dob?: string | null
  gender: string
  department: string
  stage: string
}
interface Church {
  id: string
  name: string
  sms_sender: string | null
  ai_settings: Record<string, unknown> | null
}

export interface CareResult {
  people: number
  sent: number
  failed: number
  channels: Record<Channel, number>
  errors: string[]
}
const emptyResult = (): CareResult => ({ people: 0, sent: 0, failed: 0, channels: { WhatsApp: 0, SMS: 0, Email: 0 }, errors: [] })

const firstName = (p: { full_name: string }) => p.full_name.trim().split(/\s+/)[0] ?? ''
const celebrant = (p: Person, today: Date): Celebrant => ({ id: p.id, firstName: firstName(p), age: p.dob ? ageOn(String(p.dob), today) : null, gender: p.gender, department: p.department, stage: p.stage, language: asEmailLang(p.language) })

/** The channels this person can be reached on, as switched on for this server. */
function channelsOf(p: Person): { channel: Channel; to: string }[] {
  const out: { channel: Channel; to: string }[] = []
  const wa = p.whatsapp || p.phone
  if (wa && configured.whatsapp) out.push({ channel: 'WhatsApp', to: phoneOf(wa) })
  if (p.phone && configured.sms) out.push({ channel: 'SMS', to: phoneOf(p.phone) })
  if (p.email?.trim() && configured.email) out.push({ channel: 'Email', to: p.email.trim() })
  return out
}

/**
 * Sends one message to a person on every channel they have, once per `keyPrefix` + channel.
 * `chat` is the WhatsApp/SMS text (the church name is added); `email` builds the email.
 * Stops using a channel for the rest of the run when the provider refuses the whole account.
 */
async function sendEverywhere(
  church: Church,
  p: Person,
  keyPrefix: string,
  chat: string,
  email: (to: string, lang: EmailLang) => Promise<Outgoing>,
  summary: string,
  byName: string,
  result: CareResult,
  broken: Set<Channel>,
) {
  const lang = asEmailLang(p.language)
  const chatBody = withChurchName(chat, church.name)
  const via: Channel[] = []
  for (const { channel, to } of channelsOf(p)) {
    if (broken.has(channel)) continue
    const [claim] = await claimDeliveries([{ church_id: church.id, member_id: p.id, channel, language: lang, to_address: to, dedupe_key: `${keyPrefix}:${channel}`, body: channel === 'Email' ? chat : chatBody }])
    if (!claim) continue // already sent on this channel (an earlier run, the scheduler or Ellen)
    try {
      let providerId: string | undefined
      if (channel === 'Email') [providerId] = await sendEmails([await email(to, lang)])
      else if (channel === 'WhatsApp' && configured.whatsappCloud) providerId = await sendWhatsApp(to, chatBody, lang)
      else providerId = await twilio(channel, to, chatBody, { sender: smsSenderOf(church), churchId: church.id })
      await settleDelivery(claim.id, { status: 'sent', providerId })
      if (channel !== 'Email') await logOutbound({ churchId: church.id, memberId: p.id, name: p.full_name, to, channel, body: chatBody, providerId, byName }).catch(() => undefined)
      result.sent++
      result.channels[channel]++
      via.push(channel)
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'send failed'
      await settleDelivery(claim.id, { status: 'failed', error: reason })
      result.failed++
      if (!result.errors.includes(`${channel}: ${reason}`)) result.errors.push(`${channel}: ${reason}`)
      if (e instanceof TwilioError && e.code && TWILIO_ACCOUNT_ERRORS.has(e.code)) broken.add(channel)
    }
  }
  // One line on the member's record per channel used.
  if (via.length) await db().from('communications').insert(via.map((channel) => ({ church_id: church.id, member_id: p.id, date: new Date().toISOString().slice(0, 10), channel, summary: summary.slice(0, 90), by_name: byName }))).then(() => undefined, () => undefined)
}

async function churchesById(ids: string[]): Promise<Map<string, Church>> {
  if (!ids.length) return new Map()
  const { data } = await db().from('churches').select('id, name, sms_sender, ai_settings').in('id', ids)
  return new Map((data ?? []).map((c) => [c.id, c as Church]))
}
const setting = (c: Church | undefined, key: string) => (c?.ai_settings as Record<string, unknown> | null)?.[key] !== false

/* ───────── birthdays ───────── */

const BIRTHDAY_HEAD: Record<EmailLang, string> = {
  en: 'Happy birthday, {name}!',
  es: '¡Feliz cumpleaños, {name}!',
  fr: 'Joyeux anniversaire, {name} !',
  de: 'Alles Gute zum Geburtstag, {name}!',
  pt: 'Feliz aniversário, {name}!',
}

/** Today's birthday greetings with a prayer, on every channel. `churchId`: one church only (Ellen on request). */
export async function runBirthdays(opts: { churchId?: string; byName?: string } = {}): Promise<CareResult> {
  const result = emptyResult()
  if (!configured.email && !configured.whatsapp && !configured.sms) return result
  const today = new Date()
  const date = today.toISOString().slice(0, 10)
  const mmdd = date.slice(5)
  let q = db().from('members').select('id, church_id, full_name, email, whatsapp, phone, language, dob, gender, department, stage').not('dob', 'is', null).eq('membership_status', 'Active')
  if (opts.churchId) q = q.eq('church_id', opts.churchId)
  const { data } = await q.limit(50000)
  const todays = ((data ?? []) as Person[]).filter((m) => String(m.dob).slice(5) === mmdd && channelsOf(m).length)
  result.people = todays.length
  if (!todays.length) return result
  const churches = await churchesById([...new Set(todays.map((m) => m.church_id))])
  for (const [churchId, church] of churches) {
    const members = todays.filter((m) => m.church_id === churchId)
    const prayers = await birthdayPrayers(church.name, members.map((m) => celebrant(m, today)))
    const brand = await churchBrand(churchId)
    const broken = new Set<Channel>()
    for (const m of members) {
      const lang = asEmailLang(m.language)
      const first = firstName(m)
      const prayer = prayers[m.id] ?? fallbackBirthdayPrayer(lang, m.id + date)
      const chat = `${BIRTHDAY_HEAD[lang].replace('{name}', first)} ${prayer}`
      await sendEverywhere(
        church,
        m,
        `birthday:${date}:${m.id}`,
        chat,
        async (to) => compose('birthdayPrayer', lang, to, { church: church.name, name: first, prayer }, undefined, { church: brand }),
        `Birthday greeting with prayer: ${prayer}`,
        opts.byName ?? 'Ellen (automatic)',
        result,
        broken,
      )
    }
  }
  return result
}

/* ───────── newcomers: Monday thank-you with a prayer ───────── */

const HELLO: Record<EmailLang, string> = { en: 'Hi {name}!', es: '¡Hola, {name}!', fr: 'Bonjour {name} !', de: 'Hallo {name}!', pt: 'Olá, {name}!' }
const SUBJECT: Record<EmailLang, string> = {
  en: 'Thank you for worshipping with us',
  es: 'Gracias por adorar con nosotros',
  fr: 'Merci d’avoir célébré avec nous',
  de: 'Danke, dass du mit uns gefeiert hast',
  pt: 'Obrigado por adorar conosco',
}

/** The most recent Sunday on or before `d` (UTC date). */
export function lastSunday(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  x.setUTCDate(x.getUTCDate() - x.getUTCDay())
  return x.toISOString().slice(0, 10)
}

/**
 * Newcomers and new converts from the last Sunday: checked in on that Sunday, or registered in the week up to it
 * (the QR / join link, or added in the dashboard). Each person gets this follow-up once.
 */
export async function sundayNewcomers(churchId: string, now = new Date()): Promise<Person[]> {
  const sunday = lastSunday(now)
  const weekStart = new Date(new Date(`${sunday}T00:00:00Z`).getTime() - 6 * day).toISOString().slice(0, 10)
  const cols = 'id, church_id, full_name, email, whatsapp, phone, language, dob, gender, department, stage, created_at'
  const [{ data: joined }, { data: checkins }] = await Promise.all([
    db().from('members').select(cols).eq('church_id', churchId).eq('membership_status', 'Active').in('stage', ['Newcomer', 'Convert']).gte('date_joined', weekStart).limit(2000),
    db().from('attendance').select('member_id').eq('church_id', churchId).eq('service_date', sunday).limit(5000),
  ])
  const ids = [...new Set((checkins ?? []).map((c) => c.member_id))].filter((id) => !(joined ?? []).some((j) => j.id === id))
  const { data: attended } = ids.length ? await db().from('members').select(cols).in('id', ids).eq('membership_status', 'Active').in('stage', ['Newcomer', 'Convert']) : { data: [] }
  return [...(joined ?? []), ...(attended ?? [])] as Person[]
}

/** Thank-you + prayer to Sunday's newcomers and new converts, on every channel. All churches, or one (Ellen). */
export async function runNewcomerFollowups(opts: { churchId?: string; byName?: string } = {}): Promise<CareResult> {
  const result = emptyResult()
  if (!configured.email && !configured.whatsapp && !configured.sms) return result
  let ids: string[]
  if (opts.churchId) ids = [opts.churchId]
  else {
    const { data } = await db().from('churches').select('id').in('plan_status', ['trial', 'active'])
    ids = (data ?? []).map((c) => c.id)
  }
  const churches = await churchesById(ids)
  for (const [churchId, church] of churches) {
    // Automatic runs respect the church's switch; Ellen on request always runs.
    if (!opts.churchId && !setting(church, 'newcomerFollowup')) continue
    try {
      const people = (await sundayNewcomers(churchId)).filter((p) => channelsOf(p).length)
      result.people += people.length
      if (!people.length) continue
      const today = new Date()
      const notes = await newcomerPrayers(church.name, people.map((p) => celebrant(p, today)))
      const brand = await churchBrand(churchId)
      const broken = new Set<Channel>()
      for (const p of people) {
        const lang = asEmailLang(p.language)
        const first = firstName(p)
        const note = notes[p.id] ?? fallbackNewcomerText(lang, church.name)
        const chat = `${HELLO[lang].replace('{name}', first)} ${note}`
        await sendEverywhere(
          church,
          p,
          `newcomer:${p.id}`,
          chat,
          async (to) => compose('message', lang, to, { church: church.name, subject: SUBJECT[lang], text: chat }, undefined, { church: brand }),
          `Newcomer follow-up with prayer: ${note}`,
          opts.byName ?? 'Ellen (automatic)',
          result,
          broken,
        )
      }
    } catch (e) {
      console.error('[newcomer follow-up]', churchId, e)
    }
  }
  return result
}

/* ───────── birthday reminders to the church team ───────── */

/**
 * Each morning: an email to the church's admins and leaders when someone has a birthday today or tomorrow,
 * listing the next 7 days, so the pastor can call or visit. (The greetings themselves go out automatically.)
 */
export async function runBirthdayReminders() {
  if (!configured.email) return { churches: 0, emails: 0 }
  const now = new Date()
  const upcoming = (dob: string) => {
    const d = new Date(`${now.getUTCFullYear()}-${String(dob).slice(5)}T00:00:00Z`)
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    if (d.getTime() < start) d.setUTCFullYear(d.getUTCFullYear() + 1)
    return Math.round((d.getTime() - start) / day)
  }
  const { data } = await db().from('members').select('church_id, full_name, dob, phone, whatsapp').not('dob', 'is', null).eq('membership_status', 'Active').limit(50000)
  const soon = (data ?? []).map((m) => ({ ...m, in: upcoming(String(m.dob)) })).filter((m) => m.in >= 0 && m.in <= 7)
  const churchIds = [...new Set(soon.filter((m) => m.in <= 1).map((m) => m.church_id))]
  const churches = await churchesById(churchIds)
  let emails = 0
  for (const [churchId, church] of churches) {
    if (!setting(church, 'birthdayReminders')) continue
    const list = soon.filter((m) => m.church_id === churchId).sort((a, b) => a.in - b.in)
    const { data: team } = await db().from('church_users').select('user_id').eq('church_id', churchId).in('role', ['admin', 'leader'])
    const uids = (team ?? []).map((t) => t.user_id)
    if (!uids.length) continue
    const { data: people } = await db().from('profiles').select('email, full_name, comm_language').in('id', uids)
    const mails = (people ?? [])
      .filter((p) => p.email)
      .map((p) => {
        const lang = asEmailLang(p.comm_language)
        const loc = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' }[lang]
        const when = (n: number) => {
          const d = new Date(now.getTime() + n * day)
          return n === 0 ? REMIND[lang].today : n === 1 ? REMIND[lang].tomorrow : d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })
        }
        const lines = list.map((m) => `• ${m.full_name} — ${when(m.in)}${m.whatsapp || m.phone ? ` (${m.whatsapp || m.phone})` : ''}`).join('\n')
        const text = `${REMIND[lang].intro}\n\n${lines}\n\n${REMIND[lang].outro}`
        return compose('message', lang, p.email, { church: church.name, subject: REMIND[lang].subject, text })
      })
    if (mails.length) {
      await sendEmails(mails).then(() => (emails += mails.length)).catch((e) => console.error('[birthday reminders]', churchId, e))
    }
  }
  return { churches: churches.size, emails }
}

const REMIND: Record<EmailLang, { subject: string; intro: string; outro: string; today: string; tomorrow: string }> = {
  en: { subject: 'Birthdays this week', intro: 'Good morning! Here are the birthdays coming up in your church:', outro: 'Ellen sends each of them a birthday prayer on WhatsApp, SMS and email on the day. A personal call or visit from you will mean a lot.', today: 'today', tomorrow: 'tomorrow' },
  es: { subject: 'Cumpleaños de esta semana', intro: '¡Buenos días! Estos son los próximos cumpleaños de tu iglesia:', outro: 'Ellen envía a cada uno una oración de cumpleaños por WhatsApp, SMS y correo ese día. Una llamada o visita tuya significará mucho.', today: 'hoy', tomorrow: 'mañana' },
  fr: { subject: 'Anniversaires de la semaine', intro: 'Bonjour ! Voici les prochains anniversaires de votre église :', outro: 'Ellen envoie à chacun une prière d’anniversaire par WhatsApp, SMS et e-mail le jour même. Un appel ou une visite de votre part comptera beaucoup.', today: 'aujourd’hui', tomorrow: 'demain' },
  de: { subject: 'Geburtstage diese Woche', intro: 'Guten Morgen! Diese Geburtstage stehen in deiner Gemeinde an:', outro: 'Ellen schickt allen am Tag ein Geburtstagsgebet per WhatsApp, SMS und E-Mail. Ein persönlicher Anruf oder Besuch von dir bedeutet viel.', today: 'heute', tomorrow: 'morgen' },
  pt: { subject: 'Aniversários desta semana', intro: 'Bom dia! Estes são os próximos aniversários da sua igreja:', outro: 'A Ellen envia a cada um uma oração de aniversário por WhatsApp, SMS e e-mail no dia. Uma ligação ou visita sua fará toda a diferença.', today: 'hoje', tomorrow: 'amanhã' },
}
