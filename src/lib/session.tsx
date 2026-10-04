/**
 * Signed-in session: Supabase user, profile (languages), the churches they belong to,
 * the open church and their role in it. In local preview mode (no Supabase env) this
 * provider is inert and the dashboard runs on demo data.
 */
import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isLang, onPrefsSaved, useT, type Lang } from '../i18n'
import type { Role } from '../dashboard/types'
import { setApiChurch } from './api'
import { remote, supabase } from './supabase'

export interface ChurchLink {
  id: string
  name: string
  slug: string
  role: Role
}

interface SessionApi {
  remote: boolean
  loading: boolean
  session: Session | null
  userId: string | null
  name: string
  email: string
  avatarUrl: string
  /** Saves the person's name and/or a new profile picture (stored in the "avatars" bucket). */
  updateProfile: (p: { name?: string; avatar?: File | null }) => Promise<void>
  churches: ChurchLink[]
  church: ChurchLink | null
  role: Role | null
  selectChurch: (id: string) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionApi | null>(null)
const CHURCH_KEY = 'ziondesk-church'

/** Sign-up details kept on the user until their church is created (works with email confirmation on). */
export interface PendingChurch {
  name: string
  location: string
  phone: string
  denomination: string
  currency: string
  plan: 'essentials' | 'plus' | 'max'
  language: string
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'church'

export async function createChurch(p: PendingChurch) {
  if (!supabase) throw new Error('Not connected')
  const { data, error } = await supabase.rpc('create_church', {
    p_name: p.name,
    p_slug: slugify(p.name).padEnd(3, '0'),
    p_location: p.location,
    p_phone: p.phone,
    p_denomination: p.denomination,
    p_currency: p.currency,
    p_plan: p.plan,
    p_language: isLang(p.language) ? p.language : 'en',
  })
  if (error) throw error
  return data as string
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { applyRemote } = useT()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(remote)
  const [profile, setProfile] = useState<{ full_name: string; email: string; avatar_url?: string | null } | null>(null)
  const [churches, setChurches] = useState<ChurchLink[]>([])
  const [churchId, setChurchId] = useState<string>(() => {
    try {
      return localStorage.getItem(CHURCH_KEY) ?? ''
    } catch {
      return ''
    }
  })

  const load = useCallback(
    async (s: Session | null) => {
      if (!supabase || !s) {
        setProfile(null)
        setChurches([])
        setLoading(false)
        return
      }
      const uid = s.user.id
      const [{ data: prof }, { data: links }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
        supabase.from('church_users').select('role, churches(id, name, slug)').eq('user_id', uid),
      ])
      if (prof) {
        setProfile({ full_name: prof.full_name, email: prof.email, avatar_url: prof.avatar_url ?? null })
        if (isLang(prof.ui_language) && isLang(prof.comm_language)) applyRemote(prof.ui_language, prof.comm_language, prof.language_chosen)
      }
      let list: ChurchLink[] = (links ?? []).flatMap((l) => {
        const c = l.churches as unknown as { id: string; name: string; slug: string } | null
        return c ? [{ id: c.id, name: c.name, slug: c.slug, role: l.role as Role }] : []
      })
      // First sign-in after confirming email: create the church saved during sign-up.
      const pending = s.user.user_metadata?.pending_church as PendingChurch | undefined
      if (!list.length && pending?.name) {
        try {
          const id = await createChurch(pending)
          await supabase.auth.updateUser({ data: { pending_church: null } })
          list = [{ id, name: pending.name, slug: slugify(pending.name), role: 'admin' }]
        } catch (e) {
          console.error('[create church]', e)
        }
      }
      setChurches(list)
      setLoading(false)
    },
    [applyRemote],
  )

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      load(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') load(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  // Saved language preferences follow the user to every device.
  useEffect(() => {
    if (!supabase || !session) {
      onPrefsSaved(null)
      return
    }
    const uid = session.user.id
    onPrefsSaved((ui: Lang, comm: Lang) => {
      supabase!.from('profiles').update({ ui_language: ui, comm_language: comm, language_chosen: true }).eq('id', uid).then(({ error }) => error && console.error('[prefs]', error))
    })
    return () => {
      onPrefsSaved(null)
    }
  }, [session])

  const church = churches.find((c) => c.id === churchId) ?? churches[0] ?? null
  useEffect(() => {
    setApiChurch(church?.id ?? '')
  }, [church?.id])

  const api = useMemo<SessionApi>(
    () => ({
      remote,
      loading,
      session,
      userId: session?.user.id ?? null,
      name: profile?.full_name || String(session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name ?? ''),
      email: profile?.email || session?.user.email || '',
      avatarUrl: profile?.avatar_url || String(session?.user.user_metadata?.avatar_url ?? session?.user.user_metadata?.picture ?? ''),
      updateProfile: async ({ name, avatar }) => {
        if (!supabase || !session) return
        const uid = session.user.id
        const patch: Record<string, string | null> = {}
        if (name !== undefined) patch.full_name = name.trim()
        if (avatar === null) patch.avatar_url = null
        if (avatar) {
          if (!/^image\/(png|jpe?g|webp|gif)$/.test(avatar.type)) throw new Error('IMAGE_TYPE')
          if (avatar.size > 3 * 1024 * 1024) throw new Error('IMAGE_SIZE')
          const path = `${uid}/avatar-${Date.now()}.${(avatar.name.split('.').pop() || 'png').toLowerCase()}`
          const { error } = await supabase.storage.from('avatars').upload(path, avatar, { upsert: true, contentType: avatar.type })
          if (error) throw error
          patch.avatar_url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
        }
        const { error } = await supabase.from('profiles').update(patch).eq('id', uid)
        if (error) throw error
        if (name !== undefined) await supabase.auth.updateUser({ data: { full_name: name.trim() } })
        setProfile((p) => (p ? { ...p, ...(patch as object) } : p))
      },
      churches,
      church,
      role: church?.role ?? null,
      selectChurch: (id) => {
        setChurchId(id)
        try {
          localStorage.setItem(CHURCH_KEY, id)
        } catch {
          /* ignore */
        }
      },
      refresh: () => load(session),
      signOut: async () => {
        await supabase?.auth.signOut()
      },
    }),
    [loading, session, profile, churches, church, load],
  )
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession must be used inside SessionProvider')
  return v
}
