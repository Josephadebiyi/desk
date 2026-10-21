/**
 * Design assets in Supabase Storage (private bucket design-assets): uploads are checked by their real bytes
 * (magic numbers), sized, stored under the church's folder, and read back as data: URIs for rendering.
 * The browser gets short-lived signed URLs.
 */
import { randomUUID } from 'node:crypto'
import { db, HttpError } from '../db'
import type { Asset } from '../../src/design/spec'

export const BUCKET = 'design-assets'
const MAX_BYTES = 10 * 1024 * 1024

type Mime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'font/ttf' | 'font/otf'
/** The real type from the file's first bytes (never trust the browser's label). */
export function sniff(b: Buffer): Mime | null {
  if (b.length < 12) return null
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (b.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  if (b.readUInt32BE(0) === 0x00010000 || b.toString('ascii', 0, 4) === 'true') return 'font/ttf'
  if (b.toString('ascii', 0, 4) === 'OTTO') return 'font/otf'
  return null
}

/** Pixel size of a PNG / JPEG / WebP / GIF. */
export function imageSize(b: Buffer, mime: Mime): { w: number; h: number } {
  try {
    if (mime === 'image/png') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
    if (mime === 'image/gif') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) }
    if (mime === 'image/webp') {
      const kind = b.toString('ascii', 12, 16)
      if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
      if (kind === 'VP8L') {
        const bits = b.readUInt32LE(21)
        return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
      }
      if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
    }
    if (mime === 'image/jpeg') {
      let i = 2
      while (i < b.length) {
        if (b[i] !== 0xff) return { w: 0, h: 0 }
        const marker = b[i + 1]
        const len = b.readUInt16BE(i + 2)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }
        i += 2 + len
      }
    }
  } catch {
    /* fall through */
  }
  return { w: 0, h: 0 }
}

export async function saveUpload(churchId: string, p: { dataUrl: string; kind: Asset['kind'] | 'font'; name?: string; cutout?: boolean }) {
  const m = /^data:[^;]+;base64,(.+)$/.exec(p.dataUrl)
  if (!m) throw new HttpError(400, 'Upload an image file.')
  const buf = Buffer.from(m[1], 'base64')
  if (buf.length > MAX_BYTES) throw new HttpError(413, 'That file is larger than 10 MB.')
  const mime = sniff(buf)
  if (!mime || (p.kind === 'font') !== mime.startsWith('font/')) throw new HttpError(400, p.kind === 'font' ? 'Upload a TTF or OTF font file.' : 'Upload a PNG, JPG, WebP or GIF image.')
  const { w, h } = mime.startsWith('image/') ? imageSize(buf, mime) : { w: 0, h: 0 }
  if (mime.startsWith('image/') && (!w || !h || w > 12000 || h > 12000)) throw new HttpError(400, 'That image couldn’t be read.')
  const id = randomUUID()
  const ext = mime.split('/')[1].replace('jpeg', 'jpg')
  const path = `${churchId}/${p.kind}/${id}.${ext}`
  const { error } = await db().storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false })
  if (error) throw new HttpError(500, `Upload failed: ${error.message}`)
  const row = { id, church_id: churchId, kind: p.kind, path, mime, width: w, height: h, bytes: buf.length, cutout: Boolean(p.cutout), name: String(p.name ?? '').slice(0, 120) }
  const { error: e2 } = await db().from('design_assets').insert(row)
  if (e2) throw new HttpError(500, 'Upload failed. Please try again.')
  return row
}

export async function assetRows(churchId: string, ids: string[]) {
  if (!ids.length) return []
  const { data } = await db().from('design_assets').select('id, church_id, kind, path, mime, width, height, cutout').in('id', ids).eq('church_id', churchId)
  return (data ?? []) as { id: string; church_id: string; kind: Asset['kind']; path: string; mime: string; width: number; height: number; cutout: boolean }[]
}

export const toAsset = (r: Awaited<ReturnType<typeof assetRows>>[number]): Asset => ({ id: r.id, kind: r.kind, path: r.path, svg: null, mime: r.mime, w: r.width, h: r.height, cutout: r.cutout, tone: null })

/** Data URIs for rendering, cached per process (assets never change once uploaded). */
const dataCache = new Map<string, string>()
export async function dataUri(a: Asset): Promise<string | null> {
  if (!a.path) return null
  const hit = dataCache.get(a.path)
  if (hit) return hit
  const { data, error } = await db().storage.from(BUCKET).download(a.path)
  if (error || !data) return null
  const uri = `data:${a.mime};base64,${Buffer.from(await data.arrayBuffer()).toString('base64')}`
  if (dataCache.size > 200) dataCache.delete(dataCache.keys().next().value!)
  dataCache.set(a.path, uri)
  return uri
}

/** Resolves every uploaded asset in a spec up front, so rendering can be synchronous. */
export async function hrefResolver(assets: Record<string, Asset>) {
  const map = new Map<string, string>()
  await Promise.all(
    Object.values(assets).map(async (a) => {
      const u = await dataUri(a)
      if (u) map.set(a.id, u)
    }),
  )
  return (a: Asset) => map.get(a.id) ?? null
}

export async function signedUrls(paths: string[], seconds = 3600) {
  const clean = [...new Set(paths.filter(Boolean))]
  if (!clean.length) return {} as Record<string, string>
  const { data } = await db().storage.from(BUCKET).createSignedUrls(clean, seconds)
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl]))
}

export async function savePng(churchId: string, designId: string, png: Buffer) {
  const path = `${churchId}/renders/${designId}.png`
  await db().storage.from(BUCKET).upload(path, png, { contentType: 'image/png', upsert: true })
  return path
}
