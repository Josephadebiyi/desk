/**
 * Targeted edit operations on a DesignSpec. The Creative Director turns a request ("make the headline bigger",
 * "keep everything but move the logo", "change the background to royal blue") into these operations, and QC turns
 * its findings into them too. They are applied deterministically, so only the affected layers change:
 *   - layer operations (resize text, move, hide…) change those layers and pin them so relayouts keep them;
 *   - style operations (palette, fonts, archetype…) change the direction / typography and trigger a relayout
 *     that keeps every locked layer;
 *   - "restyle" and "regenerate_background" need an agent (the orchestrator runs only those agents).
 */
import * as z from 'zod/v4'
import { FONTS, familyOf, nearestWeight } from './fonts'
import { defaultDirection, defaultTypography } from './layout'
import { ARCHETYPES, type DesignSpec, type Layer } from './spec'

export const OPS = [
  'scale_text', // target role (prefix ok, e.g. "speaker-name"), amount = factor (1.2 = 20% bigger)
  'move', // target role, x / y = shift as a share of canvas width / height (-0.2..0.2)
  'place', // target role, value = top-left | top | top-right | left | center | right | bottom-left | bottom | bottom-right
  'resize', // target role, amount = factor for the box
  'set_color', // target = background | surface | primary | accent | text | muted, value = #rrggbb
  'set_layer_color', // target role, value = #rrggbb (text colour or shape fill)
  'set_font', // target = display | heading | body | accent, value = family name, amount = weight (0 = keep)
  'use_reference_typography', // amount = reference number (1-based)
  'use_reference_layout', // amount = reference number (1-based), value = replicate | inspired
  'set_archetype', // value = stacked | split | hero-portrait | band
  'set_speaker_shape', // value = circle | rounded | cutout | rect
  'set_title_case', // value = upper | title | sentence
  'set_image_fade', // target role (photo), value = bottom | top | left | right | edges | none, amount = 0..1 (how far it fades)
  'hide', // target role
  'show', // target role
  'lock', // target role ("keep the logo where it is") — pins it so AI relayouts leave it
  'restyle', // value = new creative direction in words (needs the Creative Director + Image agent)
  'regenerate_background', // value = what to paint (needs the Image agent)
] as const
export type OpName = (typeof OPS)[number]

export const EditOp = z.object({
  op: z.enum(OPS),
  target: z.string(),
  value: z.string(),
  amount: z.number(),
  x: z.number(),
  y: z.number(),
})
export type EditOp = z.infer<typeof EditOp>
export const EditPlan = z.object({
  /** One short sentence back to the user, like a designer would say ("Made the headline bigger and kept the rest.") */
  reply: z.string(),
  ops: z.array(EditOp).max(12),
})
export type EditPlan = z.infer<typeof EditPlan>

