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

export type Role = 'admin' | 'finance' | 'leader'
export interface Caller {
  userId: string
  email: string
  name: string
  churchId: string
  role: Role
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
      const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
      if (!token) throw new HttpError(401, 'Please sign in.')
      const { data, error } = await db().auth.getUser(token)
      if (error || !data.user) throw new HttpError(401, 'Your session has expired. Please sign in again.')
      const churchId = String(req.headers['x-church-id'] ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(churchId)) throw new HttpError(400, 'No church selected.')
      const { data: link } = await db().from('church_users').select('role').eq('church_id', churchId).eq('user_id', data.user.id).maybeSingle()
      if (!link) throw new HttpError(403, 'You are not part of this church.')
      if (roles && !roles.includes(link.role as Role)) throw new HttpError(403, 'Your role does not allow this.')
      req.caller = {
        userId: data.user.id,
        email: data.user.email ?? '',
        name: String(data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? ''),
        churchId,
        role: link.role as Role,
      }
      next()
    } catch (e) {
      next(e)
    }
  }
}

/** Wraps async route handlers so thrown errors reach the error middleware. */
export const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)
