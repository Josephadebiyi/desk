// Development-only stateful sample backend for the staff console (`/admin?demo`).
// Every action works and persists for the session. Never included in production builds.
const day = 864e5
const now = Date.now()
const iso = (d: number) => new Date(now - d * day).toISOString()
const m = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 7) }
const NAMES = ['Pastor Mike', 'Ama Mensah', 'Grace Wanjiru', 'James Taylor', 'Ruth Brown', 'Tunde Ade', 'Kofi Boateng', 'Lerato Dube']

type Any = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const churches: Any[] = [
  ['Grace Chapel', 'Lagos', 'NGN', 'plus', 'active', 214], ['Covenant House', 'Accra', 'GHS', 'max', 'active', 530], ['New Life Assembly', 'Nairobi', 'KES', 'essentials', 'trial', 48],
  ['Bethany Church', 'London', 'GBP', 'plus', 'active', 120], ['Living Waters', 'Houston', 'USD', 'essentials', 'past_due', 75], ['Hope City', 'Abuja', 'NGN', 'essentials', 'trial', 32],
  ['Faith Tabernacle', 'Kumasi', 'GHS', 'plus', 'cancelled', 96], ['Zion Assembly', 'Johannesburg', 'ZAR', 'max', 'active', 410],
].map(([name, location, currency, plan, plan_status, members], i) => ({
  id: 'c' + i, name, slug: String(name).toLowerCase().replace(/\s+/g, '-'), location, email: `office@${String(name).toLowerCase().replace(/\s+/g, '')}.org`, phone: '+234 803 555 01' + i, currency, plan, plan_status,
  plan_renews_at: iso(-20 + i * 3), trial_ends_at: plan_status === 'trial' ? iso(-1.5 - i) : null, created_at: iso(3 + i * 9), members, onlineGiving: i % 2 === 0, flw_subscription_email: `pastor${i}@church.org`,
}))
const users: Any[] = NAMES.map((name, i) => ({ id: 'u' + i, email: `pastor${i}@church.org`, name, avatar: null, phone: '', createdAt: churches[i].created_at, lastSignIn: iso(i * 0.7), confirmed: true, providers: [i % 2 ? 'google' : 'email'], suspended: false, staff: false, language: ['en', 'fr', 'en', 'en', 'en', 'en', 'fr', 'pt'][i], termsVersion: '2026-10-05', termsAcceptedAt: churches[i].created_at }))
const team: Any[] = churches.flatMap((c, i) => [{ church: c.id, userId: 'u' + i, role: 'admin', since: c.created_at }, ...(i < 4 ? [{ church: c.id, userId: 'u' + ((i + 4) % 8), role: 'finance', since: iso(2) }] : [])])
const promos: Any[] = [
  { id: 'p1', code: 'LAUNCH30', description: 'Launch week', kind: 'free_days', percent_off: null, duration_months: null, free_days: 30, plans: [], max_redemptions: 100, starts_at: iso(5), expires_at: iso(-25), active: true, created_at: iso(5), redemptions: 6, signups: 14, activeNow: 5, recent: [{ church: 'Hope City', at: iso(1), status: 'active' }] },
  { id: 'p2', code: 'EASTER25', description: 'Easter campaign', kind: 'percent', percent_off: 25, duration_months: 3, free_days: null, plans: ['plus', 'max'], max_redemptions: null, starts_at: iso(20), expires_at: null, active: true, created_at: iso(20), redemptions: 3, signups: 9, activeNow: 3, recent: [{ church: 'Zion Assembly', at: iso(2), status: 'active' }] },
  { id: 'p3', code: 'PARTNER10', description: 'Partner churches', kind: 'percent', percent_off: 10, duration_months: null, free_days: null, plans: [], max_redemptions: 20, starts_at: iso(40), expires_at: null, active: false, created_at: iso(40), redemptions: 2, signups: 4, activeNow: 1, recent: [] },
]
const tickets: Any[] = [
  { id: 't1', church_id: 'c0', subject: 'How do I connect my bank for online giving?', email: 'pastor0@church.org', name: 'Pastor Mike', status: 'open', priority: 'high', created_at: iso(0.2), updated_at: iso(0.1), user_id: 'u0', msgs: [{ id: 'm1', author: 'user', author_name: 'Pastor Mike', body: 'Hi team, where do I add our bank account so people can give by card?', created_at: iso(0.2) }] },
  { id: 't2', church_id: 'c1', subject: 'Can members register in French?', email: 'pastor1@church.org', name: 'Ama Mensah', status: 'pending', priority: 'normal', created_at: iso(1), updated_at: iso(0.5), user_id: 'u1', msgs: [{ id: 'm2', author: 'user', author_name: 'Ama Mensah', body: 'Some of our members only speak French. Can the join form be in French?', created_at: iso(1) }, { id: 'm3', author: 'staff', author_name: 'ZionDesk Support', body: 'Yes! Every public page has a language switcher at the top — French included.', created_at: iso(0.5) }] },
]
const payments: Any[] = [
  { id: 'pay1', church_id: 'c0', kind: 'subscription', amount: 29000, currency: 'NGN', plan: 'plus', fund: null, status: 'successful', email: 'pastor0@church.org', promo_code: null, created_at: iso(1) },
  { id: 'pay2', church_id: 'c0', kind: 'gift', amount: 5000, currency: 'NGN', plan: null, fund: 'Tithe', status: 'successful', email: 'member@gmail.com', promo_code: null, created_at: iso(1.2) },
  { id: 'pay3', church_id: 'c7', kind: 'subscription', amount: 539.25, currency: 'ZAR', plan: 'max', fund: null, status: 'successful', email: 'pastor7@church.org', promo_code: 'EASTER25', created_at: iso(2) },
  { id: 'pay4', church_id: 'c4', kind: 'subscription', amount: 8, currency: 'USD', plan: 'essentials', fund: null, status: 'failed', email: 'pastor4@church.org', promo_code: null, created_at: iso(3) },
]
const notes: Record<string, string> = { c0: 'Partner church — onboarding call done.' }
const newsletters: { id: string; subject: string; audience: string; sent_count: number; created_by: string; created_at: string }[] = []
let announcement: Any = { text: '', active: false, tone: 'info', link: '' }
const cname = (id: string) => churches.find((c) => c.id === id)?.name ?? ''

