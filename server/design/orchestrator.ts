/**
 * Design Orchestrator — runs the agents in order, in parallel where they don't depend on each other, and is the
 * only code that writes the DesignSpec (commit(): validate → bump version → store the version → save).
 *
 *   generate:  references (parallel) → Creative Director → Typography ‖ Image → Layout → render → QC loop → ready
 *   edit:      Creative Director (edit mode) → targeted ops → only the agents the ops need → relayout if needed
 *              → render → automatic checks → ready
 * Jobs live in designs_v2 (status queued / running): a worker in this process picks them up, keeps a heartbeat,
 * and resumes anything left running by a restart. Correction loops are capped to keep API usage predictable.
 * Without ANTHROPIC_API_KEY the pipeline still runs with ZionDesk's default direction and type (no AI).
 */
import { applyOps, type EditOp } from '../../src/design/edits'
import { fontKey } from '../../src/design/fonts'
import { fitText } from '../../src/design/text'
import { defaultDirection, defaultTypography, layoutSpec } from '../../src/design/layout'
import { qcPassed, runQc } from '../../src/design/qc'
import { DesignSpec, type Asset, type QcIssue } from '../../src/design/spec'
import { mostReadable } from '../../src/design/color'
import { db } from '../db'
import { AgentError, aiReady, analyseReference, chooseTypography, paintBackground, planDesign, planEdit, reviewDesign, type RunCtx } from './agents'
import { dataUri, hrefResolver, savePng } from './assets'
import { renderSpec, specFonts } from './raster'

const MAX_FIX_ROUNDS = 2 // automatic correction rounds after the first render
const STALE_MS = 3 * 60_000
const CONCURRENCY = 2

type Row = { id: string; church_id: string; status: string; spec: unknown; version: number; pending_instruction: string | null; ai_rounds: number }

async function load(id: string) {
  const { data, error } = await db().from('designs_v2').select('id, church_id, status, spec, version, pending_instruction, ai_rounds').eq('id', id).single()
  if (error || !data) throw new Error(`design ${id} not found`)
  return { row: data as Row, spec: DesignSpec.parse(data.spec) }
}

/** The one place a spec is written: validated against the schema, versioned, history kept. */
export async function commit(id: string, spec: DesignSpec, agent: string, note: string, extra: Record<string, unknown> = {}) {
  const next = DesignSpec.parse({ ...spec, version: spec.version + 1, history: [...spec.history, { version: spec.version + 1, agent, at: new Date().toISOString(), note: note.slice(0, 300) }].slice(-200) })
  const { error } = await db().from('design_versions').insert({ design_id: id, version: next.version, agent, note: note.slice(0, 300), spec: next })
  if (error) throw new Error(`could not save version: ${error.message}`)
  await db().from('designs_v2').update({ spec: next, version: next.version, updated_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), ...extra }).eq('id', id)
  return next
}

async function progress(id: string, agent: string, message: string) {
  const { data } = await db().from('designs_v2').select('progress').eq('id', id).single()
  const list = [...((data?.progress as unknown[]) ?? []), { at: new Date().toISOString(), agent, message }].slice(-40)
  await db().from('designs_v2').update({ stage: agent, progress: list, heartbeat_at: new Date().toISOString() }).eq('id', id)
}

async function preferences(churchId: string) {
  const { data } = await db().from('design_preferences').select('fonts, colors, archetypes, moods').eq('church_id', churchId).maybeSingle()
  if (!data) return { text: '', fonts: [] as string[] }
  const top = (o: Record<string, number>, n: number) =>
    Object.entries(o ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k)
  const fonts = top(data.fonts as Record<string, number>, 4)
  const text = [fonts.length && `fonts ${fonts.join(', ')}`, top(data.colors as Record<string, number>, 5).length && `colours ${top(data.colors as Record<string, number>, 5).join(', ')}`, top(data.archetypes as Record<string, number>, 2).length && `layouts ${top(data.archetypes as Record<string, number>, 2).join(', ')}`, top(data.moods as Record<string, number>, 4).length && `moods ${top(data.moods as Record<string, number>, 4).join(', ')}`].filter(Boolean).join('; ')
  return { text, fonts }
}

