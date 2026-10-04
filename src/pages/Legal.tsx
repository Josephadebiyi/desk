import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { LangMenu } from '../i18n/Flags'
import { ThemeToggle } from '../theme'
import './public.css'

const UPDATED = '2026-10-04'

/** Privacy policy and terms of use, in the visitor's language. */
export default function Legal({ page }: { page: 'privacy' | 'terms' }) {
  const { t, locale } = useT()
  const sections = [1, 2, 3, 4, 5, 6]
  return (
    <div className="pub">
      <header className="pub-top">
        <Link to="/" className="auth-back legal-back">
          <ArrowLeft size={15} /> {t('common.backToSite')}
        </Link>
        <span className="pub-tools">
          <LangMenu />
          <ThemeToggle />
        </span>
      </header>
      <main className="pub-main">
        <article className="pub-card legal">
          <h1>{t(`legal.${page}.title`)}</h1>
          <p className="pub-sub">{t(`legal.${page}.sub`)}</p>
          <small className="pub-note">{t('legal.updated', { date: new Date(UPDATED + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}</small>
          {sections.map((n) => (
            <section key={n}>
              <h2>{t(`legal.${page}.h${n}`)}</h2>
              <p>{t(`legal.${page}.b${n}`)}</p>
            </section>
          ))}
          <p className="pub-note">{t('legal.contact')}</p>
          <Link to={page === 'privacy' ? '/terms' : '/privacy'} className="d-link">
            {t(page === 'privacy' ? 'legal.terms.title' : 'legal.privacy.title')} →
          </Link>
        </article>
      </main>
    </div>
  )
}
