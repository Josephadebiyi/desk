/**
 * Manual ways to give (shown on the church's giving page next to ZionDesk Payments).
 * Each country uses different details: Nigerian NUBAN, IBAN (+ Bizum in Spain), UK sort code,
 * US routing, M-Pesa, mobile money… Churches pick the ones they use; suggestions follow their currency.
 */
export type MethodType = 'bank_ng' | 'iban' | 'bizum' | 'uk_bank' | 'us_bank' | 'zelle' | 'mpesa' | 'momo' | 'paypal' | 'other'

export interface ManualMethod {
  id: string
  type: MethodType
  fields: Record<string, string>
}

export interface MethodField {
  key: string
  label: string
  placeholder?: string
  options?: string[]
  /** Returns an error message, or '' when valid. */
  check?: (v: string) => string
  optional?: boolean
}

const digits = (v: string) => v.replace(/\D/g, '')

/** IBAN checksum (ISO 13616, mod 97). */
export function validIban(raw: string) {
  const s = raw.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false
  const moved = s.slice(4) + s.slice(0, 4)
  let rem = 0
  for (const ch of moved) {
    const n = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of n) rem = (rem * 10 + Number(d)) % 97
  }
  return rem === 1
}
export const formatIban = (v: string) => v.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim()

export const NG_BANKS = [
  'Access Bank', 'Citibank Nigeria', 'Ecobank Nigeria', 'Fidelity Bank', 'First Bank of Nigeria', 'First City Monument Bank (FCMB)', 'Globus Bank', 'Guaranty Trust Bank (GTBank)',
  'Heritage Bank', 'Jaiz Bank', 'Keystone Bank', 'Kuda Microfinance Bank', 'Moniepoint Microfinance Bank', 'OPay', 'PalmPay', 'Parallex Bank', 'Polaris Bank', 'Providus Bank',
  'Stanbic IBTC Bank', 'Standard Chartered Bank', 'Sterling Bank', 'SunTrust Bank', 'Titan Trust Bank', 'Union Bank of Nigeria', 'United Bank for Africa (UBA)', 'Unity Bank',
  'Wema Bank (ALAT)', 'Zenith Bank',
]
const MOMO = ['MTN Mobile Money', 'Airtel Money', 'Telecel Cash (Vodafone)', 'Orange Money', 'Moov Money', 'Wave', 'Tigo Pesa', 'Zamtel Kwacha']

export interface MethodDef {
  type: MethodType
  name: string
  /** Short hint shown when choosing a method. */
  hint: string
  fields: MethodField[]
}

