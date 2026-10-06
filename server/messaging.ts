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
import { withChurchName } from '../src/emails/sender'
import { logOutbound } from './inbox'

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

/** Plain-language reasons for Twilio / WhatsApp error codes churches are likely to hit. */
const TWILIO_ERRORS: Record<string, string> = {
  '63016': 'WhatsApp only allows free text within 24 hours of the member messaging you. Outside that window an approved WhatsApp template is needed (TWILIO_WHATSAPP_CONTENT_SID).',
  '63015': 'The Twilio WhatsApp sandbox only delivers to phones that first sent the sandbox "join" code.',
  '63003': 'This number is not on WhatsApp.',
  '63024': 'This number is not on WhatsApp.',
  '21211': 'The phone number is not valid. Save it with the country code, e.g. +234…',
  '21614': 'This number cannot receive SMS.',
  '21408': 'Sending to this country is not enabled in the Twilio account (Messaging → Geo permissions).',
  '21610': 'This person has replied STOP and opted out of messages.',
  '63032': 'This person has blocked or opted out of WhatsApp messages from this sender.',
  '63049': 'WhatsApp (Meta) chose not to deliver this message. This happens with marketing-style messages to people who rarely interact.',
  '63007': 'The WhatsApp sender number is not set up on Twilio (check TWILIO_WHATSAPP_FROM).',
  '63112': 'The WhatsApp Business account behind the sender is disabled or not approved yet.',
  '63018': 'Too many WhatsApp messages too quickly. Try again later.',
  '30003': 'The phone is switched off or unreachable.',
  '30005': 'Unknown number: it may not exist.',
  '30006': 'This number can’t receive messages (e.g. a landline).',
  '30007': 'The carrier filtered this message as spam.',
  '30008': 'Delivery failed for an unknown reason on the carrier side.',
}
export const twilioReason = (code: string | number | undefined, fallback = '') => (code ? TWILIO_ERRORS[String(code)] ?? `Twilio error ${code}${fallback ? `: ${fallback}` : ''}` : fallback)

/** `freeform`: a reply inside WhatsApp's 24-hour window (no template needed). */
export async function twilio(channel: 'SMS' | 'WhatsApp', to: string, body: string, opts: { freeform?: boolean } = {}) {
  if (!/^\+\d{8,15}$/.test(to)) throw new Error(TWILIO_ERRORS['21211'])
  const from = channel === 'SMS' ? env.twilioSmsFrom : env.twilioWhatsappFrom
  // Twilio reports the final delivery result (delivered / failed + reason) to this webhook.
  const callback: Record<string, string> = env.apiUrl.startsWith('https://') ? { StatusCallback: `${env.apiUrl}/api/twilio/status` } : {}
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(
      channel === 'SMS' && env.twilioMessagingService
        ? { MessagingServiceSid: env.twilioMessagingService, To: to, Body: body, ...callback }
        : channel === 'WhatsApp' && env.twilioWhatsappContentSid && !opts.freeform
          ? {
              From: `whatsapp:${from.replace(/^whatsapp:/, '')}`,
              To: `whatsapp:${to}`,
              ContentSid: env.twilioWhatsappContentSid,
              // WhatsApp template variables can't contain new lines or long runs of spaces.
              ContentVariables: JSON.stringify({ 1: body.replace(/\s*\n+\s*/g, ' · ').replace(/ {4,}/g, ' ').slice(0, 1000) }),
              ...callback,
            }
          : { From: channel === 'WhatsApp' ? `whatsapp:${from.replace(/^whatsapp:/, '')}` : from, To: channel === 'WhatsApp' ? `whatsapp:${to}` : to, Body: body, ...callback },
    ),
  })
  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number }
  if (!res.ok) throw new Error(twilioReason(data.code, data.message ?? `Twilio ${res.status}`))
  return data.sid
}

/** "+234 803…", "00234…" → "+234803…". Numbers without a country code are left as they are (and rejected with a clear reason). */
export const phoneOf = (s: string) => {
  const p = s.replace(/[^\d+]/g, '')
  return p.startsWith('00') ? '+' + p.slice(2) : p
}

/** Twilio's delivery report: final status for a message we sent. */
export async function recordDeliveryStatus(sid: string, status: string, errorCode?: string) {
  const final = status === 'delivered' || status === 'read' ? 'delivered' : status === 'failed' || status === 'undelivered' ? 'failed' : null
  if (!sid || !final) return
  console.log(`[delivery] ${sid} ${status}${errorCode ? ` code=${errorCode}` : ''}`)
  const { data: rows } = await db()
    .from('deliveries')
    .update({ status: final, error: final === 'failed' ? twilioReason(errorCode, status) : null })
    .eq('provider_id', sid)
    .select('campaign_id')
  const campaignId = rows?.[0]?.campaign_id
  if (!campaignId) return
  const { data: all } = await db().from('deliveries').select('status').eq('campaign_id', campaignId)
  const ok = (all ?? []).some((r) => r.status === 'sent' || r.status === 'delivered')
  await db().from('campaigns').update({ status: ok ? 'Sent' : 'Failed' }).eq('id', campaignId)
}

export async function sendCampaign(campaignId: string, byName: string) {
  const { data: c, error } = await db().from('campaigns').select('*').eq('id', campaignId).single()
  if (error || !c) throw new Error('Campaign not found')
  const { data: church } = await db().from('churches').select('name').eq('id', c.church_id).single()
  const { data: overrides } = await db().from('message_templates').select('key, lang, text').eq('church_id', c.church_id)
  const churchName = church?.name ?? ''
  const channel = c.channel as 'SMS' | 'WhatsApp' | 'Email'
  const all = await audienceMembers(c.church_id, c.audience as Audience)
  const recipients = all.filter((m) => (channel === 'Email' ? m.email : channel === 'WhatsApp' ? m.whatsapp || m.phone : m.phone))

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
      const { lang, text: raw } = textFor(m)
      const text = withChurchName(raw, churchName)
      const to = phoneOf(channel === 'WhatsApp' ? m.whatsapp || m.phone : m.phone)
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
      if (status === 'sent') await logOutbound({ churchId: c.church_id, memberId: m.id, name: m.full_name, to, channel, body: text, providerId, byName })
      comms.push({ church_id: c.church_id, member_id: m.id, date: today, channel, summary: text.slice(0, 90), by_name: byName })
    }
  }

  for (let i = 0; i < rows.length; i += 500) await db().from('deliveries').insert(rows.slice(i, i + 500))
  for (let i = 0; i < comms.length; i += 500) await db().from('communications').insert(comms.slice(i, i + 500))
  const failed = rows.filter((r) => r.status === 'failed').length
  const sent = rows.filter((r) => r.status === 'sent').length
  await db().from('campaigns').update({ status: failed && !sent ? 'Failed' : sent ? 'Sent' : 'Queued', recipients: rows.length }).eq('id', campaignId)
  const firstError = (rows.find((r) => r.error)?.error as string | undefined) ?? null
  // waiting: the channel isn't switched on for this server, so nothing could go out.
  const waiting = channel !== 'Email' ? !(channel === 'SMS' ? configured.sms : configured.whatsapp) : !configured.email
  console.log(`[campaign] ${campaignId} ${channel} recipients=${rows.length} sent=${sent} failed=${failed} queued=${rows.length - sent - failed}${waiting ? ' (channel not switched on)' : ''}${firstError ? ` firstError="${firstError}"` : ''}`)
  return { recipients: rows.length, sent, failed, queued: rows.length - sent - failed, error: firstError, waiting }
}
