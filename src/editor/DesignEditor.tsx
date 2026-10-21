/**
 * Design editor (route /dashboard/design/edit/:id). Canva-style manual editing that runs entirely in the browser —
 * no AI credits — plus an "Ask AI" panel that only calls the server when the user sends a request.
 * Saves automatically (versioned on the server); undo / redo; exact-size PNG / SVG export; works on phones.
 */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronsDown,
  ChevronsUp,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  FlipHorizontal,
  Group as GroupIcon,
  History,
  ImagePlus,
  Layers as LayersIcon,
  Loader2,
  Lock,
  Minus,
  Plus,
  Redo2,
  Ruler,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Unlock,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { useWorkspace } from '../dashboard/workspace'
import { confirmAction } from '../dashboard/confirm'
import { FONTS, nearestWeight, type Font } from '../design/fonts'
import { runQc } from '../design/qc'
import { DesignSpec, type Asset, type Layer } from '../design/spec'
import { layoutSpec } from '../design/layout'
import { Canvas } from './Canvas'
import { cssFont, specFonts } from './fonts'
import { download, exportPng, exportSvg, fileName } from './exporter'
import { useHistory } from './history'
import { addLayer, duplicate, group, layerById, moveBy, newImage, newShape, newText, patchLayer, patchText, refitAll, removeLayers, reorder, resizeCanvas, ungroup, withGroups } from './ops'
import { PRESETS, formatFor } from './presets'
import { removeBackground } from './cutout'
import { demoSpec } from './demo'
import './editor.css'

type Fonts = Map<string, Font>
interface Loaded {
  spec: DesignSpec
  version: number
  status: string
  urls: Record<string, string>
  aiEditsLeft: number
  title: string
}

/** Shrinks a photo before upload (≤ 2400 px, JPEG for photos, PNG keeps transparency). */
async function readImage(file: File, keepAlpha: boolean): Promise<{ dataUrl: string; w: number; h: number }> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  await img.decode()
  const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * k)
  c.height = Math.round(img.naturalHeight * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  URL.revokeObjectURL(url)
  const png = keepAlpha || file.type === 'image/png' || file.type === 'image/webp'
  return { dataUrl: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), w: c.width, h: c.height }
}

export default function DesignEditor() {
  const { id = '' } = useParams()
  const { live } = useWorkspace()
  const { t } = useT()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!live || id === 'demo') {
      setLoaded({ spec: demoSpec(), version: 0, status: 'ready', urls: {}, aiEditsLeft: 0, title: 'Demo design' })
      return
    }
    try {
      const d = await api<{ spec: DesignSpec; version: number; status: string; urls: { assets: Record<string, string> }; aiEditsLeft: number; title: string }>(`/studio/designs/${id}`)
      setLoaded({ spec: DesignSpec.parse(d.spec), version: d.version, status: d.status, urls: d.urls.assets, aiEditsLeft: d.aiEditsLeft, title: d.title })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [id, live])
  useEffect(() => void load(), [load])

  if (error) return <div className="ed-center">{error}</div>
  if (!loaded) return <div className="ed-center"><Loader2 className="spin" /> {t('common.loading')}</div>
  if (loaded.status === 'queued' || loaded.status === 'running') return <Working id={id} onReady={load} />
  return <Editor key={`${id}:${loaded.version}`} id={id} live={live && id !== 'demo'} initial={loaded} reload={load} />
}

/** While the AI designs: the agents' progress, polled every 2 s. */
function Working({ id, onReady }: { id: string; onReady: () => void }) {
  const { t } = useT()
  const [p, setP] = useState<{ status: string; stage: string; progress: { agent: string; message: string }[]; error: string | null } | null>(null)
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const d = await api<{ status: string; stage: string; progress: { agent: string; message: string }[]; error: string | null }>(`/studio/designs/${id}`)
        if (stop) return
        setP(d)
        if (d.status === 'ready' || d.status === 'failed') return onReady()
      } catch {
        /* retry */
      }
      if (!stop) setTimeout(tick, 2000)
    }
    void tick()
    return () => {
      stop = true
    }
  }, [id, onReady])
  const steps = ['reference', 'director', 'typography', 'layout', 'qc', 'done']
  const at = Math.max(0, steps.indexOf(p?.stage ?? 'director'))
  return (
    <div className="ed-working">
      <Sparkles size={28} />
      <h2>{t('studio.working.title')}</h2>
      <ol>
        {steps.slice(0, -1).map((s, i) => (
          <li key={s} className={i < at ? 'is-done' : i === at ? 'is-now' : ''}>
            {i < at ? <Check size={14} /> : i === at ? <Loader2 size={14} className="spin" /> : <span />} {t(`studio.agents.${s}`)}
          </li>
        ))}
      </ol>
      <p className="d-muted">{p?.progress?.[p.progress.length - 1]?.message ?? t('studio.working.start')}</p>
    </div>
  )
}