export interface ApplyResult {
  spec: DesignSpec
  relayout: boolean
  needs: ('director' | 'image')[]
  changed: string[] // layer ids touched directly
  notes: string[] // operations that couldn't be applied, in plain words
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const matches = (l: Layer, target: string) => {
  const t = target.trim().toLowerCase()
  if (!t) return false
  return l.role === t || l.role.startsWith(`${t}:`) || l.id === t || (t === 'speakers' && /^speaker/.test(l.role)) || (t === 'headline' && l.role === 'title')
}

const FAMILIES_BY_STYLE: Record<string, string> = { serif: 'Playfair Display', sans: 'Montserrat', display: 'DM Serif Display', script: 'Great Vibes', condensed: 'Bebas Neue', slab: 'Oswald' }
const WEIGHT_OF: Record<string, number> = { light: 400, regular: 500, bold: 700, black: 900 }

export function applyOps(input: DesignSpec, ops: EditOp[]): ApplyResult {
  const spec: DesignSpec = structuredClone(input)
  const W = spec.canvas.w
  const H = spec.canvas.h
  spec.direction ??= defaultDirection()
  spec.typography ??= defaultTypography(W)
  const res: ApplyResult = { spec, relayout: false, needs: [], changed: [], notes: [] }
  const targets = (role: string) => spec.layers.filter((l) => matches(l, role))
  const touch = (l: Layer) => {
    l.pinned = true
    res.changed.push(l.id)
  }

  for (const op of ops) {
    const ls = targets(op.target)
    switch (op.op) {
      case 'scale_text': {
        const f = clamp(op.amount || 1.15, 0.4, 2.5)
        if (!ls.some((l) => l.text)) res.notes.push(`No text called “${op.target}” to resize.`)
        for (const l of ls.filter((x) => x.text)) {
          l.text!.size = Math.round(l.text!.size * f)
          l.text!.minSize = Math.min(l.text!.minSize, l.text!.size)
          // grow the box around its centre so a bigger headline has room (QC checks what it now overlaps)
          const grow = Math.min(f, 1.6)
          const nh = l.h * grow
          const nw = f > 1 ? Math.min(W - spec.constraints.minMargin * 2, l.w * Math.max(1, grow * 0.9)) : l.w
          l.x = clamp(l.x - (nw - l.w) / 2, 0, W - nw)
          l.y = clamp(l.y - (nh - l.h) / 2, 0, H - nh)
          l.w = nw
          l.h = nh
          l.text!.fitted = null
          touch(l)
        }
        break
      }
      case 'move':
        for (const l of ls) {
          l.x = clamp(l.x + clamp(op.x, -0.6, 0.6) * W, -l.w * 0.5, W - l.w * 0.5)
          l.y = clamp(l.y + clamp(op.y, -0.6, 0.6) * H, -l.h * 0.5, H - l.h * 0.5)
          touch(l)
        }
        if (!ls.length) res.notes.push(`Couldn’t find “${op.target}” to move.`)
        break
      case 'place': {
        const m = spec.constraints.minMargin
        for (const l of ls) {
          const v = op.value
          l.x = /left/.test(v) ? m : /right/.test(v) ? W - m - l.w : (W - l.w) / 2
          l.y = /top/.test(v) ? m : /bottom/.test(v) ? H - m - l.h : v === 'left' || v === 'right' || v === 'center' ? (H - l.h) / 2 : l.y
          touch(l)
        }
        break
      }
      case 'resize':
        for (const l of ls) {
          const f = clamp(op.amount || 1.2, 0.3, 3)
          const cx = l.x + l.w / 2
          const cy = l.y + l.h / 2
          l.w *= f
          l.h *= f
          l.x = cx - l.w / 2
          l.y = cy - l.h / 2
          if (l.text) l.text.fitted = null
          touch(l)
        }
        break
      case 'set_color': {
        const key = op.target
        if (!/^#[0-9a-f]{6}$/i.test(op.value) || !['background', 'surface', 'primary', 'accent', 'text', 'muted'].includes(key)) {
          res.notes.push(`Couldn’t use the colour “${op.value}”.`)
          break
        }
        ;(spec.direction.palette as Record<string, string>)[key] = op.value.toLowerCase()
        // A new background colour replaces the painted background (its colours no longer fit).
        if (key === 'background') for (const [id, a] of Object.entries(spec.assets)) if (a.kind === 'background') delete spec.assets[id]
        res.relayout = true
        break
      }
      case 'set_layer_color':
        if (!/^#[0-9a-f]{6}$/i.test(op.value)) break
        for (const l of ls) {
          if (l.text) l.text.color = op.value
          else if (l.shape) l.shape.fill = op.value
          touch(l)
        }
        break
      case 'set_font': {
        const slot = op.target as 'display' | 'heading' | 'body' | 'accent'
        const fam = FONTS.find((f) => f.family.toLowerCase() === op.value.toLowerCase())
        if (!fam || !['display', 'heading', 'body', 'accent'].includes(slot)) {
          res.notes.push(`The font “${op.value}” isn’t available. Available: ${FONTS.map((f) => f.family).join(', ')}.`)
          break
        }
        spec.typography[slot] = { family: fam.family, weight: nearestWeight(fam.family, op.amount || spec.typography[slot].weight) }
        res.relayout = true
        break
      }
      case 'use_reference_typography': {
        const ref = spec.references[Math.round(op.amount) - 1]?.analysis
        if (!ref) {
          res.notes.push(`There’s no reference ${Math.round(op.amount)} with typography to copy.`)
          break
        }
        for (const t of ref.typography) {
          const slot = t.role === 'title' ? 'display' : t.role === 'subtitle' ? 'heading' : t.role === 'accent' ? 'accent' : 'body'
          const family = FAMILIES_BY_STYLE[t.style] ?? 'Montserrat'
          spec.typography[slot] = { family, weight: nearestWeight(family, WEIGHT_OF[t.weight]) }
          if (t.role === 'title') spec.direction.titleCase = t.case
        }
        res.relayout = true
        break
      }
      case 'use_reference_layout': {
        const i = Math.round(op.amount) - 1
        if (!spec.references[i]?.analysis) {
          res.notes.push(`There’s no reference ${i + 1} to follow.`)
          break
        }
        spec.primaryReference = i
        spec.mode = op.value === 'inspired' ? 'inspired' : 'replicate'
        const a = spec.references[i].analysis!
        spec.direction.speakerShape = a.speakers.shape
        for (const l of spec.layers) l.pinned = false // following a new composition moves everything (editor locks stay)
        res.relayout = true
        break
      }
      case 'set_archetype':
        if ((ARCHETYPES as readonly string[]).includes(op.value)) {
          spec.direction.archetype = op.value as (typeof ARCHETYPES)[number]
          for (const l of spec.layers) l.pinned = false
          res.relayout = true
        }
        break
      case 'set_speaker_shape':
        if (['circle', 'rounded', 'cutout', 'rect'].includes(op.value)) {
          spec.direction.speakerShape = op.value as 'circle'
          res.relayout = true
        }
        break
      case 'set_title_case':
        if (['upper', 'title', 'sentence'].includes(op.value)) {
          spec.direction.titleCase = op.value as 'upper'
          res.relayout = true
        }
        break
      case 'set_image_fade':
        for (const l of ls.filter((x) => x.image)) {
          const side = op.value as 'bottom'
          l.image = { ...l.image!, fade: op.value === 'none' || !['bottom', 'top', 'left', 'right', 'edges'].includes(op.value) ? null : { side, amount: clamp(op.amount || 0.35, 0.05, 1) } }
          touch(l)
        }
        break
      case 'hide':
      case 'show':
        for (const l of ls) {
          l.visible = op.op === 'show'
          touch(l)
        }
        break
      case 'lock':
        for (const l of ls) touch(l)
        break
      case 'restyle':
        spec.direction.notes = op.value.slice(0, 400)
        if (!res.needs.includes('director')) res.needs.push('director')
        if (!res.needs.includes('image')) res.needs.push('image')
        res.relayout = true
        break
      case 'regenerate_background':
        spec.direction.backgroundBrief = op.value.slice(0, 400) || spec.direction.backgroundBrief
        if (!res.needs.includes('image')) res.needs.push('image')
        break
    }
  }
  // Fonts named in typography must exist in the catalogue.
  for (const slot of ['display', 'heading', 'body', 'accent'] as const) spec.typography[slot].family = familyOf(spec.typography[slot].family).family
  return res
}
