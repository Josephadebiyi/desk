import { Ban, CheckCircle2, Plus, RotateCcw, Search, Send, XCircle } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { downloadCsv } from './AdminDetail'
import { api } from '../lib/api'
import { formatMoney } from '../lib/currency'
import { Card, fmtDay, Head } from './Admin'
import { ticketRef } from '../lib/refs'

const PLAN_LABEL: Record<string, string> = { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' }
const STATUSES = ['trial', 'active', 'past_due', 'cancelled', 'expired'] as const
const err = (e: unknown) => (e instanceof Error ? e.message : String(e))
const plusDays = (days: number, from?: string | null) => new Date((from && new Date(from) > new Date() ? new Date(from) : new Date()).getTime() + days * 864e5).toISOString()

function useDebounced(v: string, ms = 300) {
  const [d, setD] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return d
}

/* ───────── churches ───────── */

interface ChurchRow {
  id: string
  name: string
  slug: string
  location: string
  email: string
  currency: string
  plan: string
  plan_status: string
  plan_renews_at: string | null
  trial_ends_at: string | null
  created_at: string
  members: number
  team: number
  admins: string[]
  onlineGiving: boolean
}

export function Churches() {
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const fStatus = sp.get('status') ?? ''
  const fPlan = sp.get('plan') ?? ''
  const fCode = sp.get('code') ?? ''
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [rows, setRows] = useState<ChurchRow[] | null>(null)
  const [msg, setMsg] = useState('')
  const load = () => api<{ churches: ChurchRow[] }>(`/admin/churches?q=${encodeURIComponent(dq)}&code=${encodeURIComponent(fCode)}`).then((r) => setRows(r.churches)).catch((e) => setMsg(err(e)))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, fCode])
  const shown = (rows ?? []).filter((c) => (!fStatus || c.plan_status === fStatus) && (!fPlan || c.plan === fPlan))
  const patch = async (id: string, body: Record<string, unknown>, done: string) => {
    setMsg('')
    try {
      await api(`/admin/churches/${id}`, body, 'PATCH')
      setMsg(done)
      load()
    } catch (e) {
      setMsg(err(e))
    }
  }
  return (
    <>
      <Head title="Churches" sub={fCode ? `Churches that signed up with code ${fCode}` : 'Every church on ZionDesk — plans, billing state and size.'}>
        {fCode && (
          <button type="button" className="adm-chip" onClick={() => setSp((p) => (p.delete('code'), p))}>
            Code: {fCode} ✕
          </button>
        )}
        <label className="adm-search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or city" />
        </label>
      </Head>
      {msg && <p className="adm-ok">{msg}</p>}
      <div className="adm-toolbar">
        {(['', ...STATUSES] as string[]).map((st) => (
          <button key={st || 'all'} type="button" className={`adm-chip ${fStatus === st ? 'is-on' : ''}`} onClick={() => setSp(st ? { status: st } : {})}>
            {st ? st.replace('_', ' ') : 'all'} {rows ? `(${(rows ?? []).filter((c) => !st || c.plan_status === st).length})` : ''}
          </button>
        ))}
        {fPlan && (
          <button type="button" className="adm-chip is-on" onClick={() => setSp({})}>
            {PLAN_LABEL[fPlan]} ✕
          </button>
        )}
      </div>
      <Card
        title={`${shown.length} churches`}
        sub="Click a church to open it"
        action={
          <button type="button" className="adm-chip" onClick={() => downloadCsv('ziondesk-churches', shown.map(({ id, name, location, email, currency, plan, plan_status, plan_renews_at, trial_ends_at, created_at, members, team, admins }) => ({ id, name, location, email, currency, plan, plan_status, plan_renews_at, trial_ends_at, created_at, members, team, admins: admins.join(' ') })))}>
            Export CSV
          </button>
        }
      >
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Church</th>
                <th>Admins</th>
                <th>Members</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Renews / trial ends</th>
                <th>Quick actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="adm-click" onClick={(e) => !(e.target as HTMLElement).closest('select,button') && navigate(`/admin/churches/${c.id}`)}>
                  <td>
                    <b>{c.name}</b>
                    <small>
                      {c.location || '—'} · {c.currency} · joined {fmtDay(c.created_at)}
                      {c.onlineGiving ? ' · online giving' : ''}
                    </small>
                  </td>
                  <td>
                    {c.admins.join(', ') || '—'}
                    <small>{c.team} team</small>
                  </td>
                  <td>{c.members}</td>
                  <td>
                    <select className="adm-select" value={c.plan} onChange={(e) => patch(c.id, { plan: e.target.value }, `${c.name}: plan changed`)}>
                      {Object.entries(PLAN_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select className="adm-select" value={c.plan_status} onChange={(e) => patch(c.id, { plan_status: e.target.value }, `${c.name}: status changed`)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{c.plan_status === 'trial' ? fmtDay(c.trial_ends_at) : fmtDay(c.plan_renews_at)}</td>
                  <td>
                    <div className="adm-toolbar">
                      <button type="button" className="adm-chip" onClick={() => patch(c.id, { plan_status: 'trial', trial_ends_at: plusDays(7, c.trial_ends_at) }, `${c.name}: trial extended 7 days`)}>
                        +7 days trial
                      </button>
                      <button type="button" className="adm-chip" onClick={() => patch(c.id, { plan_status: 'active', plan_renews_at: plusDays(30, c.plan_renews_at) }, `${c.name}: 1 free month added`)}>
                        +1 free month
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows && !rows.length && <p className="adm-empty">No churches found.</p>}
        </div>
      </Card>
    </>
  )
}

/* ───────── users ───────── */

interface UserRow {
  id: string
  email: string
  name: string
  createdAt: string
  lastSignIn: string | null
  confirmed: boolean
  providers: string[]
  suspended: boolean
  staff: boolean
  churches: { name: string; role: string }[]
}

export function UsersPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ users: UserRow[]; more: boolean } | null>(null)
  const [msg, setMsg] = useState('')
  const load = () => api<{ users: UserRow[]; more: boolean }>(`/admin/users?q=${encodeURIComponent(dq)}&page=${page}`).then(setData).catch((e) => setMsg(err(e)))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq, page])
  const suspend = async (u: UserRow) => {
    if (!window.confirm(u.suspended ? `Restore access for ${u.email}?` : `Suspend ${u.email}? They won’t be able to sign in.`)) return
    try {
      await api(`/admin/users/${u.id}/suspend`, { suspended: !u.suspended })
      load()
    } catch (e) {
      setMsg(err(e))
    }
  }
  return (
    <>
      <Head title="Users" sub="Everyone who can sign in to ZionDesk.">
        <label className="adm-search">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name" />
        </label>
      </Head>
      {msg && <p className="adm-err">{msg}</p>}
      <Card title="Accounts" sub={data ? `Page ${page}` : 'Loading…'} action={<div className="adm-toolbar"><button type="button" className="adm-chip" onClick={() => downloadCsv('ziondesk-users', (data?.users ?? []).map((u) => ({ id: u.id, name: u.name, email: u.email, churches: u.churches.map((c) => `${c.name} (${c.role})`).join('; '), joined: u.createdAt, lastSignIn: u.lastSignIn ?? '', confirmed: u.confirmed, suspended: u.suspended })))}>Export CSV</button><button type="button" className="adm-chip" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><button type="button" className="adm-chip" disabled={!data?.more} onClick={() => setPage(page + 1)}>Next</button></div>}>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Churches</th>
                <th>Sign-in</th>
                <th>Joined</th>
                <th>Last active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr key={u.id} className="adm-click" onClick={(e) => !(e.target as HTMLElement).closest('button') && navigate(`/admin/users/${u.id}`)}>
                  <td>
                    <b>{u.name || '—'}</b>
                    <small>
                      {u.email}
                      {u.staff ? ' · staff' : ''}
                    </small>
                  </td>
                  <td>{u.churches.map((c) => `${c.name} (${c.role})`).join(', ') || '—'}</td>
                  <td>
                    {u.providers.join(', ') || 'email'}
                    <small>{u.confirmed ? 'email confirmed' : 'not confirmed'}</small>
                  </td>
                  <td>{fmtDay(u.createdAt)}</td>
                  <td>{fmtDay(u.lastSignIn)}</td>
                  <td>
                    {u.suspended && <span className="adm-pill failed">suspended</span>}{' '}
                    {!u.staff && (
                      <button type="button" className="adm-chip" onClick={() => suspend(u)}>
                        {u.suspended ? <RotateCcw size={13} /> : <Ban size={13} />} {u.suspended ? 'Restore' : 'Suspend'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

/* ───────── promo codes ───────── */

interface Promo {
  id: string
  code: string
  description: string
  kind: 'percent' | 'free_days' | 'tracking'
  percent_off: number | null
  duration_months: number | null
  free_days: number | null
  plans: string[]
  max_redemptions: number | null
  starts_at: string
  expires_at: string | null
  active: boolean
  created_at: string
  redemptions: number
  signups: number
  activeNow: number
  recent: { church: string; at: string; status: string }[]
}

const offer = (p: Pick<Promo, 'kind' | 'percent_off' | 'duration_months' | 'free_days'>) =>
  p.kind === 'tracking' ? 'Tracking only (no discount)' : p.kind === 'free_days' ? `${p.free_days} days free` : `${p.percent_off}% off ${p.duration_months ? `for ${p.duration_months} month${p.duration_months > 1 ? 's' : ''}` : 'forever'}`

const BLANK = { code: '', description: '', kind: 'percent' as 'percent' | 'free_days' | 'tracking', percent_off: '20', duration_months: '3', free_days: '30', plans: [] as string[], max_redemptions: '', expires_at: '' }

export function Promos() {
  const [rows, setRows] = useState<Promo[] | null>(null)
  const [f, setF] = useState(BLANK)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => api<{ promos: Promo[] }>('/admin/promos').then((r) => setRows(r.promos)).catch((e) => setError(err(e)))
  useEffect(() => {
    load()
  }, [])
  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setMsg('')
    setBusy(true)
    try {
      await api('/admin/promos', {
        code: f.code,
        description: f.description,
        kind: f.kind,
        percent_off: Number(f.percent_off),
        duration_months: f.duration_months ? Number(f.duration_months) : null,
        free_days: Number(f.free_days),
        plans: f.plans,
        max_redemptions: f.max_redemptions ? Number(f.max_redemptions) : null,
        expires_at: f.expires_at ? new Date(f.expires_at + 'T23:59:59').toISOString() : null,
      })
      setMsg(`${f.code.toUpperCase()} created`)
      setF(BLANK)
      load()
    } catch (ex) {
      setError(err(ex))
    } finally {
      setBusy(false)
    }
  }
  const toggle = async (p: Promo) => {
    await api(`/admin/promos/${p.id}`, { active: !p.active }, 'PATCH').catch((e) => setError(err(e)))
    load()
  }
  const status = (p: Promo) => {
    if (!p.active) return ['cancelled', 'paused']
    if (p.expires_at && new Date(p.expires_at) < new Date()) return ['expired', 'expired']
    if (p.max_redemptions && p.redemptions >= p.max_redemptions) return ['expired', 'used up']
    if (new Date(p.starts_at) > new Date()) return ['trial', 'scheduled']
    return ['active', 'live']
  }
  return (
    <>
      <Head title="Promo codes" sub="Share a link like ziondesk.com/?promo=CODE — the code is filled in at sign-up, so you can see every church each campaign brought in. Discounts apply in Settings → Plan." />
      <Card title="Create a promo code">
        <form className="adm-form" onSubmit={create}>
          <label>
            Code
            <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="EASTER25" required minLength={3} maxLength={32} />
          </label>
          <label>
            Type
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'percent' | 'free_days' | 'tracking' })}>
              <option value="percent">% off monthly price</option>
              <option value="free_days">Free days (no card)</option>
              <option value="tracking">Tracking only — PR / partner (no discount)</option>
            </select>
          </label>
          {f.kind === 'tracking' ? null : f.kind === 'percent' ? (
            <>
              <label>
                Percent off
                <input type="number" min={1} max={99} value={f.percent_off} onChange={(e) => setF({ ...f, percent_off: e.target.value })} />
              </label>
              <label>
                Duration (months, empty = forever)
                <input type="number" min={1} max={36} value={f.duration_months} onChange={(e) => setF({ ...f, duration_months: e.target.value })} />
              </label>
            </>
          ) : (
            <label>
              Free days
              <input type="number" min={1} max={365} value={f.free_days} onChange={(e) => setF({ ...f, free_days: e.target.value })} />
            </label>
          )}
          <label>
            Max churches (empty = unlimited)
            <input type="number" min={1} value={f.max_redemptions} onChange={(e) => setF({ ...f, max_redemptions: e.target.value })} />
          </label>
          <label>
            Expires on (optional)
            <input type="date" value={f.expires_at} onChange={(e) => setF({ ...f, expires_at: e.target.value })} />
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            Note (internal)
            <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Partner churches Lagos 2026" />
          </label>
          <div className="adm-checks">
            Plans:
            {Object.entries(PLAN_LABEL).map(([k, v]) => (
              <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'inherit', fontSize: 13 }}>
                <input type="checkbox" style={{ height: 'auto' }} checked={f.plans.includes(k)} onChange={(e) => setF({ ...f, plans: e.target.checked ? [...f.plans, k] : f.plans.filter((x) => x !== k) })} />
                {v}
              </label>
            ))}
            <small style={{ color: '#8b8a98' }}>(none ticked = all plans)</small>
          </div>
          <button type="submit" className="adm-btn" disabled={busy}>
            <Plus size={15} /> Create code
          </button>
        </form>
        {error && <p className="adm-err">{error}</p>}
        {msg && <p className="adm-ok">{msg}</p>}
      </Card>
      <Card title="All codes" sub="Redemptions count churches that paid or started free days.">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Offer</th>
                <th>Plans</th>
                <th>Sign-ups</th>
                <th>Used</th>
                <th>Active now</th>
                <th>Window</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((p) => {
                const [tone, label] = status(p)
                return (
                  <tr key={p.id}>
                    <td>
                      <b>{p.code}</b>
                      <small>{p.description || '—'}</small>
                    </td>
                    <td>{offer(p)}</td>
                    <td>{p.plans.length ? p.plans.map((x) => PLAN_LABEL[x]).join(', ') : 'All'}</td>
                    <td>
                      {p.signups ? (
                        <Link to={`/admin/churches?code=${encodeURIComponent(p.code)}`} className="adm-link">
                          {p.signups} →
                        </Link>
                      ) : (
                        0
                      )}
                      <small>
                        <button type="button" className="adm-link" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => navigator.clipboard?.writeText(`https://ziondesk.com/?promo=${p.code}`)}>
                          copy link
                        </button>
                      </small>
                    </td>
                    <td>
                      {p.redemptions}
                      {p.max_redemptions ? ` / ${p.max_redemptions}` : ''}
                      {p.recent.length > 0 && <small>latest: {p.recent[0].church}</small>}
                    </td>
                    <td>{p.activeNow}</td>
                    <td>
                      {fmtDay(p.starts_at)} → {p.expires_at ? fmtDay(p.expires_at) : 'no end'}
                    </td>
                    <td>
                      <span className={`adm-pill ${tone}`}>{label}</span>
                    </td>
                    <td>
                      <button type="button" className="adm-chip" onClick={() => toggle(p)}>
                        {p.active ? <XCircle size={13} /> : <CheckCircle2 size={13} />} {p.active ? 'Pause' : 'Resume'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows && !rows.length && <p className="adm-empty">No codes yet.</p>}
        </div>
      </Card>
    </>
  )
}

