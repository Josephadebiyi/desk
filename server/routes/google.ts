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
const googleFetch = (url: string, options: RequestInit = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(10_000) })
const redirectUri = () => `${env.apiUrl}/api/google/callback`
const secret = () => {
  const key = env.cronSecret || env.supabaseServiceKey
  if (!key) throw new HttpError(503, 'Google OAuth signing is not configured.')
  return key
}

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
  if (want.length !== got.length || !timingSafeEqual(want, got) || !Number.isFinite(Number(parts[2])) || Number(parts[2]) < Date.now()) return null
  return { churchId: parts[0], userId: parts[1] }
}

async function token(params: Record<string, string>) {
  const res = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.googleClientId, client_secret: env.googleClientSecret, ...params }),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; id_token?: string; error_description?: string; error?: string }
  if (!res.ok || !data.access_token) throw Object.assign(new HttpError(502, `Google: ${data.error_description ?? data.error ?? res.status}`), { googleCode: data.error })
  return data
}

async function accessToken(churchId: string) {
  const { data } = await db().from('google_connections').select('refresh_token').eq('church_id', churchId).maybeSingle()
  if (!data) return null
  try {
    return (await token({ grant_type: 'refresh_token', refresh_token: data.refresh_token })).access_token!
  } catch (e) {
    // Only revoked consent invalidates the connection; outages must not delete it.
    if ((e as { googleCode?: string }).googleCode === 'invalid_grant') {
      await db().from('google_connections').delete().eq('church_id', churchId)
      await db().from('churches').update({ google_meet_email: null }).eq('id', churchId)
    }
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
    const { error: connectionError } = await db().from('google_connections').upsert({ church_id: st.churchId, google_email: email, refresh_token: t.refresh_token, connected_by: st.userId, connected_at: new Date().toISOString() })
    if (connectionError) return back('failed')
    await db().from('churches').update({ google_meet_email: email }).eq('id', st.churchId)
    back('connected')
  }),
)

googleRoutes.post(
  '/google/disconnect',
  requireCaller(['admin']),
  route(async (req, res) => {
    const { data } = await db().from('google_connections').select('refresh_token').eq('church_id', req.caller!.churchId).maybeSingle()
    if (data) await googleFetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: 'POST' }).catch(() => undefined)
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
    if (!configured.googleMeet) throw new HttpError(503, 'Google Meet is not configured on the server.')
    const access = await accessToken(ev.church_id)
    if (!access) throw new HttpError(409, 'Connect Google in Settings → Integrations before creating a Meet link.')
    const { data: church } = await db().from('churches').select('name').eq('id', ev.church_id).single()
    const tz = typeof req.body?.timeZone === 'string' ? req.body.timeZone : 'UTC'
    try { new Intl.DateTimeFormat('en', { timeZone: tz }) } catch { throw new HttpError(400, 'Invalid time zone.') }
    const start = `${ev.date}T${String(ev.start_time).slice(0, 5)}:00`
    const end = `${ev.date}T${String(ev.end_time).slice(0, 5)}:00`
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || end <= start) throw new HttpError(400, 'The event end must be after its start.')
    const body = {
      id: ev.id.replace(/-/g, '').toLowerCase(), // Stable Google-compatible ID makes retries idempotent.
      summary: ev.title,
      description: [ev.notes, `${church?.name ?? ''} · ZionDesk`].filter(Boolean).join('\n\n'),
      start: { dateTime: `${ev.date}T${String(ev.start_time).slice(0, 5)}:00`, timeZone: tz },
      end: { dateTime: `${ev.date}T${String(ev.end_time).slice(0, 5)}:00`, timeZone: tz },
      conferenceData: { createRequest: { requestId: ev.id, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    }
    const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
    const headers = { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }
    type CalendarEvent = { id?: string; hangoutLink?: string; error?: { message?: string }; conferenceData?: { createRequest?: { status?: { statusCode?: string } }; entryPoints?: { entryPointType: string; uri: string }[] } }
    const read = async (r: Response): Promise<CalendarEvent> => {
      const data = await r.json().catch(() => ({})) as CalendarEvent
      if (!r.ok) throw new HttpError(502, `Google Calendar: ${data.error?.message ?? r.status}`)
      return data
    }
    let data: CalendarEvent
    if (ev.google_event_id) {
      data = await read(await googleFetch(`${base}/${encodeURIComponent(ev.google_event_id)}`, { headers }))
    } else {
      const r = await googleFetch(`${base}?conferenceDataVersion=1`, { method: 'POST', headers, body: JSON.stringify(body) })
      data = r.status === 409
        ? await read(await googleFetch(`${base}/${body.id}`, { headers }))
        : await read(r)
      if (!data.id) throw new HttpError(502, 'Google Calendar returned no event ID.')
      const { error } = await db().from('events').update({ google_event_id: data.id }).eq('id', ev.id).eq('church_id', ev.church_id)
      if (error) throw error
    }
    const link = () => data.hangoutLink || data.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri
    for (let attempt = 0; !link() && attempt < 5; attempt++) {
      if (data.conferenceData?.createRequest?.status?.statusCode === 'failure') throw new HttpError(502, 'Google could not create a Meet conference. Check the connected account’s Meet permissions.')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      data = await read(await googleFetch(`${base}/${encodeURIComponent(data.id!)}`, { headers }))
    }
    const meetLink = link()
    if (!meetLink) throw new HttpError(503, 'Google is still preparing the Meet link. Save the event again to retry.')
    const { error } = await db().from('events').update({ meet_link: meetLink }).eq('id', ev.id).eq('church_id', ev.church_id)
    if (error) throw error
    res.json({ link: meetLink })
  }),
)
