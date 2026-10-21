/**
 * Exact-resolution export, entirely in the browser (no AI): the shared SVG renderer with every image embedded,
 * then (for PNG) drawn onto a canvas at the canvas's exact pixel size.
 */
import { renderSvg } from '../design/render'
import type { Asset, DesignSpec } from '../design/spec'
import { specFonts } from './fonts'

const toDataUrl = async (url: string) => {
  const b = await (await fetch(url)).blob()
  return new Promise<string>((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = fail
    r.readAsDataURL(b)
  })
}

export async function exportSvg(spec: DesignSpec, urls: Record<string, string>) {
  const fonts = await specFonts(spec)
  const data = new Map<string, string>()
  await Promise.all(
    Object.values(spec.assets).map(async (a) => {
      const u = urls[a.id]
      if (u) data.set(a.id, u.startsWith('data:') ? u : await toDataUrl(u).catch(() => ''))
    }),
  )
  return renderSvg(spec, { fonts, href: (a: Asset) => data.get(a.id) || null })
}

export async function exportPng(spec: DesignSpec, urls: Record<string, string>, scale = 1): Promise<string> {
  const svg = await exportSvg(spec, urls)
  const img = new Image()
  img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  await img.decode()
  const c = document.createElement('canvas')
  c.width = Math.round(spec.canvas.w * scale)
  c.height = Math.round(spec.canvas.h * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  URL.revokeObjectURL(img.src)
  return c.toDataURL('image/png')
}

export function download(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
}
export const fileName = (title: string, ext: string) => `${(title || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design'}.${ext}`
