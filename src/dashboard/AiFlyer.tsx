import { Download, ImagePlus, Loader2, Save, Sparkles, Wand2 } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAi } from '../ai/store'
import { LANGS, useT, type Lang } from '../i18n'
import { api } from '../lib/api'
import { FLYER_SIZE, flyerLimit, type FlyerFormat } from '../lib/plans'
import { useWorkspace } from './workspace'
import { publicOrigin } from '../lib/site'

const STYLES = ['modern', 'elegant', 'bold', 'minimal', 'youthful', 'warm'] as const

/** Draws the SVG (and optional QR code) onto a canvas → PNG data URL. */
async function toPng(svg: string, w: number, h: number, qrLink: string | null): Promise<string> {
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  if (qrLink) {
    const qr = new Image()
    qr.src = await QRCode.toDataURL(qrLink, { margin: 1, width: 440, color: { dark: '#17112e', light: '#ffffff' } })
    await qr.decode()
    const s = 200
    const x = w - s - 72
    const y = h - s - 72
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.roundRect(x - 12, y - 12, s + 24, s + 24, 22)
    ctx.fill()
    ctx.drawImage(qr, x, y, s, s)
  }
  return c.toDataURL('image/png')
}

export function AiFlyer() {
  const { t, lang } = useT()
  const { settings, live, addDesign } = useWorkspace()
  const ai = useAi()
  const [brief, setBrief] = useState('')
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [place, setPlace] = useState('')
  const [church, setChurch] = useState(settings.churchName)
  const [style, setStyle] = useState<(typeof STYLES)[number]>('modern')
  const [format, setFormat] = useState<FlyerFormat>('portrait')
  const [language, setLanguage] = useState<Lang>(lang)
  const [withQr, setWithQr] = useState(false)
  const [qrLink, setQrLink] = useState(`${publicOrigin()}/give/${settings.givingSlug}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ svg: string; png: string; w: number; h: number } | null>(null)
  const [saved, setSaved] = useState(false)
  const [usage, setUsage] = useState<{ used: number; limit: number | null }>(() => ({ used: ai.usedThisMonth('designs'), limit: flyerLimit(settings.plan) }))

  // Live: the server owns the count (it enforces the limit).
  useEffect(() => {
    if (!live) {
      setUsage({ used: ai.usedThisMonth('designs'), limit: flyerLimit(settings.plan) })
      return
    }
    api<{ used: number; limit: number | null }>('/design/usage')
      .then(setUsage)
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, settings.plan])

  const left = usage.limit === null ? null : Math.max(0, usage.limit - usage.used)
  const blocked = left === 0

  const generate = async () => {
    setError('')
    setSaved(false)
    if (!brief.trim() && !title.trim()) return setError(t('design.gen.errBrief'))
    if (blocked) return
    setBusy(true)
    try {
      const r = await api<{ svg: string; width: number; height: number; used: number | null; limit: number | null }>('/design/generate', {
        prompt: brief,
        title,
        when,
        place,
        church,
        style: t(`design.gen.styles.${style}`),
        format,
        language,
        qr: withQr,
      })
      const png = await toPng(r.svg, r.width, r.height, withQr ? qrLink : null)
      setResult({ svg: r.svg, png, w: r.width, h: r.height })
      if (r.used !== null) setUsage({ used: r.used, limit: r.limit })
      else {
        ai.record({ feature: 'designs', units: 1, provider: 'claude', model: 'flyer', estCostUsd: 0, user: '' })
        setUsage((u) => ({ ...u, used: u.used + 1 }))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.startsWith('LIMIT:')) {
        const [, used, limit] = msg.split(':')
        setUsage({ used: Number(used), limit: Number(limit) })
      } else setError(/ANTHROPIC|unavailable|Failed to fetch|Request failed|not configured/i.test(msg) ? t('design.gen.offline') : msg)
    } finally {
      setBusy(false)
    }
  }

  const fileName = (title || 'flyer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flyer'
  const download = (href: string, ext: string) => {
    const a = document.createElement('a')
    a.href = href
    a.download = `${fileName}.${ext}`
    a.click()
  }

  return (
    <div className="ds-grid">
      <section className="d-panel d-form">
        <div className="d-panel-head">
          <h2>
            <Wand2 size={17} /> {t('design.gen.title')}
          </h2>
          <span className={`d-pill ${blocked ? '' : 'd-pill-lime'}`}>
            {usage.limit === null ? t('design.gen.unlimited') : t('design.gen.usage', { used: usage.used, limit: usage.limit })}
          </span>
        </div>
        <label className="d-field">
          <span>{t('design.gen.brief')}</span>
          <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={t('design.gen.briefPh')} />
        </label>
        <div className="d-grid">
          <label className="d-field">
            <span>{t('site.studio.title')}</span>
            <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={t('site.studio.defTitle')} />
          </label>
          <label className="d-field">
            <span>{t('site.studio.when')}</span>
            <input value={when} maxLength={60} onChange={(e) => setWhen(e.target.value)} placeholder={t('site.studio.defWhen')} />
          </label>
          <label className="d-field">
            <span>{t('events.location')}</span>
            <input value={place} maxLength={80} onChange={(e) => setPlace(e.target.value)} placeholder={t('events.locationPh')} />
          </label>
          <label className="d-field">
            <span>{t('site.studio.church')}</span>
            <input value={church} maxLength={80} onChange={(e) => setChurch(e.target.value)} />
          </label>
        </div>
        <span className="d-field-label">{t('design.gen.style')}</span>
        <div className="ai-flyer-chips">
          {STYLES.map((s) => (
            <button key={s} type="button" className={`d-pill ${style === s ? 'is-on' : ''}`} onClick={() => setStyle(s)}>
              {t(`design.gen.styles.${s}`)}
            </button>
          ))}
        </div>
        <div className="d-grid">
          <label className="d-field">
            <span>{t('design.gen.format')}</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as FlyerFormat)}>
              {(Object.keys(FLYER_SIZE) as FlyerFormat[]).map((f) => (
                <option key={f} value={f}>
                  {t(`design.gen.formats.${f}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="d-field">
            <span>{t('design.gen.language')}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.native}
                </option>
              ))}
            </select>
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
        {error && <p className="d-errors">{error}</p>}
        {blocked ? (
          <div className="d-hint-box ai-flyer-limit">
            <span>{t('design.gen.limitReached', { limit: usage.limit ?? 0 })}</span>
            <Link to="/dashboard/settings?tab=plan" className="d-btn d-btn-ink">
              <Sparkles size={15} /> {t('design.gen.upgrade')}
            </Link>
          </div>
        ) : (
          <div className="d-form-actions">
            <button type="button" className="d-btn d-btn-ink" disabled={busy} onClick={generate}>
              {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} {busy ? t('design.gen.creating') : result ? t('design.gen.again') : t('design.gen.create')}
            </button>
          </div>
        )}
        <small className="d-muted">{t('design.gen.note')}</small>
      </section>

      <section className="ds-stage">
        <div className={`ai-flyer-art ${busy ? 'is-busy' : ''}`} style={{ aspectRatio: `${FLYER_SIZE[format].w} / ${FLYER_SIZE[format].h}` }}>
          {result ? (
            <img src={result.png} alt={title || t('design.gen.title')} />
          ) : (
            <span className="ai-flyer-empty">
              {busy ? <Loader2 size={28} className="spin" /> : <ImagePlus size={28} />}
              <small>{busy ? t('design.gen.creatingLong') : t('design.gen.empty')}</small>
            </span>
          )}
        </div>
        {result && (
          <div className="ds-actions">
            <button type="button" className="d-btn d-btn-ink" onClick={() => download(result.png, 'png')}>
              <Download size={15} /> PNG
            </button>
            <button type="button" className="d-btn" onClick={() => download(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`, 'svg')}>
              <Download size={15} /> SVG
            </button>
            <button
              type="button"
              className="d-btn"
              disabled={saved}
              onClick={() => {
                addDesign({ template: 'ai', title: title || t('design.untitled'), when, svg: result.svg })
                setSaved(true)
              }}
            >
              <Save size={15} /> {saved ? t('common.saved') : t('design.save')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
