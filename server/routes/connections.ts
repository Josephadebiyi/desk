/**
 * Connected churches: two separate ZionDesk accounts linked as head church and sub church (Settings → Connected
 * churches). The link is churches.parent_church_id, the same one branch accounts use (migration 0015).
 *   GET    /api/connections             my head church, my sub churches, my active link codes (admin)
 *   POST   /api/connections/code        create a one-time link code: { as: 'head' | 'sub', email? } (admin) — with an
 *                                       email, the code is sent as an invitation with an Accept button
 *   DELETE /api/connections/code/:code  cancel a code (admin)
 *   POST   /api/connections/join        enter another church's code (admin)
 *   DELETE /api/connections/:churchId   disconnect from the head church or a sub church (admin, either side)
 * What's shared: church details (name, location, contact, denomination, plan) and summary numbers (members,
 * newcomers this month, last service attendance, upcoming events). Never member records or giving.
 */
import { randomInt } from 'node:crypto'
import { Router } from 'express'
import { db, HttpError, requireCaller, route } from '../db'
import { hqPeople } from '../branches'
import { configured, env } from '../env'
import { compose, sendEmails } from '../mail'
import type { EmailKind } from '../../src/emails/catalog'
import { asEmailLang } from '../../src/emails/strings'

export const connectionRoutes = Router()
const admin = requireCaller(['admin'])

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O, 1/I
const newCode = () => Array.from({ length: 8 }, (_, i) => (i === 4 ? '-' : '') + ALPHABET[randomInt(ALPHABET.length)]).join('')
const cleanCode = (v: unknown) => {
  const s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : ''
}

const CHURCH = 'id, name, slug, location, phone, email, denomination, plan, logo_url, parent_church_id, created_at'
type ChurchRow = { id: string; name: string; slug: string; location: string; phone: string; email: string; denomination: string; plan: string; logo_url: string | null; parent_church_id: string | null; created_at: string }

async function churchRow(id: string) {
  const { data } = await db().from('churches').select(CHURCH).eq('id', id).maybeSingle()
  return (data as ChurchRow | null) ?? null
}

/** Summary a connected church can see: details and numbers, no member records. */
async function shared(c: ChurchRow) {
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  const [members, newcomers, events, lastService] = await Promise.all([
    db().from('members').select('id', { count: 'exact', head: true }).eq('church_id', c.id).eq('membership_status', 'Active'),
    db().from('members').select('id', { count: 'exact', head: true }).eq('church_id', c.id).gte('date_joined', monthStart),
    db().from('events').select('title, date, start_time, mode, location').eq('church_id', c.id).gte('date', today).order('date').limit(5),
    db().from('attendance').select('service_date').eq('church_id', c.id).order('service_date', { ascending: false }).limit(1),
  ])
  const lastDate = (lastService.data?.[0]?.service_date as string | undefined) ?? null
  const lastCount = lastDate ? (await db().from('attendance').select('id', { count: 'exact', head: true }).eq('church_id', c.id).eq('service_date', lastDate)).count ?? 0 : null
  return {
    id: c.id,
    name: c.name,
    location: c.location,
    phone: c.phone,
    email: c.email,
    denomination: c.denomination,
    plan: c.plan,
    logoUrl: c.logo_url,
    joinUrl: `${env.siteUrl}/join/${c.slug}`,
    stats: {
      members: members.count ?? 0,
      newThisMonth: newcomers.count ?? 0,
      lastService: lastDate ? { date: lastDate, count: lastCount } : null,
    },
    events: (events.data ?? []).map((e) => ({ title: e.title, date: e.date, time: String(e.start_time).slice(0, 5), mode: e.mode, location: e.location })),
  }
}

/** True when `maybeChild` is `id` itself or sits anywhere above it (so linking would make a loop). */
async function isAncestorOrSelf(maybeAncestor: string, id: string) {
  let cur: string | null = id
  for (let i = 0; cur && i < 10; i++) {
    if (cur === maybeAncestor) return true
    const { data }: { data: { parent_church_id: string | null } | null } = await db().from('churches').select('parent_church_id').eq('id', cur).maybeSingle()
    cur = data?.parent_church_id ?? null
  }
  return false
}

