// Development-only sample data for the staff console (`/admin?demo`). Never included in production builds.
const day = 864e5
const now = Date.now()
const iso = (d: number) => new Date(now - d * day).toISOString()
const m = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 7) }
const churches = [
  ['Grace Chapel', 'Lagos', 'NGN', 'plus', 'active', 214], ['Covenant House', 'Accra', 'GHS', 'max', 'active', 530], ['New Life Assembly', 'Nairobi', 'KES', 'essentials', 'trial', 48],
  ['Bethany Church', 'London', 'GBP', 'plus', 'active', 120], ['Living Waters', 'Houston', 'USD', 'essentials', 'past_due', 75], ['Hope City', 'Abuja', 'NGN', 'essentials', 'trial', 32],
  ['Faith Tabernacle', 'Kumasi', 'GHS', 'plus', 'cancelled', 96], ['Zion Assembly', 'Johannesburg', 'ZAR', 'max', 'active', 410],
].map(([name, location, currency, plan, plan_status, members], i) => ({
  id: 'c' + i, name, slug: String(name).toLowerCase().replace(/\s+/g, '-'), location, email: `office@${String(name).toLowerCase().replace(/\s+/g, '')}.org`, currency, plan, plan_status,
  plan_renews_at: iso(-20 + i * 3), trial_ends_at: plan_status === 'trial' ? iso(-4) : null, created_at: iso(3 + i * 9), members, team: 2 + (i % 4), admins: [`pastor${i}@church.org`], onlineGiving: i % 2 === 0,
}))
const data: Record<string, unknown> = {
  '/api/admin/me': { admin: true, configured: true },
  '/api/admin/overview': {
    churches: churches.length, users: 31, members: 1525, openTickets: 2, flyersThisMonth: 64,
    status: { trial: 2, active: 4, past_due: 1, cancelled: 1, expired: 0 }, plans: { essentials: 3, plus: 3, max: 2 },
    mrr: { NGN: 29000, GHS: 590, GBP: 15.99, ZAR: 719 },
    growth: [1, 2, 1, 3, 2, 4].map((s, i) => ({ month: m(5 - i), signups: s, revenue: {}, gifts: [2, 5, 4, 8, 9, 14][i] })),
    promos: { active: 3, total: 5 }, recent: churches.slice(0, 5),
  },
  '/api/admin/churches': { churches },
  '/api/admin/users': {
    users: churches.flatMap((c, i) => [{ id: 'u' + i, email: c.admins[0], name: ['Pastor Mike', 'Ama Mensah', 'Grace Wanjiru', 'James Taylor', 'Ruth Brown', 'Tunde Ade', 'Kofi Boateng', 'Lerato Dube'][i], createdAt: c.created_at, lastSignIn: iso(i), confirmed: true, providers: [i % 2 ? 'google' : 'email'], suspended: false, staff: false, churches: [{ name: c.name, role: 'admin' }] }]),
    page: 1, more: false,
  },
  '/api/admin/promos': {
    promos: [
      { id: 'p1', code: 'LAUNCH30', description: 'Launch week', kind: 'free_days', percent_off: null, duration_months: null, free_days: 30, plans: [], max_redemptions: 100, starts_at: iso(5), expires_at: iso(-25), active: true, created_at: iso(5), redemptions: 6, activeNow: 5, recent: [{ church: 'Hope City', at: iso(1), status: 'active' }] },
      { id: 'p2', code: 'EASTER25', description: 'Easter campaign', kind: 'percent', percent_off: 25, duration_months: 3, free_days: null, plans: ['plus', 'max'], max_redemptions: null, starts_at: iso(20), expires_at: null, active: true, created_at: iso(20), redemptions: 3, activeNow: 3, recent: [{ church: 'Zion Assembly', at: iso(2), status: 'active' }] },
      { id: 'p3', code: 'PARTNER10', description: 'Partner churches', kind: 'percent', percent_off: 10, duration_months: null, free_days: null, plans: [], max_redemptions: 20, starts_at: iso(40), expires_at: null, active: false, created_at: iso(40), redemptions: 2, activeNow: 1, recent: [] },
    ],
  },
  '/api/admin/tickets': { tickets: [
    { id: 't1', subject: 'How do I connect my bank for online giving?', email: 'pastor0@church.org', name: 'Pastor Mike', status: 'open', priority: 'high', created_at: iso(0.2), updated_at: iso(0.1), messages: 1, churches: { name: 'Grace Chapel' } },
    { id: 't2', subject: 'Can members register in French?', email: 'pastor1@church.org', name: 'Ama Mensah', status: 'pending', priority: 'normal', created_at: iso(1), updated_at: iso(0.5), messages: 2, churches: { name: 'Covenant House' } },
  ] },
  '/api/admin/tickets/t1': { ticket: { id: 't1', subject: 'How do I connect my bank for online giving?', email: 'pastor0@church.org', name: 'Pastor Mike', status: 'open', priority: 'high', created_at: iso(0.2), updated_at: iso(0.1), churches: { name: 'Grace Chapel', plan: 'plus', plan_status: 'active' }, support_messages: [{ id: 'm1', author: 'user', author_name: 'Pastor Mike', body: 'Hi team, where do I add our bank account so people can give by card?', created_at: iso(0.2) }] } },
  '/api/admin/payments': { payments: [
    { id: 'pay1', kind: 'subscription', amount: 29000, currency: 'NGN', plan: 'plus', fund: null, status: 'successful', email: 'pastor0@church.org', promo_code: null, created_at: iso(1), churches: { name: 'Grace Chapel' } },
    { id: 'pay2', kind: 'gift', amount: 5000, currency: 'NGN', plan: null, fund: 'Tithe', status: 'successful', email: 'member@gmail.com', promo_code: null, created_at: iso(1.2), churches: { name: 'Grace Chapel' } },
    { id: 'pay3', kind: 'subscription', amount: 539.25, currency: 'ZAR', plan: 'max', fund: null, status: 'successful', email: 'pastor7@church.org', promo_code: 'EASTER25', created_at: iso(2), churches: { name: 'Zion Assembly' } },
  ] },
  '/api/admin/system': { supabase: true, email: true, flutterwave: true, whatsapp: false, sms: false, googleMeet: false, gemini: false, cron: true, commit: 'local' },
}
const real = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(String(input), location.origin).pathname
  if (path in data && (!init?.method || init.method === 'GET')) return new Response(JSON.stringify(data[path]), { headers: { 'Content-Type': 'application/json' } })
  if (path.startsWith('/api/admin/')) return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  return real(input, init)
}) as typeof fetch
