/** Staff console: church & user detail pages, settings, profile, search, alerts, avatar menu. */
import { ArrowLeft, Ban, Bell, Building2, Camera, Check, Download, KeyRound, LayoutGrid, LogOut, Mail, Megaphone, RotateCcw, Search, Settings as Cog, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { updatePassword } from '../lib/auth'
import { formatMoney } from '../lib/currency'
import { useSession } from '../lib/session'
import { Card, fmtDay, Head, initialsOf } from './Admin'

const PLAN_LABEL: Record<string, string> = { essentials: 'Essentials', plus: 'Ministry Plus', max: 'Ministry Max' }
const STATUSES = ['trial', 'active', 'past_due', 'cancelled', 'expired'] as const
const err = (e: unknown) => (e instanceof Error ? e.message : String(e))
const plusDays = (days: number, from?: string | null) => new Date((from && new Date(from) > new Date() ? new Date(from) : new Date()).getTime() + days * 864e5).toISOString()

/** Download rows as a CSV file. */
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function useFlash() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const show = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 3500)
  }
  const node = msg ? <p className={msg.ok ? 'adm-ok' : 'adm-err'}>{msg.text}</p> : null
  return { show, node }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="adm-kv">
      <small>{label}</small>
      <span>{children}</span>
    </div>
  )
}

/* ───────── church detail ───────── */

interface ChurchDetailData {
  church: Record<string, string | number | boolean | null | string[]> & { id: string; name: string; plan: string; plan_status: string; currency: string; plan_renews_at: string | null; trial_ends_at: string | null; created_at: string; onlineGiving: boolean }
  team: { userId: string; role: string; since: string; name: string; email: string }[]
  stats: { members: number; stages: Record<string, number>; giving30d: number; events: number; messages: number; flyers: number }
  payments: { id: string; kind: string; amount: number; currency: string; plan: string | null; fund: string | null; status: string; promo_code: string | null; created_at: string }[]
  promos: { code?: string; status: string; redeemed_at: string; ends_at: string | null; percent_off: number | null }[]
  tickets: { id: string; subject: string; status: string; updated_at: string }[]
  note: string
}

