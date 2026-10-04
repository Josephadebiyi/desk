import { ArrowRight, Hammer } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useT } from '../i18n'

/** Modules that haven't been built yet. */
export default function Placeholder() {
  const key = useLocation().pathname.split('/')[2] ?? ''
  const { t } = useT()
  const known = ['giving', 'messaging', 'events', 'design', 'reports', 'settings', 'help', 'links'].includes(key)
  const title = known ? t(`dash.nav.${key}`) : t('help.soon')
  return (
    <div className="d-page">
      <div className="d-head">
        <h1>{title}</h1>
      </div>
      <div className="d-panel d-soon">
        <span className="d-soon-ico">
          <Hammer size={22} />
        </span>
        <h2>{t('help.soonTitle')}</h2>
        <p>{t('help.soonSub')}</p>
        <Link to="/dashboard/members" className="d-btn d-btn-ink">
          {t('help.goMembers')} <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  )
}
