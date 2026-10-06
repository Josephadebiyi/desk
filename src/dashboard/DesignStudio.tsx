import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Bot, Check, Clock, Download, ImagePlus, Palette, Plus, Save, Send, Sparkles, Trash2, X } from 'lucide-react'
import { toPng } from 'html-to-image'
import QRCode from 'qrcode'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Flyer, flyerName, flyerSample, FLYER_TEMPLATES, type FlyerId } from '../components/Flyers'
import { tr, useT } from '../i18n'
import { AiFlyer } from './AiFlyer'
import { AskAI, fmtDate, Kpi, PageHead, PlanGate, Tabs } from './kit'
import { confirmAction, withConfirm } from './confirm'
import { useWorkspace, type DesignRequest } from './workspace'
import { api } from '../lib/api'
import { remote } from '../lib/supabase'

/* ───────────────────────── Create ───────────────────────── */

function Creator() {
  const { settings, addDesign } = useWorkspace()
  const { t } = useT()
  const [params] = useSearchParams()
  const [tpl, setTpl] = useState<FlyerId>('duotone')
  const [title, setTitle] = useState(params.get('title') ?? t('site.studio.defTitle'))
  const [when, setWhen] = useState(params.get('when') ?? t('site.studio.defWhen'))
  const [church, setChurch] = useState(settings.churchName)
  const [withQr, setWithQr] = useState(true)
  const [qrLink, setQrLink] = useState(`https://ziondesk.com/give/${settings.givingSlug}`)
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const art = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!withQr) {
      setQr('')
      return
    }
    QRCode.toDataURL(qrLink || ' ', { margin: 1, width: 400 }).then(setQr).catch(() => {})
  }, [withQr, qrLink])

  const download = async () => {
    if (!art.current) return
    setBusy(true)
    try {
      const url = await toPng(art.current, { pixelRatio: 2.5, cacheBust: true })
      const a = document.createElement('a')
      a.href = url
      a.download = `${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'flyer'}.png`
      a.click()
      setMsg(t('design.downloaded'))
    } catch {
      setMsg(t('design.downloadFailed'))
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(''), 2600)
    }
  }

  return (
    <div className="ds-grid">
      <section className="d-panel d-form">
        <div className="d-panel-head">
          <h2>
            <Palette size={17} /> {t('design.details')}
          </h2>
        </div>
        <label className="d-field">
          <span>{t('site.studio.title')}</span>
          <input value={title} maxLength={28} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="d-grid">
          <label className="d-field">
            <span>{t('site.studio.when')}</span>
            <input value={when} maxLength={28} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="d-field">
            <span>{t('site.studio.church')}</span>
            <input value={church} maxLength={28} onChange={(e) => setChurch(e.target.value)} />
          </label>
        </div>
        <label className="d-inline-check">
          <input type="checkbox" checked={withQr} onChange={(e) => setWithQr(e.target.checked)} /> {t('design.addQr')}
        </label>
        {withQr && (
          <label className="d-field">
            <span>{t('design.qrTo')}</span>
            <input value={qrLink} onChange={(e) => setQrLink(e.target.value)} />
          </label>
        )}
        <span className="d-field-label">{t('design.template')}</span>
        <div className="ds-templates" role="radiogroup" aria-label={t('design.template')}>
          {FLYER_TEMPLATES.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={tpl === x.id} className={`ds-tpl ${tpl === x.id ? 'is-on' : ''}`} onClick={() => setTpl(x.id)}>
              <Flyer template={x.id} title={title || flyerSample(x.id)} when={when} church={church} />
              <span>{flyerName(x.id)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="ds-stage">
        <div className="ds-art" ref={art}>
          <Flyer template={tpl} title={title || t('site.studio.your')} when={when} church={church} qr={qr || undefined} />
        </div>
        <div className="ds-actions">
          <button type="button" className="d-btn d-btn-ink" onClick={download} disabled={busy}>
            <Download size={15} /> {busy ? t('design.preparing') : t('site.give.download')}
          </button>
          <button
            type="button"
            className="d-btn"
            onClick={withConfirm({ title: t('cf.designSaveTitle'), confirmLabel: t('cf.save') }, () => {
              addDesign({ template: tpl, title: title || t('design.untitled'), when })
              setMsg(t('design.saved'))
              setTimeout(() => setMsg(''), 2200)
            })}
          >
            <Save size={15} /> {t('design.save')}
          </button>
        </div>
        <AnimatePresence>
          {msg && (
            <motion.p className="ds-msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Check size={14} /> {msg}
            </motion.p>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}

function MyDesigns({ onOpen }: { onOpen: () => void }) {
  const { designs, removeDesign, settings } = useWorkspace()
  const { t } = useT()
  if (!designs.length)
    return (
      <div className="d-panel d-soon">
        <span className="d-soon-ico">
          <Palette size={22} />
        </span>
        <h2>{t('design.noSaved')}</h2>
        <p>{t('design.noSavedSub')}</p>
        <button type="button" className="d-btn d-btn-ink" onClick={onOpen}>
          <Plus size={15} /> {t('design.tabs.create')}
        </button>
      </div>
    )
  return (
    <div className="ds-saved">
      {designs.map((d) => (
        <figure key={d.id} className="ds-saved-item">
          {d.svg ? <img className="ds-saved-ai" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(d.svg)}`} alt={d.title} /> : <Flyer template={d.template as FlyerId} title={d.title} when={d.when} church={settings.churchName} />}
          <figcaption>
            <span>
              <b>{d.title}</b>
              <small>{t('design.savedOn', { date: fmtDate(d.createdAt) })}</small>
            </span>
            <button type="button" className="d-circle d-circle-sm" aria-label={t('common.delete')} onClick={withConfirm({ title: t('cf.designDeleteTitle'), body: t('cf.cantUndo'), danger: true, confirmLabel: t('cf.delete') }, () => removeDesign(d.id))}>
              <Trash2 size={13} />
            </button>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

/* ───────────────────────── Design team (Max) ───────────────────────── */

const QUESTIONS = ['title', 'when', 'where', 'audience', 'text', 'inspiration', 'formats'].map((key) => ({ key, get ask() { return tr(`design.q.${key}`) } }))
const FORMATS = ['igPost', 'igStory', 'waStatus', 'a4', 'banner', 'slide']
/** Stored format ids → label (older requests stored English labels; those show as-is). */
const fmtLabel = (f: string) => (FORMATS.includes(f) ? tr(`design.formats.${f}`) : f)

interface ChatLine {
  from: 'ai' | 'you'
  text: string
  images?: string[]
}

async function shrink(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/')) return undefined
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const k = Math.min(1, 480 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k)
    c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.72)
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** This month's designer-request allowance (Ministry Max: 8 included, then €10 each). */
function useRequestQuota() {
  const [q, setQ] = useState<{ used: number; included: number } | null>(null)
  useEffect(() => {
    if (!remote) return
    api<{ used: number; included: number }>('/design/requests/quota').then(setQ).catch(() => setQ(null))
  }, [])
  return q
}

function BriefChat({ onDone, onCancel }: { onDone: (r: DesignRequest) => void; onCancel: () => void }) {
  const { addRequest } = useWorkspace()
  const quota = useRequestQuota()
  const extra = !!quota && quota.used >= quota.included
  const { t } = useT()
  const [step, setStep] = useState(0)
  const [lines, setLines] = useState<ChatLine[]>([{ from: 'ai', text: QUESTIONS[0].ask }])
  const [brief, setBrief] = useState<Record<string, string>>({})
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<{ name: string; dataUrl?: string }[]>([])
  const [formats, setFormats] = useState<string[]>(['igPost'])
  const [typing, setTyping] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const q = QUESTIONS[step]

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [lines, typing])

  const advance = (answer: string, images?: string[]) => {
    setLines((l) => [...l, { from: 'you', text: answer, images }])
    if (q.key !== 'inspiration' && q.key !== 'formats') setBrief((b) => ({ ...b, [q.key]: answer }))
    const next = step + 1
    setStep(next)
    if (next < QUESTIONS.length) {
      setTyping(true)
      setTimeout(() => {
        setTyping(false)
        setLines((l) => [...l, { from: 'ai', text: QUESTIONS[next].ask }])
      }, 650)
    } else {
      setTyping(true)
      setTimeout(() => {
        setTyping(false)
        setLines((l) => [...l, { from: 'ai', text: t('design.briefReady') }])
      }, 650)
    }
  }

  const submitText = (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    advance(input.trim())
    setInput('')
  }

  const addFiles = async (list: FileList | null) => {
    if (!list) return
    const picked = await Promise.all([...list].slice(0, 6).map(async (f) => ({ name: f.name, dataUrl: await shrink(f) })))
    setFiles((x) => [...x, ...picked].slice(0, 6))
  }

  const finished = step >= QUESTIONS.length

  return (
    <div className="d-panel brief">
      <div className="d-panel-head">
        <h2>
          <Bot size={17} /> {t('design.newRequest')}
        </h2>
        <button type="button" className="d-btn" onClick={onCancel}>
          <ArrowLeft size={15} /> {t('common.back')}
        </button>
      </div>
      <div className="brief-chat">
        {lines.map((l, i) => (
          <motion.div key={i} className={`brief-line is-${l.from}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {l.from === 'ai' && (
              <span className="brief-av">
                <Sparkles size={13} />
              </span>
            )}
            <div className="brief-bubble">
              {l.text}
              {l.images && l.images.length > 0 && (
                <div className="brief-imgs">
                  {l.images.map((src, k) => (
                    <img key={k} src={src} alt="" />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {typing && (
          <div className="brief-line is-ai">
            <span className="brief-av">
              <Sparkles size={13} />
            </span>
            <div className="brief-bubble brief-typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {!finished && !typing && q.key === 'inspiration' && (
        <div className="brief-input">
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <div className="brief-files">
            {files.map((f, i) => (
              <span key={i} className="brief-file">
                {f.dataUrl ? <img src={f.dataUrl} alt="" /> : <ImagePlus size={14} />}
                <button type="button" aria-label={t('common.remove')} onClick={() => setFiles((x) => x.filter((_, k) => k !== i))}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <button type="button" className="d-btn" onClick={() => fileInput.current?.click()}>
              <ImagePlus size={15} /> {t('design.upload')}
            </button>
          </div>
          <div className="brief-row">
            <button type="button" className="d-btn" onClick={() => advance(t('design.noInspiration'))}>
              {t('design.skip')}
            </button>
            <button
              type="button"
              className="d-btn d-btn-ink"
              disabled={!files.length}
              onClick={() => advance(t('design.images', { count: files.length }), files.map((f) => f.dataUrl).filter(Boolean) as string[])}
            >
              <Send size={15} /> {t('design.sendImages')}
            </button>
          </div>
        </div>
      )}

      {!finished && !typing && q.key === 'formats' && (
        <div className="brief-input">
          <div className="brief-chips">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                className={`d-pill ${formats.includes(f) ? 'd-pill-lime' : ''}`}
                onClick={() => setFormats((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]))}
              >
                {formats.includes(f) && <Check size={12} />} {fmtLabel(f)}
              </button>
            ))}
          </div>
          <div className="brief-row">
            <button type="button" className="d-btn d-btn-ink" disabled={!formats.length} onClick={() => advance(formats.map(fmtLabel).join(', '))}>
              <Send size={15} /> {t('common.continue')}
            </button>
          </div>
        </div>
      )}

      {!finished && !typing && q.key !== 'inspiration' && q.key !== 'formats' && (
        <form className="brief-input brief-text" onSubmit={submitText}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('design.answerPh')} autoFocus aria-label={t('design.answerPh')} />
          <button type="submit" className="d-circle d-circle-ink" aria-label={t('ai.page.send')}>
            <Send size={15} />
          </button>
        </form>
      )}

      {finished && !typing && (
        <div className="brief-summary">
          <dl>
            {[
              [t('design.brief.event'), brief.title],
              [t('design.brief.when'), brief.when],
              [t('design.brief.where'), brief.where],
              [t('design.brief.audience'), brief.audience],
              [t('design.brief.text'), brief.text],
              [t('design.brief.formats'), formats.map(fmtLabel).join(', ')],
              [t('design.brief.inspiration'), files.length ? t('design.images', { count: files.length }) : t('common.none')],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || '—'}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            className="d-btn d-btn-ink"
            onClick={withConfirm(
              { title: t('cf.requestTitle'), body: t('cf.requestBody', { title: brief.title || t('design.requestFallback') }), confirmLabel: extra ? t('design.payAndSend') : t('design.sendTeam') },
              () =>
                onDone(
                  addRequest({
                    title: brief.title || t('design.requestFallback'),
                    brief: { when: brief.when, where: brief.where, audience: brief.audience, text: brief.text },
                    formats,
                    inspiration: files,
                  }),
                ),
            )}
          >
            <Send size={15} /> {extra ? t('design.payAndSend') : t('design.sendTeam')}
          </button>
          {quota && <p className="brief-quota">{extra ? t('design.extraCost', { included: quota.included }) : t('design.quota', { used: quota.used, included: quota.included })}</p>}
        </div>
      )}
    </div>
  )
}

const STATUSES: DesignRequest['status'][] = ['Submitted', 'In design', 'Review', 'Delivered']

function useCountdown(due: string) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(due).getTime() - now
  if (ms <= 0) return tr('design.dueNow')
  const h = Math.floor(ms / 3600e3)
  const m = Math.floor((ms % 3600e3) / 60e3)
  return tr('design.left', { h, m })
}

function RequestView({ req, onBack }: { req: DesignRequest; onBack: () => void }) {
  const { postRequestMessage, reload } = useWorkspace()
  // Designer replies and status changes appear without refreshing the page.
  useEffect(() => {
    const id = setInterval(() => void reload(), 30_000)
    return () => clearInterval(id)
  }, [reload])
  const { t } = useT()
  const [text, setText] = useState('')
  const left = useCountdown(req.dueAt)
  const idx = STATUSES.indexOf(req.status)
  return (
    <div className="req-grid">
      <section className="d-panel">
        <div className="d-panel-head">
          <h2>{req.title}</h2>
          <button type="button" className="d-btn" onClick={onBack}>
            <ArrowLeft size={15} /> {t('design.allRequests')}
          </button>
        </div>
        <div className="req-status">
          {STATUSES.map((s, i) => (
            <span key={s} className={i < idx ? 'is-done' : i === idx ? 'is-on' : ''}>
              <i>{i < idx ? <Check size={12} strokeWidth={3} /> : i + 1}</i>
              {t(`enums.request.${s}`)}
            </span>
          ))}
        </div>
        {req.status === 'Awaiting payment' && (
          <div className="req-pay">
            <p>{t('design.awaitingPay')}</p>
            <button
              type="button"
              className="d-btn d-btn-ink"
              onClick={() =>
                api<{ link?: string }>(`/design/requests/${req.id}/pay`, {})
                  .then((r) => {
                    if (r.link) window.location.href = r.link
                    else void reload()
                  })
                  .catch((e) => window.alert(e instanceof Error ? e.message : String(e)))
              }
            >
              {t('design.payNow')}
            </button>
          </div>
        )}
        <p className="req-due">
          <Clock size={15} /> {t('design.deliveryBy')} {fmtDate(req.dueAt, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · <b>{left}</b>
        </p>
        <dl className="req-brief">
          {Object.entries(req.brief).map(([k, v]) => (
            <div key={k}>
              <dt>{t(`design.brief.${k}`)}</dt>
              <dd>{v || '—'}</dd>
            </div>
          ))}
          <div>
            <dt>{t('design.brief.formats')}</dt>
            <dd>{req.formats.map(fmtLabel).join(', ')}</dd>
          </div>
        </dl>
        {(req.deliverables?.length ?? 0) > 0 && (
          <div className="req-ready">
            <b>{t('design.ready')}</b>
            {req.deliverables!.map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noreferrer" download className="d-btn d-btn-lime">
                <Download size={15} /> {f.name}
              </a>
            ))}
          </div>
        )}
        {req.inspiration.length > 0 && (
          <div className="brief-imgs">
            {req.inspiration.map((f, i) => (f.dataUrl ? <img key={i} src={f.dataUrl} alt={f.name} /> : <span key={i}>{f.name}</span>))}
          </div>
        )}
      </section>

      <section className="d-panel req-chat">
        <div className="d-panel-head">
          <h2>{t('design.chat')}</h2>
        </div>
        <div className="req-thread">
          {req.messages.map((m) => (
            <div key={m.id} className={`req-msg is-${m.from}`}>
              {m.from !== 'you' && <small>{m.from === 'system' ? 'ZionDesk' : t('design.designer')}</small>}
              <p>{m.from === 'system' && (m.text === '__received__' || m.text.startsWith('Request received')) ? t('design.received') : m.text}</p>
              <time>{fmtDate(m.at, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}</time>
            </div>
          ))}
        </div>
        <form
          className="brief-input brief-text"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!text.trim()) return
            if (!(await confirmAction({ title: t('cf.requestMsgTitle'), confirmLabel: t('cf.replyBtn') }))) return
            postRequestMessage(req.id, text.trim())
            setText('')
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('design.messagePh')} aria-label={t('design.messagePh')} />
          <button type="submit" className="d-circle d-circle-ink" aria-label={t('ai.page.send')}>
            <Send size={15} />
          </button>
        </form>
      </section>
    </div>
  )
}

function RequestCard({ r, onOpen }: { r: DesignRequest; onOpen: () => void }) {
  const left = useCountdown(r.dueAt)
  return (
    <button type="button" className="req-card" onClick={onOpen}>
      <span className="d-chip t-purple">{tr(`enums.request.${r.status}`)}</span>
      <b>{r.title}</b>
      <small>{r.formats.map(fmtLabel).join(' · ')}</small>
      <span className="req-card-due">
        <Clock size={13} /> {left}
      </span>
    </button>
  )
}

function DesignTeam() {
  const { requests } = useWorkspace()
  const { t } = useT()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'list' | 'new' | string>(params.get('request') && params.get('paid') !== '1' ? params.get('request')! : 'list')
  const quota = useRequestQuota()
  const open = requests.find((r) => r.id === mode)

  if (mode === 'new') return <BriefChat onCancel={() => setMode('list')} onDone={(r) => setMode(r.id)} />
  if (open) return <RequestView req={open} onBack={() => setMode('list')} />

  return (
    <>
      <div className="dt-hero">
        <div>
          <span className="d-pill d-pill-lime">Ministry Max</span>
          <h2>{t('design.teamTitle')}</h2>
          <p>{t('design.teamSub')}</p>
        </div>
        <button type="button" className="d-btn d-btn-lime" onClick={() => setMode('new')}>
          <Plus size={15} /> {t('design.requestFlyer')}
        </button>
      </div>
      {params.get('paid') === '1' && <p className="d-hint-box st-billing-ok">{t('design.paid')}</p>}
      {quota && <p className="brief-quota">{quota.used >= quota.included ? t('design.extraCost', { included: quota.included }) : t('design.quota', { used: quota.used, included: quota.included })}</p>}
      <section className="d-panel dt-how">
        <h3>{t('design.how.title')}</h3>
        <ol>
          {[1, 2, 3, 4].map((n) => (
            <li key={n}>
              <span>{n}</span>
              <div>
                <b>{t(`design.how.s${n}`)}</b>
                <p>{t(`design.how.s${n}d`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="dt-how-note">{t('design.how.note')}</p>
      </section>
      {requests.length ? (
        <div className="req-cards">
          {requests.map((r) => (
            <RequestCard key={r.id} r={r} onOpen={() => setMode(r.id)} />
          ))}
        </div>
      ) : (
        <p className="d-empty-sm">{t('design.noRequests')}</p>
      )}
    </>
  )
}

/* ───────────────────────── Page ───────────────────────── */

export default function DesignStudio() {
  const { designs, requests } = useWorkspace()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'ai' | 'create' | 'saved' | 'team'>(params.get('tab') === 'team' ? 'team' : params.get('title') ? 'create' : 'ai')
  const activeReqs = useMemo(() => requests.filter((r) => r.status !== 'Delivered').length, [requests])
  const { t } = useT()

  return (
    <div className="d-page">
      <PageHead title={t('dash.nav.design')}>
        <Kpi icon={<Palette size={17} />} value={designs.length} label={t('design.savedDesigns')} />
        <Kpi icon={<Bot size={17} />} value={activeReqs} label={t('design.inProgress')} />
      </PageHead>
      <div className="d-toolrow">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'ai', label: t('design.tabs.ai') },
            { id: 'create', label: t('design.tabs.create') },
            { id: 'saved', label: `${t('design.tabs.saved')}${designs.length ? ` (${designs.length})` : ''}` },
            { id: 'team', label: t('design.tabs.team') },
          ]}
        />
        <AskAI label={t('design.ai')} prefill={t('design.aiPrefill')} />
      </div>
      {tab === 'create' && (
        <PlanGate need="plus" feature={t('dash.nav.design')}>
          <Creator />
        </PlanGate>
      )}
      {tab === 'ai' && <AiFlyer />}
      {tab === 'saved' && <MyDesigns onOpen={() => setTab('ai')} />}
      {tab === 'team' && (
        <PlanGate need="max" feature={t('design.teamFeature')}>
          <DesignTeam />
        </PlanGate>
      )}
    </div>
  )
}
