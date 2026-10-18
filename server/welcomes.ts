/**
 * Welcome emails written by Ellen:
 *   - a new member (added in the dashboard, or registered through the QR / join link) gets a warm greeting;
 *   - a new team member (Settings → Team & roles) gets a greeting plus the link to create their password.
 * With ANTHROPIC_API_KEY set, Claude writes a short personal note (first name, church, stage / department or role only —
 * never contact details or notes). Without it, a friendly standard note is used.
 * Each member gets their welcome once: the send is claimed in deliveries first (dedupe_key welcome:member:<id>).
 * Churches can switch member welcomes off in Settings → Ask Ellen (ai_settings.welcomeEmails = false).
 */
import Anthropic from '@anthropic-ai/sdk'
import { asEmailLang, type EmailLang } from '../src/emails/strings'
import { db } from './db'
import { configured } from './env'
import { compose, sendEmail } from './mail'
import { claimDeliveries, settleDelivery } from './messaging'

const LANG_NAME: Record<EmailLang, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese' }

const FALLBACK_MEMBER: Record<EmailLang, string> = {
  en: 'We’re so glad you’re part of {church}. You’re not just a name on a list — you’re family, and we can’t wait to grow together in faith.',
  es: 'Nos alegra mucho que formes parte de {church}. No eres solo un nombre en una lista: eres familia, y queremos crecer juntos en la fe.',
  fr: 'Nous sommes très heureux que vous fassiez partie de {church}. Vous n’êtes pas qu’un nom sur une liste : vous faites partie de la famille, et nous avons hâte de grandir ensemble dans la foi.',
  de: 'Wir freuen uns sehr, dass du zu {church} gehörst. Du bist nicht nur ein Name auf einer Liste – du gehörst zur Familie, und wir freuen uns darauf, gemeinsam im Glauben zu wachsen.',
  pt: 'Ficamos muito felizes por você fazer parte de {church}. Você não é só um nome numa lista: é família, e queremos crescer juntos na fé.',
}
const FALLBACK_TEAM: Record<EmailLang, string> = {
  en: 'Thank you for serving with {church}. ZionDesk keeps members, giving, messages and events in one place, so you can spend less time on admin and more time with people. I’m Ellen, and I’ll be here to help whenever you need me.',
  es: 'Gracias por servir en {church}. ZionDesk reúne miembros, ofrendas, mensajes y eventos en un solo lugar, para que dediques menos tiempo a la administración y más a las personas. Soy Ellen y estaré aquí para ayudarte cuando lo necesites.',
  fr: 'Merci de servir à {church}. ZionDesk réunit membres, dons, messages et événements au même endroit, pour passer moins de temps sur l’administration et plus de temps avec les gens. Je suis Ellen, et je serai là pour vous aider dès que vous en aurez besoin.',
  de: 'Danke, dass du bei {church} mitdienst. ZionDesk bündelt Mitglieder, Spenden, Nachrichten und Termine an einem Ort – weniger Verwaltung, mehr Zeit für Menschen. Ich bin Ellen und helfe dir jederzeit gern.',
  pt: 'Obrigado por servir em {church}. O ZionDesk reúne membros, ofertas, mensagens e eventos num só lugar, para você gastar menos tempo com administração e mais com as pessoas. Eu sou a Ellen e estarei aqui para ajudar sempre que precisar.',
}

const SYSTEM = `You are Ellen, the friendly assistant of a church on ZionDesk, writing the personal note inside a welcome email.
Rules:
- 2 or 3 short sentences, warm and natural, in the requested language, addressed to the person by first name.
- For a "member": welcome them into the church family; you may lightly mention their department or that they are new (a first-time guest, new believer, member or worker). One gentle Scripture theme is fine, no long quotes.
- For a "team" person: thank them for serving the church in their role and say ZionDesk will help them care for people with less paperwork.
- No promises, nothing about money, nothing political, no emojis, no greeting line ("Hi …") and no sign-off — those are added around your note.
- Reply with the note text only.`

async function ellenNote(kind: 'member' | 'team', p: { firstName: string; church: string; lang: EmailLang; stage?: string; department?: string; role?: string }) {
  const fallback = (kind === 'member' ? FALLBACK_MEMBER : FALLBACK_TEAM)[p.lang].replace('{church}', p.church)
  if (!process.env.ANTHROPIC_API_KEY) return fallback
  try {
    const msg = await new Anthropic().messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      max_tokens: 400,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify({ kind, firstName: p.firstName, church: p.church, language: LANG_NAME[p.lang], stage: p.stage || undefined, department: p.department || undefined, role: p.role || undefined }) }],
    } as never)
    const text = (msg as Anthropic.Message).content.map((c) => (c.type === 'text' ? c.text : '')).join('').trim()
    return text && text.length < 700 ? text : fallback
  } catch (e) {
    console.error('[ellen welcome]', e instanceof Error ? e.message : e)
    return fallback
  }
}

/** Ellen's welcome to one new member, once. Returns true when an email went out. */
export async function welcomeMember(memberId: string): Promise<boolean> {
  if (!configured.email) return false
  const { data: m } = await db().from('members').select('id, church_id, full_name, email, language, stage, department, created_at').eq('id', memberId).maybeSingle()
  if (!m?.email) return false
  // Only people added in the last day — the welcome is for new members, not old records.
  if (Date.now() - new Date(m.created_at).getTime() > 864e5) return false
  const { data: church } = await db().from('churches').select('name, ai_settings').eq('id', m.church_id).single()
  if ((church?.ai_settings as { welcomeEmails?: boolean } | null)?.welcomeEmails === false) return false

  const lang = asEmailLang(m.language)
  const [claim] = await claimDeliveries([{ church_id: m.church_id, member_id: m.id, channel: 'Email', language: lang, to_address: m.email, dedupe_key: `welcome:member:${m.id}`, body: null }])
  if (!claim) return false
  const first = m.full_name.split(' ')[0]
  const note = await ellenNote('member', { firstName: first, church: church?.name ?? '', lang, stage: m.stage, department: m.department })
  try {
    const id = await sendEmail(compose('memberWelcome', lang, m.email, { name: first, church: church?.name ?? '', ellen: note }))
    await settleDelivery(claim.id, { status: 'sent', providerId: id ?? null, body: note })
    await db().from('communications').insert({ church_id: m.church_id, member_id: m.id, channel: 'Email', summary: 'Welcome email from Ellen', by_name: 'Ellen' })
    return true
  } catch (e) {
    await settleDelivery(claim.id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
    console.error('[member welcome]', e instanceof Error ? e.message : e)
    return false
  }
}

/** Ellen's note for a team invitation (the email itself is sent by /team/invite). */
export const teamNote = (p: { firstName: string; church: string; lang: EmailLang; role: string }) => ellenNote('team', p)
