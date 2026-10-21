/**
 * Portrait background removal in the browser (MediaPipe selfie segmentation, Apache-2.0) — free, private (the photo
 * never leaves the device for this step), no AI credits. Loaded only when someone clicks "Remove background".
 */
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm'
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'

type Segmenter = import('@mediapipe/tasks-vision').ImageSegmenter
let segmenter: Promise<Segmenter> | null = null
async function getSegmenter() {
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(WASM)
    return ImageSegmenter.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false })
  })()
  segmenter.catch(() => (segmenter = null))
  return segmenter
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => ok(i)
    i.onerror = () => fail(new Error('The photo could not be read.'))
    i.src = src
  })

/** Returns a PNG data URL of the person with a transparent background, trimmed to the person. */
export async function removeBackground(src: string): Promise<{ dataUrl: string; w: number; h: number }> {
  const [seg, img] = await Promise.all([getSegmenter(), loadImage(src)])
  const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const result = seg.segment(c)
  const mask = result.confidenceMasks?.[0] // class 0 = background
  if (!mask) throw new Error('No person found in this photo.')
  const bg = mask.getAsFloat32Array()
  const mw = mask.width
  const mh = mask.height
  const px = ctx.getImageData(0, 0, w, h)
  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = bg[Math.min(mh - 1, Math.floor((y * mh) / h)) * mw + Math.min(mw - 1, Math.floor((x * mw) / w))]
      // soft edge: fully opaque below 0.35 background confidence, transparent above 0.65
      const a = Math.max(0, Math.min(1, (0.65 - m) / 0.3))
      px.data[(y * w + x) * 4 + 3] = Math.round(a * 255)
      if (a > 0.5) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  result.close?.()
  if (maxX <= minX || maxY <= minY) throw new Error('No person found in this photo.')
  ctx.putImageData(px, 0, 0)
  const pad = Math.round(Math.max(w, h) * 0.01)
  const tx = Math.max(0, minX - pad)
  const ty = Math.max(0, minY - pad)
  const tw = Math.min(w, maxX + pad) - tx
  const th = Math.min(h, maxY + pad) - ty
  const out = document.createElement('canvas')
  out.width = tw
  out.height = th
  out.getContext('2d')!.drawImage(c, tx, ty, tw, th, 0, 0, tw, th)
  return { dataUrl: out.toDataURL('image/png'), w: tw, h: th }
}
