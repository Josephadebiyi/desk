import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { seedMembers } from './seed'
import { uid, type Communication, type Gift, type Member, type MemberInput, type Role } from './types'
import { useSession } from '../lib/session'
import { loadMembers, members as db } from '../data/remote'

/**
 * Member store. Persists to localStorage for the trial/preview build.
 * Swap these functions for API calls when the ZionDesk backend is connected.
 */
const KEY = 'ziondesk-members-v2'
const ROLE_KEY = 'ziondesk-role'

function load(): Member[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return (JSON.parse(raw) as Member[]).map((m) => ({ ...m, language: m.language ?? 'en' }))
  } catch {
    /* ignore */
  }
  return seedMembers()
}

interface Store {
  /** True while the live database is loading. */
  loading: boolean
  /** Live mode: connected to Supabase (role comes from the account, not the preview switch). */
  live: boolean
  reload: () => Promise<void>
  members: Member[]
  role: Role
  setRole: (r: Role) => void
  addMember: (m: MemberInput) => Member
  updateMember: (id: string, m: Partial<MemberInput>) => void
  removeMembers: (ids: string[]) => void
  importMembers: (rows: MemberInput[]) => number
  logCommunication: (id: string, c: Omit<Communication, 'id'>) => void
  logCommunicationMany: (ids: string[], c: Omit<Communication, 'id'>) => void
  addGift: (memberId: string, g: Omit<Gift, 'id'>) => void
  resetDemo: () => void
}

const Ctx = createContext<Store | null>(null)

export function MemberStoreProvider({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  // `demo` = in-memory seed data only (used by the marketing-site preview); never touches storage.
  const session = useSession()
  const churchId = !demo && session.remote ? session.church?.id ?? '' : ''
  const live = Boolean(churchId)
  const [members, setMembers] = useState<Member[]>(() => (demo ? seedMembers() : live ? [] : load()))
  const [loading, setLoading] = useState(live)

  const reload = useCallback(async () => {
    if (!churchId) return
    try {
      setMembers(await loadMembers(churchId))
    } catch (e) {
      console.error('[members]', e)
    } finally {
      setLoading(false)
    }
  }, [churchId])

  useEffect(() => {
    if (!churchId) return
    setLoading(true)
    reload()
  }, [churchId, reload])
  const [role, setRoleState] = useState<Role>(() => {
    if (demo) return 'admin'
    try {
      return (localStorage.getItem(ROLE_KEY) as Role) || 'admin'
    } catch {
      return 'admin'
    }
  })

  useEffect(() => {
    if (demo || live) return
    try {
      localStorage.setItem(KEY, JSON.stringify(members))
    } catch {
      /* storage full or unavailable */
    }
  }, [members, demo, live])

  const setRole = useCallback((r: Role) => {
    setRoleState(r)
    if (demo) return
    try {
      localStorage.setItem(ROLE_KEY, r)
    } catch {
      /* ignore */
    }
  }, [demo])

  // In live mode the role is the user's real role in this church.
  const effectiveRole: Role = live ? session.role ?? 'leader' : role

  const value = useMemo<Store>(
    () => ({
      loading,
      live,
      reload,
      members,
      role: effectiveRole,
      setRole,
      addMember: (m) => {
        const member: Member = { ...m, id: uid(), communications: [], giving: [] }
        setMembers((all) => [member, ...all])
        if (live) db.insert(churchId, member)
        return member
      },
      updateMember: (id, m) => {
        setMembers((all) => all.map((x) => (x.id === id ? { ...x, ...m } : x)))
        if (live) db.update(churchId, id, m)
      },
      removeMembers: (ids) => {
        setMembers((all) => all.filter((x) => !ids.includes(x.id)))
        if (live) db.remove(churchId, ids)
      },
      importMembers: (rows) => {
        const created = rows.map((r) => ({ ...r, id: uid(), communications: [], giving: [] }))
        setMembers((all) => [...created, ...all])
        if (live) db.insertMany(churchId, created)
        return created.length
      },
      logCommunication: (id, c) => {
        const entry = { ...c, id: uid() }
        setMembers((all) => all.map((x) => (x.id === id ? { ...x, communications: [entry, ...x.communications] } : x)))
        if (live) db.logComm(churchId, id, entry)
      },
      // Bulk logs come from sends; in live mode the server records them per delivery, so this only updates the screen.
      logCommunicationMany: (ids, c) => {
        const set = new Set(ids)
        setMembers((all) =>
          all.map((x) => (set.has(x.id) ? { ...x, communications: [{ ...c, id: uid() }, ...x.communications] } : x)),
        )
      },
      addGift: (memberId, g) => {
        const gift = { ...g, id: uid() }
        setMembers((all) => all.map((x) => (x.id === memberId ? { ...x, giving: [gift, ...x.giving] } : x)))
        if (live) db.addGift(churchId, memberId, gift, members.find((x) => x.id === memberId)?.fullName ?? '')
      },
      resetDemo: () => !live && setMembers(seedMembers()),
    }),
    [members, effectiveRole, setRole, loading, live, churchId, reload],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMembers() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMembers must be used inside MemberStoreProvider')
  return v
}
