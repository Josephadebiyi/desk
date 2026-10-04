/**
 * Google Meet. Each church connects one Google account (Settings → Integrations); ZionDesk then
 * creates a Google Calendar event with a Meet link for every online event.
 *   GET  /api/google/status            { configured, connected, email }
 *   POST /api/google/connect           → { url } Google consent screen (admin)
 *   GET  /api/google/callback          OAuth redirect (add it as an Authorized redirect URI)
 *   POST /api/google/disconnect        (admin)
 *   POST /api/events/:id/meet          create / reuse the Meet link for an event (admin, leader)
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { db, HttpError, requireCaller, route } from '../db'
import { configured, env } from '../env'

export const googleRoutes = Router()

const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events']
const redirectUri = () => `${env.siteUrl}/api/google/callback`
const secret = () => env.cronSecret || env.supabaseServiceKey || 'dev'

/** state = churchId.userId.expiry.signature — so the callback can't be forged. */
const sign = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url')
function makeState(churchId: string, userId: string) {
  const data = `${churchId}.${userId}.${Date.now() + 10 * 60e3}`
  return `${data}.${sign(data)}`
}
function readState(state: string) {
  const parts = state.split('.')
  if (parts.length !== 4) return null
  const data = parts.slice(0, 3).join('.')
  const want = Buffer.from(sign(data))
  const got = Buffer.from(parts[3])
  if (want.length !== got.length || !timingSafeEqual(want, got) || Number(parts[2]) < Date.now()) return null
  return { churchId: parts[0], userId: parts[1] }
}

async function token(params: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.googleClientId, client_secret: env.googleClientSecret, ...params }),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; id_token?: string; error_description?: string; error?: string }
  if (!res.ok || !data.access_token) throw new HttpError(502, `Google: ${data.error_description ?? data.error ?? res.status}`)
  return data
}

async function accessToken(churchId: string) {
  const { data } = await db().from('google_connections').select('refresh_token').eq('church_id', churchId).maybeSingle()
  if (!data) return null
  try {
    return (await token({ grant_type: 'refresh_token', refresh_token: data.refresh_token })).access_token!
  } catch (e) {
    // Revoked or expired consent: forget it so the admin sees "Connect" again.
    await db().from('google_connections').delete().eq('church_id', churchId)
    await db().from('churches').update({ google_meet_email: null }).eq('id', churchId)
    throw e
  }
}

googleRoutes.get(
  '/google/status',
  requireCaller(),
  route(async (req, res) => {
    const { data } = await db().from('google_connections').select('google_email').eq('church_id', req.caller!.churchId).maybeSingle()
    res.json({ configured: configured.googleMeet, connected: Boolean(data), email: data?.google_email ?? '' })
  }),
)

googleRoutes.post(
  '/google/connect',
  requireCaller(['admin']),
  route(async (req, res) => {
    if (!configured.googleMeet) throw new HttpError(503, 'Google Meet is not set up on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')
    const q = new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      login_hint: req.caller!.email,
      state: makeState(req.caller!.churchId, req.caller!.userId),
    })
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` })
  }),
)

googleRoutes.get(
  '/google/callback',
  route(async (req, res) => {
    const back = (q: string) => res.redirect(`${env.siteUrl}/dashboard/settings?tab=integrations&google=${q}`)
    const st = readState(String(req.query.state ?? ''))
    if (!st || !req.query.code) return back('failed')
    const t = await token({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: redirectUri() }).catch(() => null)
    if (!t?.refresh_token) return back('failed')
    let email = ''
    try {
      email = JSON.parse(Buffer.from(t.id_token!.split('.')[1], 'base64url').toString()).email ?? ''
    } catch {
      /* email is only for display */
    }
    // Only an admin of that church may connect it.
    const { data: link } = await db().from('church_users').select('role').eq('church_id', st.churchId).eq('user_id', st.userId).maybeSingle()
    if (link?.role !== 'admin') return back('failed')
    await db().from('google_connections').upsert({ church_id: st.churchId, google_email: email, refresh_token: t.refresh_token, connected_by: st.userId, connected_at: new Date().toISOString() })
    await db().from('churches').update({ google_meet_email: email }).eq('id', st.churchId)
    back('connected')
  }),
)

googleRoutes.post(
  '/google/disconnect',
  requireCaller(['admin']),
  route(async (req, res) => {
    const { data } = await db().from('google_connections').select('refresh_token').eq('church_id', req.caller!.churchId).maybeSingle()
    if (data) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: 'POST' }).catch(() => undefined)
    await db().from('google_connections').delete().eq('church_id', req.caller!.churchId)
    await db().from('churches').update({ google_meet_email: null }).eq('id', req.caller!.churchId)
    res.json({ ok: true })
  }),
)

googleRoutes.post(
  '/events/:id/meet',
  requireCaller(['admin', 'leader']),
  route(async (req, res) => {
    const { data: ev } = await db().from('events').select('*').eq('id', req.params.id).maybeSingle()
    if (!ev || ev.church_id !== req.caller!.churchId) throw new HttpError(404, 'Event not found')
    if (ev.meet_link) return res.json({ link: ev.meet_link })
    if (!configured.googleMeet) return res.json({ link: null })
    const access = await accessToken(ev.church_id)
    if (!access) return res.json({ link: null })
    const { data: church } = await db().from('churches').select('name').eq('id', ev.church_id).single()
    const tz = typeof req.body?.timeZone === 'string' ? req.body.timeZone : 'UTC'
    const body = {
      summary: ev.title,
      description: [ev.notes, `${church?.name ?? ''} · ZionDesk`].filter(Boolean).join('\n\n'),
      start: { dateTime: `${ev.date}T${String(ev.start_time).slice(0, 5)}:00`, timeZone: tz },
      end: { dateTime: `${ev.date}T${String(ev.end_time).slice(0, 5)}:00`, timeZone: tz },
      conferenceData: { createRequest: { requestId: ev.id, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    }
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await r.json().catch(() => ({}))) as { id?: string; hangoutLink?: string; error?: { message?: string } }
    if (!r.ok || !data.hangoutLink) throw new HttpError(502, `Google Calendar: ${data.error?.message ?? r.status}`)
    await db().from('events').update({ meet_link: data.hangoutLink, google_event_id: data.id }).eq('id', ev.id)
    res.json({ link: data.hangoutLink })
  }),
)
