/**
 * Settings → Connected churches: link this church account with another ZionDesk church, as its head church or as
 * one of its sub churches — by email invitation (they click Accept) or by a code shared by hand. Both churches then
 * see each other's details, upcoming events and summary numbers; never member records or giving.
 */
import { CalendarDays, Check, Copy, Link2, Mail, MapPin, Phone, Unlink, Users, X } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { fmtDate, planName } from './kit'
import { confirmAction } from './confirm'
import { useWorkspace } from './workspace'

interface Shared {
  id: string
  name: string
  location: string
  phone: string
  email: string
  denomination: string
  plan: string
  logoUrl: string | null
  joinUrl: string
  stats: { members: number; newThisMonth: number; lastService: { date: string; count: number | null } | null }
  events: { title: string; date: string; time: string; mode: string; location: string }[]
}
interface Code {
  code: string
  as: 'head' | 'sub'
  expiresAt: string
  email: string | null
}
interface Data {
  ready: boolean
  head: Shared | null
  subs: Shared[]
  codes: Code[]
}

const DEMO: Data = {
  ready: true,
  head: null,
  subs: [
    {
      id: 'demo-sub',
      name: 'Grace Chapel Lekki',
      location: 'Lekki, Lagos',
      phone: '+234 803 555 0199',
      email: 'lekki@gracechapel.org',
      denomination: 'Pentecostal',
      plan: 'plus',
      logoUrl: null,
      joinUrl: '#',
      stats: { members: 86, newThisMonth: 7, lastService: { date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), count: 64 } },
      events: [{ title: 'Youth Night', date: new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10), time: '18:00', mode: 'In person', location: 'Main hall' }],
    },
  ],
  codes: [],
}

const err = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function Connections() {
  const { t } = useT()
  const { live } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<Data | null>(live ? null : DEMO)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (!live) return
    try {
      setData(await api<Data>('/connections'))
    } catch (e) {
      setError(err(e))
    }
  }, [live])
  useEffect(() => void load(), [load])

  // Invitation link from the email: ?tab=connections&code=ABCD-1234
  const fromLink = params.get('code') ?? ''

  const disconnect = async (c: Shared) => {
    if (!(await confirmAction({ title: t('conn.disconnectTitle', { name: c.name }), body: t('conn.disconnectBody'), danger: true, confirmLabel: t('conn.disconnect') }))) return
    if (!live) return setData((d) => d && { ...d, subs: d.subs.filter((x) => x.id !== c.id), head: d.head?.id === c.id ? null : d.head })
    try {
      await api(`/connections/${c.id}`, undefined, 'DELETE')
      await load()
    } catch (e) {
      setError(err(e))
    }
  }

  if (!data) return <div className="d-panel">{error || <span className="spinner dark" />}</div>
  if (!data.ready) return <p className="d-hint-box">{t('conn.notReady')}</p>

  return (
    <div className="cn">
      <p className="d-hint-box">
        <Link2 size={16} /> <span>{live ? t('conn.intro') : `${t('conn.intro')} ${t('conn.demo')}`}</span>
      </p>
      {error && (
        <p className="cn-err" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="cn-ok">{notice}</p>}

      <JoinCard
        initial={fromLink}
        live={live}
        onDone={async (name) => {
          setNotice(t('conn.connected', { name }))
          if (fromLink) setParams({ tab: 'connections' }, { replace: true })
          await load()
        }}
      />

      {data.head && (
        <section className="cn-group">
          <h3>{t('conn.head')}</h3>
          <ChurchCard c={data.head} onDisconnect={() => disconnect(data.head!)} />
        </section>
      )}
      <section className="cn-group">
        <h3>{t('conn.subs')}</h3>
        {data.subs.length ? data.subs.map((c) => <ChurchCard key={c.id} c={c} onDisconnect={() => disconnect(c)} />) : !data.head && <p className="d-empty-sm">{t('conn.none')}</p>}
      </section>

      <InviteCard data={data} live={live} onChanged={load} onError={setError} />
    </div>
  )
}

