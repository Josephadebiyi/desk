/**
 * Prayers in members' messages, written by Claude (same ANTHROPIC_API_KEY as Ellen and AI flyers):
 *   - birthdayPrayers: one personal prayer per celebrant
 *   - newcomerPrayers: the Monday follow-up for first-time guests and new converts
 *   - closingPrayers:  a one-line prayer added to the end of church messages, one per language
 * Only what's needed is sent: first name, age, ministry/department, membership stage and language.
 * Never contact details, notes or giving. Without a key (or if Claude fails) a standard prayer is used,
 * so every message still carries a prayer.
 */
import Anthropic from '@anthropic-ai/sdk'
import { asEmailLang, type EmailLang } from '../src/emails/strings'

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

const RULES = `- Christian, encouraging and inclusive of all traditions. No promises of wealth or healing, nothing political.
- Every prayer must be different: vary the blessings. A short Scripture reference is fine; no quotes.
- No emojis.
- Reply with JSON only: [{"id": "...", "prayer": "..."}] — one item per person, same ids, no other text.`

const BIRTHDAY_SYSTEM = `You are a warm, pastoral church minister writing short birthday prayers for members of a church.
Rules:
- ONE or TWO short sentences, under 160 characters in total — it is sent by SMS and WhatsApp. Written in the member's "language", addressed to them by first name.
- Make it personal using their life stage (child, youth, adult, elder), ministry, and whether they are new to the church. Never state their exact age.
${RULES}`

const NEWCOMER_SYSTEM = `You are a warm, pastoral church minister writing the follow-up message a church sends on Monday to people who visited (or gave their life to Christ) on Sunday.
Rules:
- TWO short sentences, under 200 characters in total — it is sent by SMS and WhatsApp. Written in the person's "language".
- First thank them for worshipping with the church and say you hope to see them again; then a one-line prayer for their week ("May the Lord…").
- For a "Convert", gently celebrate their new walk with Christ. For a "Newcomer", welcome them as a guest — no pressure to join anything.
- No emojis, no greeting line ("Hi …") and no sign-off — those are added around your text.
${RULES}`

/** Asks Claude for one prayer per person (batches of 25). Missing people simply get no entry. */
async function writePrayers(system: string, church: string, people: Celebrant[], heading: string): Promise<Record<string, string>> {
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
        system,
        messages: [{ role: 'user', content: `Church: ${church}\n${heading}: ${JSON.stringify(list)}` }],
      } as never)
      const text = (msg as Anthropic.Message).content.map((c) => (c.type === 'text' ? c.text : '')).join('')
      const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
      for (const item of JSON.parse(json) as { id: string; prayer: string }[]) {
        if (batch.some((p) => p.id === item.id) && typeof item.prayer === 'string') out[item.id] = item.prayer.trim().slice(0, 260)
      }
    } catch (e) {
      console.error('[prayers]', e instanceof Error ? e.message : e)
    }
  }
  return out
}

/** One unique birthday prayer per person. Returns {} if Claude isn't configured or the call fails. */
export const birthdayPrayers = (church: string, people: Celebrant[]) => writePrayers(BIRTHDAY_SYSTEM, church, people, 'Members celebrating today')

/** The Monday follow-up text (welcome + prayer) for each newcomer / convert. Returns {} without Claude. */
export const newcomerPrayers = (church: string, people: Celebrant[]) => writePrayers(NEWCOMER_SYSTEM, church, people, 'People who joined us on Sunday')

/* ───────── standard prayers (no Claude, or Claude failed) ───────── */

/** A few of each, picked by the person's id so people in one church don't all get the same words. */
const BIRTHDAY_FALLBACK: Record<EmailLang, string[]> = {
  en: ['May the Lord bless you and keep you this new year (Num 6:24).', 'May God crown your new year with His goodness (Ps 65:11).', 'May the Lord renew your strength this year (Isa 40:31).'],
  es: ['Que el Señor te bendiga y te guarde este nuevo año (Núm 6:24).', 'Que Dios corone tu nuevo año con su bondad (Sal 65:11).', 'Que el Señor renueve tus fuerzas este año (Is 40:31).'],
  fr: ['Que le Seigneur te bénisse et te garde cette année (Nb 6:24).', 'Que Dieu couronne ta nouvelle année de sa bonté (Ps 65:11).', 'Que le Seigneur renouvelle tes forces cette année (Es 40:31).'],
  de: ['Der Herr segne und behüte dich im neuen Lebensjahr (4Mo 6,24).', 'Gott kröne dein neues Jahr mit seiner Güte (Ps 65,12).', 'Der Herr erneuere deine Kraft in diesem Jahr (Jes 40,31).'],
  pt: ['Que o Senhor o abençoe e o guarde neste novo ano (Nm 6:24).', 'Que Deus coroe o seu novo ano com a sua bondade (Sl 65:11).', 'Que o Senhor renove as suas forças este ano (Is 40:31).'],
}

