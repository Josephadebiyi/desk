/**
 * Design Studio API (editable designs).
 *   POST   /api/studio/assets              upload a logo / portrait / reference / font (data URL) → asset
 *   GET    /api/studio/assets?kind=        the church's asset library (signed URLs)
 *   POST   /api/studio/designs             start an AI design (uses one AI flyer from the plan's monthly allowance)
 *   POST   /api/studio/designs/blank       start an empty design to edit by hand (no AI, free)
 *   GET    /api/studio/designs             recent designs
 *   GET    /api/studio/designs/:id         spec, status, progress, signed asset URLs, AI cost so far
 *   PUT    /api/studio/designs/:id         save a manual edit (autosave) — no AI; rejects stale versions (409)
 *   POST   /api/studio/designs/:id/ai      AI-assisted change in words ("make the headline bigger")
 *   GET    /api/studio/designs/:id/versions · POST …/restore {version}
 *   POST   /api/studio/designs/:id/approve save as approved: learns the church's preferences, adds it to references
 *   DELETE /api/studio/designs/:id
 * Manual editing happens entirely in the browser; only /designs (create) and /ai call Claude.
 */
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { db, HttpError, requireCaller, route } from '../db'
import { DesignSpec, FORMATS, Mode, newSpec, type Asset, type Content, type Format } from '../../src/design/spec'
import { BUCKET, assetRows, saveUpload, signedUrls, toAsset } from '../design/assets'
import { cleanArt, aiReady } from '../design/agents'
import { commit, enqueue, startDesignWorker } from '../design/orchestrator'
import { usage } from './design'

export const studioRoutes = Router()
const staff = requireCaller(['admin', 'leader'])
const MAX_AI_EDITS = 25 // AI-assisted changes per design (manual edits are unlimited)
const LANG_NAME: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese' }
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null)

startDesignWorker()

async function designOf(id: string, churchId: string) {
  const { data } = await db().from('designs_v2').select('*').eq('id', id).maybeSingle()
  if (!data || data.church_id !== churchId) throw new HttpError(404, 'Design not found')
  return data
}

/** Signed URLs for every uploaded asset in a spec (the browser editor draws them). */
async function urlsFor(spec: DesignSpec, previewPath?: string | null) {
  const paths = Object.values(spec.assets).map((a) => a.path ?? '')
  const signed = await signedUrls(previewPath ? [...paths, previewPath] : paths)
  return { assets: Object.fromEntries(Object.values(spec.assets).filter((a) => a.path && signed[a.path]).map((a) => [a.id, signed[a.path!]])), preview: previewPath ? signed[previewPath] ?? null : null }
}

studioRoutes.post(
  '/studio/assets',
  staff,
  route(async (req, res) => {
    const kind = ['logo', 'portrait', 'reference', 'decor', 'font'].includes(req.body?.kind) ? req.body.kind : 'portrait'
    const row = await saveUpload(req.caller!.churchId, { dataUrl: String(req.body?.dataUrl ?? ''), kind, name: req.body?.name, cutout: req.body?.cutout === true })
    const urls = await signedUrls([row.path])
    res.json({ asset: toAsset(row as never), url: urls[row.path] ?? null })
  }),
)

studioRoutes.get(
  '/studio/assets',
  staff,
  route(async (req, res) => {
    let q = db().from('design_assets').select('id, kind, path, mime, width, height, cutout, name, created_at').eq('church_id', req.caller!.churchId).order('created_at', { ascending: false }).limit(60)
    if (typeof req.query.kind === 'string') q = q.eq('kind', req.query.kind)
    const { data } = await q
    const urls = await signedUrls((data ?? []).map((d) => d.path))
    res.json({ assets: (data ?? []).map((d) => ({ ...toAsset({ ...d, church_id: req.caller!.churchId } as never), name: d.name, url: urls[d.path] ?? null })) })
  }),
)

