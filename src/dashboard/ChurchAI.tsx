import { AnimatePresence, motion } from 'framer-motion'
import {
  AlarmClock,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Plus,
  ArrowRight,
  BarChart3,
  Cake,
  CalendarPlus,
  Check,
  CircleDollarSign,
  Download,
  HeartHandshake,
  Inbox,
  Info,
  Megaphone,
  Palette,
  ArrowUp,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { buildInbox } from '../ai/inbox'
import { agentName, ask, type AskOutcome, type Attachment } from '../ai/orchestrator'
import { PROVIDERS, pickProvider } from '../ai/providers'
import { useAi } from '../ai/store'
import type { ToolContext } from '../ai/tools'
import { type Block, type PendingAction, type ProviderPref, type UsageFeature } from '../ai/types'
import { downloadCsv, fmtDate, planName, tEnum } from './kit'
import { useMembers } from './store'
import { useWorkspace } from './workspace'
import { useT } from '../i18n'
import { useSession } from '../lib/session'

interface Turn {
  id: string
  from: 'you' | 'ai'
  text?: string
  files?: { name: string; type: string }[]
  outcome?: AskOutcome
}

/** Quick prompts: `k` is the built-in question key (shown translated, routed by key). */
const QUICK: { icon: typeof Palette; label: string; k: string; prefill?: boolean; free?: boolean }[] = [
  { icon: HeartHandshake, label: 'attention', k: 'attention' },
  { icon: UserCheck, label: 'followUps', k: 'followUp' },
  { icon: Palette, label: 'design', k: 'flyer', free: true },
  { icon: Megaphone, label: 'announcement', k: 'announcement' },
  { icon: BarChart3, label: 'report', k: 'report' },
  { icon: CircleDollarSign, label: 'finance', k: 'finance' },
  { icon: Cake, label: 'birthdays', k: 'birthdaysWeek' },
  { icon: CalendarPlus, label: 'event', k: 'createEvent', prefill: true },
]

const MAX_FILES = 5
const MAX_BYTES = 10 * 1024 * 1024
const TEXT_EXT = /\.(txt|csv|md|json|tsv)$/i
const isImage = (f: File) => /^image\/(png|jpe?g|gif|webp)$/.test(f.type)
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

async function readAttachment(f: File): Promise<Attachment> {
  const base: Attachment = { name: f.name, type: f.type || 'application/octet-stream', size: f.size }
  if (isImage(f)) {
    const url = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.onerror = () => rej(r.error)
      r.readAsDataURL(f)
    })
    return { ...base, image: { mediaType: f.type, data: url.split(',')[1] ?? '' } }
  }
  if (TEXT_EXT.test(f.name) || f.type.startsWith('text/')) return { ...base, text: await f.text() }
  return base // PDF: name only until the backend extracts text
}

let seq = 0
const nextId = () => `t${Date.now()}-${seq++}`