function listChurches() {
  return churches.map((c) => ({ ...c, team: team.filter((t) => t.church === c.id).length, admins: team.filter((t) => t.church === c.id && t.role === 'admin').map((t) => users.find((u) => u.id === t.userId)?.email) }))
}
function overview() {
  const cnt = (k: string, v: string) => churches.filter((c) => c[k] === v).length
  return {
    churches: churches.length, users: users.length, members: churches.reduce((a, c) => a + c.members, 0), openTickets: tickets.filter((t) => t.status !== 'closed').length, flyersThisMonth: 64,
    status: { trial: cnt('plan_status', 'trial'), active: cnt('plan_status', 'active'), past_due: cnt('plan_status', 'past_due'), cancelled: cnt('plan_status', 'cancelled'), expired: cnt('plan_status', 'expired') },
    plans: { essentials: cnt('plan', 'essentials'), plus: cnt('plan', 'plus'), max: cnt('plan', 'max') },
    mrr: { NGN: 29000, GHS: 590, GBP: 15.99, ZAR: 719 },
    growth: [1, 2, 1, 3, 2, 4].map((s, i) => ({ month: m(5 - i), signups: s, revenue: {}, gifts: [2, 5, 4, 8, 9, 14][i] })),
    promos: { active: promos.filter((p) => p.active).length, total: promos.reduce((a, p) => a + p.redemptions, 0) }, recent: [...churches].reverse().slice(0, 5),
  }
}
function userRow(u: Any) {
  return { ...u, churches: team.filter((t) => t.userId === u.id).map((t) => ({ name: cname(t.church), role: t.role })) }
}

