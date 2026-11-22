import { createClient } from '@supabase/supabase-js'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Logo } from '../components/ui'
import { useT } from '../i18n'
import { supabase } from '../lib/supabase'
import './public.css'
import './auth.css'

/**
 * /desktop-auth — Google sign-in for the desktop app.
 *
 * Google refuses to sign in inside app windows, so the desktop app opens this page in the computer's own browser:
 *   1. /desktop-auth?ds=<one-time code>&to=/dashboard   → sends the browser to Google.
 *   2. Google → Supabase → back here with ?code=…        → swaps the code for a session and opens
 *      ziondesk://auth#ds=…&at=…&rt=…&to=…, which hands the session to the app.
 *   3. Inside the app: /desktop-auth#at=…&rt=…&to=…     → stores the session and opens the dashboard.
 *
 * Steps 1–2 use their own Supabase client and storage key, and the browser forgets the session afterwards,
 * so the browser and the app never share (and fight over refreshing) the same sign-in.
 */
const HANDOFF_KEY = 'zd-desktop-handoff'
const safePath = (p: string | null) => (p && p.startsWith('/') && !p.startsWith('//') ? p : '/dashboard')

function handoffClient() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { flowType: 'pkce', storageKey: HANDOFF_KEY, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
function forgetHandoff() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(HANDOFF_KEY)) localStorage.removeItem(k)
  } catch {
    /* storage blocked */
  }
}

// Runs once per page load (React may mount the page twice in development; a code can only be used once).
let started = false

type State = { kind: 'working' } | { kind: 'done'; link: string } | { kind: 'failed'; detail?: string }

export default function DesktopAuth() {
  const { t } = useT()
  const [state, setState] = useState<State>({ kind: 'working' })

  useEffect(() => {
    if (started) return
    started = true
    const fail = (detail?: string) => setState({ kind: 'failed', detail })
    const q = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))

    async function run() {
      // 3. Inside the desktop app, with the session from the browser.
      if (hash.get('at') && hash.get('rt')) {
        history.replaceState(null, '', window.location.pathname) // tokens out of the address bar right away
        if (!supabase) return fail()
        const { error } = await supabase.auth.setSession({ access_token: hash.get('at')!, refresh_token: hash.get('rt')! })
        if (error) return fail(error.message)
        window.location.replace(safePath(hash.get('to')))
        return
      }

      const ds = q.get('ds')
      if (!ds || !/^[a-f0-9]{16,128}$/.test(ds)) return fail()
      const to = safePath(q.get('to'))
      const client = handoffClient()
      if (!client) return fail(t('auth.googleOff'))

      const oauthError = q.get('error_description') || hash.get('error_description')
      if (oauthError) {
        forgetHandoff()
        return fail(oauthError)
      }

      // 2. Back from Google.
      const code = q.get('code')
      if (code) {
        const { data, error } = await client.auth.exchangeCodeForSession(code)
        if (error || !data.session) {
          forgetHandoff()
          return fail(error?.message)
        }
        const link = `ziondesk://auth#${new URLSearchParams({ ds, at: data.session.access_token, rt: data.session.refresh_token, to })}`
        forgetHandoff()
        history.replaceState(null, '', window.location.pathname)
        setState({ kind: 'done', link })
        window.location.href = link
        return
      }

      // 1. Off to Google.
      const back = new URL('/desktop-auth', window.location.origin)
      back.searchParams.set('ds', ds)
      back.searchParams.set('to', to)
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back.href } })
      if (error) fail(error.message)
    }
    run().catch((e) => fail(e instanceof Error ? e.message : undefined))
  }, [t])

  return (
    <main className="dl-auth">
      <div className="dl-auth-card">
        <Logo height={34} />
        {state.kind === 'working' && (
          <>
            <span className="spinner dark" />
            <h1>{t('dl.auth.working')}</h1>
          </>
        )}
        {state.kind === 'done' && (
          <>
            <CheckCircle2 size={40} className="dl-auth-ok" />
            <h1>{t('dl.auth.doneH')}</h1>
            <p>{t('dl.auth.doneP')}</p>
            <a className="btn btn-lime" href={state.link}>
              {t('dl.auth.openApp')}
            </a>
          </>
        )}
        {state.kind === 'failed' && (
          <>
            <AlertTriangle size={40} className="dl-auth-bad" />
            <h1>{t('dl.auth.failedH')}</h1>
            <p>{t('dl.auth.failedP')}</p>
            {state.detail && <p className="dl-auth-detail">{state.detail}</p>}
          </>
        )}
      </div>
    </main>
  )
}
