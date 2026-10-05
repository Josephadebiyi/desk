import { motion } from 'framer-motion'
import { CalendarCheck, Check, Copy, CreditCard, HandHeart, Heart, Landmark, PartyPopper, Sparkles, UserPlus, Users } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { MemberStoreProvider, useMembers } from '../dashboard/store'
import { WorkspaceProvider, useWorkspace } from '../dashboard/workspace'
import { money, today } from '../dashboard/kit'
import { GENDERS, type Gender, type MemberInput, type Stage } from '../dashboard/types'
import type { Settings, TransferClaim } from '../dashboard/workspace'
import { remote } from '../lib/supabase'
import { LANGS, useT, type Lang } from '../i18n'
import { Flag, LangMenu } from '../i18n/Flags'
import { ThemeToggle, useTheme } from '../theme'
import './public.css'
import { giftPresets } from '../lib/currency'
import { apiUrl } from '../lib/api'
import { PhoneInput } from '../components/PhoneInput'
import { countryFromText } from '../lib/countries'

/**
 * Public, no-login pages opened from shared links and QR codes:
 *  /join/:slug?type=member|newcomer|convert&branch=…  — self-registration
 *  /give/:slug?fund=…                                  — online giving + manual bank transfer
 * The visitor picks their language at the top; it is saved with their record as the
 * communication language. Data goes into the church workspace (localStorage in the preview
 * build; an API call once the backend is connected).
 */

type JoinType = 'member' | 'newcomer' | 'convert'
const STAGE_FOR: Record<JoinType, Stage> = { member: 'Member', newcomer: 'Newcomer', convert: 'Convert' }
const JOIN_ICON: Record<JoinType, typeof Users> = { member: Users, newcomer: UserPlus, convert: Sparkles }

/* ───────── data source: local preview stores, or the API when connected ───────── */

type PubSettings = Pick<Settings, 'churchName' | 'location' | 'branches' | 'departments' | 'funds' | 'currency' | 'payout' | 'givingSlug' | 'onlineGiving'> & { onlineCurrency?: string }
interface Pub {
  settings: PubSettings
  register: (m: MemberInput, type: JoinType) => Promise<void>
  claim: (c: Omit<TransferClaim, 'id' | 'createdAt' | 'status'>) => Promise<void>
  /** Live: returns the Flutterwave checkout URL. Preview: null. */
  giveOnline: (g: { amount: number; fund: string; name: string; email: string; phone: string; language: string }) => Promise<string | null>
}
const PubCtx = createContext<Pub | null>(null)
const usePub = () => useContext(PubCtx)!

function LocalPub({ children }: { children: ReactNode }) {
  const { settings, addClaim } = useWorkspace()
  const { addMember, logCommunication } = useMembers()
  const value: Pub = {
    settings,
    register: async (m, type) => {
      const created = addMember(m)
      // Marks people who registered themselves through a link (counted on the Links page).
      logCommunication(created.id, { channel: 'Note', summary: `__selfreg:${type}:${m.language}`, date: today(), by: 'ZionDesk' })
    },
    claim: async (c) => addClaim(c),
    giveOnline: async () => null,
  }
  return <PubCtx.Provider value={value}>{children}</PubCtx.Provider>
}

