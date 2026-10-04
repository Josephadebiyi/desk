import { ArrowLeft } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { renderWelcomeEmail, welcomeEmailSubject } from '../emails/welcome'
import { TRIAL_DAYS } from '../lib/trial'
import { asEmailLang } from '../emails/strings'
import { useT } from '../i18n'
import { LangMenu } from '../i18n/Flags'

/** Shows exactly what the trial welcome email looks like (used while email sending is not connected). */
export default function EmailPreview() {
  const [params] = useSearchParams()
  const { t, commLang } = useT()
  // The email goes out in the reader's communication language.
  const lang = asEmailLang(params.get('lang') ?? commLang)
  const email = params.get('email') || 'pastor@yourchurch.org'
  const origin = window.location.origin
  const q = `trial=1&email=${encodeURIComponent(email)}`
  const html = renderWelcomeEmail({
    lang,
    email,
    dashboardUrl: `${origin}/dashboard?${q}`,
    signupUrl: `${origin}/register?${q}`,
    trialDays: TRIAL_DAYS,
    siteUrl: origin,
  })
  return (
    <div className="email-preview">
      <header>
        <Link to="/" className="btn btn-outline btn-sm">
          <ArrowLeft size={15} /> {t('common.backToSite')}
        </Link>
        <div className="ep-meta">
          <span>
            <b>{t('emailPreview.from')}</b> ZionDesk
          </span>
          <span>
            <b>{t('emailPreview.to')}</b> {email}
          </span>
          <span>
            <b>{t('emailPreview.subject')}</b> {welcomeEmailSubject(TRIAL_DAYS, lang)}
          </span>
        </div>
        <LangMenu />
      </header>
      <iframe title={t('emailPreview.title')} srcDoc={html} />
    </div>
  )
}