function Editor({ id, live, initial, reload }: { id: string; live: boolean; initial: Loaded; reload: () => Promise<void> }) {
  const { t } = useT()
  const nav = useNavigate()
  const h = useHistory(initial.spec)
  const spec = h.spec
  const [fonts, setFonts] = useState<Fonts | null>(null)
  const [urls, setUrls] = useState(initial.urls)
  const [selected, setSelected] = useState<string[]>([])
  const [zoom, setZoom] = useState(1)
  const [guides, setGuides] = useState(true)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [panel, setPanel] = useState<'edit' | 'layers' | 'ai'>('edit')
  const [mode, setMode] = useState<'manual' | 'ai'>('manual')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error' | 'conflict'>('saved')
  const [busy, setBusy] = useState('')
  const [showVersions, setShowVersions] = useState(false)
  const version = useRef(initial.version)
  const savedSpec = useRef(initial.spec)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadKind = useRef<'portrait' | 'logo' | 'decor' | 'replace'>('portrait')

  // fonts for everything in the design (re-checked when fonts change)
  const fontList = useMemo(() => [...new Set(spec.layers.filter((l) => l.text).map((l) => `${l.text!.font}:${l.text!.weight}`))].join('|'), [spec.layers])
  useEffect(() => {
    let off = false
    void specFonts(spec).then((f) => {
      if (off) return
      setFonts(f)
      // a fresh demo design has no layers yet: lay it out once (deterministic, no AI)
      if (!spec.layers.length) h.reset({ ...spec, layers: layoutSpec(spec, f) })
      else if (spec.layers.some((l) => l.text && !l.text.fitted)) h.set(refitAll(spec, f))
    })
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontList])

  /* ───────── autosave (manual edits never use AI) ───────── */
  const save = useCallback(
    async (s: DesignSpec, opts: { preview?: boolean; note?: string } = {}) => {
      if (!live) {
        try {
          localStorage.setItem('zd-demo-design', JSON.stringify(s))
        } catch {
          /* private mode */
        }
        savedSpec.current = s
        return setSaveState('saved')
      }
      setSaveState('saving')
      try {
        const preview = opts.preview ? await exportPng(s, urls, Math.min(1, 1080 / s.canvas.w)) : undefined
        const r = await api<{ version: number }>(`/studio/designs/${id}`, { spec: s, baseVersion: version.current, preview, note: opts.note }, 'PUT')
        version.current = r.version
        savedSpec.current = s
        setSaveState(h.spec === s ? 'saved' : 'dirty')
      } catch (e) {
        setSaveState(e instanceof Error && e.message === 'STALE' ? 'conflict' : 'error')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, live, urls],
  )
  useEffect(() => {
    if (spec === savedSpec.current) return
    setSaveState('dirty')
    const timer = setTimeout(() => void save(spec), 1500)
    return () => clearTimeout(timer)
  }, [spec, save])
  // a thumbnail now and then, and when leaving
  useEffect(() => {
    const timer = setInterval(() => spec !== savedSpec.current || void save(spec, { preview: true }), 60_000)
    return () => clearInterval(timer)
  }, [spec, save])

  const set = (s: DesignSpec, coalesce?: string) => h.set(s, coalesce)
  const sel = selected.map((sid) => layerById(spec, sid)).filter((l): l is Layer => Boolean(l))
  const one = sel.length === 1 ? sel[0] : null
  const issues = useMemo(() => (fonts ? runQc(spec) : []), [spec, fonts])

  /* ───────── keyboard ───────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') (e.preventDefault(), e.shiftKey ? h.redo() : h.undo())
      else if (mod && e.key.toLowerCase() === 'y') (e.preventDefault(), h.redo())
      else if (mod && e.key.toLowerCase() === 'd' && selected.length) {
        e.preventDefault()
        const r = duplicate(spec, selected)
        set(r.spec)
        setSelected(r.ids)
      } else if (mod && e.key.toLowerCase() === 'g' && selected.length > 1) (e.preventDefault(), set(e.shiftKey ? ungroup(spec, selected) : group(spec, selected)))
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) {
        e.preventDefault()
        set(removeLayers(spec, selected))
        setSelected([])
      } else if (e.key.startsWith('Arrow') && selected.length) {
        e.preventDefault()
        const d = e.shiftKey ? 10 : 1
        set(moveBy(spec, selected, e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0), 'nudge')
      } else if (e.key === 'Escape') setSelected([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ───────── uploads ───────── */
  const pickFile = (kind: typeof uploadKind.current) => {
    uploadKind.current = kind
    fileInput.current?.click()
  }
  const uploadAsset = async (dataUrl: string, w: number, h2: number, kind: Asset['kind'], cutout = false): Promise<Asset> => {
    if (!live) {
      const a: Asset = { id: `local-${Math.random().toString(36).slice(2, 10)}`, kind, path: null, svg: null, mime: 'image/png', w, h: h2, cutout, tone: null }
      setUrls((u) => ({ ...u, [a.id]: dataUrl }))
      return a
    }
    const r = await api<{ asset: Asset; url: string }>('/studio/assets', { dataUrl, kind, cutout })
    setUrls((u) => ({ ...u, [r.asset.id]: r.url }))
    return r.asset
  }
  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(t('studio.uploading'))
    try {
      const kind = uploadKind.current
      const img = await readImage(file, kind === 'logo')
      const asset = await uploadAsset(img.dataUrl, img.w, img.h, kind === 'replace' ? (one?.image ? (spec.assets[one.image.assetId]?.kind ?? 'portrait') : 'portrait') : kind)
      let s = { ...spec, assets: { ...spec.assets, [asset.id]: asset } }
      if (kind === 'replace' && one?.image) s = patchLayer(s, one.id, { image: { ...one.image, assetId: asset.id, crop: null } })
      else {
        const r = addLayer(s, newImage(s, asset.id, img.w, img.h, kind === 'replace' ? 'portrait' : kind))
        s = r.spec
        setSelected([r.id])
      }
      set(s)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }
  const cutOut = async () => {
    if (!one?.image) return
    const src = urls[one.image.assetId]
    if (!src) return
    setBusy(t('studio.cutting'))
    try {
      const r = await removeBackground(src)
      const asset = await uploadAsset(r.dataUrl, r.w, r.h, 'portrait', true)
      set(patchLayer({ ...spec, assets: { ...spec.assets, [asset.id]: asset } }, one.id, { image: { ...one.image, assetId: asset.id, fit: 'contain', mask: 'none', crop: null } }))
    } catch (e) {
      alert(e instanceof Error ? e.message : t('studio.cutFailed'))
    } finally {
      setBusy('')
    }
  }

  /* ───────── export / approve ───────── */
  const doExport = async (kind: 'png' | 'png2' | 'svg') => {
    setBusy(t('studio.exporting'))
    try {
      if (kind === 'svg') download(URL.createObjectURL(new Blob([await exportSvg(spec, urls)], { type: 'image/svg+xml' })), fileName(spec.content.title, 'svg'))
      else download(await exportPng(spec, urls, kind === 'png2' ? 2 : 1), fileName(spec.content.title, 'png'))
    } finally {
      setBusy('')
    }
  }
  const approve = async () => {
    if (!live) return
    setBusy(t('studio.approving'))
    try {
      await save(spec, { preview: true, note: 'Approved' })
      await api(`/studio/designs/${id}/approve`, {})
      alert(t('studio.approved'))
    } finally {
      setBusy('')
    }
  }

  /* ───────── canvas size ───────── */
  const setSize = async (w: number, h2: number, how: 'scale' | 'relayout') => {
    if (!fonts) return
    const s = resizeCanvas(spec, w, h2, how, await specFonts(spec), formatFor(w, h2))
    set(s)
  }

  const conflict = saveState === 'conflict'
  return (
    <div className={`ed ${mode === 'ai' ? 'is-ai' : ''}`}>
      <header className="ed-bar">
        <button type="button" className="ed-icon" onClick={() => (saveState === 'dirty' ? save(spec, { preview: true }).then(() => nav('/dashboard/design?tab=studio')) : nav('/dashboard/design?tab=studio'))} aria-label={t('studio.back')}>
          <ArrowLeft size={18} />
        </button>
        <input className="ed-title" value={spec.content.title} aria-label={t('studio.titleLabel')} onChange={(e) => set({ ...spec, content: { ...spec.content, title: e.target.value } }, 'title')} />
        <span className={`ed-save is-${saveState}`}>{t(`studio.save.${saveState}`)}</span>
        <div className="ed-bar-group">
          <button type="button" className="ed-icon" disabled={!h.canUndo} onClick={h.undo} aria-label={t('studio.undo')} title={`${t('studio.undo')} (Ctrl+Z)`}>
            <Undo2 size={17} />
          </button>
          <button type="button" className="ed-icon" disabled={!h.canRedo} onClick={h.redo} aria-label={t('studio.redo')} title={`${t('studio.redo')} (Ctrl+Shift+Z)`}>
            <Redo2 size={17} />
          </button>
        </div>
        <div className="ed-mode" role="radiogroup" aria-label={t('studio.mode')}>
          <button type="button" role="radio" aria-checked={mode === 'manual'} className={mode === 'manual' ? 'is-on' : ''} onClick={() => (setMode('manual'), setPanel('edit'))}>
            <SlidersHorizontal size={15} /> {t('studio.manual')}
          </button>
          <button type="button" role="radio" aria-checked={mode === 'ai'} className={mode === 'ai' ? 'is-on' : ''} onClick={() => (setMode('ai'), setPanel('ai'))}>
            <Sparkles size={15} /> {t('studio.askAi')}
          </button>
        </div>
        <div className="ed-bar-group ed-bar-right">
          <button type="button" className="ed-icon" onClick={() => setShowVersions(true)} aria-label={t('studio.versions')} title={t('studio.versions')} disabled={!live}>
            <History size={17} />
          </button>
          <Menu label={<><Download size={16} /> {t('studio.export')}</>}>
            <button type="button" onClick={() => doExport('png')}>PNG · {spec.canvas.w}×{spec.canvas.h}</button>
            <button type="button" onClick={() => doExport('png2')}>PNG 2× · {spec.canvas.w * 2}×{spec.canvas.h * 2}</button>
            <button type="button" onClick={() => doExport('svg')}>SVG ({t('studio.vector')})</button>
          </Menu>
          {live && (
            <button type="button" className="d-btn d-btn-ink ed-approve" onClick={approve}>
              <Check size={15} /> {t('studio.approve')}
            </button>
          )}
        </div>
      </header>

      <div className="ed-tools">
        <button type="button" onClick={() => fonts && (() => { const r = addLayer(spec, newText(spec), fonts); set(r.spec); setSelected([r.id]) })()} title={t('studio.addText')}>
          <Type size={17} /> <span>{t('studio.text')}</span>
        </button>
        <button type="button" onClick={() => { const r = addLayer(spec, newShape(spec, 'rect')); set(r.spec); setSelected([r.id]) }} title={t('studio.addShape')}>
          <Square size={17} /> <span>{t('studio.shape')}</span>
        </button>
        <button type="button" onClick={() => { const r = addLayer(spec, newShape(spec, 'circle')); set(r.spec); setSelected([r.id]) }} title={t('studio.addCircle')}>
          <Circle size={17} /> <span>{t('studio.circle')}</span>
        </button>
        <button type="button" onClick={() => { const r = addLayer(spec, newShape(spec, 'line')); set(r.spec); setSelected([r.id]) }} title={t('studio.addLine')}>
          <Minus size={17} /> <span>{t('studio.line')}</span>
        </button>
        <button type="button" onClick={() => pickFile('portrait')} title={t('studio.addPhoto')}>
          <ImagePlus size={17} /> <span>{t('studio.photo')}</span>
        </button>
        <button type="button" onClick={() => pickFile('logo')} title={t('studio.addLogo')}>
          <ImagePlus size={17} /> <span>{t('studio.logo')}</span>
        </button>
        <span className="ed-tools-sep" />
        <Menu label={<>{spec.canvas.w}×{spec.canvas.h}</>} title={t('studio.size')}>
          {(['Social', 'Video', 'Print'] as const).map((g) => (
            <div key={g} className="ed-menu-group">
              <small>{t(`studio.presetGroups.${g}`)}</small>
              {PRESETS.filter((x) => x.group === g).map((x) => (
                <div key={x.id} className="ed-preset">
                  <span>
                    {x.label} <em>{x.w}×{x.h}</em>
                  </span>
                  <button type="button" onClick={() => setSize(x.w, x.h, 'relayout')}>{t('studio.relayout')}</button>
                  <button type="button" onClick={() => setSize(x.w, x.h, 'scale')}>{t('studio.scale')}</button>
                </div>
              ))}
            </div>
          ))}
        </Menu>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))} aria-label={t('studio.zoomOut')}>
          <Minus size={15} />
        </button>
        <button type="button" onClick={() => setZoom(1)} className="ed-zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} aria-label={t('studio.zoomIn')}>
          <Plus size={15} />
        </button>
        <button type="button" className={guides ? 'is-on' : ''} onClick={() => setGuides((g) => !g)} title={t('studio.guides')}>
          <Ruler size={16} />
        </button>
      </div>

      <main className="ed-main">
        {fonts ? (
          <Canvas
            spec={spec}
            fonts={fonts}
            urls={urls}
            selected={selected}
            zoom={zoom}
            showGuides={guides}
            editingText={editingText}
            onSelect={(ids, add) => setSelected((cur) => withGroups(spec, add ? [...new Set([...cur.filter((x) => !ids.includes(x)), ...ids.filter((x) => !cur.includes(x))])] : ids))}
            onChange={(lid, patch, key) => set(patchLayer(spec, lid, patch, fonts), key)}
            onMoveMany={(ids, dx, dy, key) => set(moveBy(spec, ids, dx, dy), key)}
            onEditText={(lid) => setEditingText(lid)}
            onTextCommit={(lid, v) => {
              setEditingText(null)
              if (v !== layerById(spec, lid)?.text?.content) set(patchText(spec, lid, { content: v }, fonts))
            }}
          />
        ) : (
          <div className="ed-center"><Loader2 className="spin" /></div>
        )}
        {busy && (
          <div className="ed-busy">
            <Loader2 size={16} className="spin" /> {busy}
          </div>
        )}
        {conflict && (
          <div className="ed-conflict">
            {t('studio.conflict')}{' '}
            <button type="button" className="d-btn" onClick={() => void reload()}>{t('studio.reload')}</button>
          </div>
        )}
      </main>

      <aside className={`ed-side is-${panel}`}>
        <nav className="ed-side-tabs">
          <button type="button" className={panel === 'edit' ? 'is-on' : ''} onClick={() => (setPanel('edit'), setMode('manual'))}>
            <SlidersHorizontal size={15} /> {t('studio.panels.edit')}
          </button>
          <button type="button" className={panel === 'layers' ? 'is-on' : ''} onClick={() => setPanel('layers')}>
            <LayersIcon size={15} /> {t('studio.panels.layers')}
          </button>
          <button type="button" className={panel === 'ai' ? 'is-on' : ''} onClick={() => (setPanel('ai'), setMode('ai'))}>
            <Sparkles size={15} /> {t('studio.panels.ai')}
          </button>
        </nav>
        {panel === 'edit' && fonts && (
          <Inspector spec={spec} sel={sel} fonts={fonts} set={set} onReplace={() => pickFile('replace')} onCutout={cutOut} issues={issues} onSelect={(lid) => setSelected([lid])} />
        )}
        {panel === 'layers' && <LayersPanel spec={spec} selected={selected} set={set} setSelected={setSelected} />}
        {panel === 'ai' && (
          <AiPanel
            id={id}
            live={live}
            left={initial.aiEditsLeft}
            flush={async () => {
              if (spec !== savedSpec.current) await save(spec)
              return version.current
            }}
            onDone={reload}
            onLocalRelayout={async () => fonts && set({ ...spec, layers: layoutSpec(spec, await specFonts(spec)) })}
          />
        )}
      </aside>

      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => (void onFile(e.target.files?.[0]), (e.target.value = ''))} />
      {showVersions && <Versions id={id} onClose={() => setShowVersions(false)} onRestored={reload} />}
    </div>
  )
}

