import { useT, tr } from '../i18n'
import './flyers.css'

/**
 * Original church-flyer templates, styled after current church flyer design trends
 * (warm gradients, gold editorial, bold revival type, photo-in-number, duotone, serif).
 * Every size is in container units, so one template renders as a thumbnail or a poster.
 */

const px = (id: number, w = 900) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`

export const FLYER_TEMPLATES = [
  { id: 'sunset', name: 'Sunset Minimal', sample: 'New Year Service' },
  { id: 'gold', name: 'Gold Editorial', sample: 'Evangelism' },
  { id: 'revival', name: 'Revival Night', sample: 'Revival Night' },
  { id: 'number', name: 'Big Number', sample: '24 Conference' },
  { id: 'duotone', name: 'Duotone Worship', sample: 'Worship' },
  { id: 'serif', name: 'Serif Gathering', sample: 'We Gather to Adore' },
] as const

export type FlyerId = (typeof FLYER_TEMPLATES)[number]['id']

export interface FlyerProps {
  template: FlyerId
  title: string
  when: string
  church: string
  qr?: string
  className?: string
}

export function Flyer({ template, title, when, church, qr, className = '' }: FlyerProps) {
  const { t } = useT()
  const words = title.trim().split(/\s+/)
  const first = words[0] ?? ''
  const rest = words.slice(1).join(' ')

  return (
    <div className={`flyer f-${template} ${className}`}>
      {template === 'sunset' && (
        <>
          <div className="f-sun" />
          <span className="f-kicker">{t('flyer.presents', { church })}</span>
          <div className="f-center">
            {words.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className="f-date">{when}</div>
          <span className="f-foot">{t('flyer.welcome')}</span>
        </>
      )}

      {template === 'gold' && (
        <>
          <span className="f-kicker">{t('flyer.presents', { church })}</span>
          <div className="f-title">{title}</div>
          <span className="f-script">{t('flyer.joinUs')}</span>
          <div className="f-date">{when}</div>
          <div className="f-photo">
            <img src={px(8674183)} alt="" />
          </div>
          <i className="f-ring" />
        </>
      )}

      {template === 'revival' && (
        <>
          <div className="f-head">
            <div className="f-title">{title}</div>
            <div className="f-side">
              <b>{when}</b>
              <span>{church}</span>
            </div>
          </div>
          <div className="f-photo">
            <img src={px(19130852)} alt="" />
          </div>
          <div className="f-repeat" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i}>{title}</span>
            ))}
          </div>
        </>
      )}

      {template === 'number' && (
        <>
          <div
            className="f-big"
            style={{
              backgroundImage: `url(${px(36425622, 1000)})`,
              // Numbers fill the poster; longer words shrink to stay on one line.
              fontSize: `${Math.min(62, 150 / Math.max(first.length, 1))}cqw`,
            }}
          >
            {first}
          </div>
          <div className="f-meta">
            <b>{rest || church}</b>
            <span>{when}</span>
          </div>
          <span className="f-star">✳</span>
          <span className="f-foot">{church}</span>
        </>
      )}

      {template === 'duotone' && (
        <>
          <div className="f-photo">
            <img src={px(34625181)} alt="" />
          </div>
          <div className="f-title">{title}</div>
          <span className="f-with">{t('flyer.withUs')}</span>
          <div className="f-row">
            <span>
              <small>{t('flyer.when')}</small>
              {when}
            </span>
            <span>
              <small>{t('flyer.where')}</small>
              {church}
            </span>
          </div>
        </>
      )}

      {template === 'serif' && (
        <>
          <div className="f-photo">
            <img src={px(7219096)} alt="" />
          </div>
          <span className="f-kicker">{when}</span>
          <div className="f-title">{title}</div>
          <span className="f-foot">{church}</span>
        </>
      )}

      {qr && <img className="f-qr" src={qr} alt={t('flyer.qr')} />}
    </div>
  )
}

/** Template name and sample title in the current language. */
export const flyerName = (id: FlyerId) => tr(`flyer.tpl.${id}.name`)
export const flyerSample = (id: FlyerId) => tr(`flyer.tpl.${id}.sample`)
