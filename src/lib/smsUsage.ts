/** Included SMS segments per church per UTC calendar month. */
export const SMS_MONTHLY_LIMIT: Record<string, number> = { essentials: 10, plus: 20, max: 30 }
export const smsLimit = (plan: string) => SMS_MONTHLY_LIMIT[plan] ?? SMS_MONTHLY_LIMIT.essentials

// GSM-7 extension characters take two septets; other characters use UTF-16 units.
const GSM = new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'))
const EXT = new Set(Array.from('\f^{}\\[~]|€'))
export function smsSegments(text: string): number {
  let units = 0
  for (const char of text) {
    if (GSM.has(char)) units++
    else if (EXT.has(char)) units += 2
    else return Math.max(1, Math.ceil(text.length / (text.length <= 70 ? 70 : 67)))
  }
  return Math.max(1, Math.ceil(units / (units <= 160 ? 160 : 153)))
}
