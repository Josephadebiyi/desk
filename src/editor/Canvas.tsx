/**
 * The design canvas (react-konva). Every layer of the DesignSpec is its own node: drag, resize and rotate with the
 * mouse or a finger; text is drawn from the real font outlines (identical to the exported PNG / SVG); smart guides
 * snap to the canvas, the safe margin and other layers. Manual editing only — nothing here calls the AI.
 */
import type Konva from 'konva'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Ellipse, Group, Image as KImage, Layer as KLayer, Line, Path, Rect, Stage, Transformer } from 'react-konva'
import { fontKey, type Font } from '../design/fonts'
import { linePath, linePositions } from '../design/text'
import type { DesignSpec, Layer } from '../design/spec'
import { snap, type Guide } from './ops'

type Fonts = Map<string, Font>

/** Loads an image (signed URL, data URL or SVG art) for Konva. */
function useImg(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!src) return setImg(null)
    const i = new window.Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => setImg(i)
    i.src = src
    return () => {
      i.onload = null
    }
  }, [src])
  return img
}

/** Source rectangle that makes the image cover (or the crop window fill) the box. */
function cropFor(l: Layer, img: HTMLImageElement) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const c = l.image?.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  let sx = c.x * iw
  let sy = c.y * ih
  let sw = c.w * iw
  let sh = c.h * ih
  if (l.image?.fit === 'cover' || l.image?.crop) {
    const box = l.w / l.h
    if (sw / sh > box) {
      const nw = sh * box
      sx += (sw - nw) / 2
      sw = nw
    } else {
      const nh = sw / box
      sy += (sh - nh) / 2
      sh = nh
    }
    return { crop: { x: sx, y: sy, width: sw, height: sh }, x: 0, y: 0, w: l.w, h: l.h }
  }
  // contain: whole image, letterboxed inside the box
  const k = Math.min(l.w / sw, l.h / sh)
  return { crop: { x: sx, y: sy, width: sw, height: sh }, x: (l.w - sw * k) / 2, y: (l.h - sh * k) / 2, w: sw * k, h: sh * k }
}

function TextNode({ l, fonts }: { l: Layer; fonts: Fonts }) {
  const t = l.text!
  const font = fonts.get(fontKey(t.font, t.weight))
  const d = useMemo(() => {
    if (!font) return ''
    return linePositions(font, { x: 0, y: 0, w: l.w, h: l.h }, t)
      .map((p) => linePath(font, p.line, p.x, p.baseline, p.size, t.tracking))
      .join('')
  }, [font, l.w, l.h, t])
  return (
    <>
      <Rect width={l.w} height={l.h} fill="rgba(0,0,0,0)" />
      {d && (
        <Path
          data={d}
          fill={t.color}
          stroke={t.outline?.color}
          strokeWidth={t.outline?.width ?? 0}
          fillAfterStrokeEnabled
          lineJoin="round"
          shadowColor={t.shadow?.color}
          shadowBlur={t.shadow?.blur ?? 0}
          shadowOffsetX={t.shadow?.dx ?? 0}
          shadowOffsetY={t.shadow?.dy ?? 0}
          shadowOpacity={t.shadow ? t.shadow.opacity : 0}
          shadowEnabled={Boolean(t.shadow)}
          listening={false}
        />
      )}
    </>
  )
}

/** The photo pre-drawn at box size with its gradient fade applied (same result as the exported SVG mask). */
function useFaded(l: Layer, img: HTMLImageElement | null) {
  const im = l.image!
  return useMemo(() => {
    if (!img || !im.fade || im.fade.amount <= 0) return null
    const k = Math.min(2, 1600 / Math.max(l.w, l.h))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(l.w * k))
    c.height = Math.max(1, Math.round(l.h * k))
    const ctx = c.getContext('2d')!
    const r = cropFor(l, img)
    ctx.drawImage(img, r.crop.x, r.crop.y, r.crop.width, r.crop.height, r.x * k, r.y * k, r.w * k, r.h * k)
    const a = Math.max(0.05, Math.min(1, im.fade.amount))
    const W = c.width
    const H = c.height
    const g =
      im.fade.side === 'edges'
        ? ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 2)
        : ctx.createLinearGradient(im.fade.side === 'left' ? W : 0, im.fade.side === 'top' ? H : 0, im.fade.side === 'right' ? W : 0, im.fade.side === 'bottom' ? H : 0)
    g.addColorStop(1 - a, 'rgba(0,0,0,1)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalCompositeOperation = 'destination-in'
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, l.w, l.h, im.crop, im.fit, im.fade?.side, im.fade?.amount])
}

