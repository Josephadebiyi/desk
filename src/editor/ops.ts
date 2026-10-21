/**
 * Manual editing operations — pure functions on the DesignSpec, run in the browser only (no AI, no server).
 * Every change returns a new spec; unchanged parts (assets, other layers) are shared, so undo history stays cheap.
 * Anything the user changes by hand is "pinned", so a later AI relayout keeps it.
 */
import { fontKey, type Font } from '../design/fonts'
import { layoutSpec } from '../design/layout'
import { fitText } from '../design/text'
import type { DesignSpec, Layer, TextStyle } from '../design/spec'

type Fonts = Map<string, Font>
const uid = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 12)

export const layerById = (s: DesignSpec, id: string) => s.layers.find((l) => l.id === id)

export function patchLayer(s: DesignSpec, id: string, patch: Partial<Layer>, fonts?: Fonts): DesignSpec {
  return {
    ...s,
    layers: s.layers.map((l) => {
      if (l.id !== id) return l
      const next = { ...l, ...patch, pinned: true }
      return fonts && next.text ? refit(next, fonts) : next
    }),
  }
}

export function patchText(s: DesignSpec, id: string, patch: Partial<TextStyle>, fonts: Fonts): DesignSpec {
  const l = layerById(s, id)
  if (!l?.text) return s
  let spec = patchLayer(s, id, { text: { ...l.text, ...patch, fitted: null } }, fonts)
  // Editing a piece of the user's content on the canvas updates the content too (so checks stay right).
  if (patch.content !== undefined) spec = syncContent(spec, l.role, patch.content)
  return spec
}

function syncContent(s: DesignSpec, role: string, text: string): DesignSpec {
  const c = { ...s.content }
  const simple = ['title', 'subtitle', 'tagline', 'venue', 'host', 'scripture', 'cta'] as const
  if ((simple as readonly string[]).includes(role)) (c as Record<string, unknown>)[role] = text
  const m = /^speaker-(name|role):(\d+)$/.exec(role)
  if (m) c.speakers = c.speakers.map((sp, i) => (i === Number(m[2]) ? { ...sp, [m[1]]: text } : sp))
  if (role === 'details') {
    const [date, time] = text.split(/\s*•\s*/)
    c.date = date ?? ''
    c.time = time ?? ''
  }
  return { ...s, content: c }
}

/** Fit a text layer's words to its box with the real font. */
export function refit(l: Layer, fonts: Fonts): Layer {
  if (!l.text) return l
  const f = fonts.get(fontKey(l.text.font, l.text.weight))
  return f ? { ...l, text: { ...l.text, fitted: fitText(f, l.text, l.w, l.h) } } : l
}

export const refitAll = (s: DesignSpec, fonts: Fonts): DesignSpec => ({ ...s, layers: s.layers.map((l) => (l.text && !l.text.fitted ? refit(l, fonts) : l)) })

export function addLayer(s: DesignSpec, l: Omit<Layer, 'id'> & { id?: string }, fonts?: Fonts): { spec: DesignSpec; id: string } {
  const id = l.id ?? `l-custom-${uid()}`
  const layer = { ...l, id, pinned: true } as Layer
  return { spec: { ...s, layers: [...s.layers, fonts ? refit(layer, fonts) : layer] }, id }
}

