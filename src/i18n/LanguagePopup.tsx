import { AnimatePresence, motion } from 'framer-motion'
import { Languages } from 'lucide-react'
import { useState } from 'react'
import { useT, type Lang } from '.'
import { LangCards } from './Flags'

/** First-time language onboarding. Shown once; saved preferences stop it reappearing. */
export function LanguagePopup() {
  const { chosen, lang, commLang, savePrefs, setLang, t } = useT()
  const [ui, setUi] = useState<Lang>(lang)
  const [comm, setComm] = useState<Lang>(commLang)
  const [commTouched, setCommTouched] = useState(false)
  if (chosen) return null
  return (
    <AnimatePresence>
      <motion.div className="lp-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <motion.div className="lp-card" role="dialog" aria-modal="true" aria-labelledby="lp-title" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <span className="lp-ico">
            <Languages size={22} />
          </span>
          <h2 id="lp-title">{t('lang.popupTitle')}</h2>
          <LangCards
            value={ui}
            label={t('lang.appLanguage')}
            onChange={(l) => {
              setUi(l)
              setLang(l) // preview the interface immediately
              if (!commTouched) setComm(l)
            }}
          />
          <div className="lp-comm">
            <b>{t('lang.popupCommQuestion')}</b>
            <small>{t('lang.popupCommHint')}</small>
            <LangCards
              value={comm}
              label={t('lang.commLanguage')}
              onChange={(l) => {
                setComm(l)
                setCommTouched(true)
              }}
            />
          </div>
          <button type="button" className="lp-go" onClick={() => savePrefs(ui, comm)}>
            {t('lang.popupContinue')}
          </button>
          <small className="lp-note">{t('lang.popupSub')}</small>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
