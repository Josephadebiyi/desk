/**
 * Layout agent (deterministic). Turns the content, creative direction, typography and — in replicate / inspired
 * modes — the reference analysis into exact layer boxes, then fits every text layer with the real font.
 * No AI call: the same input always gives the same layout, and the browser editor can re-run it instantly.
 * Locked layers (the user said "keep this") are left exactly where they are.
 */
import { fontKey, type Font } from './fonts'
import { contrastHex, isDark, mix, mostReadable } from './color'
import { fitText } from './text'
import type { DesignSpec, Direction, Layer, Palette, ReferenceAnalysis, TextStyle, Typography } from './spec'

type Box = { x: number; y: number; w: number; h: number }
type Fonts = Map<string, Font>

export const DEFAULT_PALETTE: Palette = { background: '#14102b', surface: '#241c4d', primary: '#ffffff', accent: '#c4ec62', text: '#ffffff', muted: '#c9c3e6' }

/** Type scale from the canvas's short side (so landscape and story get the same sizes as portrait). */
export const defaultTypography = (w: number, h = w): Typography => typographyFor(Math.min(w, h))
const typographyFor = (w: number): Typography => ({
  display: { family: 'Montserrat', weight: 900 },
  heading: { family: 'Montserrat', weight: 700 },
  body: { family: 'Inter', weight: 500 },
  accent: { family: 'Playfair Display', weight: 400 },
  scale: { title: Math.round(w * 0.105), subtitle: Math.round(w * 0.042), heading: Math.round(w * 0.032), body: Math.round(w * 0.03), small: Math.round(w * 0.023) },
  titleTracking: -0.01,
  rationale: '',
})

export const defaultDirection = (): Direction => ({
  concept: 'Clean, bold church event flyer',
  mood: ['bold', 'joyful'],
  palette: DEFAULT_PALETTE,
  archetype: 'stacked',
  speakerShape: 'circle',
  backgroundBrief: 'deep purple gradient with soft light rays',
  titleCase: 'upper',
  notes: '',
})

/** Editor fields every layer starts with. */
const EXTRA = { rotation: 0, visible: true, name: '', group: null, pinned: false }
const id = (role: string) => `l-${role.replace(/[^a-z0-9:-]/gi, '')}`

type TextIn = Pick<TextStyle, 'content' | 'font' | 'weight' | 'size' | 'minSize' | 'lineHeight' | 'align' | 'color'> & Partial<TextStyle>
function textLayer(role: string, box: Box, t: TextIn): Layer {
  return {
    id: id(role),
    role,
    kind: 'text',
    ...box,
    opacity: 1,
    locked: false,
    image: null,
    shape: null,
    background: null,
    text: { valign: 'top', tracking: 0, transform: 'none', maxLines: 3, fitted: null, ...t, shadow: t.shadow ?? null, outline: t.outline ?? null },
    ...EXTRA,
  }
}
const shapeLayer = (role: string, box: Box, shape: NonNullable<Layer['shape']>, opacity = 1): Layer => ({ id: id(role), role, kind: 'shape', ...box, opacity, locked: false, text: null, image: null, shape, background: null, ...EXTRA })
const imageLayer = (role: string, box: Box, image: Omit<NonNullable<Layer['image']>, 'crop' | 'flipX' | 'fade'> & Partial<Pick<NonNullable<Layer['image']>, 'fade'>>): Layer => ({ id: id(role), role, kind: 'image', ...box, opacity: 1, locked: false, text: null, shape: null, background: null, image: { crop: null, flipX: false, fade: null, ...image }, ...EXTRA })

/** Splits a vertical span into named zones by weight (only zones that are present), with gaps between them. */
function stackZones(top: number, bottom: number, gap: number, zones: [string, number][]) {
  const present = zones.filter(([, w]) => w > 0)
  const total = present.reduce((s, [, w]) => s + w, 0)
  const free = bottom - top - gap * (present.length - 1)
  const out: Record<string, { y: number; h: number }> = {}
  let y = top
  for (const [name, w] of present) {
    const h = (free * w) / total
    out[name] = { y, h }
    y += h + gap
  }
  return out
}

