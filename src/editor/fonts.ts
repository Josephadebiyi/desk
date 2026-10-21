/**
 * Browser side of the design fonts: the same TTF files the server uses, fetched from /fonts, measured with
 * opentype.js (src/design/fonts.ts) and also registered as CSS fonts so the inline text editor and the font
 * picker show the real typeface.
 */
import { FONTS, fontFile, fontsFor, setFontLoader } from '../design/fonts'
import { layoutFonts } from '../design/layout'
import type { DesignSpec } from '../design/spec'

setFontLoader(async (file) => {
  const r = await fetch(`/fonts/${file}`)
  if (!r.ok) throw new Error(`Font ${file} could not be loaded`)
  return r.arrayBuffer()
})

const registered = new Set<string>()
/** Registers one family/weight as a CSS font (for previews and the text box while typing). */
export function cssFont(family: string, weight: number) {
  const file = fontFile(family, weight)
  if (registered.has(file) || typeof FontFace === 'undefined') return
  registered.add(file)
  const face = new FontFace(family, `url(/fonts/${file})`, { weight: String(weight) })
  face.load().then((f) => document.fonts.add(f)).catch(() => registered.delete(file))
}

/** Every font a spec needs, ready for measuring and drawing. */
export async function specFonts(spec: DesignSpec) {
  const list = layoutFonts(spec)
  list.forEach((f) => cssFont(f.font, f.weight))
  return fontsFor(list)
}

export const FONT_FAMILIES = FONTS
