/**
 * WhatsApp Cloud API (Meta) — https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Setup (once): Meta Business → WhatsApp → API Setup gives the Phone number ID; create a System User
 * token with whatsapp_business_messaging; create + get approved a template with one body variable
 * {{1}} in each language you use (en, es, fr, de, pt_PT). WhatsApp only allows free-form text to
 * people who wrote to you in the last 24 hours, so church broadcasts use the template.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from './env'

const GRAPH = 'https://graph.facebook.com/v21.0'
const TEMPLATE_LANG: Record<string, string> = { en: 'en', es: 'es', fr: 'fr', de: 'de', pt: 'pt_PT' }

async function post(body: unknown) {
  const res = await fetch(`${GRAPH}/${env.waPhoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.waToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } }
  if (!res.ok) throw Object.assign(new Error(data.error?.message ?? `WhatsApp ${res.status}`), { code: data.error?.code })
  return data.messages?.[0]?.id
}

/** Sends `text` to an international number (+234…). Uses the approved template when configured. */
export async function sendWhatsApp(to: string, text: string, lang = 'en'): Promise<string | undefined> {
  const number = to.replace(/[^\d]/g, '')
  if (env.waTemplate) {
    // Template parameters can't contain new lines or more than 4 spaces in a row.
    const param = text.replace(/\s*\n+\s*/g, ' · ').replace(/ {4,}/g, ' ').slice(0, 1000)
    return post({
      messaging_product: 'whatsapp',
      to: number,
      type: 'template',
      template: { name: env.waTemplate, language: { code: TEMPLATE_LANG[lang] ?? 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: param }] }] },
    })
  }
  return post({ messaging_product: 'whatsapp', to: number, type: 'text', text: { body: text.slice(0, 4096), preview_url: true } })
}

/** X-Hub-Signature-256 check for webhooks (only when WHATSAPP_APP_SECRET is set). */
export function validSignature(raw: Buffer, header: string | undefined) {
  if (!env.waAppSecret) return true
  if (!header?.startsWith('sha256=')) return false
  const want = Buffer.from(createHmac('sha256', env.waAppSecret).update(raw).digest('hex'))
  const got = Buffer.from(header.slice(7))
  return want.length === got.length && timingSafeEqual(want, got)
}