function BlockView({ b, onConfirm, onCancel, resolved }: { b: Block; onConfirm: (id: string) => void; onCancel: (id: string) => void; resolved: Record<string, 'approved' | 'cancelled'> }) {
  const { t } = useT()
  if (b.type === 'text') return <p className="ai-text">{b.text}</p>
  if (b.type === 'notice')
    return (
      <p className="ai-notice">
        <Info size={14} /> {b.text}
      </p>
    )
  if (b.type === 'stats')
    return (
      <div className="ai-stats">
        {b.items.map((s) => (
          <div key={s.label}>
            <b>{s.value}</b>
            <small>{s.label}</small>
          </div>
        ))}
      </div>
    )
  if (b.type === 'list')
    return (
      <ul className="ai-list">
        {b.items.map((it, i) => (
          <li key={i}>
            {it.href ? (
              <Link to={it.href}>
                <b>{it.title}</b>
                {it.sub && <small>{it.sub}</small>}
              </Link>
            ) : (
              <span>
                <b>{it.title}</b>
                {it.sub && <small>{it.sub}</small>}
              </span>
            )}
          </li>
        ))}
        {!!b.more && <li className="ai-more">{t('common.moreCount', { count: b.more })}</li>}
      </ul>
    )
  if (b.type === 'draft')
    return (
      <div className="ai-draft">
        <p>{b.text}</p>
        {b.href && (
          <Link to={b.href} state={b.state} className="d-btn d-btn-ink">
            {t('ai.page.useInMessaging')} <ArrowRight size={14} />
          </Link>
        )}
      </div>
    )
  if (b.type === 'actions')
    return (
      <div className="ai-actions">
        {b.items.map((a) => (
          <Link key={a.label} to={a.href} state={a.state} className="d-btn">
            {a.label} <ArrowRight size={14} />
          </Link>
        ))}
      </div>
    )
  if (b.type === 'download')
    return (
      <div className="ai-actions">
        <button type="button" className="d-btn" onClick={() => downloadCsv(b.filename, b.rows)}>
          <Download size={14} /> {b.label}
        </button>
      </div>
    )
  const state = resolved[b.id]
  return (
    <div className={`ai-confirm ${state ? `is-${state}` : ''}`}>
      <b className="ai-confirm-title">{b.title}</b>
      <dl>
        {b.rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {state ? (
        <span className="ai-confirm-state">{state === 'approved' ? <><Check size={14} /> {t('ai.page.approved')}</> : <><X size={14} /> {t('ai.page.cancelled')}</>}</span>
      ) : (
        <div className="ai-actions">
          <button type="button" className="d-btn d-btn-ink" onClick={() => onConfirm(b.id)}>
            <Check size={14} /> {b.confirmLabel}
          </button>
          <button type="button" className="d-btn" onClick={() => onCancel(b.id)}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function ChurchAI() {
  const m = useMembers()
  const ws = useWorkspace()
  const ai = useAi()
  const session = useSession()
  const { t, locale } = useT()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [thread, setThread] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [fileError, setFileError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const pendings = useRef(new Map<string, PendingAction>())
  const [resolved, setResolved] = useState<Record<string, 'approved' | 'cancelled'>>({})
  const end = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const ctx: ToolContext = useMemo(
    () => ({
      user: { name: session.remote ? session.name || session.email : 'Pastor Mike', role: m.role },
      churchId: session.church?.id ?? (ws.settings.givingSlug || null),
      members: m.members,
      settings: ws.settings,
      events: ws.events,
      campaigns: ws.campaigns,
      expenses: ws.expenses,
      anonGifts: ws.anonGifts,
      designRequests: ws.requests,
      claims: ws.claims,
      messageCost: ai.settings.messageCost,
      actions: { addCampaign: ws.addCampaign, logCommunicationMany: m.logCommunicationMany, saveEvent: ws.saveEvent },
    }),
    [m, ws, ai.settings.messageCost, session],
  )

  const plan = ws.settings.plan
  const used = ai.usedThisMonth('requests')
  const limit = ai.limitFor('requests', plan)
  const resetDate = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
  }, [locale])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [thread, busy])

  const addFiles = async (list: FileList | File[]) => {
    setFileError('')
    const incoming = [...list]
    if (files.length + incoming.length > MAX_FILES) return setFileError(t('ai.attach.limit'))
    const ok: Attachment[] = []
    for (const f of incoming) {
      if (f.size > MAX_BYTES) return setFileError(t('ai.attach.tooBig', { name: f.name }))
      if (!isImage(f) && !isPdf(f) && !TEXT_EXT.test(f.name) && !f.type.startsWith('text/')) return setFileError(t('ai.attach.unsupported', { name: f.name }))
      try {
        ok.push(await readAttachment(f))
      } catch {
        return setFileError(t('common.somethingWrong'))
      }
    }
    setFiles((x) => [...x, ...ok])
    inputRef.current?.focus()
  }

  const send = useCallback(
    async (q: string, routeKey?: string) => {
      const text = q.trim()
      if ((!text && !files.length) || busy) return
      const sent = files
      setInput('')
      setFiles([])
      setFileError('')
      setThread((x) => [...x, { id: nextId(), from: 'you', text: text || t('ai.attach.add'), files: sent.map((f) => ({ name: f.name, type: f.type })) }])
      if (limit && used >= limit) {
        setThread((x) => [
          ...x,
          { id: nextId(), from: 'ai', outcome: { agent: 'church-ai', provider: 'local', blocks: [{ type: 'text', text: t('ai.route.limit', { limit, plan: planName(plan), date: resetDate }) }] } },
        ])
        return
      }
      setBusy(true)
      const history = thread.filter((x) => x.text || x.outcome).map((x) => ({ role: x.from === 'you' ? ('user' as const) : ('assistant' as const), content: x.text ?? x.outcome?.blocks.map((b) => ('text' in b ? b.text : '')).join(' ') ?? '' }))
      const outcome = await ask(text, ctx, { pref: ai.settings.provider, status: ai.status, history, routeKey, attachments: sent })
      if (outcome.pending) pendings.current.set(outcome.pending.id, outcome.pending)
      ai.record({ feature: 'requests', units: ai.settings.credits.requests, provider: outcome.usage?.provider ?? outcome.provider, model: outcome.usage?.model ?? 'rules', estCostUsd: outcome.usage?.estCostUsd ?? 0, user: ctx.user!.name })
      ai.log({
        user: ctx.user!.name,
        agent: outcome.agent,
        action: outcome.pending ? t('ai.page.prepared', { summary: outcome.pending.summary }) : outcome.activity ?? t('ai.page.answered', { q: text.slice(0, 60) }),
        entity: outcome.entity,
        result: outcome.denied ? 'denied' : 'success',
        approval: outcome.pending ? 'pending' : 'not required',
      })
      setThread((x) => [...x, { id: nextId(), from: 'ai', outcome }])
      setBusy(false)
    },
    [busy, thread, ctx, ai, limit, used, plan, resetDate, files, t],
  )

  // Contextual entry points: /dashboard/ai?q=…(&k=key) asks immediately, ?prefill=… fills the box.
  const consumed = useRef(false)
  useEffect(() => {
    if (consumed.current) return
    const q = params.get('q')
    const k = params.get('k') ?? undefined
    const prefill = params.get('prefill')
    if (!q && !prefill) return
    consumed.current = true
    setParams({}, { replace: true })
    if (q) send(q, k)
    else {
      setInput(prefill!)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [params, setParams, send])

  const confirm = (id: string) => {
    const p = pendings.current.get(id)
    if (!p) return
    const result = p.run()
    pendings.current.delete(id)
    setResolved((r) => ({ ...r, [id]: 'approved' }))
    ai.log({ user: ctx.user!.name, agent: p.agent, action: result.activity ?? p.summary, entity: p.entity, result: 'success', approval: 'approved' })
    setThread((x) => [...x, { id: nextId(), from: 'ai', outcome: { ...result, provider: 'local' } }])
  }
  const cancel = (id: string) => {
    const p = pendings.current.get(id)
    pendings.current.delete(id)
    setResolved((r) => ({ ...r, [id]: 'cancelled' }))
    if (p) ai.log({ user: ctx.user!.name, agent: p.agent, action: t('ai.page.cancelledLog', { summary: p.summary }), entity: p.entity, result: 'success', approval: 'cancelled' })
  }

  const inbox = useMemo(() => {
    const now = new Date().toISOString()
    return buildInbox(ctx, m.role).filter((it) => {
      const st = ai.inbox[it.id]
      if (!st) return true
      if (st.status === 'snoozed') return !!st.until && st.until < now
      return false
    })
    // `locale` re-builds the translated inbox when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, m.role, ai.inbox, locale])

  const attention = inbox.filter((i) => i.priority === 1).slice(0, 4)
  const providerOptions: { id: ProviderPref; label: string }[] = [
    { id: 'auto', label: t('ai.page.autoRec') },
    { id: 'local', label: 'ZionDesk Local' },
    ...(['claude', 'gemini', 'openai'] as const).filter((p) => ai.status.enabled[p] && ai.status.available[p]).map((p) => ({ id: p as ProviderPref, label: PROVIDERS[p].label })),
  ]
  const routed = pickProvider('write', ai.settings.provider === 'local' ? 'auto' : ai.settings.provider, ai.status)
  const meters: UsageFeature[] = ['requests', 'designs', 'transcriptionHours', 'clips', 'storageGb']
  const started = thread.length > 0

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  const composer = (
    <form
      className={`ai-input ${dragging ? 'is-drag' : ''}`}
      onSubmit={onSubmit}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
      }}
    >
      {files.length > 0 && (
        <ul className="ai-files">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.image ? <img src={`data:${f.image.mediaType};base64,${f.image.data}`} alt="" /> : <span className="ai-file-ico"><FileText size={16} /></span>}
              <span>
                <b>{f.name}</b>
                <small>{(f.size / 1024).toFixed(f.size > 102400 ? 0 : 1)} KB</small>
              </span>
              <button type="button" aria-label={t('ai.attach.remove', { name: f.name })} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={inputRef}
        rows={1}
        value={input}
        placeholder={t('ai.page.placeholder')}
        aria-label={t('ai.page.inputLabel')}
        onChange={(e) => setInput(e.target.value)}
        onPaste={(e) => {
          const pasted = [...e.clipboardData.files]
          if (pasted.length) {
            e.preventDefault()
            addFiles(pasted)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send(input)
          }
        }}
      />
      <div className="ai-input-bar">
        <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.csv,.txt,.md,.json,.tsv" onChange={(e) => e.target.files && addFiles(e.target.files).finally(() => (e.target.value = ''))} />
        <button type="button" className="ai-attach" aria-label={t('ai.attach.add')} title={t('ai.attach.add')} onClick={() => fileRef.current?.click()}>
          <Plus size={18} />
        </button>
        {started && (
          <button type="button" className="ai-ghost" onClick={() => setThread([])}>
            {t('ai.page.newChat')}
          </button>
        )}
        <label className="ai-model" title={t('ai.page.autoHint')}>
          <select value={ai.settings.provider} onChange={(e) => ai.updateSettings({ provider: e.target.value as ProviderPref })} aria-label={t('ai.page.model')}>
            {providerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="ai-send" disabled={(!input.trim() && !files.length) || busy} aria-label={t('ai.page.send')}>
          <ArrowUp size={18} strokeWidth={2.5} />
        </button>
      </div>
      {dragging && (
        <div className="ai-drop" aria-hidden="true">
          <Paperclip size={18} /> {t('ai.attach.drop')}
        </div>
      )}
    </form>
  )

  return (
    <div className="d-page ai-page">
      <section className={`ai-chat ${started ? 'is-started' : ''}`}>
        {!started && (
          <div className="ai-hello">
            <span className="ai-avatar" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <h1>{t('ai.page.hello')}</h1>
            <p>{t('ai.page.sub')}</p>
          </div>
        )}

        {started && (
          <div className="ai-thread" aria-live="polite">
            {thread.map((turn) =>
              turn.from === 'you' ? (
                <motion.div key={turn.id} className="ai-turn is-you" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  {!!turn.files?.length && (
                    <span className="ai-turn-files">
                      {turn.files.map((f) => (
                        <span key={f.name}>
                          {f.type.startsWith('image/') ? <ImageIcon size={12} /> : <FileText size={12} />} {f.name}
                        </span>
                      ))}
                    </span>
                  )}
                  <p>{turn.text}</p>
                </motion.div>
              ) : (
                <motion.div key={turn.id} className="ai-turn is-ai" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <span className="ai-agent">
                    <span className="ai-avatar is-sm" aria-hidden="true">
                      <Sparkles size={11} />
                    </span>
                    Ellen
                    {turn.outcome!.agent !== 'church-ai' && <em> · {agentName(turn.outcome!.agent)}</em>}
                    {turn.outcome!.provider !== 'local' && <em> · {PROVIDERS[turn.outcome!.provider as keyof typeof PROVIDERS]?.label ?? turn.outcome!.provider}</em>}
                  </span>
                  {turn.outcome!.blocks.map((b, i) => (
                    <BlockView key={i} b={b} onConfirm={confirm} onCancel={cancel} resolved={resolved} />
                  ))}
                </motion.div>
              ),
            )}
            {busy && (
              <div className="ai-turn is-ai">
                <div className="brief-typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
            <div ref={end} />
          </div>
        )}

        {composer}
        {fileError && <p className="ai-file-error">{fileError}</p>}

        {!started && (
          <div className="ai-quick">
            {QUICK.map((qa) => (
              <button
                key={qa.label}
                type="button"
                onClick={() => {
                  const text = t(`ai.q.${qa.k}`)
                  if (qa.prefill) {
                    setInput(text)
                    inputRef.current?.focus()
                  } else send(text, qa.free ? undefined : qa.k)
                }}
              >
                <qa.icon size={15} /> {t(`ai.quick.${qa.label}`)}
              </button>
            ))}
          </div>
        )}
        <small className="ai-routing">{routed && routed !== 'local' ? t('ai.page.routedModel', { name: PROVIDERS[routed].label }) : t('ai.page.routedLocal')}</small>
      </section>

      <div className="ai-grid">
        <section className="d-panel ai-attention">
          <div className="d-panel-head">
            <h2>{t('ai.page.attention')}</h2>
          </div>
          {attention.length ? (
            <div className="ai-att-cards">
              {attention.map((it, i) => (
                <Link key={it.id} to={it.href} state={it.state} className={`ai-att t-${['purple', 'lime', 'ink', 'lavender'][i % 4]}`}>
                  <small>{agentName(it.agent)}</small>
                  <b>{it.title}</b>
                  <span>{it.detail}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="d-empty-sm">{t('ai.page.nothingUrgent')}</p>
          )}
        </section>

        <section className="d-panel ai-inbox">
          <div className="d-panel-head">
            <h2>
              <Inbox size={17} /> {t('ai.page.inbox')}
            </h2>
            <span className="d-pill">{inbox.length}</span>
          </div>
          <ul className="ai-inbox-list">
            <AnimatePresence initial={false}>
              {inbox.map((it) => (
                <motion.li key={it.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
                  <span className={`ai-prio p${it.priority}`} aria-label={it.priority === 1 ? t('ai.page.today') : t('ai.page.soon')} />
                  <div>
                    <b>{it.title}</b>
                    <small>
                      {agentName(it.agent)} · {it.detail}
                    </small>
                  </div>
                  <div className="ai-inbox-acts">
                    <button type="button" className="d-btn" onClick={() => navigate(it.href, { state: it.state })}>
                      {t('ai.page.review')}
                    </button>
                    <button type="button" className="d-circle d-circle-sm" title={t('ai.page.markDone')} aria-label={t('ai.page.markDone')} onClick={() => ai.setInbox(it.id, { status: 'done' })}>
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      className="d-circle d-circle-sm"
                      title={t('ai.page.snooze')}
                      aria-label={t('ai.page.snoozeShort')}
                      onClick={() => {
                        const d = new Date()
                        d.setDate(d.getDate() + 1)
                        d.setHours(7, 0, 0, 0)
                        ai.setInbox(it.id, { status: 'snoozed', until: d.toISOString() })
                      }}
                    >
                      <AlarmClock size={13} />
                    </button>
                    <button type="button" className="d-circle d-circle-sm" title={t('common.dismiss')} aria-label={t('common.dismiss')} onClick={() => ai.setInbox(it.id, { status: 'dismissed' })}>
                      <X size={13} />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
            {!inbox.length && <li className="d-empty-sm">{t('ai.page.caughtUp')}</li>}
          </ul>
        </section>

        <section className="d-panel ai-activity">
          <div className="d-panel-head">
            <h2>{t('ai.page.activity')}</h2>
          </div>
          <ul className="ai-act-list">
            {ai.activity.slice(0, 8).map((a) => (
              <li key={a.id}>
                <span className={`ai-act-dot is-${a.approval.replace(' ', '-')}`} />
                <div>
                  <b>{a.action}</b>
                  <small>
                    {agentName(a.agent)} · {a.user} · {fmtDate(a.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {a.approval !== 'not required' && ` · ${t(`ai.page.approval.${a.approval}`)}`}
                  </small>
                </div>
              </li>
            ))}
            {!ai.activity.length && <li className="d-empty-sm">{t('ai.page.noActivity')}</li>}
          </ul>
        </section>

        <section className="d-panel ai-usage">
          <div className="d-panel-head">
            <h2>{t('ai.page.usage')}</h2>
            <span className="d-pill">{planName(plan)}</span>
          </div>
          <ul className="ai-meters">
            {meters.map((f) => {
              const u = ai.usedThisMonth(f)
              const l = ai.limitFor(f, plan)
              return (
                <li key={f}>
                  <span>{t(`settings.usage.${f}`)}</span>
                  <b>
                    {(Math.round(u * 10) / 10).toLocaleString(locale)} / {l ? l.toLocaleString(locale) : '—'}
                  </b>
                  <i>
                    <em style={{ width: `${l ? Math.min(100, (u / l) * 100) : 0}%` }} />
                  </i>
                </li>
              )
            })}
          </ul>
          <small className="d-muted">{t('ai.page.resets', { date: resetDate, role: tEnum('role', m.role) })}</small>
        </section>
      </div>
    </div>
  )
}