const b64 = (uri: string | null) => {
  const m = uri && /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(uri)
  return m ? { media: m[1] as 'image/png', data: m[2] } : null
}

/** Deterministic fixes for what the checker found (no AI): shrink what overflows, fix unreadable colours. */
function autoFixOps(spec: DesignSpec, issues: QcIssue[]): EditOp[] {
  const ops: EditOp[] = []
  const op = (o: Partial<EditOp> & Pick<EditOp, 'op'>): EditOp => ({ target: '', value: '', amount: 0, x: 0, y: 0, ...o })
  for (const i of issues) {
    const l = spec.layers.find((x) => x.id === i.layerId)
    if (!l) continue
    if (i.code === 'overflow' && i.severity === 'error' && l.text) ops.push(op({ op: 'scale_text', target: l.role, amount: 0.85 }))
    if (i.code === 'contrast' && l.text) {
      const bg = spec.direction?.palette.background ?? '#000000'
      ops.push(op({ op: 'set_layer_color', target: l.role, value: mostReadable(bg, ['#ffffff', '#111015', spec.direction?.palette.accent ?? '#ffffff']) }))
    }
  }
  return ops
}

/** Lay out, render, check, correct (capped), store the preview. Returns the final spec. */
async function renderAndCheck(id: string, churchId: string, spec: DesignSpec, opts: { relayout: boolean; visual: boolean; ctx: RunCtx }) {
  let s = spec
  if (opts.relayout) {
    await progress(id, 'layout', 'Placing every element on the grid')
    s = { ...s, layers: layoutSpec(s, await specFonts(s)) }
    s = await commit(id, s, 'layout', 'Calculated positions and sizes')
  }
  const href = await hrefResolver(s.assets)
  let visual: { score: number; notes: string } | null = null
  let rounds = 0
  for (;;) {
    await progress(id, 'qc', rounds ? `Checking the corrections (round ${rounds})` : 'Checking the rendered design')
    // re-fit text after edits (layout fits on relayout; ops clear `fitted` on what they touch)
    if (s.layers.some((l) => l.text && !l.text.fitted)) s = { ...s, layers: refit(s, await specFonts(s)) }
    const r = await renderSpec(s, href)
    const issues = runQc(s, { sample: r.sample })
    let ops = autoFixOps(s, issues)
    // One visual review per job (after the automatic fixes have had a chance) — the expensive, subjective pass.
    if (opts.visual && !visual && aiReady() && (qcPassed(issues) || rounds >= MAX_FIX_ROUNDS - 1)) {
      try {
        const ref = s.primaryReference !== null ? s.assets[s.references[s.primaryReference]?.assetId ?? ''] : undefined
        const rv = await reviewDesign(opts.ctx, { png: r.png, roles: [...new Set(s.layers.map((l) => l.role))], issues: issues.map((i) => `${i.code}: ${i.message}`), mode: s.mode, reference: ref ? b64(await dataUri(ref)) : null })
        visual = { score: rv.score, notes: rv.notes }
        if (!rv.approved) ops = [...ops, ...rv.ops]
      } catch (e) {
        console.error('[design] visual review skipped:', e instanceof Error ? e.message : e)
      }
    }
    const done = !ops.length || rounds >= MAX_FIX_ROUNDS
    if (done) {
      const path = await savePng(churchId, id, r.png)
      return commit(id, { ...s, qc: { at: new Date().toISOString(), passed: qcPassed(issues), issues, visual, rounds } }, 'qc', qcPassed(issues) ? `Approved${visual ? ` (${visual.score}/10)` : ''}` : `${issues.filter((i) => i.severity === 'error').length} problem(s) left for you to review`, { preview_path: path })
    }
    rounds++
    const res = applyOps(s, ops)
    s = res.spec
    if (res.relayout) s = { ...s, layers: layoutSpec(s, await specFonts(s)) }
    s = await commit(id, s, 'qc', `Correction round ${rounds}: ${ops.map((o) => `${o.op} ${o.target}`.trim()).join(', ')}`)
  }
}