export const METHODS: Record<MethodType, MethodDef> = {
  bank_ng: {
    type: 'bank_ng',
    name: 'Bank transfer (Nigeria)',
    hint: 'Bank, 10-digit account number and account name',
    fields: [
      { key: 'bankName', label: 'Bank', options: NG_BANKS },
      { key: 'accountNumber', label: 'Account number (NUBAN)', placeholder: '0123456789', check: (v) => (digits(v).length === 10 ? '' : 'Nigerian account numbers have 10 digits') },
      { key: 'accountName', label: 'Account name' },
    ],
  },
  iban: {
    type: 'iban',
    name: 'Bank transfer (IBAN)',
    hint: 'For Spain and all of Europe (SEPA)',
    fields: [
      { key: 'accountName', label: 'Account holder' },
      { key: 'iban', label: 'IBAN', placeholder: 'ES91 2100 0418 4502 0005 1332', check: (v) => (validIban(v) ? '' : 'This IBAN doesn’t look right — check the digits') },
      { key: 'bic', label: 'BIC / SWIFT', placeholder: 'CAIXESBBXXX', optional: true },
      { key: 'bankName', label: 'Bank', placeholder: 'CaixaBank', optional: true },
    ],
  },
  bizum: {
    type: 'bizum',
    name: 'Bizum',
    hint: 'Instant mobile payments in Spain',
    fields: [
      { key: 'phone', label: 'Bizum phone number', placeholder: '+34 612 345 678', check: (v) => (/^(34)?[6789]\d{8}$/.test(digits(v)) ? '' : 'Enter a Spanish mobile number (9 digits)') },
      { key: 'name', label: 'Name shown in Bizum', placeholder: 'Iglesia Gracia Madrid' },
    ],
  },
  uk_bank: {
    type: 'uk_bank',
    name: 'Bank transfer (UK)',
    hint: 'Sort code and account number',
    fields: [
      { key: 'accountName', label: 'Account name' },
      { key: 'sortCode', label: 'Sort code', placeholder: '12-34-56', check: (v) => (digits(v).length === 6 ? '' : 'Sort codes have 6 digits') },
      { key: 'accountNumber', label: 'Account number', placeholder: '12345678', check: (v) => (digits(v).length === 8 ? '' : 'UK account numbers have 8 digits') },
    ],
  },
  us_bank: {
    type: 'us_bank',
    name: 'Bank transfer (US)',
    hint: 'Routing and account number',
    fields: [
      { key: 'accountName', label: 'Account name' },
      { key: 'bankName', label: 'Bank', optional: true },
      { key: 'routing', label: 'Routing number', placeholder: '021000021', check: (v) => (digits(v).length === 9 ? '' : 'Routing numbers have 9 digits') },
      { key: 'accountNumber', label: 'Account number' },
    ],
  },
  zelle: {
    type: 'zelle',
    name: 'Zelle',
    hint: 'Email or US phone number registered with Zelle',
    fields: [
      { key: 'handle', label: 'Zelle email or phone', placeholder: 'giving@yourchurch.org' },
      { key: 'name', label: 'Name shown in Zelle', optional: true },
    ],
  },
  mpesa: {
    type: 'mpesa',
    name: 'M-Pesa',
    hint: 'Paybill or Till number (Kenya)',
    fields: [
      { key: 'kind', label: 'Type', options: ['Paybill', 'Till (Buy Goods)'] },
      { key: 'number', label: 'Paybill / Till number', placeholder: '123456', check: (v) => (/^\d{5,7}$/.test(digits(v)) ? '' : 'Paybill and Till numbers have 5–7 digits') },
      { key: 'account', label: 'Account number (Paybill only)', placeholder: 'OFFERING', optional: true },
      { key: 'name', label: 'Business name', optional: true },
    ],
  },
  momo: {
    type: 'momo',
    name: 'Mobile Money',
    hint: 'MTN MoMo, Airtel Money, Orange Money…',
    fields: [
      { key: 'provider', label: 'Provider', options: MOMO },
      { key: 'number', label: 'Mobile money number', placeholder: '+233 24 123 4567', check: (v) => (digits(v).length >= 8 ? '' : 'Enter the full mobile money number') },
      { key: 'name', label: 'Registered name' },
    ],
  },
  paypal: {
    type: 'paypal',
    name: 'PayPal',
    hint: 'PayPal.me link or email',
    fields: [{ key: 'handle', label: 'PayPal.me link or email', placeholder: 'paypal.me/yourchurch' }],
  },
  other: {
    type: 'other',
    name: 'Other bank transfer',
    hint: 'Any other country or account type',
    fields: [
      { key: 'bankName', label: 'Bank' },
      { key: 'accountName', label: 'Account name' },
      { key: 'accountNumber', label: 'Account number' },
      { key: 'routing', label: 'Branch / sort code / SWIFT', optional: true },
    ],
  },
}

/** Methods worth suggesting first for a church's currency. */
const BY_CURRENCY: Record<string, MethodType[]> = {
  NGN: ['bank_ng'],
  EUR: ['iban', 'bizum', 'paypal'],
  GBP: ['uk_bank', 'paypal'],
  USD: ['us_bank', 'zelle', 'paypal'],
  KES: ['mpesa', 'other'],
  GHS: ['momo', 'other'],
  UGX: ['momo', 'other'],
  TZS: ['momo', 'other'],
  RWF: ['momo', 'other'],
  ZMW: ['momo', 'other'],
  XOF: ['momo', 'other'],
  XAF: ['momo', 'other'],
}
export const suggestedMethods = (currency: string): MethodType[] => BY_CURRENCY[currency] ?? ['other', 'paypal']

/** Check every required field; returns { "methodId.fieldKey": message }. */
export function validateMethods(list: ManualMethod[]) {
  const errors: Record<string, string> = {}
  for (const m of list)
    for (const f of METHODS[m.type].fields) {
      const v = (m.fields[f.key] ?? '').trim()
      if (!v) {
        if (!f.optional) errors[`${m.id}.${f.key}`] = 'Required'
      } else {
        const e = f.check?.(v)
        if (e) errors[`${m.id}.${f.key}`] = e
      }
    }
  return errors
}

interface PayoutLike {
  method?: string
  bankName?: string
  accountName?: string
  accountNumber?: string
  routing?: string
  manual?: ManualMethod[]
}
/** The church's manual methods (older churches stored one bank account in flat fields). */
export function manualMethods(p: PayoutLike): ManualMethod[] {
  if (Array.isArray(p.manual)) return p.manual
  if (p.accountNumber) return [{ id: 'legacy', type: 'other', fields: { bankName: p.bankName ?? '', accountName: p.accountName ?? '', accountNumber: p.accountNumber, routing: p.routing ?? '' } }]
  return []
}

