import { AnimatePresence } from 'framer-motion'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, MapPin, MessageSquareText, Palette, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleMeetLogo } from '../components/GoogleMeet'
import { AskAI, audienceLabel, audienceMembers, AudiencePicker, fmtDate, fmtTime, Kpi, Modal, PageHead, tEnum, today } from './kit'
import { useT } from '../i18n'
import { reminderVars, tpl } from '../ai/tools'
import { useMembers } from './store'
import { can } from './types'
import { useWorkspace, type ChurchEvent } from './workspace'

const MODES: ChurchEvent['mode'][] = ['In person', 'Online', 'Hybrid']
const pad = (n: number) => String(n).padStart(2, '0')

function EventForm({ initial, date, onClose }: { initial?: ChurchEvent; date?: string; onClose: () => void }) {
  const { members } = useMembers()
  const { saveEvent } = useWorkspace()
  const { t } = useT()
  const [f, setF] = useState<Omit<ChurchEvent, 'id' | 'invited' | 'attendance'>>(
    initial ?? {
      title: '',
      date: date ?? today(),
      start: '09:00',
      end: '11:00',
      mode: 'In person',
      location: '',
      googleMeet: false,
      meetLink: '',
      audience: { type: 'all', value: '' },
      notes: '',
    },
  )
  const [error, setError] = useState('')
  const online = f.mode !== 'In person'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.title.trim()) return setError(t('events.errTitle'))
    if (f.end <= f.start) return setError(t('events.errTime'))
    if (online && f.googleMeet && f.meetLink && !/^https:\/\/\S+$/.test(f.meetLink.trim())) return setError(t('events.errLink'))
    saveEvent({
      ...f,
      id: initial?.id,
      title: f.title.trim(),
      googleMeet: online && f.googleMeet,
      meetLink: online && f.googleMeet ? f.meetLink?.trim() ?? '' : '',
      invited: audienceMembers(members, f.audience).length,
      attendance: initial?.attendance ?? null,
    })
    onClose()
  }

  return (
    <Modal title={initial ? t('events.edit') : t('events.new')} onClose={onClose} wide>
      <form className="d-form" onSubmit={submit} noValidate>
        <label className={`d-field ${error && !f.title ? 'has-error' : ''}`}>
          <span>{t('events.title_')}</span>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t('events.titlePh')} autoFocus />
        </label>
        <div className="d-grid">
          <label className="d-field">
            <span>{t('common.date')}</span>
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
          <div className="d-grid">
            <label className="d-field">
              <span>{t('events.starts')}</span>
              <input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
            </label>
            <label className="d-field">
              <span>{t('events.ends')}</span>
              <input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
            </label>
          </div>
        </div>
        <div className="m-channels" role="radiogroup" aria-label={t('ai.events.format')}>
          {MODES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={f.mode === m} className={f.mode === m ? 'is-on' : ''} onClick={() => setF({ ...f, mode: m, googleMeet: m !== 'In person' ? f.googleMeet || m === 'Online' : false })}>
              {tEnum('mode', m)}
            </button>
          ))}
        </div>
        {f.mode !== 'Online' && (
          <label className="d-field">
            <span>{t('events.location')}</span>
            <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder={t('events.locationPh')} />
          </label>
        )}
        {online && (
          <label className={`ev-meet ${f.googleMeet ? 'is-on' : ''}`}>
            <GoogleMeetLogo size={26} />
            <span>
              <b>{t('events.addMeet')}</b>
              <small>{t('events.addMeetSub')}</small>
            </span>
            <input type="checkbox" checked={f.googleMeet} onChange={(e) => setF({ ...f, googleMeet: e.target.checked })} />
            <i className="ev-switch" aria-hidden="true" />
          </label>
        )}
        {online && f.googleMeet && (
          <label className="d-field">
            <span>{t('events.meetLink')}</span>
            <input type="url" inputMode="url" value={f.meetLink ?? ''} onChange={(e) => setF({ ...f, meetLink: e.target.value })} placeholder="https://meet.google.com/abc-defg-hij" />
            <small className="d-muted">
              {t('events.meetLinkHint')}{' '}
              <a href="https://meet.google.com/new" target="_blank" rel="noreferrer" className="d-link">
                {t('events.createMeet')}
              </a>
            </small>
          </label>
        )}
        <fieldset>
          <legend>{t('events.invite')}</legend>
          <AudiencePicker value={f.audience} onChange={(audience) => setF({ ...f, audience })} />
        </fieldset>
        <label className="d-field">
          <span>{t('members.notes')}</span>
          <textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={t('events.notesPh')} />
        </label>
        {error && <p className="d-errors">{error}</p>}
        <div className="d-form-actions">
          <button type="button" className="d-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="d-btn d-btn-ink">
            <Check size={15} /> {initial ? t('events.save') : t('events.create')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EventDetail({ ev, onClose, onEdit }: { ev: ChurchEvent; onClose: () => void; onEdit: () => void }) {
  const { role } = useMembers()
  const { saveEvent, removeEvent } = useWorkspace()
  const navigate = useNavigate()
  const { t } = useT()
  const [att, setAtt] = useState(ev.attendance?.toString() ?? '')
  const past = ev.date <= today()
  const edit = can.editMembers(role)
  const when = `${fmtDate(ev.date, { weekday: 'long', month: 'long', day: 'numeric' })} · ${fmtTime(ev.start)} – ${fmtTime(ev.end)}`

  return (
    <Modal title={ev.title} onClose={onClose}>
      <div className="ev-detail">
        <p>
          <CalendarDays size={15} /> {when}
        </p>
        <p>
          <MapPin size={15} /> {tEnum('mode', ev.mode)}
          {ev.location ? ` · ${ev.location}` : ''}
        </p>
        <p>
          <Users size={15} /> {audienceLabel(ev.audience)} · {t('events.invited', { count: ev.invited })}
        </p>
        {ev.googleMeet && (
          <div className="ev-meet-card">
            <GoogleMeetLogo size={24} />
            <div>
              <b>Google Meet</b>
              {ev.meetLink ? (
                <a href={ev.meetLink} target="_blank" rel="noreferrer" className="d-link">
                  {t('events.join')}
                </a>
              ) : (
                <small>{t('events.meetNote')}</small>
              )}
            </div>
          </div>
        )}
        {ev.notes && <p className="d-notes">{ev.notes}</p>}
        {past && edit && (
          <form
            className="ev-att"
            onSubmit={(e) => {
              e.preventDefault()
              saveEvent({ ...ev, attendance: att === '' ? null : Math.max(0, Number(att)) })
              onClose()
            }}
          >
            <label className="d-field">
              <span>{t('events.attendance')}</span>
              <input type="number" min="0" value={att} onChange={(e) => setAtt(e.target.value)} placeholder={t('events.attendancePh')} />
            </label>
            <button type="submit" className="d-btn d-btn-ink">
              <Check size={15} /> {t('common.save')}
            </button>
          </form>
        )}
        {edit && (
          <div className="ev-actions">
            <button type="button" className="d-btn" onClick={() => navigate(`/dashboard/design?title=${encodeURIComponent(ev.title)}&when=${encodeURIComponent(`${fmtDate(ev.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(ev.start)}`)}`)}>
              <Palette size={15} /> {t('events.flyer')}
            </button>
            <button
              type="button"
              className="d-btn"
              onClick={() =>
                navigate('/dashboard/messaging', {
                  // Sent with a template so each invitee gets it in their own language.
                  state: { draft: tpl(ev.googleMeet ? 'meetingInvite' : 'reminder', reminderVars(ev)), template: ev.googleMeet ? 'meetingInvite' : 'reminder', vars: reminderVars(ev) },
                })
              }
            >
              <MessageSquareText size={15} /> {t('events.message')}
            </button>
            <button type="button" className="d-btn" onClick={onEdit}>
              <Pencil size={15} /> {t('common.edit')}
            </button>
            <button
              type="button"
              className="d-btn d-danger"
              onClick={() => {
                if (!window.confirm(t('events.confirmDelete'))) return
                removeEvent(ev.id)
                onClose()
              }}
            >
              <Trash2 size={15} /> {t('common.delete')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function Events() {
  const { role } = useMembers()
  const { events } = useWorkspace()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selected, setSelected] = useState(today())
  const [form, setForm] = useState<{ ev?: ChurchEvent; date?: string } | null>(null)
  const [open, setOpen] = useState<ChurchEvent | null>(null)
  const { t, locale } = useT()
  const edit = can.editMembers(role)
  // Weekday initials in the current language, starting on Sunday (2023-01-01 was a Sunday).
  const WEEK = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }))

  const byDate = useMemo(() => {
    const m: Record<string, ChurchEvent[]> = {}
    events.forEach((e) => (m[e.date] ??= []).push(e))
    Object.values(m).forEach((l) => l.sort((a, b) => a.start.localeCompare(b.start)))
    return m
  }, [events])
  const upcoming = events.filter((e) => e.date >= today()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))

  const first = cursor.getDay()
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const key = (d: number) => `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(d)}`
  const dayEvents = byDate[selected] ?? []

  return (
    <div className="d-page">
      <PageHead title={t('events.title')}>
        <Kpi icon={<CalendarDays size={17} />} value={upcoming.length} label={t('events.upcoming')} />
        {upcoming[0] && <Kpi icon={<Clock size={17} />} value={upcoming[0].title} label={`${fmtDate(upcoming[0].date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(upcoming[0].start)}`} />}
      </PageHead>

      <div className="ev-grid">
        <section className="d-panel">
          <div className="d-panel-head">
            <h2>{cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h2>
            <div>
              <button type="button" className="d-circle" aria-label={t('events.prevMonth')} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="d-circle" aria-label={t('events.nextMonth')} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                <ChevronRight size={16} />
              </button>
              {edit && <AskAI label={t('events.createAi')} prefill={t('ai.q.createEvent')} />}
              {edit && (
                <button type="button" className="d-btn d-btn-ink" onClick={() => setForm({ date: selected })}>
                  <Plus size={15} /> {t('events.new')}
                </button>
              )}
            </div>
          </div>
          <div className="cal">
            {WEEK.map((w) => (
              <span key={w} className="cal-w">
                {w}
              </span>
            ))}
            {cells.map((d, i) =>
              d === null ? (
                <span key={`x${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  className={`cal-d ${key(d) === selected ? 'is-sel' : ''} ${key(d) === today() ? 'is-today' : ''} ${byDate[key(d)] ? 'has-ev' : ''}`}
                  onClick={() => setSelected(key(d))}
                >
                  <span>{d}</span>
                  {byDate[key(d)]?.slice(0, 2).map((e) => (
                    <i key={e.id} className={e.googleMeet ? 'is-meet' : ''}>
                      {e.title}
                    </i>
                  ))}
                  {(byDate[key(d)]?.length ?? 0) > 2 && <em>+{byDate[key(d)].length - 2}</em>}
                </button>
              ),
            )}
          </div>
        </section>

        <section className="d-panel">
          <div className="d-panel-head">
            <h2>{fmtDate(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          </div>
          <ul className="ev-list">
            {dayEvents.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setOpen(e)}>
                  <span className="ev-time">{fmtTime(e.start)}</span>
                  <span>
                    <b>{e.title}</b>
                    <small>
                      {tEnum('mode', e.mode)}
                      {e.location ? ` · ${e.location}` : ''} · {t('events.invited', { count: e.invited })}
                    </small>
                  </span>
                  {e.googleMeet && <GoogleMeetLogo size={18} />}
                </button>
              </li>
            ))}
            {!dayEvents.length && (
              <li className="d-empty-sm">
                {t('events.nothing')}{' '}
                {edit && (
                  <button type="button" className="d-link" onClick={() => setForm({ date: selected })}>
                    {t('events.add')}
                  </button>
                )}
              </li>
            )}
          </ul>
          <div className="d-panel-head ev-up-head">
            <h2>{t('ov.comingUp')}</h2>
          </div>
          <ul className="ev-list">
            {upcoming.slice(0, 5).map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setOpen(e)}>
                  <span className="ev-date">{fmtDate(e.date, { month: 'short', day: 'numeric' })}</span>
                  <span>
                    <b>{e.title}</b>
                    <small>
                      {fmtTime(e.start)} · {audienceLabel(e.audience)}
                    </small>
                  </span>
                  {e.googleMeet && <GoogleMeetLogo size={18} />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <AnimatePresence>
        {form && <EventForm key="form" initial={form.ev} date={form.date} onClose={() => setForm(null)} />}
        {open && !form && <EventDetail key="detail" ev={open} onClose={() => setOpen(null)} onEdit={() => { setForm({ ev: open }); setOpen(null) }} />}
      </AnimatePresence>
    </div>
  )
}