/* ───────── support ───────── */

interface TicketRow {
  id: string
  subject: string
  email: string
  name: string
  status: 'open' | 'pending' | 'closed'
  priority: 'low' | 'normal' | 'high'
  created_at: string
  updated_at: string
  messages: number
  churches: { name: string } | null
}
interface TicketFull extends Omit<TicketRow, 'messages' | 'churches'> {
  churches: { name: string; plan: string; plan_status: string } | null
  support_messages: { id: string; author: 'user' | 'staff'; author_name: string; body: string; created_at: string }[]
}

export function Support() {
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<'open' | 'pending' | 'closed' | ''>('open')
  const [rows, setRows] = useState<TicketRow[]>([])
  const [t, setT] = useState<TicketFull | null>(null)
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const selected = params.get('t')
  const load = () => api<{ tickets: TicketRow[] }>(`/admin/tickets${filter ? `?status=${filter}` : ''}`).then((r) => setRows(r.tickets)).catch((e) => setError(err(e)))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])
  useEffect(() => {
    if (selected) api<{ ticket: TicketFull }>(`/admin/tickets/${selected}`).then((r) => setT(r.ticket)).catch((e) => setError(err(e)))
    else setT(null)
  }, [selected])
  const send = async (close: boolean) => {
    if (!t || !reply.trim()) return
    try {
      await api(`/admin/tickets/${t.id}/reply`, { body: reply, close })
      setReply('')
      const r = await api<{ ticket: TicketFull }>(`/admin/tickets/${t.id}`)
      setT(r.ticket)
      load()
    } catch (e) {
      setError(err(e))
    }
  }
  const setStatus = async (status: string) => {
    if (!t) return
    await api(`/admin/tickets/${t.id}`, { status }, 'PATCH')
    setT({ ...t, status: status as TicketFull['status'] })
    load()
  }
  return (
    <>
      <Head title="Support" sub="Tickets from Help → Contact support. Replies are emailed to the church user.">
        <div className="adm-toolbar">
          {(['open', 'pending', 'closed', ''] as const).map((s) => (
            <button key={s || 'all'} type="button" className={`adm-chip ${filter === s ? 'is-on' : ''}`} onClick={() => setFilter(s)}>
              {s || 'all'}
            </button>
          ))}
        </div>
      </Head>
      {error && <p className="adm-err">{error}</p>}
      <div className="adm-split">
        <Card title={`${rows.length} tickets`}>
          <div className="adm-list">
            {rows.map((r) => (
              <button key={r.id} type="button" className={selected === r.id ? 'is-on' : ''} onClick={() => setParams({ t: r.id })}>
                <b>{r.subject}</b>
                <small>
                  {ticketRef(r.id)} · {r.name || r.email} · {r.churches?.name ?? 'no church'} · {fmtDay(r.updated_at)}
                </small>
                <span>
                  <span className={`adm-pill ${r.status}`}>{r.status}</span> {r.priority === 'high' && <span className="adm-pill high">high</span>} <small style={{ display: 'inline' }}>{r.messages} messages</small>
                </span>
              </button>
            ))}
            {!rows.length && <p className="adm-empty">Nothing here. 🎉</p>}
          </div>
        </Card>
        <Card
          title={t ? t.subject : 'Select a ticket'}
          sub={t ? `${t.name} <${t.email}> · ${t.churches ? `${t.churches.name} · ${PLAN_LABEL[t.churches.plan] ?? t.churches.plan} (${t.churches.plan_status})` : 'no church'}` : undefined}
          action={
            t && (
              <select className="adm-select" value={t.status} onChange={(e) => setStatus(e.target.value)}>
                <option value="open">open</option>
                <option value="pending">pending (waiting on user)</option>
                <option value="closed">closed</option>
              </select>
            )
          }
        >
          {t ? (
            <>
              <div className="adm-thread">
                {t.support_messages.map((m) => (
                  <div key={m.id} className={`adm-msg ${m.author === 'staff' ? 'staff' : ''}`}>
                    <small>
                      {m.author_name || (m.author === 'staff' ? 'ZionDesk' : t.name)} · {new Date(m.created_at).toLocaleString('en-GB')}
                    </small>
                    {m.body}
                  </div>
                ))}
              </div>
              <div className="adm-form" style={{ gridTemplateColumns: '1fr', marginTop: 14 }}>
                <label>
                  Reply (emailed to {t.email})
                  <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
                </label>
                <div className="adm-toolbar">
                  <button type="button" className="adm-btn" disabled={!reply.trim()} onClick={() => send(false)}>
                    <Send size={14} /> Send reply
                  </button>
                  <button type="button" className="adm-btn ghost" disabled={!reply.trim()} onClick={() => send(true)}>
                    Send & close
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="adm-empty">Choose a ticket on the left.</p>
          )}
        </Card>
      </div>
    </>
  )
}

