/**
 * The design fonts (public/fonts, SIL OFL). The same font files are used to measure text in the browser editor and on
 * the server, and text is drawn from the font outlines, so a design looks — and wraps — exactly the same everywhere.
 * Load fonts through a FontLoader: the browser fetches /fonts/…, the server reads public/fonts from disk.
 */
import opentype from 'opentype.js'

export type FontCategory = 'sans' | 'serif' | 'display' | 'condensed' | 'script'

export interface FontFamily {
  family: string
  category: FontCategory
  /** weight → file name in public/fonts */
  files: Record<number, string>
  /** what it suits, for the Typography agent and the font picker */
  notes: string
}

export const FONTS: FontFamily[] = [
  { family: 'Inter', category: 'sans', files: { 400: 'Inter_400Regular.ttf', 500: 'Inter_500Medium.ttf', 600: 'Inter_600SemiBold.ttf', 700: 'Inter_700Bold.ttf', 800: 'Inter_800ExtraBold.ttf' }, notes: 'clean, neutral body and details' },
  { family: 'Montserrat', category: 'sans', files: { 500: 'Montserrat_500Medium.ttf', 700: 'Montserrat_700Bold.ttf', 800: 'Montserrat_800ExtraBold.ttf', 900: 'Montserrat_900Black.ttf' }, notes: 'bold geometric headlines, modern conferences' },
  { family: 'Poppins', category: 'sans', files: { 400: 'Poppins_400Regular.ttf', 600: 'Poppins_600SemiBold.ttf', 800: 'Poppins_800ExtraBold.ttf' }, notes: 'friendly, youthful, rounded' },
  { family: 'Playfair Display', category: 'serif', files: { 400: 'PlayfairDisplay_400Regular.ttf', 700: 'PlayfairDisplay_700Bold.ttf', 900: 'PlayfairDisplay_900Black.ttf' }, notes: 'elegant, premium, editorial titles' },
  { family: 'DM Serif Display', category: 'serif', files: { 400: 'DMSerifDisplay_400Regular.ttf' }, notes: 'warm high-contrast serif titles' },
  { family: 'Cinzel', category: 'serif', files: { 600: 'Cinzel_600SemiBold.ttf', 800: 'Cinzel_800ExtraBold.ttf' }, notes: 'classical, reverent, all-caps titles' },
  { family: 'Bebas Neue', category: 'condensed', files: { 400: 'BebasNeue_400Regular.ttf' }, notes: 'tall condensed impact headlines (caps only)' },
  { family: 'Oswald', category: 'condensed', files: { 500: 'Oswald_500Medium.ttf', 700: 'Oswald_700Bold.ttf' }, notes: 'condensed bold headings and dates' },
  { family: 'Great Vibes', category: 'script', files: { 400: 'GreatVibes_400Regular.ttf' }, notes: 'script accent words only — never long text' },
  // Designer display faces — distinctive, editorial, poster-grade (not the default "AI flyer" look)
  { family: 'Fraunces', category: 'serif', files: { 600: 'Fraunces_600SemiBold.ttf', 900: 'Fraunces_900Black.ttf' }, notes: 'soft, characterful modern serif — premium, warm, editorial' },
  { family: 'Bodoni Moda', category: 'serif', files: { 400: 'BodoniModa_400Regular.ttf', 700: 'BodoniModa_700Bold.ttf', 900: 'BodoniModa_900Black.ttf' }, notes: 'fashion-magazine high contrast — luxury, galas, women’s conferences' },
  { family: 'Cormorant Garamond', category: 'serif', files: { 500: 'CormorantGaramond_500Medium.ttf', 700: 'CormorantGaramond_700Bold.ttf' }, notes: 'refined classical serif — weddings, memorials, scripture' },
  { family: 'Abril Fatface', category: 'display', files: { 400: 'AbrilFatface_400Regular.ttf' }, notes: 'heavy didone poster headline' },
  { family: 'Yeseva One', category: 'display', files: { 400: 'YesevaOne_400Regular.ttf' }, notes: 'graceful heavy serif — women’s ministry, thanksgiving' },
  { family: 'Marcellus', category: 'serif', files: { 400: 'Marcellus_400Regular.ttf' }, notes: 'roman inscription caps — reverent, timeless' },
  { family: 'DM Serif Text', category: 'serif', files: { 400: 'DMSerifText_400Regular.ttf' }, notes: 'readable serif for subtitles and scripture' },
  { family: 'Anton', category: 'condensed', files: { 400: 'Anton_400Regular.ttf' }, notes: 'massive condensed impact headline — youth, revival, crusade' },
  { family: 'Big Shoulders Display', category: 'condensed', files: { 800: 'BigShouldersDisplay_800ExtraBold.ttf', 900: 'BigShouldersDisplay_900Black.ttf' }, notes: 'tall industrial condensed — bold conferences, men’s events' },
  { family: 'Archivo Black', category: 'sans', files: { 400: 'ArchivoBlack_400Regular.ttf' }, notes: 'chunky grotesque — streetwise youth events' },
  { family: 'Unbounded', category: 'display', files: { 500: 'Unbounded_500Medium.ttf', 800: 'Unbounded_800ExtraBold.ttf' }, notes: 'wide futuristic display — Gen Z, tech-forward youth' },
  { family: 'Syne', category: 'display', files: { 600: 'Syne_600SemiBold.ttf', 800: 'Syne_800ExtraBold.ttf' }, notes: 'art-gallery expressive display — creative nights, worship concerts' },
  { family: 'Bricolage Grotesque', category: 'sans', files: { 500: 'BricolageGrotesque_500Medium.ttf', 800: 'BricolageGrotesque_800ExtraBold.ttf' }, notes: 'quirky contemporary grotesque — modern church brands' },
  { family: 'Space Grotesk', category: 'sans', files: { 500: 'SpaceGrotesk_500Medium.ttf', 700: 'SpaceGrotesk_700Bold.ttf' }, notes: 'techy grotesk for dates and details' },
  { family: 'Pinyon Script', category: 'script', files: { 400: 'PinyonScript_400Regular.ttf' }, notes: 'formal copperplate script — one accent word' },
  { family: 'Alex Brush', category: 'script', files: { 400: 'AlexBrush_400Regular.ttf' }, notes: 'brush script accent — one or two words' },
]