type Handler = (p: string[], body: Any, q: URLSearchParams) => unknown
const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/admin\/me$/, () => ({ admin: true, configured: true })],
  ['GET', /^\/api\/admin\/overview$/, overview],
  ['GET', /^\/api\/admin\/churches$/, (_p, _b, q) => ({ churches: listChurches().filter((c) => !q.get('q') || JSON.stringify(c).toLowerCase().includes(q.get('q')!.toLowerCase())) })],
  ['GET', /^\/api\/admin\/churches\/([^/]+)$/, ([id]) => {
    const c = churches.find((x) => x.id === id)
    if (!c) throw new Error('Church not found')
    const per = Math.round(c.members / 10)
    return {
      church: c, note: notes[id] ?? '',
      team: team.filter((t) => t.church === id).map((t) => { const u = users.find((x) => x.id === t.userId)!; return { userId: u.id, role: t.role, since: t.since, name: u.name, email: u.email } }),
      stats: { members: c.members, stages: { Newcomer: per * 2, Convert: per, Member: per * 5, Worker: c.members - per * 8 }, giving30d: c.currency === 'NGN' ? 2480000 : 9845, events: 6, messages: 14, flyers: 5 },
      payments: payments.filter((p) => p.church_id === id), promos: id === 'c7' ? [{ code: 'EASTER25', status: 'active', redeemed_at: iso(2), ends_at: iso(-88), percent_off: 25 }] : [],
      tickets: tickets.filter((t) => t.church_id === id).map(({ id: tid, subject, status, updated_at }) => ({ id: tid, subject, status, updated_at })),
    }
  }],
  ['PATCH', /^\/api\/admin\/churches\/([^/]+)$/, ([id], b) => { Object.assign(churches.find((c) => c.id === id)!, b); return { ok: true } }],
  ['PUT', /^\/api\/admin\/churches\/([^/]+)\/note$/, ([id], b) => { notes[id] = b.text; return { ok: true } }],
  ['PATCH', /^\/api\/admin\/churches\/([^/]+)\/members\/([^/]+)$/, ([id, uid], b) => { team.find((t) => t.church === id && t.userId === uid)!.role = b.role; return { ok: true } }],
  ['DELETE', /^\/api\/admin\/churches\/([^/]+)\/members\/([^/]+)$/, ([id, uid]) => {
    const admins = team.filter((t) => t.church === id && t.role === 'admin')
    if (admins.length === 1 && admins[0].userId === uid) throw new Error('This is the church’s only Administrator. Make someone else Administrator first.')
    team.splice(team.findIndex((t) => t.church === id && t.userId === uid), 1); return { ok: true }
  }],
  ['DELETE', /^\/api\/admin\/churches\/([^/]+)$/, ([id], b) => { const i = churches.findIndex((c) => c.id === id); if (b.confirm?.toLowerCase() !== churches[i].name.toLowerCase()) throw new Error('Type the church name exactly to confirm.'); churches.splice(i, 1); return { ok: true } }],
  ['GET', /^\/api\/admin\/users$/, (_p, _b, q) => ({ users: users.filter((u) => !q.get('q') || (u.email + u.name).toLowerCase().includes(q.get('q')!.toLowerCase())).map(userRow), page: 1, more: false })],
  ['GET', /^\/api\/admin\/users\/([^/]+)$/, ([id]) => {
    const u = users.find((x) => x.id === id)
    if (!u) throw new Error('User not found')
    return { user: u, churches: team.filter((t) => t.userId === id).map((t) => { const c = churches.find((x) => x.id === t.church)!; return { id: c.id, name: c.name, plan: c.plan, plan_status: c.plan_status, role: t.role, since: t.since } }), tickets: tickets.filter((t) => t.user_id === id).map(({ id: tid, subject, status, updated_at }) => ({ id: tid, subject, status, updated_at })) }
  }],
  ['POST', /^\/api\/admin\/users\/([^/]+)\/suspend$/, ([id], b) => { users.find((u) => u.id === id)!.suspended = Boolean(b.suspended); return { ok: true } }],
  ['POST', /^\/api\/admin\/users\/([^/]+)\/link$/, ([id]) => ({ ok: true, sentTo: users.find((u) => u.id === id)!.email })],
  ['DELETE', /^\/api\/admin\/users\/([^/]+)$/, ([id], b) => { const i = users.findIndex((u) => u.id === id); if (b.confirm?.toLowerCase() !== users[i].email) throw new Error('Type the user’s email exactly to confirm.'); users.splice(i, 1); return { ok: true } }],
  ['GET', /^\/api\/admin\/promos$/, () => ({ promos })],
  ['POST', /^\/api\/admin\/promos$/, (_p, b) => {
    if (promos.some((p) => p.code === String(b.code).toUpperCase())) throw new Error('That code already exists.')
    const p = { id: 'p' + (promos.length + 1), ...b, code: String(b.code).toUpperCase(), plans: b.plans ?? [], starts_at: new Date().toISOString(), active: true, created_at: new Date().toISOString(), redemptions: 0, activeNow: 0, recent: [] }
    promos.unshift(p); return { promo: p }
  }],
  ['PATCH', /^\/api\/admin\/promos\/([^/]+)$/, ([id], b) => { Object.assign(promos.find((p) => p.id === id)!, b); return { ok: true } }],
  ['GET', /^\/api\/admin\/tickets$/, (_p, _b, q) => ({ tickets: tickets.filter((t) => !q.get('status') || t.status === q.get('status')).map((t) => ({ ...t, msgs: undefined, messages: t.msgs.length, churches: { name: cname(t.church_id) } })) })],
  ['GET', /^\/api\/admin\/tickets\/([^/]+)$/, ([id]) => { const t = tickets.find((x) => x.id === id)!; const c = churches.find((x) => x.id === t.church_id); return { ticket: { ...t, churches: c && { name: c.name, plan: c.plan, plan_status: c.plan_status }, support_messages: t.msgs } } }],
  ['POST', /^\/api\/admin\/tickets\/([^/]+)\/reply$/, ([id], b) => { const t = tickets.find((x) => x.id === id)!; t.msgs.push({ id: 'm' + Date.now(), author: 'staff', author_name: 'ZionDesk Support', body: b.body, created_at: new Date().toISOString() }); t.status = b.close ? 'closed' : 'pending'; t.updated_at = new Date().toISOString(); return { ok: true } }],
  ['PATCH', /^\/api\/admin\/tickets\/([^/]+)$/, ([id], b) => { Object.assign(tickets.find((x) => x.id === id)!, b); return { ok: true } }],
  ['GET', /^\/api\/admin\/payments$/, () => ({ payments: payments.map((p) => ({ ...p, churches: { name: cname(p.church_id) } })) })],
  ['GET', /^\/api\/admin\/system$/, () => ({ supabase: true, email: true, flutterwave: true, whatsapp: false, sms: false, googleMeet: false, prayers: true, cron: true, commit: 'local demo' })],
  ['GET', /^\/api\/admin\/search$/, (_p, _b, q) => { const s = (q.get('q') ?? '').toLowerCase(); return { churches: churches.filter((c) => (c.name + c.location + c.email).toLowerCase().includes(s)).slice(0, 6), users: users.filter((u) => (u.name + u.email).toLowerCase().includes(s)).slice(0, 6).map((u) => ({ id: u.id, full_name: u.name, email: u.email })) } }],
  ['GET', /^\/api\/admin\/alerts$/, () => ({ tickets: tickets.filter((t) => t.status === 'open').map(({ id, subject, name, updated_at, priority }) => ({ id, subject, name, updated_at, priority })), pastDue: churches.filter((c) => c.plan_status === 'past_due'), trialsEnding: churches.filter((c) => c.plan_status === 'trial') })],
  ['GET', /^\/api\/admin\/settings$/, () => ({ announcement, staff: ['you@ziondesk.com'], supportEmail: 'hello@ziondesk.com', siteUrl: 'https://ziondesk.com', adminUrl: 'https://admin.ziondesk.com' })],
  ['PUT', /^\/api\/admin\/settings\/announcement$/, (_p, b) => { announcement = { ...b, at: new Date().toISOString() }; return { ok: true } }],
  ['POST', /^\/api\/admin\/emails\/([^/]+)\/test$/, () => ({ ok: true, to: 'you@ziondesk.com' })],
  ['GET', /^\/api\/admin\/newsletters$/, () => ({ history: newsletters, recipients: 42 })],
  ['POST', /^\/api\/admin\/newsletters\/test$/, () => ({ ok: true, to: 'you@ziondesk.com' })],
  ['POST', /^\/api\/admin\/newsletters\/send$/, (_p, b) => { newsletters.unshift({ id: 'n' + Date.now(), subject: b.subject, audience: b.audience, sent_count: 42, created_by: 'you@ziondesk.com', created_at: new Date().toISOString() }); return { ok: true, sent: 42 } }],
]

const real = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), location.origin)
  const method = (init?.method ?? 'GET').toUpperCase()
  for (const [mth, re, fn] of routes) {
    const match = url.pathname.match(re)
    if (match && mth === method) {
      await new Promise((r) => setTimeout(r, 120))
      try {
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        return new Response(JSON.stringify(fn(match.slice(1), body, url.searchParams)), { headers: { 'Content-Type': 'application/json' } })
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
    }
  }
  return real(input, init)
}) as typeof fetch
