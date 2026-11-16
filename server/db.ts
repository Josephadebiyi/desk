import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextFunction, Request, Response } from 'express'
import { configured, env } from './env'

/** Service-role client: bypasses RLS, so every route must check permissions itself. */
export const admin: SupabaseClient | null = configured.supabase
  ? createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

export function db() {
  if (!admin) throw new HttpError(503, 'The database is not configured on the server (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).')
  return admin
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** branch = a branch leader: only sees and submits their own branch's reports.
 *  department = a department head: only their departments' members, with per-person switches (migration 0021). */
export type Role = 'admin' | 'finance' | 'leader' | 'branch' | 'department'
export interface Caller {
  userId: string
  email: string
  name: string
  churchId: string
  role: Role
  /** Set for branch leaders: the branch they report for. */
  branch: string | null
  /** Department heads: their departments and switches. */
  departments: string[]
  canEditMembers: boolean
  canSendMessages: boolean
}

declare module 'express-serve-static-core' {
  interface Request {
    caller?: Caller
  }
}

/**
 * Authenticates the Supabase session (Bearer token) and resolves the church the request is
 * about (x-church-id header) plus the caller's role in it. Optionally requires a role.
 */
export function requireCaller(roles?: Role[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = await verifiedUser(req)
      const data = { user }
      const churchId = String(req.headers['x-church-id'] ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(churchId)) throw new HttpError(400, 'No church selected.')
      type Link = { role: string; branch?: string | null; departments?: string[] | null; can_edit_members?: boolean; can_send_messages?: boolean }
      const linkOf = (cols: string) => db().from('church_users').select(cols).eq('church_id', churchId).eq('user_id', data.user.id).maybeSingle<Link>()
      let { data: link, error: linkError } = await linkOf('role, branch, departments, can_edit_members, can_send_messages')
      // Before migrations 0010 / 0021 those columns don't exist: fall back so nothing else breaks.
      if (linkError?.code === '42703') ({ data: link, error: linkError } = await linkOf('role, branch'))
      if (linkError?.code === '42703') ({ data: link } = await linkOf('role'))
      if (!link) throw new HttpError(403, 'You are not part of this church.')
      if (roles && !roles.includes(link.role as Role)) throw new HttpError(403, 'Your role does not allow this.')
      // Branch leaders only reach routes that name them explicitly.
      if (!roles && link.role === 'branch') throw new HttpError(403, 'Your role does not allow this.')
      req.caller = {
        userId: data.user.id,
        email: data.user.email ?? '',
        name: String(data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? ''),
        churchId,
        role: link.role as Role,
        branch: link.branch ?? null,
        departments: link.role === 'department' ? (link.departments ?? []) : [],
        canEditMembers: link.role === 'department' ? Boolean(link.can_edit_members) : link.role === 'admin' || link.role === 'leader',
        canSendMessages: link.role === 'department' ? Boolean(link.can_send_messages) : link.role === 'admin' || link.role === 'leader',
      }
      next()
    } catch (e) {
      next(e)
    }
  }
}

/** The signed-in Supabase user behind the Bearer token. Suspended accounts are refused straight away
 *  (their access token would otherwise keep working until it expires). */
async function verifiedUser(req: Request) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token || token.length > 4096) throw new HttpError(401, 'Please sign in.')
  const { data, error } = await db().auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  const banned = (data.user as { banned_until?: string | null }).banned_until
  if (banned && new Date(banned) > new Date()) throw new HttpError(403, 'This account is suspended. Contact support@ziondesk.com.')
  if (!data.user.email_confirmed_at) throw new HttpError(403, 'Please confirm your email address first.')
  return data.user
}

/** Wraps async route handlers so thrown errors reach the error middleware. */
export const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)

/** Signed-in user only (no church needed) — for personal account actions. */
export function requireUser() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = await verifiedUser(req)
      const data = { user }
      req.caller = { userId: data.user.id, email: data.user.email ?? '', name: String(data.user.user_metadata?.full_name ?? ''), churchId: '', role: 'leader', branch: null, departments: [], canEditMembers: false, canSendMessages: false }
      next()
    } catch (e) {
      next(e)
    }
  }
}