function ChurchCard({ c, onDisconnect }: { c: Shared; onDisconnect: () => void }) {
  const { t } = useT()
  return (
    <article className="d-panel cn-card">
      <header>
        {c.logoUrl ? <img src={c.logoUrl} alt="" /> : <span className="cn-av">{c.name.slice(0, 2).toUpperCase()}</span>}
        <div>
          <b>{c.name}</b>
          <small>{[c.denomination, planName(c.plan as never)].filter(Boolean).join(' · ')}</small>
        </div>
        <button type="button" className="d-btn" onClick={onDisconnect}>
          <Unlink size={14} /> {t('conn.disconnect')}
        </button>
      </header>
      <ul className="cn-facts">
        {c.location && (
          <li>
            <MapPin size={14} /> {c.location}
          </li>
        )}
        {c.phone && (
          <li>
            <Phone size={14} /> <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>
          </li>
        )}
        {c.email && (
          <li>
            <Mail size={14} /> <a href={`mailto:${c.email}`}>{c.email}</a>
          </li>
        )}
        <li>
          <Link2 size={14} />{' '}
          <a href={c.joinUrl} target="_blank" rel="noreferrer">
            {t('conn.joinPage')}
          </a>
        </li>
      </ul>
      <div className="cn-stats">
        <span>
          <Users size={14} /> {t('conn.members', { n: c.stats.members })}
        </span>
        <span>{t('conn.newThisMonth', { n: c.stats.newThisMonth })}</span>
        {c.stats.lastService && <span>{t('conn.lastService', { n: c.stats.lastService.count ?? 0, date: fmtDate(c.stats.lastService.date) })}</span>}
      </div>
      <div className="cn-events">
        <small>{t('conn.upcoming')}</small>
        {c.events.length ? (
          c.events.map((e) => (
            <div key={e.title + e.date}>
              <CalendarDays size={14} /> <b>{e.title}</b> · {fmtDate(e.date)} {e.time}
              {e.location ? ` · ${e.location}` : ''}
            </div>
          ))
        ) : (
          <div className="d-empty-sm">{t('conn.noEvents')}</div>
        )}
      </div>
    </article>
  )
}

