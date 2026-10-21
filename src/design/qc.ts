/**
 * Quality control — automatic, deterministic checks on a laid-out DesignSpec (no AI). Runs in the browser editor
 * (live warnings) and on the server after every render. Subjective review (composition, polish) is the server's
 * visual pass with Claude; this file covers everything that can be measured.
 */
import { contrast, hexToRgb, mix } from './color'
import { requiredText, type DesignSpec, type Layer, type QcIssue } from './spec'

type Box = { x: number; y: number; w: number; h: number }
type RGB = [number, number, number]

export interface QcOptions {
  /** Average colour behind a box, from a render without text (server: resvg pixels). Falls back to layer colours. */
  sample?: (box: Box) => RGB | null
}

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h)
function overlap(a: Box, b: Box) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim()

/** The box the text actually covers (fitted lines), not the whole layer box. */
export function inkBox(l: Layer): Box {
  const f = l.text?.fitted
  if (!l.text || !f) return l
  const x = l.text.align === 'center' ? l.x + (l.w - f.width) / 2 : l.text.align === 'right' ? l.x + l.w - f.width : l.x
  const y = l.text.valign === 'middle' ? l.y + (l.h - f.height) / 2 : l.text.valign === 'bottom' ? l.y + l.h - f.height : l.y
  return { x, y, w: f.width, h: f.height }
}

const content = (l: Layer) => l.visible && (l.kind === 'text' || l.kind === 'image')
// Layers that are meant to sit on / inside one another.
const decorative = (r: string) => /^(speaker-ring|speaker-badge|panel|details-panel|cta-pill|speaker-label-panel)/.test(r)
/** Pairs allowed to overlap: initials inside their badge; a hero portrait's own name label sitting on the photo. */
const pairOk = (a: Layer, b: Layer, hero: boolean) => {
  if (/^speaker-initials/.test(a.role) || /^speaker-initials/.test(b.role)) return true
  const ix = (r: string) => r.split(':')[1]
  const isPhoto = (r: string) => r.startsWith('speaker:')
  const isLabel = (r: string) => /^speaker-(name|role):/.test(r)
  return hero && ix(a.role) === ix(b.role) && ((isPhoto(a.role) && isLabel(b.role)) || (isPhoto(b.role) && isLabel(a.role)))
}

/** Colour behind a box from the layer stack (topmost background / shape under the box centre). */
function colourBehind(spec: DesignSpec, l: Layer, box: Box): RGB {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const idx = spec.layers.indexOf(l)
  for (let i = idx - 1; i >= 0; i--) {
    const u = spec.layers[i]
    if (!u.visible || cx < u.x || cx > u.x + u.w || cy < u.y || cy > u.y + u.h) continue
    if (u.kind === 'shape' && u.shape?.fill) {
      const top = hexToRgb(u.shape.fill)
      if (u.opacity >= 1) return top
      const below = colourBehind(spec, u, box)
      return below.map((v, i) => v + (top[i] - v) * u.opacity) as RGB
    }
    if (u.kind === 'background' && u.background) {
      const g = u.background.gradient
      return hexToRgb(g.length > 1 ? mix(g[0], g[g.length - 1], cy / spec.canvas.h) : u.background.color)
    }
  }
  return [255, 255, 255]
}

