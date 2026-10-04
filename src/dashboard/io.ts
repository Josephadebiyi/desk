import { LANGS, tr, translate, type Lang } from '../i18n'
import { GENDERS, STAGES, STATUSES, type Member, type MemberInput } from './types'

/** Spreadsheet columns, in export order, with header aliases accepted on import. */
export const COLUMNS: { key: keyof MemberInput; label: string; tkey: string; aliases: string[] }[] = [
  { key: 'fullName', label: 'Full name', tkey: 'members.fullName', aliases: ['name', 'full name', 'fullname', 'member name'] },
  { key: 'phone', label: 'Phone', tkey: 'members.phone', aliases: ['phone number', 'mobile', 'telephone', 'tel'] },
  { key: 'whatsapp', label: 'WhatsApp', tkey: 'members.whatsapp', aliases: ['whatsapp number', 'whatsapp no'] },
  { key: 'email', label: 'Email', tkey: 'members.email', aliases: ['email address', 'e-mail'] },
  { key: 'gender', label: 'Gender', tkey: 'members.gender', aliases: ['sex'] },
  { key: 'dob', label: 'Date of birth', tkey: 'members.dob', aliases: ['dob', 'birthday', 'birth date', 'date of birth'] },
  { key: 'address', label: 'Address', tkey: 'members.address', aliases: ['home address', 'residential address'] },
  { key: 'branch', label: 'Branch', tkey: 'members.branch', aliases: ['campus', 'location'] },
  { key: 'department', label: 'Department', tkey: 'members.department', aliases: ['ministry', 'unit', 'team'] },
  { key: 'membershipStatus', label: 'Membership status', tkey: 'members.status', aliases: ['status'] },
  { key: 'dateJoined', label: 'Date joined', tkey: 'members.dateJoined', aliases: ['joined', 'join date', 'date of joining'] },
  { key: 'stage', label: 'Stage', tkey: 'members.stage', aliases: ['newcomer/convert/member/worker', 'category', 'member type', 'type'] },
  { key: 'notes', label: 'Notes', tkey: 'members.notes', aliases: ['note', 'comments', 'remarks'] },
  { key: 'language', label: 'Language', tkey: 'members.language', aliases: ['communication language', 'preferred language', 'lang', 'idioma', 'langue', 'sprache', 'língua'] },
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/]+/g, ' ').trim()

