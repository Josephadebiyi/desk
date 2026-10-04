/**
 * ZionDesk internationalisation.
 *
 * - One dictionary per language (src/i18n/locales/*). English is the source of truth and the
 *   fallback; other languages are typed against it, so a missing key is a compile error.
 * - `t('members.title')`, `t('common.people', { count: 3 })` — `{var}` interpolation and
 *   `_one` / `_other` plural keys (Intl.PluralRules).
 * - Two preferences per user: interface language (the app) and communication language
 *   (emails, messages, invitations). Stored locally now; load from the user record after auth.
 * - Non-English dictionaries are loaded on demand to keep the first load small.
 * - Add a language: add it to LANGS and create locales/<code>.ts typed as Dict.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import en, { type Dict } from './locales/en'

export type Lang = 'en' | 'es' | 'fr' | 'de' | 'pt'

export const LANGS: { code: Lang; native: string; flag: string; locale: string }[] = [
  { code: 'en', native: 'English', flag: '🇬🇧', locale: 'en-US' },
  { code: 'es', native: 'Español', flag: '🇪🇸', locale: 'es-ES' },
  { code: 'fr', native: 'Français', flag: '🇫🇷', locale: 'fr-FR' },
  { code: 'de', native: 'Deutsch', flag: '🇩🇪', locale: 'de-DE' },
  { code: 'pt', native: 'Português', flag: '🇵🇹', locale: 'pt-PT' },
]
export const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v)
export const localeOf = (l: Lang) => LANGS.find((x) => x.code === l)?.locale ?? 'en-US'

const loaders: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Dict }>> = {
  es: () => import('./locales/es'),
  fr: () => import('./locales/fr'),
  de: () => import('./locales/de'),
  pt: () => import('./locales/pt'),
}
const loaded: Partial<Record<Lang, Dict>> = { en }

export async function loadLang(l: Lang): Promise<Dict> {
  if (loaded[l]) return loaded[l]!
  const mod = await loaders[l as Exclude<Lang, 'en'>]()
  loaded[l] = mod.default
  return mod.default
}

/* ───────── lookup ───────── */

type Vars = Record<string, string | number>

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as object)) cur = (cur as Record<string, unknown>)[part]
    else return undefined
  }
  return typeof cur === 'string' ? cur : undefined
}

const warned = new Set<string>()
export function translate(lang: Lang, key: string, vars?: Vars): string {
  const dict = loaded[lang] ?? en
  let k = key
  if (vars && typeof vars.count === 'number') {
    const rule = new Intl.PluralRules(localeOf(lang)).select(vars.count)
    const cand = [`${key}_${rule}`, `${key}_other`]
    k = cand.find((c) => lookup(dict, c) !== undefined || lookup(en, c) !== undefined) ?? key
  }
  let s = lookup(dict, k) ?? lookup(en, k)
  if (s === undefined) {
    if (import.meta.env.DEV && !warned.has(key)) {
      warned.add(key)
      console.warn(`[i18n] missing key: ${key}`)
    }
    return key.split('.').pop() ?? key // never show a full dotted key
  }
  if (vars) {
    const nf = new Intl.NumberFormat(localeOf(lang))
    s = s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? (typeof vars[name] === 'number' ? nf.format(vars[name] as number) : String(vars[name])) : m))
  }
  return s
}

/* ───────── current language (for non-React code: formatters, AI tools) ───────── */

let currentLang: Lang = 'en'
export const getLang = () => currentLang
export const getLocale = () => localeOf(currentLang)
/** Translate in the current interface language. */
export const tr = (key: string, vars?: Vars) => translate(currentLang, key, vars)

/* ───────── preferences ───────── */

/** Signed-in sessions register a listener so saved preferences also go to the user's profile. */
let prefsListener: ((ui: Lang, comm: Lang) => void) | null = null
export const onPrefsSaved = (fn: ((ui: Lang, comm: Lang) => void) | null) => (prefsListener = fn)

const PREF_KEY = 'ziondesk-language-v1'
interface Prefs {
  ui: Lang
  comm: Lang
  chosen: boolean // first-time popup answered
}

function initialPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>
      return { ui: isLang(p.ui) ? p.ui : 'en', comm: isLang(p.comm) ? p.comm : 'en', chosen: !!p.chosen }
    }
  } catch {
    /* ignore */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2)
  const guess = isLang(nav) ? nav : 'en'
  return { ui: guess, comm: guess, chosen: false }
}

interface I18nApi {
  lang: Lang
  locale: string
  commLang: Lang
  chosen: boolean
  ready: boolean
  t: (key: string, vars?: Vars) => string
  setLang: (l: Lang) => void
  setCommLang: (l: Lang) => void
  savePrefs: (ui: Lang, comm: Lang) => void
  /** Apply preferences loaded from the user's profile (no toast, not re-saved). */
  applyRemote: (ui: Lang, comm: Lang, chosen: boolean) => void
}

const Ctx = createContext<I18nApi | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs)
  // The language whose dictionary is actually loaded (falls back to English while loading).
  const [active, setActive] = useState<Lang>(loaded[prefs.ui] ? prefs.ui : 'en')
  const [notice, setNotice] = useState(0)

  useEffect(() => {
    let alive = true
    loadLang(prefs.ui)
      .then(() => {
        if (!alive) return
        currentLang = prefs.ui
        setActive(prefs.ui)
      })
      .catch(() => {
        currentLang = 'en'
        if (alive) setActive('en')
      })
    document.documentElement.lang = prefs.ui
    return () => {
      alive = false
    }
  }, [prefs.ui])

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
      // Mirror onto the signed-in account record so emails (trial, invitations) use it too.
      // TODO(backend): PATCH /me { uiLanguage, communicationLanguage } instead.
      const acct = localStorage.getItem('ziondesk-trial')
      if (acct) localStorage.setItem('ziondesk-trial', JSON.stringify({ ...JSON.parse(acct), lang: prefs.ui, commLang: prefs.comm }))
    } catch {
      /* ignore */
    }
  }, [prefs])

  useEffect(() => {
    document.title = translate(active, 'site.metaTitle')
  }, [active])

  // Keep the module-level language in sync during render, so formatters match.
  currentLang = active

  const t = useCallback((key: string, vars?: Vars) => translate(active, key, vars), [active])

  const api = useMemo<I18nApi>(
    () => ({
      lang: prefs.ui,
      locale: localeOf(active),
      commLang: prefs.comm,
      chosen: prefs.chosen,
      ready: active === prefs.ui,
      t,
      setLang: (l) => setPrefs((p) => ({ ...p, ui: l })),
      setCommLang: (l) => setPrefs((p) => ({ ...p, comm: l })),
      savePrefs: (ui, comm) => {
        setPrefs({ ui, comm, chosen: true })
        setNotice(Date.now())
        prefsListener?.(ui, comm)
      },
      applyRemote: (ui, comm, chosen) => setPrefs((p) => (p.ui === ui && p.comm === comm && p.chosen === chosen ? p : { ui, comm, chosen: chosen || p.chosen })),
    }),
    [prefs, active, t],
  )
  return (
    <Ctx.Provider value={api}>
      {children}
      {notice > 0 && <SavedToast key={notice} onDone={() => setNotice(0)} />}
    </Ctx.Provider>
  )
}

/** Confirms the preference is stored and where to change it later. */
function SavedToast({ onDone }: { onDone: () => void }) {
  const { t } = useT()
  useEffect(() => {
    const id = setTimeout(onDone, 6000)
    return () => clearTimeout(id)
  }, [onDone])
  const inApp = typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard')
  return (
    <div className="lang-toast" role="status">
      <b>✓ {t('lang.savedToast')}</b>
      <span>{t('lang.savedToastSub')}</span>
      {inApp && !window.location.search.includes('tab=language') && <a href="/dashboard/settings?tab=language">{t('lang.changeInSettings')}</a>}
      <button type="button" aria-label={t('common.close')} onClick={onDone}>
        ×
      </button>
    </div>
  )
}

export function useT() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useT must be used inside I18nProvider')
  return v
}

/** Compact language picker used on public pages, auth and the marketing nav. */
export function LangSelect({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useT()
  return (
    <label className={`lang-select ${className}`}>
      <span className="sr-only">{t('lang.appLanguage')}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('lang.appLanguage')}>
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.native}
          </option>
        ))}
      </select>
    </label>
  )
}
