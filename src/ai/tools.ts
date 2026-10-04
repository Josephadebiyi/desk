/**
 * Church AI controlled tools.
 *
 * The AI never touches data directly. It can only call these tools, and `runTool`:
 *   1. checks the user is signed in   2. resolves the church (tenant)
 *   3. checks the role's permission   4. validates inputs
 *   5. runs one controlled operation  6. returns structured, grounded results
 * Writes (send, create, delete, finance) return a PendingAction that only runs after
 * an explicit human confirmation. Numbers always come from records — never estimates.
 *
 * These functions are written against the client stores today; the same signatures move
 * server-side (behind authenticated, tenant-scoped sessions) when the backend exists.
 */
import { audienceMembers, audienceLabel, fmtDate, fmtTime, isoLocal, money, tEnum, today } from '../dashboard/kit'
import { getLang as getLangOf, getLocale, localeOf, translate, tr, type Lang } from '../i18n'
import { STAGES, can, type Communication, type Member, type Role } from '../dashboard/types'
import type { Audience, Campaign, ChurchEvent, Settings, Channel } from '../dashboard/workspace'
import { uid } from '../dashboard/types'
import type { Block, PendingAction, ToolDef, ToolResult } from './types'

export interface ToolContext {
  user: { name: string; role: Role } | null
  churchId: string | null
  members: Member[]
  settings: Settings
  events: ChurchEvent[]
  campaigns: Campaign[]
  expenses: { date: string; amount: number; category: string; note: string }[]
  anonGifts: { date: string; amount: number; fund: string; method: string; donor: string }[]
  designRequests: { status: string; title: string }[]
  claims?: { status: string }[]
  messageCost: Record<Channel, number>
  actions: {
    addCampaign: (c: Omit<Campaign, 'id' | 'createdAt'>) => void
    logCommunicationMany: (ids: string[], c: Omit<Communication, 'id'>) => void
    saveEvent: (e: Omit<ChurchEvent, 'id'> & { id?: string }) => ChurchEvent
  }
}

/** Member-facing template in a given language; {first_name}/{church} stay as merge fields. */
export function tpl(key: string, vars?: Record<string, string>, lang?: Lang) {
  const l = lang ?? getLangOf()
  // Raw ISO date/time are formatted in the recipient's language.
  const v: Record<string, string> = { ...(vars ?? {}) }
  if (v.isoDate) v.date = new Date(v.isoDate + 'T00:00:00').toLocaleDateString(localeOf(l), { weekday: 'long', month: 'short', day: 'numeric' })
  if (v.isoTime) {
    const [h, m] = v.isoTime.split(':').map(Number)
    v.time = new Date(2000, 0, 1, h, m).toLocaleTimeString(localeOf(l), { hour: 'numeric', minute: '2-digit' })
  }
  return translate(l, `tpl.${key}`, v)
}
export const reminderVars = (e: { title: string; date: string; start: string }) => ({ event: e.title, isoDate: e.date, isoTime: e.start })

/* ───────── helpers ───────── */

const firstName = (m: Member) => m.fullName.split(' ')[0]
const daysAgo = (d: string) => Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 864e5)
const age = (dob: string) => {
  if (!dob) return null
  const d = new Date(dob + 'T00:00:00')
  const n = new Date()
  let a = n.getFullYear() - d.getFullYear()
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--
  return a
}
const monthKey = (offset = 0) => {
  const d = new Date()
  const x = new Date(d.getFullYear(), d.getMonth() + offset, 1)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}
const monthName = (k: string) => new Date(k + '-01T00:00:00').toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })
const lastContact = (m: Member) => m.communications.map((c) => c.date).sort().at(-1) ?? null

function allGifts(ctx: ToolContext) {
  return [
    ...ctx.members.flatMap((m) => m.giving.map((g) => ({ ...g, donor: m.fullName, branch: m.branch }))),
    ...ctx.anonGifts.map((g) => ({ ...g, branch: '' })),
  ]
}

export function birthdaysWithin(members: Member[], days: number) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return members
    .filter((m) => m.dob && m.membershipStatus !== 'Transferred')
    .map((m) => {
      const d = new Date(m.dob + 'T00:00:00')
      const next = new Date(start.getFullYear(), d.getMonth(), d.getDate())
      if (next < start) next.setFullYear(start.getFullYear() + 1)
      return { m, next, in: Math.round((+next - +start) / 864e5) }
    })
    .filter((x) => x.in <= days)
    .sort((a, b) => +a.next - +b.next)
}

/** Newcomers/converts with no logged contact in `days` days (or ever). */
export function needingFollowUp(members: Member[], days = 7) {
  return members
    .filter((m) => (m.stage === 'Newcomer' || m.stage === 'Convert') && m.membershipStatus === 'Active')
    .filter((m) => {
      const lc = lastContact(m)
      return !lc || daysAgo(lc) > days
    })
}

const list = (items: { title: string; sub?: string; href?: string }[], max = 8): Block => ({
  type: 'list',
  items: items.slice(0, max),
  more: Math.max(0, items.length - max),
})