export function runQc(spec: DesignSpec, o: QcOptions = {}): QcIssue[] {
  const issues: QcIssue[] = []
  const add = (code: QcIssue['code'], severity: QcIssue['severity'], message: string, layerId: string | null = null) => issues.push({ code, severity, message, layerId })
  const { w: W, h: H } = spec.canvas
  const m = spec.constraints.minMargin
  const layers = spec.layers.filter((l) => l.visible)

  // Missing / misspelled: every piece of the user's text, exactly as they wrote it.
  for (const req of requiredText(spec.content)) {
    const l = layers.find((x) => x.role === req.role && x.text)
    if (!l) add('missing', 'error', `“${req.text}” (${req.role}) isn’t on the design.`)
    else if (norm(l.text!.content) !== norm(req.text)) add('spelling', 'error', `${req.role} reads “${l.text!.content}” but should be “${req.text}”.`, l.id)
  }
  const details = [spec.content.date, spec.content.time].filter(Boolean)
  if (details.length && !layers.some((l) => l.text && details.every((d) => l.text!.content.includes(d)))) add('missing', 'error', `The date / time (${details.join(', ')}) isn’t on the design.`)
  if (spec.content.venue && !layers.some((l) => l.text && norm(l.text.content) === norm(spec.content.venue))) add('missing', 'error', `The venue “${spec.content.venue}” isn’t on the design.`)
  if (spec.brand.logoAssetId && !layers.some((l) => l.image?.assetId === spec.brand.logoAssetId)) add('missing', 'error', 'The church logo isn’t on the design.')
  spec.content.speakers.forEach((s, i) => {
    if (s.photoAssetId && !layers.some((l) => l.image?.assetId === s.photoAssetId)) add('missing', 'error', `${s.name}’s photo isn’t on the design.`)
    void i
  })

  for (const l of layers) {
    // Overflow: text that doesn't fit its box even at the smallest allowed size.
    if (l.text?.fitted?.overflow) add('overflow', 'error', `${l.name || l.role} doesn’t fit its box (${l.text.fitted.lines.length} lines at ${Math.round(l.text.fitted.size)}px).`, l.id)
    if (l.text?.fitted && l.text.fitted.size < spec.constraints.minFont) add('overflow', 'warning', `${l.name || l.role} is very small (${Math.round(l.text.fitted.size)}px).`, l.id)
    // Clipped: content running off the canvas.
    if (content(l) && !l.rotation) {
      const b = l.text ? inkBox(l) : l
      const off = b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1
      const cutoutEdge = l.image && spec.assets[l.image.assetId]?.cutout // cut-out portraits may bleed off an edge on purpose
      if (off && !cutoutEdge) add('clipped', 'error', `${l.name || l.role} runs off the edge of the canvas.`, l.id)
      else if (!off && !cutoutEdge && (b.x < m - 1 || b.y < m - 1 || b.x + b.w > W - m + 1 || b.y + b.h > H - m + 1)) add('margins', 'warning', `${l.name || l.role} sits inside the safe margin.`, l.id)
    }
    // Images: distortion, aspect, resolution.
    if (l.image) {
      const a = spec.assets[l.image.assetId]
      if (a && a.w > 0 && a.h > 0 && !a.svg) {
        const scale = l.image.fit === 'cover' ? Math.max(l.w / a.w, l.h / a.h) : Math.min(l.w / a.w, l.h / a.h)
        const zoom = l.image.crop ? 1 / Math.min(l.image.crop.w, l.image.crop.h) : 1
        if (scale * zoom > 1.6) add('low_res', 'warning', `${l.name || l.role} is enlarged ${Math.round(scale * zoom * 10) / 10}× — upload a sharper image.`, l.id)
        const boxR = l.w / l.h
        const imgR = a.w / a.h
        if (a.kind === 'logo' && l.image.fit === 'contain' && Math.max(boxR / imgR, imgR / boxR) > 2.2) add('aspect', 'warning', 'The logo box doesn’t match the logo’s shape, so the logo shows small.', l.id)
      }
      if (!a) add('missing', 'error', `${l.name || l.role} points at an image that isn’t uploaded.`, l.id)
    }
  }

  // Collisions between pieces of content (text ink boxes, images).
  const things = layers.filter((l) => content(l) && !decorative(l.role))
  for (let i = 0; i < things.length; i++)
    for (let j = i + 1; j < things.length; j++) {
      const [a, b] = [things[i], things[j]]
      if (pairOk(a, b, spec.direction?.archetype === 'hero-portrait')) continue
      const [ba, bb] = [a.text ? inkBox(a) : a, b.text ? inkBox(b) : b]
      const o = overlap(ba, bb)
      if (o > 0.04 * Math.min(area(ba), area(bb))) add('collision', 'error', `${a.name || a.role} overlaps ${b.name || b.role}.`, b.id)
    }

  // Consistent outer margins (left vs right, for a centred composition).
  const boxes = things.filter((l) => !l.rotation).map((l) => (l.text ? inkBox(l) : l))
  if (boxes.length > 2) {
    const left = Math.min(...boxes.map((b) => b.x))
    const right = W - Math.max(...boxes.map((b) => b.x + b.w))
    const centred = layers.filter((l) => l.text).every((l) => l.text!.align === 'center')
    if (centred && Math.abs(left - right) > W * 0.05) add('margins', 'warning', `Left and right margins differ (${Math.round(left)}px vs ${Math.round(right)}px).`)
  }

  // Contrast of every text layer against what is behind it.
  for (const l of layers.filter((x) => x.text?.fitted)) {
    const box = inkBox(l)
    const behind = o.sample?.(box) ?? colourBehind(spec, l, box)
    const ratio = contrast(hexToRgb(l.text!.color), behind)
    const large = (l.text!.fitted!.size ?? 0) >= 36
    const need = large ? spec.constraints.minContrast : 4.5
    if (ratio < need && !l.text!.outline) add('contrast', ratio < need * 0.7 ? 'error' : 'warning', `${l.name || l.role} is hard to read (contrast ${ratio.toFixed(1)}:1, needs ${need}:1).`, l.id)
  }

  // Replicate mode: content should sit where the reference has it.
  const ref = spec.primaryReference !== null ? spec.references[spec.primaryReference]?.analysis : null
  if (ref && spec.mode === 'replicate') {
    for (const r of ref.regions) {
      const l = layers.find((x) => x.role === r.role)
      if (!l) continue
      const target = { x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H }
      const o = overlap(l, target)
      const iou = o / (area(l) + area(target) - o || 1)
      if (iou < 0.3) add('reference_mismatch', 'warning', `${l.name || l.role} isn’t where the reference places it.`, l.id)
    }
  }
  return issues
}

export const qcPassed = (issues: QcIssue[]) => !issues.some((i) => i.severity === 'error')
