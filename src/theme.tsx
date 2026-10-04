import { motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useT } from './i18n'

export type Theme = 'dark' | 'light'

const KEY = 'ziondesk-theme'
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* storage unavailable */
  }
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.colorScheme = theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#07050d' : '#f7f6fb')
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])

  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const { t } = useT()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? t('common.switchToLight') : t('common.switchToDark')}
      title={dark ? t('common.lightMode') : t('common.darkMode')}
    >
      <motion.span
        className="theme-knob"
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        style={{ marginLeft: dark ? 0 : 'auto' }}
      >
        {dark ? <Moon size={13} /> : <Sun size={13} />}
      </motion.span>
    </button>
  )
}