/* ───────────────────────── small UI pieces ───────────────────────── */

const ROLE_KEYS = ['title', 'subtitle', 'tagline', 'host', 'details', 'venue', 'scripture', 'cta', 'cta-pill', 'details-panel', 'panel', 'logo', 'background', 'speaker', 'speaker-name', 'speaker-role', 'speaker-ring', 'speaker-badge', 'speaker-initials', 'speaker-label-panel']
/** A friendly layer name: the user's own name, else what the layer is (Headline, Photo 2…), else its text. */
function useLayerLabel() {
  const { t } = useT()
  return (l: Layer) => {
    if (l.name) return l.name
    const [base, idx] = l.role.split(':')
    if (ROLE_KEYS.includes(base)) return t(`studio.roles.${base}`, { n: Number(idx ?? 0) + 1 })
    return l.text ? l.text.content.slice(0, 28) : t(`studio.kinds.${l.kind}`)
  }
}

function Menu({ label, children, title }: { label: ReactNode; children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  return (
    <div className="ed-menu" ref={ref}>
      <button type="button" className="d-btn" onClick={() => setOpen((o) => !o)} title={title} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className="ed-menu-pop" onClick={(e) => (e.target as HTMLElement).tagName === 'BUTTON' && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

const Num = ({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) => (
  <label className="ed-num">
    <span>{label}</span>
    <input type="number" value={Math.round(value * 100) / 100} step={step} min={min} max={max} onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} />
  </label>
)
const Color = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <label className="ed-color">
    <span>{label}</span>
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    <code>{value}</code>
  </label>
)

function Inspector({ spec, sel, fonts, set, onReplace, onCutout, issues, onSelect }: { spec: DesignSpec; sel: Layer[]; fonts: Fonts; set: (s: DesignSpec, k?: string) => void; onReplace: () => void; onCutout: () => void; issues: ReturnType<typeof runQc>; onSelect: (id: string) => void }) {
  const { t } = useT()
  const l = sel.length === 1 ? sel[0] : null
  const P = (patch: Partial<Layer>, key: string) => l && set(patchLayer(spec, l.id, patch, fonts), `${key}:${l.id}`)
  const T = (patch: Partial<NonNullable<Layer['text']>>, key: string) => l?.text && set(patchText(spec, l.id, patch, fonts), `${key}:${l.id}`)
  const label = useLayerLabel()
  useEffect(() => FONTS.forEach((f) => cssFont(f.family, Number(Object.keys(f.files)[0]))), [])

  if (!l)
    return (
      <div className="ed-panel">
        <p className="d-muted">{sel.length > 1 ? t('studio.multi', { n: sel.length }) : t('studio.pick')}</p>
        <h4>{t('studio.checks')}</h4>
        {issues.length ? (
          <ul className="ed-issues">
            {issues.map((i, n) => (
              <li key={n} className={`is-${i.severity}`}>
                <button type="button" onClick={() => i.layerId && onSelect(i.layerId)}>{i.message}</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ed-ok"><Check size={14} /> {t('studio.allGood')}</p>
        )}
      </div>
    )
  return (
    <div className="ed-panel">
      <h4>{label(l)}</h4>
      {l.text && (
        <section>
          <textarea className="ed-textarea" rows={3} value={l.text.content} onChange={(e) => T({ content: e.target.value }, 'content')} />
          <label className="ed-field">
            <span>{t('studio.font')}</span>
            <select value={l.text.font} onChange={(e) => T({ font: e.target.value, weight: nearestWeight(e.target.value, l.text!.weight) }, 'font')} style={{ fontFamily: `'${l.text.font}'` }}>
              {(['serif', 'sans', 'display', 'condensed', 'script'] as const).map((c) => (
                <optgroup key={c} label={t(`studio.fontGroups.${c}`)}>
                  {FONTS.filter((f) => f.category === c).map((f) => (
                    <option key={f.family} value={f.family} style={{ fontFamily: `'${f.family}'` }}>
                      {f.family}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="ed-row">
            <label className="ed-field">
              <span>{t('studio.weight')}</span>
              <select value={l.text.weight} onChange={(e) => T({ weight: Number(e.target.value) }, 'weight')}>
                {Object.keys(FONTS.find((f) => f.family === l.text!.font)?.files ?? {}).map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </label>
            <Num label={t('studio.sizePx')} value={l.text.size} onChange={(v) => T({ size: Math.max(6, v), minSize: Math.min(l.text!.minSize, Math.max(6, v)) }, 'size')} />
          </div>
          <div className="ed-row">
            <Color label={t('studio.color')} value={l.text.color} onChange={(v) => T({ color: v }, 'color')} />
          </div>
          <div className="ed-row">
            <Num label={t('studio.spacing')} value={l.text.tracking} step={0.01} onChange={(v) => T({ tracking: v }, 'tracking')} />
            <Num label={t('studio.lineHeight')} value={l.text.lineHeight} step={0.05} onChange={(v) => T({ lineHeight: Math.max(0.6, v) }, 'lh')} />
          </div>
          <div className="ed-seg">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} type="button" className={l.text!.align === a ? 'is-on' : ''} onClick={() => T({ align: a }, 'align')} aria-label={a}>
                {a === 'left' ? <AlignLeft size={15} /> : a === 'center' ? <AlignCenter size={15} /> : <AlignRight size={15} />}
              </button>
            ))}
            <button type="button" className={l.text.transform === 'upper' ? 'is-on' : ''} onClick={() => T({ transform: l.text!.transform === 'upper' ? 'none' : 'upper' }, 'case')}>
              AA
            </button>
          </div>
          <label className="d-inline-check">
            <input type="checkbox" checked={Boolean(l.text.shadow)} onChange={(e) => T({ shadow: e.target.checked ? { color: '#000000', blur: 18, dx: 0, dy: 6, opacity: 0.45 } : null }, 'shadow')} /> {t('studio.shadow')}
          </label>
          {l.text.shadow && (
            <div className="ed-row">
              <Num label={t('studio.blur')} value={l.text.shadow.blur} onChange={(v) => T({ shadow: { ...l.text!.shadow!, blur: Math.max(0, v) } }, 'sblur')} />
              <Num label={t('studio.opacity')} value={l.text.shadow.opacity} step={0.05} min={0} max={1} onChange={(v) => T({ shadow: { ...l.text!.shadow!, opacity: Math.max(0, Math.min(1, v)) } }, 'sop')} />
            </div>
          )}
          <label className="d-inline-check">
            <input type="checkbox" checked={Boolean(l.text.outline)} onChange={(e) => T({ outline: e.target.checked ? { color: '#000000', width: 4 } : null }, 'outline')} /> {t('studio.outline')}
          </label>
          {l.text.outline && (
            <div className="ed-row">
              <Color label={t('studio.color')} value={l.text.outline.color} onChange={(v) => T({ outline: { ...l.text!.outline!, color: v } }, 'ocol')} />
              <Num label={t('studio.width')} value={l.text.outline.width} onChange={(v) => T({ outline: { ...l.text!.outline!, width: Math.max(0, v) } }, 'ow')} />
            </div>
          )}
          {l.text.fitted?.overflow && <p className="ed-warn">{t('studio.overflow')}</p>}
        </section>
      )}
      {l.image && (
        <section>
          <div className="ed-row">
            <button type="button" className="d-btn" onClick={onReplace}>
              <ImagePlus size={14} /> {t('studio.replace')}
            </button>
            <button type="button" className="d-btn" onClick={onCutout} title={t('studio.cutHint')}>
              <Scissors size={14} /> {t('studio.removeBg')}
            </button>
          </div>
          <span className="ed-label">{t('studio.photoStyle')}</span>
          <div className="ed-seg">
            {(['none', 'circle', 'rounded'] as const).map((m) => (
              <button key={m} type="button" className={l.image!.mask === m ? 'is-on' : ''} onClick={() => P({ image: { ...l.image!, mask: m, radius: m === 'rounded' ? Math.min(l.w, l.h) * 0.12 : l.image!.radius }, ...(m === 'circle' ? { h: l.w } : {}) }, 'mask')}>
                {t(`studio.masks.${m}`)}
              </button>
            ))}
          </div>
          <div className="ed-seg">
            {(['cover', 'contain'] as const).map((f) => (
              <button key={f} type="button" className={l.image!.fit === f ? 'is-on' : ''} onClick={() => P({ image: { ...l.image!, fit: f } }, 'fit')}>
                {t(`studio.fits.${f}`)}
              </button>
            ))}
            <button type="button" className={l.image.flipX ? 'is-on' : ''} onClick={() => P({ image: { ...l.image!, flipX: !l.image!.flipX } }, 'flip')} aria-label={t('studio.flip')}>
              <FlipHorizontal size={15} />
            </button>
          </div>
          <span className="ed-label">{t('studio.fade')}</span>
          <div className="ed-seg">
            {(['none', 'bottom', 'top', 'left', 'right', 'edges'] as const).map((side) => (
              <button
                key={side}
                type="button"
                className={(l.image!.fade?.side ?? 'none') === side ? 'is-on' : ''}
                onClick={() => P({ image: { ...l.image!, fade: side === 'none' ? null : { side, amount: l.image!.fade?.amount ?? 0.35 } } }, 'fade')}
              >
                {t(`studio.fades.${side}`)}
              </button>
            ))}
          </div>
          {l.image.fade && (
            <label className="ed-slider">
              <span>{t('studio.fadeAmount')}</span>
              <input type="range" min={0.05} max={1} step={0.05} value={l.image.fade.amount} onChange={(e) => P({ image: { ...l.image!, fade: { ...l.image!.fade!, amount: Number(e.target.value) } } }, 'fadeamt')} />
            </label>
          )}
          <span className="ed-label">{t('studio.crop')}</span>
          {(() => {
            const c = l.image.crop ?? { x: 0, y: 0, w: 1, h: 1 }
            const zoomV = 1 / c.w
            const setCrop = (z: number, cx: number, cy: number) => {
              const w = 1 / z
              P({ image: { ...l.image!, crop: z <= 1.001 ? null : { w, h: w, x: Math.max(0, Math.min(1 - w, cx - w / 2)), y: Math.max(0, Math.min(1 - w, cy - w / 2)) } } }, 'crop')
            }
            const cx = c.x + c.w / 2
            const cy = c.y + c.h / 2
            return (
              <>
                <label className="ed-slider"><span>{t('studio.zoom')}</span><input type="range" min={1} max={4} step={0.05} value={zoomV} onChange={(e) => setCrop(Number(e.target.value), cx, cy)} /></label>
                <label className="ed-slider"><span>↔</span><input type="range" min={0} max={1} step={0.01} value={cx} onChange={(e) => setCrop(zoomV, Number(e.target.value), cy)} /></label>
                <label className="ed-slider"><span>↕</span><input type="range" min={0} max={1} step={0.01} value={cy} onChange={(e) => setCrop(zoomV, cx, Number(e.target.value))} /></label>
              </>
            )
          })()}
          <Num label={t('studio.radius')} value={l.image.radius} onChange={(v) => P({ image: { ...l.image!, radius: Math.max(0, v) } }, 'radius')} />
          <label className="d-inline-check">
            <input type="checkbox" checked={Boolean(l.image.ring)} onChange={(e) => P({ image: { ...l.image!, ring: e.target.checked ? spec.direction?.palette.accent ?? '#c4ec62' : null } }, 'ring')} /> {t('studio.ring')}
          </label>
          {l.image.ring && <Color label={t('studio.color')} value={l.image.ring} onChange={(v) => P({ image: { ...l.image!, ring: v } }, 'ringc')} />}
        </section>
      )}
      {l.shape && (
        <section>
          <Color label={t('studio.fill')} value={l.shape.fill ?? '#ffffff'} onChange={(v) => P({ shape: { ...l.shape!, fill: v } }, 'fill')} />
          <div className="ed-row">
            <Color label={t('studio.stroke')} value={l.shape.stroke ?? '#000000'} onChange={(v) => P({ shape: { ...l.shape!, stroke: v, strokeWidth: l.shape!.strokeWidth || 4 } }, 'stroke')} />
            <Num label={t('studio.width')} value={l.shape.strokeWidth} onChange={(v) => P({ shape: { ...l.shape!, strokeWidth: Math.max(0, v) } }, 'sw')} />
          </div>
          {l.shape.type === 'rect' && <Num label={t('studio.radius')} value={l.shape.radius} onChange={(v) => P({ shape: { ...l.shape!, radius: Math.max(0, v) } }, 'r')} />}
        </section>
      )}
      {l.background && (
        <section>
          <Color label={t('studio.color')} value={l.background.color} onChange={(v) => P({ background: { ...l.background!, color: v, gradient: l.background!.gradient.length ? [v, l.background!.gradient[l.background!.gradient.length - 1]] : [] } }, 'bg')} />
          <label className="d-inline-check">
            <input type="checkbox" checked={l.background.gradient.length > 1} onChange={(e) => P({ background: { ...l.background!, gradient: e.target.checked ? [l.background!.color, '#000000'] : [] } }, 'grad')} /> {t('studio.gradient')}
          </label>
          {l.background.gradient.length > 1 && <Color label={t('studio.to')} value={l.background.gradient[1]} onChange={(v) => P({ background: { ...l.background!, gradient: [l.background!.gradient[0], v] } }, 'grad2')} />}
          {l.background.assetId && (
            <label className="d-inline-check">
              <input type="checkbox" checked onChange={() => P({ background: { ...l.background!, assetId: null } }, 'art')} /> {t('studio.art')}
            </label>
          )}
        </section>
      )}
      {l.kind !== 'background' && (
        <section className="ed-geo">
          <div className="ed-row">
            <Num label="X" value={l.x} onChange={(v) => P({ x: v }, 'x')} />
            <Num label="Y" value={l.y} onChange={(v) => P({ y: v }, 'y')} />
          </div>
          <div className="ed-row">
            <Num label={t('studio.w')} value={l.w} onChange={(v) => P({ w: Math.max(4, v) }, 'w')} />
            <Num label={t('studio.h')} value={l.h} onChange={(v) => P({ h: Math.max(4, v) }, 'h')} />
          </div>
          <div className="ed-row">
            <Num label={t('studio.rotate')} value={l.rotation} onChange={(v) => P({ rotation: v }, 'rot')} />
            <Num label={t('studio.opacity')} value={l.opacity} step={0.05} min={0} max={1} onChange={(v) => P({ opacity: Math.max(0, Math.min(1, v)) }, 'op')} />
          </div>
        </section>
      )}
    </div>
  )
}

function LayersPanel({ spec, selected, set, setSelected }: { spec: DesignSpec; selected: string[]; set: (s: DesignSpec) => void; setSelected: (ids: string[]) => void }) {
  const { t } = useT()
  const label = useLayerLabel()
  const list = [...spec.layers].reverse()
  const has = selected.length > 0
  return (
    <div className="ed-panel">
      <div className="ed-layer-actions">
        <button type="button" disabled={!has} onClick={() => set(reorder(spec, selected, 'top'))} title={t('studio.toFront')}><ChevronsUp size={15} /></button>
        <button type="button" disabled={!has} onClick={() => set(reorder(spec, selected, 'up'))} title={t('studio.forward')}><ArrowUp size={15} /></button>
        <button type="button" disabled={!has} onClick={() => set(reorder(spec, selected, 'down'))} title={t('studio.backward')}><ArrowDown size={15} /></button>
        <button type="button" disabled={!has} onClick={() => set(reorder(spec, selected, 'bottom'))} title={t('studio.toBack')}><ChevronsDown size={15} /></button>
        <button type="button" disabled={!has} onClick={() => { const r = duplicate(spec, selected); set(r.spec); setSelected(r.ids) }} title={t('studio.duplicate')}><Copy size={15} /></button>
        <button type="button" disabled={selected.length < 2} onClick={() => set(group(spec, selected))} title={t('studio.group')}><GroupIcon size={15} /></button>
        <button type="button" disabled={!has} onClick={() => set(ungroup(spec, selected))} title={t('studio.ungroup')}><Ungroup size={15} /></button>
        <button
          type="button"
          disabled={!has}
          onClick={async () => {
            if (await confirmAction({ title: t('studio.deleteTitle', { n: selected.length }), danger: true, confirmLabel: t('cf.remove') })) {
              set(removeLayers(spec, selected))
              setSelected([])
            }
          }}
          title={t('studio.delete')}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <ul className="ed-layers">
        {list.map((l) => (
          <li key={l.id} className={`${selected.includes(l.id) ? 'is-sel' : ''} ${l.group ? 'is-grouped' : ''}`}>
            <button type="button" className="ed-layer-name" onClick={(e) => setSelected(e.shiftKey || e.metaKey ? [...selected, l.id] : withGroups(spec, [l.id]))}>
              {l.kind === 'text' ? <Type size={13} /> : l.kind === 'image' ? <ImagePlus size={13} /> : l.kind === 'background' ? <Wand2 size={13} /> : <Square size={13} />}
              <span>{label(l)}</span>
            </button>
            <button type="button" onClick={() => set({ ...spec, layers: spec.layers.map((x) => (x.id === l.id ? { ...x, visible: !x.visible } : x)) })} aria-label={l.visible ? t('studio.hide') : t('studio.show')}>
              {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button type="button" onClick={() => set({ ...spec, layers: spec.layers.map((x) => (x.id === l.id ? { ...x, locked: !x.locked } : x)) })} aria-label={l.locked ? t('studio.unlock') : t('studio.lock')}>
              {l.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AiPanel({ id, live, left, flush, onDone, onLocalRelayout }: { id: string; live: boolean; left: number; flush: () => Promise<number>; onDone: () => Promise<void>; onLocalRelayout: () => void }) {
  const { t } = useT()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const examples = t('studio.ai.examples').split('|')
  const send = async (instruction: string) => {
    if (!instruction.trim() || !live) return
    setBusy(true)
    setMsg('')
    try {
      const baseVersion = await flush()
      await api(`/studio/designs/${id}/ai`, { instruction, baseVersion })
      // wait for the agents
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const d = await api<{ status: string; progress: { message: string }[]; error: string | null }>(`/studio/designs/${id}`)
        if (d.status === 'ready' || d.status === 'failed') {
          setMsg(d.status === 'failed' ? d.error ?? t('studio.ai.failed') : d.progress[d.progress.length - 1]?.message ?? '')
          if (d.status === 'ready') await onDone()
          break
        }
      }
      setText('')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ed-panel ed-ai">
      <p className="d-muted">{t('studio.ai.intro')}</p>
      {!live && <p className="ed-warn">{t('studio.ai.demo')}</p>}
      <textarea className="ed-textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('studio.ai.placeholder')} disabled={busy} onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send(text)} />
      <button type="button" className="d-btn d-btn-ink" disabled={busy || !text.trim() || !live || left <= 0} onClick={() => send(text)}>
        {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} {busy ? t('studio.ai.working') : t('studio.ai.send')}
      </button>
      <small className="d-muted">{t('studio.ai.left', { n: left })}</small>
      {msg && <p className="ed-ai-reply">{msg}</p>}
      <div className="ed-chips">
        {examples.map((x) => (
          <button key={x} type="button" disabled={busy || !live} onClick={() => setText(x)}>
            {x}
          </button>
        ))}
      </div>
      <hr />
      <p className="d-muted">{t('studio.ai.freeHint')}</p>
      <button type="button" className="d-btn" onClick={onLocalRelayout}>
        <Wand2 size={14} /> {t('studio.ai.relayout')}
      </button>
    </div>
  )
}

function Versions({ id, onClose, onRestored }: { id: string; onClose: () => void; onRestored: () => Promise<void> }) {
  const { t } = useT()
  const [list, setList] = useState<{ version: number; agent: string; note: string; created_at: string }[] | null>(null)
  useEffect(() => {
    api<{ versions: typeof list }>(`/studio/designs/${id}/versions`).then((r) => setList(r.versions), () => setList([]))
  }, [id])
  return (
    <div className="ed-drawer" role="dialog" aria-label={t('studio.versions')}>
      <header>
        <h3>{t('studio.versions')}</h3>
        <button type="button" className="ed-icon" onClick={onClose} aria-label={t('common.close')}>×</button>
      </header>
      {!list ? (
        <Loader2 className="spin" />
      ) : (
        <ul>
          {list.map((v) => (
            <li key={v.version}>
              <div>
                <b>v{v.version}</b> · {t(`studio.agents.${v.agent}`, {}) || v.agent}
                <small>{new Date(v.created_at).toLocaleString()}</small>
                <span>{v.note}</span>
              </div>
              <button
                type="button"
                className="d-btn"
                onClick={async () => {
                  if (!(await confirmAction({ title: t('studio.restoreTitle', { v: v.version }) }))) return
                  await api(`/studio/designs/${id}/restore`, { version: v.version })
                  onClose()
                  await onRestored()
                }}
              >
                {t('studio.restore')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link to="#" onClick={(e) => (e.preventDefault(), onClose())} className="d-link">{t('common.close')}</Link>
    </div>
  )
}
