/**
 * Supabase "Send Email" auth hook → localized emails via Resend.
 * Supabase calls this for sign-up confirmation, password reset, magic links, invites and
 * email changes. We render them in the user's communication language.
 *
 * Supabase dashboard → Authentication → Hooks → Send Email → HTTPS:
 *   URL:    https://<your-render-app>/api/auth/email-hook
 *   Secret: copy into SUPABASE_AUTH_HOOK_SECRET
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import express, { Router } from 'express'
import type { EmailKind } from '../../src/emails/catalog'
import { asEmailLang } from '../../src/emails/strings'
import { db, HttpError, route } from '../db'
import { env } from '../env'
import { compose, sendEmail } from '../mail'

export const authHookRoutes = Router()

/** Standard Webhooks signature check (what Supabase uses). */
function verify(raw: string, headers: Record<string, string | string[] | undefined>) {
  if (!env.authHookSecret) throw new HttpError(503, 'SUPABASE_AUTH_HOOK_SECRET is not set')
  const id = String(headers['webhook-id'] ?? '')
  const ts = String(headers['webhook-timestamp'] ?? '')
  const sigs = String(headers['webhook-signature'] ?? '').split(' ')
  if (!id || !ts || !Number.isFinite(Number(ts)) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new HttpError(401, 'Invalid webhook timestamp')
  const secret = Buffer.from(env.authHookSecret.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', secret).update(`${id}.${ts}.${raw}`).digest()
  const ok = sigs.some((s) => {
    const b = Buffer.from(s.replace(/^v1,/, ''), 'base64')
    return b.length === expected.length && timingSafeEqual(b, expected)
  })
  if (!ok) throw new HttpError(401, 'Invalid webhook signature')
}

const KIND: Record<string, EmailKind> = {
  signup: 'confirmSignup',
  recovery: 'resetPassword',
  magiclink: 'magicLink',
  invite: 'teamInvite',
  email_change: 'emailChange',
  email: 'confirmSignup',
}

authHookRoutes.post(
  '/email-hook',
  express.text({ type: '*/*', limit: '1mb' }),
  route(async (req, res) => {
    const raw = typeof req.body === 'string' ? req.body : ''
    verify(raw, req.headers)
    const { user, email_data: d } = JSON.parse(raw) as {
      user: { id: string; email: string; new_email?: string; user_metadata?: Record<string, string> }
      email_data: { token_hash: string; token_hash_new?: string; redirect_to: string; email_action_type: string; site_url: string }
    }
    const kind = KIND[d.email_action_type]
    if (!kind) return res.json({}) // e.g. reauthentication codes — let Supabase skip
    const { data: profile } = await db().from('profiles').select('full_name, comm_language').eq('id', user.id).maybeSingle()
    const lang = asEmailLang(profile?.comm_language ?? user.user_metadata?.comm_language ?? user.user_metadata?.ui_language)
    const name = (profile?.full_name || user.user_metadata?.full_name || user.email.split('@')[0]).split(' ')[0]
    const verifyUrl = (hash: string) =>
      `${env.supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(hash)}&type=${encodeURIComponent(d.email_action_type)}&redirect_to=${encodeURIComponent(d.redirect_to || env.siteUrl)}`

    if (kind === 'emailChange') {
      // Secure email change: one link to each address (both must be confirmed).
      if (d.token_hash) await sendEmail(compose(kind, lang, user.email, { name }, verifyUrl(d.token_hash)))
      if (user.new_email && d.token_hash_new) await sendEmail(compose(kind, lang, user.new_email, { name }, verifyUrl(d.token_hash_new)))
    } else {
      await sendEmail(compose(kind, lang, user.email, { name, church: 'ZionDesk', inviter: 'ZionDesk', role: '' }, verifyUrl(d.token_hash)))
    }
    res.json({})
  }),
)