/** Enter a code (or arrive from an invitation link), see what it does, then accept. */
function JoinCard({ initial, live, onDone }: { initial: string; live: boolean; onDone: (name: string) => void }) {
  const { t } = useT()
  const [code, setCode] = useState(initial)
  const [preview, setPreview] = useState<{ church: string; location: string; as: 'head' | 'sub' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const check = useCallback(
    async (value: string) => {
      setError('')
      setPreview(null)
      if (!live) return setPreview({ church: 'Grace Chapel HQ', location: 'Ikeja, Lagos', as: 'head' })
      setBusy(true)
      try {
        setPreview(await api(`/connections/code/${encodeURIComponent(value.trim())}`))
      } catch (e) {
        setError(err(e))
      } finally {
        setBusy(false)
      }
    },
    [live],
  )
  useEffect(() => {
    if (initial) void check(initial)
  }, [initial, check])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (code.trim()) void check(code)
  }
  const accept = async () => {
    if (!preview) return
    if (!live) return onDone(preview.church)
    setBusy(true)
    try {
      const r = await api<{ head: string; sub: string }>('/connections/join', { code })
      setPreview(null)
      setCode('')
      onDone(preview.as === 'head' ? r.head : r.sub)
    } catch (e) {
      setError(err(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`d-panel cn-join ${initial ? 'is-invite' : ''}`}>
      <div className="d-panel-head">
        <h2>{t('conn.haveCode')}</h2>
      </div>
      <form className="cn-row" onSubmit={submit}>
        <input value={code} onChange={(e) => (setCode(e.target.value.toUpperCase()), setPreview(null))} placeholder={t('conn.codePh')} maxLength={12} aria-label={t('conn.codePh')} autoCapitalize="characters" />
        <button type="submit" className="d-btn" disabled={busy || !code.trim()}>
          {t('conn.check')}
        </button>
      </form>
      {error && <p className="cn-err">{error}</p>}
      {preview && (
        <div className="cn-confirm">
          <p>
            <b>{preview.church}</b>
            {preview.location ? ` · ${preview.location}` : ''}
            <br />
            {preview.as === 'head' ? t('conn.confirmSub', { church: preview.church }) : t('conn.confirmHead', { church: preview.church })}
          </p>
          <button type="button" className="d-btn d-btn-ink" onClick={accept} disabled={busy}>
            <Check size={15} /> {t('conn.accept')}
          </button>
        </div>
      )}
    </section>
  )
}

/** Invite by email, or create a code to share by hand; lists codes still waiting. */
function InviteCard({ data, live, onChanged, onError }: { data: Data; live: boolean; onChanged: () => void; onError: (m: string) => void }) {
  const { t } = useT()
  const [as, setAs] = useState<'head' | 'sub'>('head')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')
  const [copied, setCopied] = useState('')
  const [codes, setCodes] = useState<Code[]>(data.codes)
  useEffect(() => setCodes(data.codes), [data.codes])
  const canBeSub = !data.head

  const create = async (withEmail: boolean) => {
    setSent('')
    if (withEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return onError(t('common.invalidEmail'))
    if (!live) {
      setCodes((c) => [{ code: 'DEMO-2026', as, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), email: withEmail ? email.trim() : null }, ...c])
      if (withEmail) setSent(t('conn.sent', { email: email.trim() }))
      return
    }
    setBusy(true)
    try {
      await api('/connections/code', { as, email: withEmail ? email.trim() : undefined })
      if (withEmail) (setSent(t('conn.sent', { email: email.trim() })), setEmail(''))
      onChanged()
    } catch (e) {
      onError(err(e))
    } finally {
      setBusy(false)
    }
  }
  const cancel = async (code: string) => {
    if (!live) return setCodes((c) => c.filter((x) => x.code !== code))
    await api(`/connections/code/${code}`, undefined, 'DELETE').catch((e) => onError(err(e)))
    onChanged()
  }
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* clipboard blocked: the code is on screen */
    }
  }

  return (
    <section className="d-panel cn-invite">
      <div className="d-panel-head">
        <h2>{t('conn.connectTitle')}</h2>
      </div>
      <fieldset className="cn-as">
        <legend>{t('conn.weAre')}</legend>
        <label>
          <input type="radio" name="cn-as" checked={as === 'head'} onChange={() => setAs('head')} /> {t('conn.asHead')}
        </label>
        <label className={canBeSub ? '' : 'is-off'}>
          <input type="radio" name="cn-as" checked={as === 'sub'} disabled={!canBeSub} onChange={() => setAs('sub')} /> {t('conn.asSub')}
        </label>
      </fieldset>
      <label className="d-field">
        <span>{t('conn.inviteEmail')}</span>
        <div className="cn-row">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('conn.invitePh')} />
          <button type="button" className="d-btn d-btn-ink" disabled={busy || !email.trim()} onClick={() => create(true)}>
            <Mail size={14} /> {t('conn.send')}
          </button>
        </div>
      </label>
      {sent && <p className="cn-ok">{sent}</p>}
      <div className="cn-or">
        <span>{t('conn.orCode')}</span>
        <button type="button" className="d-btn" disabled={busy} onClick={() => create(false)}>
          {t('conn.makeCode')}
        </button>
      </div>
      {codes.length > 0 && (
        <div className="cn-codes">
          <small>{t('conn.codesTitle')}</small>
          {codes.map((c) => (
            <div key={c.code} className="cn-code">
              <code>{c.code}</code>
              <span>
                {c.as === 'head' ? t('conn.codeHead') : t('conn.codeSub')} · {c.email ? `${t('conn.invited', { email: c.email })} · ` : ''}
                {t('conn.expires', { date: fmtDate(c.expiresAt.slice(0, 10)) })}
              </span>
              <button type="button" className="d-icon-btn" onClick={() => copy(c.code)} aria-label={t('conn.copy')} title={copied === c.code ? t('conn.copied') : t('conn.copy')}>
                {copied === c.code ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button type="button" className="d-icon-btn" onClick={() => cancel(c.code)} aria-label={t('conn.cancel')} title={t('conn.cancel')}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
