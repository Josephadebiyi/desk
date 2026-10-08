import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Eye,
  EyeOff,
  HandHeart,
  ImagePlus,
  Info,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useSession } from '../lib/session'
import { useGoogleEnabled } from '../lib/providers'
import { ThemeToggle } from '../theme'
import { LangMenu } from '../i18n/Flags'
import {
  AuthError,
  GoogleNotConfiguredError,
  login,
  NotConnectedError,
  register,
  requestPasswordReset,
  resendConfirmation,
  signInWithGoogle,
  updatePassword,
  type GoogleProfile,
  type PlanId,
} from '../lib/auth'
import { isAdminHost } from '../lib/site'
import { getSignupCode, normalizeCode } from '../lib/signupCode'
import { CountrySelect, PhoneInput } from '../components/PhoneInput'
import { countryByCode } from '../lib/countries'
import { supabase } from '../lib/supabase'
import './auth.css'
import { tr, useT } from '../i18n'
import { CHURCH_CURRENCIES, currencyForRegion, formatMoney, guessCurrency, guessRegion, priceWithLocal } from '../lib/currency'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ───────────────────────── Layout (reference: split card) ───────────────────────── */

interface PanelCard {
  label: string
  icon?: ReactNode
}

function AuthLayout({
  badge,
  title,
  sub,
  cards,
  active,
  children,
}: {
  badge: string
  title: ReactNode
  sub: string
  cards: PanelCard[]
  active?: number
  children: ReactNode
}) {
  const { t } = useT()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <div className="auth">
      <div className="auth-shell">
        <aside className="auth-panel">
          <div className="auth-glow g1" />
          <div className="auth-glow g2" />
          <Link to="/" className="auth-logo" aria-label={t('auth.home')}>
            <img src="/brand/logo-lime.webp" alt="ZionDesk" />
          </Link>
          <div className="auth-panel-copy">
            <span className="auth-badge">{badge}</span>
            <h1>{title}</h1>
            <p>{sub}</p>
            <ol className="auth-steps">
              {cards.map((c, i) => {
                const state = active === undefined ? 'info' : i < active ? 'done' : i === active ? 'on' : 'next'
                return (
                  <motion.li
                    key={c.label}
                    className={`auth-step is-${state}`}
                    layout
                    transition={{ duration: 0.35 }}
                  >
                    <span className="auth-step-num">
                      {c.icon ?? (state === 'done' ? <Check size={14} strokeWidth={3} /> : i + 1)}
                    </span>
                    <span>{c.label}</span>
                  </motion.li>
                )
              })}
            </ol>
          </div>
        </aside>

        <main className="auth-main">
          <div className="auth-top">
            <Link to="/" className="auth-back">
              <ArrowLeft size={15} /> {t('common.backToSite')}
            </Link>
            <LangMenu />
            <ThemeToggle />
          </div>
          <div className="auth-body">{children}</div>
        </main>
      </div>
    </div>
  )
}

/* ───────────────────────── Form bits ───────────────────────── */

function Field({
  label,
  error,
  trailing,
  hint,
  ...input
}: { label: string; error?: string; trailing?: ReactNode; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = input.id ?? input.name
  return (
    <label className={`af ${error ? 'has-error' : ''}`} htmlFor={id}>
      <span className="af-label">{label}</span>
      <span className="af-box">
        <input id={id} aria-invalid={!!error} {...input} />
        {trailing}
      </span>
      {error ? <em className="af-error">{error}</em> : hint ? <small className="af-hint">{hint}</small> : null}
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: (string | { value: string; label: string })[]
  placeholder?: string
  error?: string
}) {
  return (
    <label className={`af ${error ? 'has-error' : ''}`}>
      <span className="af-label">{label}</span>
      <span className="af-box">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) =>
            typeof o === 'string' ? (
              <option key={o}>{o}</option>
            ) : (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ),
          )}
        </select>
      </span>
      {error && <em className="af-error">{error}</em>}
    </label>
  )
}

