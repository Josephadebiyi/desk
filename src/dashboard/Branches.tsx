/**
 * Branch reports. Each branch declares its month (income by fund, expenses, attendance, notes).
 *   HQ (admin / finance): every branch for a month, who hasn't reported, review / send back, remind, settings.
 *   Branch leader: their own branch only — this month's report and past ones.
 * Reminders and HQ notices are emailed by the server's daily job (server/branches.ts).
 */
import { AlertCircle, Bell, Building2, CheckCircle2, Download, FileText, Plus, Send, Trash2, Undo2, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { InboxItem } from '../ai/inbox'
import { tr, useT } from '../i18n'
import { api } from '../lib/api'
import { useSession } from '../lib/session'
import { remote } from '../lib/supabase'
import { confirmAction } from './confirm'
import { downloadCsv, fmtDate, Kpi, Modal, money, PageHead, PlanGate, today } from './kit'
import { uid } from './types'
import { useWorkspace } from './workspace'

export interface Line {
  label: string
  amount: number
}
export interface BranchReport {
  id: string
  branch: string
  period: string
  currency: string
  income: Line[]
  expenses: Line[]
  incomeTotal: number
  expenseTotal: number
  attendance: number | null
  newMembers: number | null
  notes: string
  status: 'Submitted' | 'Reviewed' | 'Returned'
  submittedBy: string
  submittedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
}
export interface Overview {
  allowed: boolean
  role: string
  myBranch: string | null
  period: string
  currentPeriod: string
  due: string
  dueDay: number
  reminders: boolean
  branches: string[]
  reporting: string[]
  reportingIsDefault: boolean
  funds: string[]
  currency: string
  reports: BranchReport[]
  missing: string[]
  leaders: Record<string, string[]>
}

const err = (e: unknown) => (e instanceof Error ? e.message : String(e))
const lastMonth = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
}
const dueOf = (period: string, day: number) => {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10)
}

/* ───────── demo data (no server): a few branches, some reported ───────── */

const demo: { reports: BranchReport[]; dueDay: number; reminders: boolean; reporting: string[] | null } = { reports: [], dueDay: 5, reminders: true, reporting: null }
function demoOverview(period: string, branches: string[], funds: string[], currency: string, myBranch: string | null): Overview {
  const all = branches.length > 1 ? branches : [...branches, 'Lekki', 'Ikeja', 'Abuja']
  const reporting = (demo.reporting ?? all.slice(1)).filter((b) => all.includes(b))
  if (!demo.reports.length && reporting.length) {
    const p = lastMonth()
    demo.reports = reporting.slice(0, Math.max(1, reporting.length - 1)).map((b, i) => ({
      id: uid(),
      branch: b,
      period: p,
      currency,
      income: funds.slice(0, 3).map((f, j) => ({ label: f, amount: (i + 2) * (j + 1) * 150 })),
      expenses: [{ label: 'Rent', amount: 400 + i * 50 }, { label: 'Utilities', amount: 120 }],
      incomeTotal: funds.slice(0, 3).reduce((s, _f, j) => s + (i + 2) * (j + 1) * 150, 0),
      expenseTotal: 520 + i * 50,
      attendance: 80 + i * 25,
      newMembers: 4 + i,
      notes: '',
      status: i === 0 ? 'Reviewed' : 'Submitted',
      submittedBy: 'Branch leader',
      submittedAt: new Date().toISOString(),
      reviewedBy: i === 0 ? 'Pastor' : null,
      reviewedAt: i === 0 ? new Date().toISOString() : null,
      reviewNote: null,
    }))
  }
  const reports = demo.reports.filter((r) => (myBranch ? r.branch === myBranch : r.period === period))
  const done = new Set(demo.reports.filter((r) => r.period === period && r.status !== 'Returned').map((r) => r.branch))
  return {
    allowed: true,
    role: myBranch ? 'branch' : 'admin',
    myBranch,
    period,
    currentPeriod: lastMonth(),
    due: dueOf(period, demo.dueDay),
    dueDay: demo.dueDay,
    reminders: demo.reminders,
    branches: all,
    reporting,
    reportingIsDefault: demo.reporting === null,
    funds,
    currency,
    reports,
    missing: reporting.filter((b) => !done.has(b)),
    leaders: Object.fromEntries(reporting.slice(0, 2).map((b) => [b, ['Branch leader']])),
  }
}

