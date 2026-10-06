import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownUp,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Cake,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  HandHeart,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { downloadTemplate, exportMembers, parseMemberFile, type ParsedImport } from './io'
import { AskAI, fmtDate, money, tEnum } from './kit'
import { confirmAction, withConfirm } from './confirm'
import { LANGS, tr, useT, type Lang } from '../i18n'
import { Flag } from '../i18n/Flags'
import { BRANCHES } from './seed'
import { useMembers } from './store'
import { useWorkspace } from './workspace'
import {
  can,
  CHANNELS,
  GENDERS,
  initials,
  STAGES,
  STATUSES,
  type Channel,
  type Member,
  type MemberInput,
  type Stage,
} from './types'
import { PhoneInput } from '../components/PhoneInput'
import { countryFromText } from '../lib/countries'

const PAGE = 15

/** System note written when someone registers through a public link. */
const selfReg = (s: string) => {
  const [, type, lang] = s.split(':')
  return tr('members.selfRegistered', { form: tr(`links.type.${type}`), language: LANGS.find((l) => l.code === lang)?.native ?? lang })
}

const STAGE_TONE: Record<Stage, string> = { Newcomer: 'purple', Convert: 'lavender', Member: 'ink', Worker: 'lime' }

/* ───────────────────────── Shared bits ───────────────────────── */

