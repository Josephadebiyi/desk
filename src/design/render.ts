/**
 * DesignSpec → self-contained SVG at the exact canvas size. Used for export in the browser, for the server's
 * PNG render (resvg) that quality control inspects, and for thumbnails. Text is drawn from the font outlines
 * (no web fonts needed to open the file), images are embedded, backgrounds are the Image agent's vector art.
 */
import { fontKey, type Font } from './fonts'
import { linePath, linePositions } from './text'
import type { Asset, DesignSpec, Layer } from './spec'

export interface RenderOptions {
  fonts: Map<string, Font>
  /** data: URI (or URL) for an image asset; null = draw a neutral placeholder */
  href: (asset: Asset) => string | null
  /** draw only these layers (e.g. the background alone, for contrast sampling) */
  only?: (l: Layer) => boolean
  /** hide text (used to sample what is behind it) */
  noText?: boolean
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const n = (v: number) => Math.round(v * 100) / 100

/** Nested background art: the asset's own <svg>, stretched to the layer box. */
function innerSvg(svg: string, l: Layer) {
  const m = svg.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/i)
  if (!m) return ''
  const vb = /viewBox=["']([^"']+)["']/i.exec(m[1])?.[1] ?? `0 0 ${l.w} ${l.h}`
  return `<svg x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" viewBox="${esc(vb)}" preserveAspectRatio="xMidYMid slice">${m[2]}</svg>`
}