/* ───────── data hook (also used by the notifications bell) ───────── */

let cache: { key: string; at: number; data: Overview } | null = null
export function useBranchOverview(period?: string, enabled = true) {
  const { settings } = useWorkspace()
  const session = useSession()
  const myBranch = session.role === 'branch' ? session.church?.branch ?? null : null
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const p = period ?? lastMonth()
  const load = useCallback(
    (fresh = false) => {
      if (!enabled) return
      if (!remote) return setData(demoOverview(p, settings.branches, settings.funds, settings.currency, null))
      const key = `${session.church?.id}:${p}`
      if (!fresh && cache?.key === key && Date.now() - cache.at < 120_000) return setData(cache.data)
      api<Overview>(`/branches/overview?period=${p}`)
        .then((d) => {
          cache = { key, at: Date.now(), data: d }
          setData(d)
          setError('')
        })
        .catch((e) => setError(err(e)))
    },
    [enabled, p, settings.branches, settings.funds, settings.currency, session.church?.id],
  )
  useEffect(() => load(), [load])
  return { data, error, reload: () => load(true), myBranch }
}

/** Bell notifications: HQ sees who hasn't reported and what's waiting for review; a branch leader sees their due date. */
export function useBranchNotices(): InboxItem[] {
  const session = useSession()
  const role = session.remote ? session.role : 'admin'
  const enabled = role === 'admin' || role === 'finance' || role === 'branch'
  const { data } = useBranchOverview(undefined, enabled)
  const { locale } = useT()
  return useMemo(() => {
    if (!data?.allowed) return []
    const month = new Date(`${data.period}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    const due = fmtDate(data.due, { day: 'numeric', month: 'long' })
    const late = today() > data.due
    const items: InboxItem[] = []
    const href = '/dashboard/branches'
    if (data.role === 'branch') {
      const mine = data.reports.find((r) => r.period === data.period)
      if (mine?.status === 'Returned') items.push({ id: `br-returned-${mine.id}-${mine.reviewedAt}`, agent: 'branches', priority: 1, title: tr('br.notifReturned', { period: month }), detail: mine.reviewNote ?? '', href })
      else if (!mine && today() >= dueOf(data.period, Math.max(1, data.dueDay - 5)))
        items.push({ id: `br-mine-${data.period}-${late ? 'late' : 'due'}`, agent: 'branches', priority: late ? 1 : 2, title: late ? tr('br.notifMineLate', { period: month }) : tr('br.notifMine', { period: month, date: due }), detail: tr('br.notifMineDetail', { church: session.church?.name ?? '' }), href })
      return items
    }
    if (late && data.missing.length)
      items.push({ id: `br-missing-${data.period}-${data.missing.length}`, agent: 'branches', priority: 1, title: tr('br.notifMissing', { count: data.missing.length, period: month }), detail: data.missing.join(', '), href })
    const toReview = data.reports.filter((r) => r.status === 'Submitted')
    if (toReview.length)
      items.push({ id: `br-review-${data.period}-${toReview.map((r) => r.id.slice(0, 4)).join('')}`, agent: 'branches', priority: 2, title: tr('br.notifReview', { count: toReview.length }), detail: toReview.map((r) => r.branch).join(', '), href })
    return items
  }, [data, locale, session.church?.name])
}

/* ───────── page ───────── */

export default function Branches() {
  const session = useSession()
  const { t } = useT()
  if (session.role === 'branch') return <BranchView />
  return (
    <PlanGate need="plus" feature={t('br.title')}>
      <HqView />
    </PlanGate>
  )
}

function NotIncluded() {
  const { t } = useT()
  return (
    <div className="d-page">
      <p className="d-hint-box">
        {t('kit.gate.title', { feature: t('br.title'), plan: 'Ministry Plus' })} <Link to="/dashboard/settings?tab=plan">→</Link>
      </p>
    </div>
  )
}

function useMonthLabel() {
  const { locale } = useT()
  return (period: string) => new Date(`${period}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

function HqView() {
  const { t } = useT()
  const session = useSession()
  const monthLabel = useMonthLabel()
  const [period, setPeriod] = useState(lastMonth())
  const { data, error, reload } = useBranchOverview(period)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [open, setOpen] = useState<BranchReport | null>(null)
  const [editing, setEditing] = useState<{ branch: string; report?: BranchReport } | null>(null)
  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 6000)
  }

  if (!data) return <div className="d-page">{error ? <p className="d-errors">{error}</p> : <p className="d-muted">{t('common.loading')}</p>}</div>
  if (!data.allowed) return <NotIncluded />

  const cur = data.currency
  const late = today() > data.due
  const byBranch = new Map(data.reports.map((r) => [r.branch, r]))
  const rows = [...new Set([...data.reporting, ...data.reports.map((r) => r.branch)])]
  const accepted = data.reports.filter((r) => r.status !== 'Returned')
  const income = accepted.reduce((s, r) => s + r.incomeTotal, 0)
  const expenses = accepted.reduce((s, r) => s + r.expenseTotal, 0)
  const doneCount = data.reporting.length - data.missing.length
  const due = fmtDate(data.due, { day: 'numeric', month: 'long' })

  const remind = async (only?: string) => {
    const count = only ? 1 : data.missing.length
    if (!(await confirmAction({ title: t('br.remindTitle', { count }), body: t('br.remindBody', { period: monthLabel(period) }), confirmLabel: t('br.remind') }))) return
    if (!remote) return flash(true, t('br.reminded', { count }))
    try {
      const r = await api<{ emailed: number; noLeader: string[]; already: string[] }>('/branches/remind', { period, branch: only })
      const parts = [r.emailed ? t('br.reminded', { count: r.emailed }) : '', r.noLeader.length ? t('br.remindNone', { branches: r.noLeader.join(', ') }) : '', r.already.length ? t('br.remindAlready', { branches: r.already.join(', ') }) : '']
      flash(r.emailed > 0, parts.filter(Boolean).join(' '))
    } catch (e) {
      flash(false, err(e))
    }
  }

  const exportCsv = () =>
    downloadCsv(`${t('br.csvName')}-${period}.csv`, [
      [t('br.colBranch'), t('br.colStatus'), t('br.colIncome'), t('br.colExpenses'), t('br.colNet'), t('br.colAttendance'), t('br.newMembers'), t('br.notes')],
      ...rows.map((b) => {
        const r = byBranch.get(b)
        return r
          ? [b, t(`br.st_${r.status}`), r.incomeTotal, r.expenseTotal, r.incomeTotal - r.expenseTotal, r.attendance ?? '', r.newMembers ?? '', r.notes]
          : [b, t(late ? 'br.st_late' : 'br.st_missing'), '', '', '', '', '', '']
      }),
    ])

  return (
    <div className="d-page">
      <PageHead title={t('br.title')}>
        <Kpi icon={<CheckCircle2 size={17} />} value={`${doneCount}/${data.reporting.length}`} label={t('br.kpiReported')} />
        <Kpi icon={<Wallet size={17} />} value={money(income, cur)} label={t('br.kpiIncome')} />
        <Kpi icon={<FileText size={17} />} value={money(expenses, cur)} label={t('br.kpiExpenses')} />
        <Kpi icon={<Building2 size={17} />} value={money(income - expenses, cur)} label={t('br.kpiNet')} tone="lime" />
      </PageHead>
      <p className="d-hint-box">{t('br.intro')}</p>
      {msg && <p className={`d-hint-box ${msg.ok ? 'st-billing-ok' : 'd-errors'}`}>{msg.text}</p>}

      <section className="d-panel">
        <div className="d-panel-head br-head">
          <label className="d-field br-month">
            <span>{t('br.month')}</span>
            <input type="month" value={period} max={data.currentPeriod} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
          </label>
          <span className={`d-chip ${late && data.missing.length ? 't-lavender' : 't-mute'}`}>{t('br.due', { date: due })}</span>
          <div className="br-actions">
            {data.missing.length > 0 && (
              <button type="button" className="d-btn d-btn-ink" onClick={() => remind()}>
                <Bell size={15} /> {t('br.remindAll', { count: data.missing.length })}
              </button>
            )}
            <button type="button" className="d-btn" onClick={() => setEditing({ branch: data.missing[0] ?? data.reporting[0] ?? data.branches[0] })}>
              <Plus size={15} /> {t('br.addReport')}
            </button>
            <button type="button" className="d-btn" onClick={exportCsv} disabled={!rows.length}>
              <Download size={15} /> {t('common.exportCsv')}
            </button>
          </div>
        </div>
        {!rows.length ? (
          <p className="d-empty-sm">{data.branches.length < 2 ? t('br.noBranches') : t('br.noneReporting')}</p>
        ) : (
          <div className="d-table-wrap">
            <table className="d-table is-static br-table">
              <thead>
                <tr>
                  <th>{t('br.colBranch')}</th>
                  <th>{t('br.colStatus')}</th>
                  <th className="num">{t('br.colIncome')}</th>
                  <th className="num">{t('br.colExpenses')}</th>
                  <th className="num">{t('br.colNet')}</th>
                  <th className="num">{t('br.colAttendance')}</th>
                  <th>{t('br.colLeader')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const r = byBranch.get(b)
                  const leaders = data.leaders[b] ?? []
                  return (
                    <tr key={b}>
                      <td>
                        <b>{b}</b>
                      </td>
                      <td>
                        {r ? (
                          <>
                            <span className={`d-chip ${r.status === 'Reviewed' ? 't-ok' : r.status === 'Returned' ? 't-lavender' : 't-purple'}`}>{t(`br.st_${r.status}`)}</span>
                            <small className="br-sub">{t('br.sentOn', { date: fmtDate(r.submittedAt.slice(0, 10), { day: 'numeric', month: 'short' }), name: r.submittedBy })}</small>
                          </>
                        ) : (
                          <span className={`d-chip ${late ? 'br-late' : 't-mute'}`}>{t(late ? 'br.st_late' : 'br.st_missing')}</span>
                        )}
                      </td>
                      <td className="num">{r ? money(r.incomeTotal, cur) : '—'}</td>
                      <td className="num">{r ? money(r.expenseTotal, cur) : '—'}</td>
                      <td className="num">{r ? money(r.incomeTotal - r.expenseTotal, cur) : '—'}</td>
                      <td className="num">{r?.attendance ?? '—'}</td>
                      <td>{leaders.length ? leaders.join(', ') : session.role === 'admin' ? <Link to="/dashboard/settings?tab=team">{t('br.inviteLeader')}</Link> : <span className="d-muted">{t('br.noLeader')}</span>}</td>
                      <td className="br-row-actions">
                        {r ? (
                          <button type="button" className="d-btn" onClick={() => setOpen(r)}>
                            {t('br.view')}
                          </button>
                        ) : (
                          <>
                            {leaders.length > 0 && (
                              <button type="button" className="d-btn" onClick={() => remind(b)}>
                                <Bell size={14} /> {t('br.remind')}
                              </button>
                            )}
                            <button type="button" className="d-btn" onClick={() => setEditing({ branch: b })}>
                              <Plus size={14} /> {t('br.fill')}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {session.role === 'admin' || !remote ? <SettingsCard data={data} onSaved={reload} /> : null}

      {open && (
        <ReportView
          report={open}
          hq
          onClose={() => setOpen(null)}
          onEdit={() => {
            setEditing({ branch: open.branch, report: open })
            setOpen(null)
          }}
          onChanged={(r) => {
            setOpen(r)
            reload()
          }}
        />
      )}
      {editing && (
        <ReportForm
          data={data}
          period={period}
          branch={editing.branch}
          chooseBranch
          initial={editing.report}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
            flash(true, t('br.sent'))
          }}
        />
      )}
    </div>
  )
}

function SettingsCard({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const { t } = useT()
  const [dueDay, setDueDay] = useState(data.dueDay)
  const [reminders, setReminders] = useState(data.reminders)
  const [reporting, setReporting] = useState<string[]>(data.reporting)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const example = fmtDate(dueOf(`${new Date().getFullYear()}-10`, dueDay), { day: 'numeric', month: 'long' })
  const save = async () => {
    if (!(await confirmAction({ title: t('br.confirmSettings'), confirmLabel: t('cf.save') }))) return
    setError('')
    try {
      if (remote) await api('/branches/settings', { dueDay, reminders, reporting }, 'PUT')
      else Object.assign(demo, { dueDay, reminders, reporting })
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
      onSaved()
    } catch (e) {
      setError(err(e))
    }
  }
  return (
    <section className="d-panel d-form">
      <div className="d-panel-head">
        <h2>{t('br.settingsTitle')}</h2>
        {saved && <span className="d-chip t-ok">{t('br.saved')}</span>}
      </div>
      <label className="d-field br-due">
        <span>{t('br.dueDay')}</span>
        <select value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))}>
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <small>{t('br.dueDayHint', { date: example })}</small>
      </label>
      <label className="d-switch">
        <input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} />
        <span>{t('br.reminders')}</span>
      </label>
      <fieldset className="br-reporting">
        <legend>{t('br.reportingTitle')}</legend>
        {data.branches.map((b) => (
          <label key={b} className="d-check">
            <input type="checkbox" checked={reporting.includes(b)} onChange={(e) => setReporting(e.target.checked ? [...reporting, b] : reporting.filter((x) => x !== b))} /> {b}
          </label>
        ))}
        <small className="d-muted">{t('br.reportingHint')}</small>
      </fieldset>
      {error && <p className="d-errors">{error}</p>}
      <div className="d-form-actions">
        <button type="button" className="d-btn d-btn-ink" onClick={save}>
          {t('br.saveSettings')}
        </button>
      </div>
    </section>
  )
}

/* ───────── branch leader view ───────── */

function BranchView() {
  const { t } = useT()
  const session = useSession()
  const monthLabel = useMonthLabel()
  const { data, error, reload, myBranch } = useBranchOverview()
  const [editing, setEditing] = useState<BranchReport | 'new' | null>(null)
  const [open, setOpen] = useState<BranchReport | null>(null)
  const [msg, setMsg] = useState('')
  if (!myBranch) return <div className="d-page"><p className="d-errors">{t('br.noBranch')}</p></div>
  if (!data) return <div className="d-page">{error ? <p className="d-errors">{error}</p> : <p className="d-muted">{t('common.loading')}</p>}</div>
  if (!data.allowed) return <NotIncluded />

  const current = data.reports.find((r) => r.period === data.currentPeriod)
  const late = today() > data.due && (!current || current.status === 'Returned')
  const due = fmtDate(data.due, { day: 'numeric', month: 'long' })
  return (
    <div className="d-page">
      <PageHead title={t('br.myTitle', { branch: myBranch })} />
      <p className="d-hint-box">{t('br.myIntro', { church: session.church?.name ?? '', period: monthLabel(data.currentPeriod), date: due })}</p>
      {msg && <p className="d-hint-box st-billing-ok">{msg}</p>}

      <section className="d-panel br-current">
        <div className="d-panel-head">
          <h2>{monthLabel(data.currentPeriod)}</h2>
          {current ? (
            <span className={`d-chip ${current.status === 'Reviewed' ? 't-ok' : current.status === 'Returned' ? 'br-late' : 't-purple'}`}>{t(`br.st_${current.status}`)}</span>
          ) : (
            <span className={`d-chip ${late ? 'br-late' : 't-mute'}`}>{late ? t('br.st_late') : t('br.due', { date: due })}</span>
          )}
        </div>
        {current?.status === 'Returned' && current.reviewNote && (
          <p className="d-errors">
            <AlertCircle size={15} /> {t('br.returned', { note: current.reviewNote })}
          </p>
        )}
        {current && <Totals r={current} />}
        <div className="d-form-actions">
          {current && (
            <button type="button" className="d-btn" onClick={() => setOpen(current)}>
              {t('br.view')}
            </button>
          )}
          {current?.status !== 'Reviewed' && (
            <button type="button" className="d-btn d-btn-ink" onClick={() => setEditing(current ?? 'new')}>
              <Send size={15} /> {current ? t('br.edit') : t('br.fill')}
            </button>
          )}
        </div>
      </section>

      <section className="d-panel">
        <div className="d-panel-head">
          <h2>{t('br.history')}</h2>
        </div>
        {data.reports.filter((r) => r.period !== data.currentPeriod).length ? (
          <ul className="d-list">
            {data.reports
              .filter((r) => r.period !== data.currentPeriod)
              .map((r) => (
                <li key={r.id}>
                  <div>
                    <b>{monthLabel(r.period)}</b>
                    <small>
                      {money(r.incomeTotal, r.currency)} · {money(r.expenseTotal, r.currency)}
                    </small>
                  </div>
                  <span className={`d-chip ${r.status === 'Reviewed' ? 't-ok' : r.status === 'Returned' ? 'br-late' : 't-purple'}`}>{t(`br.st_${r.status}`)}</span>
                  <button type="button" className="d-btn" onClick={() => setOpen(r)}>
                    {t('br.view')}
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <p className="d-empty-sm">{t('br.noHistory')}</p>
        )}
      </section>

      {open && <ReportView report={open} onClose={() => setOpen(null)} onEdit={open.status !== 'Reviewed' ? () => (setEditing(open), setOpen(null)) : undefined} />}
      {editing && (
        <ReportForm
          data={data}
          period={editing === 'new' ? data.currentPeriod : editing.period}
          branch={myBranch}
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setMsg(t('br.sent'))
            reload()
          }}
        />
      )}
    </div>
  )
}

/* ───────── shared pieces ───────── */

function Totals({ r }: { r: BranchReport }) {
  const { t } = useT()
  return (
    <dl className="br-totals">
      <div>
        <dt>{t('br.colIncome')}</dt>
        <dd>{money(r.incomeTotal, r.currency)}</dd>
      </div>
      <div>
        <dt>{t('br.colExpenses')}</dt>
        <dd>{money(r.expenseTotal, r.currency)}</dd>
      </div>
      <div>
        <dt>{t('br.colNet')}</dt>
        <dd>{money(r.incomeTotal - r.expenseTotal, r.currency)}</dd>
      </div>
      <div>
        <dt>{t('br.colAttendance')}</dt>
        <dd>{r.attendance ?? '—'}</dd>
      </div>
    </dl>
  )
}

function ReportView({ report: r, hq, onClose, onEdit, onChanged }: { report: BranchReport; hq?: boolean; onClose: () => void; onEdit?: () => void; onChanged?: (r: BranchReport) => void }) {
  const { t } = useT()
  const monthLabel = useMonthLabel()
  const [note, setNote] = useState('')
  const [returning, setReturning] = useState(false)
  const [error, setError] = useState('')
  const review = async (action: 'review' | 'return') => {
    if (action === 'return' && !note.trim()) return setError(t('br.sendBackPh'))
    const ok = await confirmAction(
      action === 'review'
        ? { title: t('br.confirmReview', { branch: r.branch, period: monthLabel(r.period) }) }
        : { title: t('br.confirmReturn', { branch: r.branch }), body: t('br.confirmReturnBody'), confirmLabel: t('br.sendBack') },
    )
    if (!ok) return
    try {
      const next = remote
        ? (await api<{ report: BranchReport }>(`/branches/report/${r.id}/review`, { action, note: note.trim() })).report
        : { ...r, status: (action === 'review' ? 'Reviewed' : 'Returned') as BranchReport['status'], reviewedBy: 'You', reviewedAt: new Date().toISOString(), reviewNote: note.trim() || null }
      if (!remote) demo.reports = demo.reports.map((x) => (x.id === r.id ? next : x))
      onChanged?.(next)
      setReturning(false)
    } catch (e) {
      setError(err(e))
    }
  }
  const lines = (title: string, l: Line[]) => (
    <div className="br-lines">
      <h3>{title}</h3>
      {l.length ? (
        <ul>
          {l.map((x, i) => (
            <li key={i}>
              <span>{x.label}</span>
              <b>{money(x.amount, r.currency, 2)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="d-muted">—</p>
      )}
    </div>
  )
  return (
    <Modal title={`${r.branch} · ${monthLabel(r.period)}`} onClose={onClose} wide>
      <div className="br-view">
        <p className="d-muted">
          <span className={`d-chip ${r.status === 'Reviewed' ? 't-ok' : r.status === 'Returned' ? 'br-late' : 't-purple'}`}>{t(`br.st_${r.status}`)}</span>{' '}
          {t('br.sentOn', { date: fmtDate(r.submittedAt.slice(0, 10)), name: r.submittedBy })}
          {r.reviewedAt && r.reviewedBy ? ` · ${t('br.reviewedBy', { name: r.reviewedBy, date: fmtDate(r.reviewedAt.slice(0, 10)) })}` : ''}
        </p>
        {r.status === 'Returned' && r.reviewNote && <p className="d-errors">{t('br.returned', { note: r.reviewNote })}</p>}
        <Totals r={r} />
        <div className="d-two">
          {lines(t('br.income'), r.income)}
          {lines(t('br.expenses'), r.expenses)}
        </div>
        {r.newMembers !== null && (
          <p>
            <b>{t('br.newMembers')}:</b> {r.newMembers}
          </p>
        )}
        {r.notes && (
          <p className="d-notes">
            <b>{t('br.notes')}:</b> {r.notes}
          </p>
        )}
        {returning && (
          <label className="d-field">
            <span>{t('br.sendBackPh')}</span>
            <textarea rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} autoFocus />
          </label>
        )}
        {error && <p className="d-errors">{error}</p>}
        <div className="d-form-actions">
          {onEdit && (
            <button type="button" className="d-btn" onClick={onEdit}>
              {t('br.edit')}
            </button>
          )}
          {hq && r.status === 'Submitted' && !returning && (
            <button type="button" className="d-btn" onClick={() => setReturning(true)}>
              <Undo2 size={15} /> {t('br.sendBack')}
            </button>
          )}
          {hq && returning && (
            <button type="button" className="d-btn" onClick={() => review('return')}>
              <Undo2 size={15} /> {t('br.sendBack')}
            </button>
          )}
          {hq && r.status !== 'Reviewed' && !returning && (
            <button type="button" className="d-btn d-btn-ink" onClick={() => review('review')}>
              <CheckCircle2 size={15} /> {t('br.markReviewed')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

type Row = { id: string; label: string; amount: string }
const toRows = (l: Line[]) => l.map((x) => ({ id: uid(), label: x.label, amount: String(x.amount) }))
const toLines = (rows: Row[]) => rows.filter((r) => r.label.trim() && r.amount !== '' && Number(r.amount) >= 0).map((r) => ({ label: r.label.trim(), amount: Number(r.amount) }))

function ReportForm({ data, period, branch: startBranch, chooseBranch, initial, onClose, onSaved }: { data: Overview; period: string; branch: string; chooseBranch?: boolean; initial?: BranchReport; onClose: () => void; onSaved: () => void }) {
  const { t } = useT()
  const monthLabel = useMonthLabel()
  const [branch, setBranch] = useState(startBranch)
  // Income starts with one line per fund; extra lines can be added.
  const [income, setIncome] = useState<Row[]>(() => {
    const have = initial?.income ?? []
    const fromFunds = data.funds.map((f) => ({ id: uid(), label: f, amount: String(have.find((x) => x.label === f)?.amount ?? '') }))
    return [...fromFunds, ...toRows(have.filter((x) => !data.funds.includes(x.label)))]
  })
  const [expenses, setExpenses] = useState<Row[]>(() => (initial?.expenses.length ? toRows(initial.expenses) : [{ id: uid(), label: '', amount: '' }]))
  const [attendance, setAttendance] = useState(initial?.attendance?.toString() ?? '')
  const [newMembers, setNewMembers] = useState(initial?.newMembers?.toString() ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const totals = useMemo(() => {
    const sum = (r: Row[]) => toLines(r).reduce((s, x) => s + x.amount, 0)
    return { income: sum(income), expenses: sum(expenses) }
  }, [income, expenses])
  const cur = data.currency

  const submit = async () => {
    const inc = toLines(income)
    const exp = toLines(expenses)
    if (!inc.length && !exp.length && attendance === '') return setError(t('br.errEmpty'))
    if (!(await confirmAction({ title: t('br.confirmSubmit', { period: monthLabel(period), branch }), body: t('br.confirmSubmitBody', { income: money(totals.income, cur, 2), expenses: money(totals.expenses, cur, 2) }), confirmLabel: t('br.submit') }))) return
    setBusy(true)
    setError('')
    try {
      const body = { branch, period, income: inc, expenses: exp, attendance: attendance === '' ? null : Number(attendance), newMembers: newMembers === '' ? null : Number(newMembers), notes }
      if (remote) await api('/branches/report', body, 'PUT')
      else {
        const r: BranchReport = { id: initial?.id ?? uid(), branch, period, currency: cur, income: inc, expenses: exp, incomeTotal: totals.income, expenseTotal: totals.expenses, attendance: body.attendance, newMembers: body.newMembers, notes, status: 'Submitted', submittedBy: 'You', submittedAt: new Date().toISOString(), reviewedBy: null, reviewedAt: null, reviewNote: null }
        demo.reports = [...demo.reports.filter((x) => !(x.branch === branch && x.period === period)), r]
      }
      onSaved()
    } catch (e) {
      setError(err(e))
    } finally {
      setBusy(false)
    }
  }

  const lineEditor = (rows: Row[], set: (r: Row[]) => void, ph: string, addLabel: string) => (
    <div className="br-edit-lines">
      {rows.map((r, i) => (
        <div key={r.id} className="br-line">
          <input value={r.label} placeholder={ph} maxLength={60} onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={ph} />
          <input type="number" min="0" step="0.01" inputMode="decimal" value={r.amount} placeholder="0" onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label={t('br.amount')} />
          <button type="button" className="d-circle d-circle-sm" aria-label={t('br.removeLine')} onClick={() => set(rows.filter((_, j) => j !== i))}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="d-link" onClick={() => set([...rows, { id: uid(), label: '', amount: '' }])}>
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  )

  return (
    <Modal title={`${branch} · ${monthLabel(period)}`} onClose={onClose} wide>
      <div className="d-form br-form">
        {chooseBranch && (
          <label className="d-field">
            <span>{t('br.branch')}</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              {data.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        )}
        {initial?.status === 'Returned' && initial.reviewNote && <p className="d-errors">{t('br.returned', { note: initial.reviewNote })}</p>}
        <div className="d-two">
          <section>
            <h3>{t('br.income')}</h3>
            <small className="d-muted">{t('br.incomeHint')}</small>
            {lineEditor(income, setIncome, t('br.incomePh'), t('br.addIncome'))}
            <p className="br-sum">
              {t('br.total')}: <b>{money(totals.income, cur, 2)}</b>
            </p>
          </section>
          <section>
            <h3>{t('br.expenses')}</h3>
            <small className="d-muted">&nbsp;</small>
            {lineEditor(expenses, setExpenses, t('br.expensePh'), t('br.addExpense'))}
            <p className="br-sum">
              {t('br.total')}: <b>{money(totals.expenses, cur, 2)}</b>
            </p>
          </section>
        </div>
        <p className="br-net">
          {t('br.net')}: <b>{money(totals.income - totals.expenses, cur, 2)}</b>
        </p>
        <div className="d-grid">
          <label className="d-field">
            <span>{t('br.attendance')}</span>
            <input type="number" min="0" step="1" inputMode="numeric" value={attendance} onChange={(e) => setAttendance(e.target.value)} />
          </label>
          <label className="d-field">
            <span>{t('br.newMembers')}</span>
            <input type="number" min="0" step="1" inputMode="numeric" value={newMembers} onChange={(e) => setNewMembers(e.target.value)} />
          </label>
        </div>
        <label className="d-field">
          <span>{t('br.notes')}</span>
          <textarea rows={3} maxLength={2000} value={notes} placeholder={t('br.notesPh')} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p className="d-errors">{error}</p>}
        <div className="d-form-actions">
          <button type="button" className="d-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="d-btn d-btn-ink" disabled={busy} onClick={submit}>
            <Send size={15} /> {initial ? t('br.update') : t('br.submit')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
