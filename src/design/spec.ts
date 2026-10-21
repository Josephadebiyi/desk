/**
 * DesignSpec — the one shared, versioned description of a design that every agent works from.
 * Agents never write it directly: each returns a schema-validated output for the part it owns, and the orchestrator
 * merges that output in (see orchestrator.ts → commit()). Every commit bumps `version` and appends to `history`,
 * and the full spec is stored per version in design_versions, so any earlier version can be restored.
 *
 * Ownership (who may change what):
 *   Creative Director  → content (extracted from the brief), direction
 *   Reference Analysis → references[i].analysis
 *   Typography         → typography
 *   Image              → assets of kind background / decor, and cutouts of portraits
 *   Layout             → layers (positions, sizes, z-order)
 *   Quality Control    → qc
 * The user's own text and uploads (content.*, logo, portraits) are never rewritten by an agent: edits go through
 * explicit edit operations the user asked for.
 */
import * as z from 'zod/v4'

export const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const FORMATS = { portrait: { w: 1080, h: 1350 }, square: { w: 1080, h: 1080 }, story: { w: 1080, h: 1920 }, landscape: { w: 1920, h: 1080 } } as const
export type Format = keyof typeof FORMATS

export const Mode = z.enum(['replicate', 'inspired', 'original'])
export type Mode = z.infer<typeof Mode>

/* ───────── content: exactly what the user gave us ───────── */

export const Speaker = z.object({
  id: z.string(),
  name: z.string().max(80),
  role: z.string().max(80).default(''),
  photoAssetId: z.string().nullable().default(null),
})
export type Speaker = z.infer<typeof Speaker>

export const Content = z.object({
  title: z.string().max(140),
  subtitle: z.string().max(200).default(''),
  tagline: z.string().max(160).default(''),
  date: z.string().max(80).default(''),
  time: z.string().max(80).default(''),
  venue: z.string().max(160).default(''),
  host: z.string().max(120).default(''), // church name as it should appear
  scripture: z.string().max(220).default(''),
  contact: z.string().max(160).default(''),
  cta: z.string().max(80).default(''),
  speakers: z.array(Speaker).max(8).default([]),
})
export type Content = z.infer<typeof Content>

/* ───────── reference analysis (one per uploaded inspiration image) ───────── */

export const REGION_ROLES = ['logo', 'title', 'subtitle', 'tagline', 'speakers', 'details', 'scripture', 'cta', 'host', 'decor', 'photo'] as const
export const Region = z.object({
  role: z.enum(REGION_ROLES),
  // normalised 0..1 of the reference's width / height
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
})
export const ReferenceAnalysis = z.object({
  summary: z.string(),
  aspect: z.number(), // width / height of the reference
  palette: z.array(HEX).max(8),
  background: z.enum(['dark', 'light', 'photo', 'gradient', 'colourful']),
  regions: z.array(Region).max(20),
  typography: z.array(
    z.object({
      role: z.enum(['title', 'subtitle', 'body', 'accent']),
      style: z.enum(['serif', 'sans', 'display', 'script', 'condensed', 'slab']),
      weight: z.enum(['light', 'regular', 'bold', 'black']),
      case: z.enum(['upper', 'title', 'sentence']),
    }),
  ),
  speakers: z.object({ count: z.number(), arrangement: z.enum(['none', 'single', 'row', 'grid', 'stack', 'scattered']), shape: z.enum(['circle', 'rounded', 'cutout', 'rect']) }),
  margin: z.number(), // outer margin as a share of width (0..0.2)
  density: z.enum(['airy', 'balanced', 'dense']),
  mood: z.array(z.string()).max(6),
})
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysis>

/* ───────── creative direction, typography ───────── */

export const ARCHETYPES = ['stacked', 'split', 'hero-portrait', 'band'] as const
export const Palette = z.object({ background: HEX, surface: HEX, primary: HEX, accent: HEX, text: HEX, muted: HEX })
export type Palette = z.infer<typeof Palette>

