import { AnimatePresence } from 'framer-motion'
import { Check, Copy, Download, ExternalLink, HandHeart, Landmark, Link2, Plus, QrCode, Sparkles, Trash2, UserPlus, Users, X } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { fmtDate, Kpi, Modal, money, PageHead, Tabs } from './kit'
import { useMembers } from './store'
import { can } from './types'
import { useWorkspace, type LinkType, type ShareLink } from './workspace'
import { LANGS, useT } from '../i18n'
import { Flag } from '../i18n/Flags'
import { publicOrigin } from '../lib/site'

const TYPE_ICON: Record<LinkType, typeof Users> = { member: Users, newcomer: UserPlus, convert: Sparkles, giving: HandHeart }
const TYPE_TONE: Record<LinkType, string> = { member: 'ink', newcomer: 'purple', convert: 'lavender', giving: 'lime' }

/** Public URL for a link. Everything the page needs is in the query string, so it works without login. */
export function linkUrl(slug: string, l: Pick<ShareLink, 'type' | 'branch' | 'fund' | 'id'>) {
  const origin = publicOrigin()
  const q = new URLSearchParams()
  if (l.type === 'giving') {
    if (l.fund) q.set('fund', l.fund)
  } else {
    q.set('type', l.type)
    if (l.branch) q.set('branch', l.branch)
  }
  q.set('l', l.id)
  return `${origin}/${l.type === 'giving' ? 'give' : 'join'}/${slug}?${q.toString()}`
}

function save(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}

