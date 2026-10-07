/**
 * SMS and WhatsApp go out from one shared ZionDesk sender, so every message starts with the
 * church's name ("Grace Chapel: …") unless the text already mentions it.
 * Used by the server when sending and by the Messaging preview, so both always match.
 */
export function withChurchName(text: string, church: string): string {
  const name = church.trim()
  const body = text.trim()
  if (!name || !body) return body
  // Already signed ("… — Grace Chapel") or addressed with the name: don't say it twice.
  if (body.toLowerCase().includes(name.toLowerCase())) return body
  return `${name}: ${body}`
}
