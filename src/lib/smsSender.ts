/**
 * SMS sender names (alphanumeric sender IDs) — shared by the dashboard and the server.
 * Carriers allow up to 11 characters: letters, numbers and spaces, with at least one letter.
 * Countries that don't accept them (e.g. US, Canada, unregistered Nigeria) fall back to ZionDesk's
 * shared sender on the server.
 */
export const SMS_SENDER_MAX = 11
const VALID = /^(?=.*[A-Za-z])[A-Za-z0-9 ]{1,11}$/

export const validSmsSender = (s: string) => VALID.test(s) && s.trim() === s

/** "Grace Chapel International" → "GraceChapel"; "RCCG Lekki" → "RCCG Lekki". */
export function defaultSmsSender(churchName: string) {
  const ascii = churchName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  let s = ascii.length <= SMS_SENDER_MAX ? ascii : ascii.replace(/ /g, '')
  s = s.slice(0, SMS_SENDER_MAX).trim()
  return validSmsSender(s) ? s : 'ZionDesk'
}