const PAGE = () => `${env.siteUrl}/dashboard/settings?tab=connections`
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Emails the other church's admins (connected / disconnected). */
async function tellAdmins(churchId: string, kind: EmailKind, otherName: string) {
  if (!configured.email) return
  const to = await hqPeople(churchId)
  if (!to.length) return
  await sendEmails(to.map((p) => compose(kind, p.lang, p.email, { name: p.name, church: otherName }, PAGE()))).catch((e) => console.error('[connections email]', e instanceof Error ? e.message : e))
}

connectionRoutes.get(
  '/connections',
  admin,
  route(async (req, res) => {
    const me = await churchRow(req.caller!.churchId)
    if (!me) throw new HttpError(404, 'Church not found')
    const [parent, { data: kids }, { data: codes, error: codesError }] = await Promise.all([
      me.parent_church_id ? churchRow(me.parent_church_id) : Promise.resolve(null),
      db().from('churches').select(CHURCH).eq('parent_church_id', me.id).order('name'),
      db().from('church_link_codes').select('code, creator_role, expires_at, invited_email').eq('church_id', me.id).is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
    ])
    res.json({
      ready: !codesError, // false until migration 0019 has run
      head: parent ? await shared(parent) : null,
      subs: await Promise.all(((kids ?? []) as ChurchRow[]).map(shared)),
      codes: (codes ?? []).map((c) => ({ code: c.code, as: c.creator_role, expiresAt: c.expires_at, email: c.invited_email })),
    })
  }),
)

connectionRoutes.post(
  '/connections/code',
  admin,
  route(async (req, res) => {
    const churchId = req.caller!.churchId
    const as = req.body?.as === 'sub' ? 'sub' : 'head'
    const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200)
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.')
    if (email && !configured.email) throw new HttpError(503, 'Email is not set up on the server yet. Share the code instead.')
    const me = await churchRow(churchId)
    if (!me) throw new HttpError(404, 'Church not found')
    if (as === 'sub' && me.parent_church_id) throw new HttpError(409, 'Your church is already connected to a head church. Disconnect it first.')
    // A few live codes at most, so old ones don't pile up.
    const { count } = await db().from('church_link_codes').select('code', { count: 'exact', head: true }).eq('church_id', churchId).is('used_at', null).gt('expires_at', new Date().toISOString())
    if ((count ?? 0) >= 5) throw new HttpError(429, 'You already have 5 active codes. Cancel one first.')
    for (let i = 0; i < 5; i++) {
      const code = newCode()
      const { data, error } = await db()
        .from('church_link_codes')
        .insert({ code, church_id: churchId, creator_role: as, created_by: req.caller!.userId, invited_email: email || null })
        .select('code, creator_role, expires_at, invited_email')
        .single()
      if (!error && data) {
        if (email) {
          // The invitation: the button opens Settings → Connected churches with the code filled in, ready to accept.
          const { data: who } = await db().from('profiles').select('full_name, comm_language').eq('email', email).maybeSingle()
          const greet = (who?.full_name || '').split(' ')[0] || email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/, (x) => x.toUpperCase())
          const kind: EmailKind = as === 'head' ? 'churchInviteSub' : 'churchInviteHead'
          try {
            await sendEmails([compose(kind, asEmailLang(who?.comm_language), email, { name: greet, inviter: req.caller!.name || req.caller!.email, church: me.name }, `${PAGE()}&code=${data.code}`)])
          } catch (e) {
            await db().from('church_link_codes').delete().eq('code', data.code)
            throw new HttpError(502, `The invitation could not be sent: ${e instanceof Error ? e.message : 'email error'}`)
          }
          console.log(`[connections] ${churchId} invited ${email} (${as})`)
        }
        return res.json({ code: data.code, as: data.creator_role, expiresAt: data.expires_at, email: data.invited_email })
      }
      if (error && error.code === '42P01') throw new HttpError(503, 'Connected churches need a database update (migration 0019).')
      if (error && error.code !== '23505') throw error
    }
    throw new HttpError(500, 'Could not create a code. Please try again.')
  }),
)

connectionRoutes.delete(
  '/connections/code/:code',
  admin,
  route(async (req, res) => {
    await db().from('church_link_codes').delete().eq('code', cleanCode(req.params.code)).eq('church_id', req.caller!.churchId).is('used_at', null)
    res.json({ ok: true })
  }),
)

