import { Check, CreditCard, Database, Languages, Mail, MessageCircle, MessageSquareText, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { GoogleMeetLogo } from '../components/GoogleMeet'
import { PageHead, Tabs, planName, tEnum } from './kit'
import { useMembers } from './store'
import { type Role } from './types'
import { useWorkspace, type PlanId, type Settings as S } from './workspace'
import { useAi } from '../ai/store'
import { PROVIDERS } from '../ai/providers'
import { USAGE_LABEL, type ProviderPref, type UsageFeature } from '../ai/types'
import { LANGS, useT } from '../i18n'
import { Flag, LangCards } from '../i18n/Flags'

const ROLES: Role[] = ['admin', 'finance', 'leader']

type Tab = 'language' | 'profile' | 'structure' | 'team' | 'plan' | 'ai' | 'integrations' | 'data'
const CURRENCIES = ['USD', 'NGN', 'GBP', 'EUR', 'CAD', 'GHS', 'KES', 'ZAR']

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

function Profile() {
  const { settings, updateSettings } = useWorkspace()
  const { t } = useT()
  const [f, setF] = useState(settings)
  const [ok, setOk] = useState(false)
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
  // Live: plans are paid monthly through Flutterwave; the plan switches when payment is confirmed.
  const choose = async (plan: PlanId) => {
    if (!live) return updateSettings({ plan })
    setError('')
    setBusy(plan)
    try {
      const { link } = await api<{ link: string }>('/billing/checkout', { plan })
      window.location.href = link
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy('')
    }
  }
  return (
    <>
      {billing === 'success' && <p className="d-hint-box st-billing-ok">{t('settings.plan.billingOk')}</p>}
      {billing === 'failed' && <p className="d-errors">{t('settings.plan.billingFailed')}</p>}
      {live && settings.planStatus && (
        <p className="d-muted st-plan-status">
          {t(`settings.plan.status.${settings.planStatus}`)}
          {settings.planRenewsAt ? ` · ${t('settings.plan.renews', { date: new Date(settings.planRenewsAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}` : ''}
        </p>
      )}
      {error && <p className="d-errors">{error}</p>}
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
                {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: p.price % 1 ? 2 : 0 }).format(p.price)}
                <small>{t('common.perMonth')}</small>
              </b>
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
    </>
  )
}

function ChurchAiSettings() {
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
    </div>
  )
}

function Integrations() {
  const { t } = useT()
  const { live } = useWorkspace()
  // Live: real status from the server (which services have their keys set).
  const [status, setStatus] = useState<Record<string, boolean> | null>(null)
  useEffect(() => {
    if (!live) return
    fetch('/api/health')
      .then((r) => r.json())
      .then((h) => setStatus({ meet: false, sms: !!h.sms, whatsapp: !!h.whatsapp, email: !!h.email, payments: !!h.flutterwave }))
      .catch(() => {})
  }, [live])
  const items = [
    { icon: <GoogleMeetLogo size={26} />, id: 'meet', name: 'Google Meet' },
    { icon: <MessageSquareText size={22} />, id: 'sms', name: 'SMS' },
    { icon: <MessageCircle size={22} />, id: 'whatsapp', name: 'WhatsApp Business' },
    { icon: <Mail size={22} />, id: 'email', name: t('settings.int.emailName') },
    { icon: <CreditCard size={22} />, id: 'payments', name: 'ZionDesk Payments' },
  ]
  return (
    <div className="st-ints">
      {items.map((i) => (
        <section key={i.name} className="d-panel st-int">
          <span className="st-int-ico">{i.icon}</span>
          <div>
            <b>{i.name}</b>
            <p>{t(`settings.int.${i.id}`)}</p>
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
  const requested = (params.get('tab') as Tab) || (admin ? 'profile' : 'language')
  const tab: Tab = admin ? requested : 'language'
  const tabs: { id: Tab; label: string }[] = [
    { id: 'language', label: t('lang.title') },
    ...(admin
      ? ([
          { id: 'profile', label: t('settings.tabs.profile') },
          { id: 'structure', label: t('settings.tabs.structure') },
          { id: 'team', label: t('settings.tabs.team') },
          { id: 'plan', label: t('settings.tabs.plan') },
          { id: 'ai', label: t('settings.tabs.ai') },
          { id: 'integrations', label: t('settings.tabs.integrations') },
          ...(live ? [] : [{ id: 'data' as Tab, label: t('settings.tabs.data') }]),
        ] as { id: Tab; label: string }[])
      : []),
  ]
  return (
    <div className="d-page">
      <PageHead title={t('dash.nav.settings')} />
      <div className="d-toolrow">
        <Tabs value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} tabs={tabs} />
      </div>
      {!admin && <p className="d-hint-box">{t('settings.adminOnly')}</p>}
      {tab === 'language' && <LanguageSettings />}
      {tab === 'profile' && <Profile />}
      {tab === 'structure' && <Structure />}
      {tab === 'team' && <Team />}
      {tab === 'plan' && <Plan />}
      {tab === 'ai' && <ChurchAiSettings />}
      {tab === 'integrations' && <Integrations />}
      {tab === 'data' && !live && <Data />}
    </div>
  )
}
