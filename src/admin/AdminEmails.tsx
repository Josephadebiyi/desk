/** Staff console → Emails: preview every email ZionDesk sends, send yourself a test, and write newsletters. */
import { Mail, Newspaper, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CATALOG, type EmailKind } from '../emails/catalog'
import { renderEmail } from '../emails/render'
import { EMAIL_GROUPS, SAMPLE_VARS } from '../emails/samples'
import { EMAIL_LANGS, type EmailLang } from '../emails/strings'
import { api } from '../lib/api'
import { useSession } from '../lib/session'
import { Card, fmtDay, Head } from './Admin'

const err = (e: unknown) => (e instanceof Error ? e.message : String(e))
const LANG_LABEL: Record<EmailLang, string> = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português' }
const KIND_LABEL: Record<string, string> = {
  welcomeAccount: 'Welcome (sign-up complete)',
  confirmSignup: 'Confirm email',
  resetPassword: 'Reset password',
  magicLink: 'Magic sign-in link',
  emailChange: 'Confirm new email',
  teamInvite: 'Team invitation',
  accountDeleted: 'Account deleted',
  finishSignup1: 'Reminder 1 — day 1',
  finishSignup2: 'Reminder 2 — week 1',
  finishSignup3: 'Reminder 3 — week 2',
  finishSignup4: 'Reminder 4 — week 3 (last)',
  subscriptionConfirmed: 'Subscription confirmed',
  paymentReceipt: 'Monthly payment receipt',
  trialEnding: 'Trial ends in 3 days',
  paymentFailed: 'Payment failed',
  planExpired: 'Plan expired',
  promoEnded: 'Promotion ended',
  newsletter: 'Newsletter',
  registered: 'Member registration welcome',
  message: 'Church message',
  giftReceipt: 'Gift receipt',
  claimReceived: 'Bank transfer noted (donor)',
  claimAlert: 'Bank transfer to confirm (church)',
  birthday: 'Birthday',
  birthdayPrayer: 'Birthday prayer (AI)',
  eventReminder: 'Event reminder',
  meetingInvite: 'Online meeting invite',
}
const AUDIENCES = [
  { id: 'all', label: 'Everyone with an account' },
  { id: 'active', label: 'Paying churches' },
  { id: 'trial', label: 'Churches on a free trial' },
  { id: 'expired', label: 'Expired or cancelled churches' },
  { id: 'no_church', label: 'Signed up but never created a church' },
]

function Flash({ msg }: { msg: { ok: boolean; text: string } | null }) {
  return msg ? <p className={msg.ok ? 'adm-ok' : 'adm-err'}>{msg.text}</p> : null
}
function useFlash() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const show = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 4000)
  }
  return { msg, show }
}

function Preview({ html, subject }: { html: string; subject: string }) {
  return (
    <div className="adm-email-preview">
      <div className="adm-email-subject">
        <span>Subject</span> {subject}
      </div>
      <iframe title="Email preview" srcDoc={html} />
    </div>
  )
}

export function AdminEmails() {
  const [tab, setTab] = useState<'gallery' | 'newsletter'>('gallery')
  return (
    <>
      <Head title="Emails" sub="Every email ZionDesk sends — preview it, send yourself a test, or write a newsletter.">
        <div className="adm-tabs">
          <button type="button" className={tab === 'gallery' ? 'is-on' : ''} onClick={() => setTab('gallery')}>
            <Mail size={14} /> All emails
          </button>
          <button type="button" className={tab === 'newsletter' ? 'is-on' : ''} onClick={() => setTab('newsletter')}>
            <Newspaper size={14} /> Newsletter
          </button>
        </div>
      </Head>
      {tab === 'gallery' ? <Gallery /> : <Newsletter />}
    </>
  )
}

