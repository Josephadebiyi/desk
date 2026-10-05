import { Camera, Check, CreditCard, Database, Download, Languages, Mail, MessageCircle, MessageSquareText, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, apiChurch, apiUrl } from '../lib/api'
import { updatePassword, uploadLogo } from '../lib/auth'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { GoogleMeetLogo } from '../components/GoogleMeet'
import { PageHead, Tabs, planName, tEnum } from './kit'
import { useMembers } from './store'
import { type Role } from './types'
import { useWorkspace, type PlanId, type Settings as S } from './workspace'
import { useAi } from '../ai/store'
import { PROVIDERS } from '../ai/providers'
import { USAGE_LABEL, type ProviderPref, type UsageFeature } from '../ai/types'
import { LANGS, useT } from '../i18n'
import { billingCurrency, CHURCH_CURRENCIES, chargeCurrency, formatMoney, PLAN_PRICES, planPrice, priceWithLocal } from '../lib/currency'
import { Flag, LangCards } from '../i18n/Flags'
import { getSignupCode } from '../lib/signupCode'
import { ONLINE_GIVING } from '../lib/features'

const ROLES: Role[] = ['admin', 'finance', 'leader']

type Tab = 'account' | 'language' | 'profile' | 'structure' | 'team' | 'plan' | 'ai' | 'integrations' | 'data'
const CURRENCIES: readonly string[] = CHURCH_CURRENCIES

function Saved({ show }: { show: boolean }) {
  const { t } = useT()
  return show ? (
    <span className="st-saved">
      <Check size={14} /> {t('common.saved')}
    </span>
  ) : null
}

/** Per-user language preferences. Open to every role. */
function LanguageSettings() {
  const { t, lang, commLang, savePrefs } = useT()
  const uses = ['emails', 'notifications', 'invitations', 'messages', 'ellen'] as const
  return (
    <div className="d-two">
      <section className="d-panel d-form d-span-2">
        <div className="d-panel-head">
          <h2>
            <Languages size={17} /> {t('lang.title')}
          </h2>
        </div>
        <p className="d-hint-box">{t('settings.lang.stored')}</p>
        <div className="st-lang">
          <b>{t('lang.appLanguage')}</b>
          <small>{t('lang.appLanguageHint')}</small>
          <LangCards value={lang} label={t('lang.appLanguage')} onChange={(l) => savePrefs(l, commLang)} />
        </div>
        <div className="st-lang">
          <b>{t('lang.commLanguage')}</b>
          <small>{t('lang.commLanguageHint')}</small>
          <LangCards value={commLang} label={t('lang.commLanguage')} onChange={(l) => savePrefs(lang, l)} />
        </div>
      </section>
      <section className="d-panel">
        <div className="d-panel-head">
          <h2>{t('settings.lang.usedFor')}</h2>
        </div>
        <ul className="st-perms">
          {uses.map((u) => (
            <li key={u}>
              <b>{t(`settings.lang.use.${u}.title`)}</b> {t(`settings.lang.use.${u}.text`)}
            </li>
          ))}
        </ul>
      </section>
      <section className="d-panel">
        <div className="d-panel-head">
          <h2>{t('settings.lang.current')}</h2>
        </div>
        <div className="st-lang-now">
          <span>
            <Flag lang={lang} size={34} />
            <small>{t('lang.appLanguage')}</small>
            <b>{LANGS.find((l) => l.code === lang)?.native}</b>
          </span>
          <span>
            <Flag lang={commLang} size={34} />
            <small>{t('lang.commLanguage')}</small>
            <b>{LANGS.find((l) => l.code === commLang)?.native}</b>
          </span>
        </div>
      </section>
    </div>
  )
}

