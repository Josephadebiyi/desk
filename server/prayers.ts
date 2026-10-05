/**
 * Personalised birthday prayers, written by Claude (same ANTHROPIC_API_KEY as Ellen and AI flyers).
 * Only what's needed is sent: first name, age, ministry/department, membership stage and language.
 * Never contact details, notes or giving.
 */
import Anthropic from '@anthropic-ai/sdk'

const LANG_NAME: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese' }

export const prayersEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY)

export interface Celebrant {
  id: string
  firstName: string
  age: number | null
  gender: string
  department: string
  stage: string
  language: string
}

const SYSTEM = `You are a warm, pastoral church minister writing short birthday prayers for members of a church.
Rules:
- 2–3 sentences per prayer, written in the member's "language", addressed to them by first name.
- Every prayer must be different: vary the blessings and draw on Scripture themes (a short reference is fine; no long quotes).
- Make it personal using their life stage (child, youth, adult, elder), ministry, and whether they are new to the church. Never state their exact age.
- Christian, encouraging and inclusive of all traditions. No promises of wealth or healing, nothing political.
- Reply with JSON only: [{"id": "...", "prayer": "..."}] — one item per member, same ids, no other text.`

/** One unique prayer per person. Returns {} if Claude isn't configured or the call fails. */
export async function birthdayPrayers(church: string, people: Celebrant[]): Promise<Record<string, string>> {
  if (!prayersEnabled() || !people.length) return {}
  const client = new Anthropic()
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'
  const out: Record<string, string> = {}
  for (let i = 0; i < people.length; i += 25) {
    const batch = people.slice(i, i + 25)
    const list = batch.map((p) => ({ id: p.id, name: p.firstName, age: p.age, gender: p.gender || undefined, ministry: p.department || undefined, stage: p.stage, language: LANG_NAME[p.language] ?? 'English' }))
    try {
      const msg = await client.messages.create({
        model,
        max_tokens: 8000,
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{ role: 'user', content: `Church: ${church}\nMembers celebrating today: ${JSON.stringify(list)}` }],
      } as never)
      const text = (msg as Anthropic.Message).content.map((c) => (c.type === 'text' ? c.text : '')).join('')
      const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
      for (const item of JSON.parse(json) as { id: string; prayer: string }[]) {
        if (batch.some((p) => p.id === item.id) && typeof item.prayer === 'string') out[item.id] = item.prayer.trim().slice(0, 700)
      }
    } catch (e) {
      console.error('[birthday prayers]', e instanceof Error ? e.message : e)
    }
  }
  return out
}

export const ageOn = (dob: string, today = new Date()) => {
  const d = new Date(dob + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  return today.getFullYear() - d.getFullYear()
}