/* ───────── tool definitions ───────── */

const any = () => true
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export const TOOLS: ToolDef<any>[] = [
  {
    name: 'getTodayBriefing',
    agent: 'admin',
    kind: 'read',
    description: "Today's church briefing: what needs attention, from real records.",
    schema: { type: 'object', properties: {}, additionalProperties: false },
    allow: any,
    validate: () => ({}),
    run: (ctx) => {
      const role = ctx.user!.role
      const bdays = birthdaysWithin(ctx.members, 0)
      const follow = needingFollowUp(ctx.members)
      const todayEvents = ctx.events.filter((e) => e.date === today())
      const soon = ctx.events.filter((e) => e.date > today() && daysAgo(e.date) >= -3)
      const designs = ctx.designRequests.filter((r) => r.status !== 'Delivered')
      const lines: string[] = []
      if (bdays.length) lines.push(tr('ai.brief.bdays', { count: bdays.length }))
      if (follow.length) lines.push(tr('ai.brief.follow', { count: follow.length }))
      todayEvents.forEach((e) => lines.push(tr('ai.brief.eventToday', { title: e.title, time: fmtTime(e.start) })))
      if (soon.length) lines.push(tr('ai.brief.soon', { count: soon.length }))
      if (designs.length) lines.push(tr('ai.brief.designs', { count: designs.length }))
      if (can.viewGiving(role)) {
        const m = allGifts(ctx).filter((g) => g.date.startsWith(monthKey()))
        if (m.length) lines.push(tr('ai.brief.received', { amount: money(m.reduce((s, g) => s + g.amount, 0), ctx.settings.currency) }))
      }
      const hour = new Date().getHours()
      const hello = tr(`ai.hello.${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}`)
      return {
        agent: 'admin',
        activity: tr('ai.brief.activity'),
        blocks: lines.length
          ? [{ type: 'text', text: tr('ai.brief.intro', { hello }) }, { type: 'list', items: lines.map((t) => ({ title: t })) }]
          : [{ type: 'text', text: tr('ai.brief.none', { hello }) }],
      }
    },
  },
  {
    name: 'getFollowUps',
    agent: 'followUp',
    kind: 'read',
    description: 'Newcomers and new converts with no logged contact recently.',
    schema: { type: 'object', properties: { days: { type: 'number' } }, additionalProperties: false },
    allow: (r) => can.editMembers(r),
    validate: (raw) => ({ days: Math.min(60, Math.max(1, Number(raw.days) || 7)) }),
    run: (ctx, { days }) => {
      const rows = needingFollowUp(ctx.members, days)
      if (!rows.length) return { agent: 'followUp', blocks: [{ type: 'text', text: tr('ai.follow.none', { days }) }] }
      return {
        agent: 'followUp',
        activity: tr('ai.follow.activity', { count: rows.length }),
        blocks: [
          { type: 'text', text: tr('ai.follow.intro', { count: rows.length, days }) },
          list(
            rows.map((m) => {
              const lc = lastContact(m)
              return { title: m.fullName, sub: `${tEnum('stage', m.stage)} · ${m.branch} · ${lc ? tr('ai.follow.lastContact', { date: fmtDate(lc) }) : tr('ai.follow.never')}`, href: `/dashboard/members?id=${m.id}` }
            }),
          ),
          { type: 'actions', items: [{ label: tr('ai.follow.writeWelcome'), href: '/dashboard/messaging', state: { draft: tpl('welcome'), template: 'welcome' } }] },
        ],
      }
    },
  },
  {
    name: 'getBirthdays',
    agent: 'memberCare',
    kind: 'read',
    description: 'Members celebrating birthdays today, this week or this month.',
    schema: { type: 'object', properties: { range: { type: 'string', enum: ['today', 'week', 'month'] } }, additionalProperties: false },
    allow: any,
    validate: (raw) => ({ range: ['today', 'week', 'month'].includes(str(raw.range)) ? str(raw.range) : 'week' }),
    run: (ctx, { range }) => {
      const days = range === 'today' ? 0 : range === 'week' ? 7 : 30
      const rows = birthdaysWithin(ctx.members, days)
      const label = range === 'today' ? tr('ai.bday.today') : tr('ai.bday.next', { days })
      if (!rows.length) return { agent: 'memberCare', blocks: [{ type: 'text', text: tr('ai.bday.none', { when: label }) }] }
      return {
        agent: 'memberCare',
        blocks: [
          { type: 'text', text: tr('ai.bday.intro', { count: rows.length, when: label }) },
          list(rows.map((x) => ({ title: x.m.fullName, sub: x.in === 0 ? tr('ai.bday.todayTag') : x.next.toLocaleDateString(getLocale(), { weekday: 'short', month: 'long', day: 'numeric' }), href: `/dashboard/members?id=${x.m.id}` }))),
          { type: 'actions', items: [{ label: tr('ai.bday.send'), href: '/dashboard/messaging', state: { draft: tpl('birthday'), template: 'birthday' } }] },
        ],
      }
    },
  },
  {
    name: 'searchMembers',
    agent: 'knowledge',
    kind: 'read',
    description: 'Find members by name, branch, department, stage, age range or join date.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' }, branch: { type: 'string' }, department: { type: 'string' },
        stage: { type: 'string', enum: [...STAGES] }, ageMin: { type: 'number' }, ageMax: { type: 'number' },
        joined: { type: 'string', enum: ['this month', 'last month'] }, status: { type: 'string', enum: ['Active', 'Inactive', 'Transferred'] },
      },
      additionalProperties: false,
    },
    allow: any,
    validate: (raw) => ({
      query: str(raw.query).slice(0, 80),
      branch: str(raw.branch),
      department: str(raw.department),
      stage: STAGES.includes(raw.stage as never) ? (raw.stage as string) : '',
      ageMin: Number(raw.ageMin) || 0,
      ageMax: Number(raw.ageMax) || 0,
      joined: str(raw.joined),
      status: str(raw.status),
    }),
    run: (ctx, f) => {
      const q = f.query.toLowerCase()
      const jm = f.joined === 'this month' ? monthKey() : f.joined === 'last month' ? monthKey(-1) : ''
      const rows = ctx.members.filter((m) => {
        if (q && !m.fullName.toLowerCase().includes(q) && !m.email.toLowerCase().includes(q) && !m.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '~')) return false
        if (f.branch && m.branch.toLowerCase() !== f.branch.toLowerCase()) return false
        if (f.department && m.department.toLowerCase() !== f.department.toLowerCase()) return false
        if (f.stage && m.stage !== f.stage) return false
        if (f.status && m.membershipStatus !== f.status) return false
        if (jm && !m.dateJoined.startsWith(jm)) return false
        if (f.ageMin || f.ageMax) {
          const a = age(m.dob)
          if (a === null || (f.ageMin && a < f.ageMin) || (f.ageMax && a > f.ageMax)) return false
        }
        return true
      })
      const parts = [f.query && `“${f.query}”`, f.branch && f.branch, f.department && tr('ai.search.dept', { name: f.department }), f.stage && tr(`enums.stagePlural.${f.stage}`), (f.ageMin || f.ageMax) && tr('ai.search.aged', { min: f.ageMin || 0, max: f.ageMax || '∞' }), jm && tr('ai.search.joined', { month: monthName(jm) }), f.status && tEnum('status', f.status)].filter(Boolean)
      if (!rows.length) return { agent: 'knowledge', blocks: [{ type: 'text', text: parts.length ? tr('ai.search.noneFor', { what: parts.join(', ') }) : tr('ai.search.none') }] }
      return {
        agent: 'knowledge',
        blocks: [
          { type: 'text', text: parts.length ? tr('ai.search.foundFor', { count: rows.length, what: parts.join(', ') }) : tr('ai.search.found', { count: rows.length }) },
          list(rows.map((m) => ({ title: m.fullName, sub: [tEnum('stage', m.stage), m.branch, m.department, m.phone].filter(Boolean).join(' · '), href: `/dashboard/members?id=${m.id}` }))),
        ],
      }
    },
  },
  {
    name: 'getMembershipStats',
    agent: 'knowledge',
    kind: 'read',
    description: 'Total members, breakdown by stage, joined this month.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    allow: any,
    validate: () => ({}),
    run: (ctx) => {
      const ms = ctx.members
      return {
        agent: 'knowledge',
        blocks: [
          { type: 'text', text: tr('ai.stats.has', { church: ctx.settings.churchName, count: ms.length }) },
          {
            type: 'stats',
            items: [
              ...STAGES.map((s) => ({ label: tr(`enums.stagePlural.${s}`), value: String(ms.filter((m) => m.stage === s).length) })),
              { label: tr('ai.stats.joinedMonth'), value: String(ms.filter((m) => m.dateJoined.startsWith(monthKey())).length) },
              { label: tr('ai.stats.active'), value: String(ms.filter((m) => m.membershipStatus === 'Active').length) },
            ],
          },
        ],
      }
    },
  },
  {
    name: 'getNeedsAttention',
    agent: 'memberCare',
    kind: 'read',
    description: 'Members who may need care: inactive, incomplete records, unassigned new converts.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    allow: (r) => can.editMembers(r),
    validate: () => ({}),
    run: (ctx) => {
      const inactive = ctx.members.filter((m) => m.membershipStatus === 'Inactive')
      const incomplete = ctx.members.filter((m) => !m.phone && !m.email)
      const converts = ctx.members.filter((m) => m.stage === 'Convert' && !m.department)
      const follow = needingFollowUp(ctx.members)
      return {
        agent: 'memberCare',
        blocks: [
          { type: 'text', text: tr('ai.care.intro') },
          {
            type: 'stats',
            items: [
              { label: tr('ai.care.awaiting'), value: String(follow.length) },
              { label: tr('ai.care.inactive'), value: String(inactive.length) },
              { label: tr('ai.care.convertsNoDept'), value: String(converts.length) },
              { label: tr('ai.care.noContact'), value: String(incomplete.length) },
            ],
          },
          list(inactive.map((m) => ({ title: m.fullName, sub: tr('ai.care.inactiveSub', { contact: m.phone || m.email || tr('common.noContact') }), href: `/dashboard/members?id=${m.id}` })), 5),
          { type: 'notice', text: tr('ai.care.notice') },
        ],
      }
    },
  },
  {
    name: 'getFinanceSummary',
    agent: 'finance',
    kind: 'read',
    description: 'Income by fund and expenses for a period (this month, last month, last Sunday, or YYYY-MM).',
    schema: { type: 'object', properties: { period: { type: 'string' } }, additionalProperties: false },
    allow: (r) => can.viewGiving(r),
    validate: (raw) => ({ period: str(raw.period) || 'this month' }),
    run: (ctx, { period }) => {
      const gifts = allGifts(ctx)
      let label: string
      let match: (d: string) => boolean
      if (period === 'last sunday' || period === 'sunday') {
        const d = new Date()
        d.setDate(d.getDate() - ((d.getDay() + 7) % 7 || 7))
        const k = isoLocal(d)
        label = tr('ai.fin.lastSunday', { date: fmtDate(k) })
        match = (x) => x === k
      } else {
        const k = period === 'last month' ? monthKey(-1) : /^\d{4}-\d{2}$/.test(period) ? period : monthKey()
        label = monthName(k)
        match = (x) => x.startsWith(k)
      }
      const inc = gifts.filter((g) => match(g.date))
      const exp = ctx.expenses.filter((x) => match(x.date))
      if (!inc.length && !exp.length) return { agent: 'finance', blocks: [{ type: 'text', text: tr('ai.fin.none', { period: label }) }] }
      const total = inc.reduce((s, g) => s + g.amount, 0)
      const expTotal = exp.reduce((s, x) => s + x.amount, 0)
      const cur = ctx.settings.currency
      return {
        agent: 'finance',
        activity: tr('ai.fin.activity', { period: label }),
        blocks: [
          { type: 'text', text: tr('ai.fin.intro', { period: label }) },
          {
            type: 'stats',
            items: [
              { label: tr('ai.fin.income'), value: money(total, cur) },
              { label: tr('ai.fin.expenses'), value: money(expTotal, cur) },
              { label: tr('ai.fin.net'), value: money(total - expTotal, cur) },
              { label: tr('ai.fin.gifts'), value: String(inc.length) },
            ],
          },
          list(ctx.settings.funds.map((f) => ({ title: f, sub: money(inc.filter((g) => g.fund === f).reduce((s, g) => s + g.amount, 0), cur) }))),
          { type: 'actions', items: [{ label: tr('ai.fin.open'), href: '/dashboard/giving' }] },
        ],
      }
    },
  },
  {
    name: 'compareMonths',
    agent: 'finance',
    kind: 'read',
    description: 'Compare giving between two months (YYYY-MM).',
    schema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } }, required: ['a', 'b'], additionalProperties: false },
    allow: (r) => can.viewGiving(r),
    validate: (raw) => {
      const a = str(raw.a)
      const b = str(raw.b)
      return /^\d{4}-\d{2}$/.test(a) && /^\d{4}-\d{2}$/.test(b) ? { a, b } : tr('ai.fin.twoMonths')
    },
    run: (ctx, { a, b }) => {
      const g = allGifts(ctx)
      const sum = (k: string) => g.filter((x) => x.date.startsWith(k)).reduce((s, x) => s + x.amount, 0)
      const ta = sum(a)
      const tb = sum(b)
      const cur = ctx.settings.currency
      if (!ta && !tb) return { agent: 'finance', blocks: [{ type: 'text', text: tr('ai.notEnough') }] }
      const diff = ta - tb
      const pct = tb ? Math.round((diff / tb) * 100) : null
      return {
        agent: 'finance',
        blocks: [
          { type: 'text', text: tr('ai.fin.vs', { a: monthName(a), b: monthName(b) }) },
          { type: 'stats', items: [{ label: monthName(a), value: money(ta, cur) }, { label: monthName(b), value: money(tb, cur) }, { label: tr('ai.fin.change'), value: `${diff >= 0 ? '+' : ''}${money(diff, cur)}${pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct}%)` : ''}` }] },
        ],
      }
    },
  },
  {
    name: 'getExpenseSummary',
    agent: 'finance',
    kind: 'read',
    description: 'Largest expense categories.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    allow: (r) => can.viewGiving(r),
    validate: () => ({}),
    run: (ctx) => {
      if (!ctx.expenses.length) return { agent: 'finance', blocks: [{ type: 'text', text: tr('ai.fin.noExpenses') }] }
      const by: Record<string, number> = {}
      ctx.expenses.forEach((x) => (by[x.category] = (by[x.category] ?? 0) + x.amount))
      const rows = Object.entries(by).sort((a, b) => b[1] - a[1])
      return { agent: 'finance', blocks: [{ type: 'text', text: tr('ai.fin.biggest') }, list(rows.map(([k, v]) => ({ title: tEnum('expense', k), sub: money(v, ctx.settings.currency) })))] }
    },
  },
  {
    name: 'getEvents',
    agent: 'events',
    kind: 'read',
    description: 'Upcoming events (this week or next 30 days).',
    schema: { type: 'object', properties: { days: { type: 'number' } }, additionalProperties: false },
    allow: any,
    validate: (raw) => ({ days: Math.min(90, Math.max(1, Number(raw.days) || 7)) }),
    run: (ctx, { days }) => {
      const end = new Date()
      end.setDate(end.getDate() + days)
      const rows = ctx.events.filter((e) => e.date >= today() && e.date <= isoLocal(end)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
      if (!rows.length) return { agent: 'events', blocks: [{ type: 'text', text: tr('ai.events.none', { days }) }] }
      return {
        agent: 'events',
        blocks: [
          { type: 'text', text: tr('ai.events.intro', { days }) },
          list(rows.map((e) => ({ title: e.title, sub: `${fmtDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(e.start)} · ${tEnum('mode', e.mode)}${e.googleMeet ? ' · Google Meet' : ''} · ${audienceLabel(e.audience)}`, href: '/dashboard/events' }))),
        ],
      }
    },
  },
  {
    name: 'createEventDraft',
    agent: 'events',
    kind: 'write',
    description: 'Prepare a new event (title, date YYYY-MM-DD, start/end HH:mm, audience). Created only after confirmation.',
    schema: {
      type: 'object',
      properties: { title: { type: 'string' }, date: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, mode: { type: 'string', enum: ['In person', 'Online', 'Hybrid'] }, audienceType: { type: 'string' }, audienceValue: { type: 'string' } },
      required: ['title', 'date', 'start'],
      additionalProperties: false,
    },
    allow: (r) => can.editMembers(r),
    validate: (raw) => {
      const title = str(raw.title).slice(0, 80)
      const date = str(raw.date)
      const start = str(raw.start)
      if (!title) return tr('ai.events.askTitle')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return tr('ai.events.askDate')
      if (!/^\d{2}:\d{2}$/.test(start)) return tr('ai.events.askTime')
      const [h, m] = start.split(':').map(Number)
      const end = /^\d{2}:\d{2}$/.test(str(raw.end)) ? str(raw.end) : `${String(Math.min(23, h + 2)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const mode = ['In person', 'Online', 'Hybrid'].includes(str(raw.mode)) ? str(raw.mode) : 'In person'
      const t = str(raw.audienceType)
      const audience: Audience = ['stage', 'department', 'branch'].includes(t) && str(raw.audienceValue) ? { type: t as Audience['type'], value: str(raw.audienceValue) } : { type: 'all', value: '' }
      return { title, date, start, end, mode, audience }
    },
    run: (ctx, input) => {
      const invited = audienceMembers(ctx.members, input.audience).length
      const pending: PendingAction = {
        id: uid(),
        agent: 'events',
        kind: 'write',
        summary: tr('ai.events.summary', { title: input.title, date: fmtDate(input.date) }),
        entity: input.title,
        run: () => {
          ctx.actions.saveEvent({ title: input.title, date: input.date, start: input.start, end: input.end, mode: input.mode, location: '', googleMeet: input.mode !== 'In person', audience: input.audience, invited, attendance: null, notes: tr('ai.events.notes') })
          return {
            agent: 'events',
            activity: tr('ai.events.activityCreated', { title: input.title }),
            entity: input.title,
            blocks: [
              { type: 'text', text: tr('ai.events.created', { title: input.title }) },
              { type: 'actions', items: [{ label: tr('ai.events.open'), href: '/dashboard/events' }, { label: tr('ai.events.sendReminder'), href: '/dashboard/messaging', state: { draft: tpl('reminder', reminderVars(input)), template: 'reminder', vars: reminderVars(input) } }] },
            ],
          }
        },
      }
      return {
        agent: 'events',
        pending,
        blocks: [
          { type: 'text', text: tr('ai.events.prepared') },
          {
            type: 'confirm',
            id: pending.id,
            title: input.title,
            rows: [
              { label: tr('ai.events.date'), value: fmtDate(input.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) },
              { label: tr('ai.events.time'), value: `${fmtTime(input.start)} – ${fmtTime(input.end)}` },
              { label: tr('ai.events.format'), value: tEnum('mode', input.mode) },
              { label: tr('ai.events.audience'), value: tr('ai.events.people', { audience: audienceLabel(input.audience), count: invited }) },
            ],
            confirmLabel: tr('ai.events.create'),
          },
        ],
      }
    },
  },
  {
    name: 'draftMessage',
    agent: 'comms',
    kind: 'draft',
    description: 'Write a message draft (welcome, reminder, birthday, thank-you) without sending.',
    schema: { type: 'object', properties: { purpose: { type: 'string' }, eventTitle: { type: 'string' } }, additionalProperties: false },
    allow: (r) => can.editMembers(r),
    validate: (raw) => ({ purpose: str(raw.purpose) || 'reminder', eventTitle: str(raw.eventTitle) }),
    run: (ctx, { purpose }) => {
      const next = ctx.events.filter((e) => e.date >= today()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0]
      const key = ['welcome', 'birthday', 'thanks'].includes(purpose) ? purpose : next ? 'reminder' : 'sunday'
      const vars = key === 'reminder' && next ? reminderVars(next) : undefined
      const text = tpl(key, vars)
      const p = ['welcome', 'birthday', 'thanks'].includes(purpose) ? purpose : 'reminder'
      return { agent: 'comms', activity: tr('ai.draft.activity', { purpose: tr(`ai.draft.purpose.${p}`) }), blocks: [{ type: 'text', text: tr('ai.draft.intro') }, { type: 'draft', text, href: '/dashboard/messaging', state: { draft: text, template: key, vars } }] }
    },
  },
  {
    name: 'prepareMessage',
    agent: 'comms',
    kind: 'bulk',
    description: 'Prepare a message to an audience. Sends only after the user confirms recipients, channel and cost.',
    schema: {
      type: 'object',
      properties: { body: { type: 'string' }, channel: { type: 'string', enum: ['WhatsApp', 'SMS', 'Email'] }, audienceType: { type: 'string', enum: ['all', 'stage', 'department', 'branch'] }, audienceValue: { type: 'string' } },
      required: ['body'],
      additionalProperties: false,
    },
    allow: (r) => can.editMembers(r),
    validate: (raw) => {
      const body = str(raw.body).slice(0, 1000)
      const template = str(raw.template)
      const vars = (raw.vars && typeof raw.vars === 'object' ? raw.vars : undefined) as Record<string, string> | undefined
      if (!body) return tr('ai.send.askBody')
      const channel = (['WhatsApp', 'SMS', 'Email'].includes(str(raw.channel)) ? str(raw.channel) : 'WhatsApp') as Channel
      const t = str(raw.audienceType)
      const audience: Audience = ['stage', 'department', 'branch'].includes(t) && str(raw.audienceValue) ? { type: t as Audience['type'], value: str(raw.audienceValue) } : { type: 'all', value: '' }
      return { body, channel, audience, template, vars }
    },
    run: (ctx, input) => {
      const everyone = audienceMembers(ctx.members, input.audience)
      const reachable = everyone.filter((m) => (input.channel === 'Email' ? m.email : input.channel === 'WhatsApp' ? m.whatsapp : m.phone))
      if (!reachable.length) return { agent: 'comms', blocks: [{ type: 'text', text: tr('ai.send.noContact', { audience: audienceLabel(input.audience), channel: input.channel }) }] }
      const sample = reachable[0]
      // Built-in templates go out in each member's own language; custom text is sent as written.
      const bodyFor = (lang: Lang) => (input.template ? tpl(input.template, input.vars, lang) : input.body)
      const preview = bodyFor(sample.language).replace(/\{first_name\}/g, firstName(sample)).replace(/\{church\}/g, ctx.settings.churchName)
      const byLang = reachable.reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.language]: (acc[m.language] ?? 0) + 1 }), {})
      const langSummary = Object.entries(byLang)
        .sort((a, b) => b[1] - a[1])
        .map(([l, n]) => `${new Intl.DisplayNames([getLocale()], { type: 'language' }).of(l) ?? l} ${n}`)
        .join(' · ')
      const est = reachable.length * (ctx.messageCost[input.channel as Channel] ?? 0)
      const pending: PendingAction = {
        id: uid(),
        agent: 'comms',
        kind: 'bulk',
        summary: tr('ai.send.summary', { channel: input.channel, audience: audienceLabel(input.audience), count: reachable.length }),
        entity: audienceLabel(input.audience),
        run: () => {
          ctx.actions.addCampaign({ channel: input.channel, audience: input.audience, recipients: reachable.length, subject: '', body: bodyFor(getLangOf()), scheduledFor: null, status: 'Queued', languages: byLang, template: input.template || undefined, vars: input.vars })
          Object.keys(byLang).forEach((l) => {
            const ids = reachable.filter((m) => m.language === l).map((m) => m.id)
            ctx.actions.logCommunicationMany(ids, { channel: input.channel, summary: bodyFor(l as Lang).slice(0, 90), date: today(), by: tr('ai.send.by') })
          })
          return {
            agent: 'comms',
            activity: tr('ai.send.activity', { channel: input.channel, count: reachable.length, audience: audienceLabel(input.audience) }),
            entity: audienceLabel(input.audience),
            blocks: [
              { type: 'text', text: tr('ai.send.queued', { count: reachable.length }) },
              { type: 'notice', text: tr('ai.send.delivery') },
            ],
          }
        },
      }
      return {
        agent: 'comms',
        pending,
        blocks: [
          { type: 'text', text: tr('ai.send.review') },
          {
            type: 'confirm',
            id: pending.id,
            title: tr('ai.send.title', { channel: input.channel }),
            rows: [
              { label: tr('ai.events.audience'), value: audienceLabel(input.audience) },
              { label: tr('ai.send.recipients'), value: reachable.length < everyone.length ? tr('ai.send.recipientsOf', { count: reachable.length, total: everyone.length, channel: input.channel }) : String(reachable.length) },
              ...(input.template ? [{ label: tr('ai.send.languages'), value: langSummary }] : []),
              { label: tr('ai.send.channel'), value: input.channel },
              { label: tr('ai.send.cost'), value: est ? money(est, 'USD', est < 1 ? 2 : 0) : tr('ai.send.free') },
              { label: tr('ai.send.preview', { name: firstName(sample) }), value: preview },
            ],
            confirmLabel: tr('ai.send.confirm'),
          },
        ],
      }
    },
  },
  {
    name: 'getAttendanceSummary',
    agent: 'attendance',
    kind: 'read',
    description: 'Attendance recorded on events.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    allow: any,
    validate: () => ({}),
    run: (ctx) => {
      const rows = ctx.events.filter((e) => e.attendance !== null).sort((a, b) => b.date.localeCompare(a.date))
      if (!rows.length) return { agent: 'attendance', blocks: [{ type: 'text', text: tr('ai.att.none') }] }
      const avg = Math.round(rows.reduce((s, e) => s + (e.attendance ?? 0), 0) / rows.length)
      return {
        agent: 'attendance',
        blocks: [
          { type: 'text', text: tr('ai.att.latest', { title: rows[0].title, date: fmtDate(rows[0].date), attended: rows[0].attendance ?? 0, count: rows.length, avg }) },
          list(rows.map((e) => ({ title: e.title, sub: tr('ai.att.row', { date: fmtDate(e.date), attended: e.attendance ?? 0, invited: e.invited }) }))),
          { type: 'notice', text: tr('ai.att.notice') },
        ],
      }
    },
  },
  {
    name: 'getDepartmentSummary',
    agent: 'departments',
    kind: 'read',
    description: 'Workers and members per department.',
    schema: { type: 'object', properties: { department: { type: 'string' } }, additionalProperties: false },
    allow: any,
    validate: (raw) => ({ department: str(raw.department) }),
    run: (ctx, { department }) => {
      if (department) {
        const ms = ctx.members.filter((m) => m.department.toLowerCase() === department.toLowerCase())
        if (!ms.length) return { agent: 'departments', blocks: [{ type: 'text', text: tr('ai.dept.none', { name: department }) }] }
        return {
          agent: 'departments',
          blocks: [
            { type: 'text', text: tr('ai.dept.one', { name: department, count: ms.length, workers: ms.filter((m) => m.stage === 'Worker').length }) },
            list(ms.map((m) => ({ title: m.fullName, sub: `${tEnum('stage', m.stage)} · ${m.phone || m.email}`, href: `/dashboard/members?id=${m.id}` }))),
          ],
        }
      }
      const rows = ctx.settings.departments.map((d) => ({ d, n: ctx.members.filter((m) => m.department === d).length, w: ctx.members.filter((m) => m.department === d && m.stage === 'Worker').length }))
      return {
        agent: 'departments',
        blocks: [
          { type: 'text', text: tr('ai.dept.all', { workers: ctx.members.filter((m) => m.stage === 'Worker' && m.membershipStatus === 'Active').length, depts: rows.filter((r) => r.n).length }) },
          list(rows.map((r) => ({ title: r.d, sub: tr('ai.dept.row', { count: r.n, workers: r.w }) })), 12),
        ],
      }
    },
  },
  {
    name: 'getBranchSummary',
    agent: 'branches',
    kind: 'read',
    description: 'Members, newcomers and (for finance roles) giving per branch.',
    schema: { type: 'object', properties: { branch: { type: 'string' } }, additionalProperties: false },
    allow: any,
    validate: (raw) => ({ branch: str(raw.branch) }),
    run: (ctx, { branch }) => {
      const showGiving = can.viewGiving(ctx.user!.role)
      const gifts = allGifts(ctx)
      const names = branch ? ctx.settings.branches.filter((b) => b.toLowerCase() === branch.toLowerCase()) : ctx.settings.branches
      if (!names.length) return { agent: 'branches', blocks: [{ type: 'text', text: tr('ai.branch.notFound', { name: branch }) }] }
      return {
        agent: 'branches',
        blocks: [
          { type: 'text', text: branch ? tr('ai.branch.glance', { name: names[0] }) : tr('ai.branch.compared') },
          list(
            names.map((b) => {
              const ms = ctx.members.filter((m) => m.branch === b)
              const g = gifts.filter((x) => x.branch === b && x.date.startsWith(monthKey())).reduce((s, x) => s + x.amount, 0)
              return { title: b, sub: tr('ai.branch.row', { count: ms.length, newcomers: ms.filter((m) => m.stage === 'Newcomer').length, joined: ms.filter((m) => m.dateJoined.startsWith(monthKey())).length }) + (showGiving ? tr('ai.branch.rowGiving', { amount: money(g, ctx.settings.currency) }) : '') }
            }),
            12,
          ),
          { type: 'notice', text: tr('ai.branch.notice') },
        ],
      }
    },
  },
  {
    name: 'generateReport',
    agent: 'reporting',
    kind: 'read',
    description: 'Monthly church report (YYYY-MM): membership, newcomers, events, attendance, communication, and finance if permitted.',
    schema: { type: 'object', properties: { month: { type: 'string' } }, additionalProperties: false },
    allow: any,
    validate: (raw) => ({ month: /^\d{4}-\d{2}$/.test(str(raw.month)) ? str(raw.month) : monthKey() }),
    run: (ctx, { month }) => {
      const joined = ctx.members.filter((m) => m.dateJoined.startsWith(month))
      const evs = ctx.events.filter((e) => e.date.startsWith(month))
      const att = evs.filter((e) => e.attendance !== null)
      const msgs = ctx.campaigns.filter((c) => c.createdAt.startsWith(month))
      const stats = [
        { label: tr('ai.report.total'), value: String(ctx.members.length) },
        { label: tr('ai.report.joined'), value: String(joined.length) },
        { label: tr('ai.report.newcomers'), value: String(joined.filter((m) => m.stage === 'Newcomer').length) },
        { label: tr('ai.report.events'), value: String(evs.length) },
        { label: tr('ai.report.attendance'), value: att.length ? String(att.reduce((s, e) => s + (e.attendance ?? 0), 0)) : '—' },
        { label: tr('ai.report.messages'), value: String(msgs.length) },
      ]
      const rows: (string | number)[][] = [[tr('ai.report.metric'), tr('ai.report.value')], ...stats.map((s) => [s.label, s.value])]
      if (can.viewGiving(ctx.user!.role)) {
        const inc = allGifts(ctx).filter((g) => g.date.startsWith(month)).reduce((s, g) => s + g.amount, 0)
        const exp = ctx.expenses.filter((x) => x.date.startsWith(month)).reduce((s, x) => s + x.amount, 0)
        stats.push({ label: tr('ai.fin.income'), value: money(inc, ctx.settings.currency) }, { label: tr('ai.fin.expenses'), value: money(exp, ctx.settings.currency) })
        rows.push([tr('ai.fin.income'), inc], [tr('ai.fin.expenses'), exp])
      }
      return {
        agent: 'reporting',
        activity: tr('ai.report.activity', { month: monthName(month) }),
        entity: monthName(month),
        blocks: [
          { type: 'text', text: tr('ai.report.title', { church: ctx.settings.churchName, month: monthName(month) }) },
          { type: 'stats', items: stats },
          { type: 'download', label: tr('ai.report.download'), filename: `ziondesk-report-${month}.csv`, rows },
          { type: 'actions', items: [{ label: tr('ai.report.open'), href: '/dashboard/reports' }] },
        ],
      }
    },
  },
  {
    name: 'startDesign',
    agent: 'designer',
    kind: 'draft',
    description: 'Start a flyer in the Design Studio with a title and date.',
    schema: { type: 'object', properties: { title: { type: 'string' }, when: { type: 'string' } }, additionalProperties: false },
    allow: (r) => can.editMembers(r),
    validate: (raw) => ({ title: str(raw.title).slice(0, 28) || tr('ai.design.defaultTitle'), when: str(raw.when).slice(0, 28) }),
    run: (ctx, { title, when }) => {
      const next = ctx.events.filter((e) => e.date >= today() && e.title.toLowerCase().includes(title.toLowerCase().split(' ')[0])).sort((a, b) => a.date.localeCompare(b.date))[0]
      const w = when || (next ? `${fmtDate(next.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(next.start)}` : '')
      return {
        agent: 'designer',
        activity: tr('ai.design.activity', { title }),
        blocks: [
          { type: 'text', text: tr('ai.design.intro', { title, when: w ? ` (${w})` : '' }) },
          { type: 'actions', items: [{ label: tr('ai.design.open'), href: `/dashboard/design?title=${encodeURIComponent(title)}&when=${encodeURIComponent(w)}` }, { label: tr('ai.design.team'), href: '/dashboard/design?tab=team' }] },
        ],
      }
    },
  },
]

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n)

/** Single entry point for every tool call (local router and language models alike). */
export function runTool(name: string, raw: Record<string, unknown>, ctx: ToolContext): ToolResult & { denied?: boolean } {
  const def = toolByName(name)
  if (!def) return { agent: 'admin', denied: true, blocks: [{ type: 'text', text: tr('ai.deny.cant') }] }
  if (!ctx.user) return { agent: def.agent, denied: true, blocks: [{ type: 'text', text: tr('ai.deny.signIn') }] } // 1. authenticate
  if (!ctx.churchId) return { agent: def.agent, denied: true, blocks: [{ type: 'text', text: tr('ai.deny.noChurch') }] } // 2. tenant
  if (!def.allow(ctx.user.role)) return { agent: def.agent, denied: true, blocks: [{ type: 'text', text: tr('ai.deny.role') }] } // 3–4. permission
  const input = def.validate(raw ?? {}) // 5. validate
  if (typeof input === 'string') return { agent: def.agent, blocks: [{ type: 'text', text: input }] }
  return def.run(ctx, input) // 6–7. controlled op, structured result (8. audit happens in the orchestrator)
}
