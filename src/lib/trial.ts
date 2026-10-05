/**
 * Starts a free trial from an email address.
 * POSTs to /api/start-trial (see /api/start-trial.ts), which creates the trial workspace
 * and emails the trial-dashboard + sign-up links. When the API isn't deployed (local
 * dev), we fall back to "preview" so the flow can be tested without sending email.
 */
import { apiUrl } from './api'
export const TRIAL_DAYS = 7

export interface TrialResult {
  status: 'sent' | 'preview'
  dashboardUrl: string
  signupUrl: string
}

function preview(email: string): TrialResult {
  const q = `email=${encodeURIComponent(email)}`
  return { status: 'preview', dashboardUrl: `/dashboard?trial=1&${q}`, signupUrl: `/register?trial=1&${q}` }
}

export async function startTrial(email: string, lang = 'en'): Promise<TrialResult> {
  let res: Response
  try {
    res = await fetch(apiUrl('/start-trial'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, lang }),
    })
  } catch {
    return preview(email)
  }
  const isJson = res.headers.get('content-type')?.includes('application/json')
  if (!isJson) return preview(email) // API route not deployed (e.g. local dev server)
  const data = await res.json()
  if (res.ok) return data as TrialResult
  throw new Error(data.error ?? 'We could not start your trial right now. Please try again.')
}
