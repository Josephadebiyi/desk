/** Colour helpers: WCAG contrast, mixing, readable text colours. */

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance([r, g, b]: [number, number, number]) {
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}
export function contrast(a: [number, number, number], b: [number, number, number]) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
export const contrastHex = (a: string, b: string) => contrast(hexToRgb(a), hexToRgb(b))
export const isDark = (hex: string) => luminance(hexToRgb(hex)) < 0.35

export function mix(a: string, b: string, t: number) {
  const [x, y] = [hexToRgb(a), hexToRgb(b)]
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t)
}

/** The colour (of the candidates) that reads best on `bg`. */
export const mostReadable = (bg: string, candidates: string[]) => candidates.reduce((best, c) => (contrastHex(c, bg) > contrastHex(best, bg) ? c : best), candidates[0])
