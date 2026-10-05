import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BRANCHES, DEPARTMENTS, FUNDS } from './seed'
import { uid, type Role } from './types'
import type { Lang } from '../i18n'
import { useSession } from '../lib/session'
import { api as callApi } from '../lib/api'
import { loadWorkspace, ws as db } from '../data/remote'
import type { ManualMethod } from '../lib/giveMethods'

/**
 * Church workspace data (everything except members): settings, events, messages,
 * expenses, designs and design-team requests. Persisted to localStorage for the
 * preview build — replace the setters with API calls when the backend is ready.
 */

export type PlanId = 'essentials' | 'plus' | 'max'
export const PLAN_LABEL: Record<PlanId, string> = { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' }
export const PLAN_RANK: Record<PlanId, number> = { essentials: 0, plus: 1, max: 2 }

export interface Settings {
  churchName: string
  location: string
  phone: string
  email: string
  denomination: string
  currency: string
  branches: string[]
  departments: string[]
  funds: string[]
  plan: PlanId
  payout: {
    method: 'none' | 'ziondesk' | 'bank'
    bankName: string
    accountName: string
    accountNumber: string
    /** Sort code / routing / IBAN / SWIFT — whatever the country uses. */
    routing: string
    instructions: string
    /** Show online card / mobile-money giving (ZionDesk Payments) on the giving page. */
    online?: boolean
    /** Manual ways to give: bank transfer, IBAN, Bizum, M-Pesa… */
    manual?: ManualMethod[]
  }
  givingSlug: string
  /** Live: church bank connected to Flutterwave for online giving (masked details, no secrets). */
  payoutAccount?: { country: string; bankCode: string; bankName: string; accountNumber: string; accountName: string } | null
  /** Live: online card/transfer giving is ready. */
  onlineGiving?: boolean
  /** Live: subscription state. */
  planStatus?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'
  /** Live: church logo (Supabase storage). */
  logoUrl?: string | null
  planRenewsAt?: string | null
}

/** Shareable public link (registration form or giving page) with its QR code. */
export type LinkType = 'member' | 'newcomer' | 'convert' | 'giving'
export interface ShareLink {
  id: string
  type: LinkType
  label: string
  branch: string
  fund: string
  createdAt: string
}

/** A giver's "I've sent a bank transfer" notice, waiting for the finance team to confirm. */
export interface TransferClaim {
  id: string
  date: string
  name: string
  email: string
  phone: string
  amount: number
  fund: string
  reference: string
  language: Lang
  status: 'Pending' | 'Confirmed' | 'Declined'
  createdAt: string
}

export type TemplateOverrides = Record<string, Partial<Record<Lang, string>>>

export type Channel = 'SMS' | 'WhatsApp' | 'Email'
export interface Audience {
  type: 'all' | 'stage' | 'department' | 'branch'
  value: string
}
export interface Campaign {
  id: string
  channel: Channel
  audience: Audience
  recipients: number
  subject: string
  body: string
  createdAt: string
  scheduledFor: string | null
  status: 'Queued' | 'Scheduled'
  /** Template details (event, isoDate, isoTime, text…) the server fills per language. */
  vars?: Record<string, string>
  /** Recipients per communication language, e.g. { en: 40, fr: 5 }. */
  languages?: Record<string, number>
  /** Built-in template key when each member got the text in their own language. */
  template?: string
}

export interface ChurchEvent {
  id: string
  title: string
  date: string // yyyy-mm-dd
  start: string // HH:mm
  end: string
  mode: 'In person' | 'Online' | 'Hybrid'
  location: string
  googleMeet: boolean
  /** Online meeting link (Google Meet, Zoom…) pasted by the organiser; sent in invitations and reminders. */
  meetLink?: string
  audience: Audience
  invited: number
  attendance: number | null
  notes: string
}

export interface Expense {
  id: string
  date: string
  category: string
  amount: number
  note: string
}

export interface AnonGift {
  id: string
  date: string
  amount: number
  fund: string
  method: string
  donor: string
}

export interface SavedDesign {
  id: string
  template: string
  title: string
  when: string
  createdAt: string
  /** AI-designed flyer (SVG). */
  svg?: string
}

export interface RequestMessage {
  id: string
  from: 'you' | 'system' | 'designer'
  text: string
  at: string
}
export interface DesignRequest {
  id: string
  title: string
  brief: Record<string, string>
  formats: string[]
  inspiration: { name: string; dataUrl?: string }[]
  status: 'Awaiting payment' | 'Submitted' | 'In design' | 'Review' | 'Delivered'
  createdAt: string
  dueAt: string
  messages: RequestMessage[]
  /** Finished files from the ZionDesk design team. */
  deliverables?: { name: string; url: string }[]
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: Role
  status: 'Active' | 'Invited'
}

/* ───────── seeds ───────── */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}
const nextWeekday = (wd: number, weeks = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7 || 7) + weeks * 7)
  return iso(d)
}

