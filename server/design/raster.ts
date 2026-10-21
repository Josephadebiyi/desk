/**
 * Server rendering: the shared SVG renderer + resvg → PNG at the exact canvas size, and pixel sampling for
 * quality control (what colour is really behind each line of text). Fonts come from public/fonts on disk.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { fontsFor, setFontLoader } from '../../src/design/fonts'
import { layoutFonts } from '../../src/design/layout'
import { renderSvg } from '../../src/design/render'
import type { Asset, DesignSpec, Layer } from '../../src/design/spec'

const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/fonts')
setFontLoader(async (file) => {
  const b = await readFile(path.join(FONT_DIR, path.basename(file)))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
})

export const specFonts = (spec: DesignSpec) => fontsFor(layoutFonts(spec))

export function rasterize(svg: string, width: number): { png: Buffer; pixels: Buffer; w: number; h: number } {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false }, imageRendering: 0, shapeRendering: 2 })
  const img = r.render()
  return { png: img.asPng(), pixels: Buffer.from(img.pixels), w: img.width, h: img.height }
}

export interface Rendered {
  svg: string
  png: Buffer
  /** average RGB behind a box in a render without text (for contrast checks) */
  sample: (box: { x: number; y: number; w: number; h: number }) => [number, number, number] | null
}

/** Renders the spec (and a text-free copy for contrast sampling). `href` resolves image assets to data: URIs. */
export async function renderSpec(spec: DesignSpec, href: (a: Asset) => string | null, opts: { sampleScale?: number } = {}): Promise<Rendered> {
  const fonts = await specFonts(spec)
  const svg = renderSvg(spec, { fonts, href })
  const { png } = rasterize(svg, spec.canvas.w)
  const scale = opts.sampleScale ?? 0.25
  const plain = rasterize(renderSvg(spec, { fonts, href, noText: true }), Math.round(spec.canvas.w * scale))
  const sample = (b: { x: number; y: number; w: number; h: number }): [number, number, number] | null => {
    const x0 = Math.max(0, Math.floor(b.x * scale))
    const y0 = Math.max(0, Math.floor(b.y * scale))
    const x1 = Math.min(plain.w, Math.ceil((b.x + b.w) * scale))
    const y1 = Math.min(plain.h, Math.ceil((b.y + b.h) * scale))
    if (x1 <= x0 || y1 <= y0) return null
    let r = 0
    let g = 0
    let bl = 0
    let n = 0
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * plain.w + x) * 4
        r += plain.pixels[i]
        g += plain.pixels[i + 1]
        bl += plain.pixels[i + 2]
        n++
      }
    return n ? [r / n, g / n, bl / n] : null
  }
  return { svg, png, sample }
}

/** Layers by role, for tests and debugging. */
export const byRole = (spec: DesignSpec) => Object.fromEntries(spec.layers.map((l: Layer) => [l.role, l]))