function ImageNode({ l, src }: { l: Layer; src: string | null }) {
  const img = useImg(src)
  const im = l.image!
  const faded = useFaded(l, img)
  const clip = (ctx: Konva.Context) => {
    if (im.mask === 'circle') ctx.ellipse(l.w / 2, l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2)
    else if (im.mask === 'rounded') {
      const r = Math.min(im.radius, l.w / 2, l.h / 2)
      ctx.roundRect(0, 0, l.w, l.h, r)
    } else ctx.rect(0, 0, l.w, l.h)
  }
  if (!img) return <Rect width={l.w} height={l.h} fill="#8a8794" opacity={0.3} cornerRadius={im.mask === 'circle' ? l.w / 2 : im.radius} />
  const c = cropFor(l, img)
  return (
    <>
      <Group clipFunc={clip} scaleX={im.flipX ? -1 : 1} x={im.flipX ? l.w : 0}>
        {faded ? <KImage image={faded} width={l.w} height={l.h} /> : <KImage image={img} crop={c.crop} x={c.x} y={c.y} width={c.w} height={c.h} />}
      </Group>
      {im.ring && (im.mask === 'circle' ? <Ellipse x={l.w / 2} y={l.h / 2} radiusX={l.w / 2} radiusY={l.h / 2} stroke={im.ring} strokeWidth={6} /> : <Rect width={l.w} height={l.h} cornerRadius={im.radius} stroke={im.ring} strokeWidth={6} />)}
    </>
  )
}

