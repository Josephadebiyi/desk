/**
 * Design Studio home (Design Studio → Studio tab): start an AI design from a brief — with the people's photos and
 * how they should be shown, inspiration references and a reference mode — or a blank design to edit by hand;
 * and reopen recent designs. The AI is used only when "Design it for me" is pressed.
 */
import { ImagePlus, Loader2, Plus, Sparkles, Trash2, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { LANGS, useT, type Lang } from '../i18n'
import { useWorkspace } from './workspace'
import { fmtDate } from './kit'

type Format = 'portrait' | 'square' | 'story' | 'landscape'
type PhotoStyle = 'circle' | 'rounded' | 'cutout' | 'rect'
interface Person {
  name: string
  role: string
  photo: { id: string; url: string; cutout?: boolean } | null
  uploading?: boolean
}
interface Row {
  id: string
  title: string
  status: string
  preview: string | null
  updated_at: string
  approved_at: string | null
}

async function fileToDataUrl(file: File, max = 2400): Promise<string> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  await img.decode()
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * k)
  c.height = Math.round(img.naturalHeight * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  URL.revokeObjectURL(url)
  return c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9)
}
const upload = async (file: File, kind: 'portrait' | 'reference') => api<{ asset: { id: string }; url: string }>('/studio/assets', { dataUrl: await fileToDataUrl(file), kind })

/** Cut-out style: remove each portrait's background in the browser (free), then upload the cut-out. */
async function cutoutPhoto(url: string) {
  const { removeBackground } = await import('../editor/cutout')
  const r = await removeBackground(url)
  return api<{ asset: { id: string }; url: string }>('/studio/assets', { dataUrl: r.dataUrl, kind: 'portrait', cutout: true })
}

