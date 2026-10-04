import { Check } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { LANGS, useT, type Lang } from '.'

/** Round SVG flags (emoji flags don't render on Windows). */
export function Flag({ lang, size = 40 }: { lang: Lang; size?: number }) {
  const id = useId()
  const body: Record<Lang, React.ReactNode> = {
    en: (
      <>
        <rect width="60" height="60" fill="#012169" />
        <path d="M0 0L60 60M60 0L0 60" stroke="#fff" strokeWidth="12" />
        <path d="M0 0L60 60M60 0L0 60" stroke="#C8102E" strokeWidth="5" />
        <path d="M30 0V60M0 30H60" stroke="#fff" strokeWidth="18" />
        <path d="M30 0V60M0 30H60" stroke="#C8102E" strokeWidth="10" />
      </>
    ),
    es: (
      <>
        <rect width="60" height="60" fill="#AA151B" />
        <rect y="15" width="60" height="30" fill="#F1BF00" />
      </>
    ),
    fr: (
      <>
        <rect width="20" height="60" fill="#002654" />
        <rect x="20" width="20" height="60" fill="#fff" />
        <rect x="40" width="20" height="60" fill="#CE1126" />
      </>
    ),
    de: (
      <>
        <rect width="60" height="20" fill="#000" />
        <rect y="20" width="60" height="20" fill="#DD0000" />
        <rect y="40" width="60" height="20" fill="#FFCE00" />
      </>
    ),
    pt: (
      <>
        <rect width="60" height="60" fill="#FF0000" />
        <rect width="24" height="60" fill="#006600" />
        <circle cx="24" cy="30" r="9" fill="#FFCC00" />
        <circle cx="24" cy="30" r="5.5" fill="#FF0000" stroke="#fff" strokeWidth="1.5" />
      </>
    ),
  }
  return (
    <svg className="flag" width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <clipPath id={id}>
        <circle cx="30" cy="30" r="30" />
      </clipPath>
      <g clipPath={`url(#${id})`}>{body[lang]}</g>
      <circle cx="30" cy="30" r="29.5" fill="none" stroke="rgba(0,0,0,0.12)" />
    </svg>
  )
}

/** Card-style language picker: a round flag + native name per card. */
export function LangCards({ value, onChange, label }: { value: Lang; onChange: (l: Lang) => void; label: string }) {
  return (
    <div className="lang-cards" role="radiogroup" aria-label={label}>
      {LANGS.map((l) => (
        <button key={l.code} type="button" role="radio" aria-checked={value === l.code} className={`lang-card ${value === l.code ? 'is-on' : ''}`} onClick={() => onChange(l.code)}>
          <Flag lang={l.code} size={44} />
          <span>{l.native}</span>
          {value === l.code && (
            <i className="lang-check" aria-hidden="true">
              <Check size={12} strokeWidth={3} />
            </i>
          )}
        </button>
      ))}
    </div>
  )
}

/** Top-right language switcher: round flag button + dropdown of flag cards. Saves immediately. */
export function LangMenu({ className = '' }: { className?: string }) {
  const { lang, commLang, chosen, savePrefs, t } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const cur = LANGS.find((l) => l.code === lang)!
  return (
    <div className={`lang-menu ${className}`} ref={ref}>
      <button type="button" className="lang-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-label={t('lang.appLanguage')} title={t('lang.appLanguage')} onClick={() => setOpen((o) => !o)}>
        <Flag lang={lang} size={22} />
        <span>{cur.code.toUpperCase()}</span>
      </button>
      {open && (
        <div className="lang-menu-pop" role="menu">
          <small>{t('lang.appLanguage')}</small>
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={lang === l.code}
              className={`lang-menu-item ${lang === l.code ? 'is-on' : ''}`}
              onClick={() => {
                savePrefs(l.code, chosen ? commLang : l.code)
                setOpen(false)
              }}
            >
              <Flag lang={l.code} size={30} />
              <span>{l.native}</span>
              {lang === l.code && <Check size={15} strokeWidth={3} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
