import { createClient } from '@supabase/supabase-js'

/**
 * Browser Supabase client (anon key — safe to expose; Row Level Security protects data).
 * When the env vars are missing the app runs in local preview mode (browser storage + demo data).
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<anon public key>
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null

/** True when the app is connected to a real backend. */
export const remote = Boolean(supabase)
