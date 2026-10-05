/**
 * Phone number with a country-code picker (flag + dialling code), and a country dropdown.
 * Values are stored in international format ("+234 8031234567") so SMS and WhatsApp always work.
 */
import { useMemo, useState } from 'react'
import { countries, joinPhone, splitPhone } from '../lib/countries'
import { guessRegion } from '../lib/currency'
import { useT } from '../i18n'
import './phone.css'

export function PhoneInput({
  value,
  onChange,
  defaultCountry,
  placeholder,
  id,
  name,
  invalid,
}: {
  value: string
  onChange: (v: string) => void
  /** ISO code used when the number has no "+" prefix yet (e.g. the church's country). */
  defaultCountry?: string
  placeholder?: string
  id?: string
  name?: string
  invalid?: boolean
}) {
  const { locale } = useT()
  const list = useMemo(() => countries(locale), [locale])
  const fallback = defaultCountry || guessRegion()
  const parsed = splitPhone(value, fallback)
  // Keep the chosen country even while the number is still empty.
  const [picked, setPicked] = useState(parsed.country || fallback)
  const country = value.trim().startsWith('+') ? parsed.country : picked
  const number = parsed.number
  const current = list.find((c) => c.code === country)
  return (
    <span className={`phone-in ${invalid ? 'is-invalid' : ''}`}>
      <span className="phone-cc">
        <span aria-hidden>
          {current?.flag ?? '🌐'} +{current?.dial ?? ''}
        </span>
        <select
          aria-label="Country code"
          value={country}
          onChange={(e) => {
            setPicked(e.target.value)
            onChange(joinPhone(e.target.value, number))
          }}
        >
          {list.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name} (+{c.dial})
            </option>
          ))}
        </select>
      </span>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder ?? '803 123 4567'}
        value={number}
        aria-invalid={invalid}
        onChange={(e) => {
          const raw = e.target.value
          // Pasting a full international number switches the country automatically.
          if (raw.trim().startsWith('+')) {
            const s = splitPhone(raw, country)
            setPicked(s.country)
            return onChange(joinPhone(s.country, s.number))
          }
          onChange(joinPhone(country, raw))
        }}
      />
    </span>
  )
}

export function CountrySelect({ value, onChange, id, placeholder }: { value: string; onChange: (code: string) => void; id?: string; placeholder?: string }) {
  const { locale } = useT()
  const list = useMemo(() => countries(locale), [locale])
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {list.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {c.name}
        </option>
      ))}
    </select>
  )
}