export const Direction = z.object({
  concept: z.string(),
  mood: z.array(z.string()).max(6),
  palette: Palette,
  archetype: z.enum(ARCHETYPES),
  speakerShape: z.enum(['circle', 'rounded', 'cutout', 'rect']),
  backgroundBrief: z.string(), // what the Image agent should paint (no text)
  titleCase: z.enum(['upper', 'title', 'sentence']),
  notes: z.string().default(''),
})
export type Direction = z.infer<typeof Direction>

export const FontChoice = z.object({ family: z.string(), weight: z.number() })
export const Typography = z.object({
  display: FontChoice, // title
  heading: FontChoice, // subtitle, speaker names
  body: FontChoice, // details
  accent: FontChoice, // tagline / scripture
  scale: z.object({ title: z.number(), subtitle: z.number(), heading: z.number(), body: z.number(), small: z.number() }),
  titleTracking: z.number(), // letter spacing in em
  rationale: z.string().default(''),
})
export type Typography = z.infer<typeof Typography>

/* ───────── assets & layers ───────── */

export const Asset = z.object({
  id: z.string(),
  kind: z.enum(['logo', 'portrait', 'reference', 'background', 'decor']),
  // storage path (bucket design-assets) for uploads; inline SVG for generated backgrounds / decor
  path: z.string().nullable().default(null),
  svg: z.string().nullable().default(null),
  mime: z.string().default('image/png'),
  w: z.number(),
  h: z.number(),
  // portraits: whether the background was removed (cutout) — shapes can then sit behind the person
  cutout: z.boolean().default(false),
  tone: z.enum(['dark', 'light', 'mixed']).nullable().default(null),
})
export type Asset = z.infer<typeof Asset>

export const TextStyle = z.object({
  content: z.string(),
  font: z.string(),
  weight: z.number(),
  size: z.number(), // the size the Typography agent wanted
  minSize: z.number(),
  lineHeight: z.number(),
  align: z.enum(['left', 'center', 'right']),
  valign: z.enum(['top', 'middle', 'bottom']).default('top'),
  color: HEX,
  tracking: z.number().default(0), // em
  transform: z.enum(['none', 'upper']).default('none'),
  maxLines: z.number().default(3),
  // effects (editor): drop shadow and outline
  shadow: z.object({ color: HEX, blur: z.number(), dx: z.number(), dy: z.number(), opacity: z.number() }).nullable().default(null),
  outline: z.object({ color: HEX, width: z.number() }).nullable().default(null),
  // filled in by the layout engine after measuring with the real font
  fitted: z.object({ size: z.number(), lines: z.array(z.string()), width: z.number(), height: z.number(), overflow: z.boolean() }).nullable().default(null),
})
export type TextStyle = z.infer<typeof TextStyle>

export const Layer = z.object({
  id: z.string(),
  role: z.string(), // title, subtitle, speaker:0, speaker-name:0, logo, details, background, panel…
  kind: z.enum(['background', 'shape', 'text', 'image', 'qr']),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().default(0), // degrees, around the box centre
  opacity: z.number().default(1),
  visible: z.boolean().default(true),
  name: z.string().default(''), // the layer panel label (defaults to the role)
  group: z.string().nullable().default(null), // layers with the same group move together in the editor
  // editor lock: can't be selected / moved on the canvas (layer panel padlock); AI relayouts keep it too
  locked: z.boolean().default(false),
  // the user changed it by hand, or said "keep this": AI relayouts leave it exactly as it is
  pinned: z.boolean().default(false),
  text: TextStyle.nullable().default(null),
  image: z
    .object({
      assetId: z.string(),
      fit: z.enum(['contain', 'cover']),
      mask: z.enum(['none', 'circle', 'rounded']),
      radius: z.number().default(0),
      ring: HEX.nullable().default(null),
      // crop window in the source image, 0..1 (editor crop tool); null = whole image
      crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable().default(null),
      flipX: z.boolean().default(false),
      // gradient fade to transparent: which side fades, and how much of the photo the fade covers (0..1)
      fade: z.object({ side: z.enum(['bottom', 'top', 'left', 'right', 'edges']), amount: z.number() }).nullable().default(null),
    })
    .nullable()
    .default(null),
  shape: z.object({ type: z.enum(['rect', 'circle', 'line']), fill: HEX.nullable(), stroke: HEX.nullable().default(null), strokeWidth: z.number().default(0), radius: z.number().default(0) }).nullable().default(null),
  background: z.object({ assetId: z.string().nullable(), color: HEX, gradient: z.array(HEX).max(3).default([]) }).nullable().default(null),
})
export type Layer = z.infer<typeof Layer>

