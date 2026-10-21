/** A sample design for the preview / demo app (no server): laid out by the deterministic engine once fonts load. */
import { defaultDirection, defaultTypography } from '../design/layout'
import { DesignSpec, newSpec } from '../design/spec'

export function demoSpec(): DesignSpec {
  try {
    const saved = localStorage.getItem('zd-demo-design')
    if (saved) return DesignSpec.parse(JSON.parse(saved))
  } catch {
    /* start fresh */
  }
  const s = newSpec({
    id: 'demo',
    format: 'portrait',
    mode: 'original',
    language: 'English',
    brief: '',
    content: { title: 'Kingdom Conference 2026', subtitle: '', tagline: 'Arise & Shine', date: '14–16 November', time: '9 AM daily', venue: 'Grace Chapel, Lekki', host: 'Grace Chapel', scripture: '', contact: '', cta: 'Register free', speakers: [ { id: 's0', name: 'Pastor John Adeyemi', role: 'Lead Pastor', photoAssetId: null }, { id: 's1', name: 'Rev. Grace Okafor', role: 'Guest Minister', photoAssetId: null }, { id: 's2', name: 'Bishop Samuel Mensah', role: 'Guest Minister', photoAssetId: null } ] },
    churchName: 'Grace Chapel',
    logoAssetId: null,
    references: [],
  })
  return { ...s, direction: { ...defaultDirection(), palette: { background: '#0f1b3d', surface: '#1b2b5c', primary: '#ffffff', accent: '#f2c14e', text: '#ffffff', muted: '#c7d0ea' } }, typography: { ...defaultTypography(1080, 1350), display: { family: 'Fraunces', weight: 900 }, heading: { family: 'Montserrat', weight: 700 } } }
}
