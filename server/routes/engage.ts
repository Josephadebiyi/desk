/**
 * Sunday check-ins, attendance and the WhatsApp / SMS inbox.
 *   POST /api/checkin                     public: check in from the QR page (phone/email or remembered token)
 *   GET  /api/attendance                  Sundays, today's list, people who missed, follow-up settings
 *   POST /api/attendance/checkin          manual check-in by a leader
 *   DELETE /api/attendance/:memberId/:date  undo a check-in
 *   PUT  /api/attendance/settings         follow-up on/off (Essentials & Ministry Max), Sundays, message
 *   POST /api/attendance/followup/:memberId  send a check-up message now
 *   GET  /api/inbox  ·  GET /api/inbox/unread  ·  GET /api/inbox/:id  ·  POST /api/inbox/:id/reply
 *   POST /api/twilio/inbound              Twilio webhook for incoming SMS & WhatsApp
 */
import express, { Router, type Request } from 'express'
import { absentees, checkIn, checkinToken, defaultFollowupText, FOLLOWUP_PLANS, memberFromToken, sendFollowup, serviceDate, trackedSundays } from '../attendance'
import { db, HttpError, requireCaller, route } from '../db'
import { env } from '../env'
import { recordInbound, sendReply, validTwilioSignature } from '../inbox'

export const engageRoutes = Router()

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const hits = new Map<string, number[]>()
function limit(req: Request, perMinute: number) {
  const key = `${req.path}:${req.ip}`
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000)
  recent.push(now)
  hits.set(key, recent)
  if (recent.length > perMinute) throw new HttpError(429, 'Too many requests — please try again in a minute.')
}

/* ───────── public check-in ───────── */
engageRoutes.post(
  '/checkin',
  route(async (req, res) => {
    limit(req, 20)
    const b = req.body ?? {}
    const { data: church } = await db().from('churches').select('id, name').eq('slug', str(b.slug, 60)).maybeSingle()
    if (!church) throw new HttpError(404, 'Church not found')
    const date = serviceDate(b.date)
    let member: { id: string; full_name: string } | null = null
    const fromToken = str(b.token, 120) ? memberFromToken(str(b.token, 120)) : null
    if (fromToken) {
      const { data } = await db().from('members').select('id, full_name').eq('id', fromToken).eq('church_id', church.id).maybeSingle()
      member = data
    }
    if (!member) {
      const phone = str(b.phone, 40).replace(/\D/g, '')
      const email = str(b.email, 200).toLowerCase()
      if (phone.length >= 7) {
        const last9 = phone.slice(-9)
        const { data } = await db().from('members').select('id, full_name').eq('church_id', church.id).or(`phone_digits.like.%${last9},whatsapp_digits.like.%${last9}`).limit(1).maybeSingle()
        member = data
      } else if (EMAIL_RE.test(email)) {
        const { data } = await db().from('members').select('id, full_name').eq('church_id', church.id).ilike('email', email.replace(/[\\%_]/g, '\\$&')).limit(1).maybeSingle()
        member = data
      } else throw new HttpError(400, 'Enter your phone number or email.')
    }
    if (!member) return res.json({ found: false })
    await checkIn(church.id, member.id, date, 'qr')
    res.json({ found: true, firstName: member.full_name.split(' ')[0], token: checkinToken(member.id), date })
  }),
)

/* ───────── attendance (dashboard) ───────── */
engageRoutes.get(
  '/attendance',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    const churchId = req.caller!.churchId
    const date = serviceDate(req.query.date)
    const { data: church } = await db().from('churches').select('plan, plan_status, followup_enabled, followup_missed, followup_message, default_language').eq('id', churchId).single()
    const since = new Date(Date.now() - 57 * 864e5).toISOString().slice(0, 10)
    const { data: rows } = await db().from('attendance').select('member_id, service_date, checked_in_at, method, by_name, members(full_name)').eq('church_id', churchId).gte('service_date', since).order('checked_in_at', { ascending: false })
    const perDay = new Map<string, number>()
    for (const r of rows ?? []) perDay.set(r.service_date, (perDay.get(r.service_date) ?? 0) + 1)
    const missed = church?.followup_missed ?? 2
    res.json({
      date,
      today: (rows ?? []).filter((r) => r.service_date === date).map((r) => ({ memberId: r.member_id, name: (r.members as unknown as { full_name: string } | null)?.full_name ?? '', at: r.checked_in_at, method: r.method, by: r.by_name })),
      days: [...perDay.entries()].map(([d, count]) => ({ date: d, count })).sort((a, b) => a.date.localeCompare(b.date)),
      tracked: await trackedSundays(churchId, 8),
      absentees: await absentees(churchId, missed),
      followup: {
        allowed: FOLLOWUP_PLANS.includes(church?.plan ?? ''),
        enabled: Boolean(church?.followup_enabled),
        missed,
        message: church?.followup_message ?? '',
        defaultMessage: defaultFollowupText(church?.default_language ?? 'en'),
      },
    })
  }),
)

engageRoutes.post(
  '/attendance/checkin',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    const memberId = str(req.body?.memberId, 40)
    const { data: m } = await db().from('members').select('id').eq('id', memberId).eq('church_id', req.caller!.churchId).maybeSingle()
    if (!m) throw new HttpError(404, 'Member not found')
    await checkIn(req.caller!.churchId, m.id, serviceDate(req.body?.date), 'manual', req.caller!.name || req.caller!.email)
    res.json({ ok: true })
  }),
)

