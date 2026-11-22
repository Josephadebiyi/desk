import { ArrowLeft, Laptop, Download as DownloadIcon, Globe, LifeBuoy, Monitor, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { LangMenu } from '../i18n/Flags'
import { DESKTOP_MAC_URL, DESKTOP_WIN_URL, detectOS, type DesktopOS } from '../lib/desktop'
import { ThemeToggle } from '../theme'
import './public.css'

type Os = Exclude<DesktopOS, 'other'>

/** Numbered steps; translations hold a little trusted markup (<b>, <code>). */
function Steps({ keys }: { keys: string[] }) {
  const { t } = useT()
  return (
    <ol className="dl-steps">
      {keys.map((k) => (
        <li key={k} dangerouslySetInnerHTML={{ __html: t(k) }} />
      ))}
    </ol>
  )
}

function Version({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="dl-version">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

/** /download — the Mac and Windows apps, with install steps for each recent OS version. */
export default function DownloadPage() {
  const { t } = useT()
  const detected = detectOS()
  const [tab, setTab] = useState<Os>(detected === 'win' ? 'win' : 'mac')
  const order: Os[] = detected === 'win' ? ['win', 'mac'] : ['mac', 'win']
  const macCommon = ['s1', 's2', 's3', 's4'].map((s) => `dl.macStep.${s}`)
  const win = (s: string) => `dl.winStep.${s}`
  // "Only for me" installs without an admin prompt, so the permission question comes after the choice.
  const winSteps = [win('s1'), win('s2'), win('s3'), win('s5'), win('s4'), win('s6')]

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
        <article className="pub-card dl">
          <img src="/brand/app-icon.png" alt="" className="dl-icon" width={72} height={72} />
          <h1>{t('dl.title')}</h1>
          <p className="pub-sub">{t('dl.sub')}</p>

          <div className="dl-buttons">
            {order.map((os, i) => (
              <a
                key={os}
                href={os === 'mac' ? DESKTOP_MAC_URL : DESKTOP_WIN_URL}
                className={`dl-btn ${i === 0 && detected !== 'other' ? 'is-primary' : ''}`}
                onClick={() => setTab(os)}
                download
              >
                {os === 'mac' ? <Laptop size={20} /> : <Monitor size={20} />}
                <span>
                  <b>{t(os === 'mac' ? 'dl.mac' : 'dl.win')}</b>
                  <small>{t(os === 'mac' ? 'dl.macReq' : 'dl.winReq')}</small>
                </span>
                <DownloadIcon size={18} />
              </a>
            ))}
          </div>
          {detected === 'other' && (
            <p className="dl-note">
              {t('dl.otherOs')}{' '}
              <Link to="/login" className="d-link">
                {t('dl.openWeb')} →
              </Link>
            </p>
          )}
          <p className="dl-note">
            <RefreshCw size={14} /> {t('dl.updates')}
          </p>

          <h2>{t('dl.howTo')}</h2>
          <div className="dl-tabs" role="tablist">
            {(['mac', 'win'] as const).map((os) => (
              <button key={os} type="button" role="tab" aria-selected={tab === os} className={tab === os ? 'is-on' : ''} onClick={() => setTab(os)}>
                {os === 'mac' ? <Laptop size={16} /> : <Monitor size={16} />} {t(os === 'mac' ? 'dl.tabMac' : 'dl.tabWin')}
              </button>
            ))}
          </div>

          {tab === 'mac' ? (
            <>
              <Version title={t('dl.macNew')}>
                <Steps keys={[...macCommon, 'dl.macNewStep.s5', 'dl.macNewStep.s6', 'dl.macNewStep.s7']} />
                <p className="dl-note">{t('dl.firstTime')}</p>
              </Version>
              <Version title={t('dl.macOld')}>
                <Steps keys={[...macCommon, 'dl.macOldStep.s5', 'dl.macOldStep.s6']} />
                <p className="dl-note">{t('dl.firstTime')}</p>
              </Version>
            </>
          ) : (
            <>
              <Version title={t('dl.winNew')}>
                <Steps keys={winSteps} />
                <p className="dl-note" dangerouslySetInnerHTML={{ __html: t('dl.win11Note') }} />
              </Version>
              <Version title={t('dl.winOld')}>
                <Steps keys={winSteps} />
                <p className="dl-note" dangerouslySetInnerHTML={{ __html: t('dl.win10Note') }} />
              </Version>
            </>
          )}
          <p className="dl-note">
            <Globe size={14} /> {t('dl.older')}
          </p>

          <h2>
            <LifeBuoy size={20} /> {t('dl.helpH')}
          </h2>
          <ul className="dl-help">
            {tab === 'mac' && <li dangerouslySetInnerHTML={{ __html: t('dl.helpDamaged') }} />}
            <li dangerouslySetInnerHTML={{ __html: t('dl.helpOffline') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dl.helpUninstall') }} />
          </ul>
        </article>
      </main>
    </div>
  )
}