/** Downloads a JSON export from the API (signed-in). */
async function download(path: string, name: string) {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined
  const res = await fetch(apiUrl(path), { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(path.startsWith('/church') ? { 'x-church-id': apiChurch() } : {}) } })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`)
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Picture + preview used for profile photos and church logos. */
function PhotoPicker({ url, fallback, label, round, onPick, onRemove, busy }: { url?: string | null; fallback: string; label: string; round?: boolean; onPick: (f: File) => void; onRemove?: () => void; busy?: boolean }) {
  const { t } = useT()
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="st-photo">
      <span className={`st-photo-img ${round ? 'is-round' : ''}`}>{url ? <img src={url} alt="" /> : fallback}</span>
      <div>
        <b>{label}</b>
        <small>{t('settings.account.photoHint')}</small>
        <span className="st-photo-btns">
          <button type="button" className="d-btn" disabled={busy} onClick={() => input.current?.click()}>
            <Camera size={15} /> {busy ? t('common.loading') : url ? t('settings.account.photoChange') : t('settings.account.photoUpload')}
          </button>
          {url && onRemove && (
            <button type="button" className="d-btn d-danger" disabled={busy} onClick={onRemove}>
              <Trash2 size={15} /> {t('settings.account.photoRemove')}
            </button>
          )}
        </span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onPick(f)
        }}
      />
    </div>
  )
}

/** Personal account: name, photo, password, and data-protection rights (export / erase). */
function Account() {
  const session = useSession()
  const { t } = useT()
  const navigate = useNavigate()
  const [name, setName] = useState(session.name)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState('')
  const [ok, setOk] = useState('')
  const [error, setError] = useState('')
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setError('')
    setBusy(key)
    try {
      await fn()
      setOk(key)
      setTimeout(() => setOk(''), 2500)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setError(m === 'IMAGE_TYPE' ? t('settings.account.imageType') : m === 'IMAGE_SIZE' ? t('settings.account.imageSize') : m === 'SOLE_ADMIN' ? t('settings.account.soleAdmin') : m)
    } finally {
      setBusy('')
    }
  }
  if (!session.remote) return <p className="d-hint-box">{t('settings.account.preview')}</p>
  const google = (session.session?.user.app_metadata?.providers as string[] | undefined)?.includes('google')
  return (
    <div className="d-two">
      <section className="d-panel d-form">
        <div className="d-panel-head">
          <h2>{t('settings.account.title')}</h2>
          <Saved show={ok === 'name' || ok === 'photo'} />
        </div>
        <PhotoPicker
          round
          url={session.avatarUrl}
          fallback={(session.name || session.email).slice(0, 1).toUpperCase()}
          label={t('settings.account.photo')}
          busy={busy === 'photo'}
          onPick={(f) => run('photo', () => session.updateProfile({ avatar: f }))}
          onRemove={() => run('photo', () => session.updateProfile({ avatar: null }))}
        />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) run('name', () => session.updateProfile({ name }))
          }}
        >
          <label className="d-field">
            <span>{t('settings.account.name')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </label>
          <label className="d-field">
            <span>{t('settings.account.email')}</span>
            <input value={session.email} disabled />
          </label>
          <div className="d-form-actions">
            <button type="submit" className="d-btn d-btn-ink" disabled={busy !== ''}>
              <Check size={15} /> {t('settings.profile.save')}
            </button>
          </div>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (pw.length >= 8) run('pw', () => updatePassword(pw).then(() => setPw('')))
          }}
        >
          <label className="d-field">
            <span>{google ? t('settings.account.setPassword') : t('settings.account.newPassword')}</span>
            <input type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t('settings.account.passwordHint')} />
          </label>
          <div className="d-form-actions">
            {ok === 'pw' && <Saved show />}
            <button type="submit" className="d-btn" disabled={busy !== '' || pw.length < 8}>
              {t('settings.account.updatePassword')}
            </button>
          </div>
        </form>
        {error && <p className="d-errors">{error}</p>}
      </section>
      <section className="d-panel d-form">
        <div className="d-panel-head">
          <h2>
            <Database size={17} /> {t('settings.account.privacyTitle')}
          </h2>
        </div>
        <p className="d-notes">{t('settings.account.privacyText')}</p>
        <div className="d-form-actions st-left">
          <button type="button" className="d-btn" disabled={busy !== ''} onClick={() => run('export', () => download('/account/export', 'ziondesk-my-data'))}>
            <Download size={15} /> {busy === 'export' ? t('common.loading') : t('settings.account.export')}
          </button>
        </div>
        <p className="d-notes">
          {t('settings.account.rightsMore')} <Link to="/legal" className="d-link">{t('settings.account.legalLink')}</Link>
        </p>
        <div className="st-danger">
          <b>{t('settings.account.deleteTitle')}</b>
          <small>{t('settings.account.deleteText')}</small>
          <button
            type="button"
            className="d-btn d-danger"
            disabled={busy !== ''}
            onClick={() => {
              if (!window.confirm(t('settings.account.deleteConfirm'))) return
              run('delete', async () => {
                await api('/account/delete', {})
                await session.signOut()
                navigate('/')
              })
            }}
          >
            <Trash2 size={15} /> {busy === 'delete' ? t('common.loading') : t('settings.account.delete')}
          </button>
        </div>
      </section>
    </div>
  )
}

function Profile() {
  const { settings, updateSettings, live } = useWorkspace()
  const session = useSession()
  const { t } = useT()
  const [f, setF] = useState(settings)
  const [ok, setOk] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState('')
  const field = (k: keyof S, label: string, type = 'text') => (
    <label className="d-field">
      <span>{label}</span>
      <input type={type} value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  )
  return (
    <form
      className="d-panel d-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (!f.churchName.trim()) return
        updateSettings({ churchName: f.churchName.trim(), location: f.location, phone: f.phone, email: f.email, denomination: f.denomination, currency: f.currency })
        setOk(true)
        setTimeout(() => setOk(false), 2000)
      }}
    >
      <div className="d-panel-head">
        <h2>{t('settings.profile.title')}</h2>
        <Saved show={ok} />
      </div>
      {live && session.church && (
        <PhotoPicker
          url={settings.logoUrl}
          fallback={settings.churchName.slice(0, 1).toUpperCase()}
          label={t('settings.profile.logo')}
          busy={logoBusy}
          onPick={async (file) => {
            setLogoError('')
            if (!/^image\//.test(file.type) || file.size > 3 * 1024 * 1024) return setLogoError(t('settings.account.imageSize'))
            setLogoBusy(true)
            try {
              const url = await uploadLogo(session.church!.id, file)
              updateSettings({ logoUrl: url })
            } catch (e) {
              setLogoError(e instanceof Error ? e.message : String(e))
            } finally {
              setLogoBusy(false)
            }
          }}
          onRemove={() => updateSettings({ logoUrl: null })}
        />
      )}
      {logoError && <p className="d-errors">{logoError}</p>}
      <div className="d-grid">
        {field('churchName', t('settings.profile.churchName'))}
        {field('location', t('settings.profile.location'))}
        {field('phone', t('settings.profile.phone'), 'tel')}
        {field('email', t('settings.profile.email'), 'email')}
        {field('denomination', t('settings.profile.denomination'))}
        <label className="d-field">
          <span>{t('settings.profile.currency')}</span>
          <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {chargeCurrency(f.currency) !== f.currency && <small className="d-muted">{t('settings.profile.currencyFallback', { currency: f.currency })}</small>}
        </label>
      </div>
      <div className="d-form-actions">
        <button type="submit" className="d-btn d-btn-ink">
          <Check size={15} /> {t('settings.profile.save')}
        </button>
      </div>
    </form>
  )
}

function ListEditor({ title, items, onChange, placeholder }: { title: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [v, setV] = useState('')
  const { t } = useT()
  return (
    <section className="d-panel">
      <div className="d-panel-head">
        <h2>{title}</h2>
      </div>
      <div className="st-chips">
        {items.map((x) => (
          <span key={x} className="st-chip">
            {x}
            <button type="button" aria-label={t('settings.removeX', { name: x })} onClick={() => onChange(items.filter((y) => y !== x))}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <form
        className="st-add"
        onSubmit={(e) => {
          e.preventDefault()
          const val = v.trim()
          if (val && !items.some((x) => x.toLowerCase() === val.toLowerCase())) onChange([...items, val])
          setV('')
        }}
      >
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        <button type="submit" className="d-circle d-circle-ink" aria-label={t('common.add')}>
          <Plus size={15} />
        </button>
      </form>
    </section>
  )
}

function Structure() {
  const { settings, updateSettings } = useWorkspace()
  const { t } = useT()
  return (
    <div className="d-two">
      <ListEditor title={t('settings.structure.branches')} items={settings.branches} onChange={(branches) => updateSettings({ branches })} placeholder={t('settings.structure.addBranch')} />
      <ListEditor title={t('settings.structure.departments')} items={settings.departments} onChange={(departments) => updateSettings({ departments })} placeholder={t('settings.structure.addDept')} />
      <ListEditor title={t('settings.structure.funds')} items={settings.funds} onChange={(funds) => updateSettings({ funds })} placeholder={t('settings.structure.addFund')} />
    </div>
  )
}

function Team() {
  const { team, inviteTeam, updateTeam, removeTeam } = useWorkspace()
  const [f, setF] = useState<{ name: string; email: string; role: Role }>({ name: '', email: '', role: 'leader' })
  const [error, setError] = useState('')
  const { t } = useT()
  return (
    <div className="d-two">
      <section className="d-panel d-span-2">
        <div className="d-panel-head">
          <h2>{t('settings.team.title')}</h2>
        </div>
        <ul className="d-list">
          {team.map((tm) => (
            <li key={tm.id}>
              <span className="d-init d-init-p" style={{ width: 34, height: 34, fontSize: 12 }}>
                {tm.name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div>
                <b>{tm.name}</b>
                <small>{tm.email}</small>
              </div>
              {tm.status === 'Invited' && <span className="d-pill">{t('settings.team.pending')}</span>}
              <select className="st-role" value={tm.role} onChange={(e) => updateTeam(tm.id, { role: e.target.value as Role })} aria-label={t('settings.team.roleFor', { name: tm.name })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {tEnum('role', r)}
                  </option>
                ))}
              </select>
              <button type="button" className="d-circle d-circle-sm" aria-label={t('settings.removeX', { name: tm.name })} onClick={() => removeTeam(tm.id)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <form
        className="d-panel d-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!f.name.trim()) return setError(t('settings.team.errName'))
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setError(t('common.invalidEmail'))
          setError('')
          inviteTeam({ name: f.name.trim(), email: f.email.trim(), role: f.role })
          setF({ name: '', email: '', role: 'leader' })
        }}
      >
        <div className="d-panel-head">
          <h2>{t('settings.team.invite')}</h2>
        </div>
        <label className="d-field">
          <span>{t('common.name')}</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="d-field">
          <span>{t('common.emailAddress')}</span>
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <label className="d-field">
          <span>{t('settings.team.role')}</span>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tEnum('role', r)}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="d-errors">{error}</p>}
        <div className="d-form-actions">
          <button type="submit" className="d-btn d-btn-ink">
            <Plus size={15} /> {t('settings.team.send')}
          </button>
        </div>
      </form>
      <section className="d-panel">
        <div className="d-panel-head">
          <h2>{t('settings.team.perms')}</h2>
        </div>
        <ul className="st-perms">
          {ROLES.map((r) => (
            <li key={r}>
              <b>{tEnum('role', r)}</b> {t(`settings.team.can.${r}`)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

interface PromoOffer {
  code: string
  kind: 'percent' | 'free_days'
  percentOff: number | null
  durationMonths: number | null
  freeDays: number | null
  currency: string
  price: number
  discounted: number
}

const PLANS: { id: PlanId; price: number; points: number }[] = [
  { id: 'essentials', price: 8, points: 6 },
  { id: 'plus', price: 19.99, points: 5 },
  { id: 'max', price: 39.99, points: 5 },
]

function Plan() {
  const { settings, updateSettings, live } = useWorkspace()
  const { t, locale } = useT()
  const [params] = useSearchParams()
  const billing = params.get('billing')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const fmt = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  const cancel = async () => {
    if (!window.confirm(t('settings.plan.cancelConfirm', { date: settings.planRenewsAt ? fmt(settings.planRenewsAt) : '' }))) return
    setError('')
    setBusy('cancel')
    try {
      await api('/billing/cancel', {})
      updateSettings({ planStatus: 'cancelled' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }
  const resume = async () => {
    setError('')
    setBusy('cancel')
    try {
      await api('/billing/resume', {})
      updateSettings({ planStatus: 'active' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }
  // Promo codes: checked against every plan so each card can show its own discount.
  const [code, setCode] = useState(getSignupCode)
  const [promo, setPromo] = useState<{ code: string; offers: Partial<Record<PlanId, PromoOffer>> } | null>(null)
  const [promoError, setPromoError] = useState('')
  const [redeemed, setRedeemed] = useState('')
  const promoMsg = (m: string) => (/^PROMO_[A-Z]+$/.test(m) ? t(`settings.plan.promo.${m.slice(6).toLowerCase()}`) : m)
  const applyPromo = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setPromoError('')
    setBusy('promo')
    const results = await Promise.allSettled(PLANS.map((p) => api<PromoOffer>('/billing/promo', { plan: p.id, code: code.trim() })))
    const offers: Partial<Record<PlanId, PromoOffer>> = {}
    results.forEach((r, i) => r.status === 'fulfilled' && (offers[PLANS[i].id] = r.value))
    if (Object.keys(offers).length) setPromo({ code: code.trim().toUpperCase(), offers })
    else {
      setPromo(null)
      const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
      setPromoError(promoMsg(first?.reason instanceof Error ? first.reason.message : 'PROMO_INVALID'))
    }
    setBusy('')
  }
  // Live: plans are paid monthly through Flutterwave; the plan switches when payment is confirmed.
  const choose = async (plan: PlanId) => {
    if (!live) return updateSettings({ plan })
    setError('')
    setBusy(plan)
    try {
      const r = await api<{ link?: string; redeemed?: boolean; until?: string }>('/billing/checkout', { plan, ...(promo?.offers[plan] ? { promo: promo.code } : {}) })
      if (r.redeemed) {
        updateSettings({ plan, planStatus: 'active', planRenewsAt: r.until ?? null })
        setRedeemed(r.until ? fmt(r.until) : '')
        setPromo(null)
        setBusy('')
        return
      }
      window.location.href = r.link!
    } catch (e) {
      setError(promoMsg(e instanceof Error ? e.message : String(e)))
      setBusy('')
    }
  }
  const offerLine = (o: PromoOffer) =>
    o.kind === 'free_days'
      ? t('settings.plan.promo.freeDays', { count: o.freeDays ?? 0 })
      : o.durationMonths
        ? t('settings.plan.promo.percentFor', { pct: o.percentOff ?? 0, count: o.durationMonths })
        : t('settings.plan.promo.percentForever', { pct: o.percentOff ?? 0 })
  return (
    <>
      {billing === 'success' && <p className="d-hint-box st-billing-ok">{t('settings.plan.billingOk')}</p>}
      {billing === 'failed' && <p className="d-errors">{t('settings.plan.billingFailed')}</p>}
      {live && settings.planStatus && (
        <p className="d-muted st-plan-status">
          {t(`settings.plan.status.${settings.planStatus}`)}
          {settings.planRenewsAt && settings.planStatus === 'active' ? ` · ${t('settings.plan.renews', { date: fmt(settings.planRenewsAt) })}` : ''}
          {settings.planRenewsAt && settings.planStatus === 'cancelled' ? ` · ${t('settings.plan.accessUntil', { date: fmt(settings.planRenewsAt) })}` : ''}
        </p>
      )}
      {error && <p className="d-errors">{error}</p>}
      {redeemed && <p className="d-hint-box st-billing-ok">{t('settings.plan.promo.redeemed', { date: redeemed })}</p>}
      {live && (
        <form className="st-promo" onSubmit={applyPromo}>
          <label className="d-field">
            <span>{t('settings.plan.promo.label')}</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('settings.plan.promo.ph')} maxLength={32} autoCapitalize="characters" />
          </label>
          <button type="submit" className="d-btn" disabled={busy !== '' || !code.trim()}>
            {busy === 'promo' ? t('common.loading') : t('settings.plan.promo.apply')}
          </button>
          {promo && (
            <span className="d-pill d-pill-lime">
              {promo.code} ✓
            </span>
          )}
          {promoError && <small className="d-errors">{promoError}</small>}
        </form>
      )}
      <div className="st-plans">
        {PLANS.map((p) => {
          const current = settings.plan === p.id
          return (
            <section key={p.id} className={`d-panel st-plan ${current ? 'is-current' : ''}`}>
              <div className="d-panel-head">
                <h2>{planName(p.id)}</h2>
                {current && <span className="d-pill d-pill-lime">{t('settings.plan.current')}</span>}
              </div>
              <b className="st-price">
                {promo?.offers[p.id]?.kind === 'percent' ? (
                  <>
                    <s className="st-was">{formatMoney(promo.offers[p.id]!.price, promo.offers[p.id]!.currency, locale)}</s> {formatMoney(promo.offers[p.id]!.discounted, promo.offers[p.id]!.currency, locale)}
                  </>
                ) : (
                  formatMoney(planPrice(p.id, settings.currency).amount, planPrice(p.id, settings.currency).currency, locale)
                )}
                <small>{t('common.perMonth')}</small>
                {priceWithLocal(p.id, settings.currency).local && <small className="st-eur">{formatMoney(PLAN_PRICES.EUR![p.id], 'EUR', locale)}</small>}
              </b>
              {promo?.offers[p.id] && <p className="st-offer">{offerLine(promo.offers[p.id]!)}</p>}
              <ul>
                {Array.from({ length: p.points }, (_, i) => (
                  <li key={i}>
                    <Check size={14} /> {t(`settings.plan.points.${p.id}.${i}`)}
                  </li>
                ))}
              </ul>
              <button type="button" className={`d-btn ${current ? '' : 'd-btn-ink'}`} disabled={busy !== '' || (current && (!live || settings.planStatus === 'active'))} onClick={() => choose(p.id)}>
                {busy === p.id ? t('common.loading') : current && (!live || settings.planStatus === 'active') ? t('settings.plan.yours') : live && current ? t('settings.plan.subscribe') : t('settings.plan.switch', { plan: planName(p.id) })}
              </button>
            </section>
          )
        })}
      </div>
      <p className="d-hint-box">{live ? t('settings.plan.noteLive') : t('settings.plan.note')}</p>
      <p className="d-notes">
        {billingCurrency(settings.currency) === settings.currency ? t('settings.plan.billedIn', { currency: settings.currency }) : t('settings.plan.eurFallback', { currency: settings.currency })}
      </p>
      {live && (settings.planStatus === 'active' || settings.planStatus === 'past_due' || (settings.planStatus === 'cancelled' && settings.planRenewsAt && new Date(settings.planRenewsAt) > new Date())) && (
        <div className="st-renew">
          <label className="d-switch">
            <input type="checkbox" checked={settings.planStatus !== 'cancelled'} disabled={busy !== ''} onChange={(e) => (e.target.checked ? resume() : cancel())} />
            <span>{t('settings.plan.autoRenew')}</span>
          </label>
          <small>
            {settings.planStatus === 'cancelled'
              ? t('settings.plan.autoRenewOff', { date: settings.planRenewsAt ? fmt(settings.planRenewsAt) : '' })
              : t('settings.plan.autoRenewOn', { date: settings.planRenewsAt ? fmt(settings.planRenewsAt) : '' })}
          </small>
        </div>
      )}
      <p className="d-notes">
        <Link to="/refunds" className="d-link">{t('settings.plan.refundLink')}</Link>
      </p>
    </>
  )
}

function ChurchAiSettings() {
  const { live } = useWorkspace()
  const ai = useAi()
  const { t } = useT()
  const s = ai.settings
  const features = Object.keys(USAGE_LABEL) as UsageFeature[]
  const plans: PlanId[] = ['essentials', 'plus', 'max']
  const setLimit = (plan: PlanId, f: UsageFeature, v: number) =>
    ai.updateSettings({ limits: { ...s.limits, [plan]: { ...s.limits[plan], [f]: Math.max(0, v) } } })
  return (
    <div className="d-two">
      <section className="d-panel d-form">
        <div className="d-panel-head">
          <h2>{t('settings.ai.models')}</h2>
        </div>
        <label className="d-field">
          <span>{t('settings.ai.default')}</span>
          <select value={s.provider} onChange={(e) => ai.updateSettings({ provider: e.target.value as ProviderPref })}>
            <option value="auto">{t('settings.ai.auto')}</option>
            <option value="local">{t('settings.ai.localOnly')}</option>
            {(['claude', 'gemini', 'openai'] as const).map((p) => (
              <option key={p} value={p}>
                {PROVIDERS[p].label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <div className="st-prov">
            <div>
              <b>ZionDesk Local</b>
              <small>{t('settings.ai.localText')}</small>
            </div>
            <span className="d-pill d-pill-lime">{t('settings.ai.on')}</span>
          </div>
          {(['claude', 'gemini', 'openai'] as const).map((p) => (
            <label key={p} className="st-prov">
              <div>
                <b>{PROVIDERS[p].label}</b>
                <small>
                  {ai.status.available[p] ? t('settings.ai.keyFound') : t('settings.ai.keyNeeded')} {t('settings.ai.provText')}
                </small>
              </div>
              <span className="d-pill">{ai.status.available[p] ? t('settings.ai.ready') : t('settings.ai.notConfigured')}</span>
              <input type="checkbox" checked={s.enabled[p]} onChange={(e) => ai.updateSettings({ enabled: { ...s.enabled, [p]: e.target.checked } })} aria-label={t('settings.ai.enable', { name: PROVIDERS[p].label })} />
            </label>
          ))}
        </div>
        <div className="d-grid">
          <p className="d-notes">{t('settings.ai.langNote')}</p>
          <label className="d-inline-check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={s.suggestions} onChange={(e) => ai.updateSettings({ suggestions: e.target.checked })} /> {t('settings.ai.suggestions')}
          </label>
        </div>
      </section>

      <section className="d-panel d-form">
        <div className="d-panel-head">
          <h2>{t('settings.ai.costs')}</h2>
        </div>
        <p className="d-notes">{t('settings.ai.costsNote')}</p>
        <div className="d-grid">
          {(['SMS', 'WhatsApp', 'Email'] as const).map((c) => (
            <label key={c} className="d-field">
              <span>{t('settings.ai.perMessage', { channel: c })}</span>
              <input type="number" min="0" step="0.001" value={s.messageCost[c]} onChange={(e) => ai.updateSettings({ messageCost: { ...s.messageCost, [c]: Math.max(0, Number(e.target.value)) } })} />
            </label>
          ))}
        </div>
      </section>

      {/* Plan limits are set by ZionDesk; churches can't raise their own (live). */}
      {!live && (
      <section className="d-panel d-span-2">
        <div className="d-panel-head">
          <h2>{t('settings.ai.limits')}</h2>
          <button type="button" className="d-btn" onClick={() => window.confirm(t('settings.ai.resetConfirm')) && ai.resetSettings()}>
            <RotateCcw size={14} /> {t('settings.ai.reset')}
          </button>
        </div>
        <div className="d-table-wrap">
          <table className="st-ai-table">
            <thead>
              <tr>
                <th>{t('settings.ai.feature')}</th>
                {plans.map((p) => (
                  <th key={p}>{planName(p)}</th>
                ))}
                <th>{t('settings.ai.credits')}</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f}>
                  <td>{t(`settings.usage.${f}`)}</td>
                  {plans.map((p) => (
                    <td key={p}>
                      <input type="number" min="0" value={s.limits[p][f]} onChange={(e) => setLimit(p, f, Number(e.target.value))} aria-label={`${t(`settings.usage.${f}`)} · ${planName(p)}`} />
                    </td>
                  ))}
                  <td>
                    <input type="number" min="0" step="0.5" value={s.credits[f]} onChange={(e) => ai.updateSettings({ credits: { ...s.credits, [f]: Math.max(0, Number(e.target.value)) } })} aria-label={`${t('settings.ai.credits')} · ${t(`settings.usage.${f}`)}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="d-hint-box" style={{ marginTop: 12 }}>
          {t('settings.ai.limitsNote')}
        </p>
      </section>
      )}
    </div>
  )
}