function PasswordField({
  value,
  onChange,
  error,
  meter,
  autoComplete,
}: {
  value: string
  onChange: (v: string) => void
  error?: string
  meter?: boolean
  autoComplete: string
}) {
  const [show, setShow] = useState(false)
  const { t } = useT()
  const checks = [/.{8,}/, /[A-Z]/, /[a-z]/, /[0-9]/]
  const score = checks.filter((r) => r.test(value)).length
  return (
    <Field
      label={t('auth.password')}
      name="password"
      type={show ? 'text' : 'password'}
      placeholder="••••••••••"
      autoComplete={autoComplete}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      trailing={
        <button type="button" className="af-icon" onClick={() => setShow((s) => !s)} aria-label={show ? t('auth.hidePw') : t('auth.showPw')}>
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      }
      hint={
        meter ? (
          <span className="af-rules">
            {t('auth.rule1')} <b className={/[A-Z]/.test(value) ? 'ok' : ''}>{t('auth.upper')}</b>,{' '}
            <b className={/[a-z]/.test(value) ? 'ok' : ''}>{t('auth.lower')}</b> {t('auth.rule2')}{' '}
            <b className={/[0-9]/.test(value) ? 'ok' : ''}>{t('auth.numbers')}</b>.
            {value && (
              <span className="af-meter" data-score={score}>
                {checks.map((_, i) => (
                  <i key={i} className={i < score ? 'on' : ''} />
                ))}
              </span>
            )}
          </span>
        ) : undefined
      }
    />
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function GoogleButton({ label, onProfile, onError, returnTo }: { label: string; onProfile: (p: GoogleProfile) => void; onError: (m: string) => void; returnTo?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className="btn-google"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          onProfile(await signInWithGoogle(returnTo))
        } catch (err) {
          onError(
            err instanceof GoogleNotConfiguredError
              ? tr('auth.googleOff')
              : err instanceof Error
                ? err.message
                : tr('auth.googleFailed'),
          )
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? <span className="spinner dark" /> : <GoogleIcon />}
      {label}
    </button>
  )
}

function Or() {
  return (
    <div className="auth-or">
      <span>{tr('auth.orWord')}</span>
    </div>
  )
}

function Notice({ message, onClose, children }: { message: string | null; onClose: () => void; children?: ReactNode }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div className="notice" role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <Info size={17} />
          <span>
            {message}
            {children}
          </span>
          <button type="button" onClick={onClose} aria-label={tr('common.dismiss')}>
            <X size={15} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Submit({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn-primary" disabled={loading}>
      {loading ? <span className="spinner" aria-label={tr('common.loading')} /> : children}
    </button>
  )
}

const AUTH_MSG = { invalid: 'auth.errInvalidLogin', unconfirmed: 'auth.errNotConfirmed', suspended: 'auth.errSuspended', rate: 'auth.errRateLimit' } as const
const notConnected = (err: unknown) =>
  err instanceof NotConnectedError
    ? tr('auth.notConnected')
    : err instanceof AuthError && err.code !== 'other'
      ? tr(AUTH_MSG[err.code])
      : err instanceof Error && err.message
        ? err.message
        : tr('common.somethingWrong')

/* ───────────────────────── Login ───────────────────────── */

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  // Staff console: email + password only (no Google, no sign-up link).
  const staffLogin = isAdminHost()
  const { t } = useT()
  const navigate = useNavigate()
  const session = useSession()
  const google = useGoogleEnabled()
  // Only same-site paths (e.g. /admin) are allowed as the post-login destination.
  const [search] = useSearchParams()
  const dest = /^\/(admin|dashboard)(\/|$)/.test(search.get('next') ?? '') ? search.get('next')! : isAdminHost() ? '/admin' : '/dashboard'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!EMAIL_RE.test(email)) next.email = t('common.invalidEmail')
    if (!password) next.password = t('auth.errPassword')
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    setNotice(null)
    setUnconfirmed(false)
    try {
      await login({ email, password })
      navigate(dest)
    } catch (err) {
      setUnconfirmed(err instanceof AuthError && err.code === 'unconfirmed')
      setNotice(notConnected(err))
    } finally {
      setLoading(false)
    }
  }

  if (session.remote && session.session && !session.loading) return <Navigate to={dest} replace />

  return (
    <AuthLayout
      badge={t('auth.login.badge')}
      title={
        <>
          {t('auth.login.title')} <em>ZionDesk</em>
        </>
      }
      sub={t('auth.login.sub')}
      cards={[
        { label: t('site.product.views.members.t'), icon: <Users size={15} /> },
        { label: t('site.product.views.giving.t'), icon: <HandHeart size={15} /> },
        { label: t('site.product.views.events.t'), icon: <CalendarDays size={15} /> },
      ]}
    >
      <h2 className="auth-title">{t('site.nav.login')}</h2>
      <form className="auth-form" onSubmit={submit} noValidate>
        <Notice message={notice} onClose={() => setNotice(null)}>
          {unconfirmed && (
            <>
              {' '}
              <button
                type="button"
                className="auth-link inline"
                onClick={() =>
                  resendConfirmation(email)
                    .then(() => (setUnconfirmed(false), setNotice(t('auth.confirmResent', { email }))))
                    .catch((err) => setNotice(notConnected(err)))
                }
              >
                {t('auth.resendConfirm')}
              </button>
            </>
          )}
        </Notice>
        <Field
          label={t('common.emailAddress')}
          name="email"
          type="email"
          placeholder={t('auth.emailPh')}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <PasswordField value={password} onChange={setPassword} error={errors.password} autoComplete="current-password" />
        <Link to="/forgot-password" className="auth-link right">
          {t('auth.forgot')}
        </Link>
        <Submit loading={loading}>{t('site.nav.login')}</Submit>
        {!staffLogin && (
          <p className="auth-switch">
            {t('auth.noAccount')} <Link to="/register">{t('auth.signUp')}</Link>
          </p>
        )}
        {google && !staffLogin && <Or />}
        {google && !staffLogin && <GoogleButton label={t('auth.continueGoogle')} returnTo={dest} onProfile={() => setNotice(notConnected(new NotConnectedError()))} onError={setNotice} />}
      </form>
    </AuthLayout>
  )
}

