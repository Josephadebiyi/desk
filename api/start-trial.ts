/**
 * POST /api/start-trial  { email }
 *
 * Vercel serverless function. Creates a 7-day trial (Essentials features) and emails
 * the user a link to their trial dashboard and a link to finish creating their account.
 *
 * Required environment variables (Vercel → Project → Settings → Environment Variables):
 *   RESEND_API_KEY   – API key from https://resend.com (or swap sendEmail() for your provider)
 *   EMAIL_FROM       – verified sender, e.g. "ZionDesk <hello@ziondesk.com>"
 *   SITE_URL         – public site origin, e.g. https://ziondesk.com
 *   APP_URL          – dashboard origin, e.g. https://app.ziondesk.com (defaults to SITE_URL)
 */
import { randomUUID } from 'node:crypto'
import { renderWelcomeEmail, welcomeEmailSubject } from '../src/emails/welcome'
import { asEmailLang } from '../src/emails/strings'

const TRIAL_DAYS = 7
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Req {
  method?: string
  body?: unknown
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

/**
 * Create the trial workspace with Essentials features enabled.
 * TODO: replace with a call to the ZionDesk accounts backend / database.
 */
async function createTrialAccount(email: string) {
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString()
  return { token, email, plan: 'essentials' as const, features: ['members', 'messaging', 'finance', 'events', 'assistant'], expiresAt }
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'ZionDesk <hello@ziondesk.com>'
  if (!key || !from) throw new Error('Email provider is not configured (RESEND_API_KEY / EMAIL_FROM).')
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!r.ok) throw new Error(`Email send failed: ${r.status} ${await r.text()}`)
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { email?: string; lang?: string } | undefined
  const email = body?.email?.trim().toLowerCase() ?? ''
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' })

  const lang = asEmailLang(body?.lang)
  const site = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173').replace(/\/$/, '')
  const app = process.env.APP_URL ?? site
  try {
    const trial = await createTrialAccount(email)
    const q = `email=${encodeURIComponent(email)}&token=${trial.token}`
    const dashboardUrl = `${app}/dashboard?trial=1&${q}`
    const signupUrl = `${site}/register?trial=1&${q}`
    await sendEmail(
      email,
      welcomeEmailSubject(TRIAL_DAYS, lang),
      renderWelcomeEmail({ lang, email, dashboardUrl, signupUrl, trialDays: TRIAL_DAYS, siteUrl: site }),
    )
    return res.status(200).json({ status: 'sent', dashboardUrl, signupUrl })
  } catch (err) {
    console.error('[start-trial]', err)
    return res.status(500).json({ error: 'We could not start your trial right now. Please try again.' })
  }
}
