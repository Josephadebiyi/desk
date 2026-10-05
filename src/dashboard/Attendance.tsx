/**
 * Attendance: the Sunday check-in QR code, who's here today, the 8-week trend and (optional, Plus & Max)
 * gentle follow-ups for regular attendees who miss Sundays in a row.
 */
import { CalendarCheck, Check, Copy, Download, ExternalLink, HeartHandshake, Send, Undo2, UserCheck, UserX } from 'lucide-react'
import QRCode from 'qrcode'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { publicOrigin } from '../lib/site'
import { remote } from '../lib/supabase'
import { Bars, fmtDate, Kpi, PageHead, today } from './kit'
import { useMembers } from './store'
import { useWorkspace } from './workspace'

interface Data {
  date: string
  today: { memberId: string; name: string; at: string; method: 'qr' | 'manual'; by: string }[]
  days: { date: string; count: number }[]
  tracked: string[]
  absentees: { memberId: string; name: string; lastSeen: string; missed: number; followedUpAt: string | null }[]
  followup: { allowed: boolean; enabled: boolean; missed: number; message: string; defaultMessage: string }
}

const err = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function Attendance() {
  const { t } = useT()
  const { settings } = useWorkspace()
  const { members } = useMembers()
  const [date, setDate] = useState(today())
  const [d, setD] = useState<Data | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [query, setQuery] = useState('')
  const [fu, setFu] = useState({ enabled: false, missed: 2, message: '' })
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const url = `${publicOrigin()}/checkin/${settings.givingSlug}`

  const load = useCallback(() => {
    if (!remote) return
    api<Data>(`/attendance?date=${date}`)
      .then((r) => {
        setD(r)
        setFu({ enabled: r.followup.enabled, missed: r.followup.missed, message: r.followup.message })
      })
      .catch((e) => setMsg({ ok: false, text: err(e) }))
  }, [date])
  useEffect(load, [load])
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 720, errorCorrectionLevel: 'M', color: { dark: '#17112e', light: '#ffffff' } }).then(setQr).catch(() => {})
  }, [url])

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 3500)
  }
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) flash(true, ok)
      load()
    } catch (e) {
      flash(false, err(e))
    }
  }

  const here = useMemo(() => new Set((d?.today ?? []).map((x) => x.memberId)), [d])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return members.filter((m) => !here.has(m.id) && m.fullName.toLowerCase().includes(q)).slice(0, 6)
  }, [query, members, here])

  const sundays = useMemo(() => {
    const byDate = new Map((d?.days ?? []).map((x) => [x.date, x.count]))
    const out: { label: string; value: number }[] = []
    const now = new Date(`${date}T12:00:00`)
    const last = new Date(now)
    last.setDate(now.getDate() - now.getDay())
    for (let i = 7; i >= 0; i--) {
      const s = new Date(last)
      s.setDate(last.getDate() - i * 7)
      const iso = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`
      out.push({ label: fmtDate(iso, { day: 'numeric', month: 'short' }), value: byDate.get(iso) ?? 0 })
    }
    return out
  }, [d, date])
  const avg = useMemo(() => {
    const counts = (d?.tracked ?? []).slice(0, 4).map((s) => d!.days.find((x) => x.date === s)?.count ?? 0)
    return counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0
  }, [d])

  const download = () => {
    const a = document.createElement('a')
    a.href = qr
    a.download = `${settings.givingSlug}-sunday-checkin-qr.png`
    a.click()
  }

  return (
    <div className="d-page">
      <PageHead title={t('att.title')}>
        <Kpi icon={<UserCheck size={17} />} value={d?.today.length ?? 0} label={t('att.kpiToday')} tone="lime" />
        <Kpi icon={<CalendarCheck size={17} />} value={avg} label={t('att.kpiAvg')} />
        <Kpi icon={<UserX size={17} />} value={d?.absentees.length ?? 0} label={t('att.kpiMissed', { count: d?.followup.missed ?? 2 })} />
      </PageHead>
      {!remote && <p className="d-hint-box">{t('att.previewOnly')}</p>}
      {msg && <p className={`d-hint-box ${msg.ok ? 'st-billing-ok' : 'd-errors'}`}>{msg.text}</p>}

      <div className="att-grid">
        <section className="d-panel att-qr">
          <div className="d-panel-head">
            <h2>{t('att.qrTitle')}</h2>
          </div>
          <div className="att-qr-body">
            {qr && <img src={qr} alt="QR" />}
            <div>
              <p>{t('att.qrSub')}</p>
              <code>{url}</code>
              <div className="att-actions">
                <button type="button" className="d-btn d-btn-ink" onClick={download} disabled={!qr}>
                  <Download size={15} /> {t('att.download')}
                </button>
                <button
                  type="button"
                  className="d-btn"
                  onClick={() => {
                    void navigator.clipboard?.writeText(url)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t('att.copied') : t('att.copy')}
                </button>
                <a className="d-btn" href={url} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} /> {t('att.open')}
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="d-panel">
          <div className="d-panel-head">
            <h2>{t('att.trendTitle')}</h2>
          </div>
          {sundays.some((s) => s.value) ? <Bars data={sundays} /> : <p className="d-empty-sm">{t('att.trendEmpty')}</p>}
        </section>
      </div>

      <div className="att-grid">
        <section className="d-panel">
          <div className="d-panel-head">
            <h2>
              {t('att.todayTitle')} · {d?.today.length ?? 0}
            </h2>
            <label className="att-date">
              <span>{t('att.dateLabel')}</span>
              <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
            </label>
          </div>
          <div className="att-search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('att.manualPh')} disabled={!remote} />
            {matches.length > 0 && (
              <div className="att-matches">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setQuery('')
                      void run(() => api('/attendance/checkin', { memberId: m.id, date }))
                    }}
                  >
                    <span>{m.fullName}</span>
                    <b>
                      <Check size={14} /> {t('att.checkIn')}
                    </b>
                  </button>
                ))}
              </div>
            )}
          </div>
          {d?.today.length ? (
            <ul className="att-list">
              {d.today.map((x) => (
                <li key={x.memberId}>
                  <Link to={`/dashboard/members?id=${x.memberId}`}>{x.name}</Link>
                  <small>
                    {new Date(x.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {x.method === 'qr' ? t('att.byQr') : t('att.byHand', { name: x.by })}
                  </small>
                  <button type="button" className="d-icon-btn" aria-label={t('att.undo')} title={t('att.undo')} onClick={() => run(() => api(`/attendance/${x.memberId}/${date}`, undefined, 'DELETE'))}>
                    <Undo2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="d-empty-sm">{t('att.nobody')}</p>
          )}
        </section>

        <section className="d-panel">
          <div className="d-panel-head">
            <h2>
              <HeartHandshake size={18} /> {t('att.fuTitle')}
            </h2>
          </div>
          <p className="att-note">{t('att.fuSub')}</p>
          {d && !d.followup.allowed ? (
            <p className="d-hint-box">
              {t('att.fuPlan')} <Link to="/dashboard/settings?tab=plan">{t('att.fuUpgrade')} →</Link>
            </p>
          ) : (
            <div className="d-form att-fu">
              <label className="d-switch">
                <input type="checkbox" checked={fu.enabled} disabled={!remote} onChange={(e) => setFu({ ...fu, enabled: e.target.checked })} />
                <span>{t('att.fuToggle')}</span>
              </label>
              {fu.enabled && (
                <>
                  <label className="d-field">
                    <span>{t('att.fuAfter')}</span>
                    <select value={fu.missed} onChange={(e) => setFu({ ...fu, missed: Number(e.target.value) })}>
                      {[2, 3, 4, 6].map((n) => (
                        <option key={n} value={n}>
                          {t('att.fuSundays', { count: n })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="d-field">
                    <span>{t('att.fuMessage')}</span>
                    <textarea rows={3} value={fu.message} maxLength={600} placeholder={d?.followup.defaultMessage} onChange={(e) => setFu({ ...fu, message: e.target.value })} />
                    <small className="att-note">{t('att.fuMessageHint')}</small>
                  </label>
                </>
              )}
              <small className="att-note">{t('att.fuRules')}</small>
              <button type="button" className="d-btn d-btn-ink" disabled={!remote} onClick={() => run(() => api('/attendance/settings', fu, 'PUT'), t('att.fuSaved'))}>
                {t('att.fuSave')}
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="d-panel">
        <div className="d-panel-head">
          <h2>{t('att.missTitle')}</h2>
        </div>
        {d?.absentees.length ? (
          <ul className="att-list att-miss">
            {d.absentees.map((a) => (
              <li key={a.memberId}>
                <Link to={`/dashboard/members?id=${a.memberId}`}>{a.name}</Link>
                <small>
                  {t('att.missed', { count: a.missed })} · {t('att.lastSeen', { date: fmtDate(a.lastSeen, { day: 'numeric', month: 'short' }) })}
                  {a.followedUpAt ? ` · ${t('att.followed', { date: fmtDate(a.followedUpAt, { day: 'numeric', month: 'short' }) })}` : ''}
                </small>
                <button type="button" className="d-btn" onClick={() => run(() => api<{ channel: string }>(`/attendance/followup/${a.memberId}`, {}).then((r) => flash(true, t('att.sent', { channel: r.channel }))))}>
                  <Send size={14} /> {t('att.sendNow')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="d-empty-sm">{t('att.missEmpty', { count: d?.followup.missed ?? 2 })}</p>
        )}
      </section>
    </div>
  )
}
