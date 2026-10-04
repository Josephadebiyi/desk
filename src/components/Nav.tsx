import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { ArrowRight, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../theme'
import { Logo } from './ui'
import { LangMenu } from '../i18n/Flags'
import { useT } from '../i18n'

const LINKS = [
  { label: 'platform', href: '#platform' },
  { label: 'ministries', href: '#ministries' },
  { label: 'design', href: '#design' },
  { label: 'giving', href: '#giving' },
  { label: 'pricing', href: '#pricing' },
]

export default function Nav() {
  const { t } = useT()
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [bar, setBar] = useState(true)
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 12))

  return (
    <header className={`site-head ${scrolled ? 'is-scrolled' : ''}`}>
      <AnimatePresence initial={false}>
        {bar && !scrolled && (
          <motion.div
            className="announce"
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="announce-inner">
              <span className="announce-tag">{t('site.nav.announceTag')}</span>
              <span>{t('site.nav.announce')}</span>
              <a href="#pricing">
                {t('site.nav.seePlans')} <ArrowRight size={14} />
              </a>
              <button type="button" aria-label={t('common.dismiss')} onClick={() => setBar(false)}>
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="nav container">
        <Logo height={38} />
        <ul className="nav-links">
          {LINKS.map((l) => (
            <li key={l.label}>
              <a href={l.href}>{t(`site.nav.${l.label}`)}</a>
            </li>
          ))}
        </ul>
        <div className="nav-actions">
          <LangMenu />
          <ThemeToggle />
          <Link className="nav-login" to="/login">
            {t('site.nav.login')}
          </Link>
          <Link className="btn btn-lime btn-sm" to="/register">
            {t('site.nav.trial')}
          </Link>
        </div>
        <div className="nav-mobile-end">
          <LangMenu />
          <ThemeToggle />
          <button
            className="nav-burger"
            type="button"
            aria-label={open ? t('site.nav.closeMenu') : t('site.nav.openMenu')}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            className="mobile-menu container"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {LINKS.map((l) => (
              <a key={l.label} href={l.href} onClick={() => setOpen(false)}>
                {t(`site.nav.${l.label}`)}
              </a>
            ))}
            <div className="mobile-menu-cta">
              <Link className="btn btn-outline" to="/login">
                {t('site.nav.login')}
              </Link>
              <Link className="btn btn-lime" to="/register">
                {t('site.nav.freeTrial')}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
