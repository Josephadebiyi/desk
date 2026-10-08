import { ArrowLeft, ArrowRight, FileText, Globe2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { LangMenu } from '../i18n/Flags'
import { COMPANY, LEGAL_UPDATED } from '../lib/company'
import { ThemeToggle } from '../theme'
import './public.css'

export type LegalDoc = 'terms' | 'privacy' | 'cookies' | 'dpa' | 'subprocessors' | 'refunds' | 'aup'

/** Number of sections in each document (keys h1…hN / b1…bN in the "legal" namespace). */
const SECTIONS: Record<Exclude<LegalDoc, 'subprocessors'>, number> = { terms: 14, privacy: 15, cookies: 4, dpa: 9, refunds: 6, aup: 6 }
const DOCS: LegalDoc[] = ['terms', 'privacy', 'cookies', 'dpa', 'subprocessors', 'refunds', 'aup']
export const LEGAL_PATH: Record<LegalDoc, string> = { terms: '/terms', privacy: '/privacy', cookies: '/cookies', dpa: '/dpa', subprocessors: '/subprocessors', refunds: '/refunds', aup: '/acceptable-use' }

const SUBPROCESSORS = [
  { id: 'supabase', name: 'Supabase, Inc.', where: 'USA / EU (project region)' },
  { id: 'render', name: 'Render Services, Inc.', where: 'USA' },
  { id: 'resend', name: 'Resend (Plus Five Five, Inc.)', where: 'USA' },
  { id: 'stripe', name: 'Stripe Payments Europe, Ltd.', where: 'Ireland / USA' },
  { id: 'paystack', name: 'Paystack Payments Ltd (a Stripe company)', where: 'Nigeria / USA' },
  { id: 'flutterwave', name: 'Flutterwave, Inc.', where: 'Nigeria / USA' },
  { id: 'anthropic', name: 'Anthropic, PBC', where: 'USA' },
  { id: 'google', name: 'Google LLC', where: 'USA' },
  { id: 'meta', name: 'Meta Platforms, Inc. / WhatsApp', where: 'USA / Ireland' },
  { id: 'twilio', name: 'Twilio Inc.', where: 'USA' },
]

/** Paragraphs; lines starting with "• " become a bullet list. */
function Body({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) out.push(<ul key={`u${out.length}`}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>)
    list = []
  }
  for (const l of lines) {
    if (l.startsWith('• ')) list.push(l.slice(2))
    else {
      flush()
      out.push(<p key={`p${out.length}`}>{l}</p>)
    }
  }
  flush()
  return <>{out}</>
}

function Shell({ children, back }: { children: React.ReactNode; back: 'site' | 'hub' }) {
  const { t } = useT()
  return (
    <div className="pub">
      <header className="pub-top">
        <Link to={back === 'hub' ? '/legal' : '/'} className="auth-back legal-back">
          <ArrowLeft size={15} /> {back === 'hub' ? t('legal.hub.title') : t('common.backToSite')}
        </Link>
        <span className="pub-tools">
          <LangMenu />
          <ThemeToggle />
        </span>
      </header>
      <main className="pub-main">{children}</main>
    </div>
  )
}

function Footer() {
  const { t, lang } = useT()
  return (
    <footer className="legal-foot">
      <p>{t('legal.contact', { email: COMPANY.email })}</p>
      <p>
        {t('legal.company', { name: COMPANY.name })}
        {COMPANY.address && <> · {t('legal.address', { address: COMPANY.address })}</>}
        {COMPANY.euRep && <> · {t('legal.euRep', { rep: COMPANY.euRep })}</>}
      </p>
      {lang !== 'en' && <p>{t('legal.english')}</p>}
    </footer>
  )
}

/** Legal centre: /legal lists every policy; each policy has its own page, in the visitor's language. */
export default function Legal({ page }: { page: LegalDoc | 'hub' }) {
  const { t, locale } = useT()
  const updated = t('legal.updated', { date: new Date(LEGAL_UPDATED + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) })

  if (page === 'hub')
    return (
      <Shell back="site">
        <article className="pub-card legal legal-hub">
          <h1>
            <ShieldCheck size={26} /> {t('legal.hub.title')}
          </h1>
          <p className="pub-sub">{t('legal.hub.sub')}</p>
          <h2>{t('legal.hub.docs')}</h2>
          <div className="legal-docs">
            {DOCS.map((d) => (
              <Link key={d} to={LEGAL_PATH[d]} className="legal-doc">
                <FileText size={18} />
                <span>
                  <b>{t(`legal.docs.${d}`)}</b>
                  <small>{t(`legal.descs.${d}`)}</small>
                </span>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
          <h2>{t('legal.hub.regions')}</h2>
          <div className="legal-regions">
            {(['us', 'eu', 'af'] as const).map((r) => (
              <div key={r}>
                <Globe2 size={18} />
                <b>{t(`legal.hub.${r}`)}</b>
                <small>{t(`legal.hub.${r}Laws`)}</small>
              </div>
            ))}
          </div>
          <h2>{t('legal.hub.rights')}</h2>
          <p>{t('legal.hub.rightsText')}</p>
          <Link to="/dashboard/settings?tab=account" className="d-link">
            {t('legal.hub.open')} →
          </Link>
          <p className="pub-note">{t('legal.hub.security', { email: COMPANY.email })}</p>
          <small className="pub-note">{updated}</small>
          <Footer />
        </article>
      </Shell>
    )

  return (
    <Shell back="hub">
      <article className="pub-card legal">
        <h1>{t(`legal.docs.${page}`)}</h1>
        <p className="pub-sub">{t(`legal.${page}.sub`)}</p>
        <small className="pub-note">{updated}</small>
        {page === 'subprocessors' ? (
          <>
            <div className="legal-table-wrap">
              <table className="legal-table">
                <thead>
                  <tr>
                    <th>{t('legal.subprocessors.company')}</th>
                    <th>{t('legal.subprocessors.purpose')}</th>
                    <th>{t('legal.subprocessors.location')}</th>
                  </tr>
                </thead>
                <tbody>
                  {SUBPROCESSORS.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{t(`legal.subprocessors.${s.id}`)}</td>
                      <td>{s.where}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>{t('legal.subprocessors.note')}</p>
          </>
        ) : (
          Array.from({ length: SECTIONS[page] }, (_, i) => i + 1).map((n) => (
            <section key={n}>
              <h2>
                {n}. {t(`legal.${page}.h${n}`)}
              </h2>
              <Body text={t(`legal.${page}.b${n}`)} />
            </section>
          ))
        )}
        <nav className="legal-more">
          {DOCS.filter((d) => d !== page).map((d) => (
            <Link key={d} to={LEGAL_PATH[d]} className="d-link">
              {t(`legal.docs.${d}`)}
            </Link>
          ))}
        </nav>
        <p className="pub-note">{t('legal.notAdvice')}</p>
        <Footer />
      </article>
    </Shell>
  )
}