const base = { rotation: 0, opacity: 1, visible: true, group: null, locked: false, pinned: true, text: null, image: null, shape: null, background: null }
export const newText = (s: DesignSpec, font = 'Montserrat'): Omit<Layer, 'id'> => {
  const w = s.canvas.w * 0.6
  const size = Math.round(Math.min(s.canvas.w, s.canvas.h) * 0.06)
  return {
    ...base,
    role: `custom-text:${uid()}`,
    kind: 'text',
    name: 'Text',
    x: (s.canvas.w - w) / 2,
    y: s.canvas.h * 0.45,
    w,
    h: size * 2.4,
    text: { content: 'Your text', font, weight: 700, size, minSize: 12, lineHeight: 1.15, align: 'center', valign: 'middle', color: s.direction?.palette.text ?? '#111015', tracking: 0, transform: 'none', maxLines: 6, fitted: null, shadow: null, outline: null },
  }
}
export const newShape = (s: DesignSpec, type: 'rect' | 'circle' | 'line'): Omit<Layer, 'id'> => {
  const size = Math.min(s.canvas.w, s.canvas.h) * 0.3
  return { ...base, role: `custom-shape:${uid()}`, kind: 'shape', name: type === 'circle' ? 'Circle' : type === 'line' ? 'Line' : 'Rectangle', x: (s.canvas.w - size) / 2, y: (s.canvas.h - size) / 2, w: size, h: type === 'line' ? 8 : size, shape: { type, fill: s.direction?.palette.accent ?? '#6c34ff', stroke: null, strokeWidth: 0, radius: type === 'rect' ? 24 : 0 } }
}
export const newImage = (s: DesignSpec, assetId: string, w: number, h: number, kind: 'logo' | 'portrait' | 'decor'): Omit<Layer, 'id'> => {
  const max = Math.min(s.canvas.w, s.canvas.h) * (kind === 'logo' ? 0.2 : 0.45)
  const k = Math.min(max / w, max / h)
  return { ...base, role: `custom-image:${uid()}`, kind: 'image', name: kind === 'logo' ? 'Logo' : 'Photo', x: (s.canvas.w - w * k) / 2, y: (s.canvas.h - h * k) / 2, w: w * k, h: h * k, image: { assetId, fit: kind === 'portrait' ? 'cover' : 'contain', mask: 'none', radius: 0, ring: null, crop: null, flipX: false, fade: null } }
}

export function removeLayers(s: DesignSpec, ids: string[]): DesignSpec {
  const del = new Set(ids)
  return { ...s, layers: s.layers.filter((l) => !del.has(l.id) || l.kind === 'background') }
}

export function duplicate(s: DesignSpec, ids: string[]): { spec: DesignSpec; ids: string[] } {
  const out: Layer[] = []
  const created: string[] = []
  const group = ids.length > 1 ? `g-${uid()}` : null
  for (const l of s.layers) {
    out.push(l)
    if (ids.includes(l.id) && l.kind !== 'background') {
      const id = `l-custom-${uid()}`
      created.push(id)
      out.push({ ...structuredClone(l), id, role: `custom-${l.kind}:${uid()}`, name: `${l.name || l.role} copy`, x: l.x + 24, y: l.y + 24, pinned: true, locked: false, group: l.group ? group : null })
    }
  }
  return { spec: { ...s, layers: out }, ids: created }
}

/** Move layers up / down / to the front / to the back (the background always stays at the bottom). */
export function reorder(s: DesignSpec, ids: string[], where: 'up' | 'down' | 'top' | 'bottom'): DesignSpec {
  const bg = s.layers.filter((l) => l.kind === 'background')
  let rest = s.layers.filter((l) => l.kind !== 'background')
  const sel = new Set(ids)
  if (where === 'top') rest = [...rest.filter((l) => !sel.has(l.id)), ...rest.filter((l) => sel.has(l.id))]
  else if (where === 'bottom') rest = [...rest.filter((l) => sel.has(l.id)), ...rest.filter((l) => !sel.has(l.id))]
  else {
    const order = where === 'up' ? [...rest.keys()].reverse() : [...rest.keys()]
    for (const i of order) {
      const j = where === 'up' ? i + 1 : i - 1
      if (sel.has(rest[i].id) && j >= 0 && j < rest.length && !sel.has(rest[j].id)) [rest[i], rest[j]] = [rest[j], rest[i]]
    }
  }
  return { ...s, layers: [...bg, ...rest] }
}

export function group(s: DesignSpec, ids: string[]): DesignSpec {
  const g = `g-${uid()}`
  return { ...s, layers: s.layers.map((l) => (ids.includes(l.id) && l.kind !== 'background' ? { ...l, group: g } : l)) }
}
export const ungroup = (s: DesignSpec, ids: string[]): DesignSpec => {
  const groups = new Set(s.layers.filter((l) => ids.includes(l.id)).map((l) => l.group).filter(Boolean))
  return { ...s, layers: s.layers.map((l) => (l.group && groups.has(l.group) ? { ...l, group: null } : l)) }
}
/** Selecting one member of a group selects the whole group. */
export const withGroups = (s: DesignSpec, ids: string[]) => {
  const groups = new Set(s.layers.filter((l) => ids.includes(l.id) && l.group).map((l) => l.group))
  return [...new Set([...ids, ...s.layers.filter((l) => l.group && groups.has(l.group)).map((l) => l.id)])]
}