async function post(path: string, body: unknown) {
  const res = await fetch(apiUrl(`/public/${path}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
}

function RemotePub({ slug, children }: { slug: string; children: ReactNode }) {
  const [settings, setSettings] = useState<PubSettings | null | 'missing'>(null)
  useEffect(() => {
    fetch(apiUrl(`/public/church/${encodeURIComponent(slug)}`))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((c) => setSettings({ churchName: c.name, location: c.location, branches: c.branches, departments: c.departments, funds: c.funds, currency: c.currency, onlineCurrency: c.onlineCurrency, payout: c.payout, givingSlug: c.slug, onlineGiving: c.onlineGiving }))
      .catch(() => setSettings('missing'))
  }, [slug])
  if (settings === null) return <div className="pub-loading" role="status" />
  if (settings === 'missing') return <PubCtx.Provider value={{ settings: { churchName: '', location: '', branches: [], departments: [], funds: [], currency: 'USD', payout: { method: 'none', bankName: '', accountName: '', accountNumber: '', routing: '', instructions: '' }, givingSlug: '' }, register: async () => {}, claim: async () => {}, giveOnline: async () => null }}>{children}</PubCtx.Provider>
  const value: Pub = {
    settings,
    register: (m, type) => post('register', { slug, type, ...m, consent: true }),
    claim: (c) => post('give-claim', { slug, ...c }),
    giveOnline: async (g) => {
      const res = await fetch(apiUrl('/public/give-online'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, ...g }) })
      const data = (await res.json().catch(() => ({}))) as { link?: string; error?: string }
      if (!res.ok || !data.link) throw new Error(data.error ?? 'Request failed')
      return data.link
    },
  }
  return <PubCtx.Provider value={value}>{children}</PubCtx.Provider>
}

function Frame({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  const { settings } = usePub()
  const { t } = useT()
  return (
    <div className="pub">
      <header className="pub-top">
        <span className="pub-church">
          <span className="pub-mono" aria-hidden="true">
            {settings.churchName
              .split(/\s+/)
              .map((w) => w[0])
              .slice(0, 2)
              .join('')}
          </span>
          <span>
            <b>{settings.churchName}</b>
            <small>{settings.location}</small>
          </span>
        </span>
        <span className="pub-tools">
          <LangMenu />
          <ThemeToggle />
        </span>
      </header>
      <main className="pub-main">{children}</main>
      <footer className="pub-foot">
        <Link to="/">
          {t('pub.poweredBy')} <img src={theme === 'dark' ? '/brand/logo-lime.webp' : '/brand/logo-color.webp'} alt="ZionDesk" />
        </Link>
      </footer>
    </div>
  )
}

function Done({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <motion.div className="pub-card pub-done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <span className="pub-done-ico">
        <Check size={28} strokeWidth={3} />
      </span>
      <h1>{title}</h1>
      <p>{body}</p>
      {children}
    </motion.div>
  )
}

/* ───────────────────────── Registration ───────────────────────── */

function JoinForm() {
  const [params] = useSearchParams()
  const { t, lang } = useT()
  const { settings, register } = usePub()
  const [sending, setSending] = useState(false)
  const raw = params.get('type')
  const type: JoinType = raw === 'newcomer' || raw === 'convert' ? raw : 'member'
  const fixedBranch = params.get('branch') ?? ''
  const Icon = JOIN_ICON[type]

  const [f, setF] = useState({
    fullName: '',
    phone: '',
    whatsapp: '',
    sameWa: true,
    email: '',
    gender: '' as Gender,
    dob: '',
    address: '',
    branch: fixedBranch || settings.branches[0] || '',
    department: '',
    heard: '',
    decision: today(),
    wantsCall: true,
    wantsClass: true,
    notes: '',
    consent: false,
  })
  const [language, setLanguage] = useState<Lang | null>(null)
  const commLang = language ?? lang
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    if (!f.fullName.trim()) err.fullName = t('pub.errName')
    if (!f.phone.trim() && !f.email.trim()) err.phone = t('pub.errContact')
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) err.email = t('common.invalidEmail')
    if (!f.consent) err.consent = t('pub.errConsent')
    setErrors(err)
    if (Object.keys(err).length) return
    const extra = [
      type === 'newcomer' && f.heard && `${t('pub.heard')}: ${f.heard}`,
      type === 'newcomer' && f.wantsCall && t('pub.wantsCall'),
      type === 'convert' && `${t('pub.decisionDate')}: ${f.decision}`,
      type === 'convert' && f.wantsClass && t('pub.wantsClass'),
      f.notes.trim(),
    ].filter(Boolean)
    const input: MemberInput = {
      fullName: f.fullName.trim(),
      phone: f.phone.trim(),
      whatsapp: f.sameWa ? f.phone.trim() : f.whatsapp.trim(),
      email: f.email.trim(),
      gender: f.gender,
      dob: f.dob,
      address: f.address.trim(),
      branch: f.branch,
      department: type === 'member' ? f.department : '',
      membershipStatus: 'Active',
      dateJoined: today(),
      stage: STAGE_FOR[type],
      notes: extra.join(' · '),
      language: commLang,
    }
    setSending(true)
    try {
      await register(input, type)
    } catch (ex) {
      setErrors({ consent: ex instanceof Error ? ex.message : String(ex) })
      return
    } finally {
      setSending(false)
    }
    setDone(f.fullName.trim().split(/\s+/)[0])
  }

  if (done)
    return (
      <Done title={t(`pub.join.${type}.done`, { name: done })} body={t('pub.join.doneBody', { church: settings.churchName })}>
        <p className="pub-done-lang">
          <Flag lang={commLang} size={20} /> {t('pub.weWillWrite', { language: LANGS.find((l) => l.code === commLang)!.native })}
        </p>
      </Done>
    )

  const field = (k: 'fullName' | 'phone' | 'email' | 'address' | 'whatsapp', label: string, props: Record<string, unknown> = {}) => (
    <label className={`pub-field ${errors[k] ? 'has-error' : ''}`}>
      <span>{label}</span>
      <input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} />
      {errors[k] && <em>{errors[k]}</em>}
    </label>
  )

  // Phone numbers in international format, defaulting to the church's country.
  const homeCountry = countryFromText(settings.location)?.code
  const phoneField = (k: 'phone' | 'whatsapp', label: string) => (
    <label className={`pub-field ${errors[k] ? 'has-error' : ''}`}>
      <span>{label}</span>
      <span className="pub-phone">
        <PhoneInput value={f[k]} onChange={(v) => set(k, v)} defaultCountry={homeCountry} name={k} invalid={!!errors[k]} />
      </span>
      {errors[k] && <em>{errors[k]}</em>}
    </label>
  )

  return (
    <motion.form className="pub-card" onSubmit={submit} noValidate initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <span className={`pub-badge is-${type}`}>
        <Icon size={20} />
      </span>
      <h1>{t(`pub.join.${type}.title`, { church: settings.churchName })}</h1>
      <p className="pub-sub">{t(`pub.join.${type}.sub`)}</p>

      <div className="pub-grid">
        {field('fullName', t('pub.fullName'), { autoComplete: 'name', placeholder: t('pub.fullNamePh') })}
        {phoneField('phone', t('pub.phone'))}
        {field('email', t('pub.email'), { type: 'email', autoComplete: 'email', placeholder: 'name@example.com' })}
        <label className="pub-field">
          <span>{t('pub.gender')}</span>
          <select value={f.gender} onChange={(e) => set('gender', e.target.value as Gender)}>
            <option value="">—</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {t(`enums.gender.${g}`)}
              </option>
            ))}
          </select>
        </label>
        {!f.sameWa && phoneField('whatsapp', t('pub.whatsapp'))}
        {type !== 'newcomer' && (
          <label className="pub-field">
            <span>{t('pub.dob')}</span>
            <input type="date" value={f.dob} onChange={(e) => set('dob', e.target.value)} />
          </label>
        )}
        {field('address', t('pub.address'), { autoComplete: 'street-address' })}
        {!fixedBranch && settings.branches.length > 1 && (
          <label className="pub-field">
            <span>{t('pub.branch')}</span>
            <select value={f.branch} onChange={(e) => set('branch', e.target.value)}>
              {settings.branches.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
        )}
        {type === 'member' && (
          <label className="pub-field">
            <span>{t('pub.department')}</span>
            <select value={f.department} onChange={(e) => set('department', e.target.value)}>
              <option value="">{t('pub.notYet')}</option>
              {settings.departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        {type === 'newcomer' && (
          <label className="pub-field">
            <span>{t('pub.heard')}</span>
            <select value={f.heard} onChange={(e) => set('heard', e.target.value)}>
              <option value="">—</option>
              {(['friend', 'social', 'online', 'event', 'walkin', 'other'] as const).map((h) => (
                <option key={h} value={t(`pub.heardOpt.${h}`)}>
                  {t(`pub.heardOpt.${h}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === 'convert' && (
          <label className="pub-field">
            <span>{t('pub.decisionDate')}</span>
            <input type="date" value={f.decision} onChange={(e) => set('decision', e.target.value)} />
          </label>
        )}
      </div>

      <label className="pub-check">
        <input type="checkbox" checked={f.sameWa} onChange={(e) => set('sameWa', e.target.checked)} /> {t('pub.sameWa')}
      </label>
      {type === 'newcomer' && (
        <label className="pub-check">
          <input type="checkbox" checked={f.wantsCall} onChange={(e) => set('wantsCall', e.target.checked)} /> {t('pub.wantsCall')}
        </label>
      )}
      {type === 'convert' && (
        <label className="pub-check">
          <input type="checkbox" checked={f.wantsClass} onChange={(e) => set('wantsClass', e.target.checked)} /> {t('pub.wantsClass')}
        </label>
      )}

      <div className="pub-lang">
        <b>{t('pub.langQ')}</b>
        <small>{t('pub.langHint')}</small>
        <div className="pub-lang-row" role="radiogroup" aria-label={t('lang.commLanguage')}>
          {LANGS.map((l) => (
            <button key={l.code} type="button" role="radio" aria-checked={commLang === l.code} className={commLang === l.code ? 'is-on' : ''} onClick={() => setLanguage(l.code)}>
              <Flag lang={l.code} size={22} />
              {l.native}
            </button>
          ))}
        </div>
      </div>

      <label className="pub-field">
        <span>
          {t('pub.notes')} <i>({t('common.optional')})</i>
        </span>
        <textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('pub.notesPh')} />
      </label>

      <label className={`pub-check ${errors.consent ? 'has-error' : ''}`}>
        <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} /> {t('pub.consent', { church: settings.churchName })}
      </label>
      {errors.consent && <em className="pub-err">{errors.consent}</em>}

      <button type="submit" className="pub-go" disabled={sending}>
        {t(`pub.join.${type}.cta`)}
      </button>
    </motion.form>
  )
}