const SEED = {
  settings: (): Settings => ({
    churchName: 'Grace Chapel',
    location: 'Lagos, Nigeria',
    phone: '+234 803 555 0101',
    email: 'office@gracechapel.org',
    denomination: 'Pentecostal',
    currency: 'USD',
    branches: [...BRANCHES],
    departments: [...DEPARTMENTS],
    funds: [...FUNDS],
    plan: 'essentials',
    payout: { method: 'none', bankName: 'First Bank', accountName: 'Grace Chapel', accountNumber: '2034 5567 89', routing: '', instructions: '' },
    givingSlug: 'grace-chapel',
  }),
  events: (): ChurchEvent[] => [
    { id: 'e1', title: 'Sunday Service', date: nextWeekday(0), start: '09:00', end: '11:30', mode: 'Hybrid', location: 'Main Auditorium', googleMeet: false, audience: { type: 'all', value: '' }, invited: 48, attendance: null, notes: '' },
    { id: 'e2', title: 'Midweek Bible Study', date: nextWeekday(3), start: '19:00', end: '20:30', mode: 'Online', location: '', googleMeet: true, audience: { type: 'all', value: '' }, invited: 48, attendance: null, notes: 'Book of Romans, chapter 8.' },
    { id: 'e3', title: 'Worship Night', date: nextWeekday(5), start: '19:00', end: '21:00', mode: 'In person', location: 'Main Auditorium', googleMeet: false, audience: { type: 'all', value: '' }, invited: 48, attendance: null, notes: '' },
    { id: 'e4', title: 'Choir Rehearsal', date: nextWeekday(6), start: '16:00', end: '18:00', mode: 'In person', location: 'Choir Room', googleMeet: false, audience: { type: 'department', value: 'Worship' }, invited: 6, attendance: null, notes: '' },
    { id: 'e5', title: 'Youth Hangout', date: nextWeekday(6, 1), start: '15:00', end: '18:00', mode: 'In person', location: 'Youth Hall', googleMeet: false, audience: { type: 'department', value: 'Youth' }, invited: 5, attendance: null, notes: '' },
    { id: 'e0', title: 'Sunday Service', date: addDays(-7), start: '09:00', end: '11:30', mode: 'Hybrid', location: 'Main Auditorium', googleMeet: false, audience: { type: 'all', value: '' }, invited: 48, attendance: 41, notes: '' },
  ],
  campaigns: (): Campaign[] => [
    { id: 'c1', channel: 'SMS', audience: { type: 'all', value: '' }, recipients: 48, subject: '', body: 'Hi {first_name}, join us this Sunday at 9AM. God bless you!', createdAt: addDays(-5), scheduledFor: null, status: 'Queued' },
    { id: 'c2', channel: 'WhatsApp', audience: { type: 'stage', value: 'Newcomer' }, recipients: 7, subject: '', body: 'Welcome to Grace Chapel, {first_name}! We loved having you. Reply if you would like a call from our welcome team.', createdAt: addDays(-2), scheduledFor: null, status: 'Queued' },
  ],
  expenses: (): Expense[] => [
    { id: 'x1', date: addDays(-26), category: 'Utilities', amount: 320, note: 'Electricity' },
    { id: 'x2', date: addDays(-19), category: 'Outreach', amount: 450, note: 'Community food drive' },
    { id: 'x3', date: addDays(-12), category: 'Equipment', amount: 780, note: 'New microphones' },
    { id: 'x4', date: addDays(-6), category: 'Salaries', amount: 1500, note: 'Staff stipend' },
    { id: 'x5', date: addDays(-2), category: 'Maintenance', amount: 210, note: 'Generator service' },
  ],
  anonGifts: (): AnonGift[] => [
    { id: 'a1', date: addDays(-7), amount: 640, fund: 'Offering', method: 'Cash', donor: 'Sunday offering (cash)' },
    { id: 'a2', date: addDays(-14), amount: 585, fund: 'Offering', method: 'Cash', donor: 'Sunday offering (cash)' },
  ],
  designs: (): SavedDesign[] => [],
  requests: (): DesignRequest[] => [],
  templates: (): TemplateOverrides => ({}),
  links: (): ShareLink[] => [
    { id: 'l1', type: 'member', label: '', branch: '', fund: '', createdAt: addDays(-30) },
    { id: 'l2', type: 'newcomer', label: '', branch: '', fund: '', createdAt: addDays(-30) },
    { id: 'l3', type: 'convert', label: '', branch: '', fund: '', createdAt: addDays(-30) },
    { id: 'l4', type: 'giving', label: '', branch: '', fund: 'Offering', createdAt: addDays(-30) },
  ],
  claims: (): TransferClaim[] => [
    { id: 'tc1', date: addDays(-1), name: 'Joy Adeyemi', email: 'joy.adeyemi@example.com', phone: '', amount: 50, fund: 'Offering', reference: 'JOY-OFFERING', language: 'en', status: 'Pending', createdAt: addDays(-1) },
  ],
  team: (): TeamMember[] => [
    { id: 't1', name: 'Pastor Mike', email: 'mike@gracechapel.org', role: 'admin', status: 'Active' },
    { id: 't2', name: 'Sarah Collins', email: 'sarah@gracechapel.org', role: 'admin', status: 'Active' },
    { id: 't3', name: 'Daniel Obi', email: 'daniel@gracechapel.org', role: 'finance', status: 'Active' },
    { id: 't4', name: 'Esther Kalu', email: 'esther@gracechapel.org', role: 'leader', status: 'Invited' },
  ],
}