/* ───────── quality control ───────── */

export const QC_CODES = ['overflow', 'clipped', 'spelling', 'missing', 'collision', 'margins', 'distorted', 'aspect', 'low_res', 'contrast', 'reference_mismatch', 'visual'] as const
export const QcIssue = z.object({
  code: z.enum(QC_CODES),
  severity: z.enum(['error', 'warning']),
  layerId: z.string().nullable().default(null),
  message: z.string(),
})
export type QcIssue = z.infer<typeof QcIssue>
export const Qc = z.object({
  at: z.string(),
  passed: z.boolean(),
  issues: z.array(QcIssue),
  visual: z.object({ score: z.number(), notes: z.string() }).nullable().default(null),
  rounds: z.number().default(0),
})

/* ───────── the spec ───────── */

export const DesignSpec = z.object({
  id: z.string(),
  version: z.number(),
  canvas: z.object({ format: z.enum(['portrait', 'square', 'story', 'landscape']), w: z.number(), h: z.number(), safe: z.number() }),
  mode: Mode,
  language: z.string().default('English'),
  brief: z.string().default(''),
  content: Content,
  brand: z.object({ churchName: z.string(), logoAssetId: z.string().nullable().default(null), colors: z.array(HEX).max(6).default([]), fonts: z.array(z.string()).max(4).default([]) }),
  references: z.array(z.object({ assetId: z.string(), analysis: ReferenceAnalysis.nullable().default(null) })).max(4).default([]),
  // which reference the design follows (replicate / inspired modes)
  primaryReference: z.number().nullable().default(null),
  direction: Direction.nullable().default(null),
  // Quick mode: photos uploaded without names — matched in order to the people the director finds in the brief
  unassignedPhotos: z.array(z.string()).max(8).default([]),
  typography: Typography.nullable().default(null),
  assets: z.record(z.string(), Asset).default({}),
  layers: z.array(Layer).default([]),
  constraints: z.object({ minMargin: z.number(), minFont: z.number(), minContrast: z.number() }),
  qc: Qc.nullable().default(null),
  history: z.array(z.object({ version: z.number(), agent: z.string(), at: z.string(), note: z.string() })).default([]),
})
export type DesignSpec = z.infer<typeof DesignSpec>

export function newSpec(p: { id: string; format: Format; mode: Mode; language: string; brief: string; content: Content; churchName: string; logoAssetId: string | null; references: string[] }): DesignSpec {
  const { w, h } = FORMATS[p.format]
  return DesignSpec.parse({
    id: p.id,
    version: 0,
    canvas: { format: p.format, w, h, safe: Math.round(Math.min(w, h) * 0.06) },
    mode: p.mode,
    language: p.language,
    brief: p.brief,
    content: p.content,
    brand: { churchName: p.churchName, logoAssetId: p.logoAssetId },
    references: p.references.map((assetId) => ({ assetId })),
    constraints: { minMargin: Math.round(Math.min(w, h) * 0.05), minFont: 22, minContrast: 3 },
  })
}

/** Every piece of user text that must appear on the design, by role (used by QC's missing / spelling checks). */
export function requiredText(c: Content): { role: string; text: string }[] {
  const out: { role: string; text: string }[] = [{ role: 'title', text: c.title }]
  for (const k of ['subtitle', 'tagline', 'scripture', 'cta', 'host'] as const) if (c[k].trim()) out.push({ role: k, text: c[k] })
  c.speakers.forEach((s, i) => s.name.trim() && out.push({ role: `speaker-name:${i}`, text: s.name }))
  return out.filter((x) => x.text.trim())
}