export function renderSvg(spec: DesignSpec, o: RenderOptions): string {
  const { w, h } = spec.canvas
  const defs: string[] = []
  const body: string[] = []
  let k = 0
  for (const l of spec.layers) {
    if (!l.visible || (o.only && !o.only(l))) continue
    const tf = l.rotation ? ` transform="rotate(${n(l.rotation)} ${n(l.x + l.w / 2)} ${n(l.y + l.h / 2)})"` : ''
    const op = l.opacity < 1 ? ` opacity="${n(l.opacity)}"` : ''
    const open = `<g data-layer="${esc(l.id)}" data-role="${esc(l.role)}"${tf}${op}>`
    if (l.kind === 'background' && l.background) {
      const b = l.background
      const asset = b.assetId ? spec.assets[b.assetId] : undefined
      let inner = ''
      if (b.gradient.length > 1) {
        const gid = `g${k++}`
        defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="0.35" y2="1">${b.gradient.map((c, i) => `<stop offset="${n(i / (b.gradient.length - 1))}" stop-color="${c}"/>`).join('')}</linearGradient>`)
        inner = `<rect x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" fill="url(#${gid})"/>`
      } else inner = `<rect x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" fill="${b.color}"/>`
      if (asset?.svg) inner += innerSvg(asset.svg, l)
      else if (asset) {
        const href = o.href(asset)
        if (href) inner += `<image href="${esc(href)}" x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" preserveAspectRatio="xMidYMid slice"/>`
      }
      body.push(open + inner + '</g>')
    } else if (l.kind === 'shape' && l.shape) {
      const s = l.shape
      const paint = `fill="${s.fill ?? 'none'}"${s.stroke && s.strokeWidth ? ` stroke="${s.stroke}" stroke-width="${n(s.strokeWidth)}"` : ''}`
      const el =
        s.type === 'circle'
          ? `<ellipse cx="${n(l.x + l.w / 2)}" cy="${n(l.y + l.h / 2)}" rx="${n(l.w / 2)}" ry="${n(l.h / 2)}" ${paint}/>`
          : s.type === 'line'
            ? `<line x1="${n(l.x)}" y1="${n(l.y + l.h / 2)}" x2="${n(l.x + l.w)}" y2="${n(l.y + l.h / 2)}" stroke="${s.stroke ?? s.fill ?? '#ffffff'}" stroke-width="${n(Math.max(1, s.strokeWidth || l.h))}"/>`
            : `<rect x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" rx="${n(Math.min(s.radius, l.w / 2, l.h / 2))}" ${paint}/>`
      body.push(open + el + '</g>')
    } else if (l.kind === 'image' && l.image) {
      const im = l.image
      const asset = spec.assets[im.assetId]
      const href = asset ? o.href(asset) : null
      const cid = `c${k++}`
      const clip =
        im.mask === 'circle'
          ? `<clipPath id="${cid}"><ellipse cx="${n(l.x + l.w / 2)}" cy="${n(l.y + l.h / 2)}" rx="${n(l.w / 2)}" ry="${n(l.h / 2)}"/></clipPath>`
          : `<clipPath id="${cid}"><rect x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" rx="${n(im.mask === 'rounded' ? im.radius : 0)}"/></clipPath>`
      defs.push(clip)
      let inner: string
      if (!href || !asset) inner = `<rect x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" fill="#8a8794" opacity="0.35"/>`
      else if (im.crop) {
        // Crop: scale the whole image so the crop window fills (cover) or fits (contain) the layer box, centred.
        const c = im.crop
        const s = (im.fit === 'cover' ? Math.max : Math.min)(l.w / (c.w * asset.w), l.h / (c.h * asset.h))
        const fullW = asset.w * s
        const fullH = asset.h * s
        const x = l.x - c.x * fullW + (l.w - c.w * fullW) / 2
        const y = l.y - c.y * fullH + (l.h - c.h * fullH) / 2
        inner = `<image href="${esc(href)}" x="${n(x)}" y="${n(y)}" width="${n(fullW)}" height="${n(fullH)}" preserveAspectRatio="none"/>`
      } else inner = `<image href="${esc(href)}" x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" preserveAspectRatio="xMidYMid ${im.fit === 'cover' ? 'slice' : 'meet'}"/>`
      // Gradient fade: a luminance mask from opaque to transparent toward the chosen side (or all edges).
      let mask = ''
      if (im.fade && im.fade.amount > 0) {
        const mid = `m${k++}`
        const gid = `mg${k++}`
        const a = Math.max(0.05, Math.min(1, im.fade.amount))
        const grad =
          im.fade.side === 'edges'
            ? `<radialGradient id="${gid}" cx="0.5" cy="0.5" r="0.5"><stop offset="${n(1 - a)}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>`
            : `<linearGradient id="${gid}" x1="${im.fade.side === 'left' ? 1 : 0}" y1="${im.fade.side === 'top' ? 1 : 0}" x2="${im.fade.side === 'right' ? 1 : 0}" y2="${im.fade.side === 'bottom' ? 1 : 0}"><stop offset="${n(1 - a)}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`
        defs.push(`${grad}<mask id="${mid}" maskUnits="userSpaceOnUse" x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}"><rect x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" fill="url(#${gid})"/></mask>`)
        mask = ` mask="url(#${mid})"`
      }
      const flip = im.flipX ? ` transform="translate(${n(l.x * 2 + l.w)} 0) scale(-1 1)"` : ''
      body.push(`${open}<g clip-path="url(#${cid})"${mask}><g${flip}>${inner}</g></g>${im.ring ? `<${im.mask === 'circle' ? `ellipse cx="${n(l.x + l.w / 2)}" cy="${n(l.y + l.h / 2)}" rx="${n(l.w / 2)}" ry="${n(l.h / 2)}"` : `rect x="${n(l.x)}" y="${n(l.y)}" width="${n(l.w)}" height="${n(l.h)}" rx="${n(im.radius)}"`} fill="none" stroke="${im.ring}" stroke-width="6"/>` : ''}</g>`)
    } else if (l.kind === 'text' && l.text && !o.noText) {
      const t = l.text
      const font = o.fonts.get(fontKey(t.font, t.weight))
      if (!font) continue
      const d = linePositions(font, l, t)
        .map((p) => linePath(font, p.line, p.x, p.baseline, p.size, t.tracking))
        .join('')
      let fx = ''
      if (t.shadow) {
        const fid = `f${k++}`
        defs.push(`<filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="${n(t.shadow.dx)}" dy="${n(t.shadow.dy)}" stdDeviation="${n(t.shadow.blur / 2)}" flood-color="${t.shadow.color}" flood-opacity="${n(t.shadow.opacity)}"/></filter>`)
        fx = ` filter="url(#${fid})"`
      }
      const stroke = t.outline ? ` stroke="${t.outline.color}" stroke-width="${n(t.outline.width)}" paint-order="stroke" stroke-linejoin="round"` : ''
      body.push(`${open}<title>${esc(t.content)}</title><path d="${d}" fill="${t.color}"${stroke}${fx}/></g>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`
}
