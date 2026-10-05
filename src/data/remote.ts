/**
 * Supabase data access for the dashboard. Row ↔ app-shape mapping lives here so the stores
 * (store.tsx, workspace.tsx, ai/store.tsx) keep the same API in preview and live mode.
 * Every query is filtered by church and protected again by Row Level Security.
 */
import type { Lang } from '../i18n'
import type { Communication, Gift, Member, MemberInput, Role } from '../dashboard/types'
import type { AnonGift, Campaign, ChurchEvent, DesignRequest, Expense, SavedDesign, Settings, ShareLink, TeamMember, TemplateOverrides, TransferClaim } from '../dashboard/workspace'
import { supabase } from '../lib/supabase'

const sb = () => {
  if (!supabase) throw new Error('Not connected')
  return supabase
}
const check = <T,>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message)
  return r.data
}
/** Fire-and-forget writes surface errors in the console (and a toast where the UI handles it). */
export const bg = (p: PromiseLike<unknown>, what: string) => {
  Promise.resolve(p).then(
    (r) => {
      const e = (r as { error?: { message: string } } | undefined)?.error
      if (e) console.error(`[sync] ${what}:`, e.message)
    },
    (e) => console.error(`[sync] ${what}:`, e),
  )
}

/* ───────── members ───────── */

type MemberRow = {
  id: string
  full_name: string
  phone: string
  whatsapp: string
  email: string
  gender: string
  dob: string | null
  address: string
  branch: string
  department: string
  membership_status: string
  date_joined: string
  stage: string
  notes: string
  language: string
}

export const memberToRow = (churchId: string, m: Partial<MemberInput> & { id?: string }) => {
  const r: Record<string, unknown> = { church_id: churchId }
  if (m.id) r.id = m.id
  if (m.fullName !== undefined) r.full_name = m.fullName
  if (m.phone !== undefined) r.phone = m.phone
  if (m.whatsapp !== undefined) r.whatsapp = m.whatsapp
  if (m.email !== undefined) r.email = m.email
  if (m.gender !== undefined) r.gender = m.gender
  if (m.dob !== undefined) r.dob = m.dob || null
  if (m.address !== undefined) r.address = m.address
  if (m.branch !== undefined) r.branch = m.branch
  if (m.department !== undefined) r.department = m.department
  if (m.membershipStatus !== undefined) r.membership_status = m.membershipStatus
  if (m.dateJoined !== undefined) r.date_joined = m.dateJoined
  if (m.stage !== undefined) r.stage = m.stage
  if (m.notes !== undefined) r.notes = m.notes
  if (m.language !== undefined) r.language = m.language
  return r
}

export async function loadMembers(churchId: string): Promise<Member[]> {
  const [members, comms, gifts] = await Promise.all([
    sb().from('members').select('*').eq('church_id', churchId).order('date_joined', { ascending: false }).limit(20000),
    sb().from('communications').select('id, member_id, date, channel, summary, by_name').eq('church_id', churchId).order('date', { ascending: false }).limit(50000),
    sb().from('gifts').select('id, member_id, date, amount, fund, method').eq('church_id', churchId).not('member_id', 'is', null).limit(50000), // empty for roles without giving access
  ])
  const byMember = <T extends { member_id: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>()
    rows.forEach((r) => r.member_id && m.set(r.member_id, [...(m.get(r.member_id) ?? []), r]))
    return m
  }
  const c = byMember(check(comms) ?? [])
  const g = byMember(gifts.error ? [] : gifts.data ?? [])
  return (check(members) as MemberRow[]).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    whatsapp: r.whatsapp,
    email: r.email,
    gender: r.gender as Member['gender'],
    dob: r.dob ?? '',
    address: r.address,
    branch: r.branch,
    department: r.department,
    membershipStatus: r.membership_status as Member['membershipStatus'],
    dateJoined: r.date_joined,
    stage: r.stage as Member['stage'],
    notes: r.notes,
    language: r.language as Lang,
    communications: (c.get(r.id) ?? []).map((x) => ({ id: x.id, date: x.date, channel: x.channel as Communication['channel'], summary: x.summary, by: x.by_name })),
    giving: (g.get(r.id) ?? []).map((x) => ({ id: x.id, date: x.date, amount: Number(x.amount), fund: x.fund, method: x.method })),
  }))
}

