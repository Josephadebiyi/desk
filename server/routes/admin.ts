/**
 * ZionDesk staff console (/admin) + support tickets.
 * Access: signed-in users whose email is in ADMIN_EMAILS (Render → Environment).
 *
 * Users (any signed-in person):
 *   GET  /api/support                    my tickets with messages
 *   POST /api/support                    open a ticket { subject, body }
 *   POST /api/support/:id/reply          { body }
 * Staff:
 *   GET  /api/admin/me                   { admin: boolean }
 *   GET  /api/admin/overview             KPIs, revenue, growth, plan mix, recent sign-ups
 *   GET  /api/admin/churches?q=          PATCH /api/admin/churches/:id   (plan, status, dates)
 *   GET  /api/admin/users?q=             POST  /api/admin/users/:id/suspend { suspended }
 *   GET  /api/admin/promos               POST /api/admin/promos   PATCH /api/admin/promos/:id
 *   GET  /api/admin/tickets?status=      GET /api/admin/tickets/:id   POST /api/admin/tickets/:id/reply   PATCH /api/admin/tickets/:id
 *   GET  /api/admin/payments             recent subscription payments and gifts
 *   GET  /api/admin/system               which integrations have keys (booleans only)
 */
import { Router, type NextFunction, type Request, type Response } from 'express'
import { PLAN_PRICES, type FlwCurrency } from '../../src/lib/currency'
import { db, HttpError, requireUser, route } from '../db'
import { configured, env } from '../env'
import { sendEmail } from '../mail'
import { deleteChurch } from './account'

export const adminRoutes = Router()

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const isStaff = (email: string) => env.adminEmails.includes(email.toLowerCase())

const staff = [
  requireUser(),
  (req: Request, _res: Response, next: NextFunction) => (isStaff(req.caller!.email) ? next() : next(new HttpError(403, 'Staff only.'))),
]

