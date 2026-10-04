import { useEffect, useState } from 'react'
import { remote, supabase } from './supabase'

let cache: Promise<boolean> | null = null
/** Whether "Sign in with Google" is switched on in Supabase (buttons stay hidden until it is). */
export function useGoogleEnabled() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!remote || !supabase) return
    const url = import.meta.env.VITE_SUPABASE_URL as string
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    cache ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json())
      .then((s: { external?: { google?: boolean } }) => Boolean(s.external?.google))
      .catch(() => false)
    cache.then(setOn)
  }, [])
  return on
}
