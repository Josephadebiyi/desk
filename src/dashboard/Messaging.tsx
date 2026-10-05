import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, Check, Info, Languages, Mail, MessageCircle, MessageSquareText, PencilLine, RotateCcw, Send, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AskAI, audienceLabel, audienceMembers, AudiencePicker, fmtDate, Kpi, Modal, NoAccess, PageHead, tEnum, today } from './kit'
import { useMembers } from './store'
import { can } from './types'
import { useWorkspace, type Audience, type Channel } from './workspace'
import { LANGS, localeOf, translate, useT, type Lang } from '../i18n'
import { Flag } from '../i18n/Flags'
import { withChurchName } from '../emails/sender'

/** Built-in templates (text lives in locales/<lang>/tpl.ts; admins can override per language). */
const TEMPLATE_KEYS = ['welcome', 'sunday', 'reminder', 'meetingInvite', 'birthday', 'thanks', 'announcement', 'departmentMeeting'] as const
type TemplateKey = (typeof TEMPLATE_KEYS)[number]

/** Details some templates need, filled once and formatted per language. */
const FIELDS = ['event', 'isoDate', 'isoTime', 'text', 'department', 'link'] as const
type Field = (typeof FIELDS)[number]
const needs = (raw: string): Field[] => FIELDS.filter((f) => raw.includes(`{${f === 'isoDate' ? 'date' : f === 'isoTime' ? 'time' : f}}`))

const CH: { id: Channel; icon: typeof Mail }[] = [
  { id: 'SMS', icon: MessageSquareText },
  { id: 'WhatsApp', icon: MessageCircle },
  { id: 'Email', icon: Mail },
]

const langName = (l: Lang) => LANGS.find((x) => x.code === l)?.native ?? l

