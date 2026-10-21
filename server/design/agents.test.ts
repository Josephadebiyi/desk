/** Agent output guards (no API calls): content can't be invented; background art is sanitised. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanArt, mergeContent } from './agents'
import type { Content } from '../../src/design/spec'

const empty: Content = { title: '', subtitle: '', tagline: '', date: '', time: '', venue: '', host: '', scripture: '', contact: '', cta: '', speakers: [] }
const ai = (o: Partial<Record<keyof Content, unknown>>) => ({ title: '', subtitle: '', tagline: '', date: '', time: '', venue: '', host: '', scripture: '', contact: '', cta: '', speakers: [], ...o }) as never

test('director content: brief words kept, inventions dropped, user fields win', () => {
  const brief = 'Youth Revival Night on Friday 8 November at 6pm in the Youth Hall with Pastor Tunde Bakare'
  const out = mergeContent({ ...empty, venue: 'Youth Hall, Lekki' }, ai({ title: 'Youth Revival Night', date: 'Friday 8 November', time: '6pm', venue: 'Main Auditorium', cta: 'Free pizza for everyone!', speakers: [{ name: 'Pastor Tunde Bakare', role: 'Guest Speaker' }, { name: 'Dr. Made Up', role: '' }] }), brief)
  assert.equal(out.title, 'Youth Revival Night')
  assert.equal(out.date, 'Friday 8 November')
  assert.equal(out.venue, 'Youth Hall, Lekki') // the user's own field is never replaced
  assert.equal(out.cta, '') // not in the brief → not invented
  assert.deepEqual(out.speakers.map((s) => s.name), ['Pastor Tunde Bakare'])
  assert.equal(out.speakers[0].role, '') // "Guest Speaker" isn't in the brief
})

test('background art is stripped of scripts, text, images and links', () => {
  const svg = cleanArt('here you go <svg viewBox="0 0 10 10"><script>alert(1)</script><text x="1">Hi</text><image href="https://x.y/a.png"/><rect onload="x()" fill="url(https://evil)"/><a href="https://evil"><circle r="2"/></a></svg> done')
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'))
  for (const bad of ['<script', '<text', '<image', 'onload', 'https://']) assert.ok(!svg.includes(bad), bad)
})
