/**
 * Gemini (Google AI) — personalised birthday prayers.
 * Only what's needed is sent: first name, age, ministry/department, membership stage, language and
 * the church name. Never contact details, notes or giving.
 * Use a key from a billing-enabled Google Cloud project: on the paid tier Google does not use
 * prompts to improve its models (our Privacy Policy promises that).
 */
import { configured, env } from './env'

const LANG_NAME: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese' }

export interface Celebrant {
  id: string
  firstName: string
  age: number | null
  gender: string
  department: string
  stage: string
  language: string
}

/** One unique prayer per person (2–3 sentences, in their language). Returns {} if Gemini isn't set up or fails. */
export async function birthdayPrayers(church: string, people: Celebrant[]): Promise<Record<string, string>> {
  if (!configured.gemini || !people.length) return {}
  const out: Record<string, string> = {}
  for (let i = 0; i < people.length; i += 25) {
    const batch = people.slice(i, i + 25)
    const list = batch.map((p) => ({ id: p.id, name: p.firstName, age: p.age, gender: p.gender || undefined, ministry: p.department || undefined, stage: p.stage, language: LANG_NAME[p.language] ?? 'English' }))
    const prompt = `You are a warm, pastoral church minister at ${church}. Write a short, heartfelt birthday prayer for each church member below.
Rules:
- 2–3 sentences, written in the member's "language", addressed to them by first name.
- Each prayer must be different: vary the blessings and draw on Scripture themes (do not quote long verses; a short reference is fine).
- Make it personal using their age stage (child, youth, adult, elder), ministry and whether they are new to the church — never state their exact age.
- Christian, encouraging, inclusive of all traditions; no promises of wealth or healing, nothing political.
Return JSON: [{"id": "...", "prayer": "..."}] — one item per member, same ids.
Members: ${JSON.stringify(list)}`
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 1 },
        }),
      })
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } }
      if (!res.ok) throw new Error(data.error?.message ?? String(res.status))
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '[]'
      for (const item of JSON.parse(text) as { id: string; prayer: string }[]) {
        if (batch.some((p) => p.id === item.id) && typeof item.prayer === 'string') out[item.id] = item.prayer.trim().slice(0, 700)
      }
    } catch (e) {
      console.error('[gemini birthday]', e instanceof Error ? e.message : e)
    }
  }
  return out
}

export const ageOn = (dob: string, today = new Date()) => {
  const d = new Date(dob + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  return today.getFullYear() - d.getFullYear()
}