/** Grid for n speakers inside a box: columns × rows, square photo size, cell positions. */
export function speakerGrid(n: number, box: Box, labelH: number, gap: number, arrangement?: ReferenceAnalysis['speakers']['arrangement']) {
  if (!n) return { size: 0, pitch: 0, cells: [] as Box[] }
  const sizeFor = (cols: number) => {
    const rows = Math.ceil(n / cols)
    return Math.min((box.w - gap * (cols - 1)) / cols, (box.h - rows * labelH - gap * (rows - 1)) / rows, n === 1 ? box.w * 0.62 : Infinity)
  }
  // The column count that gives the largest photos (a reference's row / stack arrangement wins when it fits).
  let cols = arrangement === 'stack' ? 1 : arrangement === 'row' ? Math.min(n, 5) : 1
  if (arrangement !== 'stack' && arrangement !== 'row') for (let c = 1; c <= Math.min(n, 5); c++) if (sizeFor(c) >= sizeFor(cols) * 0.97) cols = c
  const rows = Math.ceil(n / cols)
  const size = Math.max(40, sizeFor(cols))
  const pitch = size + gap
  const cells: Box[] = []
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols)
    const inRow = Math.min(cols, n - r * cols)
    const rowW = inRow * size + (inRow - 1) * gap
    const c = i - r * cols
    const x = box.x + (box.w - rowW) / 2 + c * pitch
    const blockH = rows * (size + labelH) + (rows - 1) * gap
    const y = box.y + (box.h - blockH) / 2 + r * (size + labelH + gap)
    cells.push({ x, y, w: size, h: size })
  }
  return { size, pitch, cells }
}

const fromRegion = (r: { x: number; y: number; w: number; h: number }, W: number, H: number): Box => ({ x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H })

