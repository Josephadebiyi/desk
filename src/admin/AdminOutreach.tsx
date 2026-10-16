/**
 * Staff console → Outreach: invite churches by email and follow each one's journey.
 * Contacts (import, Ellen's personalised openings from the church website, statuses incl. opted out) and
 * campaigns (branded email, preview, test, send in safe daily batches, follow-ups).
 */
import { MailPlus, Send, Sparkles, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { Card, fmtDay, Head } from './Admin'

interface Contact {
  id: string
  email: string
  church_name: string
  contact_name: string
  country: string
  website: string
  personal_note: string
  research_summary: string
  status: string
  last_sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  unsubscribed_at: string | null
  created_at: string
}
interface Campaign {
  id: string
  name: string
  kind: 'intro' | 'followup'
  subject: string
  preview: string
  body: string
  from_name: string
  reply_to: string
  ref_code: string
  created_at: string
}
interface Stat {
  id: string
  sent: number
  opened: number
  clicked: number
  signed_up: number
}
interface Data {
  contacts: Contact[]
  campaigns: Campaign[]
  stats: Stat[]
  dailyCap: number
  sentToday: number
  templates: Record<'intro' | 'followup', { name: string; subject: string; preview: string; body: string }>
  emailReady: boolean
}

/** A website that landed in the name column — the server repairs it when Ellen personalises. */
const siteLike = (v: string) => !!v && !v.includes('@') && !/\s/.test(v) && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)
const hasSite = (c: { website: string; church_name: string }) => !!c.website || siteLike(c.church_name)
const err = (e: unknown) => (e instanceof Error ? e.message : String(e))
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')
const STATUS_LABEL: Record<string, string> = { new: 'New', sent: 'Sent', opened: 'Opened', clicked: 'Clicked', replied: 'Replied', signed_up: 'Signed up', unsubscribed: 'Opted out', bounced: 'Bounced' }
const STATUS_TONE: Record<string, string> = { new: '', sent: 'trial', opened: 'pending', clicked: 'open', replied: 'active', signed_up: 'successful', unsubscribed: 'cancelled', bounced: 'failed' }
const AUDIENCE: Record<string, string> = { new: 'New contacts (never emailed)', not_opened: 'Emailed but didn’t open', opened_not_clicked: 'Opened but didn’t click', all_active: 'Everyone not yet sent this campaign' }

/** "email, church, contact, country, website" per line (comma, semicolon or tab); a header row is skipped. */
function parseRows(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const rows = lines.map((l) => l.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, '')))
  const head = rows[0]?.map((h) => h.toLowerCase()) ?? []
  const hasHeader = head.some((h) => /email|church|name|website|country/.test(h)) && !head.some((h) => h.includes('@'))
  const idx = (re: RegExp, fallback: number) => {
    const i = head.findIndex((h) => re.test(h))
    return hasHeader ? i : fallback
  }
  const map = { email: idx(/e-?mail/, 0), church: idx(/church|organi[sz]ation|ministry/, 1), contact: idx(/contact|pastor|^name/, 2), country: idx(/country/, 3), website: idx(/web|site|url/, 4) }
  return (hasHeader ? rows.slice(1) : rows).map((r) => {
    const email = (map.email >= 0 ? r[map.email] : r.find((c) => c.includes('@'))) ?? r.find((c) => c.includes('@')) ?? ''
    const pick = (i: number) => (i >= 0 ? r[i] ?? '' : '')
    // A cell that looks like a web address is the website, never the church name (lists with just email + site).
    const isSite = (v: string) => !v.includes('@') && !/\s/.test(v) && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v)
    const website = pick(map.website) || r.find((c) => isSite(c)) || ''
    const church = pick(map.church)
    return { email, church_name: isSite(church) ? '' : church, contact_name: isSite(pick(map.contact)) ? '' : pick(map.contact), country: isSite(pick(map.country)) ? '' : pick(map.country), website }
  })
}