export function Initials({ name, size = 34, tone }: { name: string; size?: number; tone?: string }) {
  const t = tone ?? ['p', 'l', 'k'][name.length % 3]
  return (
    <span className={`d-init d-init-${t}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {name.trim() ? initials(name) : <User size={size * 0.5} />}
    </span>
  )
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useT()
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <motion.div className="d-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div
        className={`d-modal ${wide ? 'is-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="d-modal-head">
          <h2>{title}</h2>
          <button type="button" className="d-circle" onClick={onClose} aria-label={t('common.close')}>
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

/* ───────────────────────── Add / edit form ───────────────────────── */

const EMPTY: MemberInput = {
  fullName: '',
  phone: '',
  whatsapp: '',
  email: '',
  gender: '',
  dob: '',
  address: '',
  branch: BRANCHES[0],
  department: '',
  membershipStatus: 'Active',
  dateJoined: new Date().toISOString().slice(0, 10),
  stage: 'Newcomer',
  notes: '',
  language: 'en',
}

function MemberForm({
  initial,
  branches,
  departments,
  onSave,
  onClose,
}: {
  initial?: Member
  branches: string[]
  departments: string[]
  onSave: (m: MemberInput) => void
  onClose: () => void
}) {
  const { t, commLang } = useT()
  const [f, setF] = useState<MemberInput>(() => {
    if (!initial) return { ...EMPTY, language: commLang }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, communications, giving, ...rest } = initial
    return rest
  })
  const [sameWa, setSameWa] = useState(() => !!initial && initial.whatsapp === initial.phone && !!initial.phone)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof MemberInput>(k: K, v: MemberInput[K]) => setF((x) => ({ ...x, [k]: v }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    if (!f.fullName.trim()) err.fullName = t('members.errName')
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) err.email = t('members.errEmail')
    if (f.phone && !/^[+\d][\d\s()-]{5,}$/.test(f.phone)) err.phone = t('members.errPhone')
    setErrors(err)
    if (Object.keys(err).length) return
    onSave({ ...f, fullName: f.fullName.trim(), whatsapp: sameWa ? f.phone : f.whatsapp })
  }

  const homeCountry = countryFromText(useWorkspace().settings.location)?.code
  const field = (k: keyof MemberInput, label: string, props: Record<string, unknown> = {}) => (
    <label className={`d-field ${errors[k] ? 'has-error' : ''}`}>
      <span>{label}</span>
      <input value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} {...props} />
      {errors[k] && <em>{errors[k]}</em>}
    </label>
  )
  const select = (k: keyof MemberInput, label: string, options: readonly string[], allowEmpty = false, group?: string) => (
    <label className="d-field">
      <span>{label}</span>
      <select value={f[k] as string} onChange={(e) => set(k, e.target.value as never)}>
        {allowEmpty && <option value="">—</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {group ? tEnum(group, o) : o}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <Modal title={initial ? t('members.editMember') : t('members.addMember')} onClose={onClose} wide>
      <form className="d-form" onSubmit={submit} noValidate>
        <fieldset>
          <legend>{t('members.personal')}</legend>
          <div className="d-grid">
            {field('fullName', t('members.fullNameReq'), { autoFocus: true, placeholder: t('members.fullNamePh') })}
            {select('gender', t('members.gender'), GENDERS, true, 'gender')}
            {field('dob', t('members.dob'), { type: 'date' })}
            {field('address', t('members.address'), { placeholder: t('members.addressPh') })}
          </div>
        </fieldset>
        <fieldset>
          <legend>{t('members.contact')}</legend>
          <div className="d-grid">
            <label className={`d-field ${errors.phone ? 'has-error' : ''}`}>
              <span>{t('members.phone')}</span>
              <span className="d-phone">
                <PhoneInput value={f.phone} onChange={(v) => set('phone', v)} defaultCountry={homeCountry} name="phone" />
              </span>
              {errors.phone && <em>{errors.phone}</em>}
            </label>
            <div className="d-field">
              <span>{t('members.whatsapp')}</span>
              {sameWa ? (
                <input type="tel" value={f.phone} disabled />
              ) : (
                <span className="d-phone">
                  <PhoneInput value={f.whatsapp} onChange={(v) => set('whatsapp', v)} defaultCountry={homeCountry} name="whatsapp" />
                </span>
              )}
              <label className="d-inline-check">
                <input type="checkbox" checked={sameWa} onChange={(e) => setSameWa(e.target.checked)} /> {t('members.sameAsPhone')}
              </label>
            </div>
            {field('email', t('members.email'), { type: 'email', placeholder: 'name@example.com' })}
            <label className="d-field">
              <span>{t('members.language')}</span>
              <select value={f.language} onChange={(e) => set('language', e.target.value as Lang)}>
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native}
                  </option>
                ))}
              </select>
              <small className="d-field-hint">{t('members.languageHint')}</small>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>{t('members.church')}</legend>
          <div className="d-grid">
            {select('stage', t('members.stageField'), STAGES, false, 'stage')}
            {select('membershipStatus', t('members.status'), STATUSES, false, 'status')}
            {select('branch', t('members.branch'), branches)}
            {select('department', t('members.department'), departments, true)}
            {field('dateJoined', t('members.dateJoined'), { type: 'date' })}
          </div>
        </fieldset>
        <label className="d-field">
          <span>{t('members.notes')}</span>
          <textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('members.notesPh')} />
        </label>
        <div className="d-form-actions">
          <button type="button" className="d-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="d-btn d-btn-ink">
            <Check size={15} /> {initial ? t('common.saveChanges') : t('members.addMember')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ───────────────────────── Import ───────────────────────── */

function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (rows: MemberInput[]) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedImport | null>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const { t } = useT()

  const take = async (f?: File) => {
    if (!f) return
    setFile(f)
    setBusy(true)
    try {
      setParsed(await parseMemberFile(f))
    } catch {
      setParsed({ rows: [], errors: [{ row: 0, message: t('members.importReadError') }], mapped: [], unmapped: [] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('members.importTitle')} onClose={onClose} wide>
      {!parsed ? (
        <>
          <div
            className={`d-drop ${drag ? 'is-drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              take(e.dataTransfer.files[0])
            }}
            onClick={() => input.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          >
            <input ref={input} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => take(e.target.files?.[0])} />
            <span className="d-drop-ico">
              <FileSpreadsheet size={26} />
            </span>
            <b>{busy ? t('members.reading') : t('members.drop')}</b>
            <small>{t('members.dropSub')}</small>
          </div>
          <div className="d-import-help">
            <p dangerouslySetInnerHTML={{ __html: t('members.importHelp') }} />
            <button type="button" className="d-btn" onClick={downloadTemplate}>
              <Download size={15} /> {t('members.downloadTemplate')}
            </button>
          </div>
        </>
      ) : (
        <div className="d-import-result">
          <div className="d-import-file">
            <FileSpreadsheet size={18} /> <b>{file?.name}</b>
            <button
              type="button"
              className="d-link"
              onClick={() => {
                setParsed(null)
                setFile(null)
              }}
            >
              {t('members.chooseAnother')}
            </button>
          </div>
          <div className="d-import-stats">
            <div className="d-stat-tile is-lime">
              <b>{parsed.rows.length}</b>
              <span>{t('members.readyToImport')}</span>
            </div>
            <div className={`d-stat-tile ${parsed.errors.length ? 'is-warn' : ''}`}>
              <b>{parsed.errors.length}</b>
              <span>{t('members.rowsSkipped')}</span>
            </div>
          </div>
          {parsed.mapped.length > 0 && (
            <p className="d-import-cols">
              <b>{t('members.matchedCols')}</b> {parsed.mapped.join(', ')}
              {parsed.unmapped.length > 0 && (
                <>
                  <br />
                  <b>{t('members.ignored')}</b> {parsed.unmapped.join(', ')}
                </>
              )}
            </p>
          )}
          {parsed.rows.length > 0 && (
            <div className="d-preview">
              <table>
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('members.phone')}</th>
                    <th>{t('members.email')}</th>
                    <th>{t('members.branch')}</th>
                    <th>{t('members.stage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      <td>{r.fullName}</td>
                      <td>{r.phone || '—'}</td>
                      <td>{r.email || '—'}</td>
                      <td>{r.branch || '—'}</td>
                      <td>{tEnum('stage', r.stage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 5 && <small>{t('common.moreCount', { count: parsed.rows.length - 5 })}</small>}
            </div>
          )}
          {parsed.errors.length > 0 && (
            <ul className="d-errors">
              {parsed.errors.slice(0, 6).map((e, i) => (
                <li key={i}>
                  {e.row ? t('members.rowN', { row: e.row }) : ''}
                  {e.message}
                </li>
              ))}
            </ul>
          )}
          <div className="d-form-actions">
            <button type="button" className="d-btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className="d-btn d-btn-ink" disabled={!parsed.rows.length} onClick={() => onImport(parsed.rows)}>
              <Upload size={15} /> {t('members.importN', { count: parsed.rows.length })}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ───────────────────────── Detail panel ───────────────────────── */

function InfoRow({ icon, label, value, action }: { icon: ReactNode; label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="d-info">
      <span className="d-info-ico">{icon}</span>
      <div>
        <small>{label}</small>
        <b>{value || '—'}</b>
      </div>
      {action}
    </div>
  )
}

function MemberDetail({ member, onClose, onEdit }: { member: Member; onClose: () => void; onEdit: () => void }) {
  const { role, logCommunication, updateMember } = useMembers()
  const { t } = useT()
  const [channel, setChannel] = useState<Channel>('Call')
  const [summary, setSummary] = useState('')
  const total = member.giving.reduce((s, g) => s + g.amount, 0)
  const wa = member.whatsapp.replace(/[^\d]/g, '')

  return (
    <motion.aside
      className="d-detail"
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      aria-label={t('members.details', { name: member.fullName })}
    >
      <div className="d-detail-top">
        <button type="button" className="d-circle" onClick={onClose} aria-label={t('members.closeDetails')}>
          <X size={16} />
        </button>
        {can.editMembers(role) && (
          <button type="button" className="d-circle" onClick={onEdit} aria-label={t('members.editMember')}>
            <Pencil size={15} />
          </button>
        )}
      </div>
      <div className="d-profile">
        <Initials name={member.fullName} size={84} tone="p" />
        <h2>{member.fullName}</h2>
        <div className="d-chips">
          <span className={`d-chip t-${STAGE_TONE[member.stage]}`}>{tEnum('stage', member.stage)}</span>
          <span className={`d-chip ${member.membershipStatus === 'Active' ? 't-ok' : 't-mute'}`}>{tEnum('status', member.membershipStatus)}</span>
        </div>
        <div className="d-actions">
          {member.phone && (
            <a className="d-circle" href={`tel:${member.phone.replace(/\s/g, '')}`} aria-label={t('members.call')}>
              <Phone size={15} />
            </a>
          )}
          {wa && (
            <a className="d-circle" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label="WhatsApp">
              <MessageCircle size={15} />
            </a>
          )}
          {member.email && (
            <a className="d-circle" href={`mailto:${member.email}`} aria-label={t('members.email')}>
              <Mail size={15} />
            </a>
          )}
        </div>
      </div>

      {can.editMembers(role) && (
        <div className="d-stage-switch" role="group" aria-label={t('members.changeStage')}>
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              className={member.stage === s ? 'is-on' : ''}
              onClick={withConfirm({ title: t('cf.stageTitle', { count: 1, stage: tEnum('stage', s) }) }, () => updateMember(member.id, { stage: s }))}
            >
              {tEnum('stage', s)}
            </button>
          ))}
        </div>
      )}

      <section className="d-card">
        <h3>{t('members.detailed')}</h3>
        <InfoRow icon={<Phone size={15} />} label={t('members.phone')} value={member.phone} />
        <InfoRow icon={<MessageCircle size={15} />} label={t('members.whatsappShort')} value={member.whatsapp} />
        <InfoRow icon={<Mail size={15} />} label={t('members.email')} value={member.email} />
        <InfoRow icon={<User size={15} />} label={t('members.gender')} value={tEnum('gender', member.gender)} />
        <InfoRow icon={<Cake size={15} />} label={t('members.dob')} value={fmtDate(member.dob)} />
        <InfoRow icon={<MapPin size={15} />} label={t('members.address')} value={member.address} />
        <InfoRow icon={<Building2 size={15} />} label={t('members.branch')} value={member.branch} />
        <InfoRow icon={<Users size={15} />} label={t('members.department')} value={member.department} />
        <InfoRow icon={<Flag lang={member.language} size={15} />} label={t('members.language')} value={LANGS.find((l) => l.code === member.language)?.native} />
        <InfoRow icon={<CalendarDays size={15} />} label={t('members.dateJoined')} value={fmtDate(member.dateJoined)} />
      </section>

      <section className="d-card">
        <h3>
          <StickyNote size={15} /> {t('members.notes')}
        </h3>
        <p className="d-notes">{member.notes || t('members.noNotes')}</p>
      </section>

      <section className="d-card">
        <h3>{t('members.commHistory')}</h3>
        {can.editMembers(role) && (
          <form
            className="d-log"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!summary.trim()) return
              if (!(await confirmAction({ title: t('cf.noteTitle', { name: member.fullName }), confirmLabel: t('cf.save') }))) return
              logCommunication(member.id, {
                channel,
                summary: summary.trim(),
                date: new Date().toISOString().slice(0, 10),
                by: t('members.you'),
              })
              setSummary('')
            }}
          >
            <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} aria-label={t('members.channel')}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {tEnum('channel', c)}
                </option>
              ))}
            </select>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={t('members.logPh')} />
            <button type="submit" className="d-circle d-circle-ink" aria-label={t('common.add')}>
              <Plus size={15} />
            </button>
          </form>
        )}
        {member.communications.length ? (
          <ul className="d-timeline">
            {member.communications.map((c) => (
              <li key={c.id}>
                <span className="d-tl-ch">{tEnum('channel', c.channel)}</span>
                <div>
                  <b>{c.summary.startsWith('__selfreg:') ? selfReg(c.summary) : c.summary}</b>
                  <small>
                    {fmtDate(c.date)} · {c.by}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="d-empty-sm">{t('members.noComms')}</p>
        )}
      </section>

      <section className="d-card">
        <h3>
          <HandHeart size={15} /> {t('members.givingHistory')}
        </h3>
        {can.viewGiving(role) ? (
          member.giving.length ? (
            <>
              <div className="d-give-total">
                <span>{t('members.totalRecorded')}</span>
                <b>{money(total)}</b>
              </div>
              <ul className="d-gifts">
                {member.giving.map((g) => (
                  <li key={g.id}>
                    <span>{fmtDate(g.date)}</span>
                    <span>{g.fund}</span>
                    <span className="d-muted">{tEnum('method', g.method)}</span>
                    <b>{money(g.amount)}</b>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="d-empty-sm">{t('members.noGifts')}</p>
          )
        ) : (
          <p className="d-locked">
            <Lock size={14} /> {t('members.givingLocked')}
          </p>
        )}
      </section>
    </motion.aside>
  )
}

/* ───────────────────────── Page ───────────────────────── */

export default function Members({ initialOpenId, preview = false }: { initialOpenId?: string; preview?: boolean } = {}) {
  const { members, role, addMember, updateMember, removeMembers, importMembers } = useMembers()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<Stage | ''>('')
  const [branch, setBranch] = useState('')
  const [dept, setDept] = useState('')
  const [status, setStatus] = useState('')
  const [gender, setGender] = useState('')
  const [sort, setSort] = useState<{ key: 'fullName' | 'dateJoined'; dir: 1 | -1 }>({ key: 'dateJoined', dir: -1 })
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null)
  const [editing, setEditing] = useState<Member | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [toast, setToast] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [language, setLanguage] = useState('')
  const { t } = useT()

  // Preview mode: the landing-page walkthrough drives which member is open.
  useEffect(() => {
    if (preview) setOpenId(initialOpenId ?? null)
  }, [preview, initialOpenId])

  // Deep links from the quick-action rail.
  useEffect(() => {
    if (preview) return
    if (params.get('new') === '1' && can.editMembers(role)) setEditing('new')
    if (params.get('import') === '1' && can.importExport(role)) setImporting(true)
    if (params.get('focus') === 'search') searchRef.current?.focus()
    if (params.get('id')) setOpenId(params.get('id'))
    const st = params.get('stage')
    if (st && (STAGES as readonly string[]).includes(st)) setStage(st as Stage)
    if ([...params.keys()].length) setParams({}, { replace: true })
  }, [params, role, setParams, preview])

  useEffect(() => {
    if (!toast) return
    const tm = setTimeout(() => setToast(''), 3200)
    return () => clearTimeout(tm)
  }, [toast])

  const { settings } = useWorkspace()
  const branches = useMemo(() => [...new Set([...settings.branches, ...members.map((m) => m.branch).filter(Boolean)])], [members, settings.branches])
  const departments = useMemo(() => [...new Set([...settings.departments, ...members.map((m) => m.department).filter(Boolean)])], [members, settings.departments])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')
    return members
      .filter((m) => {
        if (stage && m.stage !== stage) return false
        if (branch && m.branch !== branch) return false
        if (dept && m.department !== dept) return false
        if (status && m.membershipStatus !== status) return false
        if (gender && m.gender !== gender) return false
        if (language && m.language !== language) return false
        if (!term) return true
        return (
          m.fullName.toLowerCase().includes(term) ||
          m.email.toLowerCase().includes(term) ||
          (digits.length > 2 && (m.phone.replace(/\D/g, '').includes(digits) || m.whatsapp.replace(/\D/g, '').includes(digits)))
        )
      })
      .sort((a, b) => a[sort.key].localeCompare(b[sort.key]) * sort.dir)
  }, [members, q, stage, branch, dept, status, gender, language, sort])

  useEffect(() => setPage(0), [q, stage, branch, dept, status, gender, language])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE)
  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s, members.filter((m) => m.stage === s).length])), [members])
  const thisMonth = new Date().toISOString().slice(0, 7)
  const newThisMonth = members.filter((m) => m.dateJoined.startsWith(thisMonth)).length
  const active = members.filter((m) => m.membershipStatus === 'Active').length
  const open = members.find((m) => m.id === openId) ?? null
  const filtersOn = [stage, branch, dept, status, gender, language].filter(Boolean).length
  const allOnPage = view.length > 0 && view.every((m) => selected.has(m.id))

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const doExport = async (format: 'csv' | 'xlsx', onlySelected: boolean) => {
    setExportOpen(false)
    const list = onlySelected ? members.filter((m) => selected.has(m.id)) : filtered
    await exportMembers(list, format, can.viewGiving(role))
    setToast(t('members.toastExported', { count: list.length }))
  }

  const sortBy = (key: 'fullName' | 'dateJoined') =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'fullName' ? 1 : -1 }))

  return (
    <div className={`d-page d-members ${open ? 'has-detail' : ''}`}>
      <div className="d-head">
        <h1>{t('members.title')}</h1>
        <div className="d-kpis">
          <div className="d-kpi">
            <span className="d-kpi-ico">
              <Users size={17} />
            </span>
            <div>
              <b>{members.length.toLocaleString()}</b>
              <small>{t('members.totalPeople')}</small>
            </div>
            <span className="d-pill d-pill-lime">{t('members.newThisMonth', { count: newThisMonth })}</span>
          </div>
          <div className="d-kpi">
            <span className="d-kpi-ico">
              <Check size={17} />
            </span>
            <div>
              <b>{members.length ? Math.round((active / members.length) * 100) : 0}%</b>
              <small>{t('members.activeMembers')}</small>
            </div>
          </div>
        </div>
      </div>

      {/* Stage cards (reference: colourful deal cards) */}
      <div className="d-stages">
        {STAGES.map((s) => (
          <button
            key={s}
            type="button"
            className={`d-stage t-${STAGE_TONE[s]} ${stage === s ? 'is-on' : ''}`}
            onClick={() => setStage((x) => (x === s ? '' : s))}
            aria-pressed={stage === s}
          >
            <span className="d-stage-top">
              <small>{t(`enums.stageHint.${s}`)}</small>
              <span className="d-circle d-circle-sm">{stage === s ? <X size={13} /> : <ArrowUpRight size={13} />}</span>
            </span>
            <span className="d-stage-name">{t(`enums.stagePlural.${s}`)}</span>
            <span className="d-stage-bottom">
              <b>{counts[s]}</b>
              <span className="d-stack">
                {members
                  .filter((m) => m.stage === s)
                  .slice(0, 3)
                  .map((m) => (
                    <Initials key={m.id} name={m.fullName} size={26} tone="w" />
                  ))}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="d-panel">
        <div className="d-toolbar">
          <label className="d-search">
            <Search size={16} />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('members.searchPh')}
              aria-label={t('members.searchLabel')}
            />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label={t('members.clearSearch')}>
                <X size={14} />
              </button>
            )}
          </label>
          <div className="d-filters">
            <span className="d-filter-label">
              <Filter size={14} /> {t('members.filters')}{filtersOn ? ` (${filtersOn})` : ''}
            </span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label={t('members.branch')}>
              <option value="">{t('members.allBranches')}</option>
              {branches.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
            <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label={t('members.department')}>
              <option value="">{t('members.allDepts')}</option>
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select value={stage} onChange={(e) => setStage(e.target.value as Stage | '')} aria-label={t('members.stage')}>
              <option value="">{t('members.allStages')}</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {tEnum('stage', s)}
                </option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('members.status')}>
              <option value="">{t('members.anyStatus')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tEnum('status', s)}
                </option>
              ))}
            </select>
            <select value={gender} onChange={(e) => setGender(e.target.value)} aria-label={t('members.gender')}>
              <option value="">{t('members.anyGender')}</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {tEnum('gender', g)}
                </option>
              ))}
            </select>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label={t('members.language')}>
              <option value="">{t('members.anyLanguage')}</option>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native}
                </option>
              ))}
            </select>
            {filtersOn > 0 && (
              <button
                type="button"
                className="d-link"
                onClick={() => {
                  setStage('')
                  setBranch('')
                  setDept('')
                  setStatus('')
                  setGender('')
                  setLanguage('')
                }}
              >
                {t('common.clear')}
              </button>
            )}
          </div>
          <div className="d-tool-actions">
            {!preview && <AskAI label={t('members.askAi')} k="followUp" />}
            {can.importExport(role) && (
              <>
                <button type="button" className="d-btn" onClick={() => setImporting(true)}>
                  <Upload size={15} /> {t('common.import')}
                </button>
                <div className="d-menu-wrap">
                  <button type="button" className="d-btn" onClick={() => setExportOpen((o) => !o)} aria-expanded={exportOpen}>
                    <Download size={15} /> {t('common.export')}
                  </button>
                  {exportOpen && (
                    <div className="d-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => doExport('csv', false)}>
                        {t('members.csvShown', { count: filtered.length })}
                      </button>
                      <button type="button" role="menuitem" onClick={() => doExport('xlsx', false)}>
                        {t('members.excelShown', { count: filtered.length })}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
            {can.editMembers(role) && (
              <button type="button" className="d-btn d-btn-ink" onClick={() => setEditing('new')}>
                <Plus size={15} /> {t('members.addMember')}
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div className="d-bulk" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <b>{t('members.selected', { count: selected.size })}</b>
              {can.editMembers(role) && (
                <select
                  value=""
                  aria-label={t('members.setStageFor')}
                  onChange={async (e) => {
                    const s = e.target.value as Stage
                    if (!s || !(await confirmAction({ title: t('cf.stageTitle', { count: selected.size, stage: tEnum('stage', s) }) }))) return
                    selected.forEach((id) => updateMember(id, { stage: s }))
                    setToast(t('members.toastMoved', { count: selected.size, stage: tEnum('stage', s) }))
                  }}
                >
                  <option value="">{t('members.setStage')}</option>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {tEnum('stage', s)}
                    </option>
                  ))}
                </select>
              )}
              {can.importExport(role) && (
                <>
                  <button type="button" className="d-link" onClick={() => doExport('csv', true)}>
                    {t('common.exportCsv')}
                  </button>
                  <button type="button" className="d-link" onClick={() => doExport('xlsx', true)}>
                    {t('common.exportExcel')}
                  </button>
                </>
              )}
              {can.deleteMembers(role) && (
                <button
                  type="button"
                  className="d-link d-danger"
                  onClick={withConfirm({ title: t('members.confirmDelete', { count: selected.size }), body: t('cf.cantUndo'), danger: true, confirmLabel: t('cf.delete') }, () => {
                    removeMembers([...selected])
                    setToast(t('members.toastDeleted', { count: selected.size }))
                    setSelected(new Set())
                  })}
                >
                  <Trash2 size={14} /> {t('common.delete')}
                </button>
              )}
              <button type="button" className="d-link" onClick={() => setSelected(new Set())}>
                {t('common.clearSelection')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="d-table-wrap">
          <table className="d-table">
            <thead>
              <tr>
                <th className="d-col-check">
                  <input
                    type="checkbox"
                    aria-label={t('members.selectAll')}
                    checked={allOnPage}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s)
                        view.forEach((m) => (allOnPage ? n.delete(m.id) : n.add(m.id)))
                        return n
                      })
                    }
                  />
                </th>
                <th>
                  <button type="button" className="d-sort" onClick={() => sortBy('fullName')}>
                    {t('common.name')} <ArrowDownUp size={12} />
                  </button>
                </th>
                <th className="d-hide-sm">{t('members.phone')}</th>
                <th className="d-hide-md">{t('members.branch')}</th>
                <th className="d-hide-md">{t('members.department')}</th>
                <th>{t('members.stage')}</th>
                <th className="d-hide-sm">{t('members.statusShort')}</th>
                <th className="d-hide-md">
                  <button type="button" className="d-sort" onClick={() => sortBy('dateJoined')}>
                    {t('members.joined')} <ArrowDownUp size={12} />
                  </button>
                </th>
                <th aria-label={t('common.open')} />
              </tr>
            </thead>
            <tbody>
              {view.map((m) => (
                <tr key={m.id} className={openId === m.id ? 'is-open' : ''} onClick={() => setOpenId(m.id)}>
                  <td className="d-col-check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={t('members.select', { name: m.fullName })} checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                  </td>
                  <td>
                    <span className="d-name">
                      <Initials name={m.fullName} />
                      <span>
                        <b>
                          {m.fullName} {m.language !== 'en' && <Flag lang={m.language} size={13} />}
                        </b>
                        <small>{m.email || t('common.noEmail')}</small>
                      </span>
                    </span>
                  </td>
                  <td className="d-hide-sm">{m.phone || '—'}</td>
                  <td className="d-hide-md">{m.branch || '—'}</td>
                  <td className="d-hide-md">{m.department || '—'}</td>
                  <td>
                    <span className={`d-chip t-${STAGE_TONE[m.stage]}`}>{tEnum('stage', m.stage)}</span>
                  </td>
                  <td className="d-hide-sm">
                    <span className={`d-dot-status ${m.membershipStatus === 'Active' ? 'ok' : ''}`}>{tEnum('status', m.membershipStatus)}</span>
                  </td>
                  <td className="d-hide-md">{fmtDate(m.dateJoined)}</td>
                  <td>
                    <span className="d-circle d-circle-sm" aria-hidden="true">
                      <MoreHorizontal size={14} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!view.length && (
            <div className="d-empty">
              <Users size={28} />
              <b>{t('members.noMatch')}</b>
              <span>{t('members.noMatchSub')}</span>
            </div>
          )}
        </div>

        <div className="d-pager">
          <span>
            {t('common.ofTotal', { from: filtered.length ? page * PAGE + 1 : 0, to: Math.min(filtered.length, (page + 1) * PAGE), total: filtered.length })}
          </span>
          <div>
            <button type="button" className="d-circle" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label={t('members.prevPage')}>
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="d-circle"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
              aria-label={t('members.nextPage')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <MemberDetail
            key={open.id}
            member={open}
            onClose={() => setOpenId(null)}
            onEdit={() => setEditing(open)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <MemberForm
            initial={editing === 'new' ? undefined : editing}
            branches={branches}
            departments={departments}
            onClose={() => setEditing(null)}
            onSave={async (m) => {
              if (!(await confirmAction({ title: editing === 'new' ? t('cf.memberAddTitle', { name: m.fullName }) : t('cf.memberSaveTitle', { name: m.fullName }), confirmLabel: t('cf.save') }))) return
              if (editing === 'new') {
                const created = addMember(m)
                setOpenId(created.id)
                setToast(t('members.toastAdded', { name: m.fullName }))
              } else {
                updateMember(editing.id, m)
                setToast(t('members.toastSaved'))
              }
              setEditing(null)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {importing && (
          <ImportDialog
            onClose={() => setImporting(false)}
            onImport={async (rows) => {
              if (!(await confirmAction({ title: t('cf.importTitle', { count: rows.length }), body: t('cf.importBody'), confirmLabel: t('common.import') }))) return
              const n = importMembers(rows)
              setImporting(false)
              setToast(t('members.toastImported', { count: n }))
            }}
          />
        )}
      </AnimatePresence>

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