type Seeds = typeof SEED
type Key = keyof Seeds
type Val<K extends Key> = ReturnType<Seeds[K]>

/** `demo` = seed only, no storage. `live` = loaded from the database (no browser storage). */
function usePersisted<K extends Key>(key: K, demo: boolean, live = false): [Val<K>, (u: (v: Val<K>) => Val<K>) => void] {
  const storageKey = `ziondesk-${key}-v1`
  const [v, setV] = useState<Val<K>>(() => {
    if (live) return (Array.isArray(SEED[key]()) ? [] : SEED[key]()) as Val<K>
    if (!demo) {
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          const seed = SEED[key]()
          // Objects are merged with the seed so newly added settings get defaults.
          if (Array.isArray(seed)) return parsed as Val<K>
          const merged: Record<string, unknown> = { ...seed, ...parsed }
          for (const [k, def] of Object.entries(seed)) {
            if (def && typeof def === 'object' && !Array.isArray(def)) merged[k] = { ...def, ...(parsed[k] ?? {}) }
          }
          return merged as Val<K>
        }
      } catch {
        /* ignore */
      }
    }
    return SEED[key]() as Val<K>
  })
  useEffect(() => {
    if (demo || live) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(v))
    } catch {
      /* storage full */
    }
  }, [v, demo, live, storageKey])
  const update = useCallback((u: (v: Val<K>) => Val<K>) => setV((x) => u(x)), [])
  return [v, update]
}

interface WorkspaceApi {
  /** Live (database) mode and its loading state. */
  live: boolean
  loading: boolean
  /** When the church's free trial ends (live mode). */
  trialEndsAt: string | null
  reload: () => Promise<void>
  /** AI settings stored on the church (live mode). */
  aiSettings: Record<string, unknown> | null
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  events: ChurchEvent[]
  saveEvent: (e: Omit<ChurchEvent, 'id'> & { id?: string }) => ChurchEvent
  removeEvent: (id: string) => void
  campaigns: Campaign[]
  addCampaign: (c: Omit<Campaign, 'id' | 'createdAt'>) => void
  expenses: Expense[]
  addExpense: (x: Omit<Expense, 'id'>) => void
  removeExpense: (id: string) => void
  anonGifts: AnonGift[]
  addAnonGift: (g: Omit<AnonGift, 'id'>) => void
  designs: SavedDesign[]
  addDesign: (d: Omit<SavedDesign, 'id' | 'createdAt'>) => void
  removeDesign: (id: string) => void
  requests: DesignRequest[]
  addRequest: (r: Omit<DesignRequest, 'id' | 'createdAt' | 'dueAt' | 'status' | 'messages'>) => DesignRequest
  postRequestMessage: (id: string, text: string) => void
  team: TeamMember[]
  inviteTeam: (t: Omit<TeamMember, 'id' | 'status'>) => void
  updateTeam: (id: string, patch: Partial<TeamMember>) => void
  removeTeam: (id: string) => void
  /** Admin edits to built-in message templates, per language (missing = default text). */
  templates: TemplateOverrides
  setTemplate: (key: string, lang: Lang, text: string | null) => void
  links: ShareLink[]
  addLink: (l: Omit<ShareLink, 'id' | 'createdAt'>) => ShareLink
  removeLink: (id: string) => void
  claims: TransferClaim[]
  addClaim: (c: Omit<TransferClaim, 'id' | 'createdAt' | 'status'>) => void
  setClaimStatus: (id: string, status: TransferClaim['status']) => Promise<void>
  hasPlan: (p: PlanId) => boolean
  resetWorkspace: () => void
}