/* ───────────────────────── Register (3 steps) ───────────────────────── */

const PLANS: { id: PlanId; name: string; price: number }[] = [
  { id: 'essentials', name: 'Essentials', price: 8 },
  { id: 'plus', name: 'Ministry Plus', price: 19.99 },
  { id: 'max', name: 'Ministry Max', price: 39.99 },
]
const SIZES = ['s50', 's200', 's500', 's1000', 's5000', 'sMore']
const ROLES = ['senior', 'pastor', 'admin', 'finance', 'leader', 'volunteer', 'other']
const CURRENCIES: readonly string[] = CHURCH_CURRENCIES
/** "USD — US dollar" in the current language. */
const currencyLabel = (c: string, locale: string) => {
  try {
    return `${c} — ${new Intl.DisplayNames([locale], { type: 'currency' }).of(c)}`
  } catch {
    return c
  }
}

function LogoPicker({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const { t } = useT()
  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return (
    <div className="af">
      <span className="af-label">{t('auth.logo')}</span>
      <button type="button" className="af-logo" onClick={() => input.current?.click()}>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f && f.type.startsWith('image/')) onFile(f)
          }}
        />
        {preview ? <img src={preview} alt="" /> : <span className="af-logo-ico"><ImagePlus size={18} /></span>}
        <span>
          <b>{file ? file.name : t('auth.uploadLogo')}</b>
          <small>{file ? t('auth.replace') : t('auth.logoTypes')}</small>
        </span>
        {file && (
          <span
            role="button"
            tabIndex={0}
            className="af-icon"
            aria-label={t('common.remove')}
            onClick={(e) => {
              e.stopPropagation()
              onFile(null)
            }}
          >
            <X size={15} />
          </span>
        )}
      </button>
    </div>
  )
}

