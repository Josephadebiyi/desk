import { AnimatePresence, motion } from 'framer-motion'
import { LifeBuoy, Mail, Plus, Send } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useSession } from '../lib/session'
import { Link } from 'react-router-dom'
import { PageHead } from './kit'
import { useT } from '../i18n'

const FAQ = [1, 2, 3, 4, 5, 6, 7, 8]

export default function Help() {
  const [open, setOpen] = useState<number | null>(0)
  const { t } = useT()
  const session = useSession()
  return (
    <div className="d-page">
      <PageHead title={t('dash.nav.help')} />
      <div className="d-two">
        <section className="d-panel d-span-2">
          <div className="d-panel-head">
            <h2>{t('help.faq')}</h2>
          </div>
          <div className="hp-list">
            {FAQ.map((n, i) => (
              <div key={n} className={`hp-item ${open === i ? 'is-open' : ''}`}>
                <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                  <span>{t(`help.q${n}`)}</span>
                  <motion.span animate={{ rotate: open === i ? 45 : 0 }}>
                    <Plus size={16} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open === i && (
                    <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      {t(`help.a${n}`)}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>
        {session.remote && <Support />}
        <section className="d-panel d-soon">
          <span className="d-soon-ico">
            <Mail size={22} />
          </span>
          <h2>{t('help.still')}</h2>
          <p>{t('help.stillSub')}</p>
          <a className="d-btn d-btn-ink" href="mailto:hello@ziondesk.com">
            {t('help.email')}
          </a>
        </section>
        <section className="d-panel d-soon">
          <h2>{t('help.links')}</h2>
          <div className="hp-links">
            <Link to="/dashboard/members?import=1" className="d-btn">
              {t('members.importTitle')}
            </Link>
            <Link to="/dashboard/events" className="d-btn">
              {t('events.new')}
            </Link>
            <Link to="/dashboard/settings?tab=team" className="d-btn">
              {t('help.inviteTeam')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

interface Ticket {
  id: string
  subject: string
  status: 'open' | 'pending' | 'closed'
  created_at: string
  support_messages: { id: string; author: 'user' | 'staff'; author_name: string; body: string; created_at: string }[]
}

/** Contact support: open a ticket and follow replies from the ZionDesk team. */
function Support() {
  const { t, locale } = useT()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [reply, setReply] = useState<Record<string, string>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const load = () => api<{ tickets: Ticket[] }>('/support').then((r) => setTickets(r.tickets)).catch(() => {})
  useEffect(() => {
    load()
  }, [])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) return setError(t('help.support.err'))
    setBusy(true)
    setError('')
    try {
      await api('/support', { subject, body })
      setSubject('')
      setBody('')
      setSent(true)
      load()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="d-panel d-span-2 hp-support">
      <div className="d-panel-head">
        <h2>
          <LifeBuoy size={17} /> {t('help.support.title')}
        </h2>
      </div>
      <form className="d-form" onSubmit={submit}>
        <label className="d-field">
          <span>{t('help.support.subject')}</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} />
        </label>
        <label className="d-field">
          <span>{t('help.support.message')}</span>
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} placeholder={t('help.support.ph')} />
        </label>
        {error && <p className="d-errors">{error}</p>}
        {sent && <p className="d-hint-box st-billing-ok">{t('help.support.sent')}</p>}
        <div className="d-form-actions">
          <button type="submit" className="d-btn d-btn-ink" disabled={busy}>
            <Send size={15} /> {busy ? t('common.loading') : t('help.support.send')}
          </button>
        </div>
      </form>
      {tickets.length > 0 && (
        <div className="hp-tickets">
          <h3>{t('help.support.mine')}</h3>
          {tickets.map((tk) => (
            <div key={tk.id} className="hp-ticket">
              <button type="button" onClick={() => setOpenId(openId === tk.id ? null : tk.id)}>
                <b>{tk.subject}</b>
                <span className={`d-pill ${tk.status === 'pending' ? 'd-pill-lime' : ''}`}>{t(`help.support.status.${tk.status}`)}</span>
                <small>{new Date(tk.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</small>
              </button>
              {openId === tk.id && (
                <div className="hp-thread">
                  {[...tk.support_messages]
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((m) => (
                      <p key={m.id} className={m.author === 'staff' ? 'is-staff' : ''}>
                        <small>{m.author === 'staff' ? 'ZionDesk' : m.author_name || t('help.support.you')}</small>
                        {m.body}
                      </p>
                    ))}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!reply[tk.id]?.trim()) return
                      await api(`/support/${tk.id}/reply`, { body: reply[tk.id] })
                      setReply({ ...reply, [tk.id]: '' })
                      load()
                    }}
                  >
                    <input value={reply[tk.id] ?? ''} onChange={(e) => setReply({ ...reply, [tk.id]: e.target.value })} placeholder={t('help.support.reply')} />
                    <button type="submit" className="d-btn">
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