/* ───────────────────────── Giving ───────────────────────── */

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useT()
  const [ok, setOk] = useState(false)
  if (!value) return null
  return (
    <div className="pub-copy">
      <span>
        <small>{label}</small>
        <b>{value}</b>
      </span>
      <button
        type="button"
        aria-label={t('pub.copy', { what: label })}
        onClick={() => {
          // Only confirm once the copy succeeded (it can be blocked by the browser).
          void navigator.clipboard?.writeText(value).then(() => {
            setOk(true)
            setTimeout(() => setOk(false), 1400)
          }, () => {})
        }}
      >
        {ok ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  )
}

function GiveForm() {
  const [params] = useSearchParams()
  const { t, lang } = useT()
  const { settings, claim, giveOnline } = usePub()
  const [sending, setSending] = useState(false)
  const p = settings.payout
  const hasBank = !!p.accountNumber
  const online = remote ? !!settings.onlineGiving : p.method === 'ziondesk'
  const paidParam = params.get('paid')
  const [method, setMethod] = useState<'online' | 'bank'>(online ? 'online' : 'bank')
  const presetFund = params.get('fund') ?? ''
  const [fund, setFund] = useState(presetFund && settings.funds.includes(presetFund) ? presetFund : settings.funds[0] ?? 'Offering')
  const [amount, setAmount] = useState('25')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<'claim' | 'online' | ''>('')
  const reference = useMemo(() => {
    const who = (name.trim().split(/\s+/)[0] || 'GIFT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
    return `${who}-${fund.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}`
  }, [name, fund])
  const n = Number(amount)

  const submitClaim = async (e: FormEvent) => {
    e.preventDefault()
    if (!n || n <= 0) return setError(t('pub.errAmount'))
    if (!name.trim()) return setError(t('pub.errName'))
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(t('common.invalidEmail'))
    setSending(true)
    try {
      await claim({ date: today(), name: name.trim(), email: email.trim(), phone: phone.trim(), amount: n, fund, reference, language: lang })
      setDone('claim')
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setSending(false)
    }
  }

  if (done === 'claim')
    return <Done title={t('pub.give.claimDone', { name: name.trim().split(/\s+/)[0] })} body={t('pub.give.claimDoneBody', { amount: money(n, settings.currency, n % 1 ? 2 : 0), church: settings.churchName })} />
  if (paidParam === '1') return <Done title={t('pub.give.paidTitle')} body={t('pub.give.paidBody', { church: settings.churchName })} />
  if (done === 'online') return <Done title={t('pub.give.onlineSoon')} body={t('pub.give.onlineSoonBody')} />

  // Card / mobile-money gifts are collected in a currency Flutterwave supports (USD fallback); bank transfers use the church's own.
  const cur = method === 'online' ? settings.onlineCurrency ?? settings.currency : settings.currency
  return (
    <motion.div className="pub-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <span className="pub-badge is-giving">
        <HandHeart size={20} />
      </span>
      <h1>{t('pub.give.title', { church: settings.churchName })}</h1>
      <p className="pub-sub">{t('pub.give.sub')}</p>

      <div className="pub-amounts" role="radiogroup" aria-label={t('common.amount')}>
        {giftPresets(cur).map((a) => (
          <button key={a} type="button" role="radio" aria-checked={amount === String(a)} className={amount === String(a) ? 'is-on' : ''} onClick={() => setAmount(String(a))}>
            {money(a, cur)}
          </button>
        ))}
        <label className="pub-amount-other">
          <span className="sr-only">{t('pub.give.other')}</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={t('pub.give.other')} />
        </label>
      </div>

      <label className="pub-field">
        <span>{t('pub.give.fund')}</span>
        <select value={fund} onChange={(e) => setFund(e.target.value)}>
          {settings.funds.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>

      {(online || hasBank) && (
        <div className="pub-methods" role="tablist">
          {online && (
            <button type="button" role="tab" aria-selected={method === 'online'} className={method === 'online' ? 'is-on' : ''} onClick={() => setMethod('online')}>
              <CreditCard size={17} /> {t('pub.give.online')}
            </button>
          )}
          {hasBank && (
            <button type="button" role="tab" aria-selected={method === 'bank'} className={method === 'bank' ? 'is-on' : ''} onClick={() => setMethod('bank')}>
              <Landmark size={17} /> {t('pub.give.bank')}
            </button>
          )}
        </div>
      )}

      {method === 'online' && online && (
        <form
          className="pub-bank-flow"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault()
            if (!n || n <= 0) return setError(t('pub.errAmount'))
            if (!name.trim()) return setError(t('pub.errName'))
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(t('pub.give.errEmail'))
            setError('')
            setSending(true)
            try {
              const link = await giveOnline({ amount: n, fund, name: name.trim(), email: email.trim(), phone: phone.trim(), language: lang })
              if (link) window.location.href = link // Flutterwave secure checkout
              else setDone('online')
            } catch (ex) {
              setError(ex instanceof Error ? ex.message : String(ex))
              setSending(false)
            }
          }}
        >
          <div className="pub-grid">
            <label className="pub-field">
              <span>{t('pub.fullName')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label className="pub-field">
              <span>{t('pub.email')}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
          </div>
          <button type="submit" className="pub-go" disabled={sending}>
            <Heart size={17} /> {t('pub.give.giveAmount', { amount: n > 0 ? money(n, cur, n % 1 ? 2 : 0) : '' })}
          </button>
          <small className="pub-note pub-secure">{t('pub.give.secure')}</small>
        </form>
      )}
      {paidParam === '0' && <em className="pub-err">{t('pub.give.paidFailed')}</em>}

      {method === 'bank' && hasBank && (
        <form className="pub-bank-flow" onSubmit={submitClaim} noValidate>
          <div className="pub-bank">
            <CopyRow label={t('pub.give.bankName')} value={p.bankName} />
            <CopyRow label={t('pub.give.accountName')} value={p.accountName || settings.churchName} />
            <CopyRow label={t('pub.give.accountNumber')} value={p.accountNumber} />
            <CopyRow label={t('pub.give.routing')} value={p.routing} />
            <CopyRow label={t('pub.give.reference')} value={reference} />
          </div>
          {p.instructions && <p className="pub-note">{p.instructions}</p>}
          <p className="pub-note">{t('pub.give.bankSteps')}</p>
          <div className="pub-grid">
            <label className="pub-field">
              <span>{t('pub.fullName')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label className="pub-field">
              <span>
                {t('pub.email')} <i>({t('common.optional')})</i>
              </span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="pub-field">
              <span>
                {t('pub.phone')} <i>({t('common.optional')})</i>
              </span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </label>
          </div>
          <button type="submit" className="pub-go" disabled={sending}>
            <Check size={17} /> {t('pub.give.sent')}
          </button>
        </form>
      )}

      {!online && !hasBank && <p className="pub-note">{t('pub.give.notReady')}</p>}
      {error && <em className="pub-err">{error}</em>}
    </motion.div>
  )
}

function Unknown() {
  const { t } = useT()
  return <Done title={t('pub.notFound')} body={t('pub.notFoundBody')} />
}

function Public({ kind }: { kind: 'join' | 'give' | 'checkin' }) {
  const { slug } = useParams()
  const { settings } = usePub()
  // Preview build: one workspace per browser. With the backend this looks the church up by slug.
  const known = !!settings.churchName && (!slug || slug === settings.givingSlug)
  return <Frame>{!known ? <Unknown /> : kind === 'join' ? <JoinForm /> : kind === 'checkin' ? <CheckinForm /> : <GiveForm />}</Frame>
}

/* ───────────────────────── Sunday check-in ───────────────────────── */

function CheckinForm() {
  const { slug = '' } = useParams()
  const { t } = useT()
  const { settings } = usePub()
  const key = `ziondesk-checkin-${slug}`
  const [saved, setSaved] = useState<{ token: string; firstName: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null')
    } catch {
      return null
    }
  })
  const [byEmail, setByEmail] = useState(false)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'missing'>('idle')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const send = async (body: Record<string, string>) => {
    if (!remote) return setError(t('pub.checkin.previewOnly'))
    setState('busy')
    setError('')
    try {
      const res = await fetch(apiUrl('/checkin'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, date: today(), ...body }) })
      const data = (await res.json().catch(() => ({}))) as { found?: boolean; firstName?: string; token?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      if (!data.found) {
        if (body.token) {
          localStorage.removeItem(key)
          setSaved(null)
          return setState('idle')
        }
        return setState('missing')
      }
      setName(data.firstName ?? '')
      try {
        localStorage.setItem(key, JSON.stringify({ token: data.token, firstName: data.firstName }))
      } catch {
        /* private mode */
      }
      setState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('idle')
    }
  }

  if (state === 'done')
    return (
      <Done title={t('pub.checkin.done', { name })} body={t('pub.checkin.doneSub')}>
        <PartyPopper size={26} aria-hidden />
      </Done>
    )
  if (state === 'missing')
    return (
      <Done title={t('pub.checkin.notFound')} body={t('pub.checkin.notFoundSub')}>
        <div className="pub-row-actions">
          <Link className="btn btn-primary" to={`/join/${slug}?type=newcomer`}>
            {t('pub.checkin.register')}
          </Link>
          <button type="button" className="btn btn-outline" onClick={() => setState('idle')}>
            {t('pub.checkin.tryAgain')}
          </button>
        </div>
      </Done>
    )

  return (
    <motion.form
      className="pub-card"
      noValidate
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(e) => {
        e.preventDefault()
        if (saved) return void send({ token: saved.token })
        if (byEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) : phone.replace(/\D/g, '').length < 7) return setError(t('pub.checkin.errContact'))
        void send(byEmail ? { email: email.trim() } : { phone })
      }}
    >
      <span className="pub-badge is-member">
        <CalendarCheck size={20} />
      </span>
      <h1>{saved ? t('pub.checkin.back', { name: saved.firstName }) : t('pub.checkin.title', { church: settings.churchName })}</h1>
      <p className="pub-sub">{t('pub.checkin.sub')}</p>
      {!saved && (
        <div className="pub-grid">
          {byEmail ? (
            <label className="pub-field">
              <span>{t('pub.email')}</span>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </label>
          ) : (
            <label className="pub-field">
              <span>{t('pub.phone')}</span>
              <span className="pub-phone">
                <PhoneInput value={phone} onChange={setPhone} defaultCountry={countryFromText(settings.location)?.code} name="phone" />
              </span>
            </label>
          )}
          <button type="button" className="pub-link" onClick={() => setByEmail(!byEmail)}>
            {byEmail ? t('pub.checkin.usePhone') : t('pub.checkin.useEmail')}
          </button>
        </div>
      )}
      {error && <p className="pub-err">{error}</p>}
      <button type="submit" className="pub-go" disabled={state === 'busy'}>
        {state === 'busy' ? <span className="spinner" /> : <CalendarCheck size={18} />} {saved ? t('pub.checkin.tap') : t('pub.checkin.submit')}
      </button>
      {saved && (
        <button
          type="button"
          className="pub-link"
          onClick={() => {
            localStorage.removeItem(key)
            setSaved(null)
          }}
        >
          {t('pub.checkin.notYou')}
        </button>
      )}
    </motion.form>
  )
}

function PublicPage({ kind }: { kind: 'join' | 'give' | 'checkin' }) {
  const { slug = '' } = useParams()
  if (remote)
    return (
      <RemotePub slug={slug}>
        <Public kind={kind} />
      </RemotePub>
    )
  return (
    <MemberStoreProvider>
      <WorkspaceProvider>
        <LocalPub>
          <Public kind={kind} />
        </LocalPub>
      </WorkspaceProvider>
    </MemberStoreProvider>
  )
}

export const JoinPage = () => <PublicPage kind="join" />
export const GivePage = () => <PublicPage kind="give" />
export const CheckinPage = () => <PublicPage kind="checkin" />
