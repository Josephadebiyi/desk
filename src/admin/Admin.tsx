/**
 * ZionDesk staff console (/admin). Only emails listed in ADMIN_EMAILS on the server get data;
 * everyone else sees "Staff only". Internal tool, English only.
 */
import { BadgePercent, Bell, Building2, CreditCard, Gauge, LayoutGrid, LifeBuoy, LogOut, Maximize2, Search, ShieldCheck, Sparkles, TicketPercent, TriangleAlert, UserRound, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { formatMoney } from '../lib/currency'
import { useSession } from '../lib/session'
import { Churches, Payments, Promos, Support, System, UsersPage } from './AdminPages'
import './admin.css'

export interface Overview {
  churches: number
  users: number
  members: number
  openTickets: number
  flyersThisMonth: number
  status: Record<'trial' | 'active' | 'past_due' | 'cancelled' | 'expired', number>
  plans: Record<'essentials' | 'plus' | 'max', number>
  mrr: Record<string, number>
  growth: { month: string; signups: number; revenue: Record<string, number>; gifts: number }[]
  promos: { active: number; total: number }
  recent: { id: string; name: string; plan: string; plan_status: string; created_at: string; currency: string }[]
}

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/admin/churches', label: 'Churches', icon: Building2 },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/promos', label: 'Promo codes', icon: TicketPercent },
  { to: '/admin/support', label: 'Support', icon: LifeBuoy },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/system', label: 'System', icon: Gauge },
]

export const initialsOf = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

