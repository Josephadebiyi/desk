import { supabase } from './supabase'

let activeChurch = ''
/** Set by the session provider so API calls are scoped to the open church. */
export const setApiChurch = (id: string) => (activeChurch = id)
export const apiChurch = () => activeChurch

/** Calls the ZionDesk API server with the signed-in session. Throws with the server's message. */
export async function api<T = unknown>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined
  const res = await fetch(`/api${path}`, {
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