export const members = {
  insert: (churchId: string, m: Member, source = 'manual') => bg(sb().from('members').insert({ ...memberToRow(churchId, m), source }), 'add member'),
  insertMany: async (churchId: string, list: Member[]) => {
    for (let i = 0; i < list.length; i += 500) bg(sb().from('members').insert(list.slice(i, i + 500).map((m) => ({ ...memberToRow(churchId, m), source: 'import' }))), 'import members')
  },
  update: (churchId: string, id: string, patch: Partial<MemberInput>) => bg(sb().from('members').update(memberToRow(churchId, patch)).eq('id', id).eq('church_id', churchId), 'update member'),
  remove: (churchId: string, ids: string[]) => bg(sb().from('members').delete().eq('church_id', churchId).in('id', ids), 'delete members'),
  logComm: (churchId: string, memberId: string, c: Communication) =>
    bg(sb().from('communications').insert({ id: c.id, church_id: churchId, member_id: memberId, date: c.date, channel: c.channel, summary: c.summary, by_name: c.by }), 'log communication'),
  addGift: (churchId: string, memberId: string, g: Gift, donor: string) =>
    bg(sb().from('gifts').insert({ id: g.id, church_id: churchId, member_id: memberId, donor, date: g.date, amount: g.amount, fund: g.fund, method: g.method }), 'record gift'),
}

/* ───────── workspace ───────── */

type ChurchRow = {
  id: string
  name: string
  slug: string
  location: string
  phone: string
  email: string
  denomination: string
  currency: string
  plan: Settings['plan']
  branches: string[]
  departments: string[]
  funds: string[]
  payout: Partial<Settings['payout']> | null
  ai_settings: Record<string, unknown>
  trial_ends_at: string | null
  logo_url: string | null
  flw_subaccount_id?: string | null
  payout_account?: Settings['payoutAccount']
  plan_status?: Settings['planStatus']
  plan_renews_at?: string | null
}

export const settingsFromRow = (c: ChurchRow): Settings => ({
  churchName: c.name,
  location: c.location,
  phone: c.phone,
  email: c.email,
  denomination: c.denomination,
  currency: c.currency,
  branches: c.branches,
  departments: c.departments,
  funds: c.funds,
  plan: c.plan,
  payout: { method: 'none', bankName: '', accountName: '', accountNumber: '', routing: '', instructions: '', ...(c.payout ?? {}) },
  givingSlug: c.slug,
  payoutAccount: c.payout_account && Object.keys(c.payout_account).length ? c.payout_account : null,
  onlineGiving: Boolean(c.flw_subaccount_id),
  planStatus: c.plan_status,
  planRenewsAt: c.plan_renews_at ?? null,
  logoUrl: c.logo_url,
})

const settingsToRow = (p: Partial<Settings>) => {
  const r: Record<string, unknown> = {}
  if (p.churchName !== undefined) r.name = p.churchName
  // plan / billing / payout-account fields are changed by the server only.
  for (const k of ['location', 'phone', 'email', 'denomination', 'currency', 'branches', 'departments', 'funds', 'payout'] as const) if (p[k] !== undefined) r[k] = p[k]
  if (p.givingSlug !== undefined) r.slug = p.givingSlug
  if (p.logoUrl !== undefined) r.logo_url = p.logoUrl
  return r
}

export interface WorkspaceData {
  settings: Settings
  trialEndsAt: string | null
  events: ChurchEvent[]
  campaigns: Campaign[]
  expenses: Expense[]
  anonGifts: AnonGift[]
  designs: SavedDesign[]
  requests: DesignRequest[]
  team: TeamMember[]
  links: ShareLink[]
  claims: TransferClaim[]
  templates: TemplateOverrides
  aiSettings: Record<string, unknown>
}

const ok = <T,>(r: { data: T | null; error: unknown }, fallback: T): T => (r.error ? fallback : r.data ?? fallback)

