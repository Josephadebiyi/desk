/**
 * Currencies. Shared by the browser and the server.
 *
 * - A church picks its currency at sign-up (pre-selected from the visitor's region).
 * - Giving is charged in the church's currency when Flutterwave can collect it, else USD.
 * - Plans are billed in the church's currency at the fixed local prices below, else USD.
 *   Local prices are set by hand (not live exchange rates) so a church's monthly bill never
 *   moves with the exchange rate. Review them a few times a year.
 */
import type { PlanKey as PlanId } from './plans'

/** Currencies Flutterwave collects in (cards + local methods). Anything else falls back to USD. */
export const FLW_CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'TZS', 'RWF', 'XOF', 'XAF', 'ZMW', 'MWK', 'EGP'] as const
export type FlwCurrency = (typeof FLW_CURRENCIES)[number]

/** Choices offered to churches: Flutterwave currencies plus a few common ones that fall back to USD for payments. */
export const CHURCH_CURRENCIES = [...FLW_CURRENCIES, 'CAD', 'AUD', 'BRL', 'MXN', 'INR'] as const

export const isFlwCurrency = (c: unknown): c is FlwCurrency => FLW_CURRENCIES.includes(c as FlwCurrency)

/** The currency money is actually collected in. */
export const chargeCurrency = (c: unknown): FlwCurrency => (isFlwCurrency(c) ? c : 'USD')

/** Monthly plan prices per billing currency (rounded local prices). */
export const PLAN_PRICES: Partial<Record<FlwCurrency, Record<PlanId, number>>> = {
  USD: { essentials: 8, plus: 19.99, max: 39.99 },
  EUR: { essentials: 7.99, plus: 18.99, max: 36.99 },
  GBP: { essentials: 6.99, plus: 15.99, max: 31.99 },
  NGN: { essentials: 12000, plus: 29000, max: 59000 },
  GHS: { essentials: 120, plus: 290, max: 590 },
  KES: { essentials: 1000, plus: 2500, max: 5000 },
  ZAR: { essentials: 149, plus: 359, max: 719 },
  UGX: { essentials: 29000, plus: 72000, max: 145000 },
  TZS: { essentials: 20000, plus: 50000, max: 100000 },
  RWF: { essentials: 10000, plus: 26000, max: 52000 },
  XOF: { essentials: 4900, plus: 11900, max: 23900 },
  XAF: { essentials: 4900, plus: 11900, max: 23900 },
  ZMW: { essentials: 199, plus: 499, max: 999 },
}

/** Currency the church's plan is billed in. */
export const billingCurrency = (churchCurrency: unknown): FlwCurrency => {
  const c = chargeCurrency(churchCurrency)
  return PLAN_PRICES[c] ? c : 'USD'
}

export const planPrice = (plan: PlanId, churchCurrency: unknown) => {
  const currency = billingCurrency(churchCurrency)
  return { currency, amount: PLAN_PRICES[currency]![plan] }
}

export const formatMoney = (amount: number, currency: string, locale = 'en-US') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(amount)

const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', IE: 'EUR', FR: 'EUR', DE: 'EUR', ES: 'EUR', PT: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR',
  NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', UG: 'UGX', TZ: 'TZS', RW: 'RWF', ZM: 'ZMW', MW: 'MWK', EG: 'EGP',
  SN: 'XOF', CI: 'XOF', BJ: 'XOF', TG: 'XOF', BF: 'XOF', ML: 'XOF', NE: 'XOF', CM: 'XAF', GA: 'XAF', CG: 'XAF', TD: 'XAF', CF: 'XAF', GQ: 'XAF',
  CA: 'CAD', AU: 'AUD', BR: 'BRL', MX: 'MXN', IN: 'INR',
}
const TZ_REGION: Record<string, string> = {
  'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA', 'Africa/Kampala': 'UG', 'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kigali': 'RW', 'Africa/Lusaka': 'ZM', 'Africa/Blantyre': 'MW', 'Africa/Cairo': 'EG', 'Africa/Dakar': 'SN', 'Africa/Abidjan': 'CI', 'Africa/Douala': 'CM',
  'Europe/London': 'GB',
}

/** Best guess of the visitor's currency (browser region, then time zone); USD when unsure. */
export function guessCurrency(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (TZ_REGION[tz]) return REGION_CURRENCY[TZ_REGION[tz]]
    for (const l of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(l).maximize().region
      if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region]
    }
  } catch {
    /* fall through */
  }
  return 'USD'
}

/** Quick-pick gift amounts that make sense in each currency. */
const GIFT_PRESETS: Record<string, number[]> = {
  NGN: [2000, 5000, 10000, 20000],
  GHS: [50, 100, 200, 500],
  KES: [500, 1000, 2000, 5000],
  ZAR: [100, 200, 500, 1000],
  UGX: [10000, 20000, 50000, 100000],
  TZS: [10000, 20000, 50000, 100000],
  RWF: [5000, 10000, 20000, 50000],
  XOF: [2000, 5000, 10000, 20000],
  XAF: [2000, 5000, 10000, 20000],
  ZMW: [50, 100, 200, 500],
  MWK: [5000, 10000, 20000, 50000],
  EGP: [100, 250, 500, 1000],
  INR: [500, 1000, 2000, 5000],
}
export const giftPresets = (currency: string) => GIFT_PRESETS[currency] ?? [10, 25, 50, 100]