const NEWCOMER_FALLBACK: Record<EmailLang, string> = {
  en: 'Thank you for worshipping with us at {church}. We hope to see you again soon. May the Lord bless and keep you this week.',
  es: 'Gracias por adorar con nosotros en {church}. Esperamos verte pronto. Que el Señor te bendiga y te guarde esta semana.',
  fr: 'Merci d’avoir célébré avec nous à {church}. Au plaisir de vous revoir bientôt. Que le Seigneur vous bénisse cette semaine.',
  de: 'Danke, dass du mit uns bei {church} gefeiert hast. Bis bald! Der Herr segne und behüte dich diese Woche.',
  pt: 'Obrigado por adorar conosco na {church}. Esperamos vê-lo em breve. Que o Senhor o abençoe e guarde nesta semana.',
}

const CLOSING_FALLBACK: Record<EmailLang, string[]> = {
  en: ['Prayer: May the Lord bless and keep you.', 'Prayer: May God’s peace be with you this week.', 'Prayer: May the Lord guide your steps.'],
  es: ['Oración: Que el Señor te bendiga y te guarde.', 'Oración: Que la paz de Dios esté contigo esta semana.', 'Oración: Que el Señor guíe tus pasos.'],
  fr: ['Prière : Que le Seigneur te bénisse et te garde.', 'Prière : Que la paix de Dieu soit avec toi cette semaine.', 'Prière : Que le Seigneur guide tes pas.'],
  de: ['Gebet: Der Herr segne und behüte dich.', 'Gebet: Gottes Frieden sei mit dir in dieser Woche.', 'Gebet: Der Herr leite deine Schritte.'],
  pt: ['Oração: Que o Senhor o abençoe e o guarde.', 'Oração: Que a paz de Deus esteja com você nesta semana.', 'Oração: Que o Senhor guie os seus passos.'],
}

/** Stable pick from a list (same person → same line on a given day, different people → varied lines). */
const pick = <T,>(list: T[], seed: string) => list[[...seed].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % list.length]

export const fallbackBirthdayPrayer = (lang: string, seed: string) => pick(BIRTHDAY_FALLBACK[asEmailLang(lang)], seed)
export const fallbackNewcomerText = (lang: string, church: string) => NEWCOMER_FALLBACK[asEmailLang(lang)].replace('{church}', church || 'church')

/* ───────── closing prayer on church messages ───────── */

/**
 * A one-line prayer to close a church message, per language. Claude writes one that fits the message;
 * otherwise a standard blessing. Messages that already end in a prayer get none.
 */
export async function closingPrayers(church: string, message: string, langs: EmailLang[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const l of langs) out[l] = pick(CLOSING_FALLBACK[l], message + l)
  if (!prayersEnabled() || !langs.length) return out
  try {
    const msg = await new Anthropic().messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      max_tokens: 1200,
      output_config: { effort: 'low' },
      system: `You add a short closing prayer to a message a church sends its members.
Rules:
- One short sentence (max 12 words) per language, starting with "Prayer: " translated into that language (e.g. "Oración: "), that fits the message's topic. No emojis, no Scripture reference.
- Christian, warm and inclusive. No promises of wealth or healing, nothing political.
- Reply with JSON only: {"<language code>": "<prayer>"} for each requested language code.`,
      messages: [{ role: 'user', content: `Church: ${church}\nLanguages: ${JSON.stringify(Object.fromEntries(langs.map((l) => [l, LANG_NAME[l]])))}\nMessage:\n${message.slice(0, 1500)}` }],
    } as never)
    const text = (msg as Anthropic.Message).content.map((c) => (c.type === 'text' ? c.text : '')).join('')
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>
    for (const l of langs) if (typeof parsed[l] === 'string' && parsed[l]) out[l] = String(parsed[l]).trim().slice(0, 100)
  } catch (e) {
    console.error('[closing prayer]', e instanceof Error ? e.message : e)
  }
  return out
}

/** True when the text already carries a prayer or blessing (so we don't add a second one). */
export const hasPrayer = (text: string) => /🙏|\b(pray|prayer|amen|bless(ing)?|oramos|oración|bendig|prions|prière|béni|beten|gebet|segne|oramos|oração|abençoe)/i.test(text)

/** Adds the closing prayer on its own paragraph. */
export const withPrayer = (text: string, prayer: string | undefined) => (prayer && !hasPrayer(text) ? `${text.trimEnd()}\n${prayer}` : text)

export const ageOn = (dob: string, today = new Date()) => {
  const d = new Date(dob + 'T00:00:00')
  if (Number.isNaN(d.getTime()) || d.getFullYear() === 1904) return null // 1904 = birthday given without a year
  return today.getFullYear() - d.getFullYear()
}