/** Moves several layers by the same amount (multi-select / groups). */
export const moveBy = (s: DesignSpec, ids: string[], dx: number, dy: number): DesignSpec => ({ ...s, layers: s.layers.map((l) => (ids.includes(l.id) && !l.locked && l.kind !== 'background' ? { ...l, x: l.x + dx, y: l.y + dy, pinned: true } : l)) })

/** New canvas size: scale everything proportionally and centre it, or re-run the (deterministic) layout. */
export function resizeCanvas(s: DesignSpec, w: number, h: number, mode: 'scale' | 'relayout', fonts: Fonts, format: DesignSpec['canvas']['format']): DesignSpec {
  const next: DesignSpec = { ...s, canvas: { ...s.canvas, w, h, format, safe: Math.round(Math.min(w, h) * 0.06) }, constraints: { ...s.constraints, minMargin: Math.round(Math.min(w, h) * 0.05) } }
  if (mode === 'relayout') {
    // keep only what the user added by hand; everything else is laid out again for the new size
    const own = s.layers.filter((l) => l.role.startsWith('custom'))
    const fresh = layoutSpec({ ...next, layers: [], typography: s.typography && scaleType(s.typography, Math.min(w, h) / Math.min(s.canvas.w, s.canvas.h)) }, fonts)
    return { ...next, typography: s.typography && scaleType(s.typography, Math.min(w, h) / Math.min(s.canvas.w, s.canvas.h)), layers: [...fresh, ...own.map((l) => scaleLayer(l, w / s.canvas.w, h / s.canvas.h, Math.min(w / s.canvas.w, h / s.canvas.h), fonts))] }
  }
  const k = Math.min(w / s.canvas.w, h / s.canvas.h)
  const ox = (w - s.canvas.w * k) / 2
  const oy = (h - s.canvas.h * k) / 2
  return {
    ...next,
    layers: s.layers.map((l) => (l.kind === 'background' ? { ...l, x: 0, y: 0, w, h } : scaleLayer({ ...l, x: l.x * k + ox, y: l.y * k + oy, w: l.w * k, h: l.h * k }, 1, 1, k, fonts))),
  }
}
const scaleType = (t: NonNullable<DesignSpec['typography']>, k: number) => ({ ...t, scale: Object.fromEntries(Object.entries(t.scale).map(([key, v]) => [key, Math.round(v * k)])) as typeof t.scale })
function scaleLayer(l: Layer, kx: number, ky: number, kText: number, fonts: Fonts): Layer {
  const out: Layer = { ...l, x: l.x * kx, y: l.y * ky, w: l.w * kx, h: l.h * ky }
  if (out.text) out.text = { ...out.text, size: out.text.size * kText, minSize: Math.max(10, out.text.minSize * kText), fitted: null }
  if (out.shape) out.shape = { ...out.shape, radius: out.shape.radius * kText, strokeWidth: out.shape.strokeWidth * kText }
  if (out.image) out.image = { ...out.image, radius: out.image.radius * kText }
  return refit(out, fonts)
}

/* ───────── smart guides & snapping ───────── */

export interface Guide {
  axis: 'x' | 'y'
  at: number
}
/** Snaps a moving box to the canvas edges / centre / safe margin and to other layers' edges and centres. */
export function snap(s: DesignSpec, box: { x: number; y: number; w: number; h: number }, ignore: string[], threshold: number) {
  const W = s.canvas.w
  const H = s.canvas.h
  const m = s.constraints.minMargin
  const xs = [0, W / 2, W, m, W - m]
  const ys = [0, H / 2, H, m, H - m]
  for (const l of s.layers) {
    if (ignore.includes(l.id) || l.kind === 'background' || !l.visible) continue
    xs.push(l.x, l.x + l.w / 2, l.x + l.w)
    ys.push(l.y, l.y + l.h / 2, l.y + l.h)
  }
  const guides: Guide[] = []
  const best = (edges: number[], targets: number[]) => {
    let d = Infinity
    let to = 0
    for (const e of edges)
      for (const t of targets)
        if (Math.abs(t - e) < Math.abs(d)) {
          d = t - e
          to = t
        }
    return Math.abs(d) <= threshold ? { d, to } : null
  }
  const sx = best([box.x, box.x + box.w / 2, box.x + box.w], xs)
  const sy = best([box.y, box.y + box.h / 2, box.y + box.h], ys)
  if (sx) guides.push({ axis: 'x', at: sx.to })
  if (sy) guides.push({ axis: 'y', at: sy.to })
  return { x: box.x + (sx?.d ?? 0), y: box.y + (sy?.d ?? 0), guides }
}