export function layoutSpec(spec: DesignSpec, fonts: Fonts): Layer[] {
  const { w: W, h: H } = spec.canvas
  const dir = spec.direction ?? defaultDirection()
  const ty = spec.typography ?? defaultTypography(W, H)
  const pal = dir.palette
  const c = spec.content
  const ref = spec.primaryReference !== null ? spec.references[spec.primaryReference]?.analysis ?? null : null
  const margin = Math.max(spec.constraints.minMargin, ref && spec.mode !== 'original' ? Math.min(0.12, ref.margin) * W : 0, spec.canvas.safe)
  const gap = Math.round(H * 0.018)
  const inner = { x: margin, y: margin, w: W - margin * 2, h: H - margin * 2 }
  const textOn = (bg: string, wanted: string) => (contrastHex(wanted, bg) >= 4.5 ? wanted : mostReadable(bg, ['#ffffff', '#111015', pal.text]))
  const bg = pal.background
  const titleColor = textOn(bg, pal.primary)
  const bodyColor = textOn(bg, pal.text)
  const mutedColor = contrastHex(pal.muted, bg) >= 3 ? pal.muted : bodyColor
  const accentColor = contrastHex(pal.accent, bg) >= 3 ? pal.accent : titleColor
  const shape = dir.speakerShape
  const n = c.speakers.length
  const hasLogo = Boolean(spec.brand.logoAssetId)
  const archetype = dir.archetype === 'hero-portrait' && n !== 1 ? 'stacked' : dir.archetype === 'split' && W < H * 0.9 && n > 3 ? 'stacked' : dir.archetype
  const center = archetype === 'stacked' || archetype === 'band'
  const align: TextStyle['align'] = center ? 'center' : 'left'
  const upper = dir.titleCase === 'upper' ? 'upper' : 'none'

  const layers: Layer[] = []
  // Background: the Image agent's painted asset if there is one, else a gradient from the palette.
  const bgAsset = Object.values(spec.assets).find((a) => a.kind === 'background')
  layers.push({ id: 'l-background', role: 'background', kind: 'background', x: 0, y: 0, w: W, h: H, opacity: 1, locked: false, text: null, image: null, shape: null, background: { assetId: bgAsset?.id ?? null, color: bg, gradient: bgAsset ? [] : [bg, mix(bg, pal.surface, 0.9)] }, ...EXTRA })

  const T = (role: string, box: Box, content: string, font: Typography['display'], size: number, color: string, extra: Partial<TextStyle> = {}) =>
    content.trim() && layers.push(textLayer(role, box, { content, font: font.family, weight: font.weight, size, minSize: Math.max(spec.constraints.minFont, Math.round(size * 0.5)), lineHeight: 1.15, align, color, ...extra }))

  const logoSize = Math.round(Math.min(W, H) * 0.11)
  // Room under each photo for a name on up to two lines, plus the role.
  const nameLineH = ty.scale.heading * 1.08
  const labelH = Math.round(nameLineH * 2 + (c.speakers.some((s) => s.role) ? ty.scale.small * 1.35 : 0)) + 14

  const addSpeakers = (box: Box) => {
    const g = speakerGrid(n, box, labelH, Math.round(gap * 1.2), ref && spec.mode !== 'original' ? ref.speakers.arrangement : undefined)
    c.speakers.forEach((s, i) => {
      const cell = g.cells[i]
      if (s.photoAssetId) {
        const cut = spec.assets[s.photoAssetId]?.cutout && shape === 'cutout'
        if (!cut && shape !== 'rect') layers.push(shapeLayer(`speaker-ring:${i}`, { x: cell.x - 6, y: cell.y - 6, w: cell.w + 12, h: cell.h + 12 }, { type: shape === 'circle' ? 'circle' : 'rect', fill: accentColor, stroke: null, strokeWidth: 0, radius: shape === 'rounded' ? cell.w * 0.14 : 0 }))
        layers.push(imageLayer(`speaker:${i}`, cell, { assetId: s.photoAssetId, fit: cut ? 'contain' : 'cover', mask: cut ? 'none' : shape === 'circle' ? 'circle' : shape === 'rounded' ? 'rounded' : 'none', radius: shape === 'rounded' ? cell.w * 0.12 : 0, ring: null }))
      } else {
        // No photo: a calm initials badge, so the layout stays balanced.
        layers.push(shapeLayer(`speaker-badge:${i}`, cell, { type: 'circle', fill: pal.surface, stroke: accentColor, strokeWidth: 4, radius: 0 }))
        const initials = s.name.split(/\s+/).filter((p) => /^[A-Za-zÀ-ÿ]/.test(p)).map((p) => p[0]).slice(-2).join('').toUpperCase()
        T(`speaker-initials:${i}`, { x: cell.x, y: cell.y, w: cell.w, h: cell.h }, initials || '•', ty.heading, Math.round(cell.w * 0.34), textOn(pal.surface, pal.text), { align: 'center', valign: 'middle', maxLines: 1 })
      }
      // Names may use the whole column (photo + the gap beside it); a lone speaker gets a wider label.
      const lw = n === 1 ? Math.min(box.w, cell.w * 1.6) : g.pitch - 8
      const labelBox = { x: cell.x + cell.w / 2 - lw / 2, y: cell.y + cell.h + 10, w: lw, h: Math.round(nameLineH * 2) }
      T(`speaker-name:${i}`, labelBox, s.name, ty.heading, ty.scale.heading, titleColor, { align: 'center', maxLines: 2, lineHeight: 1.05, minSize: Math.max(spec.constraints.minFont, Math.round(ty.scale.heading * 0.62)) })
      const nameLayer = layers[layers.length - 1]
      const fitted = nameLayer.role === `speaker-name:${i}` ? fitText(fonts.get(fontKey(ty.heading.family, ty.heading.weight))!, nameLayer.text!, labelBox.w, labelBox.h) : null
      if (fitted) {
        nameLayer.h = Math.ceil(fitted.height)
        nameLayer.text!.fitted = fitted
      }
      if (s.role) T(`speaker-role:${i}`, { ...labelBox, y: labelBox.y + (fitted ? nameLayer.h : labelBox.h) + 4, h: Math.round(ty.scale.small * 1.3) }, s.role, ty.body, ty.scale.small, mutedColor, { align: 'center', maxLines: 1 })
    })
  }

  const details = [c.date, c.time].filter(Boolean).join('  •  ')
  if (archetype === 'stacked' || archetype === 'band') {
    const z = stackZones(inner.y, inner.y + inner.h, gap, [
      ['head', hasLogo || c.host ? 0.085 : 0],
      ['tagline', c.tagline ? 0.04 : 0],
      ['title', (n ? (H > W * 1.4 ? 0.17 : 0.2) : 0.34) * (c.title.length > 60 ? 1.45 : c.title.length > 32 ? 1.2 : 1)],
      ['subtitle', c.subtitle ? 0.065 : 0],
      ['speakers', n ? (n > 4 ? 0.36 : n === 1 ? 0.34 : 0.26) : 0],
      ['scripture', c.scripture ? 0.055 : 0],
      ['details', details || c.venue ? 0.105 : 0],
      ['cta', c.cta ? 0.055 : 0],
    ])
    if (z.head) {
      if (hasLogo) layers.push(imageLayer('logo', { x: (W - logoSize) / 2, y: z.head.y, w: logoSize, h: Math.min(logoSize, z.head.h * (c.host ? 0.68 : 1)) }, { assetId: spec.brand.logoAssetId!, fit: 'contain', mask: 'none', radius: 0, ring: null }))
      const hostY = hasLogo ? z.head.y + z.head.h * 0.72 : z.head.y
      T('host', { x: inner.x, y: hostY, w: inner.w, h: z.head.y + z.head.h - hostY }, c.host, ty.body, ty.scale.small, mutedColor, { tracking: 0.12, transform: 'upper', maxLines: 1, valign: 'middle' })
    }
    if (z.tagline) T('tagline', { x: inner.x, ...z.tagline, w: inner.w }, c.tagline, ty.accent, ty.scale.subtitle, accentColor, { maxLines: 1, valign: 'bottom' })
    if (archetype === 'band' && z.title) layers.push(shapeLayer('panel', { x: 0, y: z.title.y - gap * 0.6, w: W, h: z.title.h + gap * 1.2 }, { type: 'rect', fill: pal.surface, stroke: null, strokeWidth: 0, radius: 0 }, 0.92))
    if (z.title) T('title', { x: inner.x, ...z.title, w: inner.w }, c.title, ty.display, ty.scale.title, titleColor, { tracking: ty.titleTracking, transform: upper, lineHeight: 1.02, maxLines: c.title.length > 32 || H > W * 1.4 ? 4 : 3, valign: 'middle', minSize: Math.max(spec.constraints.minFont, Math.round(ty.scale.title * 0.4)) })
    if (z.subtitle) T('subtitle', { x: inner.x, ...z.subtitle, w: inner.w }, c.subtitle, ty.heading, ty.scale.subtitle, bodyColor, { maxLines: 2, valign: 'top' })
    if (z.speakers) addSpeakers({ x: inner.x, ...z.speakers, w: inner.w })
    if (z.scripture) T('scripture', { x: inner.x + inner.w * 0.08, ...z.scripture, w: inner.w * 0.84 }, c.scripture, ty.accent, ty.scale.body, mutedColor, { maxLines: 2, valign: 'middle' })
    if (z.details) {
      layers.push(shapeLayer('details-panel', { x: inner.x, y: z.details.y, w: inner.w, h: z.details.h }, { type: 'rect', fill: pal.surface, stroke: null, strokeWidth: 0, radius: Math.round(z.details.h * 0.22) }, 0.88))
      const onPanel = textOn(pal.surface, pal.text)
      if (details) T('details', { x: inner.x + gap, y: z.details.y + (c.venue ? z.details.h * 0.1 : 0), w: inner.w - gap * 2, h: c.venue ? z.details.h * 0.42 : z.details.h }, details, ty.heading, ty.scale.subtitle, textOn(pal.surface, pal.accent), { maxLines: 1, valign: c.venue ? 'bottom' : 'middle', transform: 'upper', tracking: 0.04 })
      if (c.venue) T('venue', { x: inner.x + gap, y: z.details.y + (details ? z.details.h * 0.56 : 0), w: inner.w - gap * 2, h: details ? z.details.h * 0.34 : z.details.h }, c.venue, ty.body, ty.scale.body, onPanel, { maxLines: 1, valign: details ? 'top' : 'middle' })
    }
    if (z.cta) {
      const cw = Math.min(inner.w, W * 0.6)
      layers.push(shapeLayer('cta-pill', { x: (W - cw) / 2, y: z.cta.y, w: cw, h: z.cta.h }, { type: 'rect', fill: accentColor, stroke: null, strokeWidth: 0, radius: z.cta.h / 2 }))
      T('cta', { x: (W - cw) / 2 + gap, y: z.cta.y, w: cw - gap * 2, h: z.cta.h }, c.cta, ty.heading, ty.scale.body, mostReadable(accentColor, ['#111015', '#ffffff']), { maxLines: 1, valign: 'middle', align: 'center', transform: 'upper', tracking: 0.06 })
    }
  } else {
    // split / hero-portrait: text column on the left, speakers (or one large portrait) on the right
    const colW = archetype === 'hero-portrait' ? inner.w * 0.56 : inner.w * (n ? 0.52 : 1)
    const z = stackZones(inner.y, inner.y + inner.h, gap, [
      ['head', hasLogo || c.host ? 0.09 : 0],
      ['tagline', c.tagline ? 0.05 : 0],
      ['title', 0.3],
      ['subtitle', c.subtitle ? 0.1 : 0],
      ['scripture', c.scripture ? 0.08 : 0],
      ['details', details || c.venue ? 0.16 : 0],
      ['cta', c.cta ? 0.07 : 0],
    ])
    if (z.head) {
      if (hasLogo) layers.push(imageLayer('logo', { x: inner.x, y: z.head.y, w: logoSize, h: Math.min(logoSize, z.head.h) }, { assetId: spec.brand.logoAssetId!, fit: 'contain', mask: 'none', radius: 0, ring: null }))
      T('host', { x: inner.x + (hasLogo ? logoSize + gap : 0), y: z.head.y, w: colW - (hasLogo ? logoSize + gap : 0), h: z.head.h }, c.host, ty.body, ty.scale.small, mutedColor, { tracking: 0.12, transform: 'upper', maxLines: 2, valign: 'middle', align: 'left' })
    }
    if (z.tagline) T('tagline', { x: inner.x, ...z.tagline, w: colW }, c.tagline, ty.accent, ty.scale.subtitle, accentColor, { maxLines: 1 })
    T('title', { x: inner.x, ...z.title, w: colW }, c.title, ty.display, Math.round(ty.scale.title * 0.95), titleColor, { tracking: ty.titleTracking, transform: upper, lineHeight: 1.02, maxLines: 4, valign: 'middle' })
    if (z.subtitle) T('subtitle', { x: inner.x, ...z.subtitle, w: colW }, c.subtitle, ty.heading, ty.scale.subtitle, bodyColor, { maxLines: 3 })
    if (z.scripture) T('scripture', { x: inner.x, ...z.scripture, w: colW }, c.scripture, ty.accent, ty.scale.body, mutedColor, { maxLines: 3 })
    if (z.details) {
      if (details) T('details', { x: inner.x, y: z.details.y, w: colW, h: z.details.h * 0.5 }, details, ty.heading, ty.scale.subtitle, accentColor, { maxLines: 1, transform: 'upper', valign: 'bottom', tracking: 0.04 })
      if (c.venue) T('venue', { x: inner.x, y: z.details.y + z.details.h * 0.52, w: colW, h: z.details.h * 0.48 }, c.venue, ty.body, ty.scale.body, bodyColor, { maxLines: 2 })
    }
    if (z.cta) {
      const cw = Math.min(colW, W * 0.4)
      layers.push(shapeLayer('cta-pill', { x: inner.x, y: z.cta.y, w: cw, h: z.cta.h }, { type: 'rect', fill: accentColor, stroke: null, strokeWidth: 0, radius: z.cta.h / 2 }))
      T('cta', { x: inner.x + gap, y: z.cta.y, w: cw - gap * 2, h: z.cta.h }, c.cta, ty.heading, ty.scale.body, mostReadable(accentColor, ['#111015', '#ffffff']), { maxLines: 1, valign: 'middle', align: 'center', transform: 'upper', tracking: 0.06 })
    }
    if (archetype === 'hero-portrait' && n === 1 && c.speakers[0].photoAssetId) {
      const s = c.speakers[0]
      const a = spec.assets[s.photoAssetId!]
      const ph = H * 0.78
      const pw = a ? Math.min(W * 0.5, (ph * a.w) / a.h) : W * 0.45
      const box = { x: W - pw - (a?.cutout ? 0 : margin), y: H - ph - (a?.cutout ? 0 : margin), w: pw, h: ph }
      layers.push(imageLayer('speaker:0', box, { assetId: s.photoAssetId!, fit: a?.cutout ? 'contain' : 'cover', mask: a?.cutout ? 'none' : 'rounded', radius: a?.cutout ? 0 : pw * 0.06, ring: null, fade: { side: 'bottom', amount: a?.cutout ? 0.22 : 0.35 } }))
      const nameBox = { x: box.x, y: box.y + box.h - ty.scale.heading * 2.6, w: box.w, h: ty.scale.heading * 1.3 }
      layers.push(shapeLayer('speaker-label-panel', { x: nameBox.x + gap, y: nameBox.y - 8, w: nameBox.w - gap * 2, h: nameBox.h * (s.role ? 2 : 1) + 16 }, { type: 'rect', fill: pal.surface, stroke: null, strokeWidth: 0, radius: 16 }, 0.9))
      T('speaker-name:0', { ...nameBox, x: nameBox.x + gap * 2, w: nameBox.w - gap * 4 }, s.name, ty.heading, ty.scale.heading, textOn(pal.surface, pal.primary), { align: 'center', maxLines: 1 })
      if (s.role) T('speaker-role:0', { x: nameBox.x + gap * 2, y: nameBox.y + nameBox.h, w: nameBox.w - gap * 4, h: nameBox.h * 0.9 }, s.role, ty.body, ty.scale.small, textOn(pal.surface, pal.muted), { align: 'center', maxLines: 1 })
    } else if (n) {
      addSpeakers({ x: inner.x + colW + gap * 2, y: inner.y, w: inner.w - colW - gap * 2, h: inner.h })
    }
  }

  // Replicate: put each role where the reference has it (the reference's own composition, the user's content).
  if (ref && spec.mode === 'replicate') {
    for (const r of ref.regions) {
      const box = fromRegion(r, W, H)
      if (r.role === 'speakers') continue // speakers keep the grid (counts differ); their zone follows below
      const l = layers.find((x) => x.role === r.role)
      if (l) Object.assign(l, box)
    }
    const sp = ref.regions.find((r) => r.role === 'speakers')
    if (sp && n) {
      const keep = layers.filter((l) => !/^speaker/.test(l.role))
      layers.length = 0
      layers.push(...keep)
      addSpeakers(fromRegion(sp, W, H))
    }
  }

  // Fit every text layer with the real font.
  for (const l of layers) if (l.text) l.text.fitted = fitText(fonts.get(fontKey(l.text.font, l.text.weight))!, l.text, l.w, l.h)

  // Keep the user's own changes (pinned) and editor-locked layers exactly as they were; keep layers the user added.
  const keep = new Map(spec.layers.filter((l) => l.locked || l.pinned || l.role.startsWith('custom')).map((l) => [l.id, l]))
  const merged = layers.map((l) => keep.get(l.id) ?? l)
  for (const l of keep.values()) if (!merged.some((m) => m.id === l.id)) merged.push(l)
  return merged
}

/** Every font the layout will use (load these before layoutSpec). */
export function layoutFonts(spec: DesignSpec) {
  const ty = spec.typography ?? defaultTypography(spec.canvas.w, spec.canvas.h)
  return [ty.display, ty.heading, ty.body, ty.accent].map((f) => ({ font: f.family, weight: f.weight })).concat(spec.layers.filter((l) => l.text).map((l) => ({ font: l.text!.font, weight: l.text!.weight })))
}

export const darkBackground = (spec: DesignSpec) => isDark((spec.direction ?? defaultDirection()).palette.background)