/** Fits text layers whose fit was cleared by an edit (others keep theirs). */
function refit(s: DesignSpec, fonts: Awaited<ReturnType<typeof specFonts>>) {
  return s.layers.map((l) => {
    const f = l.text && !l.text.fitted ? fonts.get(fontKey(l.text.font, l.text.weight)) : undefined
    return f ? { ...l, text: { ...l.text!, fitted: fitText(f, l.text!, l.w, l.h) } } : l
  })
}

/* ───────────────────────── generate ───────────────────────── */

async function generate(id: string) {
  let { row, spec } = await load(id)
  const ctx: RunCtx = { designId: id, churchId: row.church_id }
  const ai = aiReady()

  // 1. References (independent of each other → in parallel).
  const todo = spec.references.map((r, i) => ({ r, i })).filter((x) => !x.r.analysis)
  if (ai && todo.length) {
    await progress(id, 'reference', `Studying ${todo.length} reference${todo.length > 1 ? 's' : ''}`)
    const results = await Promise.allSettled(
      todo.map(async ({ r, i }) => {
        const a = spec.assets[r.assetId]
        const img = a && b64(await dataUri(a))
        if (!img) throw new Error('reference image missing')
        return { i, analysis: await analyseReference(ctx, { ...img, w: a.w, h: a.h }) }
      }),
    )
    const refs = structuredClone(spec.references)
    for (const res of results) if (res.status === 'fulfilled') refs[res.value.i].analysis = res.value.analysis
    spec = await commit(id, { ...spec, references: refs }, 'reference', `Analysed ${results.filter((x) => x.status === 'fulfilled').length} of ${todo.length} reference(s)`)
  }
  if (spec.mode !== 'original' && spec.primaryReference === null && spec.references.some((r) => r.analysis)) spec = { ...spec, primaryReference: spec.references.findIndex((r) => r.analysis) }

  // 2. Creative Director: content (validated against the brief) + direction.
  const prefs = await preferences(row.church_id)
  const primary = spec.primaryReference !== null ? spec.references[spec.primaryReference]?.analysis ?? null : null
  if (ai) {
    await progress(id, 'director', 'Planning the concept')
    const plan = await planDesign(ctx, {
      brief: spec.brief,
      content: spec.content,
      mode: spec.mode,
      format: spec.canvas.format,
      churchName: spec.brand.churchName,
      brandColors: spec.brand.colors,
      references: spec.references.map((r) => r.analysis),
      primaryReference: spec.primaryReference,
      preferences: prefs.text,
      hasLogo: Boolean(spec.brand.logoAssetId),
      speakerPhotos: spec.content.speakers.filter((s) => s.photoAssetId).length + spec.unassignedPhotos.length,
      photoStyle: spec.direction?.speakerShape ?? null,
    })
    // Quick mode: give the loose photos to the people found in the brief, in order; extra photos appear without a name.
    if (spec.unassignedPhotos.length) {
      const free = [...spec.unassignedPhotos]
      const speakers = plan.content.speakers.map((s) => (s.photoAssetId || !free.length ? s : { ...s, photoAssetId: free.shift()! }))
      for (const p of free) speakers.push({ id: `s${speakers.length}`, name: '', role: '', photoAssetId: p })
      plan.content = { ...plan.content, speakers: speakers.slice(0, 8) }
      spec = { ...spec, unassignedPhotos: [] }
    }
    // The user's chosen photo style wins over the director's.
    const direction = spec.direction?.speakerShape ? { ...plan.direction, speakerShape: spec.direction.speakerShape } : plan.direction
    spec = await commit(id, { ...spec, content: plan.content, direction }, 'director', direction.concept)
  } else spec = await commit(id, { ...spec, direction: spec.direction ?? defaultDirection(), typography: defaultTypography(spec.canvas.w, spec.canvas.h) }, 'director', 'Default ZionDesk direction (AI not configured)')

  // 3. Typography ‖ background art — independent, so they run at the same time.
  if (ai) {
    await progress(id, 'typography', 'Choosing type and painting the background')
    const dir = spec.direction!
    const [ty, art] = await Promise.allSettled([
      chooseTypography(ctx, { direction: dir, title: spec.content.title, reference: primary, mode: spec.mode, preferredFonts: prefs.fonts, short: Math.min(spec.canvas.w, spec.canvas.h) }),
      paintBackground(ctx, { w: spec.canvas.w, h: spec.canvas.h, brief: dir.backgroundBrief, palette: dir.palette, mood: dir.mood, calm: calmZones(spec), reference: primary }),
    ])
    const assets = { ...spec.assets }
    for (const [k, a] of Object.entries(assets)) if (a.kind === 'background') delete assets[k]
    if (art.status === 'fulfilled') assets['bg-art'] = { id: 'bg-art', kind: 'background', path: null, svg: art.value.svg, mime: 'image/svg+xml', w: spec.canvas.w, h: spec.canvas.h, cutout: false, tone: null }
    spec = await commit(id, { ...spec, typography: ty.status === 'fulfilled' ? ty.value : spec.typography ?? defaultTypography(spec.canvas.w, spec.canvas.h), assets }, 'typography', [ty.status === 'fulfilled' ? `Type: ${ty.value.display.family} / ${ty.value.body.family}` : 'Default type (typography agent failed)', art.status === 'fulfilled' ? 'background painted' : 'gradient background (image agent failed)'].join(' · '))
  }

  // 4–5. Layout, render, check, correct.
  await renderAndCheck(id, row.church_id, spec, { relayout: true, visual: true, ctx })
  row = (await load(id)).row
  await db().from('designs_v2').update({ status: 'ready', stage: 'done', error: null, ai_rounds: row.ai_rounds + (ai ? 1 : 0) }).eq('id', id)
  await progress(id, 'done', 'Your design is ready')
}

