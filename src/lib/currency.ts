/**
 * Currencies. Shared by the browser and the server.
 *
 * - A church picks its currency at sign-up (pre-selected from the visitor's region).
 * - Giving is charged in the church's currency when Flutterwave can collect it, else USD.
 * - ZionDesk's prices are set in EUR (€8 · €19.99 · €39.99). Churches are billed in their own
 *   currency at the fixed local prices below (≈ the euro price), else in EUR.
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

/** The currency ZionDesk's prices are set in. */
export const BASE_CURRENCY = 'EUR' as const

/** Monthly plan prices per billing currency: EUR is the main price; the others are rounded local equivalents. */
export const PLAN_PRICES: Partial<Record<FlwCurrency, Record<PlanId, number>>> = {
  EUR: { essentials: 8, plus: 19.99, max: 39.99 },
  USD: { essentials: 8.99, plus: 21.99, max: 43.99 },
  GBP: { essentials: 6.99, plus: 16.99, max: 34.99 },
  NGN: { essentials: 13000, plus: 33000, max: 66000 },
  GHS: { essentials: 129, plus: 319, max: 639 },
  KES: { essentials: 1150, plus: 2850, max: 5690 },
  ZAR: { essentials: 159, plus: 399, max: 799 },
  UGX: { essentials: 32000, plus: 80000, max: 160000 },
  TZS: { essentials: 23000, plus: 58000, max: 116000 },
  RWF: { essentials: 12500, plus: 31000, max: 62000 },
  XOF: { essentials: 5200, plus: 13100, max: 26200 },
  XAF: { essentials: 5200, plus: 13100, max: 26200 },
  ZMW: { essentials: 229, plus: 579, max: 1159 },
}

/** Currency the church's plan is billed in (its own when we have a local price, else EUR). */
export const billingCurrency = (churchCurrency: unknown): FlwCurrency => {
  const c = chargeCurrency(churchCurrency)
  return PLAN_PRICES[c] ? c : BASE_CURRENCY
}

/** The euro price and, when different, what the visitor/church pays in their own currency. */
export const priceWithLocal = (plan: PlanId, currency: unknown) => {
  const base = { currency: BASE_CURRENCY as string, amount: PLAN_PRICES.EUR![plan] }
  const local = planPrice(plan, currency)
  return { base, local: local.currency === BASE_CURRENCY ? null : local }
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
/** Local currency for a country, when ZionDesk supports it. */
export const currencyForRegion = (region: string): string | undefined => REGION_CURRENCY[region]

/** The visitor's country (ISO code), from their time zone or browser language. */
export function guessRegion(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (TZ_REGION[tz]) return TZ_REGION[tz]
    for (const l of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(l).maximize().region
      if (region) return region
    }
  } catch {
    /* fall through */
  }
  return 'US'
}

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