function Gallery() {
  const [kind, setKind] = useState<EmailKind>('welcomeAccount')
  const [lang, setLang] = useState<EmailLang>('en')
  const [busy, setBusy] = useState(false)
  const flash = useFlash()
  const { email } = useSession()
  const r = useMemo(() => renderEmail({ kind, lang, vars: SAMPLE_VARS, url: `${window.location.origin}/dashboard`, siteUrl: window.location.origin }), [kind, lang])
  const test = async () => {
    setBusy(true)
    try {
      const res = await api<{ to: string }>(`/admin/emails/${kind}/test`, { lang })
      flash.show(true, `Test sent to ${res.to} — check your inbox (and spam) in a minute.`)
    } catch (e) {
      flash.show(false, err(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="adm-email-layout">
      <Card title="Templates" sub={`${Object.keys(CATALOG.en).length} emails · 5 languages`}>
        <div className="adm-email-list">
          {EMAIL_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="adm-email-group">{g.title}</p>
              {g.kinds.map((k) => (
                <button key={k} type="button" className={k === kind ? 'is-on' : ''} onClick={() => setKind(k as EmailKind)}>
                  {KIND_LABEL[k] ?? k}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>
      <Card
        title={KIND_LABEL[kind] ?? kind}
        sub="Example values are filled in so you can see the real layout."
        action={
          <div className="adm-row-actions">
            <select value={lang} onChange={(e) => setLang(e.target.value as EmailLang)} aria-label="Language">
              {EMAIL_LANGS.map((l) => (
                <option key={l} value={l}>
                  {LANG_LABEL[l]}
                </option>
              ))}
            </select>
            <button type="button" className="adm-btn" onClick={test} disabled={busy}>
              <Send size={14} /> {busy ? 'Sending…' : `Send test to ${email || 'me'}`}
            </button>
          </div>
        }
      >
        <Flash msg={flash.msg} />
        <Preview html={r.html} subject={r.subject} />
      </Card>
    </div>
  )
}

interface NewsletterData {
  history: { id: string; subject: string; audience: string; sent_count: number; created_by: string; created_at: string }[]
  recipients: number
}

function Newsletter() {
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [audience, setAudience] = useState('all')
  const [data, setData] = useState<NewsletterData | null>(null)
  const [busy, setBusy] = useState<'' | 'test' | 'send'>('')
  const flash = useFlash()
  const load = () =>
    api<NewsletterData>(`/admin/newsletters?audience=${audience}`)
      .then(setData)
      .catch((e) => flash.show(false, err(e)))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience])
  const r = useMemo(
    () =>
      renderEmail({
        kind: 'newsletter',
        lang: 'en',
        vars: { subject: subject || 'Your subject line', text: text || 'Write your message on the left. Links like https://ziondesk.com become clickable.', name: 'Ade' },
        url: `${window.location.origin}/dashboard`,
        siteUrl: window.location.origin,
        unsubscribeUrl: '#',
      }),
    [subject, text],
  )
  const run = async (kind: 'test' | 'send') => {
    if (kind === 'send' && !window.confirm(`Send “${subject}” to ${data?.recipients ?? 0} people now? This can’t be undone.`)) return
    setBusy(kind)
    try {
      const res = await api<{ to?: string; sent?: number }>(`/admin/newsletters/${kind}`, { subject, text, audience })
      flash.show(true, kind === 'test' ? `Test sent to ${res.to}` : `Newsletter sent to ${res.sent} people`)
      if (kind === 'send') {
        setSubject('')
        setText('')
        load()
      }
    } catch (e) {
      flash.show(false, err(e))
    } finally {
      setBusy('')
    }
  }
  return (
    <>
      <div className="adm-email-layout">
        <Card title="Write a newsletter" sub="Everyone gets an unsubscribe link automatically. People who unsubscribed are skipped.">
          <Flash msg={flash.msg} />
          <div className="adm-form adm-form-1">
            <label>
              Who gets it
              <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                {AUDIENCES.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subject
              <input value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. New: register first-time guests with one QR code" />
            </label>
            <label>
              Message
              <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Hi friends,\n\nHere’s what’s new in ZionDesk this month…'} />
            </label>
            <div className="adm-row-actions">
              <button type="button" className="adm-btn ghost" onClick={() => run('test')} disabled={!!busy || !subject || !text}>
                <Send size={14} /> {busy === 'test' ? 'Sending…' : 'Send test to me'}
              </button>
              <button type="button" className="adm-btn" onClick={() => run('send')} disabled={!!busy || !subject || !text || !data?.recipients}>
                <Newspaper size={14} /> {busy === 'send' ? 'Sending…' : `Send to ${data?.recipients ?? '…'} people`}
              </button>
            </div>
          </div>
        </Card>
        <Card title="Preview">
          <Preview html={r.html} subject={r.subject} />
        </Card>
      </div>
      <Card title="Sent newsletters">
        {data?.history.length ? (
          <div className="adm-list">
            {data.history.map((h) => (
              <div key={h.id} className="adm-list-row">
                <div>
                  <b>{h.subject}</b>
                  <small>
                    {AUDIENCES.find((a) => a.id === h.audience)?.label ?? h.audience} · {h.sent_count} sent · by {h.created_by}
                  </small>
                </div>
                <small>{fmtDay(h.created_at)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="adm-empty">No newsletters sent yet.</p>
        )}
      </Card>
    </>
  )
}
