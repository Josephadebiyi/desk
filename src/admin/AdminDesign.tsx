/** Staff console → Design requests: Ministry Max flyer requests — brief, chat with the church, status, delivery. */
import { ArrowLeft, Clock, Send, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Card, fmtDay, Head } from './Admin'
import { flyerRef } from '../lib/refs'

const err = (e: unknown) => (e instanceof Error ? e.message : String(e))
const STATUSES = ['Awaiting payment', 'Submitted', 'In design', 'Review', 'Delivered']
const TONE: Record<string, string> = { 'Awaiting payment': 'expired', Submitted: 'trial', 'In design': 'active', Review: 'past_due', Delivered: 'cancelled' }
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

interface Row {
  id: string
  title: string
  status: string
  due_at: string
  created_at: string
  extra: boolean
  formats: string[]
  churches: { name: string; plan: string } | null
  messages: number
  waiting: boolean
}

export function DesignRequests() {
  const [sp, setSp] = useSearchParams()
  const status = sp.get('status') ?? ''
  const [rows, setRows] = useState<Row[] | null>(null)
  const [msg, setMsg] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    api<{ requests: Row[] }>(`/admin/design-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`)
      .then((r) => setRows(r.requests))
      .catch((e) => setMsg(err(e)))
  }, [status])
  const open = (rows ?? []).filter((r) => r.status !== 'Delivered' && r.status !== 'Awaiting payment')
  const late = open.filter((r) => new Date(r.due_at) < new Date())
  return (
    <>
      <Head title="Design requests" sub="Ministry Max flyer requests. 8 a month are included per church; extras are paid (€10) before they arrive here." />
      <div className="adm-kpis">
        {[
          ['Open', open.length],
          ['Overdue', late.length],
          ['Waiting for your reply', (rows ?? []).filter((r) => r.waiting && r.status !== 'Delivered').length],
          ['Paid extras', (rows ?? []).filter((r) => r.extra && r.status !== 'Awaiting payment').length],
        ].map(([l, v]) => (
          <div key={l} className="adm-kpi">
            <b>{v}</b>
            <small>{l}</small>
          </div>
        ))}
      </div>
      <Card
        title="Requests"
        action={
          <select className="adm-select" value={status} onChange={(e) => setSp(e.target.value ? { status: e.target.value } : {})}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        }
      >
        {msg && <p className="adm-err">{msg}</p>}
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Church</th>
                <th>Status</th>
                <th>Due</th>
                <th>Messages</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => {
                const overdue = r.status !== 'Delivered' && r.status !== 'Awaiting payment' && new Date(r.due_at) < new Date()
                return (
                  <tr key={r.id} className="adm-click" onClick={() => navigate(`/admin/design/${r.id}`)}>
                    <td>
                      <b>{r.title}</b>
                      <small>
                        {flyerRef(r.id)} · {r.formats.join(', ') || '—'}
                        {r.extra ? ' · paid extra' : ''}
                      </small>
                    </td>
                    <td>{r.churches?.name ?? '—'}</td>
                    <td>
                      <span className={`adm-pill ${TONE[r.status] ?? ''}`}>{r.status}</span>
                    </td>
                    <td style={overdue ? { color: '#c0352b', fontWeight: 600 } : undefined}>{r.status === 'Delivered' ? '—' : when(r.due_at)}</td>
                    <td>
                      {r.messages}
                      {r.waiting && r.status !== 'Delivered' && <small style={{ color: '#6c34ff' }}>needs reply</small>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows && !rows.length && <p className="adm-empty">No requests yet.</p>}
        </div>
      </Card>
    </>
  )
}

interface Detail {
  request: Row & { brief: Record<string, string>; deliverables: { name: string; url: string }[]; churches: { name: string; email: string; phone: string; plan: string } | null; church_id: string }
  messages: { id: string; sender: string; text: string; at: string }[]
  inspiration: { name: string; url: string }[]
}

export function DesignRequestDetail() {
  const { id = '' } = useParams()
  const [d, setD] = useState<Detail | null>(null)
  const [text, setText] = useState('')
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const load = () =>
    api<Detail>(`/admin/design-requests/${id}`)
      .then(setD)
      .catch((e) => setFlash({ ok: false, text: err(e) }))
  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      setFlash({ ok: true, text: ok })
      await load()
    } catch (e) {
      setFlash({ ok: false, text: err(e) })
    } finally {
      setBusy(false)
    }
  }
  const deliver = (f: File) => {
    if (f.size > 12 * 1024 * 1024) return setFlash({ ok: false, text: 'The file must be under 12 MB.' })
    const reader = new FileReader()
    reader.onload = () => {
      const data = String(reader.result).split(',')[1] ?? ''
      void act(() => api(`/admin/design-requests/${id}/deliver`, { name: f.name, contentType: f.type, data }), `Delivered ${f.name} — the church has been emailed`)
    }
    reader.readAsDataURL(f)
  }
  if (!d) return <p className="adm-empty">{flash?.text ?? 'Loading…'}</p>
  const r = d.request
  return (
    <>
      <Link to="/admin/design" className="adm-back">
        <ArrowLeft size={15} /> All requests
      </Link>
      <Head title={r.title} sub={`${r.churches?.name ?? ''} · ${r.churches?.email ?? ''} · requested ${fmtDay(r.created_at)}${r.extra ? ' · paid extra' : ''} · ${flyerRef(r.id)}`}>
        <select className="adm-select" value={r.status} disabled={busy} onChange={(e) => act(() => api(`/admin/design-requests/${id}`, { status: e.target.value }, 'PATCH'), `Status: ${e.target.value} — the church has been emailed`)}>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Head>
      {flash && <p className={flash.ok ? 'adm-ok' : 'adm-err'}>{flash.text}</p>}
      <div className="adm-grid-b">
        <Card title="Brief" sub={r.status === 'Delivered' ? 'Delivered' : `Due ${when(r.due_at)}`} action={<Clock size={18} />}>
          <div className="adm-dl">
            {Object.entries(r.brief ?? {}).map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <p>{v || '—'}</p>
              </div>
            ))}
            <div>
              <small>formats</small>
              <p>{r.formats.join(', ') || '—'}</p>
            </div>
          </div>
          {d.inspiration.length > 0 && (
            <div className="adm-insp">
              {d.inspiration.map((f) => (
                <a key={f.url.slice(0, 80) + f.name} href={f.url} target="_blank" rel="noreferrer" title={f.name}>
                  <img src={f.url} alt={f.name} />
                </a>
              ))}
            </div>
          )}
          <div className="adm-deliver">
            <b>Deliver the design</b>
            <p>Upload the finished file (PNG, JPG, WEBP or PDF, up to 12 MB). The request is marked Delivered and the church is emailed.</p>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onChange={(e) => e.target.files?.[0] && deliver(e.target.files[0])} />
            <button type="button" className="adm-btn" disabled={busy || r.status === 'Awaiting payment'} onClick={() => file.current?.click()}>
              <Upload size={14} /> {busy ? 'Uploading…' : 'Upload file'}
            </button>
            {r.deliverables?.map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="adm-link">
                {f.name}
              </a>
            ))}
          </div>
        </Card>
        <Card title="Chat with the church" sub="They see this in Design Studio and get an email for each reply">
          <div className="adm-thread">
            {d.messages.map((m) => (
              <div key={m.id} className={`adm-msg ${m.sender === 'designer' ? 'staff' : ''}`}>
                <small>
                  {m.sender === 'you' ? r.churches?.name : m.sender === 'designer' ? 'Designer' : 'ZionDesk'} · {when(m.at)}
                </small>
                {m.text === '__received__' ? 'Request received.' : m.text}
              </div>
            ))}
          </div>
          <form
            className="adm-form adm-form-1"
            style={{ marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (!text.trim()) return
              void act(() => api(`/admin/design-requests/${id}/message`, { text }), 'Sent').then(() => setText(''))
            }}
          >
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply to the church…" />
            <button type="submit" className="adm-btn" disabled={busy || !text.trim()}>
              <Send size={14} /> Send
            </button>
          </form>
        </Card>
      </div>
    </>
  )
}