/** Where text will go, in words, so the background keeps those areas calm. */
function calmZones(spec: DesignSpec) {
  const a = spec.direction?.archetype ?? 'stacked'
  if (a === 'split' || a === 'hero-portrait') return 'the left 55% (text column); the right side can be richer'
  return 'the centre band from 15% to 55% of the height (headline), and the bottom 20% (details)'
}

/* ───────────────────────── conversational edit ───────────────────────── */

async function edit(id: string, instruction: string) {
  let { row, spec } = await load(id)
  const ctx: RunCtx = { designId: id, churchId: row.church_id }
  if (!aiReady()) throw new AgentError('editor', 'AI edits need ANTHROPIC_API_KEY on the server.')
  await progress(id, 'director', 'Reading your request')
  const plan = await planEdit(ctx, { instruction, spec })
  const res = applyOps(spec, plan.ops)
  spec = res.spec
  if (res.needs.includes('director')) {
    await progress(id, 'director', 'Re-planning the look')
    const p = await planDesign(ctx, {
      brief: `${spec.brief}\n\nChange request: ${instruction}`,
      content: spec.content,
      mode: spec.mode,
      format: spec.canvas.format,
      churchName: spec.brand.churchName,
      brandColors: spec.brand.colors,
      references: spec.references.map((r) => r.analysis),
      primaryReference: spec.primaryReference,
      preferences: '',
      hasLogo: Boolean(spec.brand.logoAssetId),
      speakerPhotos: spec.content.speakers.filter((s) => s.photoAssetId).length,
      photoStyle: spec.direction?.speakerShape ?? null,
    })
    spec = { ...spec, direction: p.direction }
    spec.typography = await chooseTypography(ctx, { direction: p.direction, title: spec.content.title, reference: null, mode: 'original', preferredFonts: [], short: Math.min(spec.canvas.w, spec.canvas.h) }).catch(() => spec.typography)
  }
  if (res.needs.includes('image')) {
    await progress(id, 'image', 'Repainting the background')
    const dir = spec.direction ?? defaultDirection()
    const art = await paintBackground(ctx, { w: spec.canvas.w, h: spec.canvas.h, brief: dir.backgroundBrief, palette: dir.palette, mood: dir.mood, calm: calmZones(spec), reference: null }).catch(() => null)
    const assets: Record<string, Asset> = Object.fromEntries(Object.entries(spec.assets).filter(([, a]) => a.kind !== 'background'))
    if (art) assets['bg-art'] = { id: 'bg-art', kind: 'background', path: null, svg: art.svg, mime: 'image/svg+xml', w: spec.canvas.w, h: spec.canvas.h, cutout: false, tone: null }
    spec = { ...spec, assets }
    // the background layer must point at the new art
    spec.layers = spec.layers.map((l) => (l.kind === 'background' && l.background ? { ...l, background: { ...l.background, assetId: art ? 'bg-art' : null, color: dir.palette.background } } : l))
  }
  spec = await commit(id, spec, 'editor', plan.reply + (res.notes.length ? ` (${res.notes.join(' ')})` : ''))
  await renderAndCheck(id, row.church_id, spec, { relayout: res.relayout || res.needs.length > 0, visual: res.needs.includes('director'), ctx })
  row = (await load(id)).row
  await db().from('designs_v2').update({ status: 'ready', stage: 'done', error: null, pending_instruction: null, ai_rounds: row.ai_rounds + 1 }).eq('id', id)
  await progress(id, 'done', plan.reply)
}