function Integrations() {
  const { t } = useT()
  const { live } = useWorkspace()
  // Live: real status from the server (which services have their keys set).
  const [status, setStatus] = useState<Record<string, boolean> | null>(null)
  const [google, setGoogle] = useState<{ configured: boolean; connected: boolean; email: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [params] = useSearchParams()
  const loadGoogle = () => api<{ configured: boolean; connected: boolean; email: string }>('/google/status').then(setGoogle).catch(() => {})
  useEffect(() => {
    if (!live) return
    fetch(apiUrl('/health'))
      .then((r) => r.json())
      .then((h) => setStatus({ sms: !!h.sms, whatsapp: !!h.whatsapp, email: !!h.email, payments: !!h.flutterwave }))
      .catch(() => {})
    loadGoogle()
  }, [live])
  const connectGoogle = async () => {
    setBusy(true)
    try {
      const { url } = await api<{ url: string }>('/google/connect', {})
      window.location.href = url
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  const items = [
    { icon: <GoogleMeetLogo size={26} />, id: 'meet', name: 'Google Meet' },
    { icon: <MessageSquareText size={22} />, id: 'sms', name: 'SMS' },
    { icon: <MessageCircle size={22} />, id: 'whatsapp', name: 'WhatsApp Business' },
    { icon: <Mail size={22} />, id: 'email', name: t('settings.int.emailName') },
    { icon: <CreditCard size={22} />, id: 'payments', name: 'ZionDesk Payments' },
  ]
  return (
    <div className="st-ints">
      {params.get('google') === 'connected' && <p className="d-hint-box st-billing-ok">{t('settings.int.googleOk')}</p>}
      {params.get('google') === 'failed' && <p className="d-errors">{t('settings.int.googleFailed')}</p>}
      {live && google && (
        <section className="d-panel st-int">
          <span className="st-int-ico">
            <GoogleMeetLogo size={26} />
          </span>
          <div>
            <b>Google Meet</b>
            <p>{google.connected ? t('settings.int.googleConnected', { email: google.email }) : t('settings.int.googleText')}</p>
          </div>
          {google.connected ? (
            <button type="button" className="d-btn" disabled={busy} onClick={() => api('/google/disconnect', {}).then(loadGoogle)}>
              {t('settings.int.disconnect')}
            </button>
          ) : (
            <button type="button" className="d-btn d-btn-ink" disabled={busy || !google.configured} title={google.configured ? '' : t('settings.int.needs.meet')} onClick={connectGoogle}>
              {busy ? t('common.loading') : t('settings.int.connectGoogle')}
            </button>
          )}
        </section>
      )}
      {items.filter((i) => !(live && i.id === 'meet') && (ONLINE_GIVING || i.id !== 'payments')).map((i) => (
        <section key={i.name} className="d-panel st-int">
          <span className="st-int-ico">{i.icon}</span>
          <div>
            <b>{i.name}</b>
            <p>{t(`settings.int.${i.id}`)}</p>
            {i.id === 'payments' && (
              <Link to="/dashboard/giving?tab=page" className="d-link">
                {t('giving.tabs.page')} →
              </Link>
            )}
          </div>
          {status?.[i.id] ? (
            <span className="d-pill d-pill-lime">{t('settings.int.connected')}</span>
          ) : (
            <span className="d-pill" title={t(`settings.int.needs.${i.id}`)}>
              {t('settings.int.notConnected')}
            </span>
          )}
        </section>
      ))}
      {!live && <p className="d-hint-box">{t('settings.int.note')}</p>}
    </div>
  )
}

/** Live: church-wide export and deletion (admins). */
function ChurchData() {
  const { settings } = useWorkspace()
  const session = useSession()
  const { t } = useT()
  const navigate = useNavigate()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState('')
  return (
    <div className="d-two">
      <section className="d-panel d-form">
        <div className="d-panel-head">
          <h2>
            <Download size={17} /> {t('settings.data.exportTitle')}
          </h2>
        </div>
        <p className="d-notes">{t('settings.data.exportText')}</p>
        <div className="d-form-actions st-left">
          <button
            type="button"
            className="d-btn d-btn-ink"
            disabled={busy !== ''}
            onClick={async () => {
              setError('')
              setBusy('export')
              await download('/church/export', 'ziondesk-church-data').catch((e) => setError(e.message))
              setBusy('')
            }}
          >
            <Download size={15} /> {busy === 'export' ? t('common.loading') : t('settings.data.export')}
          </button>
        </div>
        <p className="d-notes">
          <Link to="/dpa" className="d-link">{t('settings.data.dpaLink')}</Link>
        </p>
      </section>
      <section className="d-panel d-form">
        <div className="d-panel-head">
          <h2>
            <Trash2 size={17} /> {t('settings.data.deleteTitle')}
          </h2>
        </div>
        <p className="d-notes">{t('settings.data.deleteText')}</p>
        <label className="d-field">
          <span>{t('settings.data.typeName', { name: settings.churchName })}</span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="d-errors">{error}</p>}
        <div className="d-form-actions">
          <button
            type="button"
            className="d-btn d-danger"
            disabled={busy !== '' || confirm.trim().toLowerCase() !== settings.churchName.trim().toLowerCase()}
            onClick={async () => {
              setError('')
              setBusy('delete')
              try {
                await api('/church/delete', { confirm })
                await session.refresh()
                navigate('/dashboard')
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
              } finally {
                setBusy('')
              }
            }}
          >
            <Trash2 size={15} /> {busy === 'delete' ? t('common.loading') : t('settings.data.delete')}
          </button>
        </div>
      </section>
    </div>
  )
}

function Data() {
  const { resetDemo } = useMembers()
  const { resetWorkspace } = useWorkspace()
  const [done, setDone] = useState(false)
  const { t } = useT()
  return (
    <section className="d-panel d-form">
      <div className="d-panel-head">
        <h2>
          <Database size={17} /> {t('settings.data.title')}
        </h2>
        <Saved show={done} />
      </div>
      <p className="d-notes">
        {t('settings.data.text')}
      </p>
      <div className="d-form-actions">
        <button
          type="button"
          className="d-btn d-danger"
          onClick={() => {
            if (!window.confirm(t('settings.data.confirm'))) return
            resetDemo()
            resetWorkspace()
            setDone(true)
            setTimeout(() => setDone(false), 2000)
          }}
        >
          <RotateCcw size={15} /> {t('settings.data.reset')}
        </button>
      </div>
    </section>
  )
}

export default function Settings() {
  const { role } = useMembers()
  const [params, setParams] = useSearchParams()
  const { t } = useT()
  const { live } = useWorkspace()
  const admin = role === 'admin'
  // Language & Communication is personal, so every role can open it; the rest is admin-only.
  const requested = (params.get('tab') as Tab) || (admin ? 'profile' : 'account')
  const tab: Tab = admin || requested === 'language' ? requested : 'account'
  const tabs: { id: Tab; label: string }[] = [
    { id: 'account', label: t('settings.account.title') },
    { id: 'language', label: t('lang.title') },
    ...(admin
      ? ([
          { id: 'profile', label: t('settings.tabs.profile') },
          { id: 'structure', label: t('settings.tabs.structure') },
          { id: 'team', label: t('settings.tabs.team') },
          { id: 'plan', label: t('settings.tabs.plan') },
          { id: 'ai', label: t('settings.tabs.ai') },
          { id: 'integrations', label: t('settings.tabs.integrations') },
          { id: 'data' as Tab, label: live ? t('settings.data.privacyTab') : t('settings.tabs.data') },
        ] as { id: Tab; label: string }[])
      : []),
  ]
  return (
    <div className="d-page">
      <PageHead title={t('dash.nav.settings')} />
      <div className="d-toolrow">
        <Tabs value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} tabs={tabs} />
      </div>
      {!admin && tab === 'language' && <p className="d-hint-box">{t('settings.adminOnly')}</p>}
      {tab === 'account' && <Account />}
      {tab === 'language' && <LanguageSettings />}
      {tab === 'profile' && <Profile />}
      {tab === 'structure' && <Structure />}
      {tab === 'team' && <Team />}
      {tab === 'plan' && <Plan />}
      {tab === 'ai' && <ChurchAiSettings />}
      {tab === 'integrations' && <Integrations />}
      {tab === 'data' && (live ? <ChurchData /> : <Data />)}
    </div>
  )
}
