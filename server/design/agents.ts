/**
 * The AI agents of the Design Studio. Each one:
 *   - gets only what it needs (never member data), and returns a schema-validated structured output;
 *   - owns one part of the DesignSpec — it never edits the spec itself; the orchestrator merges its output;
 *   - is wrapped by run(): timeout, one retry on a malformed answer, refusal fallback, and a usage row
 *     (model, tokens, cost, latency, outcome) in design_agent_runs.
 * Layout and the measurable QC checks are deterministic code (src/design), not agents.
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod/v4'
import { EditPlan, OPS } from '../../src/design/edits'
import { FONTS, familyOf, nearestWeight } from '../../src/design/fonts'
import { ARCHETYPES, REGION_ROLES, type Content, type DesignSpec, type Direction, type ReferenceAnalysis, type Typography } from '../../src/design/spec'
import { db } from '../db'

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'
// $ per million tokens (input, output) — Claude Opus 5.5 list price; used for the cost column only.
const PRICE = { in: 4, out: 20 }
let client: Anthropic | null = null
const claude = () => (client ??= new Anthropic({ maxRetries: 2 }))
export const aiReady = () => Boolean(process.env.ANTHROPIC_API_KEY)

export class AgentError extends Error {
  constructor(
    public agent: string,
    message: string,
  ) {
    super(message)
  }
}

export interface RunCtx {
  designId: string | null
  churchId: string | null
}

type Img = { media: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string } // base64
const imageBlocks = (imgs: Img[]) => imgs.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.media, data: i.data } }))

/** One structured call: schema-validated, retried once if the answer doesn't match the schema. */
async function run<T extends z.ZodType>(ctx: RunCtx, agent: string, p: { system: string; content: Anthropic.Beta.BetaContentBlockParam[]; schema: T; effort: 'low' | 'medium' | 'high'; maxTokens?: number; timeoutMs?: number }): Promise<z.infer<T>> {
  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now()
    let usage = { input_tokens: 0, output_tokens: 0 }
    try {
      const msg = await claude().beta.messages.parse(
        {
          model: MODEL,
          max_tokens: p.maxTokens ?? 8000,
          thinking: { type: 'adaptive' },
          output_config: { effort: p.effort, format: betaZodOutputFormat(p.schema) },
          // a safety decline on one model is retried on a suitable fallback inside the same call
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: p.system,
          messages: [{ role: 'user', content: attempt ? [...p.content, { type: 'text', text: `Your previous answer was invalid (${lastErr.slice(0, 300)}). Answer again, matching the schema exactly.` }] : p.content }],
        },
        { timeout: p.timeoutMs ?? 120_000 },
      )
      usage = msg.usage
      if (msg.stop_reason === 'refusal') throw new AgentError(agent, 'The request was declined.')
      if (msg.stop_reason === 'max_tokens') throw new Error('answer was cut off')
      const out = msg.parsed_output
      if (!out) throw new Error('no structured output')
      await record(ctx, agent, usage, Date.now() - t0, true)
      return out as z.infer<T>
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      await record(ctx, agent, usage, Date.now() - t0, false, lastErr)
      // Rate limits / outages: the SDK already retried; malformed answers get one more try.
      if (e instanceof AgentError || e instanceof Anthropic.APIError) throw new AgentError(agent, lastErr)
    }
  }
  throw new AgentError(agent, lastErr)
}

async function record(ctx: RunCtx, agent: string, u: { input_tokens: number; output_tokens: number }, ms: number, ok: boolean, error?: string) {
  const cost = (u.input_tokens * PRICE.in + u.output_tokens * PRICE.out) / 1e6
  console.log(`[design:${agent}] ${ok ? 'ok' : 'FAILED'} ${ms}ms in=${u.input_tokens} out=${u.output_tokens} $${cost.toFixed(4)}${error ? ` ${error.slice(0, 160)}` : ''}`)
  if (!ctx.churchId) return
  await db()
    .from('design_agent_runs')
    .insert({ design_id: ctx.designId, church_id: ctx.churchId, agent, model: MODEL, input_tokens: u.input_tokens, output_tokens: u.output_tokens, cost_usd: cost, ms, ok, error: error?.slice(0, 500) ?? null })
    .then(
      () => undefined,
      () => undefined,
    )
}