/* ───────────────────────── worker ───────────────────────── */

const running = new Set<string>()

async function work(id: string) {
  if (running.has(id) || running.size >= CONCURRENCY) return
  running.add(id)
  // claim: only one worker (or restart) runs a job
  const { data: claimed } = await db()
    .from('designs_v2')
    .update({ status: 'running', heartbeat_at: new Date().toISOString() })
    .eq('id', id)
    .or(`status.eq.queued,and(status.eq.running,heartbeat_at.lt.${new Date(Date.now() - STALE_MS).toISOString()})`)
    .select('id, pending_instruction')
  try {
    if (!claimed?.length) return
    const beat = setInterval(() => void db().from('designs_v2').update({ heartbeat_at: new Date().toISOString() }).eq('id', id).then(() => undefined), 30_000)
    try {
      const instruction = claimed[0].pending_instruction as string | null
      if (instruction) await edit(id, instruction)
      else await generate(id)
    } finally {
      clearInterval(beat)
    }
  } catch (e) {
    const msg = e instanceof AgentError ? `${e.agent}: ${e.message}` : e instanceof Error ? e.message : String(e)
    console.error(`[design] ${id} failed:`, msg)
    await db().from('designs_v2').update({ status: 'failed', stage: 'failed', error: msg.slice(0, 500), pending_instruction: null }).eq('id', id)
  } finally {
    running.delete(id)
    void tick()
  }
}

/** Starts queued jobs and resumes stale ones (after a restart). */
export async function tick() {
  if (running.size >= CONCURRENCY) return
  const { data } = await db()
    .from('designs_v2')
    .select('id')
    .or(`status.eq.queued,and(status.eq.running,heartbeat_at.lt.${new Date(Date.now() - STALE_MS).toISOString()})`)
    .order('updated_at')
    .limit(CONCURRENCY)
    .then(
      (r) => r,
      () => ({ data: null }),
    )
  for (const r of data ?? []) void work(r.id)
}

export const enqueue = (id: string) => void work(id)

let started = false
export function startDesignWorker() {
  if (started) return
  started = true
  setInterval(() => void tick().catch(() => undefined), 20_000)
  void tick().catch(() => undefined)
}