const pad = (n: number) => String(n).padStart(2, '0')
function toDate(v: unknown): string {
  if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/) // dd/mm/yyyy
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`
  const d = new Date(s)
  return isNaN(+d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Accepts 'es', 'Spanish', 'Español'… */
function toLang(v: unknown): Lang {
  const s = String(v ?? '').trim().toLowerCase()
  const names: Record<string, Lang> = { english: 'en', spanish: 'es', french: 'fr', german: 'de', portuguese: 'pt' }
  return LANGS.find((l) => l.code === s.slice(0, 2) || l.native.toLowerCase() === s)?.code ?? names[s] ?? 'en'
}

/** Matches a stored value or its label in any supported language (e.g. “Recién llegado” → Newcomer). */
function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T, group?: string): T {
  const s = String(v ?? '').trim().toLowerCase()
  return (
    list.find((x) => x.toLowerCase() === s || (!!x && !!group && LANGS.some((l) => translate(l.code, `enums.${group}.${x}`).toLowerCase() === s))) ?? fallback
  )
}
/** Column header in the current language; any language's header is accepted on import. */
const headerOf = (c: (typeof COLUMNS)[number]) => tr(c.tkey)
const headerNames = (c: (typeof COLUMNS)[number]) => [c.label, ...c.aliases, ...LANGS.map((l) => translate(l.code, c.tkey))]

export interface ParsedImport {
  rows: MemberInput[]
  errors: { row: number; message: string }[]
  mapped: string[] // labels of columns we recognised
  unmapped: string[] // headers we ignored
}

export async function parseMemberFile(file: File): Promise<ParsedImport> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' })
  if (!table.length) return { rows: [], errors: [{ row: 0, message: tr('members.importEmpty') }], mapped: [], unmapped: [] }

  const headers = (table[0] as unknown[]).map((h) => String(h ?? ''))
  const index: Partial<Record<keyof MemberInput, number>> = {}
  const unmapped: string[] = []
  headers.forEach((h, i) => {
    const n = norm(h)
    const col = COLUMNS.find((c) => headerNames(c).some((a) => norm(a) === n))
    if (col && index[col.key] === undefined) index[col.key] = i
    else if (h.trim()) unmapped.push(h)
  })

  const rows: MemberInput[] = []
  const errors: ParsedImport['errors'] = []
  table.slice(1).forEach((r, k) => {
    const row = r as unknown[]
    const get = (key: keyof MemberInput) => (index[key] === undefined ? '' : row[index[key]!])
    const str = (key: keyof MemberInput) => String(get(key) ?? '').trim()
    const fullName = str('fullName')
    const email = str('email')
    if (!fullName) {
      errors.push({ row: k + 2, message: tr('members.importNoName') })
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: k + 2, message: tr('members.importBadEmail', { email }) })
      return
    }
    rows.push({
      fullName,
      phone: str('phone'),
      whatsapp: str('whatsapp'),
      email,
      gender: oneOf([...GENDERS, ''] as const, get('gender'), '', 'gender'),
      dob: toDate(get('dob')),
      address: str('address'),
      branch: str('branch'),
      department: str('department'),
      membershipStatus: oneOf(STATUSES, get('membershipStatus'), 'Active', 'status'),
      dateJoined: toDate(get('dateJoined')) || toDate(new Date()),
      stage: oneOf(STAGES, get('stage'), 'Newcomer', 'stage'),
      notes: str('notes'),
      language: toLang(get('language')),
    })
  })

  return {
    rows,
    errors,
    mapped: COLUMNS.filter((c) => index[c.key] !== undefined).map(headerOf),
    unmapped,
  }
}

function toSheetRows(members: Member[], includeGiving: boolean) {
  return members.map((m) => {
    const row: Record<string, string | number> = {}
    const groups: Partial<Record<keyof MemberInput, string>> = { gender: 'gender', membershipStatus: 'status', stage: 'stage' }
    COLUMNS.forEach((c) => {
      const v = (m[c.key] as string) ?? ''
      row[headerOf(c)] = c.key === 'language' ? LANGS.find((l) => l.code === v)?.native ?? v : groups[c.key] && v ? tr(`enums.${groups[c.key]}.${v}`) : v
    })
    if (includeGiving) row[tr('members.totalGiving')] = m.giving.reduce((s, g) => s + g.amount, 0)
    return row
  })
}

export async function exportMembers(members: Member[], format: 'csv' | 'xlsx', includeGiving: boolean) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(toSheetRows(members, includeGiving))
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'csv') {
    download(new Blob([XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' }), `ziondesk-members-${stamp}.csv`)
    return
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, tr('members.title').slice(0, 31))
  XLSX.writeFile(wb, `ziondesk-members-${stamp}.xlsx`)
}

export function downloadTemplate() {
  const header = COLUMNS.map(headerOf).join(',')
  const example = [
    'Grace Okafor', '+234 803 555 0101', '+234 803 555 0101', 'grace@example.com', tr('enums.gender.Female'), '1994-05-12',
    '12 Admiralty Way', 'Main Campus', 'Worship', tr('enums.status.Active'), '2026-09-28', tr('enums.stage.Newcomer'), tr('pub.heardOpt.friend'), 'English',
  ].map((v) => `"${v}"`).join(',')
  download(new Blob([`${header}\n${example}\n`], { type: 'text/csv;charset=utf-8' }), 'ziondesk-member-import-template.csv')
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
