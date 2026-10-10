/**
 * Church logo checks and background removal, entirely in the browser (canvas, no service, no cost).
 * Works for logos on a plain background (white or any flat colour): the background is flood-filled from the edges,
 * optionally also inside letters, with soft anti-aliased edges. Busy / photo backgrounds are detected and reported
 * instead of producing a bad cut-out.
 */
export interface LogoReport {
  width: number
  height: number
  /** Edges are already transparent. */
  transparent: boolean
  /** A flat background colour that can be removed cleanly. */
  plainBackground: boolean
  /** Busy background (photo, gradient, texture): automatic removal won't be clean. */
  busyBackground: boolean
  bg: [number, number, number]
  tooSmall: boolean
  verySmall: boolean
  oddShape: boolean
}

const MAX = 2000

export async function loadLogo(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('IMAGE_READ'))
      i.src = url
    })
    const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * k))
    c.height = Math.max(1, Math.round(img.naturalHeight * k))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c
  } finally {
    URL.revokeObjectURL(url)
  }
}

const dist = (d: Uint8ClampedArray, i: number, bg: number[]) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2])

export function analyzeLogo(c: HTMLCanvasElement): LogoReport {
  const { width: w, height: h } = c
  const d = c.getContext('2d')!.getImageData(0, 0, w, h).data
  const border: number[] = []
  const step = Math.max(1, Math.floor((w + h) / 400))
  for (let x = 0; x < w; x += step) border.push(x * 4, ((h - 1) * w + x) * 4)
  for (let y = 0; y < h; y += step) border.push(y * w * 4, (y * w + w - 1) * 4)
  const clear = border.filter((i) => d[i + 3] < 24).length / border.length
  const opaque = border.filter((i) => d[i + 3] >= 24)
  // Background guess: the median of each channel along the edges.
  const med = (ch: number) => {
    const v = opaque.map((i) => d[i + ch]).sort((a, b) => a - b)
    return v.length ? v[Math.floor(v.length / 2)] : 255
  }
  const bg: [number, number, number] = [med(0), med(1), med(2)]
  const uniform = opaque.length ? opaque.filter((i) => dist(d, i, bg) < 38).length / opaque.length : 1
  const transparent = clear > 0.6
  return {
    width: w,
    height: h,
    transparent,
    plainBackground: !transparent && uniform > 0.85,
    busyBackground: !transparent && uniform < 0.65,
    bg,
    tooSmall: Math.min(w, h) < 300,
    verySmall: Math.min(w, h) < 120,
    oddShape: w / h > 4 || h / w > 4,
  }
}

/**
 * Removes the background colour. `strength` 0–100 widens the colour tolerance; `inside` also clears enclosed areas
 * of the same colour (inside letters like O, A, D). Returns a new, trimmed canvas with a little padding.
 */
export function removeBackground(src: HTMLCanvasElement, bg: [number, number, number], strength = 50, inside = true): HTMLCanvasElement {
  const { width: w, height: h } = src
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const tol = 14 + strength * 0.75 // ~14 (gentle) … ~89 (strong)
  const soft = tol * 0.9
  const isBg = new Uint8Array(w * h)
  // Flood fill from every edge pixel that looks like the background.
  const stack: number[] = []
  const push = (p: number) => {
    if (!isBg[p] && (d[p * 4 + 3] < 24 || dist(d, p * 4, bg) < tol)) {
      isBg[p] = 1
      stack.push(p)
    }
  }
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x)
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1)
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (p >= w) push(p - w)
    if (p < w * (h - 1)) push(p + w)
  }
  if (inside) for (let p = 0; p < w * h; p++) if (!isBg[p] && dist(d, p * 4, bg) < tol * 0.8) isBg[p] = 1
  // Clear the background; feather pixels that are close to it (anti-aliased edges).
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (isBg[p]) {
      d[i + 3] = 0
      continue
    }
    const near = (p % w > 0 && isBg[p - 1]) || (p % w < w - 1 && isBg[p + 1]) || (p >= w && isBg[p - w]) || (p < w * (h - 1) && isBg[p + w])
    if (near) {
      const k = Math.min(1, Math.max(0, (dist(d, i, bg) - tol) / soft))
      d[i + 3] = Math.round(d[i + 3] * (0.25 + 0.75 * k))
    }
  }
  ctx.putImageData(img, 0, 0)
  return trim(c)
}

/** Crops empty (transparent) margins and adds 4% padding. */
export function trim(src: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = src
  const d = src.getContext('2d')!.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return src // nothing left — keep as is (the dialog reports it)
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04)
  const c = document.createElement('canvas')
  c.width = x1 - x0 + 1 + pad * 2
  c.height = y1 - y0 + 1 + pad * 2
  c.getContext('2d')!.drawImage(src, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1)
  return c
}

/** Share of the image that is visible (to catch "everything was removed"). */
export function coverage(c: HTMLCanvasElement): number {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 3; i < d.length; i += 16) if (d[i] > 10) n++
  return n / (d.length / 16)
}

/** PNG file, at most 1024 px on the longest side. */
export async function toPngFile(c: HTMLCanvasElement, name = 'logo.png'): Promise<File> {
  const k = Math.min(1, 1024 / Math.max(c.width, c.height))
  const out = document.createElement('canvas')
  out.width = Math.round(c.width * k)
  out.height = Math.round(c.height * k)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(c, 0, 0, out.width, out.height)
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('PNG'))), 'image/png'))
  return new File([blob], name.replace(/\.\w+$/, '') + '.png', { type: 'image/png' })
}
