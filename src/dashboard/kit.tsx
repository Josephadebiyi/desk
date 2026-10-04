import { motion } from 'framer-motion'
import { Lock, Sparkles, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMembers } from './store'
import type { Member } from './types'
import { useWorkspace, type Audience, type PlanId } from './workspace'
import { getLocale, tr, useT } from '../i18n'

/* Formatting */
export const money = (n: number, currency = 'USD', digits = 0) =>
  new Intl.NumberFormat(getLocale(), { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
export const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString(getLocale(), opts) : '—'
export const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' })
}
/** Local calendar date as yyyy-mm-dd (not UTC). */
export const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const today = () => isoLocal(new Date())
/** Display label for a stored enum value (stage, status, channel…); unknown values show as-is. */
export const tEnum = (group: string, value: string) => (value ? tr(`enums.${group}.${value}`) : value)
export const planName = (p: PlanId) => tr(`enums.plan.${p}`)

/* Page header */
export function PageHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="d-head">
      <h1>{title}</h1>
      {children && <div className="d-kpis">{children}</div>}
    </div>
  )
}

export function Kpi({ icon, value, label, pill, tone }: { icon: ReactNode; value: ReactNode; label: string; pill?: string; tone?: 'lime' | 'purple' }) {
  return (
    <div className="d-kpi">
      <span className="d-kpi-ico">{icon}</span>
      <div>
        <b>{value}</b>
        <small>{label}</small>
      </div>
      {pill && <span className={`d-pill ${tone ? `d-pill-${tone}` : ''}`}>{pill}</span>}
    </div>
  )
}

/* Modal */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <motion.div className="d-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div
        className={`d-modal ${wide ? 'is-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="d-modal-head">
          <h2>{title}</h2>
          <button type="button" className="d-circle" onClick={onClose} aria-label={tr('common.close')}>
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

/* Tabs */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="d-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={value === t.id ? 'is-on' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* Plan gate */
export function PlanGate({ need, feature, children }: { need: PlanId; feature: string; children: ReactNode }) {
  const { hasPlan, updateSettings, live } = useWorkspace()
  const { t } = useT()
  if (hasPlan(need)) return <>{children}</>
  const plan = planName(need)
  return (
    <div className="d-panel d-gate">
      <span className="d-gate-ico">
        <Lock size={22} />
      </span>
      <h2>{t('kit.gate.title', { feature, plan })}</h2>
      <p>{t('kit.gate.body')}</p>
      <div className="d-gate-actions">
        {live ? (
          <Link to="/dashboard/settings?tab=plan" className="d-btn d-btn-ink">
            <Sparkles size={15} /> {t('kit.gate.upgrade', { plan })}
          </Link>
        ) : (
          <button type="button" className="d-btn d-btn-ink" onClick={() => updateSettings({ plan: need })}>
            <Sparkles size={15} /> {t('kit.gate.upgrade', { plan })}
          </button>
        )}
        <Link to="/dashboard/settings?tab=plan" className="d-btn">
          {t('kit.gate.compare')}
        </Link>
      </div>
      <small className="d-gate-note">{t('kit.gate.note')}</small>
    </div>
  )
}

/* No-permission notice */
export function NoAccess({ what }: { what: string }) {
  const { t } = useT()
  return (
    <div className="d-panel d-gate">
      <span className="d-gate-ico">
        <Lock size={22} />
      </span>
      <h2>{t('kit.noAccess.title', { what })}</h2>
      <p>{t('kit.noAccess.body')}</p>
    </div>
  )
}

/* Audience helpers */
export function audienceMembers(members: Member[], a: Audience) {
  const active = members.filter((m) => m.membershipStatus !== 'Transferred')
  if (a.type === 'all') return active
  if (a.type === 'stage') return active.filter((m) => m.stage === a.value)
  if (a.type === 'department') return active.filter((m) => m.department === a.value)
  return active.filter((m) => m.branch === a.value)
}
export const audienceLabel = (a: Audience) =>
  a.type === 'all'
    ? tr('kit.audience.everyone')
    : a.type === 'stage'
      ? tr(`enums.stagePlural.${a.value}`)
      : a.type === 'department'
        ? tr('kit.audience.dept', { name: a.value })
        : tr('kit.audience.branch', { name: a.value })

export function AudiencePicker({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  const { settings } = useWorkspace()
  const { members } = useMembers()
  const { t } = useT()
  const options: Record<Audience['type'], string[]> = {
    all: [],
    stage: ['Newcomer', 'Convert', 'Member', 'Worker'],
    department: settings.departments,
    branch: settings.branches,
  }
  const count = audienceMembers(members, value).length
  return (
    <div className="d-aud">
      <div className="d-grid">
        <label className="d-field">
          <span>{t('kit.audience.sendTo')}</span>
          <select
            value={value.type}
            onChange={(e) => {
              const type = e.target.value as Audience['type']
              onChange({ type, value: options[type][0] ?? '' })
            }}
          >
            <option value="all">{t('kit.audience.everyone')}</option>
            <option value="stage">{t('kit.audience.aStage')}</option>
            <option value="department">{t('kit.audience.aDept')}</option>
            <option value="branch">{t('kit.audience.aBranch')}</option>
          </select>
        </label>
        {value.type !== 'all' && (
          <label className="d-field">
            <span>{t('kit.audience.whichOne')}</span>
            <select value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })}>
              {options[value.type].map((o) => (
                <option key={o} value={o}>
                  {value.type === 'stage' ? t(`enums.stagePlural.${o}`) : o}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <small className="d-aud-count">
        {t('kit.audience.included', { count })}
      </small>
    </div>
  )
}

/* Simple bar chart (SVG) */
export function Bars({ data, format = (n: number) => String(n), tone = 'purple' }: { data: { label: string; value: number }[]; format?: (n: number) => string; tone?: 'purple' | 'lime' }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="d-bars">
      {data.map((d, i) => (
        <div key={d.label} className="d-bar">
          <span className="d-bar-val">{format(d.value)}</span>
          <motion.i
            className={`t-${i === data.length - 1 ? (tone === 'purple' ? 'lime' : 'purple') : tone}`}
            initial={{ height: 0 }}
            animate={{ height: `${(d.value / max) * 100}%` }}
            transition={{ duration: 0.7, delay: i * 0.05 }}
          />
          <small>{d.label}</small>
        </div>
      ))}
    </div>
  )
}

/* CSV download helper */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Contextual entry point into Ellen. `k` asks a built-in question; `ask` sends text; `prefill` only fills the box. */
export function AskAI({ label, ask, prefill, k }: { label: string; ask?: string; prefill?: string; k?: string }) {
  const to = k
    ? `/dashboard/ai?q=${encodeURIComponent(tr(`ai.q.${k}`))}&k=${k}`
    : ask
      ? `/dashboard/ai?q=${encodeURIComponent(ask)}`
      : `/dashboard/ai?prefill=${encodeURIComponent(prefill ?? '')}`
  return (
    <Link to={to} className="d-btn d-btn-ai">
      <Sparkles size={15} /> {label}
    </Link>
  )
}