export function Register() {
  const [params] = useSearchParams()
  const initialPlan = (['essentials', 'plus', 'max'] as PlanId[]).includes(params.get('plan') as PlanId)
    ? (params.get('plan') as PlanId)
    : 'essentials'
  const fromTrial = params.get('trial') === '1'
  const { t, locale, lang, commLang } = useT()

  const [step, setStep] = useState(0)
  const [google, setGoogle] = useState<GoogleProfile | null>(null)
  const [acct, setAcct] = useState({ fullName: '', email: params.get('email') ?? '', password: '' })
  const [org, setOrg] = useState({
    organization: '',
    location: '',
    country: guessRegion(),
    city: '',
    phone: '',
    denomination: '',
    noDenominations: false,
    churchSize: '',
    role: '',
    currency: guessCurrency(),
    code: getSignupCode(),
  })
  const [logo, setLogo] = useState<File | null>(null)
  const [plan, setPlan] = useState<PlanId>(initialPlan)
  const [terms, setTerms] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [done, setDone] = useState<false | 'ready' | 'confirm-email'>(false)
  const session = useSession()
  const googleOn = useGoogleEnabled()

  // Back from Google (or already signed in without a church): continue with the church details.
  useEffect(() => {
    if (!session.remote || session.loading || !session.session || done) return
    if (session.church) return
    const u = session.session.user
    setGoogle((g) => g ?? { email: u.email ?? '', name: String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? ''), accessToken: '' })
    setStep((s) => (s === 0 ? 1 : s))
  }, [session.remote, session.loading, session.session, session.church, done])

  const go = (n: number) => {
    setErrors({})
    setNotice(null)
    setStep(n)
  }

  const submitAccount = (e: FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    if (!acct.fullName.trim()) err.fullName = t('auth.errName')
    if (!EMAIL_RE.test(acct.email)) err.email = t('common.invalidEmail')
    if (acct.password.length < 8 || !/[A-Z]/.test(acct.password) || !/[a-z]/.test(acct.password) || !/[0-9]/.test(acct.password))
      err.password = t('auth.errPasswordRule')
    setErrors(err)
    if (!Object.keys(err).length) go(1)
  }

  const submitOrg = (e: FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    if (!org.organization.trim()) err.organization = t('auth.errOrg')
    if (!org.city.trim() || !org.country) err.location = t('auth.errLocation')
    if (!org.noDenominations && !org.denomination.trim()) err.denomination = t('auth.errDenomination')
    if (!org.churchSize) err.churchSize = t('auth.errSize')
    if (!org.role) err.role = t('auth.errRole')
    setErrors(err)
    if (!Object.keys(err).length) go(2)
  }

  const finish = async (e: FormEvent) => {
    e.preventDefault()
    if (!terms) return setErrors({ terms: t('auth.errTerms') })
    setErrors({})
    setLoading(true)
    setNotice(null)
    try {
      const result = await register({
        provider: google ? 'google' : 'email',
        fullName: google?.name || acct.fullName,
        email: google?.email || acct.email,
        password: google ? undefined : acct.password,
        ...org,
        location: [org.city.trim(), countryByCode(org.country, locale)?.name ?? ''].filter(Boolean).join(', '),
        currency: org.currency,
        logo,
        plan,
        uiLanguage: lang,
        communicationLanguage: commLang,
      })
      if (result === 'ready') await session.refresh()
      setDone(result)
    } catch (err) {
      setNotice(notConnected(err))
    } finally {
      setLoading(false)
    }
  }

  const steps = [t('auth.reg.step1'), t('auth.reg.step2'), t('auth.reg.step3')]

  if (session.remote && session.session && session.church && !done) return <Navigate to="/dashboard" replace />

  return (
    <AuthLayout
      badge={fromTrial ? t('auth.reg.trialBadge', { days: 7 }) : t('auth.reg.badge')}
      title={t('auth.reg.title')}
      sub={t('auth.reg.sub')}
      cards={steps.map((label) => ({ label }))}
      active={step}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={done ? 'done' : step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {done === 'confirm-email' ? (
            <div className="auth-done">
              <span className="auth-done-ico">
                <Check size={26} strokeWidth={3} />
              </span>
              <h2 className="auth-title">{t('auth.reg.confirmTitle')}</h2>
              <p>{t('auth.reg.confirmSub', { email: acct.email })}</p>
            </div>
          ) : done ? (
            <div className="auth-done">
              <span className="auth-done-ico">
                <Check size={26} strokeWidth={3} />
              </span>
              <h2 className="auth-title">{t('auth.reg.doneTitle')}</h2>
              <p>{t('auth.reg.doneSub')}</p>
              <Link className="btn-primary" to="/dashboard?trial=1">
                {t('auth.reg.goDash')} <ArrowRight size={17} />
              </Link>
            </div>
          ) : step === 0 ? (
            <>
              <h2 className="auth-title">{t('auth.reg.join')}</h2>
              <form className="auth-form" onSubmit={submitAccount} noValidate>
                <Notice message={notice} onClose={() => setNotice(null)} />
                {googleOn && (
                  <>
                    <GoogleButton
                      label={t('auth.signUpGoogle')}
                      returnTo="/register?step=church"
                      onProfile={(p) => {
                        setGoogle(p)
                        setAcct((a) => ({ ...a, fullName: p.name, email: p.email }))
                        go(1)
                      }}
                      onError={setNotice}
                    />
                    <Or />
                  </>
                )}
                <Field
                  label={t('members.fullName')}
                  name="fullName"
                  placeholder={t('members.fullNamePh')}
                  autoComplete="name"
                  value={acct.fullName}
                  onChange={(e) => setAcct({ ...acct, fullName: e.target.value })}
                  error={errors.fullName}
                />
                <Field
                  label={t('common.emailAddress')}
                  name="email"
                  type="email"
                  placeholder={t('auth.emailPh')}
                  autoComplete="email"
                  value={acct.email}
                  onChange={(e) => setAcct({ ...acct, email: e.target.value })}
                  error={errors.email}
                />
                <PasswordField
                  value={acct.password}
                  onChange={(v) => setAcct({ ...acct, password: v })}
                  error={errors.password}
                  autoComplete="new-password"
                  meter
                />
                <Submit loading={false}>{t('common.continue')}</Submit>
                <p className="auth-switch">
                  {t('auth.haveAccount')} <Link to="/login">{t('site.nav.login')}</Link>
                </p>
              </form>
            </>
          ) : step === 1 ? (
            <>
              <h2 className="auth-title">{t('auth.reg.church')}</h2>
              {google && (
                <p className="auth-google-chip">
                  <GoogleIcon /> {t('auth.signedInAs')} <b>{google.email}</b>
                </p>
              )}
              <form className="auth-form" onSubmit={submitOrg} noValidate>
                <Field
                  label={t('auth.orgName')}
                  name="organization"
                  placeholder={t('auth.orgPh')}
                  autoComplete="organization"
                  value={org.organization}
                  onChange={(e) => setOrg({ ...org, organization: e.target.value })}
                  error={errors.organization}
                />
                <div className="af-row">
                  <label className="af">
                    <span className="af-label">{t('auth.country')}</span>
                    <span className="af-box">
                      <CountrySelect
                        value={org.country}
                        onChange={(c) => setOrg({ ...org, country: c, currency: currencyForRegion(c) ?? org.currency })}
                      />
                    </span>
                  </label>
                  <Field
                    label={t('auth.city')}
                    name="city"
                    placeholder={t('auth.cityPh')}
                    autoComplete="address-level2"
                    value={org.city}
                    onChange={(e) => setOrg({ ...org, city: e.target.value })}
                    error={errors.location}
                  />
                </div>
                <label className="af">
                  <span className="af-label">{t('auth.churchPhone')}</span>
                  <span className="af-box">
                    <PhoneInput key={org.country} value={org.phone} defaultCountry={org.country} name="phone" onChange={(v) => setOrg({ ...org, phone: v })} />
                  </span>
                </label>
                <Field
                  label={t('settings.profile.denomination')}
                  name="denomination"
                  placeholder={t('auth.denominationPh')}
                  value={org.noDenominations ? '' : org.denomination}
                  disabled={org.noDenominations}
                  onChange={(e) => setOrg({ ...org, denomination: e.target.value })}
                  error={errors.denomination}
                />
                <label className="auth-check">
                  <input
                    type="checkbox"
                    checked={org.noDenominations}
                    onChange={(e) => setOrg({ ...org, noDenominations: e.target.checked })}
                  />
                  <span className="auth-check-box">{org.noDenominations && <Check size={13} strokeWidth={3.5} />}</span>
                  {t('auth.noDenomination')}
                </label>
                <div className="af-row">
                  <SelectField
                    label={t('auth.size')}
                    value={org.churchSize}
                    onChange={(v) => setOrg({ ...org, churchSize: v })}
                    options={SIZES.map((s) => ({ value: s, label: t(`auth.sizes.${s}`) }))}
                    placeholder={t('auth.sizePh')}
                    error={errors.churchSize}
                  />
                  <SelectField
                    label={t('auth.yourRole')}
                    value={org.role}
                    onChange={(v) => setOrg({ ...org, role: v })}
                    options={ROLES.map((r) => ({ value: r, label: t(`auth.roles.${r}`) }))}
                    placeholder={t('auth.rolePh')}
                    error={errors.role}
                  />
                </div>
                <SelectField label={t('settings.profile.currency')} value={org.currency} onChange={(v) => setOrg({ ...org, currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: currencyLabel(c, locale) }))} />
                <LogoPicker file={logo} onFile={setLogo} />
                <Field
                  label={t('auth.promoCode')}
                  name="promo"
                  placeholder={t('auth.promoCodePh')}
                  value={org.code}
                  maxLength={32}
                  autoCapitalize="characters"
                  onChange={(e) => setOrg({ ...org, code: normalizeCode(e.target.value) })}
                />
                <div className="auth-nav">
                  {!google && (
                    <button type="button" className="btn-ghost" onClick={() => go(0)}>
                      <ArrowLeft size={16} /> {t('common.back')}
                    </button>
                  )}
                  <Submit loading={false}>{t('common.continue')}</Submit>
                </div>
              </form>
            </>
          ) : (
            <>
              <h2 className="auth-title">{t('auth.reg.plan')}</h2>
              <form className="auth-form" onSubmit={finish} noValidate>
                <Notice message={notice} onClose={() => setNotice(null)}>
                  {' '}
                  <Link to="/dashboard?trial=1" className="auth-link">
                    {t('auth.previewDash')}
                  </Link>
                </Notice>
                <div className="auth-plans" role="radiogroup" aria-label={t('settings.tabs.plan')}>
                  {PLANS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={plan === p.id}
                      className={`auth-plan ${plan === p.id ? 'is-on' : ''}`}
                      onClick={() => setPlan(p.id)}
                    >
                      <span className="auth-radio" />
                      <span className="auth-plan-copy">
                        <b>{p.name}</b>
                        <small>{t(`auth.planBlurb.${p.id}`)}</small>
                      </span>
                      <span className="auth-plan-price">
                        {(() => {
                          const { base, local } = priceWithLocal(p.id, org.currency)
                          // Billed in naira: naira first. Other local currencies are a guide; the charge is in USD.
                          return local?.billed ? (
                            <>
                              {formatMoney(local.amount, local.currency, locale)} <i className="auth-eur">{formatMoney(base.amount, base.currency, locale)}</i>
                            </>
                          ) : local ? (
                            <>
                              {formatMoney(base.amount, base.currency, locale)} <i className="auth-eur">≈ {formatMoney(local.amount, local.currency, locale)}</i>
                            </>
                          ) : (
                            formatMoney(base.amount, base.currency, locale)
                          )
                        })()}
                        <small>{t('auth.perMo')}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="auth-trial-note">
                  <Check size={15} /> {t('auth.trialNote', { days: 7 })}
                </p>
                <label className={`auth-check ${errors.terms ? 'has-error' : ''}`}>
                  <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                  <span className="auth-check-box">{terms && <Check size={13} strokeWidth={3.5} />}</span>
                  <span>
                    {t('auth.agree1')} <a href="/terms" target="_blank" rel="noreferrer">{t('auth.terms')}</a> {t('auth.agree2')} <a href="/privacy" target="_blank" rel="noreferrer">{t('auth.privacy')}</a>.
                  </span>
                </label>
                {errors.terms && <em className="af-error">{errors.terms}</em>}
                <div className="auth-nav">
                  <button type="button" className="btn-ghost" onClick={() => go(1)}>
                    <ArrowLeft size={16} /> {t('common.back')}
                  </button>
                  <Submit loading={loading}>{t('site.capture.cta')}</Submit>
                </div>
              </form>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </AuthLayout>
  )
}

/* ───────────────────────── Forgot password ───────────────────────── */

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { t } = useT()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL_RE.test(email)) return setError(t('common.invalidEmail'))
    setError(undefined)
    setLoading(true)
    setNotice(null)
    try {
      await requestPasswordReset(email)
      setNotice(t('auth.reset.sent', { email }))
    } catch (err) {
      setNotice(notConnected(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      badge={t('auth.reset.badge')}
      title={t('auth.reset.title')}
      sub={t('auth.reset.sub')}
      cards={[{ label: t('auth.reset.s1') }, { label: t('auth.reset.s2') }, { label: t('auth.reset.s3') }]}
      active={0}
    >
      <h2 className="auth-title">{t('auth.reset.heading')}</h2>
      <form className="auth-form" onSubmit={submit} noValidate>
        <Notice message={notice} onClose={() => setNotice(null)} />
        <Field
          label={t('common.emailAddress')}
          name="email"
          type="email"
          placeholder={t('auth.emailPh')}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
        />
        <Submit loading={loading}>{t('auth.reset.send')}</Submit>
        <p className="auth-switch">
          {t('auth.reset.remembered')} <Link to="/login">{t('auth.reset.back')}</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

/* ───────────────────────── New password (from the reset / invite email) ───────────────────────── */

export function ResetPassword() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { t } = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const invite = params.get('invite') === '1'
  // The email link signs the person in (token in the URL). Wait for that session; an expired or used link shows a way out.
  const [link, setLink] = useState<'checking' | 'ok' | 'expired'>(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    return hash.get('error') || params.get('error') ? 'expired' : supabase ? 'checking' : 'ok'
  })
  useEffect(() => {
    if (!supabase || link !== 'checking') return
    let done = false
    const ok = () => {
      done = true
      setLink('ok')
    }
    supabase.auth.getSession().then(({ data }) => data.session && ok())
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => s && ok())
    const timer = setTimeout(() => !done && setLink('expired'), 6000)
    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [link])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return setError(t('auth.errPasswordRule'))
    setError(undefined)
    setLoading(true)
    setNotice(null)
    try {
      await updatePassword(password)
      navigate(isAdminHost() ? '/admin' : '/dashboard', { replace: true })
    } catch (err) {
      setNotice(notConnected(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout badge={t('auth.reset.badge')} title={invite ? t('auth.newPw.inviteTitle') : t('auth.newPw.title')} sub={t('auth.newPw.sub')} cards={[{ label: t('auth.reset.s1') }, { label: t('auth.reset.s2') }, { label: t('auth.reset.s3') }]} active={2}>
      <h2 className="auth-title">{invite ? t('auth.newPw.inviteTitle') : t('auth.newPw.title')}</h2>
      {link === 'checking' ? (
        <p className="auth-switch">{t('auth.newPw.checking')}</p>
      ) : link === 'expired' ? (
        <div className="auth-form">
          <Notice message={t('auth.newPw.expired')} onClose={() => undefined} />
          <Link to="/forgot-password" className="btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
            {t('auth.newPw.requestNew')}
          </Link>
          <p className="auth-switch">
            <Link to="/login">{t('auth.reset.back')}</Link>
          </p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <Notice message={notice} onClose={() => setNotice(null)} />
          <PasswordField value={password} onChange={setPassword} error={error} autoComplete="new-password" meter />
          <Submit loading={loading}>{t('auth.newPw.save')}</Submit>
        </form>
      )}
    </AuthLayout>
  )
}