const Ctx = createContext<WorkspaceApi | null>(null)

export function WorkspaceProvider({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  const session = useSession()
  const churchId = !demo && session.remote ? session.church?.id ?? '' : ''
  const live = Boolean(churchId)
  const [settings, setSettings] = usePersisted('settings', demo, live)
  const [events, setEvents] = usePersisted('events', demo, live)
  const [campaigns, setCampaigns] = usePersisted('campaigns', demo, live)
  const [expenses, setExpenses] = usePersisted('expenses', demo, live)
  const [anonGifts, setAnonGifts] = usePersisted('anonGifts', demo, live)
  const [designs, setDesigns] = usePersisted('designs', demo, live)
  const [requests, setRequests] = usePersisted('requests', demo, live)
  const [team, setTeam] = usePersisted('team', demo, live)
  const [links, setLinks] = usePersisted('links', demo, live)
  const [templates, setTemplates] = usePersisted('templates', demo, live)
  const [claims, setClaims] = usePersisted('claims', demo, live)
  const [loading, setLoading] = useState(live)
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)
  const [aiSettings, setAiSettings] = useState<Record<string, unknown> | null>(null)

  const reload = useCallback(async () => {
    if (!churchId) return
    try {
      const d = await loadWorkspace(churchId)
      setSettings(() => d.settings)
      setEvents(() => d.events)
      setCampaigns(() => d.campaigns)
      setExpenses(() => d.expenses)
      setAnonGifts(() => d.anonGifts)
      setDesigns(() => d.designs)
      setRequests(() => d.requests)
      setTeam(() => d.team)
      setLinks(() => d.links)
      setClaims(() => d.claims)
      setTemplates(() => d.templates)
      setTrialEndsAt(d.trialEndsAt)
      setAiSettings(d.aiSettings)
    } catch (e) {
      console.error('[workspace]', e)
    } finally {
      setLoading(false)
    }
  }, [churchId, setSettings, setEvents, setCampaigns, setExpenses, setAnonGifts, setDesigns, setRequests, setTeam, setLinks, setClaims, setTemplates])

  useEffect(() => {
    if (!churchId) return
    setLoading(true)
    reload()
  }, [churchId, reload])

  const api = useMemo<WorkspaceApi>(() => {
    const now = () => new Date().toISOString()
    return {
      live,
      loading,
      trialEndsAt,
      reload,
      aiSettings,
      settings,
      updateSettings: (patch) => {
        setSettings((s) => ({ ...s, ...patch }))
        if (live) db.updateSettings(churchId, patch)
      },
      events,
      saveEvent: (e) => {
        const ev = { ...e, id: e.id ?? uid() } as ChurchEvent
        setEvents((all) => (all.some((x) => x.id === ev.id) ? all.map((x) => (x.id === ev.id ? ev : x)) : [...all, ev]))
        if (live)
          db.saveEvent(churchId, ev).then((link) => {
            if (link) setEvents((all) => all.map((x) => (x.id === ev.id ? { ...x, meetLink: link } : x)))
          })
        return ev
      },
      removeEvent: (id) => {
        setEvents((all) => all.filter((x) => x.id !== id))
        if (live) db.removeEvent(churchId, id)
      },
      campaigns,
      addCampaign: (c) => {
        const created = { ...c, id: uid(), createdAt: now() }
        setCampaigns((all) => [created, ...all])
        if (live) db.addCampaign(churchId, created).catch((e) => console.error('[send]', e))
      },
      expenses,
      addExpense: (x) => {
        const created = { ...x, id: uid() }
        setExpenses((all) => [created, ...all])
        if (live) db.addExpense(churchId, created)
      },
      removeExpense: (id) => {
        setExpenses((all) => all.filter((x) => x.id !== id))
        if (live) db.removeExpense(churchId, id)
      },
      anonGifts,
      addAnonGift: (g) => {
        const created = { ...g, id: uid() }
        setAnonGifts((all) => [created, ...all])
        if (live) db.addAnonGift(churchId, created)
      },
      designs,
      addDesign: (d) => {
        const created = { ...d, id: uid(), createdAt: now() }
        setDesigns((all) => [created, ...all])
        if (live) db.addDesign(churchId, created)
      },
      removeDesign: (id) => {
        setDesigns((all) => all.filter((x) => x.id !== id))
        if (live) db.removeDesign(churchId, id)
      },
      requests,
      addRequest: (r) => {
        const created: DesignRequest = {
          ...r,
          id: uid(),
          createdAt: now(),
          dueAt: new Date(Date.now() + 48 * 3600e3).toISOString(),
          status: 'Submitted',
          messages: [
            {
              id: uid(),
              from: 'system',
              text: '__received__', // shown translated in the viewer's language
              at: now(),
            },
          ],
        }
        setRequests((all) => [created, ...all])
        if (live) {
          // The server checks the monthly allowance: included requests go straight to the designers,
          // extra ones open a €10 checkout first.
          callApi<{ status: DesignRequest['status']; link?: string }>('/design/requests', { id: created.id, title: created.title, brief: created.brief, formats: created.formats, inspiration: created.inspiration })
            .then((r) => {
              if (r.link) window.location.href = r.link
              else void reload()
            })
            .catch((e) => {
              setRequests((all) => all.filter((x) => x.id !== created.id))
              window.alert(e instanceof Error ? e.message : String(e))
            })
        }
        return created
      },
      postRequestMessage: (id, text) => {
        const mid = uid()
        setRequests((all) => all.map((r) => (r.id === id ? { ...r, messages: [...r.messages, { id: mid, from: 'you', text, at: now() }] } : r)))
        if (live) {
          db.postRequestMessage(churchId, id, mid, text)
          callApi(`/design/requests/${id}/notify`, { message: text }).catch((e) => console.error('[design notify]', e))
        }
      },
      team,
      inviteTeam: (t) => {
        setTeam((all) => [...all, { ...t, id: `invite:${uid()}`, status: 'Invited' }])
        if (live)
          callApi('/team/invite', { name: t.name, email: t.email, role: t.role, language: (t as { language?: string }).language })
            .then(reload)
            .catch((e) => console.error('[invite]', e))
      },
      updateTeam: (id, patch) => {
        setTeam((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)))
        if (live && patch.role) db.updateTeamRole(churchId, id, patch.role)
      },
      removeTeam: (id) => {
        setTeam((all) => all.filter((x) => x.id !== id))
        if (live) db.removeTeam(churchId, id)
      },
      templates,
      setTemplate: (key, lang, text) => {
        setTemplates((all) => {
          const cur = { ...(all[key] ?? {}) }
          if (text === null) delete cur[lang]
          else cur[lang] = text
          return { ...all, [key]: cur }
        })
        if (live) db.setTemplate(churchId, key, lang, text)
      },
      links,
      addLink: (l) => {
        const created = { ...l, id: uid(), createdAt: now() }
        setLinks((all) => [...all, created])
        if (live) db.addLink(churchId, created)
        return created
      },
      removeLink: (id) => {
        setLinks((all) => all.filter((x) => x.id !== id))
        if (live) db.removeLink(churchId, id)
      },
      claims,
      addClaim: (c) => setClaims((all) => [{ ...c, id: uid(), createdAt: now(), status: 'Pending' }, ...all]),
      setClaimStatus: async (id, status) => {
        // Live: the server confirms, records the gift and emails the giver a receipt in their language.
        if (live && status !== 'Pending') await callApi(`/claims/${id}/${status === 'Confirmed' ? 'confirm' : 'decline'}`, {})
        setClaims((all) => all.map((x) => (x.id === id ? { ...x, status } : x)))
      },
      hasPlan: (p) => PLAN_RANK[settings.plan] >= PLAN_RANK[p],
      resetWorkspace: () => {
        if (live) return
        setSettings(() => SEED.settings())
        setEvents(() => SEED.events())
        setCampaigns(() => SEED.campaigns())
        setExpenses(() => SEED.expenses())
        setAnonGifts(() => SEED.anonGifts())
        setDesigns(() => SEED.designs())
        setRequests(() => SEED.requests())
        setTeam(() => SEED.team())
        setLinks(() => SEED.links())
        setTemplates(() => SEED.templates())
        setClaims(() => SEED.claims())
      },
    }
  }, [live, loading, trialEndsAt, reload, aiSettings, churchId, settings, events, campaigns, expenses, anonGifts, designs, requests, team, links, claims, templates, setLinks, setClaims, setTemplates, setSettings, setEvents, setCampaigns, setExpenses, setAnonGifts, setDesigns, setRequests, setTeam])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useWorkspace() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return v
}
