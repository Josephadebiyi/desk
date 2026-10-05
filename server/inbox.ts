/**
 * Inbox: every SMS / WhatsApp message to or from a member, grouped into one conversation per number.
 * All churches share one ZionDesk sender, so an incoming reply is routed to the church that last
 * messaged that number (then: the only church that has this person as a member).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { withChurchName } from '../src/emails/sender'
import { db, HttpError } from './db'
import { configured, env } from './env'
import { twilio } from './messaging'
import { sendWhatsApp } from './whatsapp'

export type InboxChannel = 'WhatsApp' | 'SMS'
const digits = (s: string) => s.replace(/\D/g, '')
/** "+234 803-123 4567" → "+2348031234567" */
export const normPhone = (s: string) => {
  const d = digits(s)
  return d ? `+${d}` : ''
}

async function conversationFor(churchId: string, phone: string, channel: InboxChannel, memberId: string | null, name: string) {
  const { data: existing } = await db().from('conversations').select('*').eq('church_id', churchId).eq('phone', phone).eq('channel', channel).maybeSingle()
  if (existing) {
    if ((!existing.member_id && memberId) || (!existing.name && name)) await db().from('conversations').update({ member_id: existing.member_id ?? memberId, name: existing.name || name }).eq('id', existing.id)
    return existing
  }
  const { data, error } = await db().from('conversations').insert({ church_id: churchId, phone, channel, member_id: memberId, name }).select('*').single()
  if (error) {
    // Created at the same moment by another request.
    const { data: again } = await db().from('conversations').select('*').eq('church_id', churchId).eq('phone', phone).eq('channel', channel).single()
    return again!
  }
  return data
}

/** Records a message ZionDesk sent (campaigns, follow-ups, replies) so the thread shows both sides. */
export async function logOutbound(p: { churchId: string; memberId: string | null; name: string; to: string; channel: InboxChannel; body: string; providerId?: string | null; byName: string; status?: string }) {
  const phone = normPhone(p.to)
  if (!phone) return
  try {
    const conv = await conversationFor(p.churchId, phone, p.channel, p.memberId, p.name)
    await db().from('conversation_messages').insert({ conversation_id: conv.id, church_id: p.churchId, direction: 'out', body: p.body, status: p.status ?? 'sent', provider_id: p.providerId ?? null, by_name: p.byName })
    await db().from('conversations').update({ last_message: p.body.slice(0, 200), last_message_at: new Date().toISOString() }).eq('id', conv.id)
  } catch (e) {
    console.error('[inbox out]', e)
  }
}

async function churchForInbound(phone: string) {
  const { data: conv } = await db().from('conversations').select('church_id').eq('phone', phone).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
  if (conv) return conv.church_id as string
  const d = digits(phone)
  const { data: del } = await db().from('deliveries').select('church_id').in('to_address', [phone, d, `+${d}`]).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (del) return del.church_id as string
  const last9 = d.slice(-9)
  if (last9.length < 9) return null
  const { data: mem } = await db().from('members').select('church_id').or(`phone_digits.like.%${last9},whatsapp_digits.like.%${last9}`).limit(5)
  const churches = [...new Set((mem ?? []).map((m) => m.church_id))]
  return churches.length === 1 ? churches[0] : null
}

async function memberFor(churchId: string, phone: string) {
  const last9 = digits(phone).slice(-9)
  if (last9.length < 9) return null
  const { data } = await db().from('members').select('id, full_name').eq('church_id', churchId).or(`phone_digits.like.%${last9},whatsapp_digits.like.%${last9}`).limit(1).maybeSingle()
  return data
}

/** A message from a member (Twilio or Meta webhook). */
export async function recordInbound(p: { from: string; channel: InboxChannel; body: string; profileName?: string; providerId?: string }) {
  const phone = normPhone(p.from)
  const body = p.body.trim().slice(0, 4000)
  if (!phone || !body) return
  const churchId = await churchForInbound(phone)
  if (!churchId) return console.warn('[inbox] no church for an incoming message')
  const member = await memberFor(churchId, phone)
  const conv = await conversationFor(churchId, phone, p.channel, member?.id ?? null, member?.full_name ?? p.profileName ?? '')
  if (p.providerId) {
    const { count } = await db().from('conversation_messages').select('id', { count: 'exact', head: true }).eq('provider_id', p.providerId)
    if (count) return // webhook retry
  }
  const now = new Date().toISOString()
  await db().from('conversation_messages').insert({ conversation_id: conv.id, church_id: churchId, direction: 'in', body, provider_id: p.providerId ?? null })
  await db().from('conversations').update({ last_message: body.slice(0, 200), last_message_at: now, last_inbound_at: now, unread: (conv.unread ?? 0) + 1 }).eq('id', conv.id)
  if (member) await db().from('communications').insert({ church_id: churchId, member_id: member.id, channel: p.channel, summary: `↩ ${body.slice(0, 120)}`, by_name: member.full_name })
}

/** Reply from the church dashboard. Inside WhatsApp's 24-hour window it's sent as normal text. */
export async function sendReply(conversationId: string, churchId: string, body: string, byName: string) {
  const { data: conv } = await db().from('conversations').select('*').eq('id', conversationId).maybeSingle()
  if (!conv || conv.church_id !== churchId) throw new HttpError(404, 'Conversation not found')
  const { data: church } = await db().from('churches').select('name, default_language').eq('id', churchId).single()
  const { data: member } = conv.member_id ? await db().from('members').select('language').eq('id', conv.member_id).maybeSingle() : { data: null }
  const text = withChurchName(body.trim(), church?.name ?? '')
  const open = conv.last_inbound_at && Date.now() - new Date(conv.last_inbound_at).getTime() < 23.5 * 3600e3
  const channel = conv.channel as InboxChannel
  if (channel === 'SMS' && !configured.sms) throw new HttpError(503, 'SMS is not set up on the server yet.')
  if (channel === 'WhatsApp' && !configured.whatsapp) throw new HttpError(503, 'WhatsApp is not set up on the server yet.')
  const providerId =
    channel === 'WhatsApp' && configured.whatsappCloud
      ? await sendWhatsApp(conv.phone, text, member?.language ?? church?.default_language ?? 'en', { freeform: Boolean(open) })
      : await twilio(channel, conv.phone, text, { freeform: Boolean(open) })
  const { data: msg } = await db()
    .from('conversation_messages')
    .insert({ conversation_id: conv.id, church_id: churchId, direction: 'out', body: text, provider_id: providerId ?? null, by_name: byName })
    .select('*')
    .single()
  await db().from('conversations').update({ last_message: text.slice(0, 200), last_message_at: new Date().toISOString(), unread: 0 }).eq('id', conv.id)
  if (conv.member_id) await db().from('communications').insert({ church_id: churchId, member_id: conv.member_id, channel, summary: text.slice(0, 120), by_name: byName })
  return msg
}

/** Twilio request signature (X-Twilio-Signature): HMAC-SHA1 of the URL + sorted POST params. */
export function validTwilioSignature(url: string, params: Record<string, string>, signature: string | undefined) {
  if (!env.twilioToken || !signature) return false
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  const want = Buffer.from(createHmac('sha1', env.twilioToken).update(data).digest('base64'))
  const got = Buffer.from(signature)
  return want.length === got.length && timingSafeEqual(want, got)
}