export function AdminOutreach() {
  const [data, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState<'contacts' | 'campaigns'>('contacts')
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  const load = () =>
    api<Data>('/admin/outreach')
      .then(setData)
      .catch((e) => setMsg(err(e)))
  useEffect(() => {
    void load()
  }, [])

  const totals = useMemo(() => {
    const c = data?.contacts ?? []
    const count = (s: string) => c.filter((x) => x.status === s).length
    const reached = c.filter((x) => x.last_sent_at).length
    return { all: c.length, reached, opened: c.filter((x) => x.opened_at).length, clicked: c.filter((x) => x.clicked_at).length, signed: count('signed_up'), out: count('unsubscribed') }
  }, [data])

  return (
    <>
      <Head title="Outreach" sub="Invite churches by email, then follow each one: sent, opened, clicked, signed up, or opted out." />
      {msg && <p className="adm-err">{msg}</p>}
      {ok && <p className="adm-ok">{ok}</p>}
      {data && (
        <>
          <div className="adm-kpis">
            <div className="adm-kpi"><small>Churches</small><b>{totals.all}</b></div>
            <div className="adm-kpi"><small>Emailed</small><b>{totals.reached}</b></div>
            <div className="adm-kpi"><small>Opened</small><b>{pct(totals.opened, totals.reached)}</b><em>{totals.opened} churches</em></div>
            <div className="adm-kpi"><small>Clicked</small><b>{pct(totals.clicked, totals.reached)}</b><em>{totals.clicked} churches</em></div>
            <div className="adm-kpi"><small>Signed up</small><b>{totals.signed}</b></div>
            <div className="adm-kpi"><small>Opted out</small><b>{totals.out}</b></div>
            <div className="adm-kpi"><small>Sent last 24 h</small><b>{data.sentToday}/{data.dailyCap}</b></div>
          </div>
          {!data.emailReady && <p className="adm-err">Email isn’t configured on the server (RESEND_API_KEY), so nothing can be sent yet.</p>}
          <div className="adm-toolbar" style={{ margin: '16px 0' }}>
            <button type="button" className={`adm-chip ${tab === 'contacts' ? 'is-on' : ''}`} onClick={() => setTab('contacts')}>Contacts</button>
            <button type="button" className={`adm-chip ${tab === 'campaigns' ? 'is-on' : ''}`} onClick={() => setTab('campaigns')}>Campaigns</button>
          </div>
          {tab === 'contacts' ? (
            <Contacts data={data} reload={load} setMsg={setMsg} setOk={setOk} />
          ) : (
            <Campaigns data={data} reload={load} setMsg={setMsg} setOk={setOk} />
          )}
        </>
      )}
    </>
  )
}

type Ctx = { data: Data; reload: () => Promise<void>; setMsg: (s: string) => void; setOk: (s: string) => void }

function Contacts({ data, reload, setMsg, setOk }: Ctx) {
  const [paste, setPaste] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const rows = data.contacts.filter((c) => !filter || c.status === filter)

  const importRows = async (text: string) => {
    const r = parseRows(text)
    if (!r.length) return setMsg('Paste at least one line with an email address.')
    setBusy('import')
    setMsg('')
    try {
      const out = await api<{ added: number; updated: number; invalid: number; duplicates: number }>('/admin/outreach/contacts', { rows: r })
      setOk(`Imported: ${out.added} new, ${out.updated} updated${out.invalid ? `, ${out.invalid} invalid emails skipped` : ''}${out.duplicates ? `, ${out.duplicates} duplicates` : ''}.`)
      setPaste('')
      await reload()
    } catch (e) {
      setMsg(err(e))
    }
    setBusy('')
  }
  const act = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label)
    setMsg('')
    try {
      await fn()
      if (done) setOk(done)
      await reload()
    } catch (e) {
      setMsg(err(e))
    }
    setBusy('')
  }
  const withSite = data.contacts.filter((c) => hasSite(c) && !c.personal_note && !['unsubscribed', 'bounced', 'signed_up'].includes(c.status)).length

  return (
    <>
      <Card title="Add churches" sub="Paste one church per line: email, church name, contact name, country, website. A spreadsheet export (CSV) works too.">
        <div className="adm-form" style={{ gridTemplateColumns: '1fr' }}>
          <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'office@gracechapel.org, Grace Chapel, Pastor James, Nigeria, gracechapel.org\nhello@newlife.church, New Life Church, , Ghana, newlife.church'} />
        </div>
        <div className="adm-row-actions" style={{ marginTop: 10 }}>
          <button type="button" className="adm-btn" disabled={busy === 'import' || !paste.trim()} onClick={() => importRows(paste)}>
            <MailPlus size={15} /> {busy === 'import' ? 'Importing…' : 'Add contacts'}
          </button>
          <button type="button" className="adm-btn ghost" onClick={() => file.current?.click()}>
            <Upload size={15} /> Upload CSV
          </button>
          <input ref={file} type="file" accept=".csv,text/csv,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await importRows(await f.text()) }} />
          {withSite > 0 && (
            <button type="button" className="adm-btn ghost" disabled={!!busy} onClick={() => act('ai', () => api('/admin/outreach/personalise', {}), 'Ellen personalised the next churches — review their notes below.')}>
              <Sparkles size={15} /> {busy === 'ai' ? 'Ellen is reading websites…' : `Personalise ${Math.min(8, withSite)} with Ellen`}
            </button>
          )}
        </div>
      </Card>

      <Card
        title={`${rows.length} contact${rows.length === 1 ? '' : 's'}`}
        action={
          <select className="adm-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        }
      >
        {!rows.length ? (
          <p className="adm-empty">{data.contacts.length ? 'No contacts with this status.' : 'No contacts yet. Paste your church list above.'}</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>Church</th><th>Status</th><th>Ellen’s opening</th><th>Activity</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.church_name && !siteLike(c.church_name) ? c.church_name : <span style={{ color: 'var(--a-muted)' }}>Name not known yet — Ellen will find it</span>}</b>
                      <small>{c.email}{c.country ? ` · ${c.country}` : ''}</small>
                      {c.website && <small><a href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer">{c.website}</a></small>}
                    </td>
                    <td>
                      <span className={`adm-pill ${STATUS_TONE[c.status] ?? ''}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                      {c.unsubscribed_at && <small>Opted out {fmtDay(c.unsubscribed_at)}</small>}
                    </td>
                    <td style={{ maxWidth: 360 }}>
                      {open === c.id ? (
                        <div className="adm-form" style={{ gridTemplateColumns: '1fr' }}>
                          <textarea rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} />
                          <div className="adm-row-actions">
                            <button type="button" className="adm-btn" onClick={() => act('note', () => api(`/admin/outreach/contacts/${c.id}`, { personal_note: note }, 'PATCH')).then(() => setOpen(null))}>Save</button>
                            <button type="button" className="adm-btn ghost" onClick={() => setOpen(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : c.personal_note ? (
                        <button type="button" className="adm-link" title="Edit" onClick={() => (setOpen(c.id), setNote(c.personal_note))} style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                          “{c.personal_note}”{c.research_summary && <small>{c.research_summary}</small>}
                        </button>
                      ) : (
                        <small>{hasSite(c) ? 'Not personalised yet — click Ellen' : 'No website — the email starts “Dear Pastor and church family,”'}</small>
                      )}
                    </td>
                    <td>
                      <small>{c.last_sent_at ? `Sent ${fmtDay(c.last_sent_at)}` : 'Not emailed'}</small>
                      {c.opened_at && <small>Opened {fmtDay(c.opened_at)}</small>}
                      {c.clicked_at && <small>Clicked {fmtDay(c.clicked_at)}</small>}
                    </td>
                    <td className="adm-row-actions">
                      {hasSite(c) && !['unsubscribed', 'signed_up'].includes(c.status) && (
                        <button type="button" className="adm-btn ghost" disabled={!!busy} title="Ellen reads the church website and writes a personal opening" onClick={() => act(c.id, () => api(`/admin/outreach/contacts/${c.id}/personalise`, {}), `Ellen personalised ${c.church_name || c.email}.`)}>
                          <Sparkles size={14} /> {busy === c.id ? '…' : 'Ellen'}
                        </button>
                      )}
                      {['sent', 'opened', 'clicked'].includes(c.status) && (
                        <button type="button" className="adm-btn ghost" onClick={() => act('r', () => api(`/admin/outreach/contacts/${c.id}`, { status: 'replied' }, 'PATCH'))}>Replied</button>
                      )}
                      <button type="button" className="adm-btn ghost danger" title="Delete contact" onClick={() => window.confirm(`Delete ${c.church_name || c.email}?`) && act('d', () => api(`/admin/outreach/contacts/${c.id}`, undefined, 'DELETE'))}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

function Campaigns({ data, reload, setMsg, setOk }: Ctx) {
  const [sel, setSel] = useState<Campaign | null>(data.campaigns[0] ?? null)
  const [draft, setDraft] = useState<Omit<Campaign, 'id' | 'created_at'> | null>(null)
  const [preview, setPreview] = useState('')
  const [audience, setAudience] = useState('new')
  const [size, setSize] = useState(20)
  const [busy, setBusy] = useState('')
  const left = Math.max(0, data.dailyCap - data.sentToday)

  useEffect(() => {
    if (!sel) return setPreview('')
    const sample = data.contacts.find((c) => c.personal_note) ?? data.contacts[0]
    api<{ html: string }>(`/admin/outreach/campaigns/${sel.id}/preview?church=${encodeURIComponent(sample?.church_name || 'Grace Chapel')}&note=${encodeURIComponent(sample?.personal_note || '')}`)
      .then((r) => setPreview(r.html))
      .catch(() => setPreview(''))
  }, [sel, data.contacts])

  const startNew = (kind: 'intro' | 'followup') => {
    const t = data.templates[kind]
    setSel(null)
    setDraft({ name: t.name, kind, subject: t.subject, preview: t.preview, body: t.body, from_name: 'Joseph from ZionDesk', reply_to: '', ref_code: 'CHURCHMAIL' })
  }
  const save = async () => {
    if (!draft) return
    setBusy('save')
    setMsg('')
    try {
      const r = sel
        ? await api<{ campaign: Campaign }>(`/admin/outreach/campaigns/${sel.id}`, draft, 'PATCH')
        : await api<{ campaign: Campaign }>('/admin/outreach/campaigns', draft)
      setSel(r.campaign)
      setDraft(null)
      setOk('Campaign saved.')
      await reload()
    } catch (e) {
      setMsg(err(e))
    }
    setBusy('')
  }
  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label)
    setMsg('')
    try {
      setOk(await fn())
      await reload()
    } catch (e) {
      setMsg(err(e))
    }
    setBusy('')
  }
  const stat = (id: string) => data.stats.find((s) => s.id === id)

  return (
    <div className="adm-split">
      <Card title="Campaigns" action={<span className="adm-row-actions"><button type="button" className="adm-btn ghost" onClick={() => startNew('intro')}>+ Introduction</button><button type="button" className="adm-btn ghost" onClick={() => startNew('followup')}>+ Follow-up</button></span>}>
        <div className="adm-list">
          {!data.campaigns.length && <p className="adm-empty">No campaigns yet. Start with “+ Introduction”.</p>}
          {data.campaigns.map((c) => {
            const s = stat(c.id)
            return (
              <button key={c.id} type="button" className={sel?.id === c.id ? 'is-on' : ''} onClick={() => (setSel(c), setDraft(null))}>
                <b>{c.name}</b>
                <small>{s ? `${s.sent} sent · ${pct(s.opened, s.sent)} opened · ${pct(s.clicked, s.sent)} clicked · ${s.signed_up} signed up` : 'Not sent yet'}</small>
              </button>
            )
          })}
        </div>
      </Card>

      {draft ? (
        <Card title={sel ? 'Edit campaign' : 'New campaign'} sub="{{church_name}} is replaced with each church’s name. Ellen’s personal opening (if any) goes first.">
          <div className="adm-form" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>From name<input value={draft.from_name} onChange={(e) => setDraft({ ...draft, from_name: e.target.value })} /></label>
            <label style={{ gridColumn: '1 / -1' }}>Subject<input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
            <label style={{ gridColumn: '1 / -1' }}>Preview text<input value={draft.preview} onChange={(e) => setDraft({ ...draft, preview: e.target.value })} /></label>
            <label style={{ gridColumn: '1 / -1' }}>Message (blank line = new paragraph)<textarea rows={7} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
            <label>Replies go to (optional)<input value={draft.reply_to} placeholder="you@ziondesk.com" onChange={(e) => setDraft({ ...draft, reply_to: e.target.value })} /></label>
            <label>Tracking code<input value={draft.ref_code} onChange={(e) => setDraft({ ...draft, ref_code: e.target.value.toUpperCase() })} /></label>
          </div>
          <div className="adm-row-actions" style={{ marginTop: 12 }}>
            <button type="button" className="adm-btn" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save campaign'}</button>
            <button type="button" className="adm-btn ghost" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </Card>
      ) : sel ? (
        <Card
          title={sel.name}
          sub={`Subject: ${sel.subject}`}
          action={<button type="button" className="adm-btn ghost" onClick={() => setDraft({ name: sel.name, kind: sel.kind, subject: sel.subject, preview: sel.preview, body: sel.body, from_name: sel.from_name, reply_to: sel.reply_to, ref_code: sel.ref_code })}>Edit</button>}
        >
          <div className="adm-form" style={{ gridTemplateColumns: '2fr 1fr auto', alignItems: 'end' }}>
            <label>Send to<select value={audience} onChange={(e) => setAudience(e.target.value)}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>How many now<input type="number" min={1} max={Math.max(1, Math.min(100, left))} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
            <button
              type="button"
              className="adm-btn"
              disabled={!!busy || !left}
              onClick={() =>
                window.confirm(`Send “${sel.name}” to up to ${Math.min(size, left)} churches (${AUDIENCE[audience].toLowerCase()})?`) &&
                run('send', async () => {
                  const r = await api<{ sent: number; left: number; eligible: number }>(`/admin/outreach/campaigns/${sel.id}/send`, { audience, limit: Math.min(size, left) })
                  return r.sent ? `Sent to ${r.sent} churches. ${r.eligible} more waiting · ${r.left} left today.` : 'Nobody to send to in this audience.'
                })
              }
            >
              <Send size={15} /> {busy === 'send' ? 'Sending…' : 'Send'}
            </button>
          </div>
          <p className="adm-empty" style={{ textAlign: 'left', padding: '8px 0 0' }}>
            {left ? `${left} of ${data.dailyCap} sends left in the next 24 hours — small daily batches keep you out of spam folders.` : 'Daily limit reached — continue tomorrow.'} A church never gets the same campaign twice; opted-out and signed-up churches are skipped.
          </p>
          <div className="adm-row-actions" style={{ margin: '10px 0 14px' }}>
            <button type="button" className="adm-btn ghost" disabled={!!busy} onClick={() => run('test', async () => `Test sent to ${(await api<{ to: string }>(`/admin/outreach/campaigns/${sel.id}/test`, {})).to}.`)}>
              {busy === 'test' ? 'Sending…' : 'Send test to me'}
            </button>
          </div>
          {preview && <iframe title="Email preview" srcDoc={preview} style={{ width: '100%', height: 720, border: '1px solid var(--a-line)', borderRadius: 16, background: '#f4f1ea' }} />}
        </Card>
      ) : (
        <Card title="Campaign"><p className="adm-empty">Pick a campaign, or start one with “+ Introduction”.</p></Card>
      )}
    </div>
  )
}
