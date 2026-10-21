/**
 * Text measurement, wrapping, fitting and outlines — from the real font files, so the editor, the layout engine,
 * quality control and the exported SVG / PNG all agree on where every line breaks and how wide it is.
 */
import type opentype from 'opentype.js'
import type { Font } from './fonts'
import type { TextStyle } from './spec'

// Character → glyph without OpenType shaping (opentype.js can't run every font's substitution tables); kerning is
// still applied. Fine for the Latin scripts ZionDesk supports (en, es, fr, de, pt).
/** Kerning between two glyphs (some fonts return undefined for unknown pairs). */
const kern = (font: Font, a: opentype.Glyph, b: opentype.Glyph) => Number(font.getKerningValue(a, b)) || 0
const glyphsOf = (font: Font, text: string) => Array.from(text.normalize('NFC'), (ch) => font.charToGlyph(ch))

/** Width of one line in px (kerning + tracking in em). */
export function lineWidth(font: Font, text: string, size: number, tracking = 0): number {
  const glyphs = glyphsOf(font, text)
  const scale = size / font.unitsPerEm
  let w = 0
  for (let i = 0; i < glyphs.length; i++) {
    w += (glyphs[i].advanceWidth ?? 0) * scale
    if (i < glyphs.length - 1) w += kern(font, glyphs[i], glyphs[i + 1]) * scale + tracking * size
  }
  return w
}

export const applyCase = (s: string, t: TextStyle['transform']) => (t === 'upper' ? s.toLocaleUpperCase() : s)

/** Greedy word wrap. Explicit line breaks (\n) are kept. A single word wider than the box stays on its own line. */
export function wrap(font: Font, text: string, size: number, maxWidth: number, tracking = 0): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) {
      out.push('')
      continue
    }
    let line = words[0]
    for (const word of words.slice(1)) {
      const next = `${line} ${word}`
      if (lineWidth(font, next, size, tracking) <= maxWidth) line = next
      else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

/**
 * The largest size (from style.size down to style.minSize) at which the text fits the box in ≤ maxLines.
 * overflow = true when it doesn't fit even at minSize (QC reports it; the layout engine tries to make room).
 */
export function fitText(font: Font, style: TextStyle, boxW: number, boxH: number): NonNullable<TextStyle['fitted']> {
  const text = applyCase(style.content, style.transform)
  let size = style.size
  const min = Math.min(style.minSize, style.size)
  for (;;) {
    const lines = wrap(font, text, size, boxW, style.tracking)
    const widths = lines.map((l) => lineWidth(font, l, size, style.tracking))
    const width = Math.max(0, ...widths)
    const height = lines.length * size * style.lineHeight
    const fits = lines.length <= style.maxLines && height <= boxH + 0.5 && width <= boxW + 0.5
    if (fits || size <= min) return { size: round(size), lines, width: round(width), height: round(height), overflow: !fits }
    size = Math.max(min, size * 0.95)
  }
}

const round = (n: number) => Math.round(n * 100) / 100

const num = (v: number) => {
  const r = Math.round(v * 100) / 100
  return Number.isFinite(r) ? String(r) : '0'
}
/** Path commands → SVG path data (our own formatting: opentype.js's toPathData can print "NaN" for some values). */
function pathData(p: opentype.Path): string {
  let d = ''
  for (const c of p.commands) {
    if (c.type === 'M' || c.type === 'L') d += `${c.type}${num(c.x)} ${num(c.y)}`
    else if (c.type === 'Q') d += `Q${num(c.x1)} ${num(c.y1)} ${num(c.x)} ${num(c.y)}`
    else if (c.type === 'C') d += `C${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)}`
    else if (c.type === 'Z') d += 'Z'
  }
  return d
}
const glyphPath = (g: opentype.Glyph, x: number, y: number, size: number) => pathData(g.getPath(x, y, size))

/** SVG path data for one line of text, drawn glyph by glyph (baseline at y). */
export function linePath(font: Font, text: string, x: number, y: number, size: number, tracking = 0): string {
  const glyphs = glyphsOf(font, text)
  const scale = size / font.unitsPerEm
  let cx = x
  let d = ''
  for (let i = 0; i < glyphs.length; i++) {
    d += glyphPath(glyphs[i], cx, y, size)
    cx += (glyphs[i].advanceWidth ?? 0) * scale
    if (i < glyphs.length - 1) cx += kern(font, glyphs[i], glyphs[i + 1]) * scale + tracking * size
  }
  return d
}

/** Where each fitted line sits inside its layer box: x of the line start and baseline y. */
export function linePositions(font: Font, layer: { x: number; y: number; w: number; h: number }, style: TextStyle) {
  const f = style.fitted ?? fitText(font, style, layer.w, layer.h)
  const lh = f.size * style.lineHeight
  const ascent = (font.ascender / font.unitsPerEm) * f.size
  const descent = (-font.descender / font.unitsPerEm) * f.size
  // centre the glyph box (ascent + descent) inside each line box
  const baselineOffset = (lh - (ascent + descent)) / 2 + ascent
  const top = style.valign === 'middle' ? layer.y + (layer.h - f.height) / 2 : style.valign === 'bottom' ? layer.y + layer.h - f.height : layer.y
  return f.lines.map((line, i) => {
    const w = lineWidth(font, line, f.size, style.tracking)
    const x = style.align === 'center' ? layer.x + (layer.w - w) / 2 : style.align === 'right' ? layer.x + layer.w - w : layer.x
    return { line, x, baseline: top + i * lh + baselineOffset, width: w, size: f.size }
  })
}