/** The church's logo as a design asset (copied once from Settings → Church profile into the private bucket). */
async function churchLogoAsset(churchId: string): Promise<Asset | null> {
  const { data: c } = await db().from('churches').select('logo_url').eq('id', churchId).single()
  if (!c?.logo_url) return null
  const { data: existing } = await db().from('design_assets').select('id, church_id, kind, path, mime, width, height, cutout').eq('church_id', churchId).eq('kind', 'logo').eq('name', c.logo_url.slice(0, 120)).maybeSingle()
  if (existing) return toAsset(existing as never)
  try {
    const r = await fetch(c.logo_url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    const row = await saveUpload(churchId, { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, kind: 'logo', name: c.logo_url.slice(0, 120) })
    return toAsset(row as never)
  } catch {
    return null
  }
}

studioRoutes.post(
  '/studio/designs',
  staff,
  route(async (req, res) => {
    const churchId = req.caller!.churchId
    if (!aiReady()) throw new HttpError(503, 'AI design needs ANTHROPIC_API_KEY on the server. You can still start a blank design and edit it by hand.')
    const u = await usage(churchId)
    if (u.limit !== null && u.used >= u.limit) throw new HttpError(429, `LIMIT:${u.used}:${u.limit}`)
    const b = req.body ?? {}
    const format = (Object.keys(FORMATS).includes(b.format) ? b.format : 'portrait') as Format
    const mode = Mode.safeParse(b.mode).success ? (b.mode as Mode) : 'original'
    const refIds: string[] = (Array.isArray(b.references) ? b.references : []).map(uuid).filter(Boolean).slice(0, 4)
    const speakersIn = (Array.isArray(b.speakers) ? b.speakers : []).slice(0, 8)
    const photoIds = speakersIn.map((s: { photoAssetId?: unknown }) => uuid(s?.photoAssetId)).filter(Boolean) as string[]
    // Quick mode: photos without names (the AI matches them to the people in the description)
    const looseIds: string[] = (Array.isArray(b.photos) ? b.photos : []).map(uuid).filter(Boolean).slice(0, 8)
    const rows = await assetRows(churchId, [...refIds, ...photoIds, ...looseIds])
    const owned = new Set(rows.map((r) => r.id))
    const content: Content = {
      title: str(b.content?.title, 140),
      subtitle: str(b.content?.subtitle, 200),
      tagline: str(b.content?.tagline, 160),
      date: str(b.content?.date, 80),
      time: str(b.content?.time, 80),
      venue: str(b.content?.venue, 160),
      host: str(b.content?.host, 120),
      scripture: str(b.content?.scripture, 220),
      contact: str(b.content?.contact, 160),
      cta: str(b.content?.cta, 80),
      speakers: speakersIn
        .filter((s: { name?: unknown }) => str(s?.name, 80))
        .map((s: { name?: unknown; role?: unknown; photoAssetId?: unknown }, i: number) => ({ id: `s${i}`, name: str(s.name, 80), role: str(s.role, 80), photoAssetId: owned.has(String(s.photoAssetId)) ? String(s.photoAssetId) : null })),
    }
    const brief = str(b.brief, 3000)
    if (!brief && !content.title) throw new HttpError(400, 'Describe the design or give it a title.')
    const { data: church } = await db().from('churches').select('name').eq('id', churchId).single()
    const logo = b.logo === false ? null : await churchLogoAsset(churchId)
    const id = randomUUID()
    const spec = newSpec({ id, format, mode, language: LANG_NAME[str(b.language, 5)] ?? 'English', brief, content: { ...content, host: content.host || (b.showChurch === false ? '' : church?.name ?? '') }, churchName: church?.name ?? '', logoAssetId: logo?.id ?? null, references: refIds.filter((r) => owned.has(r)) })
    for (const r of rows) spec.assets[r.id] = toAsset(r)
    if (logo) spec.assets[logo.id] = logo
    if (spec.references.length && mode !== 'original') spec.primaryReference = Math.min(Math.max(0, Number(b.primaryReference) || 0), spec.references.length - 1)
    if (['circle', 'rounded', 'cutout', 'rect'].includes(b.photoStyle)) spec.direction = { concept: '', mood: [], palette: { background: '#14102b', surface: '#241c4d', primary: '#ffffff', accent: '#c4ec62', text: '#ffffff', muted: '#c9c3e6' }, archetype: b.photoStyle === 'cutout' && content.speakers.length === 1 ? 'hero-portrait' : 'stacked', speakerShape: b.photoStyle, backgroundBrief: '', titleCase: 'upper', notes: '' }
    spec.unassignedPhotos = looseIds.filter((x) => owned.has(x))
    const valid = DesignSpec.parse(spec)
    const { error } = await db().from('designs_v2').insert({ id, church_id: churchId, created_by: req.caller!.userId, title: content.title || brief.slice(0, 80), format, mode, status: 'queued', spec: valid, version: 0 })
    if (error) throw new HttpError(500, error.code === '42P01' ? 'The Design Studio needs a database update (migration 0020).' : 'Could not start the design.')
    await db().from('design_versions').insert({ design_id: id, version: 0, agent: 'user', note: 'Brief received', spec: valid })
    // Counts as one AI flyer this month (same allowance as before).
    await db().from('ai_usage').insert({ church_id: churchId, user_id: req.caller!.userId, feature: 'designs', units: 1, provider: 'claude', model: 'design-studio', est_cost_usd: 0 })
    enqueue(id)
    res.json({ id, used: u.used + 1, limit: u.limit })
  }),
)

studioRoutes.post(
  '/studio/designs/blank',
  staff,
  route(async (req, res) => {
    const churchId = req.caller!.churchId
    const format = (Object.keys(FORMATS).includes(req.body?.format) ? req.body.format : 'portrait') as Format
    const id = randomUUID()
    const { data: church } = await db().from('churches').select('name').eq('id', churchId).single()
    const spec = newSpec({ id, format, mode: 'original', language: 'English', brief: '', content: { title: str(req.body?.title, 140) || 'Untitled design', subtitle: '', tagline: '', date: '', time: '', venue: '', host: '', scripture: '', contact: '', cta: '', speakers: [] }, churchName: church?.name ?? '', logoAssetId: null, references: [] })
    const { w, h } = spec.canvas
    spec.layers = [{ id: 'l-background', role: 'background', kind: 'background', x: 0, y: 0, w, h, rotation: 0, opacity: 1, visible: true, name: 'Background', group: null, locked: false, pinned: false, text: null, image: null, shape: null, background: { assetId: null, color: '#ffffff', gradient: [] } }]
    const valid = DesignSpec.parse(spec)
    const { error } = await db().from('designs_v2').insert({ id, church_id: churchId, created_by: req.caller!.userId, title: valid.content.title, format, mode: 'original', status: 'ready', stage: 'done', spec: valid, version: 0 })
    if (error) throw new HttpError(500, error.code === '42P01' ? 'The Design Studio needs a database update (migration 0020).' : 'Could not create the design.')
    res.json({ id })
  }),
)

studioRoutes.get(
  '/studio/designs',
  staff,
  route(async (req, res) => {
    const { data, error } = await db().from('designs_v2').select('id, title, format, status, stage, preview_path, version, approved_at, updated_at').eq('church_id', req.caller!.churchId).order('updated_at', { ascending: false }).limit(40)
    if (error) return res.json({ designs: [], ready: false })
    const urls = await signedUrls((data ?? []).map((d) => d.preview_path ?? ''))
    res.json({ ready: true, designs: (data ?? []).map((d) => ({ ...d, preview: d.preview_path ? urls[d.preview_path] ?? null : null })) })
  }),
)

studioRoutes.get(
  '/studio/designs/:id',
  staff,
  route(async (req, res) => {
    const d = await designOf(String(req.params.id), req.caller!.churchId)
    const spec = DesignSpec.parse(d.spec)
    const [{ data: runs }, urls] = await Promise.all([db().from('design_agent_runs').select('cost_usd').eq('design_id', d.id), urlsFor(spec, d.preview_path)])
    res.json({
      id: d.id,
      title: d.title,
      status: d.status,
      stage: d.stage,
      progress: d.progress,
      error: d.error,
      version: d.version,
      approved: Boolean(d.approved_at),
      aiEditsLeft: Math.max(0, MAX_AI_EDITS - d.ai_rounds),
      cost: (runs ?? []).reduce((s, r) => s + Number(r.cost_usd), 0),
      spec,
      urls,
    })
  }),
)

/** A manual save from the editor. Only the church's own assets may be referenced; background art is re-sanitised. */
studioRoutes.put(
  '/studio/designs/:id',
  staff,
  route(async (req, res) => {
    const churchId = req.caller!.churchId
    const d = await designOf(String(req.params.id), churchId)
    if (d.status === 'running' || d.status === 'queued') throw new HttpError(409, 'The AI is still working on this design. Your edit wasn’t saved — try again when it’s finished.')
    if (Number(req.body?.baseVersion) !== d.version) throw new HttpError(409, 'STALE')
    const parsed = DesignSpec.safeParse({ ...req.body?.spec, id: d.id, version: d.version })
    if (!parsed.success) throw new HttpError(400, 'That design couldn’t be saved (invalid layers).')
    const spec = parsed.data
    for (const a of Object.values(spec.assets)) {
      if (a.path && !a.path.startsWith(`${churchId}/`)) throw new HttpError(403, 'That image belongs to another church.')
      if (a.svg) a.svg = cleanArt(a.svg)
    }
    if (JSON.stringify(spec).length > 3_000_000) throw new HttpError(413, 'This design is too large to save.')
    const next = await commit(d.id, spec, 'user', str(req.body?.note, 120) || 'Edited by hand', { title: spec.content.title.slice(0, 160) })
    // Optional thumbnail from the browser (the exact PNG the editor exported).
    const png = /^data:image\/png;base64,(.+)$/.exec(String(req.body?.preview ?? ''))
    if (png && png[1].length < 8_000_000) {
      const path = `${churchId}/renders/${d.id}.png`
      await db().storage.from(BUCKET).upload(path, Buffer.from(png[1], 'base64'), { contentType: 'image/png', upsert: true })
      await db().from('designs_v2').update({ preview_path: path }).eq('id', d.id)
    }
    res.json({ version: next.version })
  }),
)

studioRoutes.post(
  '/studio/designs/:id/ai',
  staff,
  route(async (req, res) => {
    const d = await designOf(String(req.params.id), req.caller!.churchId)
    if (!aiReady()) throw new HttpError(503, 'AI edits need ANTHROPIC_API_KEY on the server.')
    const instruction = str(req.body?.instruction, 600)
    if (!instruction) throw new HttpError(400, 'Say what you’d like to change.')
    if (d.status === 'running' || d.status === 'queued') throw new HttpError(409, 'The AI is already working on this design.')
    if (d.ai_rounds >= MAX_AI_EDITS + 1) throw new HttpError(429, `This design has used its ${MAX_AI_EDITS} AI changes. Keep editing by hand, or start a new design.`)
    if (Number(req.body?.baseVersion) !== d.version) throw new HttpError(409, 'STALE')
    await db().from('designs_v2').update({ status: 'queued', stage: 'queued', pending_instruction: instruction, error: null }).eq('id', d.id)
    await db().from('ai_usage').insert({ church_id: d.church_id, user_id: req.caller!.userId, feature: 'requests', units: 1, provider: 'claude', model: 'design-studio-edit', est_cost_usd: 0 })
    enqueue(d.id)
    res.json({ ok: true })
  }),
)

studioRoutes.get(
  '/studio/designs/:id/versions',
  staff,
  route(async (req, res) => {
    const d = await designOf(String(req.params.id), req.caller!.churchId)
    const { data } = await db().from('design_versions').select('version, agent, note, created_at').eq('design_id', d.id).order('version', { ascending: false }).limit(100)
    res.json({ versions: data ?? [] })
  }),
)

studioRoutes.post(
  '/studio/designs/:id/restore',
  staff,
  route(async (req, res) => {
    const d = await designOf(String(req.params.id), req.caller!.churchId)
    if (d.status === 'running' || d.status === 'queued') throw new HttpError(409, 'The AI is still working on this design.')
    const { data: v } = await db().from('design_versions').select('spec, version').eq('design_id', d.id).eq('version', Number(req.body?.version)).maybeSingle()
    if (!v) throw new HttpError(404, 'Version not found')
    const old = DesignSpec.parse(v.spec)
    const next = await commit(d.id, { ...old, version: d.version, history: DesignSpec.parse(d.spec).history }, 'restore', `Restored version ${v.version}`)
    res.json({ version: next.version, spec: next })
  }),
)

studioRoutes.post(
  '/studio/designs/:id/approve',
  staff,
  route(async (req, res) => {
    const churchId = req.caller!.churchId
    const d = await designOf(String(req.params.id), churchId)
    const spec = DesignSpec.parse(d.spec)
    await db().from('designs_v2').update({ approved_at: new Date().toISOString() }).eq('id', d.id)
    // Preference learning: count what this church approves (fonts, colours, layout, mood) — used by the director.
    const { data: p } = await db().from('design_preferences').select('*').eq('church_id', churchId).maybeSingle()
    const bump = (o: Record<string, number> | undefined, keys: string[]) => {
      const out = { ...(o ?? {}) }
      for (const k of keys.filter(Boolean)) out[k] = (out[k] ?? 0) + 1
      return out
    }
    const ty = spec.typography
    const dir = spec.direction
    await db()
      .from('design_preferences')
      .upsert({
        church_id: churchId,
        fonts: bump(p?.fonts, ty ? [ty.display.family, ty.body.family] : []),
        colors: bump(p?.colors, dir ? [dir.palette.background, dir.palette.accent] : []),
        archetypes: bump(p?.archetypes, dir ? [dir.archetype] : []),
        moods: bump(p?.moods, dir?.mood ?? []),
        updated_at: new Date().toISOString(),
      })
    // The approved design joins the church's reference library (for "make it like our last one").
    if (d.preview_path && req.body?.asReference !== false) {
      const path = `${churchId}/reference/${d.id}.png`
      await db().storage.from(BUCKET).copy(d.preview_path, path).catch(() => undefined)
      await db()
        .from('design_assets')
        .upsert({ id: d.id, church_id: churchId, kind: 'reference', path, mime: 'image/png', width: spec.canvas.w, height: spec.canvas.h, name: `Approved: ${spec.content.title}`.slice(0, 120) })
        .then(
          () => undefined,
          () => undefined,
        )
    }
    res.json({ ok: true })
  }),
)

studioRoutes.delete(
  '/studio/designs/:id',
  staff,
  route(async (req, res) => {
    const d = await designOf(String(req.params.id), req.caller!.churchId)
    await db().from('designs_v2').delete().eq('id', d.id)
    if (d.preview_path) await db().storage.from(BUCKET).remove([d.preview_path]).catch(() => undefined)
    res.json({ ok: true })
  }),
)
