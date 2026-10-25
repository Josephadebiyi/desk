/**
 * Is this person already in the church? Shared by the public join form (server), Members → Add member, the
 * spreadsheet import and Members → Duplicates, so they all agree.
 *   - same email (any case)                                  → same person
 *   - same phone / WhatsApp number (last 9 digits, so +234 803… and 0803… match) → same person
 *   - same full name (accents, case and spacing ignored)    → probably the same person: a warning, not a block,
 *     unless the birthday matches too (two members can share a name)
 */
export interface PersonLike {
  fullName?: string
  full_name?: string
  email?: string
  phone?: string
  whatsapp?: string
  dob?: string | null
}

export type MatchReason = 'email' | 'phone' | 'name'

export const normEmail = (e?: string | null) => (e ?? '').trim().toLowerCase()
/** Comparable phone: the last 9 digits (country code and leading 0 ignored); '' when too short to compare. */
export const normPhone = (p?: string | null) => {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 7 ? d.slice(-9) : ''
}
export const normName = (n?: string | null) =>
  (n ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const nameOf = (p: PersonLike) => p.fullName ?? p.full_name ?? ''

/** Why `a` and `b` look like the same person, strongest reason first; null when they don't. */
export function sameReason(a: PersonLike, b: PersonLike): MatchReason | null {
  const ea = normEmail(a.email)
  if (ea && ea === normEmail(b.email)) return 'email'
  const pa = [normPhone(a.phone), normPhone(a.whatsapp)].filter(Boolean)
  const pb = new Set([normPhone(b.phone), normPhone(b.whatsapp)].filter(Boolean))
  if (pa.some((p) => pb.has(p))) return 'phone'
  const na = normName(nameOf(a))
  if (na && na.includes(' ') && na === normName(nameOf(b))) return 'name'
  return null
}

/** The first existing person `p` matches, and why. */
export function findExisting<T extends PersonLike>(p: PersonLike, existing: T[]): { match: T; reason: MatchReason } | null {
  let nameHit: T | null = null
  for (const e of existing) {
    const r = sameReason(p, e)
    if (r === 'email' || r === 'phone') return { match: e, reason: r }
    if (r === 'name' && !nameHit) nameHit = e
  }
  return nameHit ? { match: nameHit, reason: 'name' } : null
}

/** A name-only match counts as "the same person" only when the birthday (month + day) matches too. */
export const sameBirthday = (a?: string | null, b?: string | null) => Boolean(a && b && a.slice(5, 10) === b.slice(5, 10))

/** Groups of records that look like the same person (Members → Duplicates), strongest reason per group. */
export function duplicateGroups<T extends PersonLike & { id: string }>(list: T[]): { reason: MatchReason; members: T[] }[] {
  const parent = new Map<string, string>(list.map((m) => [m.id, m.id]))
  const find = (x: string): string => {
    while (parent.get(x) !== x) x = parent.get(x)!
    return x
  }
  const firstWithKey = new Map<string, string>()
  for (const m of list)
    for (const key of [normEmail(m.email) && `e:${normEmail(m.email)}`, normPhone(m.phone) && `p:${normPhone(m.phone)}`, normPhone(m.whatsapp) && `p:${normPhone(m.whatsapp)}`, normName(nameOf(m)).includes(' ') && `n:${normName(nameOf(m))}`]) {
      if (!key) continue
      const other = firstWithKey.get(key)
      if (other) parent.set(find(m.id), find(other))
      else firstWithKey.set(key, m.id)
    }
  const groups = new Map<string, T[]>()
  for (const m of list) groups.set(find(m.id), [...(groups.get(find(m.id)) ?? []), m])
  const rank: Record<MatchReason, number> = { email: 3, phone: 2, name: 1 }
  return [...groups.values()]
    .filter((ms) => ms.length > 1)
    .map((ms) => {
      let reason: MatchReason = 'name'
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
        const r = sameReason(ms[i], ms[j])
        if (r && rank[r] > rank[reason]) reason = r
      }
      return { reason, members: ms }
    })
}