export async function loadWorkspace(churchId: string): Promise<WorkspaceData> {
  const s = sb()
  const [church, ev, camp, exp, gifts, des, reqs, msgs, cu, inv, links, claims, tpl] = await Promise.all([
    s.from('churches').select('*').eq('id', churchId).single(),
    s.from('events').select('*').eq('church_id', churchId).order('date'),
    s.from('campaigns').select('*').eq('church_id', churchId).order('created_at', { ascending: false }).limit(500),
    s.from('expenses').select('*').eq('church_id', churchId).order('date', { ascending: false }),
    s.from('gifts').select('*').eq('church_id', churchId).is('member_id', null).order('date', { ascending: false }),
    s.from('designs').select('*').eq('church_id', churchId).order('created_at', { ascending: false }),
    s.from('design_requests').select('*').eq('church_id', churchId).order('created_at', { ascending: false }),
    s.from('design_request_messages').select('*').eq('church_id', churchId).order('at'),
    s.from('church_users').select('user_id, role, profiles(full_name, email)').eq('church_id', churchId),
    s.from('team_invites').select('*').eq('church_id', churchId).eq('status', 'Invited'),
    s.from('share_links').select('*').eq('church_id', churchId).order('created_at'),
    s.from('transfer_claims').select('*').eq('church_id', churchId).order('created_at', { ascending: false }),
    s.from('message_templates').select('key, lang, text').eq('church_id', churchId),
  ])
  const c = check(church) as ChurchRow
  const templates: TemplateOverrides = {}
  ok(tpl, [] as { key: string; lang: string; text: string }[]).forEach((r) => ((templates[r.key] ??= {})[r.lang as Lang] = r.text))
  const reqMsgs = ok(msgs, [] as { id: string; request_id: string; sender: 'you' | 'system' | 'designer'; text: string; at: string }[])
  return {
    settings: settingsFromRow(c),
    trialEndsAt: c.trial_ends_at,
    aiSettings: c.ai_settings ?? {},
    events: ok(ev, [] as Record<string, never>[]).map((e: Record<string, unknown>) => ({
      id: e.id as string,
      title: e.title as string,
      date: e.date as string,
      start: String(e.start_time).slice(0, 5),
      end: String(e.end_time).slice(0, 5),
      mode: e.mode as ChurchEvent['mode'],
      location: e.location as string,
      googleMeet: e.google_meet as boolean,
      meetLink: (e.meet_link as string | null) ?? '',
      audience: e.audience as ChurchEvent['audience'],
      invited: e.invited as number,
      attendance: (e.attendance as number | null) ?? null,
      notes: e.notes as string,
    })),
    campaigns: ok(camp, [] as Record<string, never>[]).map((x: Record<string, unknown>) => ({
      id: x.id as string,
      channel: x.channel as Campaign['channel'],
      audience: x.audience as Campaign['audience'],
      recipients: x.recipients as number,
      subject: x.subject as string,
      body: x.body as string,
      createdAt: x.created_at as string,
      scheduledFor: (x.scheduled_for as string | null) ?? null,
      status: (x.status === 'Scheduled' ? 'Scheduled' : 'Queued') as Campaign['status'],
      languages: (x.languages as Record<string, number> | null) ?? undefined,
      template: (x.template as string | null) ?? undefined,
    })),
    expenses: ok(exp, [] as Record<string, never>[]).map((x: Record<string, unknown>) => ({ id: x.id as string, date: x.date as string, category: x.category as string, amount: Number(x.amount), note: x.note as string })),
    anonGifts: ok(gifts, [] as Record<string, never>[]).map((x: Record<string, unknown>) => ({ id: x.id as string, date: x.date as string, amount: Number(x.amount), fund: x.fund as string, method: x.method as string, donor: x.donor as string })),
    designs: ok(des, [] as Record<string, never>[]).map((x: Record<string, unknown>) => ({ id: x.id as string, template: x.template as string, title: x.title as string, when: x.when_text as string, createdAt: x.created_at as string, svg: (x.svg as string | null) ?? undefined })),
    requests: ok(reqs, [] as Record<string, never>[]).map((x: Record<string, unknown>) => ({
      id: x.id as string,
      title: x.title as string,
      brief: x.brief as Record<string, string>,
      formats: x.formats as string[],
      inspiration: x.inspiration as DesignRequest['inspiration'],
      status: x.status as DesignRequest['status'],
      createdAt: x.created_at as string,
      dueAt: x.due_at as string,
      deliverables: (x.deliverables as { name: string; url: string }[] | undefined) ?? [],
      messages: reqMsgs.filter((m) => m.request_id === x.id).map((m) => ({ id: m.id, from: m.sender, text: m.text, at: m.at })),
    })),
    team: [
      ...(ok(cu, []) as unknown as { user_id: string; role: Role; profiles: { full_name: string; email: string } | null }[]).map((x) => {
        const p = x.profiles
        return { id: x.user_id, name: p?.full_name || p?.email || '—', email: p?.email ?? '', role: x.role, status: 'Active' as const }
      }),
      ...ok(inv, [] as { id: string; name: string; email: string; role: Role }[]).map((x) => ({ id: `invite:${x.id}`, name: x.name, email: x.email, role: x.role, status: 'Invited' as const })),
    ],
    links: ok(links, [] as Record<string, never>[]).filter((x: Record<string, unknown>) => x.type !== 'checkin').map((x: Record<string, unknown>) => ({ id: x.id as string, type: x.type as ShareLink['type'], label: x.label as string, branch: x.branch as string, fund: x.fund as string, createdAt: x.created_at as string })),
    claims: ok(claims, [] as Record<string, never>[]).map((x: Record<string, unknown>) => ({
      id: x.id as string,
      date: x.date as string,
      name: x.name as string,
      email: x.email as string,
      phone: x.phone as string,
      amount: Number(x.amount),
      fund: x.fund as string,
      reference: x.reference as string,
      language: x.language as Lang,
      status: x.status as TransferClaim['status'],
      createdAt: x.created_at as string,
    })),
    templates,
  }
}