function BackgroundNode({ l, spec, src }: { l: Layer; spec: DesignSpec; src: string | null }) {
  const b = l.background!
  const art = b.assetId ? spec.assets[b.assetId] : undefined
  const artSrc = useMemo(() => (art?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art.svg)}` : src), [art?.svg, src])
  const img = useImg(artSrc)
  const grad = b.gradient.length > 1
  return (
    <>
      <Rect
        width={l.w}
        height={l.h}
        fill={grad ? undefined : b.color}
        fillLinearGradientStartPoint={grad ? { x: 0, y: 0 } : undefined}
        fillLinearGradientEndPoint={grad ? { x: l.w * 0.35, y: l.h } : undefined}
        fillLinearGradientColorStops={grad ? b.gradient.flatMap((c, i) => [i / (b.gradient.length - 1), c]) : undefined}
      />
      {img && (() => {
        // slice: cover the canvas like the exported SVG's preserveAspectRatio="xMidYMid slice"
        const k = Math.max(l.w / img.naturalWidth, l.h / img.naturalHeight)
        const w = img.naturalWidth * k
        const h = img.naturalHeight * k
        return <KImage image={img} x={(l.w - w) / 2} y={(l.h - h) / 2} width={w} height={h} />
      })()}
    </>
  )
}

function ShapeNode({ l }: { l: Layer }) {
  const s = l.shape!
  if (s.type === 'circle') return <Ellipse x={l.w / 2} y={l.h / 2} radiusX={l.w / 2} radiusY={l.h / 2} fill={s.fill ?? undefined} stroke={s.stroke ?? undefined} strokeWidth={s.strokeWidth} />
  if (s.type === 'line') return <Line points={[0, l.h / 2, l.w, l.h / 2]} stroke={s.stroke ?? s.fill ?? '#ffffff'} strokeWidth={Math.max(1, s.strokeWidth || l.h)} hitStrokeWidth={Math.max(20, l.h)} />
  return <Rect width={l.w} height={l.h} cornerRadius={Math.min(s.radius, l.w / 2, l.h / 2)} fill={s.fill ?? undefined} stroke={s.stroke ?? undefined} strokeWidth={s.strokeWidth} />
}

export interface CanvasProps {
  spec: DesignSpec
  fonts: Fonts
  urls: Record<string, string>
  selected: string[]
  zoom: number
  showGuides: boolean
  onSelect: (ids: string[], additive: boolean) => void
  /** live (coalesced) change while dragging / transforming */
  onChange: (id: string, patch: Partial<Layer>, coalesce: string) => void
  onMoveMany: (ids: string[], dx: number, dy: number, coalesce: string) => void
  onEditText: (id: string) => void
  editingText: string | null
  onTextCommit: (id: string, value: string) => void
}

export function Canvas(p: CanvasProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const tr = useRef<Konva.Transformer>(null)
  const stage = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ w: 600, h: 600 })
  const [guides, setGuides] = useState<Guide[]>([])
  const dragStart = useRef<{ id: string; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w: W, h: H } = p.spec.canvas
  const RULER = 22
  const fit = Math.min((size.w - RULER - 24) / W, (size.h - RULER - 24) / H)
  const k = Math.max(0.02, fit * p.zoom)
  const ox = RULER + Math.max(12, (size.w - RULER - W * k) / 2)
  const oy = RULER + Math.max(12, (size.h - RULER - H * k) / 2)

  // attach the transformer to the selected nodes
  useEffect(() => {
    const t = tr.current
    const st = stage.current
    if (!t || !st) return
    const nodes = p.selected
      .map((id) => st.findOne(`#${CSS.escape(id)}`))
      .filter((n): n is Konva.Node => Boolean(n))
      .filter((n) => {
        const l = p.spec.layers.find((x) => x.id === n.id())
        return l && !l.locked && l.kind !== 'background'
      })
    t.nodes(nodes)
    t.getLayer()?.batchDraw()
  }, [p.selected, p.spec.layers])

  const pick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, l: Layer) => {
    e.cancelBubble = true
    if (l.locked) return
    const add = 'shiftKey' in e.evt && (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey)
    p.onSelect([l.id], Boolean(add))
  }

  const nodeBox = (n: Konva.Node, l: Layer) => ({ x: n.x() - l.w / 2, y: n.y() - l.h / 2, w: l.w, h: l.h })

  const editing = p.editingText ? p.spec.layers.find((l) => l.id === p.editingText) : null
  const taStyle: CSSProperties | undefined = editing?.text
    ? {
        position: 'absolute',
        left: ox + editing.x * k,
        top: oy + editing.y * k,
        width: editing.w * k,
        height: Math.max(editing.h, (editing.text.fitted?.height ?? editing.h) + 8) * k,
        fontFamily: `'${editing.text.font}'`,
        fontWeight: editing.text.weight,
        fontSize: (editing.text.fitted?.size ?? editing.text.size) * k,
        lineHeight: editing.text.lineHeight,
        letterSpacing: `${editing.text.tracking}em`,
        textAlign: editing.text.align,
        textTransform: editing.text.transform === 'upper' ? 'uppercase' : 'none',
        color: editing.text.color,
        transform: editing.rotation ? `rotate(${editing.rotation}deg)` : undefined,
        transformOrigin: 'center',
      }
    : undefined

  // rulers: a tick every 50/100/200… canvas px depending on zoom
  const step = [25, 50, 100, 200, 500, 1000].find((s) => s * k >= 48) ?? 1000
  const ticks = (len: number) => Array.from({ length: Math.floor(len / step) + 1 }, (_, i) => i * step)

  return (
    <div className="ed-canvas" ref={wrap}>
      <div className="ed-ruler ed-ruler-x" style={{ height: RULER }}>
        {ticks(W).map((t) => (
          <span key={t} style={{ left: ox + t * k }}>
            {t}
          </span>
        ))}
      </div>
      <div className="ed-ruler ed-ruler-y" style={{ width: RULER }}>
        {ticks(H).map((t) => (
          <span key={t} style={{ top: oy + t * k }}>
            {t}
          </span>
        ))}
      </div>
      <Stage
        ref={stage}
        width={size.w}
        height={size.h}
        onMouseDown={(e) => e.target === e.target.getStage() && p.onSelect([], false)}
        onTouchStart={(e) => e.target === e.target.getStage() && p.onSelect([], false)}
      >
        <KLayer x={ox} y={oy} scaleX={k} scaleY={k}>
          <Rect width={W} height={H} fill="#ffffff" shadowColor="#000" shadowBlur={30 / k} shadowOpacity={0.18} listening={false} />
          <Group clipX={0} clipY={0} clipWidth={W} clipHeight={H}>
            {p.spec.layers.map((l) =>
              !l.visible ? null : (
                <Group
                  key={l.id}
                  id={l.id}
                  x={l.x + l.w / 2}
                  y={l.y + l.h / 2}
                  offsetX={l.w / 2}
                  offsetY={l.h / 2}
                  rotation={l.rotation}
                  opacity={l.opacity}
                  draggable={!l.locked && l.kind !== 'background' && p.selected.includes(l.id) && p.editingText !== l.id}
                  onMouseDown={(e) => pick(e, l)}
                  onTap={(e) => pick(e, l)}
                  onDblClick={() => l.text && !l.locked && p.onEditText(l.id)}
                  onDblTap={() => l.text && !l.locked && p.onEditText(l.id)}
                  onDragStart={(e) => (dragStart.current = { id: l.id, x: e.target.x(), y: e.target.y() })}
                  onDragMove={(e) => {
                    const n = e.target
                    if (p.showGuides && p.selected.length <= 1) {
                      const sn = snap(p.spec, nodeBox(n, l), p.selected, 8 / k)
                      n.position({ x: sn.x + l.w / 2, y: sn.y + l.h / 2 })
                      setGuides(sn.guides)
                    }
                    // other selected layers follow
                    const st = dragStart.current
                    if (st && p.selected.length > 1) {
                      const dx = n.x() - st.x
                      const dy = n.y() - st.y
                      for (const id of p.selected) {
                        if (id === l.id) continue
                        const o = p.spec.layers.find((x) => x.id === id)
                        const node = stage.current?.findOne(`#${CSS.escape(id)}`)
                        if (o && node && !o.locked) node.position({ x: o.x + o.w / 2 + dx, y: o.y + o.h / 2 + dy })
                      }
                    }
                  }}
                  onDragEnd={(e) => {
                    setGuides([])
                    const n = e.target
                    const st = dragStart.current
                    dragStart.current = null
                    if (p.selected.length > 1 && st) p.onMoveMany(p.selected, n.x() - st.x, n.y() - st.y, `move:${Date.now()}`)
                    else p.onChange(l.id, { x: n.x() - l.w / 2, y: n.y() - l.h / 2 }, `move:${l.id}`)
                  }}
                  onTransformEnd={(e) => {
                    const n = e.target
                    const w = Math.max(8, l.w * n.scaleX())
                    const h = Math.max(8, l.h * n.scaleY())
                    n.scaleX(1)
                    n.scaleY(1)
                    p.onChange(l.id, { x: n.x() - w / 2, y: n.y() - h / 2, w, h, rotation: Math.round(n.rotation() * 10) / 10 }, `transform:${l.id}`)
                  }}
                >
                  {l.kind === 'background' && l.background && <BackgroundNode l={l} spec={p.spec} src={l.background.assetId ? p.urls[l.background.assetId] ?? null : null} />}
                  {l.kind === 'shape' && l.shape && <ShapeNode l={l} />}
                  {l.kind === 'image' && l.image && <ImageNode l={l} src={p.urls[l.image.assetId] ?? null} />}
                  {l.kind === 'text' && l.text && p.editingText !== l.id && <TextNode l={l} fonts={p.fonts} />}
                </Group>
              ),
            )}
          </Group>
          {p.showGuides && (
            <Rect
              x={p.spec.constraints.minMargin}
              y={p.spec.constraints.minMargin}
              width={W - p.spec.constraints.minMargin * 2}
              height={H - p.spec.constraints.minMargin * 2}
              stroke="#22c3ee"
              strokeWidth={1 / k}
              dash={[6 / k, 6 / k]}
              listening={false}
              opacity={0.7}
            />
          )}
          {guides.map((g, i) => (g.axis === 'x' ? <Line key={i} points={[g.at, -20, g.at, H + 20]} stroke="#ff3d8b" strokeWidth={1 / k} listening={false} /> : <Line key={i} points={[-20, g.at, W + 20, g.at]} stroke="#ff3d8b" strokeWidth={1 / k} listening={false} />))}
          <Transformer
            ref={tr}
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={4}
            anchorSize={Math.max(10, 12)}
            anchorCornerRadius={6}
            borderStroke="#6c34ff"
            anchorStroke="#6c34ff"
            keepRatio={false}
            ignoreStroke
            flipEnabled={false}
            boundBoxFunc={(o, n) => (n.width < 6 || n.height < 6 ? o : n)}
          />
        </KLayer>
      </Stage>
      {editing?.text && taStyle && (
        <textarea
          className="ed-textedit"
          autoFocus
          defaultValue={editing.text.content}
          style={taStyle}
          onBlur={(e) => p.onTextCommit(editing.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) (e.currentTarget as HTMLTextAreaElement).blur()
          }}
          aria-label="Edit text"
        />
      )}
    </div>
  )
}
