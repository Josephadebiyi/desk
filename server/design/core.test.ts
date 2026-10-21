/**
 * Representative church flyers through the deterministic core: layout → fit → render → QC.
 *   npm run test:design
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { applyOps } from '../../src/design/edits'
import { layoutSpec } from '../../src/design/layout'
import { qcPassed, runQc } from '../../src/design/qc'
import { newSpec, type Content, type DesignSpec, type Format } from '../../src/design/spec'
import { renderSpec, specFonts } from './raster'

const OUT = process.env.DESIGN_TEST_OUT // set to a folder to keep the PNGs for a visual look

/** A small grey "portrait" (data URI) so photo layers render without network access. */
const PHOTO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#c9a27e"/><circle cx="400" cy="300" r="150" fill="#7a5236"/><rect x="200" y="480" width="400" height="320" rx="160" fill="#3b2a6b"/></svg>').toString('base64')
const LOGO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><circle cx="200" cy="200" r="190" fill="#ffffff"/><path d="M200 70v260M110 160h180" stroke="#6c34ff" stroke-width="40"/></svg>').toString('base64')

function flyer(format: Format, content: Partial<Content> & { title: string }, speakers: number, extra: Partial<DesignSpec> = {}): DesignSpec {
  const sp = Array.from({ length: speakers }, (_, i) => ({ id: `s${i}`, name: ['Pastor John Adeyemi', 'Rev. Grace Okafor', 'Bishop Samuel Mensah', 'Minister Ruth Bello', 'Dr. Paul Eze', 'Evangelist Mary Obi'][i % 6], role: i % 2 ? 'Guest Minister' : 'Lead Pastor', photoAssetId: `p${i}` }))
  const spec = newSpec({ id: 'test', format, mode: 'original', language: 'English', brief: '', content: { subtitle: '', tagline: '', date: '', time: '', venue: '', host: '', scripture: '', contact: '', cta: '', ...content, speakers: sp } as Content, churchName: 'Grace Chapel', logoAssetId: 'logo', references: [] })
  spec.assets.logo = { id: 'logo', kind: 'logo', path: null, svg: null, mime: 'image/svg+xml', w: 400, h: 400, cutout: false, tone: null }
  for (const s of sp) spec.assets[s.photoAssetId!] = { id: s.photoAssetId!, kind: 'portrait', path: null, svg: null, mime: 'image/svg+xml', w: 800, h: 800, cutout: false, tone: null }
  return { ...spec, ...extra }
}
const href = (a: { kind: string }) => (a.kind === 'logo' ? LOGO : PHOTO)

async function build(spec: DesignSpec) {
  const fonts = await specFonts(spec)
  spec.layers = layoutSpec(spec, fonts)
  const r = await renderSpec(spec, href)
  const issues = runQc(spec, { sample: r.sample })
  return { spec, issues, png: r.png, svg: r.svg }
}

const CASES: [string, Format, Partial<Content> & { title: string }, number][] = [
  ['no speakers, short', 'portrait', { title: 'Sunday Service', date: 'Sunday 3 November', time: '10:00 AM', venue: 'Grace Chapel, Lekki', host: 'Grace Chapel' }, 0],
  ['one speaker', 'portrait', { title: 'Night of Worship', subtitle: 'An evening of praise and prayer', date: 'Friday 8 Nov', time: '6 PM', venue: 'Main Auditorium', host: 'Grace Chapel' }, 1],
  ['three speakers', 'portrait', { title: 'Kingdom Conference 2026', tagline: 'Arise & Shine', date: '14–16 November', time: '9 AM daily', venue: 'Eko Convention Centre, Victoria Island', host: 'Grace Chapel International', cta: 'Register free' }, 3],
  ['four speakers square', 'square', { title: 'Youth Revival', date: 'Sat 23 Nov', time: '4 PM', venue: 'Youth Hall' }, 4],
  ['six speakers story', 'story', { title: 'Annual Leadership Summit for Ministers and Church Workers', subtitle: 'Equipping leaders for the next season', date: 'December 5–7', time: '10 AM – 4 PM', venue: 'The Cathedral, 12 Church Street', scripture: '“Arise, shine, for your light has come.” — Isaiah 60:1', cta: 'Book your seat' }, 6],
  ['very long title', 'portrait', { title: 'A Special Thanksgiving Service Celebrating Twenty Five Years of God’s Faithfulness to Our Church Family', date: 'Sunday 1 December', time: '9 AM', venue: 'Grace Chapel' }, 2],
  ['landscape split', 'landscape', { title: 'Marriage Seminar', subtitle: 'Building homes on the Rock', date: 'Sat 30 Nov', time: '11 AM', venue: 'Fellowship Hall' }, 2],
]