function LinkCard({ link, slug, onRemove }: { link: ShareLink; slug: string; onRemove?: () => void }) {
  const { t } = useT()
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const url = linkUrl(slug, link)
  const Icon = TYPE_ICON[link.type]
  const title = link.label || t(`links.type.${link.type}`)
  const file = `${slug}-${link.label ? link.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') : link.type}-qr`

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 720, errorCorrectionLevel: 'M', color: { dark: '#17112e', light: '#ffffff' } }).then(setQr).catch(() => {})
  }, [url])

  const svg = async () => {
    const s = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#17112e', light: '#ffffff' } })
    const href = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }))
    save(href, `${file}.svg`)
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  return (
    <article className="lk-card">
      <header>
        <span className={`lk-ico t-${TYPE_TONE[link.type]}`}>
          <Icon size={18} />
        </span>
        <div>
          <b>{title}</b>
          <small>{t(`links.desc.${link.type}`)}</small>
        </div>
        {onRemove && (
          <button type="button" className="d-circle d-circle-sm" aria-label={t('common.delete')} onClick={onRemove}>
            <Trash2 size={13} />
          </button>
        )}
      </header>
      <div className="lk-qr">{qr ? <img src={qr} alt={t('links.qrAlt', { name: title })} /> : <QrCode size={40} />}</div>
      <div className="lk-meta">
        {link.branch && <span className="d-chip t-mute">{link.branch}</span>}
        {link.fund && <span className="d-chip t-mute">{link.fund}</span>}
      </div>
      <div className="g-link lk-url">
        <span title={url}>{url.replace(/^https?:\/\//, '')}</span>
        <button
          type="button"
          className="d-circle d-circle-sm"
          aria-label={t('common.copyLink')}
          onClick={() => {
            // Only confirm once the copy succeeded (it can be blocked by the browser).
            void navigator.clipboard?.writeText(url).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }, () => {})
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <div className="lk-actions">
        <button type="button" className="d-btn d-btn-ink" disabled={!qr} onClick={() => save(qr, `${file}.png`)}>
          <Download size={15} /> {t('links.qrPng')}
        </button>
        <button type="button" className="d-btn" onClick={svg}>
          <Download size={15} /> SVG
        </button>
        <a className="d-btn" href={url} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> {t('common.open')}
        </a>
      </div>
    </article>
  )
}

function NewLink({ onClose, onCreate, allowGiving }: { onClose: () => void; onCreate: (l: Omit<ShareLink, 'id' | 'createdAt'>) => void; allowGiving: boolean }) {
  const { t } = useT()
  const { settings } = useWorkspace()
  const types: LinkType[] = allowGiving ? ['member', 'newcomer', 'convert', 'giving'] : ['member', 'newcomer', 'convert']
  const [type, setType] = useState<LinkType>('newcomer')
  const [label, setLabel] = useState('')
  const [branch, setBranch] = useState('')
  const [fund, setFund] = useState(settings.funds[0] ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onCreate({ type, label: label.trim(), branch: type === 'giving' ? '' : branch, fund: type === 'giving' ? fund : '' })
  }
  return (
    <Modal title={t('links.newTitle')} onClose={onClose}>
      <form className="d-form" onSubmit={submit}>
        <div className="lk-types" role="radiogroup" aria-label={t('links.linkFor')}>
          {types.map((ty) => {
            const Icon = TYPE_ICON[ty]
            return (
              <button key={ty} type="button" role="radio" aria-checked={type === ty} className={`lk-type ${type === ty ? 'is-on' : ''}`} onClick={() => setType(ty)}>
                <Icon size={18} />
                <b>{t(`links.type.${ty}`)}</b>
                <small>{t(`links.desc.${ty}`)}</small>
              </button>
            )
          })}
        </div>
        <label className="d-field">
          <span>
            {t('links.label')} <i className="d-muted">({t('common.optional')})</i>
          </span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t(type === 'giving' ? 'links.labelPhGiving' : 'links.labelPh')} />
        </label>
        {type === 'giving' ? (
          <label className="d-field">
            <span>{t('links.fund')}</span>
            <select value={fund} onChange={(e) => setFund(e.target.value)}>
              <option value="">{t('links.anyFund')}</option>
              {settings.funds.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="d-field">
            <span>{t('links.branch')}</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">{t('links.anyBranch')}</option>
              {settings.branches.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
        )}
        <p className="d-hint-box">{t('links.langNote')}</p>
        <div className="d-form-actions">
          <button type="button" className="d-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="d-btn d-btn-ink">
            <QrCode size={15} /> {t('links.generate')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function BankDetails() {
  const { t } = useT()
  const { settings, updateSettings } = useWorkspace()
  const [p, setP] = useState(settings.payout)
  const [saved, setSaved] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    updateSettings({ payout: { ...p, method: p.method === 'none' ? 'bank' : p.method } })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  const field = (k: 'bankName' | 'accountName' | 'accountNumber' | 'routing', ph = '') => (
    <label className="d-field">
      <span>{t(`links.bank.${k}`)}</span>
      <input value={p[k]} placeholder={ph} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
    </label>
  )
  return (
    <div className="lk-bank">
      <form className="d-panel d-form" onSubmit={submit}>
        <div className="d-panel-head">
          <h2>
            <Landmark size={17} /> {t('links.bank.title')}
          </h2>
        </div>
        <p className="d-muted">{t('links.bank.sub')}</p>
        <div className="d-grid">
          {field('bankName', 'e.g. First Bank')}
          {field('accountName', settings.churchName)}
          {field('accountNumber')}
          {field('routing', t('links.bank.routingPh'))}
        </div>
        <label className="d-field">
          <span>{t('links.bank.instructions')}</span>
          <textarea rows={3} value={p.instructions} placeholder={t('links.bank.instructionsPh')} onChange={(e) => setP({ ...p, instructions: e.target.value })} />
        </label>
        <div className="d-form-actions">
          <button type="submit" className="d-btn d-btn-ink">
            <Check size={15} /> {saved ? t('common.saved') : t('common.saveChanges')}
          </button>
        </div>
      </form>
      <div className="d-panel lk-bank-preview">
        <small>{t('links.bank.preview')}</small>
        <div className="pub-bank">
          <span>{p.bankName || '—'}</span>
          <b>{p.accountNumber || '—'}</b>
          <span>{p.accountName || settings.churchName}</span>
          {p.routing && <span className="d-muted">{p.routing}</span>}
        </div>
        {p.instructions && <p className="d-muted">{p.instructions}</p>}
      </div>
    </div>
  )
}

function Transfers() {
  const { t } = useT()
  const { claims, setClaimStatus, addAnonGift, settings, live } = useWorkspace()
  const { members, addGift, reload } = useMembers()
  const [busy, setBusy] = useState('')
  const confirm = async (id: string) => {
    if (live) {
      // The server records the gift and emails the receipt.
      setBusy(id)
      try {
        await setClaimStatus(id, 'Confirmed')
        await reload()
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy('')
      }
      return
    }
    const c = claims.find((x) => x.id === id)
    if (!c) return
    const m = c.email ? members.find((x) => x.email.toLowerCase() === c.email.toLowerCase()) : undefined
    if (m) addGift(m.id, { amount: c.amount, fund: c.fund, method: 'Transfer', date: c.date })
    else addAnonGift({ amount: c.amount, fund: c.fund, method: 'Transfer', date: c.date, donor: c.name || t('links.claims.anonymous') })
    setClaimStatus(id, 'Confirmed')
  }
  if (!claims.length)
    return (
      <div className="d-panel d-empty">
        <Landmark size={28} />
        <b>{t('links.claims.empty')}</b>
        <span>{t('links.claims.emptySub')}</span>
      </div>
    )
  return (
    <div className="d-panel">
      <p className="d-muted lk-claims-sub">{t('links.claims.sub')}</p>
      <div className="d-table-wrap">
        <table className="d-table">
          <thead>
            <tr>
              <th>{t('common.date')}</th>
              <th>{t('common.name')}</th>
              <th>{t('links.fund')}</th>
              <th className="d-hide-sm">{t('links.claims.reference')}</th>
              <th>{t('common.amount')}</th>
              <th>{t('common.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id}>
                <td>{fmtDate(c.date)}</td>
                <td>
                  <span className="d-name">
                    <span>
                      <b>
                        {c.name} <Flag lang={c.language} size={13} />
                      </b>
                      <small>{c.email || c.phone || '—'}</small>
                    </span>
                  </span>
                </td>
                <td>{c.fund}</td>
                <td className="d-hide-sm">{c.reference || '—'}</td>
                <td>
                  <b>{money(c.amount, settings.currency)}</b>
                </td>
                <td>
                  <span className={`d-chip ${c.status === 'Confirmed' ? 't-ok' : c.status === 'Declined' ? 't-mute' : 't-purple'}`}>{t(`links.claims.status.${c.status}`)}</span>
                </td>
                <td>
                  {c.status === 'Pending' && (
                    <span className="lk-claim-actions">
                      <button type="button" className="d-btn d-btn-ink lk-sm" disabled={busy === c.id} onClick={() => confirm(c.id)}>
                        <Check size={14} /> {t('links.claims.confirm')}
                      </button>
                      <button type="button" className="d-circle d-circle-sm" aria-label={t('links.claims.decline')} title={t('links.claims.decline')} onClick={() => setClaimStatus(c.id, 'Declined')}>
                        <X size={13} />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Links() {
  const { t } = useT()
  const { role, members } = useMembers()
  const { settings, links, addLink, removeLink, claims } = useWorkspace()
  const finance = can.viewGiving(role)
  const [tab, setTab] = useState<'links' | 'transfers' | 'bank'>('links')
  const [creating, setCreating] = useState(false)
  const visible = links.filter((l) => finance || l.type !== 'giving')
  const pending = claims.filter((c) => c.status === 'Pending').length
  const viaLinks = useMemo(() => members.filter((m) => m.communications.some((c) => c.summary.startsWith('__selfreg:'))).length, [members])
  const defaults = new Set(['l1', 'l2', 'l3', 'l4'])

  return (
    <div className="d-page">
      <PageHead title={t('links.title')}>
        <Kpi icon={<Link2 size={17} />} value={visible.length} label={t('links.kpiLinks')} />
        <Kpi icon={<UserPlus size={17} />} value={viaLinks} label={t('links.kpiRegistered')} />
        {finance && <Kpi icon={<Landmark size={17} />} value={pending} label={t('links.kpiPending')} pill={pending ? t('links.review') : undefined} tone="lime" />}
      </PageHead>

      <div className="lk-bar">
        {finance ? (
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'links', label: t('links.tabLinks') },
              { id: 'transfers', label: `${t('links.tabTransfers')}${pending ? ` (${pending})` : ''}` },
              { id: 'bank', label: t('links.tabBank') },
            ]}
          />
        ) : (
          <span />
        )}
        {tab === 'links' && (
          <button type="button" className="d-btn d-btn-ink" onClick={() => setCreating(true)}>
            <Plus size={15} /> {t('links.new')}
          </button>
        )}
      </div>

      {tab === 'links' && (
        <>
          <p className="lk-intro">
            {t('links.intro')}{' '}
            <span className="lk-langs">
              {LANGS.map((l) => (
                <Flag key={l.code} lang={l.code} size={16} />
              ))}
            </span>
          </p>
          <div className="lk-grid">
            {visible.map((l) => (
              <LinkCard key={l.id} link={l} slug={settings.givingSlug} onRemove={defaults.has(l.id) ? undefined : () => removeLink(l.id)} />
            ))}
          </div>
          {finance && !settings.payout.accountNumber && (
            <p className="d-hint-box">
              {t('links.noBank')}{' '}
              <button type="button" className="d-link" onClick={() => setTab('bank')}>
                {t('links.addBank')}
              </button>
            </p>
          )}
        </>
      )}
      {tab === 'transfers' && finance && <Transfers />}
      {tab === 'bank' && finance && <BankDetails />}

      <AnimatePresence>
        {creating && (
          <NewLink
            allowGiving={finance}
            onClose={() => setCreating(false)}
            onCreate={(l) => {
              addLink(l)
              setCreating(false)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