/** What a code would do, shown before accepting: { church, as } (as = what the code's church becomes). */
connectionRoutes.get(
  '/connections/code/:code',
  admin,
  route(async (req, res) => {
    const { data: link } = await db().from('church_link_codes').select('church_id, creator_role, expires_at, used_at').eq('code', cleanCode(req.params.code)).maybeSingle()
    if (!link || link.used_at || new Date(link.expires_at).getTime() < Date.now()) throw new HttpError(404, 'This code is not valid or has expired. Ask the other church for a new one.')
    if (link.church_id === req.caller!.churchId) throw new HttpError(400, 'This is your own church’s code — share it with the other church instead.')
    const c = await churchRow(link.church_id)
    res.json({ church: c?.name ?? '', location: c?.location ?? '', as: link.creator_role })
  }),
)

connectionRoutes.post(
  '/connections/join',
  admin,
  route(async (req, res) => {
    const myId = req.caller!.churchId
    const code = cleanCode(req.body?.code)
    if (!code) throw new HttpError(400, 'Enter the 8-character code, like ABCD-1234.')
    const { data: link } = await db().from('church_link_codes').select('code, church_id, creator_role, expires_at, used_at').eq('code', code).maybeSingle()
    if (!link || link.used_at || new Date(link.expires_at).getTime() < Date.now()) throw new HttpError(404, 'This code is not valid or has expired. Ask the other church for a new one.')
    if (link.church_id === myId) throw new HttpError(400, 'This is your own church’s code — share it with the other church instead.')

    const headId = link.creator_role === 'head' ? link.church_id : myId
    const subId = link.creator_role === 'head' ? myId : link.church_id
    const [head, sub] = await Promise.all([churchRow(headId), churchRow(subId)])
    if (!head || !sub) throw new HttpError(404, 'Church not found')
    if (sub.parent_church_id === head.id) throw new HttpError(409, `${sub.name} is already connected to ${head.name}.`)
    if (sub.parent_church_id) throw new HttpError(409, `${sub.name} is already connected to a head church. Disconnect it first in Settings → Connected churches.`)
    if (await isAncestorOrSelf(sub.id, head.id)) throw new HttpError(409, `${head.name} sits under ${sub.name} already, so it can’t become its head church.`)

    // Use the code first, so two churches entering it at the same moment can't both link.
    const { data: used } = await db().from('church_link_codes').update({ used_at: new Date().toISOString(), used_by_church: myId }).eq('code', code).is('used_at', null).select('code')
    if (!used?.length) throw new HttpError(409, 'This code was just used. Ask the other church for a new one.')
    const { error } = await db().from('churches').update({ parent_church_id: head.id, parent_branch: sub.name.slice(0, 80) }).eq('id', sub.id).is('parent_church_id', null)
    if (error) throw new HttpError(500, 'Could not connect the churches. Please try again.')

    console.log(`[connections] ${sub.id} joined ${head.id} as sub church`)
    const me = myId === head.id ? head : sub
    void tellAdmins(link.church_id, 'churchConnected', me.name)
    res.json({ ok: true, head: head.name, sub: sub.name })
  }),
)

connectionRoutes.delete(
  '/connections/:churchId',
  admin,
  route(async (req, res) => {
    const myId = req.caller!.churchId
    const otherId = String(req.params.churchId)
    if (!/^[0-9a-f-]{36}$/i.test(otherId)) throw new HttpError(400, 'Choose a church.')
    const [me, other] = await Promise.all([churchRow(myId), churchRow(otherId)])
    if (!me || !other) throw new HttpError(404, 'Church not found')
    // Either I'm the sub leaving my head, or the head letting a sub go.
    const subId = me.parent_church_id === other.id ? me.id : other.parent_church_id === me.id ? other.id : null
    if (!subId) throw new HttpError(404, 'These churches aren’t connected.')
    const { error } = await db().from('churches').update({ parent_church_id: null, parent_branch: null }).eq('id', subId)
    if (error) throw new HttpError(500, 'Could not disconnect. Please try again.')
    console.log(`[connections] ${myId} disconnected from ${otherId}`)
    void tellAdmins(other.id, 'churchDisconnected', me.name)
    res.json({ ok: true })
  }),
)
