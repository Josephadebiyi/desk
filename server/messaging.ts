/**
 * Sends a campaign to each recipient in their own communication language.
 * Email → Resend. WhatsApp → Meta Cloud API (or Twilio). SMS → Twilio. Unconfigured channels stay "queued".
 */
import enTpl from '../src/i18n/locales/en/tpl'
import esTpl from '../src/i18n/locales/es/tpl'
import frTpl from '../src/i18n/locales/fr/tpl'
import deTpl from '../src/i18n/locales/de/tpl'
import ptTpl from '../src/i18n/locales/pt/tpl'
import { asEmailLang, type EmailLang } from '../src/emails/strings'
import { db } from './db'
import { configured, env } from './env'
import { compose, sendEmails } from './mail'
import { sendWhatsApp } from './whatsapp'

const TPL: Record<EmailLang, Record<string, string>> = { en: enTpl, es: esTpl, fr: frTpl, de: deTpl, pt: ptTpl }
const LOCALE: Record<EmailLang, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' }

export interface Audience {
  type: 'all' | 'stage' | 'department' | 'branch'
  value: string
}

interface MemberRow {
  id: string
  full_name: string
  phone: string
  whatsapp: string
  email: string
  stage: string
  department: string
  branch: string
  membership_status: string
  language: string
}

export async function audienceMembers(churchId: string, a: Audience): Promise<MemberRow[]> {
  let q = db().from('members').select('id, full_name, phone, whatsapp, email, stage, department, branch, membership_status, language').eq('church_id', churchId).neq('membership_status', 'Transferred')
  if (a.type === 'stage') q = q.eq('stage', a.value)
  if (a.type === 'department') q = q.eq('department', a.value)
  if (a.type === 'branch') q = q.eq('branch', a.value)
  const { data, error } = await q.limit(20000)
  if (error) throw error
  return (data ?? []) as MemberRow[]
}

/** Template text for a language (church overrides first), with dates/times in that language. */
export function personalize(raw: string, lang: EmailLang, vars: Record<string, string>, firstName: string, church: string) {
  const v: Record<string, string> = { ...vars }
  if (v.isoDate) v.date = new Date(v.isoDate + 'T00:00:00').toLocaleDateString(LOCALE[lang], { weekday: 'long', month: 'short', day: 'numeric' })
  if (v.isoTime) {
    const [h, m] = v.isoTime.split(':').map(Number)
    v.time = new Date(2000, 0, 1, h, m).toLocaleTimeString(LOCALE[lang], { hour: 'numeric', minute: '2-digit' })
  }
  v.first_name = firstName
  v.church = church
  return raw.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m)
}

async function twilio(channel: 'SMS' | 'WhatsApp', to: string, body: string) {
  const from = channel === 'SMS' ? env.twilioSmsFrom : env.twilioWhatsappFrom
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: channel === 'WhatsApp' ? `whatsapp:${from.replace(/^whatsapp:/, '')}` : from, To: channel === 'WhatsApp' ? `whatsapp:${to}` : to, Body: body }),
  })
  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string }
  if (!res.ok) throw new Error(data.message ?? `Twilio ${res.status}`)
  return data.sid
}

const phoneOf = (s: string) => s.replace(/[^\d+]/g, '')

export async function sendCampaign(campaignId: string, byName: string) {
  const { data: c, error } = await db().from('campaigns').select('*').eq('id', campaignId).single()
  if (error || !c) throw new Error('Campaign not found')
  const { data: church } = await db().from('churches').select('name').eq('id', c.church_id).single()
  const { data: overrides } = await db().from('message_templates').select('key, lang, text').eq('church_id', c.church_id)
  const churchName = church?.name ?? ''
  const channel = c.channel as 'SMS' | 'WhatsApp' | 'Email'
  const all = await audienceMembers(c.church_id, c.audience as Audience)
  const recipients = all.filter((m) => (channel === 'Email' ? m.email : channel === 'WhatsApp' ? m.whatsapp : m.phone))

  await db().from('campaigns').update({ status: 'Sending' }).eq('id', campaignId)

  const textFor = (m: MemberRow) => {
    const lang = asEmailLang(m.language)
    const raw = c.template
      ? (overrides ?? []).find((o) => o.key === c.template && o.lang === lang)?.text ?? TPL[lang][c.template] ?? c.body
      : c.body
    return { lang, text: personalize(raw, lang, (c.vars ?? {}) as Record<string, string>, m.full_name.split(' ')[0], churchName) }
  }

  const rows: Record<string, unknown>[] = []
  const comms: Record<string, unknown>[] = []
  const today = new Date().toISOString().slice(0, 10)

  if (channel === 'Email') {
    const out = recipients.map((m) => {
      const { lang, text } = textFor(m)
      const subject = c.subject || text.split(/[.!?\n]/)[0].slice(0, 80)
      return { m, lang, text, mail: compose('message', lang, m.email, { church: churchName, subject, text }) }
    })
    let ids: (string | undefined)[] = []
    let failure = ''
    try {
      ids = configured.email ? await sendEmails(out.map((o) => o.mail)) : []
    } catch (e) {
      failure = e instanceof Error ? e.message : 'send failed'
    }
    out.forEach((o, i) => {
      rows.push({ church_id: c.church_id, campaign_id: c.id, member_id: o.m.id, channel, language: o.lang, to_address: o.m.email, status: failure ? 'failed' : configured.email ? 'sent' : 'queued', provider_id: ids[i] ?? null, error: failure || null })
      comms.push({ church_id: c.church_id, member_id: o.m.id, date: today, channel, summary: (c.subject || o.text).slice(0, 90), by_name: byName })
    })
  } else {
    const ready = channel === 'SMS' ? configured.sms : configured.whatsapp
    for (const m of recipients) {
      const { lang, text } = textFor(m)
      const to = phoneOf(channel === 'WhatsApp' ? m.whatsapp : m.phone)
      let status = 'queued'
      let providerId: string | undefined
      let err: string | null = null
      if (ready) {
        try {
          providerId = channel === 'WhatsApp' && configured.whatsappCloud ? await sendWhatsApp(to, text, lang) : await twilio(channel, to, text)
          status = 'sent'
        } catch (e) {
          status = 'failed'
          err = e instanceof Error ? e.message : 'send failed'
        }
      }
      rows.push({ church_id: c.church_id, campaign_id: c.id, member_id: m.id, channel, language: lang, to_address: to, status, provider_id: providerId ?? null, error: err })
      comms.push({ church_id: c.church_id, member_id: m.id, date: today, channel, summary: text.slice(0, 90), by_name: byName })
    }
  }

  for (let i = 0; i < rows.length; i += 500) await db().from('deliveries').insert(rows.slice(i, i + 500))
  for (let i = 0; i < comms.length; i += 500) await db().from('communications').insert(comms.slice(i, i + 500))
  const failed = rows.filter((r) => r.status === 'failed').length
  const sent = rows.filter((r) => r.status === 'sent').length
  await db().from('campaigns').update({ status: failed && !sent ? 'Failed' : sent ? 'Sent' : 'Queued', recipients: rows.length }).eq('id', campaignId)
  return { recipients: rows.length, sent, failed, queued: rows.length - sent - failed }
}