/* ───────── payments ───────── */

interface PaymentRow {
  id: string
  kind: 'gift' | 'subscription' | 'design_request'
  amount: number
  currency: string
  plan: string | null
  fund: string | null
  status: string
  email: string
  promo_code: string | null
  created_at: string
  church_id: string
  churches: { name: string } | null
}

export function Payments() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [kind, setKind] = useState<'' | 'subscription' | 'gift' | 'design_request'>('')
  useEffect(() => {
    api<{ payments: PaymentRow[] }>('/admin/payments').then((r) => setRows(r.payments)).catch(() => setRows([]))
  }, [])
  const list = (rows ?? []).filter((p) => !kind || p.kind === kind)
  return (
    <>
      <Head title="Payments" sub="Latest Flutterwave checkouts — subscriptions, extra flyer requests and online gifts.">
        <div className="adm-toolbar">
          {(['', 'subscription', 'gift', 'design_request'] as const).map((k) => (
            <button key={k || 'all'} type="button" className={`adm-chip ${kind === k ? 'is-on' : ''}`} onClick={() => setKind(k)}>
              {k === 'design_request' ? 'extra flyers' : k || 'all'}
            </button>
          ))}
        </div>
      </Head>
      <Card title={`${list.length} payments`} action={<button type="button" className="adm-chip" onClick={() => downloadCsv('ziondesk-payments', list.map((p) => ({ date: p.created_at, church: p.churches?.name ?? '', type: p.kind, plan: p.plan ?? '', fund: p.fund ?? '', amount: p.amount, currency: p.currency, payer: p.email, status: p.status, promo: p.promo_code ?? '' })))}>Export CSV</button>}>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Church</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Payer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="adm-click" onClick={() => p.church_id && navigate(`/admin/churches/${p.church_id}`)}>
                  <td>{fmtDay(p.created_at)}</td>
                  <td>{p.churches?.name ?? '—'}</td>
                  <td>
                    {p.kind === 'subscription' ? PLAN_LABEL[p.plan ?? ''] ?? 'Subscription' : p.kind === 'design_request' ? 'Extra flyer request' : `Gift · ${p.fund ?? ''}`}
                    {p.promo_code && <small>promo {p.promo_code}</small>}
                  </td>
                  <td>{formatMoney(Number(p.amount), p.currency)}</td>
                  <td>{p.email}</td>
                  <td>
                    <span className={`adm-pill ${p.status}`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows && !list.length && <p className="adm-empty">No payments yet.</p>}
        </div>
      </Card>
    </>
  )
}