const eventToRow = (churchId: string, e: ChurchEvent) => ({
  id: e.id,
  church_id: churchId,
  title: e.title,
  date: e.date,
  start_time: e.start,
  end_time: e.end,
  mode: e.mode,
  location: e.location,
  google_meet: e.googleMeet,
  meet_link: e.meetLink?.trim() || null,
  audience: e.audience,
  invited: e.invited,
  attendance: e.attendance,
  notes: e.notes,
})

export const ws = {
  updateSettings: (churchId: string, patch: Partial<Settings>) => bg(sb().from('churches').update(settingsToRow(patch)).eq('id', churchId), 'save settings'),
  updateAiSettings: (churchId: string, ai: unknown) => bg(sb().from('churches').update({ ai_settings: ai }).eq('id', churchId), 'save AI settings'),
  /** Saves the event; for online events with Google Meet and no link, the server creates a Meet link. */
  saveEvent: async (churchId: string, e: ChurchEvent): Promise<string | null> => {
    const { error } = await sb().from('events').upsert(eventToRow(churchId, e))
    if (error) {
      console.error('[sync] save event:', error.message)
      return null
    }
    if (!e.googleMeet || e.meetLink) return null
    const { api } = await import('../lib/api')
    return api<{ link: string | null }>(`/events/${e.id}/meet`, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      .then((r) => r.link)
      .catch((error: unknown) => {
        window.dispatchEvent(new CustomEvent('ziondesk:meet-error', { detail: error instanceof Error ? error.message : 'Google Meet could not be created.' }))
        return null
      })
  },
  removeEvent: (churchId: string, id: string) => bg(sb().from('events').delete().eq('id', id).eq('church_id', churchId), 'delete event'),
  /** Saves the campaign, then asks the server to send it (each member in their own language). */
  addCampaign: async (churchId: string, c: Campaign & { vars?: Record<string, string> }) => {
    const { error } = await sb()
      .from('campaigns')
      .insert({
        id: c.id,
        church_id: churchId,
        channel: c.channel,
        audience: c.audience,
        recipients: c.recipients,
        subject: c.subject,
        body: c.body,
        template: c.template ?? null,
        vars: c.vars ?? null,
        languages: c.languages ?? null,
        scheduled_for: c.scheduledFor,
        status: c.scheduledFor ? 'Scheduled' : 'Queued',
      })
    if (error) throw new Error(error.message)
    if (!c.scheduledFor) {
      const { api } = await import('../lib/api')
      await api(`/campaigns/${c.id}/send`, {})
    }
  },
  addExpense: (churchId: string, x: Expense) => bg(sb().from('expenses').insert({ ...x, church_id: churchId }), 'add expense'),
  removeExpense: (churchId: string, id: string) => bg(sb().from('expenses').delete().eq('id', id).eq('church_id', churchId), 'delete expense'),
  addAnonGift: (churchId: string, g: AnonGift) => bg(sb().from('gifts').insert({ id: g.id, church_id: churchId, member_id: null, donor: g.donor, date: g.date, amount: g.amount, fund: g.fund, method: g.method }), 'record gift'),
  addDesign: (churchId: string, d: SavedDesign) => bg(sb().from('designs').insert({ id: d.id, church_id: churchId, template: d.template, title: d.title, when_text: d.when, ...(d.svg ? { svg: d.svg } : {}) }), 'save design'),
  removeDesign: (churchId: string, id: string) => bg(sb().from('designs').delete().eq('id', id).eq('church_id', churchId), 'delete design'),
  addRequest: (churchId: string, r: DesignRequest) => {
    bg(sb().from('design_requests').insert({ id: r.id, church_id: churchId, title: r.title, brief: r.brief, formats: r.formats, inspiration: r.inspiration, status: r.status, due_at: r.dueAt }), 'design request')
  },
  postRequestMessage: (churchId: string, requestId: string, id: string, text: string) =>
    bg(sb().from('design_request_messages').insert({ id, church_id: churchId, request_id: requestId, sender: 'you', text }), 'message designer'),
  updateTeamRole: (churchId: string, id: string, role: Role) =>
    id.startsWith('invite:')
      ? bg(sb().from('team_invites').update({ role }).eq('id', id.slice(7)).eq('church_id', churchId), 'change role')
      : bg(sb().from('church_users').update({ role }).eq('user_id', id).eq('church_id', churchId), 'change role'),
  removeTeam: (churchId: string, id: string) =>
    id.startsWith('invite:')
      ? bg(sb().from('team_invites').update({ status: 'Revoked' }).eq('id', id.slice(7)).eq('church_id', churchId), 'revoke invite')
      : bg(sb().from('church_users').delete().eq('user_id', id).eq('church_id', churchId), 'remove teammate'),
  addLink: (churchId: string, l: ShareLink) => bg(sb().from('share_links').insert({ id: l.id, church_id: churchId, type: l.type, label: l.label, branch: l.branch, fund: l.fund }), 'create link'),
  removeLink: (churchId: string, id: string) => bg(sb().from('share_links').delete().eq('id', id).eq('church_id', churchId), 'delete link'),
  setTemplate: (churchId: string, key: string, lang: Lang, text: string | null) =>
    text === null
      ? bg(sb().from('message_templates').delete().eq('church_id', churchId).eq('key', key).eq('lang', lang), 'reset template')
      : bg(sb().from('message_templates').upsert({ church_id: churchId, key, lang, text }), 'save template'),
  logActivity: (churchId: string, userId: string, e: { user: string; agent: string; action: string; entity?: string; result: string; approval: string }) =>
    bg(sb().from('ai_activity').insert({ church_id: churchId, user_id: userId, user_name: e.user, agent: e.agent, action: e.action, entity: e.entity ?? null, result: e.result, approval: e.approval }), 'AI activity'),
  recordUsage: (churchId: string, userId: string, u: { feature: string; units: number; provider: string; model: string; estCostUsd: number }) =>
    bg(sb().from('ai_usage').insert({ church_id: churchId, user_id: userId, feature: u.feature, units: u.units, provider: u.provider, model: u.model, est_cost_usd: u.estCostUsd }), 'AI usage'),
  loadAi: async (churchId: string) => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const [act, use] = await Promise.all([
      sb().from('ai_activity').select('*').eq('church_id', churchId).order('at', { ascending: false }).limit(200),
      sb().from('ai_usage').select('*').eq('church_id', churchId).gte('at', monthStart).limit(20000),
    ])
    return {
      activity: ok(act, [] as Record<string, never>[]).map((x: Record<string, unknown>) => ({ id: x.id as string, at: x.at as string, user: x.user_name as string, agent: x.agent as string, action: x.action as string, entity: (x.entity as string | null) ?? undefined, result: x.result as string, approval: x.approval as string })),
      usage: ok(use, [] as Record<string, never>[]).map((x: Record<string, unknown>) => ({ id: x.id as string, at: x.at as string, feature: x.feature as string, units: Number(x.units), provider: x.provider as string, model: x.model as string, estCostUsd: Number(x.est_cost_usd), user: '' })),
    }
  },
}