export function StudioHome() {
  const { t, lang } = useT()
  const { live, settings } = useWorkspace()
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [ready, setReady] = useState(true)
  const [brief, setBrief] = useState('')
  const [c, setC] = useState({ title: '', subtitle: '', date: '', time: '', venue: '', cta: '', scripture: '' })
  const [people, setPeople] = useState<Person[]>([])
  const [photoStyle, setPhotoStyle] = useState<PhotoStyle>('circle')
  const [refs, setRefs] = useState<{ id: string; url: string }[]>([])
  const [mode, setMode] = useState<'original' | 'inspired' | 'replicate'>('original')
  const [format, setFormat] = useState<Format>('portrait')
  const [language, setLanguage] = useState<Lang>(lang)
  const [useLogo, setUseLogo] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Quick: one description (+ optional photos); the AI decides everything else. Detailed: every field.
  const [quick, setQuick] = useState(true)
  const [loose, setLoose] = useState<{ id: string; url: string; uploading?: boolean }[]>([])
  const addLoose = async (files: FileList | null) => {
    if (!files || !live) return
    for (const file of Array.from(files).slice(0, 8 - loose.length)) {
      const tmp = `tmp-${Math.random()}`
      setLoose((x) => [...x, { id: tmp, url: URL.createObjectURL(file), uploading: true }])
      try {
        const r = await upload(file, 'portrait')
        setLoose((x) => x.map((p) => (p.id === tmp ? { id: r.asset.id, url: r.url } : p)))
      } catch (e) {
        setLoose((x) => x.filter((p) => p.id !== tmp))
        setError(e instanceof Error ? e.message : String(e))
      }
    }
  }
  const createQuick = async () => {
    setError('')
    if (!brief.trim()) return setError(t('studio.home.errBrief'))
    if (loose.some((p) => p.uploading)) return
    setBusy(true)
    try {
      const r = await api<{ id: string }>('/studio/designs', { brief, photos: loose.map((p) => p.id), references: refs.map((x) => x.id), mode: refs.length ? 'inspired' : 'original', format, language, logo: useLogo })
      nav(`/dashboard/design/edit/${r.id}`)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setError(m.startsWith('LIMIT:') ? t('design.gen.limitReached', { limit: m.split(':')[2] }) : m)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!live) return setRows([])
    api<{ designs: Row[]; ready: boolean }>('/studio/designs').then(
      (r) => (setRows(r.designs), setReady(r.ready)),
      () => setRows([]),
    )
  }, [live])

  const addPhoto = async (i: number, file?: File) => {
    if (!file || !live) return
    setPeople((p) => p.map((x, j) => (j === i ? { ...x, uploading: true } : x)))
    try {
      const r = await upload(file, 'portrait')
      setPeople((p) => p.map((x, j) => (j === i ? { ...x, photo: { id: r.asset.id, url: r.url }, uploading: false } : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPeople((p) => p.map((x, j) => (j === i ? { ...x, uploading: false } : x)))
    }
  }
  const addRef = async (file?: File) => {
    if (!file || !live || refs.length >= 4) return
    try {
      const r = await upload(file, 'reference')
      setRefs((x) => [...x, { id: r.asset.id, url: r.url }])
      if (mode === 'original') setMode('inspired')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const create = async () => {
    setError('')
    if (!brief.trim() && !c.title.trim()) return setError(t('studio.home.errBrief'))
    setBusy(true)
    try {
      let list = people
      if (photoStyle === 'cutout' && people.some((p) => p.photo && !p.photo.cutout)) {
        setError(t('studio.home.cutting'))
        list = await Promise.all(
          people.map(async (p) => {
            if (!p.photo || p.photo.cutout) return p
            try {
              const c = await cutoutPhoto(p.photo.url)
              return { ...p, photo: { id: c.asset.id, url: c.url, cutout: true } }
            } catch {
              return p // keep the original photo if no person is found
            }
          }),
        )
        setPeople(list)
        setError('')
      }
      const r = await api<{ id: string }>('/studio/designs', {
        brief,
        content: c,
        speakers: list.filter((p) => p.name.trim()).map((p) => ({ name: p.name, role: p.role, photoAssetId: p.photo?.id ?? null })),
        photoStyle,
        references: refs.map((x) => x.id),
        mode: refs.length ? mode : 'original',
        format,
        language,
        logo: useLogo,
      })
      nav(`/dashboard/design/edit/${r.id}`)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setError(m.startsWith('LIMIT:') ? t('design.gen.limitReached', { limit: m.split(':')[2] }) : m)
    } finally {
      setBusy(false)
    }
  }
  const blank = async () => {
    if (!live) return nav('/dashboard/design/edit/demo')
    const r = await api<{ id: string }>('/studio/designs/blank', { format, title: c.title })
    nav(`/dashboard/design/edit/${r.id}`)
  }

  const field = (k: keyof typeof c, label: string, ph = '') => (
    <label className="d-field">
      <span>{label}</span>
      <input value={c[k]} maxLength={k === 'scripture' ? 220 : 140} placeholder={ph} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
    </label>
  )

  return (
    <div className="st-home">
      <section className="d-panel d-form">
        <div className="d-panel-head">
          <h2>
            <Sparkles size={17} /> {t('studio.home.title')}
          </h2>
        </div>
        <div className="st-switch" role="radiogroup" aria-label={t('studio.home.how')}>
          <button type="button" role="radio" aria-checked={quick} className={quick ? 'is-on' : ''} onClick={() => setQuick(true)}>
            <Sparkles size={14} /> {t('studio.home.quick')}
          </button>
          <button type="button" role="radio" aria-checked={!quick} className={!quick ? 'is-on' : ''} onClick={() => setQuick(false)}>
            {t('studio.home.detailed')}
          </button>
        </div>
        <p className="d-muted">{quick ? t('studio.home.quickIntro') : t('studio.home.intro')}</p>
        {!ready && <p className="d-hint-box">{t('studio.home.notReady')}</p>}
        {quick ? (
          <>
            <label className="d-field">
              <span>{t('studio.home.quickBrief')}</span>
              <textarea rows={6} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={t('studio.home.quickPh')} />
            </label>
            <span className="d-field-label">{t('studio.home.quickPhotos')}</span>
            <div className="st-refs">
              {loose.map((p) => (
                <div key={p.id} className="st-ref is-photo">
                  {p.uploading ? <Loader2 size={18} className="spin" /> : <img src={p.url} alt="" />}
                  <button type="button" onClick={() => setLoose((x) => x.filter((y) => y.id !== p.id))} aria-label={t('cf.remove')}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              {loose.length < 8 && (
                <label className="st-ref is-add is-photo">
                  <UserPlus size={18} />
                  <span>{t('studio.home.addPhotos')}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => (void addLoose(e.target.files), (e.target.value = ''))} disabled={!live} />
                </label>
              )}
              {refs.map((r) => (
                <div key={r.id} className="st-ref">
                  <img src={r.url} alt="" />
                  <button type="button" onClick={() => setRefs((x) => x.filter((y) => y.id !== r.id))} aria-label={t('cf.remove')}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              {refs.length < 1 && (
                <label className="st-ref is-add">
                  <ImagePlus size={18} />
                  <span>{t('studio.home.addRef')}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => addRef(e.target.files?.[0])} disabled={!live} />
                </label>
              )}
            </div>
            <small className="d-muted">{t('studio.home.quickPhotosHint')}</small>
            <label className="d-field">
              <span>{t('design.gen.format')}</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                {(['portrait', 'square', 'story', 'landscape'] as const).map((f) => (
                  <option key={f} value={f}>
                    {t(`studio.home.formats.${f}`)}
                  </option>
                ))}
              </select>
            </label>
            {error && <p className="d-errors">{error}</p>}
            <div className="d-form-actions">
              <button type="button" className="d-btn d-btn-ink" disabled={busy || !live || loose.some((p) => p.uploading)} onClick={createQuick}>
                {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} {t('studio.home.create')}
              </button>
            </div>
            <small className="d-muted">{live ? t('studio.home.note') : t('studio.home.demo')}</small>
          </>
        ) : (
          <>
        <label className="d-field">
          <span>{t('studio.home.brief')}</span>
          <textarea rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={t('studio.home.briefPh')} />
        </label>
        <div className="d-grid">
          {field('title', t('studio.home.f.title'))}
          {field('subtitle', t('studio.home.f.subtitle'))}
          {field('date', t('studio.home.f.date'))}
          {field('time', t('studio.home.f.time'))}
          {field('venue', t('studio.home.f.venue'))}
          {field('cta', t('studio.home.f.cta'), t('studio.home.f.ctaPh'))}
        </div>
        {field('scripture', t('studio.home.f.scripture'))}

        <span className="d-field-label">{t('studio.home.people')}</span>
        <div className="st-people">
          {people.map((p, i) => (
            <div key={i} className="st-person">
              <label className="st-photo" title={t('studio.home.addPhoto')}>
                {p.uploading ? <Loader2 size={18} className="spin" /> : p.photo ? <img src={p.photo.url} alt="" /> : <ImagePlus size={18} />}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => addPhoto(i, e.target.files?.[0])} disabled={!live} />
              </label>
              <input value={p.name} placeholder={t('studio.home.name')} maxLength={80} onChange={(e) => setPeople((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
              <input value={p.role} placeholder={t('studio.home.role')} maxLength={80} onChange={(e) => setPeople((x) => x.map((y, j) => (j === i ? { ...y, role: e.target.value } : y)))} />
              <button type="button" className="d-icon-btn" onClick={() => setPeople((x) => x.filter((_, j) => j !== i))} aria-label={t('cf.remove')}>
                <X size={14} />
              </button>
            </div>
          ))}
          {people.length < 8 && (
            <button type="button" className="d-btn" onClick={() => setPeople((x) => [...x, { name: '', role: '', photo: null }])}>
              <UserPlus size={15} /> {t('studio.home.addPerson')}
            </button>
          )}
        </div>
        {people.length > 0 && (
          <>
            <span className="d-field-label">{t('studio.home.photoStyle')}</span>
            <div className="st-styles" role="radiogroup" aria-label={t('studio.home.photoStyle')}>
              {(['circle', 'rounded', 'cutout', 'rect'] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={photoStyle === s} className={`st-style ${photoStyle === s ? 'is-on' : ''}`} onClick={() => setPhotoStyle(s)}>
                  <span className={`st-style-art is-${s}`} />
                  <b>{t(`studio.home.styles.${s}`)}</b>
                  <small>{t(`studio.home.stylesHint.${s}`)}</small>
                </button>
              ))}
            </div>
          </>
        )}

        <span className="d-field-label">{t('studio.home.refs')}</span>
        <div className="st-refs">
          {refs.map((r) => (
            <div key={r.id} className="st-ref">
              <img src={r.url} alt="" />
              <button type="button" onClick={() => setRefs((x) => x.filter((y) => y.id !== r.id))} aria-label={t('cf.remove')}>
                <X size={13} />
              </button>
            </div>
          ))}
          {refs.length < 4 && (
            <label className="st-ref is-add">
              <ImagePlus size={18} />
              <span>{t('studio.home.addRef')}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => addRef(e.target.files?.[0])} disabled={!live} />
            </label>
          )}
        </div>
        {refs.length > 0 && (
          <div className="st-modes" role="radiogroup" aria-label={t('studio.home.mode')}>
            {(['replicate', 'inspired', 'original'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={`st-mode ${mode === m ? 'is-on' : ''}`} onClick={() => setMode(m)}>
                <b>{t(`studio.home.modes.${m}`)}</b>
                <small>{t(`studio.home.modesHint.${m}`)}</small>
              </button>
            ))}
          </div>
        )}
        <small className="d-muted">{t('studio.home.refsNote')}</small>

        <div className="d-grid">
          <label className="d-field">
            <span>{t('design.gen.format')}</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
              {(['portrait', 'square', 'story', 'landscape'] as const).map((f) => (
                <option key={f} value={f}>
                  {t(`studio.home.formats.${f}`)}
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
        {settings.logoUrl ? (
          <label className="d-inline-check">
            <input type="checkbox" checked={useLogo} onChange={(e) => setUseLogo(e.target.checked)} /> {t('design.gen.useLogo')}
          </label>
        ) : (
          <small className="d-muted">
            {t('design.gen.noLogo')} <Link to="/dashboard/settings?tab=profile">{t('design.gen.addLogo')}</Link>
          </small>
        )}
        {error && <p className="d-errors">{error}</p>}
        <div className="d-form-actions">
          <button type="button" className="d-btn d-btn-ink" disabled={busy || !live} onClick={create}>
            {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} {t('studio.home.create')}
          </button>
          <button type="button" className="d-btn" onClick={blank}>
            <Plus size={15} /> {t('studio.home.blank')}
          </button>
        </div>
        <small className="d-muted">{live ? t('studio.home.note') : t('studio.home.demo')}</small>
          </>
        )}
      </section>

      <section className="st-list">
        <h3>{t('studio.home.recent')}</h3>
        {rows === null ? (
          <Loader2 className="spin" />
        ) : rows.length ? (
          <div className="st-grid">
            {rows.map((r) => (
              <article key={r.id} className="st-card">
                <Link to={`/dashboard/design/edit/${r.id}`}>
                  {r.preview ? <img src={r.preview} alt={r.title} loading="lazy" /> : <span className="st-card-empty">{r.status === 'failed' ? t('studio.home.failed') : <Loader2 className="spin" />}</span>}
                </Link>
                <div>
                  <b>{r.title || t('design.untitled')}</b>
                  <small>
                    {r.approved_at ? `✓ ${t('studio.home.approved')} · ` : ''}
                    {fmtDate(r.updated_at.slice(0, 10))}
                  </small>
                </div>
                <button
                  type="button"
                  className="d-icon-btn"
                  aria-label={t('cf.remove')}
                  onClick={async () => {
                    if (!confirm(t('studio.home.deleteConfirm'))) return
                    await api(`/studio/designs/${r.id}`, undefined, 'DELETE')
                    setRows((x) => x?.filter((y) => y.id !== r.id) ?? null)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="d-muted">{live ? t('studio.home.empty') : <Link to="/dashboard/design/edit/demo">{t('studio.home.tryDemo')}</Link>}</p>
        )}
      </section>
    </div>
  )
}