/* ───────── system ───────── */

const SERVICES: [string, string, string][] = [
  ['supabase', 'Database & sign-in', 'SUPABASE_URL, SUPABASE_SECRET_KEY'],
  ['email', 'Email (Resend)', 'RESEND_API_KEY'],
  ['flutterwave', 'Payments (Flutterwave)', 'FLW_SECRET_KEY, FLW_WEBHOOK_HASH'],
  ['whatsapp', 'WhatsApp', 'WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID (+ WHATSAPP_TEMPLATE, WHATSAPP_VERIFY_TOKEN)'],
  ['sms', 'SMS (Twilio)', 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM'],
  ['googleMeet', 'Google Meet', 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET'],
  ['prayers', 'Birthday prayers (Claude)', 'ANTHROPIC_API_KEY'],
  ['cron', 'Scheduled jobs', 'CRON_SECRET + Render cron jobs'],
]

export function System() {
  const [s, setS] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    api<Record<string, unknown>>('/admin/system').then(setS).catch(() => setS({}))
  }, [])
  return (
    <>
      <Head title="System" sub={`Which integrations have their keys set on the server${s?.commit ? ` · build ${s.commit}` : ''}. Values are never shown.`} />
      <Card title="Integrations">
        <div className="adm-rows">
          {SERVICES.map(([k, label, keys]) => (
            <div key={k} className="adm-row">
              <i className="ico">{s?.[k] ? <CheckCircle2 size={16} color="#2f9e5b" /> : <XCircle size={16} color="#c0352b" />}</i>
              <div>
                <span>{label}</span>
                <small style={{ display: 'block', color: '#8b8a98', fontSize: 12 }}>{keys}</small>
              </div>
              <span className={`adm-pill ${s?.[k] ? 'active' : 'failed'}`}>{s?.[k] ? 'ready' : 'missing'}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
