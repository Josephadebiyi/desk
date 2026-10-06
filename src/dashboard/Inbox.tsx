/** Messaging → Inbox: SMS and WhatsApp replies from members, answered straight from ZionDesk. */
import { Info, MessageCircle, MessageSquareText, Send, UserRound } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { remote } from '../lib/supabase'
import { fmtDate } from './kit'
import { confirmAction } from './confirm'

interface Conversation {
  id: string
  member_id: string | null
  phone: string
  channel: 'WhatsApp' | 'SMS'
  name: string
  last_message: string
  last_message_at: string
  last_inbound_at: string | null
  unread: number
}
interface Message {
  id: string
  direction: 'in' | 'out'
  body: string
  status: string
  by_name: string
  created_at: string
}

const time = (d: string) => {
  const date = new Date(d)
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : fmtDate(d, { day: 'numeric', month: 'short' })
}

/** Unread replies, for the badge on the Messaging tab. */
export function useInboxUnread(enabled = true) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!remote || !enabled) return
    const load = () => api<{ unread: number }>('/inbox/unread').then((r) => setN(r.unread)).catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [enabled])
  return n
}

export default function Inbox() {
  const { t } = useT()
  const [list, setList] = useState<Conversation[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [thread, setThread] = useState<{ conversation: Conversation; messages: Message[] } | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const end = useRef<HTMLDivElement>(null)

  const loadList = useCallback(() => {
    if (!remote) return setList([])
    api<{ conversations: Conversation[] }>('/inbox')
      .then((r) => setList(r.conversations))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  const loadThread = useCallback((id: string) => {
    api<{ conversation: Conversation; messages: Message[] }>(`/inbox/${id}`)
      .then((r) => {
        setThread(r)
        setList((all) => all?.map((c) => (c.id === id ? { ...c, unread: 0 } : c)) ?? all)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    loadList()
    const id = setInterval(loadList, 15_000)
    return () => clearInterval(id)
  }, [loadList])
  useEffect(() => {
    if (!openId) return
    loadThread(openId)
    const id = setInterval(() => loadThread(openId), 15_000)
    return () => clearInterval(id)
  }, [openId, loadThread])
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [thread?.messages.length])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!openId || !text.trim()) return
    const who = list?.find((c) => c.id === openId)
    if (!(await confirmAction({ title: t('cf.replyTitle'), body: t('cf.replyBody', { name: who?.name || who?.phone || '' }), confirmLabel: t('cf.replyBtn') }))) return
    setBusy(true)
    setError('')
    try {
      await api(`/inbox/${openId}/reply`, { body: text.trim() })
      setText('')
      loadThread(openId)
      loadList()
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex))
    } finally {
      setBusy(false)
    }
  }

  const conv = thread?.conversation
  const windowOpen = conv?.last_inbound_at && Date.now() - new Date(conv.last_inbound_at).getTime() < 23.5 * 3600e3

  return (
    <div className="ib">
      <aside className="d-panel ib-list">
        {list && !list.length && <p className="d-empty-sm">{t('att.inbox.empty')}</p>}
        {list?.map((c) => (
          <button key={c.id} type="button" className={`ib-row ${c.id === openId ? 'is-on' : ''} ${c.unread ? 'is-unread' : ''}`} onClick={() => setOpenId(c.id)}>
            <span className={`ib-ch ${c.channel === 'WhatsApp' ? 'wa' : 'sms'}`}>{c.channel === 'WhatsApp' ? <MessageCircle size={15} /> : <MessageSquareText size={15} />}</span>
            <span className="ib-row-main">
              <b>{c.name || c.phone || t('att.inbox.unknown')}</b>
              <small>{c.last_message}</small>
            </span>
            <span className="ib-row-meta">
              <small>{time(c.last_message_at)}</small>
              {c.unread > 0 && <i>{c.unread}</i>}
            </span>
          </button>
        ))}
      </aside>

      <section className="d-panel ib-thread">
        {!conv ? (
          <p className="d-empty-sm">{list?.length ? t('att.inbox.pick') : ''}</p>
        ) : (
          <>
            <header className="ib-head">
              <div>
                <b>{conv.name || conv.phone}</b>
                <small>
                  {conv.channel} · {conv.phone}
                </small>
              </div>
              {conv.member_id && (
                <Link className="d-btn" to={`/dashboard/members?id=${conv.member_id}`}>
                  <UserRound size={14} /> {t('att.inbox.member')}
                </Link>
              )}
            </header>
            <div className="ib-msgs">
              {thread!.messages.map((m) => (
                <div key={m.id} className={`ib-msg ${m.direction}`}>
                  <p>{m.body}</p>
                  <small>
                    {m.direction === 'out' && m.by_name ? `${m.by_name} · ` : ''}
                    {time(m.created_at)}
                    {m.status === 'failed' ? ' · failed' : ''}
                  </small>
                </div>
              ))}
              <div ref={end} />
            </div>
            {conv.channel === 'WhatsApp' && !windowOpen && (
              <p className="ib-note">
                <Info size={14} /> {t('att.inbox.window')}
              </p>
            )}
            <form className="ib-reply" onSubmit={send}>
              <textarea
                rows={2}
                value={text}
                maxLength={1500}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) void send(e)
                }}
                placeholder={t('att.inbox.reply')}
              />
              <button type="submit" className="d-btn d-btn-ink" disabled={busy || !text.trim()}>
                <Send size={15} /> {t('att.inbox.send')}
              </button>
            </form>
            <small className="ib-note">{t('att.inbox.channelNote')}</small>
          </>
        )}
        {error && <p className="d-errors">{error}</p>}
      </section>
    </div>
  )
}