const plainMail = (title: string, paragraphs: string[], link?: { url: string; label: string }) => {
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px">
<h2 style="margin:0 0 12px">${esc(title)}</h2>${paragraphs.map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`).join('')}
${link ? `<p><a href="${esc(link.url)}" style="display:inline-block;padding:10px 18px;background:#6c34ff;color:#fff;border-radius:999px;text-decoration:none">${esc(link.label)}</a></p>` : ''}
<p style="color:#888;font-size:13px">ZionDesk Support</p></div>`
  return { html, text: [title, ...paragraphs, link ? `${link.label}: ${link.url}` : ''].join('\n\n') }
}

/* ───────── support (church users) ───────── */

adminRoutes.get(
  '/support',
  requireUser(),
  route(async (req, res) => {
    const { data } = await db().from('support_tickets').select('*, support_messages(*)').eq('user_id', req.caller!.userId).order('updated_at', { ascending: false }).limit(50)
    res.json({ tickets: data ?? [] })
  }),
)

adminRoutes.post(
  '/support',
  requireUser(),
  route(async (req, res) => {
    const subject = str(req.body?.subject, 160)
    const body = str(req.body?.body, 5000)
    if (!subject || !body) throw new HttpError(400, 'Add a subject and a message.')
    const churchId = /^[0-9a-f-]{36}$/i.test(String(req.headers['x-church-id'] ?? '')) ? String(req.headers['x-church-id']) : null
    const { data: t, error } = await db()
      .from('support_tickets')
      .insert({ church_id: churchId, user_id: req.caller!.userId, email: req.caller!.email, name: req.caller!.name, subject, priority: req.body?.priority === 'high' ? 'high' : 'normal' })
      .select('id')
      .single()
    if (error) throw new HttpError(500, error.message)
    await db().from('support_messages').insert({ ticket_id: t.id, author: 'user', author_name: req.caller!.name, body })
    if (configured.email) {
      const m = plainMail(`New support ticket: ${subject}`, [`From: ${req.caller!.name} <${req.caller!.email}>`, body], { url: `${env.adminUrl || env.siteUrl}/admin/support?t=${t.id}`, label: 'Open in admin' })
      await sendEmail({ to: env.supportEmail, subject: `[Support] ${subject}`, ...m, replyTo: req.caller!.email }).catch((e) => console.error('[support mail]', e))
    }
    res.json({ id: t.id })
  }),
)

adminRoutes.post(
  '/support/:id/reply',
  requireUser(),
  route(async (req, res) => {
    const { data: t } = await db().from('support_tickets').select('id, user_id, subject').eq('id', req.params.id).maybeSingle()
    if (!t || t.user_id !== req.caller!.userId) throw new HttpError(404, 'Ticket not found')
    const body = str(req.body?.body, 5000)
    if (!body) throw new HttpError(400, 'Write a message.')
    await db().from('support_messages').insert({ ticket_id: t.id, author: 'user', author_name: req.caller!.name, body })
    await db().from('support_tickets').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', t.id)
    res.json({ ok: true })
  }),
)

/* ───────── staff console ───────── */

adminRoutes.get('/admin/me', requireUser(), (req, res) => {
  res.json({ admin: isStaff(req.caller!.email), configured: configured.admin })
})

const monthsAgo = (n: number) => {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  d.setMonth(d.getMonth() - n)
  return d
}

adminRoutes.get(
  '/admin/overview',
  ...staff,
  route(async (_req, res) => {
    const { data: churches } = await db().from('churches').select('id, name, plan, plan_status, currency, created_at, trial_ends_at')
    const list = churches ?? []
    const { data: pays } = await db().from('online_payments').select('kind, amount, currency, status, completed_at').eq('status', 'successful').gte('completed_at', monthsAgo(5).toISOString())
    const { count: members } = await db().from('members').select('id', { count: 'exact', head: true })
    const { count: openTickets } = await db().from('support_tickets').select('id', { count: 'exact', head: true }).neq('status', 'closed')
    const { count: users } = await db().from('profiles').select('id', { count: 'exact', head: true })
    const { count: flyers } = await db().from('ai_usage').select('id', { count: 'exact', head: true }).eq('feature', 'designs').gte('at', monthsAgo(0).toISOString())
    const { data: promoUse } = await db().from('promo_redemptions').select('status')

    // Monthly recurring revenue per currency (active paid plans at list price).
    const mrr: Record<string, number> = {}
    for (const c of list.filter((c) => c.plan_status === 'active')) {
      const cur = (PLAN_PRICES[c.currency as FlwCurrency] ? c.currency : 'USD') as FlwCurrency
      mrr[cur] = (mrr[cur] ?? 0) + (PLAN_PRICES[cur]?.[c.plan as 'essentials'] ?? 0)
    }
    // Last 6 months: sign-ups and subscription revenue by currency.
    const months = Array.from({ length: 6 }, (_, i) => monthsAgo(5 - i))
    const key = (d: Date) => d.toISOString().slice(0, 7)
    const growth = months.map((m) => ({
      month: key(m),
      signups: list.filter((c) => c.created_at.slice(0, 7) === key(m)).length,
      revenue: (pays ?? []).filter((p) => p.kind === 'subscription' && p.completed_at?.slice(0, 7) === key(m)).reduce<Record<string, number>>((a, p) => ((a[p.currency] = (a[p.currency] ?? 0) + Number(p.amount)), a), {}),
      gifts: (pays ?? []).filter((p) => p.kind === 'gift' && p.completed_at?.slice(0, 7) === key(m)).length,
    }))
    const count = (f: (c: (typeof list)[number]) => boolean) => list.filter(f).length
    res.json({
      churches: list.length,
      users: users ?? 0,
      members: members ?? 0,
      openTickets: openTickets ?? 0,
      flyersThisMonth: flyers ?? 0,
      status: { trial: count((c) => c.plan_status === 'trial'), active: count((c) => c.plan_status === 'active'), past_due: count((c) => c.plan_status === 'past_due'), cancelled: count((c) => c.plan_status === 'cancelled'), expired: count((c) => c.plan_status === 'expired') },
      plans: { essentials: count((c) => c.plan === 'essentials'), plus: count((c) => c.plan === 'plus'), max: count((c) => c.plan === 'max') },
      mrr,
      growth,
      promos: { active: (promoUse ?? []).filter((p) => p.status === 'active').length, total: (promoUse ?? []).filter((p) => p.status !== 'pending').length },
      recent: [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
    })
  }),
)

adminRoutes.get(
  '/admin/churches',
  ...staff,
  route(async (req, res) => {
    const q = str(req.query.q, 80)
    let query = db().from('churches').select('id, name, slug, location, email, currency, plan, plan_status, plan_renews_at, trial_ends_at, created_at, flw_subaccount_id').order('created_at', { ascending: false }).limit(200)
    if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, '')}%,email.ilike.%${q.replace(/[%,()]/g, '')}%,location.ilike.%${q.replace(/[%,()]/g, '')}%`)
    const { data } = await query
    const ids = (data ?? []).map((c) => c.id)
    const { data: team } = ids.length ? await db().from('church_users').select('church_id, role, profiles(full_name, email)').in('church_id', ids) : { data: [] }
    const { data: mem } = ids.length ? await db().from('members').select('church_id').in('church_id', ids) : { data: [] }
    res.json({
      churches: (data ?? []).map((c) => ({
        ...c,
        onlineGiving: Boolean(c.flw_subaccount_id),
        flw_subaccount_id: undefined,
        members: (mem ?? []).filter((m) => m.church_id === c.id).length,
        admins: (team ?? []).filter((t) => t.church_id === c.id && t.role === 'admin').map((t) => (t.profiles as unknown as { email: string } | null)?.email).filter(Boolean),
        team: (team ?? []).filter((t) => t.church_id === c.id).length,
      })),
    })
  }),
)

adminRoutes.patch(
  '/admin/churches/:id',
  ...staff,
  route(async (req, res) => {
    const b = req.body ?? {}
    const patch: Record<string, unknown> = {}
    if (['essentials', 'plus', 'max'].includes(b.plan)) patch.plan = b.plan
    if (['trial', 'active', 'past_due', 'cancelled', 'expired'].includes(b.plan_status)) patch.plan_status = b.plan_status
    for (const k of ['plan_renews_at', 'trial_ends_at'] as const) if (b[k] === null || (typeof b[k] === 'string' && !Number.isNaN(Date.parse(b[k])))) patch[k] = b[k]
    if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to change')
    const { error } = await db().from('churches').update(patch).eq('id', req.params.id)
    if (error) throw new HttpError(500, error.message)
    res.json({ ok: true })
  }),
)

adminRoutes.get(
  '/admin/users',
  ...staff,
  route(async (req, res) => {
    const q = str(req.query.q, 80).toLowerCase()
    const page = Math.max(1, Number(req.query.page) || 1)
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new HttpError(500, error.message)
    const users = data.users.filter((u) => !q || (u.email ?? '').toLowerCase().includes(q) || String(u.user_metadata?.full_name ?? '').toLowerCase().includes(q))
    const ids = users.map((u) => u.id)
    const { data: links } = ids.length ? await db().from('church_users').select('user_id, role, churches(name)').in('user_id', ids) : { data: [] }
    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name ?? '',
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at,
        confirmed: Boolean(u.email_confirmed_at),
        providers: u.app_metadata?.providers ?? [],
        suspended: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
        staff: isStaff(u.email ?? ''),
        churches: (links ?? []).filter((l) => l.user_id === u.id).map((l) => ({ name: (l.churches as unknown as { name: string } | null)?.name ?? '', role: l.role })),
      })),
      page,
      more: data.users.length === 200,
    })
  }),
)

adminRoutes.post(
  '/admin/users/:id/suspend',
  ...staff,
  route(async (req, res) => {
    if (req.params.id === req.caller!.userId) throw new HttpError(400, 'You can’t suspend yourself.')
    const suspended = Boolean(req.body?.suspended)
    const { error } = await db().auth.admin.updateUserById(String(req.params.id), { ban_duration: suspended ? '876000h' : 'none' })
    if (error) throw new HttpError(500, error.message)
    res.json({ ok: true })
  }),
)

/* promo codes */

adminRoutes.get(
  '/admin/promos',
  ...staff,
  route(async (_req, res) => {
    const { data } = await db().from('promo_codes').select('*, promo_redemptions(status, redeemed_at, churches(name))').order('created_at', { ascending: false })
    res.json({
      promos: (data ?? []).map((p) => {
        const r = ((p.promo_redemptions ?? []) as { status: string; redeemed_at: string; churches: { name: string } | null }[]).filter((x) => x.status !== 'pending')
        return { ...p, promo_redemptions: undefined, redemptions: r.length, activeNow: r.filter((x) => x.status === 'active').length, recent: r.slice(0, 5).map((x) => ({ church: x.churches?.name ?? '', at: x.redeemed_at, status: x.status })) }
      }),
    })
  }),
)

function promoFields(b: Record<string, unknown>, creating: boolean) {
  const f: Record<string, unknown> = {}
  if (creating) {
    const code = str(b.code, 32).toUpperCase()
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new HttpError(400, 'Code: 3–32 letters, numbers, - or _')
    f.code = code
    if (b.kind !== 'percent' && b.kind !== 'free_days') throw new HttpError(400, 'Choose a discount type')
    f.kind = b.kind
    if (b.kind === 'percent') {
      const pct = Number(b.percent_off)
      if (!(pct >= 1 && pct <= 99)) throw new HttpError(400, 'Percent off: 1–99')
      f.percent_off = Math.round(pct)
      f.duration_months = b.duration_months ? Math.min(36, Math.max(1, Math.round(Number(b.duration_months)))) : null
    } else {
      const days = Number(b.free_days)
      if (!(days >= 1 && days <= 365)) throw new HttpError(400, 'Free days: 1–365')
      f.free_days = Math.round(days)
    }
  }
  if (b.description !== undefined) f.description = str(b.description, 200)
  if (b.plans !== undefined) f.plans = (Array.isArray(b.plans) ? b.plans : []).filter((p) => ['essentials', 'plus', 'max'].includes(p as string))
  if (b.max_redemptions !== undefined) f.max_redemptions = b.max_redemptions ? Math.max(1, Math.round(Number(b.max_redemptions))) : null
  if (b.starts_at !== undefined) f.starts_at = b.starts_at && !Number.isNaN(Date.parse(String(b.starts_at))) ? b.starts_at : new Date().toISOString()
  if (b.expires_at !== undefined) f.expires_at = b.expires_at && !Number.isNaN(Date.parse(String(b.expires_at))) ? b.expires_at : null
  if (b.active !== undefined) f.active = Boolean(b.active)
  return f
}

adminRoutes.post(
  '/admin/promos',
  ...staff,
  route(async (req, res) => {
    const { data, error } = await db()
      .from('promo_codes')
      .insert({ ...promoFields(req.body ?? {}, true), created_by: req.caller!.email })
      .select('*')
      .single()
    if (error) throw new HttpError(error.code === '23505' ? 409 : 400, error.code === '23505' ? 'That code already exists.' : error.message)
    res.json({ promo: data })
  }),
)

adminRoutes.patch(
  '/admin/promos/:id',
  ...staff,
  route(async (req, res) => {
    const { error } = await db().from('promo_codes').update(promoFields(req.body ?? {}, false)).eq('id', req.params.id)
    if (error) throw new HttpError(400, error.message)
    res.json({ ok: true })
  }),
)

/* support tickets (staff side) */

adminRoutes.get(
  '/admin/tickets',
  ...staff,
  route(async (req, res) => {
    let q = db().from('support_tickets').select('*, churches(name), support_messages(id)').order('updated_at', { ascending: false }).limit(200)
    if (['open', 'pending', 'closed'].includes(String(req.query.status))) q = q.eq('status', String(req.query.status))
    const { data } = await q
    res.json({ tickets: (data ?? []).map((t) => ({ ...t, messages: (t.support_messages ?? []).length, support_messages: undefined })) })
  }),
)

adminRoutes.get(
  '/admin/tickets/:id',
  ...staff,
  route(async (req, res) => {
    const { data } = await db().from('support_tickets').select('*, churches(name, plan, plan_status), support_messages(*)').eq('id', req.params.id).maybeSingle()
    if (!data) throw new HttpError(404, 'Ticket not found')
    data.support_messages?.sort((a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at))
    res.json({ ticket: data })
  }),
)

adminRoutes.post(
  '/admin/tickets/:id/reply',
  ...staff,
  route(async (req, res) => {
    const body = str(req.body?.body, 5000)
    if (!body) throw new HttpError(400, 'Write a reply.')
    const { data: t } = await db().from('support_tickets').select('id, email, name, subject').eq('id', req.params.id).maybeSingle()
    if (!t) throw new HttpError(404, 'Ticket not found')
    await db().from('support_messages').insert({ ticket_id: t.id, author: 'staff', author_name: 'ZionDesk Support', body })
    await db().from('support_tickets').update({ status: req.body?.close ? 'closed' : 'pending', updated_at: new Date().toISOString() }).eq('id', t.id)
    if (configured.email) {
      const m = plainMail(`Re: ${t.subject}`, [`Hi ${t.name.split(' ')[0] || 'there'},`, body], { url: `${env.siteUrl}/dashboard/help`, label: 'View your conversation' })
      await sendEmail({ to: t.email, subject: `Re: ${t.subject}`, ...m }).catch((e) => console.error('[support reply]', e))
    }
    res.json({ ok: true })
  }),
)

adminRoutes.patch(
  '/admin/tickets/:id',
  ...staff,
  route(async (req, res) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (['open', 'pending', 'closed'].includes(req.body?.status)) patch.status = req.body.status
    if (['low', 'normal', 'high'].includes(req.body?.priority)) patch.priority = req.body.priority
    await db().from('support_tickets').update(patch).eq('id', req.params.id)
    res.json({ ok: true })
  }),
)

adminRoutes.get(
  '/admin/payments',
  ...staff,
  route(async (_req, res) => {
    const { data } = await db().from('online_payments').select('id, church_id, kind, amount, currency, plan, fund, status, email, promo_code, created_at, completed_at, churches(name)').order('created_at', { ascending: false }).limit(150)
    res.json({ payments: data ?? [] })
  }),
)

adminRoutes.get('/admin/system', ...staff, (_req, res) => {
  res.json({ ...configured, siteUrl: env.siteUrl, cron: Boolean(env.cronSecret), commit: (process.env.RENDER_GIT_COMMIT ?? '').slice(0, 7) })
})

/* ───────── detail pages, actions, search, settings ───────── */

const count = async (table: string, churchId: string, filter?: (q: any) => any) => {
  let q = db().from(table).select('id', { count: 'exact', head: true }).eq('church_id', churchId)
  if (filter) q = filter(q)
  const { count: c } = await q
  return c ?? 0
}
const getSetting = async (key: string) => (await db().from('platform_settings').select('value').eq('key', key).maybeSingle()).data?.value ?? null
const setSetting = (key: string, value: unknown) => db().from('platform_settings').upsert({ key, value, updated_at: new Date().toISOString() })

adminRoutes.get(
  '/admin/churches/:id',
  ...staff,
  route(async (req, res) => {
    const id = String(req.params.id)
    const { data: church } = await db().from('churches').select('*').eq('id', id).maybeSingle()
    if (!church) throw new HttpError(404, 'Church not found')
    const { flw_subaccount_id, ...safe } = church as Record<string, unknown>
    const { data: team } = await db().from('church_users').select('user_id, role, created_at, profiles(full_name, email)').eq('church_id', id)
    const stages: Record<string, number> = {}
    for (const st of ['Newcomer', 'Convert', 'Member', 'Worker']) stages[st] = await count('members', id, (q) => q.eq('stage', st))
    const { data: gifts } = await db().from('gifts').select('amount').eq('church_id', id).gte('date', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
    const { data: payments } = await db().from('online_payments').select('id, kind, amount, currency, plan, fund, status, promo_code, created_at').eq('church_id', id).order('created_at', { ascending: false }).limit(20)
    const { data: promos } = await db().from('promo_redemptions').select('status, redeemed_at, ends_at, percent_off, promo_codes(code)').eq('church_id', id)
    const { data: tickets } = await db().from('support_tickets').select('id, subject, status, updated_at').eq('church_id', id).order('updated_at', { ascending: false }).limit(10)
    res.json({
      church: { ...safe, onlineGiving: Boolean(flw_subaccount_id) },
      team: (team ?? []).map((t) => ({ userId: t.user_id, role: t.role, since: t.created_at, name: (t.profiles as unknown as { full_name: string } | null)?.full_name ?? '', email: (t.profiles as unknown as { email: string } | null)?.email ?? '' })),
      stats: {
        members: Object.values(stages).reduce((a, b) => a + b, 0),
        stages,
        giving30d: (gifts ?? []).reduce((a, g) => a + Number(g.amount), 0),
        events: await count('events', id),
        messages: await count('campaigns', id),
        flyers: await count('ai_usage', id, (q) => q.eq('feature', 'designs')),
      },
      payments: payments ?? [],
      promos: (promos ?? []).map((p) => ({ ...p, code: (p.promo_codes as unknown as { code: string } | null)?.code })),
      tickets: tickets ?? [],
      note: ((await getSetting(`note:church:${id}`)) as { text?: string } | null)?.text ?? '',
    })
  }),
)

adminRoutes.put(
  '/admin/churches/:id/note',
  ...staff,
  route(async (req, res) => {
    await setSetting(`note:church:${req.params.id}`, { text: str(req.body?.text, 4000), by: req.caller!.email, at: new Date().toISOString() })
    res.json({ ok: true })
  }),
)

adminRoutes.patch(
  '/admin/churches/:id/members/:userId',
  ...staff,
  route(async (req, res) => {
    const role = String(req.body?.role)
    if (!['admin', 'finance', 'leader'].includes(role)) throw new HttpError(400, 'Unknown role')
    const { error } = await db().from('church_users').update({ role }).eq('church_id', req.params.id).eq('user_id', req.params.userId)
    if (error) throw new HttpError(400, error.message)
    res.json({ ok: true })
  }),
)

adminRoutes.delete(
  '/admin/churches/:id/members/:userId',
  ...staff,
  route(async (req, res) => {
    const { data: team } = await db().from('church_users').select('user_id, role').eq('church_id', req.params.id)
    const admins = (team ?? []).filter((t) => t.role === 'admin')
    if (admins.length === 1 && admins[0].user_id === req.params.userId) throw new HttpError(409, 'This is the church’s only Administrator. Make someone else Administrator first.')
    await db().from('church_users').delete().eq('church_id', req.params.id).eq('user_id', req.params.userId)
    res.json({ ok: true })
  }),
)

adminRoutes.delete(
  '/admin/churches/:id',
  ...staff,
  route(async (req, res) => {
    const { data: church } = await db().from('churches').select('name').eq('id', req.params.id).maybeSingle()
    if (!church) throw new HttpError(404, 'Church not found')
    if (str(req.body?.confirm).toLowerCase() !== church.name.trim().toLowerCase()) throw new HttpError(400, 'Type the church name exactly to confirm.')
    await deleteChurch(String(req.params.id))
    res.json({ ok: true })
  }),
)

adminRoutes.get(
  '/admin/users/:id',
  ...staff,
  route(async (req, res) => {
    const { data, error } = await db().auth.admin.getUserById(String(req.params.id))
    if (error || !data.user) throw new HttpError(404, 'User not found')
    const u = data.user
    const { data: profile } = await db().from('profiles').select('*').eq('id', u.id).maybeSingle()
    const { data: links } = await db().from('church_users').select('role, created_at, churches(id, name, plan, plan_status)').eq('user_id', u.id)
    const { data: tickets } = await db().from('support_tickets').select('id, subject, status, updated_at').eq('user_id', u.id).order('updated_at', { ascending: false }).limit(10)
    res.json({
      user: {
        id: u.id, email: u.email, name: profile?.full_name || u.user_metadata?.full_name || '', avatar: profile?.avatar_url ?? null, phone: u.phone || '',
        createdAt: u.created_at, lastSignIn: u.last_sign_in_at, confirmed: Boolean(u.email_confirmed_at), providers: u.app_metadata?.providers ?? [],
        suspended: Boolean(u.banned_until && new Date(u.banned_until) > new Date()), staff: isStaff(u.email ?? ''),
        language: profile?.ui_language ?? 'en', termsVersion: profile?.terms_version ?? null, termsAcceptedAt: profile?.terms_accepted_at ?? null,
      },
      churches: (links ?? []).map((l) => ({ ...(l.churches as unknown as { id: string; name: string; plan: string; plan_status: string }), role: l.role, since: l.created_at })),
      tickets: tickets ?? [],
    })
  }),
)

/** Email a password-reset or one-time sign-in link (sent from ZionDesk via Resend). */
adminRoutes.post(
  '/admin/users/:id/link',
  ...staff,
  route(async (req, res) => {
    const type = req.body?.type === 'magiclink' ? 'magiclink' : 'recovery'
    const { data: u } = await db().auth.admin.getUserById(String(req.params.id))
    const email = u?.user?.email
    if (!email) throw new HttpError(404, 'User not found')
    const redirectTo = `${env.siteUrl}${type === 'recovery' ? '/reset-password' : '/dashboard'}`
    const { data, error } = await db().auth.admin.generateLink({ type, email, options: { redirectTo } })
    if (error || !data.properties?.action_link) throw new HttpError(500, error?.message ?? 'Could not create the link')
    if (!configured.email) throw new HttpError(503, 'Email is not configured (RESEND_API_KEY).')
    const m = plainMail(type === 'recovery' ? 'Reset your ZionDesk password' : 'Your ZionDesk sign-in link', [type === 'recovery' ? 'Our support team sent you a link to choose a new password. It expires in 1 hour.' : 'Use this one-time link to sign in to ZionDesk. It expires in 1 hour.', 'If you didn’t ask for this, you can ignore this email.'], { url: data.properties.action_link, label: type === 'recovery' ? 'Choose a new password' : 'Sign in' })
    await sendEmail({ to: email, subject: type === 'recovery' ? 'Reset your ZionDesk password' : 'Sign in to ZionDesk', ...m })
    res.json({ ok: true, sentTo: email })
  }),
)

adminRoutes.delete(
  '/admin/users/:id',
  ...staff,
  route(async (req, res) => {
    const id = String(req.params.id)
    if (id === req.caller!.userId) throw new HttpError(400, 'You can’t delete your own account here.')
    const { data: u } = await db().auth.admin.getUserById(id)
    if (!u?.user) throw new HttpError(404, 'User not found')
    if (str(req.body?.confirm).toLowerCase() !== (u.user.email ?? '').toLowerCase()) throw new HttpError(400, 'Type the user’s email exactly to confirm.')
    const { data: links } = await db().from('church_users').select('church_id, role').eq('user_id', id)
    for (const l of links ?? []) {
      if (l.role !== 'admin') continue
      const { data: team } = await db().from('church_users').select('user_id, role').eq('church_id', l.church_id)
      const others = (team ?? []).filter((t) => t.user_id !== id)
      if (others.length && !others.some((t) => t.role === 'admin')) throw new HttpError(409, 'This user is the only Administrator of a church with other team members. Change roles on the church page first.')
      if (!others.length) await deleteChurch(l.church_id)
    }
    const { error } = await db().auth.admin.deleteUser(id)
    if (error) throw new HttpError(500, error.message)
    res.json({ ok: true })
  }),
)

adminRoutes.get(
  '/admin/search',
  ...staff,
  route(async (req, res) => {
    const q = str(req.query.q, 60).replace(/[%,()]/g, '')
    if (q.length < 2) return res.json({ churches: [], users: [] })
    const { data: churches } = await db().from('churches').select('id, name, location, plan_status').or(`name.ilike.%${q}%,email.ilike.%${q}%,location.ilike.%${q}%`).limit(6)
    const { data: users } = await db().from('profiles').select('id, full_name, email').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(6)
    res.json({ churches: churches ?? [], users: users ?? [] })
  }),
)

adminRoutes.get(
  '/admin/alerts',
  ...staff,
  route(async (_req, res) => {
    const { data: tickets } = await db().from('support_tickets').select('id, subject, name, updated_at, priority').eq('status', 'open').order('updated_at', { ascending: false }).limit(8)
    const { data: pastDue } = await db().from('churches').select('id, name, plan_renews_at').eq('plan_status', 'past_due').limit(8)
    const { data: trials } = await db().from('churches').select('id, name, trial_ends_at').eq('plan_status', 'trial').lte('trial_ends_at', new Date(Date.now() + 2 * 864e5).toISOString()).limit(8)
    res.json({ tickets: tickets ?? [], pastDue: pastDue ?? [], trialsEnding: trials ?? [] })
  }),
)

adminRoutes.get(
  '/admin/settings',
  ...staff,
  route(async (_req, res) => {
    res.json({ announcement: (await getSetting('announcement')) ?? { text: '', active: false, tone: 'info' }, staff: env.adminEmails, supportEmail: env.supportEmail, siteUrl: env.siteUrl, adminUrl: env.adminUrl })
  }),
)

adminRoutes.put(
  '/admin/settings/announcement',
  ...staff,
  route(async (req, res) => {
    const value = { text: str(req.body?.text, 300), active: Boolean(req.body?.active), tone: ['info', 'success', 'warning'].includes(req.body?.tone) ? req.body.tone : 'info', link: str(req.body?.link, 300), by: req.caller!.email, at: new Date().toISOString() }
    const { error } = await setSetting('announcement', value)
    if (error) throw new HttpError(500, error.message)
    res.json({ ok: true })
  }),
)

/** Public: the active announcement shown at the top of every church dashboard. */
adminRoutes.get(
  '/announcement',
  route(async (_req, res) => {
    const a = (await getSetting('announcement').catch(() => null)) as { text?: string; active?: boolean; tone?: string; link?: string; at?: string } | null
    res.json(a?.active && a.text ? { text: a.text, tone: a.tone ?? 'info', link: a.link ?? '', at: a.at } : null)
  }),
)