/** Per-language template editor (admins). */
function TemplateEditor({ onClose }: { onClose: () => void }) {
  const { t } = useT()
  const { templates, setTemplate } = useWorkspace()
  const [key, setKey] = useState<TemplateKey>('welcome')
  const [lang, setLang] = useState<Lang>('en')
  const def = translate(lang, `tpl.${key}`)
  const current = templates[key]?.[lang] ?? def
  const [text, setText] = useState(current)
  useEffect(() => setText(templates[key]?.[lang] ?? translate(lang, `tpl.${key}`)), [key, lang, templates])
  const changed = text !== current
  return (
    <Modal title={t('msg.tplEditor')} onClose={onClose} wide>
      <div className="d-form">
        <p className="d-hint-box">
          <Languages size={15} /> {t('msg.tplEditorHint')}
        </p>
        <div className="m-tpl-keys">
          {TEMPLATE_KEYS.map((k) => (
            <button key={k} type="button" className={`d-pill ${key === k ? 'is-on' : ''}`} onClick={() => setKey(k)}>
              {t(`msg.tpl.${k}`)}
              {templates[k] && Object.keys(templates[k]!).length > 0 && <i className="m-edited" aria-label={t('msg.edited')} />}
            </button>
          ))}
        </div>
        <div className="m-langtabs" role="tablist">
          {LANGS.map((l) => (
            <button key={l.code} type="button" role="tab" aria-selected={lang === l.code} className={lang === l.code ? 'is-on' : ''} onClick={() => setLang(l.code)}>
              <Flag lang={l.code} size={18} /> {l.native}
              {templates[key]?.[l.code] !== undefined && <i className="m-edited" />}
            </button>
          ))}
        </div>
        <label className="d-field">
          <span>{t('msg.message')}</span>
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} lang={lang} />
        </label>
        <small className="d-muted">{t('msg.fieldsHint')}</small>
        <div className="d-form-actions">
          {templates[key]?.[lang] !== undefined && (
            <button type="button" className="d-btn" onClick={() => setTemplate(key, lang, null)}>
              <RotateCcw size={14} /> {t('msg.resetDefault')}
            </button>
          )}
          <button type="button" className="d-btn d-btn-ink" disabled={!changed || !text.trim()} onClick={() => setTemplate(key, lang, text.trim() === def ? null : text.trim())}>
            <Check size={15} /> {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Messaging() {
  const { members, role, logCommunicationMany } = useMembers()
  const { settings, campaigns, addCampaign, templates } = useWorkspace()
  const { t, lang: uiLang } = useT()
  const location = useLocation()
  const navState = location.state as { draft?: string; template?: string; vars?: Record<string, string> } | null
  const startKey = (TEMPLATE_KEYS as readonly string[]).includes(navState?.template ?? '') ? (navState!.template as TemplateKey) : null
  const [channel, setChannel] = useState<Channel>('SMS')
  const [audience, setAudience] = useState<Audience>({ type: 'all', value: '' })
  const [subject, setSubject] = useState('')
  // A template sends each member the version in their language; custom text is sent as written.
  const [tplKey, setTplKey] = useState<TemplateKey | null>(navState?.draft && !startKey ? null : startKey ?? 'sunday')
  const [vars, setVars] = useState<Record<string, string>>(navState?.vars ?? {})
  const [custom, setCustom] = useState(navState?.draft && !startKey ? navState.draft : '')
  const [edits, setEdits] = useState<Partial<Record<Lang, string>>>({}) // one-off edits for this send
  const [viewLang, setViewLang] = useState<Lang>(uiLang)
  const [later, setLater] = useState(false)
  const [when, setWhen] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(id)
  }, [toast])

  const recipients = useMemo(() => {
    const list = audienceMembers(members, audience)
    return channel === 'Email' ? list.filter((m) => m.email) : channel === 'WhatsApp' ? list.filter((m) => m.whatsapp) : list.filter((m) => m.phone)
  }, [members, audience, channel])

  // Recipients grouped by communication language, largest group first.
  const groups = useMemo(() => {
    const by = new Map<Lang, typeof recipients>()
    recipients.forEach((m) => by.set(m.language, [...(by.get(m.language) ?? []), m]))
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [recipients])

  useEffect(() => {
    if (groups.length && !groups.some(([l]) => l === viewLang)) setViewLang(groups[0][0])
  }, [groups, viewLang])

  if (!can.editMembers(role)) return <NoAccess what={t('msg.what')} />

  const rawFor = (l: Lang) => edits[l] ?? (tplKey ? templates[tplKey]?.[l] ?? translate(l, `tpl.${tplKey}`) : custom)
  const textFor = (l: Lang) => {
    const v: Record<string, string> = { ...vars }
    if (v.isoDate) v.date = new Date(v.isoDate + 'T00:00:00').toLocaleDateString(localeOf(l), { weekday: 'long', month: 'short', day: 'numeric' })
    if (v.isoTime) {
      const [h, mi] = v.isoTime.split(':').map(Number)
      v.time = new Date(2000, 0, 1, h, mi).toLocaleTimeString(localeOf(l), { hour: 'numeric', minute: '2-digit' })
    }
    return rawFor(l).replace(/\{(\w+)\}/g, (m, k) => (k === 'first_name' || k === 'church' ? m : v[k] ?? m))
  }
  const fieldsNeeded = tplKey ? needs(rawFor(viewLang)) : []
  const group = groups.find(([l]) => l === viewLang)?.[1] ?? []
  const sampleName = (group[0] ?? recipients[0])?.fullName.split(' ')[0] ?? 'Grace'
  const render = (s: string) => s.replace(/\{first_name\}/g, sampleName).replace(/\{church\}/g, settings.churchName)
  const rendered = render(textFor(viewLang))
  // SMS / WhatsApp come from the shared ZionDesk sender, so the church name leads every message.
  const shown = channel === 'Email' || !rendered ? rendered : withChurchName(rendered, settings.churchName)
  const segments = Math.max(1, Math.ceil(shown.length / 160))

  const send = () => {
    if (!tplKey && !custom.trim()) return setError(t('msg.errBody'))
    if (channel === 'Email' && !subject.trim()) return setError(t('msg.errSubject'))
    if (!recipients.length) return setError(t(`msg.errNone.${channel}`))
    if (tplKey) {
      const missing = groups.flatMap(([l]) => needs(textFor(l)))
      if (missing.length) return setError(t('msg.errFields'))
    }
    if (later && !when) return setError(t('msg.errWhen'))
    setError('')
    const languages = Object.fromEntries(groups.map(([l, ms]) => [l, ms.length]))
    addCampaign({
      channel,
      audience,
      recipients: recipients.length,
      subject: subject.trim(),
      body: textFor(uiLang).trim(),
      scheduledFor: later ? when : null,
      status: later ? 'Scheduled' : 'Queued',
      languages,
      template: tplKey ?? undefined,
      vars: tplKey ? vars : undefined,
    })
    if (!later) {
      groups.forEach(([l, ms]) =>
        logCommunicationMany(
          ms.map((m) => m.id),
          { channel, summary: (subject || textFor(l)).slice(0, 90), date: today(), by: t('members.you') },
        ),
      )
    }
    setToast(t(later ? 'msg.toastScheduled' : 'msg.toastQueued', { count: recipients.length }))
  }

  return (
    <div className="d-page">
      <PageHead title={t('msg.title')}>
        <Kpi icon={<Send size={17} />} value={campaigns.length} label={t('msg.sent')} />
        <Kpi icon={<Users size={17} />} value={campaigns.reduce((s, c) => s + c.recipients, 0)} label={t('msg.reached')} />
      </PageHead>

      <p className="d-hint-box">
        <Info size={15} /> {t('msg.deliveryNote')}
      </p>

      <div className="m-grid">
        <section className="d-panel d-form">
          <div className="d-panel-head">
            <h2>{t('msg.new')}</h2>
            <AskAI label={t('msg.writeAi')} prefill={t('msg.aiPrefill')} />
          </div>
          <div className="m-channels" role="radiogroup" aria-label={t('members.channel')}>
            {CH.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={channel === c.id} className={channel === c.id ? 'is-on' : ''} onClick={() => setChannel(c.id)}>
                <c.icon size={16} /> {c.id}
              </button>
            ))}
          </div>
          <AudiencePicker value={audience} onChange={setAudience} />
          {channel === 'Email' && (
            <label className="d-field">
              <span>{t('msg.subject')}</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('msg.subjectPh', { church: settings.churchName })} />
            </label>
          )}

          <div className="m-templates">
            {TEMPLATE_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={`d-pill ${tplKey === k ? 'is-on' : ''}`}
                onClick={() => {
                  setTplKey(k)
                  setEdits({})
                }}
              >
                {t(`msg.tpl.${k}`)}
              </button>
            ))}
            <button
              type="button"
              className={`d-pill ${!tplKey ? 'is-on' : ''}`}
              onClick={() => {
                setTplKey(null)
                setEdits({})
              }}
            >
              <PencilLine size={12} /> {t('msg.customText')}
            </button>
            {role === 'admin' && (
              <button type="button" className="d-link" onClick={() => setEditing(true)}>
                {t('msg.editTemplates')}
              </button>
            )}
          </div>

          {tplKey && fieldsNeeded.length > 0 && (
            <div className="d-grid">
              {fieldsNeeded.map((f) => (
                <label key={f} className="d-field">
                  <span>{t(`msg.field.${f}`)}</span>
                  <input
                    type={f === 'isoDate' ? 'date' : f === 'isoTime' ? 'time' : f === 'link' ? 'url' : 'text'}
                    value={vars[f] ?? ''}
                    onChange={(e) => setVars((v) => ({ ...v, [f]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          )}

          {groups.length > 0 && (
            <div className="m-langs">
              <span className="m-langs-label">
                <Languages size={14} /> {tplKey ? t('msg.byLanguage') : t('msg.customNote')}
              </span>
              <div className="m-langtabs" role="tablist">
                {groups.map(([l, ms]) => (
                  <button key={l} type="button" role="tab" aria-selected={viewLang === l} className={viewLang === l ? 'is-on' : ''} onClick={() => setViewLang(l)}>
                    <Flag lang={l} size={18} /> {langName(l)} <b>{ms.length}</b>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="d-field">
            <span>{tplKey ? t('msg.messageIn', { language: langName(viewLang) }) : t('msg.message')}</span>
            <textarea
              rows={6}
              lang={tplKey ? viewLang : undefined}
              value={tplKey ? rawFor(viewLang) : custom}
              onChange={(e) => (tplKey ? setEdits((x) => ({ ...x, [viewLang]: e.target.value })) : setCustom(e.target.value))}
            />
          </label>
          <div className="m-tokens">
            <span>{t('msg.personalize')}</span>
            {['{first_name}', '{church}'].map((tok) => (
              <button
                key={tok}
                type="button"
                className="d-pill"
                onClick={() =>
                  tplKey
                    ? setEdits((x) => ({ ...x, [viewLang]: rawFor(viewLang) + (rawFor(viewLang).endsWith(' ') ? '' : ' ') + tok }))
                    : setCustom((b) => b + (b.endsWith(' ') ? '' : ' ') + tok)
                }
              >
                {tok}
              </button>
            ))}
            {channel === 'SMS' && <small className="m-count">{t('msg.smsCount', { chars: shown.length, count: segments })}</small>}
          </div>
          <label className="d-inline-check">
            <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} /> {t('msg.later')}
          </label>
          {later && (
            <label className="d-field">
              <span>{t('msg.sendAt')}</span>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
          )}
          {error && <p className="d-errors">{error}</p>}
          <div className="d-form-actions">
            <button type="button" className="d-btn d-btn-ink" onClick={send}>
              {later ? <CalendarClock size={15} /> : <Send size={15} />} {t(later ? 'msg.scheduleTo' : 'msg.sendTo', { count: recipients.length })}
            </button>
          </div>
        </section>

        <section className="m-preview-wrap">
          <div className={`m-phone ch-${channel.toLowerCase()}`}>
            <div className="m-phone-top">
              <b>{channel === 'Email' ? settings.email : 'ZionDesk'}</b>
              <small>
                {channel} · <Flag lang={viewLang} size={12} /> {langName(viewLang)}
              </small>
            </div>
            {channel === 'Email' && <div className="m-subject">{subject || t('msg.subjectLine')}</div>}
            <div className="m-bubble" lang={viewLang}>
              {shown || t('msg.previewEmpty')}
            </div>
            <small className="m-preview-note">{t('msg.previewFor', { name: sampleName })}</small>
          </div>
        </section>
      </div>

      <section className="d-panel">
        <div className="d-panel-head">
          <h2>{t('msg.history')}</h2>
        </div>
        <ul className="d-list">
          {campaigns.map((c) => (
            <li key={c.id}>
              <span className={`d-chip ${c.channel === 'SMS' ? 't-purple' : c.channel === 'WhatsApp' ? 't-lime' : 't-ink'}`}>{c.channel}</span>
              <div>
                <b>{c.subject || (c.template ? t(`msg.tpl.${c.template}`) : c.body)}</b>
                <small>
                  {audienceLabel(c.audience)} · {t('common.people', { count: c.recipients })} · {c.scheduledFor ? t('msg.forDate', { date: fmtDate(c.scheduledFor) }) : fmtDate(c.createdAt)}
                  {c.languages && (
                    <span className="m-hist-langs">
                      {Object.entries(c.languages).map(([l, n]) => (
                        <span key={l}>
                          <Flag lang={l as Lang} size={12} /> {n}
                        </span>
                      ))}
                    </span>
                  )}
                </small>
              </div>
              <span className="d-pill">{tEnum('campaign', c.status)}</span>
            </li>
          ))}
          {!campaigns.length && <p className="d-empty-sm">{t('msg.nothing')}</p>}
        </ul>
      </section>

      <AnimatePresence>{editing && <TemplateEditor onClose={() => setEditing(false)} />}</AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div className="d-toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} role="status">
            <Check size={15} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
