/**
 * Birthdays are collected as month + day only — many people would rather not share their year, and the church only
 * needs the day to celebrate them. The value stays a yyyy-mm-dd date (members.dob is a date column), stored in the
 * leap year 1904 so 29 February works; older records may still carry a real year.
 */
import { getLocale } from '../i18n'

export const NO_YEAR = 1904
const pad = (n: number) => String(n).padStart(2, '0')

export const hasYear = (dob: string) => Boolean(dob) && Number(dob.slice(0, 4)) !== NO_YEAR

/** 'yyyy-mm-dd' → { month: 1-12, day: 1-31 } (0 when empty). */
export const monthDay = (dob: string) => (/^\d{4}-\d{2}-\d{2}/.test(dob) ? { month: Number(dob.slice(5, 7)), day: Number(dob.slice(8, 10)) } : { month: 0, day: 0 })

/** "12 March" / "March 12" in the reader's language — never the year. */
export const fmtBirthday = (dob: string) => {
  const { month, day } = monthDay(dob)
  if (!month || !day) return '—'
  return new Date(NO_YEAR, month - 1, day).toLocaleDateString(getLocale(), { day: 'numeric', month: 'long' })
}

/** "Month" / "Mois" / "Mes"… from the browser, so no extra translations are needed. */
const fieldName = (field: 'month' | 'day', fallback: string) => {
  try {
    const n = new Intl.DisplayNames([getLocale()], { type: 'dateTimeField' }).of(field)
    return n ? n.charAt(0).toLocaleUpperCase() + n.slice(1) : fallback
  } catch {
    return fallback
  }
}

const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Month + day pickers. Emits 'yyyy-mm-dd' with year 1904, or '' until both are chosen. */
export function BirthdayInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const labels = { month: fieldName('month', 'Month'), day: fieldName('day', 'Day') }
  const parsed = monthDay(value)
  const months = Array.from({ length: 12 }, (_, i) => new Date(NO_YEAR, i, 1).toLocaleDateString(getLocale(), { month: 'long' }))
  const emit = (month: number, day: number) => {
    if (month && day > DAYS_IN[month - 1]) day = DAYS_IN[month - 1]
    onChange(month && day ? `${NO_YEAR}-${pad(month)}-${pad(day)}` : '')
  }
  // Keeps a half-picked value (month without day) visible while the user is choosing.
  const month = parsed.month || Number((value.match(/^m(\d+)$/) ?? [])[1] || 0)
  const day = parsed.day || Number((value.match(/^d(\d+)$/) ?? [])[1] || 0)
  return (
    <span style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 8, minWidth: 0 }}>
      <select aria-label={labels.month} value={month || ''} onChange={(e) => (day ? emit(Number(e.target.value), day) : onChange(e.target.value ? `m${e.target.value}` : ''))}>
        <option value="">{labels.month}</option>
        {months.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select aria-label={labels.day} value={day || ''} onChange={(e) => (month ? emit(month, Number(e.target.value)) : onChange(e.target.value ? `d${e.target.value}` : ''))}>
        <option value="">{labels.day}</option>
        {Array.from({ length: month ? DAYS_IN[month - 1] : 31 }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
    </span>
  )
}

/** Drops a half-picked birthday ('m3' / 'd12') before saving. */
export const cleanBirthday = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