export function ChurchDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [d, setD] = useState<ChurchDetailData | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState('')
  const flash = useFlash()
  const load = () =>
    api<ChurchDetailData>(`/admin/churches/${id}`)
      .then((r) => {
        setD(r)
        setNote(r.note)
      })
      .catch((e) => setError(err(e)))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      flash.show(true, ok)
      load()
    } catch (e) {
      flash.show(false, err(e))
    }
  }
  if (error) return <p className="adm-err">{error}</p>
  if (!d) return <p className="adm-empty">Loading…</p>
  const c = d.church
  const patch = (body: Record<string, unknown>, ok: string) => act(() => api(`/admin/churches/${c.id}`, body, 'PATCH'), ok)
  return (
    <>
      <Link to="/admin/churches" className="adm-back">
        <ArrowLeft size={15} /> All churches
      </Link>
      <Head title={c.name} sub={`${c.location || '—'} · ${c.currency} · joined ${fmtDay(c.created_at)} · /${c.slug}`}>
        <span className={`adm-pill ${c.plan_status} big`}>{String(c.plan_status).replace('_', ' ')}</span>
      </Head>
      {flash.node}
      <div className="adm-kpis">
        {[
          ['Members', d.stats.members],
          ['Giving (30 days)', formatMoney(d.stats.giving30d, c.currency)],
          ['Team', d.team.length],
          ['Events', d.stats.events],
          ['Messages sent', d.stats.messages],
          ['AI flyers', d.stats.flyers],
        ].map(([k, v]) => (
          <div key={k} className="adm-kpi">
            <small>{k}</small>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="adm-grid-b">
        <Card title="Plan & billing" sub="Changes apply immediately">
          <div className="adm-form">
            <label>
              Plan
              <select value={c.plan} onChange={(e) => patch({ plan: e.target.value }, 'Plan changed')}>
                {Object.entries(PLAN_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={c.plan_status} onChange={(e) => patch({ plan_status: e.target.value }, 'Status changed')}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {c.plan_status === 'trial' ? 'Trial ends' : 'Renews / access until'}
              <input
                type="date"
                value={String((c.plan_status === 'trial' ? c.trial_ends_at : c.plan_renews_at) ?? '').slice(0, 10)}
                onChange={(e) => e.target.value && patch(c.plan_status === 'trial' ? { trial_ends_at: new Date(e.target.value + 'T23:59:00').toISOString() } : { plan_renews_at: new Date(e.target.value + 'T23:59:00').toISOString() }, 'Date updated')}
              />
            </label>
          </div>
          <div className="adm-toolbar" style={{ marginTop: 14 }}>
            <button type="button" className="adm-btn ghost" onClick={() => patch({ plan_status: 'trial', trial_ends_at: plusDays(7, c.trial_ends_at) }, 'Trial extended by 7 days')}>
              +7 days trial
            </button>
            <button type="button" className="adm-btn ghost" onClick={() => patch({ plan_status: 'active', plan_renews_at: plusDays(30, c.plan_renews_at) }, '1 free month added')}>
              +1 free month
            </button>
            {c.plan_status !== 'expired' ? (
              <button type="button" className="adm-btn ghost danger" onClick={() => window.confirm(`Disable ${c.name}? Their dashboard will ask them to choose a plan. Data is kept.`) && patch({ plan_status: 'expired' }, 'Church disabled')}>
                <Ban size={14} /> Disable access
              </button>
            ) : (
              <button type="button" className="adm-btn ghost" onClick={() => patch({ plan_status: 'active', plan_renews_at: plusDays(30) }, 'Access restored for 30 days')}>
                <RotateCcw size={14} /> Restore access
              </button>
            )}
          </div>
          <div className="adm-kvs" style={{ marginTop: 16 }}>
            <Field label="Office email">{String(c.email || '—')}</Field>
            <Field label="Phone">{String(c.phone || '—')}</Field>
            <Field label="Online giving">{c.onlineGiving ? 'Connected (Flutterwave)' : 'Not connected'}</Field>
            <Field label="Billing email">{String(c.flw_subscription_email || '—')}</Field>
            <Field label="Public pages">
              <a href={`/give/${c.slug}`} target="_blank" rel="noreferrer">
                Give page
              </a>{' '}
              ·{' '}
              <a href={`/join/${c.slug}?type=member`} target="_blank" rel="noreferrer">
                Join page
              </a>
            </Field>
          </div>
        </Card>
        <Card title="Members by stage" sub={`${d.stats.members} people`}>
          <div className="adm-rows">
            {Object.entries(d.stats.stages).map(([k, v]) => (
              <div key={k} className="adm-row">
                <i className="ico">
                  <UserRound size={16} />
                </i>
                <div>
                  <span>{k}</span>
                  <div className="adm-bar">
                    <i style={{ width: `${d.stats.members ? (v / d.stats.members) * 100 : 0}%` }} />
                  </div>
                </div>
                <b>{v}</b>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Team" sub="Change roles or remove access">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Since</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.team.map((m) => (
                <tr key={m.userId} className="adm-click" onClick={() => navigate(`/admin/users/${m.userId}`)}>
                  <td>
                    <b>{m.name || '—'}</b>
                    <small>{m.email}</small>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className="adm-select" value={m.role} onChange={(e) => act(() => api(`/admin/churches/${c.id}/members/${m.userId}`, { role: e.target.value }, 'PATCH'), 'Role changed')}>
                      <option value="admin">Administrator</option>
                      <option value="finance">Finance</option>
                      <option value="leader">Ministry leader</option>
                    </select>
                  </td>
                  <td>{fmtDay(m.since)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="adm-chip" onClick={() => window.confirm(`Remove ${m.email} from ${c.name}?`) && act(() => api(`/admin/churches/${c.id}/members/${m.userId}`, {}, 'DELETE'), 'Removed from church')}>
                      <Trash2 size={13} /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!d.team.length && <p className="adm-empty">No team members.</p>}
        </div>
      </Card>
      <div className="adm-grid-b">
        <Card title="Payments" sub="Subscriptions and online gifts" action={<button type="button" className="adm-chip" onClick={() => downloadCsv(`${c.slug}-payments`, d.payments)}><Download size={13} /> CSV</button>}>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <tbody>
                {d.payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.kind === 'subscription' ? PLAN_LABEL[p.plan ?? ''] ?? 'Subscription' : `Gift · ${p.fund ?? ''}`}
                      <small>
                        {fmtDay(p.created_at)}
                        {p.promo_code ? ` · promo ${p.promo_code}` : ''}
                      </small>
                    </td>
                    <td>{formatMoney(Number(p.amount), p.currency)}</td>
                    <td>
                      <span className={`adm-pill ${p.status}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!d.payments.length && <p className="adm-empty">No payments yet.</p>}
          </div>
        </Card>
        <Card title="Support & promos">
          <div className="adm-list">
            {d.tickets.map((t) => (
              <button key={t.id} type="button" onClick={() => navigate(`/admin/support?t=${t.id}`)}>
                <b>{t.subject}</b>
                <small>
                  <span className={`adm-pill ${t.status}`}>{t.status}</span> · {fmtDay(t.updated_at)}
                </small>
              </button>
            ))}
            {!d.tickets.length && <p className="adm-empty">No support tickets.</p>}
          </div>
          {d.promos.length > 0 && (
            <div className="adm-kvs" style={{ marginTop: 12 }}>
              {d.promos.map((p, i) => (
                <Field key={i} label={`Promo ${p.code ?? ''}`}>
                  {p.status} · since {fmtDay(p.redeemed_at)}
                  {p.ends_at ? ` · ends ${fmtDay(p.ends_at)}` : ''}
                </Field>
              ))}
            </div>
          )}
        </Card>
      </div>
      <Card title="Staff notes" sub="Private — only ZionDesk staff can see this">
        <div className="adm-form" style={{ gridTemplateColumns: '1fr' }}>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Partner church, onboarding call booked for Friday" />
          <div className="adm-toolbar">
            <button type="button" className="adm-btn" onClick={() => act(() => api(`/admin/churches/${c.id}/note`, { text: note }, 'PUT'), 'Note saved')}>
              <Check size={14} /> Save note
            </button>
          </div>
        </div>
      </Card>
      <Card title="Danger zone" sub="Cancels the subscription and permanently deletes the church and all its records">
        <div className="adm-form">
          <label>
            Type “{c.name}” to confirm
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <button
            type="button"
            className="adm-btn danger"
            disabled={confirm.trim().toLowerCase() !== c.name.trim().toLowerCase()}
            onClick={async () => {
              try {
                await api(`/admin/churches/${c.id}`, { confirm }, 'DELETE')
                navigate('/admin/churches')
              } catch (e) {
                flash.show(false, err(e))
              }
            }}
          >
            <Trash2 size={14} /> Delete church
          </button>
        </div>
      </Card>
    </>
  )
}

/* ───────── user detail ───────── */

interface UserDetailData {
  user: { id: string; email: string; name: string; avatar: string | null; phone: string; createdAt: string; lastSignIn: string | null; confirmed: boolean; providers: string[]; suspended: boolean; staff: boolean; language: string; termsVersion: string | null; termsAcceptedAt: string | null }
  churches: { id: string; name: string; plan: string; plan_status: string; role: string; since: string }[]
  tickets: { id: string; subject: string; status: string; updated_at: string }[]
}

export function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [d, setD] = useState<UserDetailData | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState('')
  const flash = useFlash()
  const load = () => api<UserDetailData>(`/admin/users/${id}`).then(setD).catch((e) => setError(err(e)))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      flash.show(true, ok)
      load()
    } catch (e) {
      flash.show(false, err(e))
    }
  }
  if (error) return <p className="adm-err">{error}</p>
  if (!d) return <p className="adm-empty">Loading…</p>
  const u = d.user
  return (
    <>
      <Link to="/admin/users" className="adm-back">
        <ArrowLeft size={15} /> All users
      </Link>
      <Head title={u.name || u.email} sub={`${u.email} · joined ${fmtDay(u.createdAt)} · last active ${fmtDay(u.lastSignIn)}`}>
        <span className="adm-avatar lg">{u.avatar ? <img src={u.avatar} alt="" /> : initialsOf(u.name || u.email)}</span>
      </Head>
      {flash.node}
      <div className="adm-grid-b">
        <Card title="Account">
          <div className="adm-kvs">
            <Field label="Status">{u.suspended ? <span className="adm-pill failed">suspended</span> : <span className="adm-pill active">active</span>}</Field>
            <Field label="Email confirmed">{u.confirmed ? 'Yes' : 'Not yet'}</Field>
            <Field label="Sign-in method">{u.providers.join(', ') || 'email'}</Field>
            <Field label="Language">{u.language.toUpperCase()}</Field>
            <Field label="Accepted terms">{u.termsAcceptedAt ? `${fmtDay(u.termsAcceptedAt)} (v${u.termsVersion})` : '—'}</Field>
            <Field label="Staff">{u.staff ? 'Yes (ADMIN_EMAILS)' : 'No'}</Field>
          </div>
          <div className="adm-toolbar" style={{ marginTop: 16 }}>
            <button type="button" className="adm-btn ghost" onClick={() => act(() => api(`/admin/users/${u.id}/link`, { type: 'recovery' }), `Password reset email sent to ${u.email}`)}>
              <KeyRound size={14} /> Send password reset
            </button>
            <button type="button" className="adm-btn ghost" onClick={() => act(() => api(`/admin/users/${u.id}/link`, { type: 'magiclink' }), `Sign-in link sent to ${u.email}`)}>
              <Mail size={14} /> Send sign-in link
            </button>
            <a className="adm-btn ghost" href={`mailto:${u.email}`}>
              <Mail size={14} /> Email
            </a>
            {!u.staff && (
              <button type="button" className={`adm-btn ghost ${u.suspended ? '' : 'danger'}`} onClick={() => window.confirm(u.suspended ? `Restore access for ${u.email}?` : `Suspend ${u.email}? They won’t be able to sign in.`) && act(() => api(`/admin/users/${u.id}/suspend`, { suspended: !u.suspended }), u.suspended ? 'Access restored' : 'User suspended')}>
                {u.suspended ? <RotateCcw size={14} /> : <Ban size={14} />} {u.suspended ? 'Restore' : 'Suspend'}
              </button>
            )}
          </div>
        </Card>
        <Card title="Churches" sub="Open a church to change this person’s role">
          <div className="adm-list">
            {d.churches.map((c) => (
              <button key={c.id} type="button" onClick={() => navigate(`/admin/churches/${c.id}`)}>
                <b>{c.name}</b>
                <small>
                  {c.role} · {PLAN_LABEL[c.plan] ?? c.plan} · <span className={`adm-pill ${c.plan_status}`}>{c.plan_status.replace('_', ' ')}</span>
                </small>
              </button>
            ))}
            {!d.churches.length && <p className="adm-empty">Not part of any church yet (sign-up not finished).</p>}
          </div>
          {d.tickets.length > 0 && <h3 className="adm-h3">Support tickets</h3>}
          <div className="adm-list">
            {d.tickets.map((t) => (
              <button key={t.id} type="button" onClick={() => navigate(`/admin/support?t=${t.id}`)}>
                <b>{t.subject}</b>
                <small>
                  {t.status} · {fmtDay(t.updated_at)}
                </small>
              </button>
            ))}
          </div>
        </Card>
      </div>
      {!u.staff && (
        <Card title="Danger zone" sub="Deletes the login. Churches where this person is the only member are deleted too.">
          <div className="adm-form">
            <label>
              Type “{u.email}” to confirm
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            <button
              type="button"
              className="adm-btn danger"
              disabled={confirm.trim().toLowerCase() !== u.email.toLowerCase()}
              onClick={async () => {
                try {
                  await api(`/admin/users/${u.id}`, { confirm }, 'DELETE')
                  navigate('/admin/users')
                } catch (e) {
                  flash.show(false, err(e))
                }
              }}
            >
              <Trash2 size={14} /> Delete user
            </button>
          </div>
        </Card>
      )}
    </>
  )
}

/* ───────── settings ───────── */

interface SettingsData {
  announcement: { text: string; active: boolean; tone: string; link?: string; at?: string; by?: string }
  staff: string[]
  supportEmail: string
  siteUrl: string
  adminUrl: string
}

export function AdminSettings() {
  const [d, setD] = useState<SettingsData | null>(null)
  const [a, setA] = useState({ text: '', active: false, tone: 'info', link: '' })
  const flash = useFlash()
  useEffect(() => {
    api<SettingsData>('/admin/settings')
      .then((r) => {
        setD(r)
        setA({ text: r.announcement.text ?? '', active: Boolean(r.announcement.active), tone: r.announcement.tone ?? 'info', link: r.announcement.link ?? '' })
      })
      .catch((e) => flash.show(false, err(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const save = async () => {
    try {
      await api('/admin/settings/announcement', a, 'PUT')
      flash.show(true, a.active ? 'Announcement is live on every church dashboard' : 'Announcement saved (hidden)')
    } catch (e) {
      flash.show(false, err(e))
    }
  }
  return (
    <>
      <Head title="Settings" sub="Platform-wide controls for ZionDesk." />
      {flash.node}
      <Card title="Announcement banner" sub="Shown at the top of every church dashboard — new features, maintenance, holidays" action={<Megaphone size={18} />}>
        <div className="adm-form">
          <label style={{ gridColumn: '1 / -1' }}>
            Message
            <input value={a.text} maxLength={300} onChange={(e) => setA({ ...a, text: e.target.value })} placeholder="e.g. New: online giving in your local currency — set it up in Giving." />
          </label>
          <label>
            Link (optional)
            <input value={a.link} onChange={(e) => setA({ ...a, link: e.target.value })} placeholder="/dashboard/giving" />
          </label>
          <label>
            Style
            <select value={a.tone} onChange={(e) => setA({ ...a, tone: e.target.value })}>
              <option value="info">Info (purple)</option>
              <option value="success">Good news (green)</option>
              <option value="warning">Warning (amber)</option>
            </select>
          </label>
          <label className="adm-switch">
            <input type="checkbox" checked={a.active} onChange={(e) => setA({ ...a, active: e.target.checked })} />
            Show to all churches
          </label>
          <button type="button" className="adm-btn" onClick={save}>
            <Check size={14} /> Save
          </button>
        </div>
        {a.text && (
          <div className={`adm-banner ${a.tone}`} style={{ marginTop: 14 }}>
            Preview: {a.text}
          </div>
        )}
      </Card>
      <div className="adm-grid-b">
        <Card title="Staff access" sub="People who can open this console">
          <div className="adm-list">
            {(d?.staff ?? []).map((e) => (
              <div key={e} className="adm-staff">
                <ShieldCheck size={16} /> {e}
              </div>
            ))}
          </div>
          <p className="adm-hint">To add or remove staff, edit ADMIN_EMAILS in Render → Environment and redeploy.</p>
        </Card>
        <Card title="Addresses">
          <div className="adm-kvs">
            <Field label="Website">{d?.siteUrl ?? '…'}</Field>
            <Field label="Admin address">{d?.adminUrl || 'same as website /admin'}</Field>
            <Field label="Support inbox">{d?.supportEmail ?? '…'}</Field>
          </div>
          <Link to="/admin/system" className="adm-chip" style={{ marginTop: 12 }}>
            Integration status →
          </Link>
        </Card>
      </div>
    </>
  )
}

/* ───────── my profile ───────── */

export function AdminProfile() {
  const session = useSession()
  const [name, setName] = useState(session.name)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState('')
  const flash = useFlash()
  const file = useRef<HTMLInputElement>(null)
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      flash.show(true, ok)
    } catch (e) {
      flash.show(false, err(e) === 'IMAGE_SIZE' ? 'Images must be under 3 MB.' : err(e) === 'IMAGE_TYPE' ? 'Choose a PNG, JPG, WebP or GIF.' : err(e))
    } finally {
      setBusy('')
    }
  }
  return (
    <>
      <Head title="My profile" sub={session.email} />
      {flash.node}
      <div className="adm-grid-b">
        <Card title="Profile">
          <div className="adm-photo">
            <span className="adm-avatar xl">{session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : initialsOf(session.name || session.email)}</span>
            <div className="adm-toolbar">
              <button type="button" className="adm-btn ghost" disabled={busy === 'photo'} onClick={() => file.current?.click()}>
                <Camera size={14} /> {busy === 'photo' ? 'Uploading…' : 'Change photo'}
              </button>
              {session.avatarUrl && (
                <button type="button" className="adm-btn ghost" onClick={() => run('photo', () => session.updateProfile({ avatar: null }), 'Photo removed')}>
                  Remove
                </button>
              )}
            </div>
            <input
              ref={file}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) run('photo', () => session.updateProfile({ avatar: f }), 'Photo updated')
              }}
            />
          </div>
          <div className="adm-form" style={{ marginTop: 16 }}>
            <label>
              Full name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="button" className="adm-btn" disabled={!name.trim() || busy !== ''} onClick={() => run('name', () => session.updateProfile({ name }), 'Name saved')}>
              <Check size={14} /> Save
            </button>
          </div>
        </Card>
        <Card title="Password">
          <div className="adm-form">
            <label>
              New password (8+ characters)
              <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <button type="button" className="adm-btn" disabled={pw.length < 8 || busy !== ''} onClick={() => run('pw', () => updatePassword(pw).then(() => setPw('')), 'Password updated')}>
              <KeyRound size={14} /> Update password
            </button>
          </div>
        </Card>
      </div>
    </>
  )
}

/* ───────── top bar: search, alerts, avatar menu ───────── */

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [])
  return { open, setOpen, ref }
}

export function SearchBox() {
  const { open, setOpen, ref } = usePopover()
  const [q, setQ] = useState('')
  const [r, setR] = useState<{ churches: { id: string; name: string; location: string; plan_status: string }[]; users: { id: string; full_name: string; email: string }[] } | null>(null)
  const navigate = useNavigate()
  useEffect(() => {
    if (q.trim().length < 2) return setR(null)
    const t = setTimeout(() => api<NonNullable<typeof r>>(`/admin/search?q=${encodeURIComponent(q.trim())}`).then(setR).catch(() => setR(null)), 200)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [setOpen])
  const go = (to: string) => {
    setOpen(false)
    setQ('')
    navigate(to)
  }
  return (
    <div className="adm-pop-wrap" ref={ref}>
      <button type="button" className="adm-circle" aria-label="Search (⌘K)" title="Search (⌘K)" onClick={() => setOpen(!open)}>
        <Search size={17} />
      </button>
      {open && (
        <div className="adm-pop adm-search-pop">
          <label className="adm-search">
            <Search size={16} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search churches, people, emails…" />
          </label>
          {r && (
            <div className="adm-results">
              {r.churches.map((c) => (
                <button key={c.id} type="button" onClick={() => go(`/admin/churches/${c.id}`)}>
                  <Building2 size={15} /> <b>{c.name}</b> <small>{c.location}</small> <span className={`adm-pill ${c.plan_status}`}>{c.plan_status.replace('_', ' ')}</span>
                </button>
              ))}
              {r.users.map((u) => (
                <button key={u.id} type="button" onClick={() => go(`/admin/users/${u.id}`)}>
                  <UserRound size={15} /> <b>{u.full_name || u.email}</b> <small>{u.email}</small>
                </button>
              ))}
              {!r.churches.length && !r.users.length && <p className="adm-empty">No matches.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface Alerts {
  tickets: { id: string; subject: string; name: string; updated_at: string; priority: string }[]
  pastDue: { id: string; name: string; plan_renews_at: string }[]
  trialsEnding: { id: string; name: string; trial_ends_at: string }[]
}

export function AlertsMenu() {
  const { open, setOpen, ref } = usePopover()
  const [a, setA] = useState<Alerts | null>(null)
  const navigate = useNavigate()
  useEffect(() => {
    const load = () => api<Alerts>('/admin/alerts').then(setA).catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])
  const n = (a?.tickets.length ?? 0) + (a?.pastDue.length ?? 0) + (a?.trialsEnding.length ?? 0)
  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }
  return (
    <div className="adm-pop-wrap" ref={ref}>
      <button type="button" className="adm-circle" aria-label={`Alerts (${n})`} onClick={() => setOpen(!open)}>
        <Bell size={17} />
        {n > 0 && <span className="adm-badge">{n > 9 ? '9+' : n}</span>}
      </button>
      {open && (
        <div className="adm-pop adm-alerts">
          <b className="adm-pop-title">Needs attention</b>
          {a?.tickets.map((t) => (
            <button key={t.id} type="button" onClick={() => go(`/admin/support?t=${t.id}`)}>
              <span className="dot open" /> <span>
                <b>{t.subject}</b>
                <small>
                  Ticket from {t.name || 'a user'} · {fmtDay(t.updated_at)}
                </small>
              </span>
            </button>
          ))}
          {a?.pastDue.map((c) => (
            <button key={c.id} type="button" onClick={() => go(`/admin/churches/${c.id}`)}>
              <span className="dot past_due" /> <span>
                <b>{c.name}</b>
                <small>Payment overdue</small>
              </span>
            </button>
          ))}
          {a?.trialsEnding.map((c) => (
            <button key={c.id} type="button" onClick={() => go(`/admin/churches/${c.id}`)}>
              <span className="dot trial" /> <span>
                <b>{c.name}</b>
                <small>Trial ends {fmtDay(c.trial_ends_at)}</small>
              </span>
            </button>
          ))}
          {n === 0 && <p className="adm-empty">All clear 🎉</p>}
        </div>
      )}
    </div>
  )
}

export function AvatarMenu() {
  const session = useSession()
  const navigate = useNavigate()
  const { open, setOpen, ref } = usePopover()
  const name = session.name || session.email || 'Admin'
  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }
  return (
    <div className="adm-pop-wrap" ref={ref}>
      <button type="button" className="adm-avatar" title={name} onClick={() => setOpen(!open)}>
        {session.avatarUrl ? <img src={session.avatarUrl} alt="" /> : initialsOf(name)}
      </button>
      {open && (
        <div className="adm-pop adm-menu">
          <div className="adm-pop-title">
            <b>{name}</b>
            <small>{session.email}</small>
          </div>
          <button type="button" onClick={() => go('/admin/profile')}>
            <UserRound size={15} /> My profile
          </button>
          <button type="button" onClick={() => go('/admin/settings')}>
            <Cog size={15} /> Settings
          </button>
          <button type="button" onClick={() => go('/dashboard')}>
            <LayoutGrid size={15} /> Church dashboard
          </button>
          <button
            type="button"
            onClick={async () => {
              await session.signOut()
              navigate('/login')
            }}
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