engageRoutes.delete(
  '/attendance/:memberId/:date',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    await db().from('attendance').delete().eq('church_id', req.caller!.churchId).eq('member_id', String(req.params.memberId)).eq('service_date', String(req.params.date))
    res.json({ ok: true })
  }),
)

engageRoutes.put(
  '/attendance/settings',
  requireCaller(['admin']),
  route(async (req, res) => {
    const { data: church } = await db().from('churches').select('plan').eq('id', req.caller!.churchId).single()
    const enabled = Boolean(req.body?.enabled)
    if (enabled && !FOLLOWUP_PLANS.includes(church?.plan ?? '')) throw new HttpError(403, 'PLAN_FOLLOWUP')
    const missed = Math.min(6, Math.max(2, Math.round(Number(req.body?.missed) || 2)))
    await db().from('churches').update({ followup_enabled: enabled, followup_missed: missed, followup_message: str(req.body?.message, 600) }).eq('id', req.caller!.churchId)
    res.json({ ok: true })
  }),
)

engageRoutes.post(
  '/attendance/followup/:memberId',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    limit(req, 30)
    const churchId = req.caller!.churchId
    const { data: church } = await db().from('churches').select('followup_missed, followup_message').eq('id', churchId).single()
    const list = await absentees(churchId, church?.followup_missed ?? 2)
    let a = list.find((x) => x.memberId === req.params.memberId)
    if (!a) {
      const { data: m } = await db().from('members').select('id, full_name, phone, whatsapp, email, language, last_followup_at').eq('id', String(req.params.memberId)).eq('church_id', churchId).maybeSingle()
      if (!m) throw new HttpError(404, 'Member not found')
      a = { memberId: m.id, name: m.full_name, phone: m.phone, whatsapp: m.whatsapp, email: m.email, language: m.language, lastSeen: '', missed: church?.followup_missed ?? 2, followedUpAt: m.last_followup_at }
    }
    if (a.followedUpAt && Date.now() - new Date(a.followedUpAt).getTime() < 3 * 864e5) throw new HttpError(429, 'A check-up was sent in the last 3 days.')
    const channel = await sendFollowup(churchId, a, req.caller!.name || req.caller!.email, church?.followup_message ?? '')
    res.json({ ok: true, channel })
  }),
)

/* ───────── inbox ───────── */
engageRoutes.get(
  '/inbox',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    const { data } = await db().from('conversations').select('id, member_id, phone, channel, name, last_message, last_message_at, last_inbound_at, unread').eq('church_id', req.caller!.churchId).order('last_message_at', { ascending: false }).limit(200)
    res.json({ conversations: data ?? [] })
  }),
)

engageRoutes.get(
  '/inbox/unread',
  requireCaller(),
  route(async (req, res) => {
    const { data } = await db().from('conversations').select('unread').eq('church_id', req.caller!.churchId).gt('unread', 0)
    res.json({ unread: (data ?? []).reduce((n, c) => n + c.unread, 0) })
  }),
)

engageRoutes.get(
  '/inbox/:id',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    const { data: conv } = await db().from('conversations').select('*').eq('id', String(req.params.id)).maybeSingle()
    if (!conv || conv.church_id !== req.caller!.churchId) throw new HttpError(404, 'Conversation not found')
    const { data: messages } = await db().from('conversation_messages').select('id, direction, body, status, by_name, created_at').eq('conversation_id', conv.id).order('created_at').limit(500)
    if (conv.unread) await db().from('conversations').update({ unread: 0 }).eq('id', conv.id)
    res.json({ conversation: { ...conv, unread: 0 }, messages: messages ?? [] })
  }),
)

engageRoutes.post(
  '/inbox/:id/reply',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    limit(req, 60)
    const body = str(req.body?.body, 1500)
    if (!body) throw new HttpError(400, 'Type a message.')
    const message = await sendReply(String(req.params.id), req.caller!.churchId, body, req.caller!.name || req.caller!.email)
    res.json({ message })
  }),
)

/* ───────── Twilio: incoming SMS & WhatsApp ───────── */
engageRoutes.post(
  '/twilio/inbound',
  express.urlencoded({ extended: false, limit: '200kb' }),
  async (req, res) => {
    const params = Object.fromEntries(Object.entries(req.body ?? {}).map(([k, v]) => [k, String(v)]))
    const sig = req.header('x-twilio-signature')
    const urls = [`${env.apiUrl}/api/twilio/inbound`, `https://${req.get('host')}${req.originalUrl}`]
    if (!urls.some((u) => validTwilioSignature(u, params, sig))) return res.sendStatus(403)
    res.type('text/xml').send('<Response/>') // no automatic reply; the church answers from ZionDesk
    try {
      const from = params.From ?? ''
      const channel = from.startsWith('whatsapp:') ? 'WhatsApp' : 'SMS'
      await recordInbound({ from: from.replace(/^whatsapp:/, ''), channel, body: params.Body ?? '', profileName: params.ProfileName, providerId: params.MessageSid })
    } catch (e) {
      console.error('[twilio inbound]', e)
    }
  },
)