for (const [name, format, content, n] of CASES) {
  test(`flyer: ${name}`, async () => {
    const { spec, issues, png, svg } = await build(flyer(format, content, n))
    if (OUT) {
      mkdirSync(OUT, { recursive: true })
      writeFileSync(`${OUT}/${name.replace(/\W+/g, '-')}.png`, png)
      writeFileSync(`${OUT}/${name.replace(/\W+/g, '-')}.svg`, svg)
      writeFileSync(`${OUT}/${name.replace(/\W+/g, '-')}.json`, JSON.stringify(spec, null, 1))
    }
    const errors = issues.filter((i) => i.severity === 'error')
    assert.deepEqual(errors, [], `QC errors:\n${errors.map((e) => `  ${e.code}: ${e.message}`).join('\n')}`)
    assert.ok(qcPassed(issues))
    // every speaker has a photo and a name
    for (let i = 0; i < n; i++) {
      assert.ok(spec.layers.some((l) => l.role === `speaker:${i}`), `speaker ${i} photo`)
      assert.ok(spec.layers.some((l) => l.role === `speaker-name:${i}`), `speaker ${i} name`)
    }
    // exact size PNG
    assert.equal(png.readUInt32BE(16), spec.canvas.w)
    assert.equal(png.readUInt32BE(20), spec.canvas.h)
  })
}

test('QC catches injected problems', async () => {
  const { spec } = await build(flyer('portrait', { title: 'Sunday Service', date: 'Sunday', venue: 'Hall' }, 2))
  const bad = structuredClone(spec)
  const title = bad.layers.find((l) => l.role === 'title')!
  title.text!.content = 'Sunday Servise' // spelling
  const name = bad.layers.find((l) => l.role === 'speaker-name:0')!
  Object.assign(name, { x: title.x, y: title.y, w: title.w, h: title.h }) // collision
  name.text!.fitted = null
  bad.layers.find((l) => l.role === 'speaker:1')!.x = bad.canvas.w - 20 // clipped
  title.text!.color = '#1a1530' // dark on dark
  bad.layers = bad.layers.filter((l) => l.role !== 'venue') // missing
  const codes = new Set(runQc(bad).map((i) => i.code))
  for (const c of ['spelling', 'collision', 'clipped', 'missing', 'contrast']) assert.ok(codes.has(c as never), `expected ${c}, got ${[...codes].join(', ')}`)
})