export const familyOf = (name: string) => FONTS.find((f) => f.family.toLowerCase() === name.toLowerCase()) ?? FONTS[0]

/** The closest weight this family ships. */
export function nearestWeight(family: string, weight: number) {
  const ws = Object.keys(familyOf(family).files).map(Number)
  return ws.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), ws[0])
}
export const fontFile = (family: string, weight: number) => familyOf(family).files[nearestWeight(family, weight)]

export type FontLoader = (file: string) => Promise<ArrayBuffer>
export type Font = opentype.Font

const cache = new Map<string, Promise<Font>>()
let loader: FontLoader | null = null

/** Browser: fetch('/fonts/…'). Server: read public/fonts from disk (see server/design/raster.ts). */
export function setFontLoader(l: FontLoader) {
  loader = l
}

export function loadFont(family: string, weight: number): Promise<Font> {
  const file = fontFile(family, weight)
  let p = cache.get(file)
  if (!p) {
    if (!loader) throw new Error('No font loader set (call setFontLoader first).')
    p = loader(file).then((buf) => opentype.parse(buf))
    cache.set(file, p)
    p.catch(() => cache.delete(file))
  }
  return p
}

/** Loads every font a set of layers needs (call before measuring or rendering). */
export async function fontsFor(items: { font: string; weight: number }[]): Promise<Map<string, Font>> {
  const out = new Map<string, Font>()
  await Promise.all(
    items.map(async (i) => {
      const k = fontKey(i.font, i.weight)
      if (!out.has(k)) out.set(k, await loadFont(i.font, i.weight))
    }),
  )
  return out
}
export const fontKey = (family: string, weight: number) => `${familyOf(family).family}:${nearestWeight(family, weight)}`
