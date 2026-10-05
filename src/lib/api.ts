import { supabase } from './supabase'

/**
 * Where the API server lives. Empty = same site (Render serves both). When the website is hosted
 * elsewhere (e.g. Hostinger), build with VITE_API_URL=https://desk-noae.onrender.com (or https://api.ziondesk.com).
 */
export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim().replace(/\/$/, '')
export const apiUrl = (path: string) => `${API_BASE}/api${path.startsWith('/') ? path : '/' + path}`

let activeChurch = ''
/** Set by the session provider so API calls are scoped to the open church. */
export const setApiChurch = (id: string) => (activeChurch = id)
export const apiChurch = () => activeChurch

/** Calls the ZionDesk API server with the signed-in session. Throws with the server's message. */
export async function api<T = unknown>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined
  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(activeChurch ? { 'x-church-id': activeChurch } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data
}