/* ───────────────────────── Reference Analysis ───────────────────────── */

const RefOut = z.object({
  summary: z.string(),
  palette: z.array(z.string()),
  background: z.enum(['dark', 'light', 'photo', 'gradient', 'colourful']),
  regions: z.array(z.object({ role: z.enum(REGION_ROLES), x: z.number(), y: z.number(), w: z.number(), h: z.number() })),
  typography: z.array(z.object({ role: z.enum(['title', 'subtitle', 'body', 'accent']), style: z.enum(['serif', 'sans', 'display', 'script', 'condensed', 'slab']), weight: z.enum(['light', 'regular', 'bold', 'black']), case: z.enum(['upper', 'title', 'sentence']) })),
  speakers: z.object({ count: z.number(), arrangement: z.enum(['none', 'single', 'row', 'grid', 'stack', 'scattered']), shape: z.enum(['circle', 'rounded', 'cutout', 'rect']) }),
  margin: z.number(),
  density: z.enum(['airy', 'balanced', 'dense']),
  mood: z.array(z.string()),
})

const REF_SYSTEM = `You are a senior graphic designer analysing an inspiration flyer so another designer can rebuild its composition with different content.
Measure, don't guess: give every region as fractions (0–1) of the image width / height — x, y of the top-left corner, w, h.
Regions: logo, title (main headline), subtitle, tagline, speakers (the whole block of people photos), details (date / time / venue), scripture, cta, host (church name), photo (a large single photo), decor.
Palette: the 3–6 dominant colours as #rrggbb. Typography: classify each text role's style, weight and case. margin: the outer margin as a share of the width.
Describe the image; never transcribe personal details beyond what is needed to describe layout.`

