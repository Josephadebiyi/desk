/**
 * Auth for the login / sign-up / password screens.
 * With Supabase configured (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) these talk to Supabase
 * Auth; otherwise they reject with NotConnectedError so the preview shows an honest message.
 * Google sign-in uses Supabase's Google provider (Supabase → Authentication → Providers → Google).
 */
import { TERMS_VERSION } from './company'
import { createChurch, type PendingChurch } from './session'
import { supabase } from './supabase'

export class NotConnectedError extends Error {
  constructor() {
    super('Sign-in is not connected to ZionDesk accounts yet.')
    this.name = 'NotConnectedError'
  }
}

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super('Google sign-in is not configured yet.')
    this.name = 'GoogleNotConfiguredError'
  }
}

export interface LoginInput {
  email: string
  password: string
}

export type PlanId = 'essentials' | 'plus' | 'max'

export interface RegisterInput {
  provider: 'email' | 'google'
  fullName: string
  email: string
  password?: string
  googleAccessToken?: string
  organization: string
  location: string
  phone: string
  denomination: string
  noDenominations: boolean
  churchSize: string
  role: string
  currency: string
  logo: File | null
  plan: PlanId
  /** App and communication language chosen during sign-up (saved on the user record). */
  uiLanguage?: string
  communicationLanguage?: string
}

export interface GoogleProfile {
  email: string
  name: string
  accessToken: string
}

const site = () => window.location.origin
const need = () => {
  if (!supabase) throw new NotConnectedError()
  return supabase
}

/** Sign-in failures the screens explain in the user's language. */
export class AuthError extends Error {
  code: 'invalid' | 'unconfirmed' | 'suspended' | 'rate' | 'other'
  constructor(code: AuthError['code'], message: string) {
    super(message)
    this.code = code
    this.name = 'AuthError'
  }
}
const authError = (e: { message: string; code?: string; status?: number }) => {
  const m = `${e.code ?? ''} ${e.message}`.toLowerCase()
  if (m.includes('invalid_credentials') || m.includes('invalid login')) return new AuthError('invalid', e.message)
  if (m.includes('email_not_confirmed') || m.includes('not confirmed')) return new AuthError('unconfirmed', e.message)
  if (m.includes('user_banned') || m.includes('banned')) return new AuthError('suspended', e.message)
  if (e.status === 429 || m.includes('rate limit') || m.includes('too many')) return new AuthError('rate', e.message)
  return new AuthError('other', e.message)
}

export async function login({ email, password }: LoginInput): Promise<void> {
  const { error } = await need().auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error) throw authError(error)
}

export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await need().auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: `${site()}/dashboard` } })
  if (error) throw authError(error)
}

/** Returns 'ready' when the account and church exist, or 'confirm-email' when the user must click the email link first. */
export async function register(input: RegisterInput): Promise<'ready' | 'confirm-email'> {
  const sb = need()
  const pending: PendingChurch = {
    name: input.organization.trim(),
    location: input.location,
    phone: input.phone,
    denomination: input.noDenominations ? '' : input.denomination,
    currency: input.currency,
    plan: input.plan,
    language: input.communicationLanguage ?? input.uiLanguage ?? 'en',
  }
  let { data: s } = await sb.auth.getSession()
  if (!s.session) {
    // Email sign-up. The church is created right away if no email confirmation is required,
    // otherwise on first sign-in (see SessionProvider).
    const { data, error } = await sb.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password ?? '',
      options: {
        emailRedirectTo: `${site()}/dashboard`,
        data: { full_name: input.fullName, ui_language: input.uiLanguage, comm_language: input.communicationLanguage, pending_church: pending, terms_version: TERMS_VERSION },
      },
    })
    if (error) throw authError(error)
    // Supabase hides whether an address is taken: an existing confirmed account comes back with no identities.
    if (data.user && !data.user.identities?.length) throw new AuthError('other', 'An account with this email already exists. Sign in or reset your password.')
    if (!data.session) return 'confirm-email'
    s = { session: data.session }
  }
  const churchId = await createChurch(pending)
  // Proof of consent (who accepted which version of the Terms and Privacy Policy, and when).
  if (s.session) await sb.from('profiles').update({ terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() }).eq('id', s.session.user.id)
  await sb.auth.updateUser({ data: { pending_church: null, full_name: input.fullName } })
  if (input.logo) await uploadLogo(churchId, input.logo).catch((e) => console.error('[logo]', e))
  return 'ready'
}

export async function uploadLogo(churchId: string, file: File) {
  const sb = need()
  const path = `${churchId}/logo-${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`
  const { error } = await sb.storage.from('logos').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const url = sb.storage.from('logos').getPublicUrl(path).data.publicUrl
  await sb.from('churches').update({ logo_url: url }).eq('id', churchId)
  return url
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await need().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${site()}/reset-password` })
  // Never reveal whether an account exists; only surface rate limits.
  if (error && authError(error).code === 'rate') throw authError(error)
}

/** Sets the new password and signs out every other device (a reset usually means the old one leaked). */
export async function updatePassword(password: string): Promise<void> {
  const sb = need()
  const { error } = await sb.auth.updateUser({ password })
  if (error) throw authError(error)
  await sb.auth.signOut({ scope: 'others' }).catch(() => undefined)
}

/** Google via Supabase OAuth: redirects to Google and back to `returnTo`. */
export async function signInWithGoogle(returnTo = '/dashboard'): Promise<GoogleProfile> {
  if (!supabase) throw new GoogleNotConfiguredError()
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${site()}${returnTo}` } })
  if (error) throw new Error(error.message)
  // The browser is redirecting; this promise never needs to resolve.
  return new Promise(() => {})
}
