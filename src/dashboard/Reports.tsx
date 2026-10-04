import { BarChart3, Download, Lock, TrendingUp, Users } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { AskAI, Bars, downloadCsv, fmtDate, Kpi, money, PageHead, tEnum, today } from './kit'
import { getLocale, useT } from '../i18n'
import { useMembers } from './store'
import { can, STAGES } from './types'
import { useWorkspace } from './workspace'

function lastMonths(n: number) {
  const out: string[] = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}
const ml = (k: string) => new Date(k + '-01T00:00:00').toLocaleDateString(getLocale(), { month: 'short' })

function Card({ title, onExport, children, wide }: { title: string; onExport: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`d-panel ${wide ? 'd-span-2' : ''}`}>
      <div className="d-panel-head">
        <h2>{title}</h2>
        <button type="button" className="d-btn" onClick={onExport}>
          <Download size={14} /> CSV
        </button>
      </div>
      {children}
    </section>
  )
}

function Meters({ rows }: { rows: { k: string; v: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.v))
  const total = rows.reduce((s, r) => s + r.v, 0) || 1
  return (
    <ul className="d-meter-list">
      {rows.map(({ k, v }) => (
        <li key={k}>
          <span>{k}</span>
          <b>
            {v} <small>({Math.round((v / total) * 100)}%)</small>
          </b>
          <i>
            <em style={{ width: `${(v / max) * 100}%` }} />
          </i>
        </li>
      ))}
    </ul>
  )
}

export default function Reports() {
  const { members, role } = useMembers()
  const { events, settings, anonGifts, expenses } = useWorkspace()
  const months = lastMonths(12)
  const stamp = today()
  const { t } = useT()

  const growth = months.map((k) => ({ label: ml(k), key: k, value: members.filter((m) => m.dateJoined.startsWith(k)).length }))
  const stages = STAGES.map((s) => ({ k: tEnum('stage', s), v: members.filter((m) => m.stage === s).length }))
  const branches = settings.branches.map((b) => ({ k: b, v: members.filter((m) => m.branch === b).length })).filter((x) => x.v)
  const depts = settings.departments.map((d) => ({ k: d, v: members.filter((m) => m.department === d).length })).filter((x) => x.v)
  const gender = ['Female', 'Male', ''].map((g) => ({ k: g ? tEnum('gender', g) : t('common.notSet'), v: members.filter((m) => m.gender === g).length })).filter((x) => x.v)
  const attended = events.filter((e) => e.attendance !== null).sort((a, b) => a.date.localeCompare(b.date))

  const gifts = useMemo(
    () => [
      ...members.flatMap((m) => m.giving.map((g) => ({ ...g, donor: m.fullName }))),
      ...anonGifts.map((g) => ({ ...g })),
    ],
    [members, anonGifts],
  )
  const giving6 = months.slice(-6).map((k) => ({ label: ml(k), key: k, value: gifts.filter((g) => g.date.startsWith(k)).reduce((s, g) => s + g.amount, 0) }))
  const byFund = settings.funds.map((f) => ({ k: f, v: gifts.filter((g) => g.fund === f).reduce((s, g) => s + g.amount, 0) }))
  const yearJoined = members.filter((m) => m.dateJoined >= months[0]).length

  return (
    <div className="d-page">
      <PageHead title={t('reports.title')}>
        <Kpi icon={<Users size={17} />} value={members.length} label={t('reports.people')} />
        <Kpi icon={<TrendingUp size={17} />} value={`+${yearJoined}`} label={t('reports.joined12')} />
        <Kpi icon={<BarChart3 size={17} />} value={attended.length ? Math.round(attended.reduce((s, e) => s + (e.attendance ?? 0), 0) / attended.length) : '—'} label={t('reports.avgAttendance')} />
      </PageHead>

      <div className="d-toolrow">
        <span />
        <AskAI label={t('reports.generateAi')} k="report" />
      </div>
      <div className="d-two">
        <Card title={t('reports.newPerMonth')} wide onExport={() => downloadCsv(`membership-growth-${stamp}.csv`, [[t('reports.month'), t('reports.newPeople')], ...growth.map((g) => [g.key, g.value])])}>
          <Bars data={growth} tone="lime" />
        </Card>
        <Card title={t('reports.stages')} onExport={() => downloadCsv(`stages-${stamp}.csv`, [[t('members.stage'), t('reports.people')], ...stages.map((s) => [s.k, s.v])])}>
          <Meters rows={stages} />
        </Card>
        <Card title={t('settings.structure.branches')} onExport={() => downloadCsv(`branches-${stamp}.csv`, [[t('members.branch'), t('reports.people')], ...branches.map((s) => [s.k, s.v])])}>
          <Meters rows={branches} />
        </Card>
        <Card title={t('settings.structure.departments')} onExport={() => downloadCsv(`departments-${stamp}.csv`, [[t('members.department'), t('reports.people')], ...depts.map((s) => [s.k, s.v])])}>
          <Meters rows={depts} />
        </Card>
        <Card title={t('members.gender')} onExport={() => downloadCsv(`gender-${stamp}.csv`, [[t('members.gender'), t('reports.people')], ...gender.map((s) => [s.k, s.v])])}>
          <Meters rows={gender} />
        </Card>
        <Card title={t('reports.attendance')} wide onExport={() => downloadCsv(`attendance-${stamp}.csv`, [[t('common.date'), t('msg.field.event'), t('reports.invited'), t('reports.attended')], ...attended.map((e) => [e.date, e.title, e.invited, e.attendance ?? ''])])}>
          {attended.length ? (
            <Bars data={attended.slice(-10).map((e) => ({ label: fmtDate(e.date, { month: 'short', day: 'numeric' }), value: e.attendance ?? 0 }))} />
          ) : (
            <p className="d-empty-sm">{t('reports.noAttendance')}</p>
          )}
        </Card>

        {can.viewGiving(role) ? (
          <>
            <Card title={t('giving.last6')} onExport={() => downloadCsv(`giving-by-month-${stamp}.csv`, [[t('reports.month'), t('common.amount')], ...giving6.map((g) => [g.key, g.value])])}>
              <Bars data={giving6} format={(n) => (n ? money(n, settings.currency) : '')} />
            </Card>
            <Card
              title={t('reports.byFund')}
              onExport={() =>
                downloadCsv(`giving-by-fund-${stamp}.csv`, [[t('giving.fund'), t('common.amount')], ...byFund.map((f) => [f.k, f.v]), [], [t('reports.totalExpenses'), expenses.reduce((s, x) => s + x.amount, 0)]])
              }
            >
              <Meters rows={byFund} />
            </Card>
          </>
        ) : (
          <p className="d-locked d-span-2">
            <Lock size={14} /> {t('reports.locked')}
          </p>
        )}
      </div>
    </div>
  )
}