export async function analyseReference(ctx: RunCtx, img: Img & { w: number; h: number }): Promise<ReferenceAnalysis> {
  const r = await run(ctx, 'reference', { system: REF_SYSTEM, content: [...imageBlocks([img]), { type: 'text', text: 'Analyse this reference design.' }], schema: RefOut, effort: 'medium' })
  const c01 = (v: number) => Math.max(0, Math.min(1, v))
  return {
    ...r,
    aspect: img.w / img.h,
    palette: r.palette.filter((x) => /^#[0-9a-f]{6}$/i.test(x)).slice(0, 8),
    regions: r.regions
      .map((g) => ({ role: g.role, x: c01(g.x), y: c01(g.y), w: c01(g.w), h: c01(g.h) }))
      .filter((g) => g.w > 0.02 && g.h > 0.01)
      .slice(0, 20),
    margin: Math.max(0, Math.min(0.2, r.margin)),
    mood: r.mood.slice(0, 6),
  }
}

/* ───────────────────────── Creative Director ───────────────────────── */

const ContentOut = z.object({
  title: z.string(),
  subtitle: z.string(),
  tagline: z.string(),
  date: z.string(),
  time: z.string(),
  venue: z.string(),
  host: z.string(),
  scripture: z.string(),
  contact: z.string(),
  cta: z.string(),
  speakers: z.array(z.object({ name: z.string(), role: z.string() })),
})
const DirectionOut = z.object({
  concept: z.string(),
  mood: z.array(z.string()),
  palette: z.object({ background: z.string(), surface: z.string(), primary: z.string(), accent: z.string(), text: z.string(), muted: z.string() }),
  archetype: z.enum(ARCHETYPES),
  speakerShape: z.enum(['circle', 'rounded', 'cutout', 'rect']),
  backgroundBrief: z.string(),
  titleCase: z.enum(['upper', 'title', 'sentence']),
  notes: z.string(),
})
const PlanOut = z.object({ content: ContentOut, direction: DirectionOut, questions: z.array(z.string()) })

const DIRECTOR_SYSTEM = `You are ZionDesk's senior creative director for church graphics. You plan; you don't draw.
1) CONTENT — extract the flyer's wording from the brief. Copy words exactly as the user wrote them (names, titles, dates, times, places, scripture). Never invent, correct or embellish anything: leave a field "" if the brief doesn't say it. Fields the user already filled in are given — keep them unchanged.
2) DIRECTION — a professional concept for this church and event: visual hierarchy, mood, palette (six #rrggbb colours with strong contrast between background and text — WCAG 4.5:1 for text), layout archetype, how people photos are shown, and what the background artwork should depict (no text in the artwork).
Archetypes: "stacked" (centred, top-to-bottom: logo, headline, speakers, details), "split" (text column + people column; best for landscape), "hero-portrait" (one large cut-out or framed portrait beside the headline; only with exactly one speaker), "band" (headline on a full-width colour band).
Photo styles: circle, rounded, cutout (person with background removed, overlapping shapes), rect.
Modes: replicate — follow the primary reference's composition and style closely with the user's content; inspired — keep the reference's character (palette mood, typography style, energy) but make a distinct composition; original — design from the brief and brand alone.
Respect the church's brand colours and preferences when given. Avoid generic "AI flyer" clichés (purple-blue gradients with lens flares everywhere): aim for the polish of a top church design studio.
questions: anything essential that is missing (at most 3), else [].`

export interface PlanInput {
  brief: string
  content: Content
  mode: DesignSpec['mode']
  format: string
  churchName: string
  brandColors: string[]
  references: (ReferenceAnalysis | null)[]
  primaryReference: number | null
  preferences: string
  hasLogo: boolean
  speakerPhotos: number
  photoStyle: string | null
}

export async function planDesign(ctx: RunCtx, p: PlanInput): Promise<{ content: Content; direction: Direction; questions: string[] }> {
  const refs = p.references.map((r, i) => (r ? `Reference ${i + 1}${i === p.primaryReference ? ' (primary)' : ''}: ${JSON.stringify({ summary: r.summary, palette: r.palette, background: r.background, typography: r.typography, speakers: r.speakers, density: r.density, mood: r.mood })}` : `Reference ${i + 1}: not analysed`))
  const filled = Object.fromEntries(Object.entries(p.content).filter(([k, v]) => (k === 'speakers' ? (v as unknown[]).length : String(v).trim())))
  const text = [
    `Mode: ${p.mode}. Format: ${p.format}. Church: ${p.churchName}. Logo available: ${p.hasLogo ? 'yes' : 'no'}. People photos uploaded: ${p.speakerPhotos}.`,
    p.photoStyle ? `The user wants people photos shown as: ${p.photoStyle}.` : '',
    p.brandColors.length ? `Brand colours: ${p.brandColors.join(', ')}.` : '',
    p.preferences ? `What this church usually approves: ${p.preferences}` : '',
    refs.length ? refs.join('\n') : 'No references.',
    `Fields already filled in by the user (keep exactly): ${JSON.stringify(filled)}`,
    `Brief:\n${p.brief || '(none)'}`,
  ]
    .filter(Boolean)
    .join('\n')
  const r = await run(ctx, 'director', { system: DIRECTOR_SYSTEM, content: [{ type: 'text', text }], schema: PlanOut, effort: 'high', maxTokens: 12000 })
  return { content: mergeContent(p.content, r.content, p.brief), direction: cleanDirection(r.direction), questions: r.questions.slice(0, 3) }
}

/**
 * The user's own fields always win. A field the director filled from the brief is kept only if its words really
 * appear in the brief (so nothing is invented); speakers the user listed are kept as they are.
 */
export function mergeContent(user: Content, ai: z.infer<typeof ContentOut>, brief: string): Content {
  const b = brief.toLowerCase().replace(/\s+/g, ' ')
  const inBrief = (v: string) => {
    const words = v.toLowerCase().replace(/[“”"'’.,:;!?()]/g, ' ').split(/\s+/).filter((w) => w.length > 1)
    return words.length > 0 && words.filter((w) => b.includes(w)).length / words.length >= 0.8
  }
  const out = { ...user }
  for (const k of ['title', 'subtitle', 'tagline', 'date', 'time', 'venue', 'host', 'scripture', 'contact', 'cta'] as const) {
    const mine = user[k]?.trim()
    const theirs = ai[k]?.trim()
    if (!mine && theirs && inBrief(theirs)) out[k] = theirs.slice(0, 200)
  }
  if (!out.title.trim()) out.title = (ai.title.trim() && inBrief(ai.title) ? ai.title : brief.split(/[.\n]/)[0]).slice(0, 140) || 'Church event'
  if (!user.speakers.length)
    out.speakers = ai.speakers
      .filter((s) => s.name.trim() && inBrief(s.name))
      .slice(0, 8)
      .map((s, i) => ({ id: `s${i}`, name: s.name.trim().slice(0, 80), role: inBrief(s.role) ? s.role.trim().slice(0, 80) : '', photoAssetId: null }))
  return out
}

const hex = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback)
function cleanDirection(d: z.infer<typeof DirectionOut>): Direction {
  return {
    ...d,
    mood: d.mood.slice(0, 6),
    palette: { background: hex(d.palette.background, '#14102b'), surface: hex(d.palette.surface, '#241c4d'), primary: hex(d.palette.primary, '#ffffff'), accent: hex(d.palette.accent, '#c4ec62'), text: hex(d.palette.text, '#ffffff'), muted: hex(d.palette.muted, '#c9c3e6') },
    backgroundBrief: d.backgroundBrief.slice(0, 600),
    notes: d.notes.slice(0, 600),
  }
}

/* ───────────────────────── Typography ───────────────────────── */

const TypeOut = z.object({
  display: z.object({ family: z.string(), weight: z.number() }),
  heading: z.object({ family: z.string(), weight: z.number() }),
  body: z.object({ family: z.string(), weight: z.number() }),
  accent: z.object({ family: z.string(), weight: z.number() }),
  titleScale: z.number(), // headline size as a share of the canvas's short side (0.06–0.16)
  titleTracking: z.number(),
  rationale: z.string(),
})
const TYPE_SYSTEM = `You are a typographer choosing type for a church flyer from a fixed font catalogue (only these fonts exist):
${FONTS.map((f) => `- ${f.family} (${f.category}; weights ${Object.keys(f.files).join('/')}): ${f.notes}`).join('\n')}
Pick display (headline), heading (subtitle, speaker names), body (date, venue, small print) and accent (tagline / scripture).
Rules: at most 3 families in total; body must be a highly readable sans or serif (never script, never condensed caps-only fonts for long text); scripts only as accent for a few words; pair contrast deliberately (e.g. a characterful serif or condensed headline with a neutral sans body). Prefer distinctive, editorial choices over default-looking ones.
titleScale: headline size as a share of the canvas's short side — 0.07 for long titles, up to 0.15 for one or two words. titleTracking in em (-0.03 to 0.12; positive for caps).`

export async function chooseTypography(ctx: RunCtx, p: { direction: Direction; title: string; reference: ReferenceAnalysis | null; mode: DesignSpec['mode']; preferredFonts: string[]; short: number }): Promise<Typography> {
  const text = [
    `Concept: ${p.direction.concept}. Mood: ${p.direction.mood.join(', ')}. Title case: ${p.direction.titleCase}.`,
    `Headline (${p.title.length} characters): ${p.title}`,
    p.reference && p.mode !== 'original' ? `Reference typography to ${p.mode === 'replicate' ? 'match closely' : 'take inspiration from'}: ${JSON.stringify(p.reference.typography)}` : '',
    p.preferredFonts.length ? `Fonts this church often approves: ${p.preferredFonts.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const r = await run(ctx, 'typography', { system: TYPE_SYSTEM, content: [{ type: 'text', text }], schema: TypeOut, effort: 'medium' })
  const pick = (f: { family: string; weight: number }) => {
    const fam = familyOf(f.family).family
    return { family: fam, weight: nearestWeight(fam, f.weight) }
  }
  const s = p.short
  const title = Math.round(s * Math.max(0.06, Math.min(0.16, r.titleScale)))
  return {
    display: pick(r.display),
    heading: pick(r.heading),
    body: pick(r.body),
    accent: pick(r.accent),
    scale: { title, subtitle: Math.round(s * 0.042), heading: Math.round(s * 0.032), body: Math.round(s * 0.03), small: Math.round(s * 0.023) },
    titleTracking: Math.max(-0.03, Math.min(0.12, r.titleTracking)),
    rationale: r.rationale.slice(0, 400),
  }
}

/* ───────────────────────── Image (background art) ───────────────────────── */

const ART_SYSTEM = `You are an illustrator painting the BACKGROUND ARTWORK of a church flyer as an SVG. The flyer's text, logo and photos are added on top later by the layout engine, so:
- NO text, letters, numbers, logos, people or faces. No <text>, <image>, <foreignObject>, <script>, external URLs or web fonts.
- Fill the whole viewBox. Keep the areas named in "keep calm" low-contrast and uncluttered (text sits there).
- Use rich, professional techniques: layered gradients, soft light, grain via feTurbulence, geometric or organic shapes, bokeh, rays, subtle textures, depth. Match the palette exactly.
Return only the SVG document.`

export async function paintBackground(ctx: RunCtx, p: { w: number; h: number; brief: string; palette: Direction['palette']; mood: string[]; calm: string; reference: ReferenceAnalysis | null }): Promise<{ svg: string }> {
  const t0 = Date.now()
  let usage = { input_tokens: 0, output_tokens: 0 }
  try {
    const msg = await claude()
      .messages.stream(
        {
          model: MODEL,
          max_tokens: 24000,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          system: ART_SYSTEM,
          messages: [
            {
              role: 'user',
              content: `viewBox="0 0 ${p.w} ${p.h}". Paint: ${p.brief}. Mood: ${p.mood.join(', ')}. Palette: ${JSON.stringify(p.palette)}. Keep calm: ${p.calm}.${p.reference ? ` Background style of the reference: ${p.reference.background}, ${p.reference.mood.join(', ')}.` : ''}`,
            },
          ],
        },
        { timeout: 240_000 },
      )
      .finalMessage()
    usage = msg.usage
    if (msg.stop_reason === 'refusal') throw new AgentError('image', 'declined')
    const svg = cleanArt(msg.content.map((c) => (c.type === 'text' ? c.text : '')).join(''))
    await record(ctx, 'image', usage, Date.now() - t0, true)
    return { svg }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    await record(ctx, 'image', usage, Date.now() - t0, false, m)
    throw new AgentError('image', m)
  }
}

/** Safe, self-contained background art: no scripts, links, embedded HTML, text or raster images. */
export function cleanArt(raw: string): string {
  const m = raw.match(/<svg[\s\S]*<\/svg>/i)
  if (!m) throw new AgentError('image', 'no SVG in the answer')
  return m[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(iframe|object|embed|audio|video|image|text)\b[\s\S]*?(<\/\1>|\/>)/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none')
    .replace(/@import[^;]+;/gi, '')
    .slice(0, 400_000)
}

/* ───────────────────────── Quality Control (visual pass) ───────────────────────── */

const VisualOut = z.object({ score: z.number(), approved: z.boolean(), notes: z.string(), ops: z.array(z.object({ op: z.enum(OPS), target: z.string(), value: z.string(), amount: z.number(), x: z.number(), y: z.number() })) })
const QC_SYSTEM = `You are the art director doing final quality control on a rendered church flyer. Judge composition, hierarchy, balance, spacing, polish and whether it looks professionally designed (not template-like or AI-generic).
You also get the automatic checker's findings and the list of layer roles. If it is not ready, propose at most 4 targeted fix operations (same operation set as the editor; targets are layer roles). Never change the wording. Never restyle the whole design.
score: 0–10. approved: true if score ≥ 7.5 and there are no real problems.`

export async function reviewDesign(ctx: RunCtx, p: { png: Buffer; roles: string[]; issues: string[]; mode: DesignSpec['mode']; reference: Img | null }) {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...imageBlocks([{ media: 'image/png', data: p.png.toString('base64') }]),
    ...(p.reference && p.mode === 'replicate' ? [...imageBlocks([p.reference]), { type: 'text' as const, text: 'The second image is the reference the layout should follow.' }] : []),
    { type: 'text', text: `Layer roles: ${p.roles.join(', ')}\nAutomatic findings: ${p.issues.length ? p.issues.join(' | ') : 'none'}` },
  ]
  const r = await run(ctx, 'qc', { system: QC_SYSTEM, content, schema: VisualOut, effort: 'medium' })
  return { score: Math.max(0, Math.min(10, r.score)), approved: r.approved, notes: r.notes.slice(0, 600), ops: r.ops.filter((o) => o.op !== 'restyle').slice(0, 4) }
}

/* ───────────────────────── Conversational edits ───────────────────────── */

const EDIT_SYSTEM = `You are a senior designer taking a change request on an existing church flyer. Translate the request into the smallest set of edit operations; everything the user didn't mention stays as it is.
Operations (op, target, value, amount, x, y — use "" / 0 for unused fields):
- scale_text: target role, amount factor (1.25 = 25% bigger) · resize: target role, amount factor · move: target role, x/y shift as a share of width/height · place: target role, value position (top-left…bottom-right, center)
- set_color: target palette slot (background|surface|primary|accent|text|muted), value #rrggbb · set_layer_color: target role, value #rrggbb
- set_font: target slot (display|heading|body|accent), value family from: ${FONTS.map((f) => f.family).join(', ')}; amount weight or 0
- use_reference_typography / use_reference_layout: amount = reference number (1-based); layout value replicate|inspired
- set_archetype: value stacked|split|hero-portrait|band · set_speaker_shape: value circle|rounded|cutout|rect · set_title_case: value upper|title|sentence
- set_image_fade: target photo role, value bottom|top|left|right|edges|none, amount 0.1–1 (soft fade to transparent)
- hide / show / lock: target role ("keep the logo" → lock logo)
- regenerate_background: value = what to paint · restyle: value = the new creative direction (only for whole-look requests like "more premium")
Layer roles in this design are listed. "headline" means title. Colour names → a fitting hex (royal blue #1d3fa8, gold #d4a72c, burgundy #6d1a2c…).
reply: one short, friendly sentence saying what you changed, like a designer would.`

export async function planEdit(ctx: RunCtx, p: { instruction: string; spec: DesignSpec }): Promise<EditPlan> {
  const s = p.spec
  const summary = {
    roles: [...new Set(s.layers.map((l) => l.role))],
    palette: s.direction?.palette,
    fonts: s.typography && { display: s.typography.display.family, heading: s.typography.heading.family, body: s.typography.body.family, accent: s.typography.accent.family },
    archetype: s.direction?.archetype,
    speakerShape: s.direction?.speakerShape,
    references: s.references.map((r, i) => `${i + 1}: ${r.analysis?.summary ?? 'not analysed'}`),
    speakers: s.content.speakers.length,
  }
  const r = await run(ctx, 'editor', { system: EDIT_SYSTEM, content: [{ type: 'text', text: `Design: ${JSON.stringify(summary)}\nRequest: ${p.instruction}` }], schema: EditPlan, effort: 'medium' })
  return { reply: r.reply.slice(0, 300), ops: r.ops.slice(0, 12) }
}