test('targeted edits touch only what was asked', async () => {
  const { spec } = await build(flyer('portrait', { title: 'Night of Worship', date: 'Friday', venue: 'Hall' }, 2))
  const before = structuredClone(spec.layers)
  const r = applyOps(spec, [{ op: 'scale_text', target: 'headline', value: '', amount: 1.2, x: 0, y: 0 }])
  assert.equal(r.relayout, false)
  assert.deepEqual(r.changed, ['l-title'])
  const t0 = before.find((l) => l.role === 'title')!
  const t1 = r.spec.layers.find((l) => l.role === 'title')!
  assert.ok(t1.text!.size > t0.text!.size)
  for (const l of r.spec.layers.filter((x) => x.role !== 'title')) assert.deepEqual(l, before.find((b) => b.id === l.id))

  // style change → relayout that keeps the locked (user-moved) logo
  const moved = applyOps(spec, [{ op: 'move', target: 'logo', value: '', amount: 0, x: 0.2, y: 0 }]).spec
  const logoX = moved.layers.find((l) => l.role === 'logo')!.x
  const blue = applyOps(moved, [{ op: 'set_color', target: 'background', value: '#1d3fa8', amount: 0, x: 0, y: 0 }])
  assert.ok(blue.relayout)
  const fonts = await specFonts(blue.spec)
  blue.spec.layers = layoutSpec(blue.spec, fonts)
  assert.equal(blue.spec.layers.find((l) => l.role === 'logo')!.x, logoX)
  assert.equal(blue.spec.layers.find((l) => l.role === 'background')!.background!.color, '#1d3fa8')
})

test('replicate mode follows the reference composition', async () => {
  const s = flyer('portrait', { title: 'Easter Sunday', date: '20 April', venue: 'Main church' }, 4)
  s.mode = 'replicate'
  s.references = [
    {
      assetId: 'ref1',
      analysis: {
        summary: 'title bottom-left, four speakers in a row at the top',
        aspect: 0.8,
        palette: ['#101010', '#f5c542'],
        background: 'dark',
        regions: [
          { role: 'speakers', x: 0.06, y: 0.12, w: 0.88, h: 0.3 },
          { role: 'title', x: 0.06, y: 0.5, w: 0.88, h: 0.2 },
          { role: 'details', x: 0.06, y: 0.76, w: 0.88, h: 0.06 },
        ],
        typography: [{ role: 'title', style: 'condensed', weight: 'bold', case: 'upper' }],
        speakers: { count: 4, arrangement: 'row', shape: 'circle' },
        margin: 0.06,
        density: 'balanced',
        mood: ['bold'],
      },
    },
  ]
  s.primaryReference = 0
  const { spec, issues } = await build(s)
  const title = spec.layers.find((l) => l.role === 'title')!
  assert.ok(Math.abs(title.y - 0.5 * spec.canvas.h) < 2, 'title follows the reference')
  const sp = spec.layers.filter((l) => /^speaker:/.test(l.role))
  assert.equal(sp.length, 4)
  assert.ok(sp.every((l) => l.y < 0.45 * spec.canvas.h), 'speakers in the reference band')
  assert.ok(!issues.some((i) => i.code === 'reference_mismatch'))
})

test('photo gradient fade renders (bottom of the photo becomes transparent)', async () => {
  const { spec } = await build(flyer('portrait', { title: 'Fade test', date: 'Sunday', venue: 'Hall' }, 1))
  const r = applyOps(spec, [{ op: 'set_image_fade', target: 'speaker', value: 'bottom', amount: 0.6, x: 0, y: 0 }])
  const photo = r.spec.layers.find((l) => l.role === 'speaker:0')!
  assert.deepEqual(photo.image!.fade, { side: 'bottom', amount: 0.6 })
  // render only the photo on a transparent canvas: top of the photo opaque, bottom edge (nearly) transparent
  const only = { ...r.spec, layers: [photo] }
  const { rasterize } = await import('./raster')
  const { renderSvg } = await import('../../src/design/render')
  const svg = renderSvg(only, { fonts: await specFonts(only), href })
  assert.ok(svg.includes('<mask'))
  const img = rasterize(svg, only.canvas.w)
  const alphaAt = (x: number, y: number) => img.pixels[(Math.round(y) * img.w + Math.round(x)) * 4 + 3]
  const cx = photo.x + photo.w / 2
  assert.ok(alphaAt(cx, photo.y + photo.h * 0.2) > 200, 'top stays opaque')
  assert.ok(alphaAt(cx, photo.y + photo.h * 0.97) < 40, 'bottom fades out')
})
