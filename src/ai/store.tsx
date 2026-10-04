import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { uid } from '../dashboard/types'
import { useWorkspace, type PlanId } from '../dashboard/workspace'
import { useSession } from '../lib/session'
import { ws as db } from '../data/remote'
import { fetchProviderAvailability, type ProviderStatus } from './providers'
import type { AgentId, ProviderPref, UsageFeature } from './types'

/**
 * Church AI state for this workspace: provider settings, admin-editable usage limits and
 * credit costs, the AI activity (audit) log, usage records and inbox item states.
 * Persisted locally for the preview build; maps 1:1 to the ai_* tables in the assessment.
 */

export interface AiSettings {
  provider: ProviderPref
  enabled: ProviderStatus['enabled']
  language: string
  suggestions: boolean
  /** Monthly limits per plan and feature — editable by the SaaS administrator. */
  limits: Record<PlanId, Record<UsageFeature, number>>
  /** Credits each action consumes — editable. */
  credits: Record<UsageFeature, number>
  /** Estimated cost per message by channel, for the bulk-send confirmation. */
  messageCost: { SMS: number; WhatsApp: number; Email: number }
}

export interface ActivityEntry {
  id: string
  at: string
  user: string
  agent: AgentId | 'church-ai'
  action: string
  entity?: string
  result: 'success' | 'failed' | 'denied'
  approval: 'not required' | 'approved' | 'cancelled' | 'pending'
}

export interface UsageEntry {
  id: string
  at: string
  feature: UsageFeature
  units: number
  provider: string
  model: string
  estCostUsd: number
  user: string
}

export type InboxState = Record<string, { status: 'done' | 'dismissed' | 'snoozed'; until?: string }>

const DEFAULT_SETTINGS: AiSettings = {
  provider: 'auto',
  enabled: { claude: true, gemini: false, openai: false },
  language: 'English',
  suggestions: true,
  limits: {
    essentials: { requests: 300, designs: 7, imageEdits: 20, transcriptionHours: 0, clips: 0, storageGb: 5 },
    plus: { requests: 1000, designs: 12, imageEdits: 100, transcriptionHours: 15, clips: 30, storageGb: 50 },
    max: { requests: 3000, designs: 0, // 0 = unlimited
      imageEdits: 300, transcriptionHours: 40, clips: 100, storageGb: 200 },
  },
  credits: { requests: 1, designs: 1, imageEdits: 1, transcriptionHours: 1, clips: 1, storageGb: 1 },
  messageCost: { SMS: 0.01, WhatsApp: 0.005, Email: 0 },
}

function usePersisted<T>(key: string, seed: T): [T, (u: (v: T) => T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        return (Array.isArray(seed) ? parsed : { ...seed, ...parsed }) as T
      }
    } catch {
      /* ignore */
    }
    return seed
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* storage full */
    }
  }, [key, v])
  const update = useCallback((u: (v: T) => T) => setV((x) => u(x)), [])
  return [v, update]
}

interface AiApi {
  settings: AiSettings
  updateSettings: (patch: Partial<AiSettings>) => void
  resetSettings: () => void
  status: ProviderStatus
  activity: ActivityEntry[]
  log: (e: Omit<ActivityEntry, 'id' | 'at'>) => void
  usage: UsageEntry[]
  record: (e: Omit<UsageEntry, 'id' | 'at'>) => void
  usedThisMonth: (f: UsageFeature) => number
  limitFor: (f: UsageFeature, plan: PlanId) => number
  inbox: InboxState
  setInbox: (id: string, s: InboxState[string] | null) => void
}

const Ctx = createContext<AiApi | null>(null)

export function AiProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = usePersisted<AiSettings>('ziondesk-ai-settings-v1', DEFAULT_SETTINGS)
  const [activity, setActivity] = usePersisted<ActivityEntry[]>('ziondesk-ai-activity-v1', [])
  const [usage, setUsage] = usePersisted<UsageEntry[]>('ziondesk-ai-usage-v1', [])
  const [inbox, setInboxState] = usePersisted<InboxState>('ziondesk-ai-inbox-v1', {})
  const [available, setAvailable] = useState<ProviderStatus['available']>({ claude: false, gemini: false, openai: false })
  const session = useSession()
  const workspace = useWorkspace()
  const live = workspace.live
  const churchId = session.church?.id ?? ''
  const userId = session.userId ?? ''

  // Live: settings live on the church, activity and usage in their tables.
  useEffect(() => {
    if (!live || !workspace.aiSettings) return
    setSettings(() => ({ ...DEFAULT_SETTINGS, ...(workspace.aiSettings as Partial<AiSettings>) }))
  }, [live, workspace.aiSettings, setSettings])
  useEffect(() => {
    if (!live || !churchId) return
    db.loadAi(churchId)
      .then((d) => {
        setActivity(() => d.activity as ActivityEntry[])
        setUsage(() => d.usage as UsageEntry[])
      })
      .catch((e) => console.error('[ai]', e))
  }, [live, churchId, setActivity, setUsage])

  useEffect(() => {
    let alive = true
    fetchProviderAvailability().then((a) => alive && setAvailable(a))
    return () => {
      alive = false
    }
  }, [])

  const api = useMemo<AiApi>(() => {
    const month = new Date().toISOString().slice(0, 7)
    return {
      settings,
      updateSettings: (patch) =>
        setSettings((s) => {
          const next = { ...s, ...patch }
          if (live) db.updateAiSettings(churchId, next)
          return next
        }),
      resetSettings: () => {
        setSettings(() => DEFAULT_SETTINGS)
        if (live) db.updateAiSettings(churchId, DEFAULT_SETTINGS)
      },
      status: { enabled: settings.enabled, available },
      activity,
      log: (e) => {
        setActivity((all) => [{ ...e, id: uid(), at: new Date().toISOString() }, ...all].slice(0, 500))
        if (live) db.logActivity(churchId, userId, e)
      },
      usage,
      record: (e) => {
        setUsage((all) => [{ ...e, id: uid(), at: new Date().toISOString() }, ...all].slice(0, 5000))
        // Calls to Claude/Gemini/OpenAI are recorded by the server; record local answers here.
        if (live && e.provider === 'local') db.recordUsage(churchId, userId, e)
      },
      usedThisMonth: (f) => usage.filter((u) => u.feature === f && u.at.startsWith(month)).reduce((s, u) => s + u.units, 0),
      limitFor: (f, plan) => settings.limits[plan]?.[f] ?? 0,
      inbox,
      setInbox: (id, s) =>
        setInboxState((all) => {
          const next = { ...all }
          if (s) next[id] = s
          else delete next[id]
          return next
        }),
    }
  }, [settings, available, activity, usage, inbox, setSettings, setActivity, setUsage, setInboxState, live, churchId, userId])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useAi() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAi must be used inside AiProvider')
  return v
}
