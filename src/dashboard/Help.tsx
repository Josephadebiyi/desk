import { AnimatePresence, motion } from 'framer-motion'
import { Mail, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHead } from './kit'
import { useT } from '../i18n'

const FAQ = [1, 2, 3, 4, 5, 6, 7, 8]

export default function Help() {
  const [open, setOpen] = useState<number | null>(0)
  const { t } = useT()
  return (
    <div className="d-page">
      <PageHead title={t('dash.nav.help')} />
      <div className="d-two">
        <section className="d-panel d-span-2">
          <div className="d-panel-head">
            <h2>{t('help.faq')}</h2>
          </div>
          <div className="hp-list">
            {FAQ.map((n, i) => (
              <div key={n} className={`hp-item ${open === i ? 'is-open' : ''}`}>
                <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                  <span>{t(`help.q${n}`)}</span>
                  <motion.span animate={{ rotate: open === i ? 45 : 0 }}>
                    <Plus size={16} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open === i && (
                    <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      {t(`help.a${n}`)}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>
        <section className="d-panel d-soon">
          <span className="d-soon-ico">
            <Mail size={22} />
          </span>
          <h2>{t('help.still')}</h2>
          <p>{t('help.stillSub')}</p>
          <a className="d-btn d-btn-ink" href="mailto:hello@ziondesk.com">
            {t('help.email')}
          </a>
        </section>
        <section className="d-panel d-soon">
          <h2>{t('help.links')}</h2>
          <div className="hp-links">
            <Link to="/dashboard/members?import=1" className="d-btn">
              {t('members.importTitle')}
            </Link>
            <Link to="/dashboard/events" className="d-btn">
              {t('events.new')}
            </Link>
            <Link to="/dashboard/settings?tab=team" className="d-btn">
              {t('help.inviteTeam')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