export const fmtDay = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export function Card({ title, sub, action, children, className = '' }: { title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`adm-card ${className}`}>
      <div className="adm-card-head">
        <div>
          <h2>{title}</h2>
          {sub && <small>{sub}</small>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Head({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="adm-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  )
}

/* ───────── chart: smooth stacked areas with thin columns (reference style) ───────── */

function smooth(points: [number, number][]) {
  if (points.length < 2) return ''
  let d = `M${points[0][0]},${points[0][1]}`
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const cx = (x0 + x1) / 2
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`
  }
  return d
}

function GrowthChart({ data }: { data: Overview['growth'] }) {
  const W = 760
  const H = 330
  const pad = { l: 8, r: 48, t: 30, b: 40 }
  const max = Math.max(4, ...data.map((d) => Math.max(d.signups, d.gifts)))
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const signups = data.map((d, i) => [x(i), y(d.signups)] as [number, number])
  const gifts = data.map((d, i) => [x(i), y(d.gifts)] as [number, number])
  const area = (pts: [number, number][]) => `${smooth(pts)} L${pts[pts.length - 1][0]},${H - pad.b} L${pts[0][0]},${H - pad.b} Z`
  const peak = data.reduce((best, d, i) => (d.signups > data[best].signups ? i : best), data.length - 1)
  const month = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short' })
  const cols = 60
  return (
    <svg className="adm-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sign-ups and gifts over the last six months">
      <defs>
        <linearGradient id="g-sign" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#a78bfa" stopOpacity="0.45" />
          <stop offset="1" stopColor="#a78bfa" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="g-gift" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f3a6c4" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f3a6c4" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="g-col" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7cb7f2" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7cb7f2" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="rgba(17,16,21,.06)" />
          <text x={W - pad.r + 8} y={y(max * f) + 4}>
            {Math.round(max * f)}
          </text>
        </g>
      ))}
      {/* thin columns under the curves */}
      {Array.from({ length: cols }, (_, i) => {
        const t = i / (cols - 1)
        const xi = pad.l + t * (W - pad.l - pad.r)
        const idx = Math.min(data.length - 2, Math.floor(t * (data.length - 1)))
        const local = t * (data.length - 1) - idx
        const v = data[idx].signups + (data[idx + 1]?.signups - data[idx].signups || 0) * local
        return <rect key={i} x={xi - 1.5} width={3} rx={1.5} y={y(v * 0.85)} height={Math.max(0, H - pad.b - y(v * 0.85))} fill="url(#g-col)" />
      })}
      <path d={area(gifts)} fill="url(#g-gift)" />
      <path d={smooth(gifts)} fill="none" stroke="#f3a6c4" strokeWidth={2} />
      <path d={area(signups)} fill="url(#g-sign)" />
      <path d={smooth(signups)} fill="none" stroke="#8b6cf6" strokeWidth={2} />
      {data.map((d, i) => (
        <g key={d.month}>
          <rect x={x(i) - 26} y={H - 18} width={52} height={4} rx={2} fill={i === data.length - 1 ? '#b8eccd' : '#e7e8ef'} />
          <text x={x(i)} y={H - 24} textAnchor="middle">
            {month(d.month)}
          </text>
        </g>
      ))}
      {/* tooltip on the best month */}
      <circle cx={x(peak)} cy={y(data[peak].signups)} r={9} fill="#8b6cf6" opacity={0.2} />
      <circle cx={x(peak)} cy={y(data[peak].signups)} r={4.5} fill="#6c34ff" stroke="#fff" strokeWidth={2} />
      <g transform={`translate(${Math.min(Math.max(x(peak) - 150, 0), W - 170)}, ${Math.max(y(data[peak].signups) - 22, 0)})`}>
        <rect className="adm-tip" width={130} height={40} rx={12} />
        <text x={14} y={18} fill="#fff" style={{ fill: '#fff', fontSize: 14, fontWeight: 600 }}>
          +{data[peak].signups}
        </text>
        <text x={14} y={32} style={{ fill: 'rgba(255,255,255,.7)', fontSize: 10.5 }}>
          New churches
        </text>
      </g>
    </svg>
  )
}

/* ───────── dashboard ───────── */

interface PromoRow {
  id: string
  code: string
  kind: 'percent' | 'free_days'
  percent_off: number | null
  free_days: number | null
  duration_months: number | null
  redemptions: number
  activeNow: number
  active: boolean
}

function Dashboard() {
  const [o, setO] = useState<Overview | null>(null)
  const [promos, setPromos] = useState<PromoRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api<Overview>('/admin/overview').then(setO).catch((e) => setError(e.message))
    api<{ promos: PromoRow[] }>('/admin/promos').then((r) => setPromos(r.promos)).catch(() => {})
  }, [])
  const mrr = useMemo(() => Object.entries(o?.mrr ?? {}).map(([c, v]) => formatMoney(v, c)).join(' · ') || formatMoney(0, 'USD'), [o])
  if (error) return <p className="adm-err">{error}</p>
  if (!o) return <p className="adm-empty">Loading…</p>
  const total = Math.max(1, o.churches)
  const pct = (n: number) => Math.round((n / total) * 100)
  const lastMonth = o.growth[o.growth.length - 1]
  return (
    <>
      <Head title="Dashboard" sub={`${o.churches} churches · ${o.users} users · ${o.members.toLocaleString()} members on ZionDesk`} />
      <div className="adm-kpis">
        <div className="adm-kpi">
          <small>Monthly recurring revenue</small>
          <b style={{ fontSize: Object.keys(o.mrr).length > 1 ? 18 : 26 }}>{mrr}</b>
        </div>
        <div className="adm-kpi">
          <small>Paying churches</small>
          <b>{o.status.active}</b>
          <em>{pct(o.status.active)}% of all</em>
        </div>
        <div className="adm-kpi">
          <small>New this month</small>
          <b>{lastMonth?.signups ?? 0}</b>
        </div>
        <div className="adm-kpi">
          <small>Open tickets</small>
          <b>{o.openTickets}</b>
        </div>
        <div className="adm-kpi">
          <small>AI flyers this month</small>
          <b>{o.flyersThisMonth}</b>
        </div>
        <div className="adm-kpi">
          <small>Promos in use</small>
          <b>{o.promos.active}</b>
        </div>
      </div>

      <div className="adm-grid">
        <Card title="Plans" sub="Churches on each plan" action={<Link to="/admin/churches" className="adm-circle" aria-label="Open churches"><Maximize2 size={15} /></Link>}>
          {(
            [
              ['essentials', 'Essentials', 'Members, giving, messaging & Ellen', 'is-lav'],
              ['plus', 'Ministry Plus', 'Design Studio, online giving & QR codes', 'is-sky'],
              ['max', 'Ministry Max', 'Everything + the ZionDesk design team', 'is-mint'],
            ] as const
          ).map(([k, name, text, tone]) => (
            <div key={k} className={`adm-plan ${tone}`}>
              <h3>{name}</h3>
              <p>{text}</p>
              <footer>
                <span>
                  <i className="ico">
                    <Building2 size={14} />
                  </i>
                  {pct(o.plans[k])}% of churches
                </span>
                <b>{o.plans[k]}</b>
              </footer>
            </div>
          ))}
        </Card>
        <Card title="Growth" sub="New churches and online gifts, last 6 months" action={<span className="adm-chip">Monthly</span>}>
          <div className="adm-legend">
            <span>
              <i style={{ background: '#8b6cf6' }} />
              New churches
            </span>
            <span>
              <i style={{ background: '#f3a6c4' }} />
              Online gifts
            </span>
            <span>
              <i style={{ background: '#7cb7f2' }} />
              Trend
            </span>
          </div>
          <GrowthChart data={o.growth} />
        </Card>
      </div>

      <div className="adm-grid-b">
        <Card title="Subscription health" sub="Where every church is in its billing cycle" action={<span className="adm-chip">All time</span>}>
          <div className="adm-rows">
            {(
              [
                ['active', 'Active subscriptions', ShieldCheck],
                ['trial', 'On free trial', Sparkles],
                ['past_due', 'Payment overdue', TriangleAlert],
                ['cancelled', 'Cancelled (still in paid period)', BadgePercent],
                ['expired', 'Expired', UserRound],
              ] as const
            ).map(([k, label, Icon]) => (
              <div key={k} className="adm-row">
                <i className="ico">
                  <Icon size={16} />
                </i>
                <div>
                  <span>{label}</span>
                  <div className="adm-bar">
                    <i style={{ width: `${pct(o.status[k])}%` }} />
                  </div>
                </div>
                <b>{pct(o.status[k])}%</b>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Promo codes" sub="Most redeemed codes" action={<Link to="/admin/promos" className="adm-chip">All</Link>}>
          <div className="adm-board">
            {[...promos]
              .sort((a, b) => b.redemptions - a.redemptions)
              .slice(0, 4)
              .map((p, i) => (
                <div key={p.id}>
                  <span className={`av ${['is-lav', 'is-sky', 'is-mint', 'is-peach'][i % 4]}`}>{p.kind === 'percent' ? `${p.percent_off}%` : `${p.free_days}d`}</span>
                  <span>
                    <b>{p.code}</b>
                    <small>
                      {p.active ? 'Active' : 'Paused'} · {p.activeNow} using now
                    </small>
                  </span>
                  <b className="num">{p.redemptions}</b>
                </div>
              ))}
            {!promos.length && <p className="adm-empty">No promo codes yet — create one in Promo codes.</p>}
          </div>
        </Card>
      </div>

      <Card title="Newest churches" sub="Latest sign-ups">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <tbody>
              {o.recent.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                    <small>{fmtDay(c.created_at)}</small>
                  </td>
                  <td>{c.plan}</td>
                  <td>
                    <span className={`adm-pill ${c.plan_status}`}>{c.plan_status.replace('_', ' ')}</span>
                  </td>
                  <td>{c.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

/* ───────── shell ───────── */

export default function Admin() {
  const session = useSession()
  const navigate = useNavigate()
  const [state, setState] = useState<'loading' | 'staff' | 'denied' | 'unconfigured'>('loading')
  useEffect(() => {
    document.title = 'ZionDesk Admin'
  }, [])
  useEffect(() => {
    if (!session.session) return
    api<{ admin: boolean; configured: boolean }>('/admin/me')
      .then((r) => setState(r.admin ? 'staff' : r.configured ? 'denied' : 'unconfigured'))
      .catch(() => setState('denied'))
  }, [session.session])

  if (!session.remote) return <Gate title="Admin needs the live backend" text="Connect Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) to use the staff console." />
  if (session.loading) return <Gate title="Loading…" />
  if (!session.session) return <Navigate to="/login?next=/admin" replace />
  if (state === 'loading') return <Gate title="Checking access…" />
  if (state === 'unconfigured') return <Gate title="Staff console not set up" text="Add ADMIN_EMAILS (your staff emails, comma-separated) in Render → Environment, then redeploy." />
  if (state === 'denied') return <Gate title="Staff only" text={`${session.email} isn’t a ZionDesk staff account.`} />

  const name = session.name || session.email
  return (
    <div className="adm">
      <div className="adm-frame">
        <header className="adm-top">
          <Link to="/admin" className="adm-logo" aria-label="ZionDesk admin">
            <img src="/brand/mark.png" alt="ZionDesk" />
          </Link>
          <span className="adm-brand">
            <b>ZionDesk</b>
            <small>Staff console</small>
          </span>
          <nav className="adm-nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="adm-tools">
            <button type="button" className="adm-circle" aria-label="Search churches" onClick={() => navigate('/admin/churches')}>
              <Search size={17} />
            </button>
            <button type="button" className="adm-circle" aria-label="Support tickets" onClick={() => navigate('/admin/support')}>
              <Bell size={17} />
            </button>
            <span className="adm-avatar" title={name}>
              {session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : initialsOf(name)}
            </span>
          </div>
        </header>
        <aside className="adm-rail">
          <nav aria-label="Sections">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} title={n.label} aria-label={n.label}>
                <n.icon size={17} />
              </NavLink>
            ))}
          </nav>
          <nav>
            <Link to="/dashboard" title="Back to the church dashboard" aria-label="Back to the church dashboard">
              <LayoutGrid size={17} />
            </Link>
            <button
              type="button"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                await session.signOut()
                navigate('/login')
              }}
            >
              <LogOut size={17} />
            </button>
          </nav>
        </aside>
        <main className="adm-main">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="churches" element={<Churches />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="promos" element={<Promos />} />
            <Route path="support" element={<Support />} />
            <Route path="payments" element={<Payments />} />
            <Route path="system" element={<System />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function Gate({ title, text }: { title: string; text?: string }) {
  return (
    <div className="adm">
      <div className="adm-gate">
        <div className="adm-card">
          <span className="adm-logo">
            <img src="/brand/mark.png" alt="ZionDesk" />
          </span>
          <h2 style={{ margin: 0, fontFamily: 'var(--grotesk)' }}>{title}</h2>
          {text && <p style={{ margin: 0, color: '#8b8a98' }}>{text}</p>}
          <Link to="/" className="adm-btn ghost">
            Back to site
          </Link>
        </div>
      </div>
    </div>
  )
}