/* ───────── badges ───────── */
const BADGE: Record<MethodType, { bg: string; fg: string; text: string }> = {
  bank_ng: { bg: '#008751', fg: '#ffffff', text: '₦ NUBAN' },
  iban: { bg: '#003399', fg: '#ffcc00', text: 'IBAN' },
  bizum: { bg: '#05c3dd', fg: '#ffffff', text: 'bizum' },
  uk_bank: { bg: '#012169', fg: '#ffffff', text: '£ BANK' },
  us_bank: { bg: '#3c3b6e', fg: '#ffffff', text: '$ ACH' },
  zelle: { bg: '#6d1ed4', fg: '#ffffff', text: 'Zelle' },
  mpesa: { bg: '#00a650', fg: '#ffffff', text: 'M-PESA' },
  momo: { bg: '#ffcb05', fg: '#111111', text: 'MoMo' },
  paypal: { bg: '#003087', fg: '#ffffff', text: 'PayPal' },
  other: { bg: '#c4ec62', fg: '#17112e', text: 'BANK' },
}

/** A compact brand-coloured badge for each method. */
export function MethodLogo({ type, size = 'md' }: { type: MethodType; size?: 'sm' | 'md' }) {
  const b = BADGE[type]
  const h = size === 'sm' ? 22 : 30
  if (type === 'bizum') return <img src="/brand/pay/bizum.png" alt="" aria-hidden width={h} height={h} style={{ width: h, height: h, borderRadius: 8, flex: 'none', display: 'inline-block' }} />
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        height: h,
        minWidth: h * 2,
        padding: '0 8px',
        borderRadius: 8,
        background: b.bg,
        color: b.fg,
        fontWeight: 800,
        fontSize: size === 'sm' ? 10 : 12,
        letterSpacing: '0.04em',
        fontFamily: type === 'paypal' || type === 'zelle' ? 'Inter, Arial, sans-serif' : 'inherit',
        fontStyle: type === 'paypal' ? 'italic' : 'normal',
        flex: 'none',
      }}
    >
      {b.text}
    </span>
  )
}

/** Field labels in the giver's language (public giving page). */
const LABELS: Record<string, Record<string, string>> = {
  bankName: { en: 'Bank', es: 'Banco', fr: 'Banque', de: 'Bank', pt: 'Banco' },
  accountName: { en: 'Account name', es: 'Titular', fr: 'Titulaire', de: 'Kontoinhaber', pt: 'Titular' },
  accountNumber: { en: 'Account number', es: 'Número de cuenta', fr: 'Numéro de compte', de: 'Kontonummer', pt: 'Número de conta' },
  iban: { en: 'IBAN', es: 'IBAN', fr: 'IBAN', de: 'IBAN', pt: 'IBAN' },
  bic: { en: 'BIC / SWIFT', es: 'BIC / SWIFT', fr: 'BIC / SWIFT', de: 'BIC / SWIFT', pt: 'BIC / SWIFT' },
  phone: { en: 'Bizum number', es: 'Número de Bizum', fr: 'Numéro Bizum', de: 'Bizum-Nummer', pt: 'Número Bizum' },
  name: { en: 'Name', es: 'Nombre', fr: 'Nom', de: 'Name', pt: 'Nome' },
  sortCode: { en: 'Sort code', es: 'Sort code', fr: 'Sort code', de: 'Sort Code', pt: 'Sort code' },
  routing: { en: 'Routing / SWIFT', es: 'Routing / SWIFT', fr: 'Routing / SWIFT', de: 'Routing / SWIFT', pt: 'Routing / SWIFT' },
  handle: { en: 'Send to', es: 'Enviar a', fr: 'Envoyer à', de: 'Senden an', pt: 'Enviar para' },
  kind: { en: 'Type', es: 'Tipo', fr: 'Type', de: 'Art', pt: 'Tipo' },
  number: { en: 'Number', es: 'Número', fr: 'Numéro', de: 'Nummer', pt: 'Número' },
  account: { en: 'Account', es: 'Cuenta', fr: 'Compte', de: 'Konto', pt: 'Conta' },
  provider: { en: 'Provider', es: 'Proveedor', fr: 'Opérateur', de: 'Anbieter', pt: 'Operador' },
}
export const publicLabel = (key: string, lang: string) => LABELS[key]?.[lang] ?? LABELS[key]?.en ?? key
