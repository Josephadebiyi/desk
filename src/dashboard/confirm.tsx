/**
 * "Are you sure?" pop-up shown before every dashboard action that sends, saves, deletes or changes something.
 *   if (!(await confirmAction({ title: tr('cf.sendTitle'), body: …, confirmLabel: … }))) return
 * <ConfirmHost /> is mounted once in the dashboard layout.
 */
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { tr } from '../i18n'

export interface ConfirmOptions {
  title: string
  body?: string
  /** Main button text (defaults to "Confirm"). */
  confirmLabel?: string
  /** Red button + warning icon for deletes and other things that can't be undone. */
  danger?: boolean
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }
let show: ((p: Pending) => void) | null = null

/** Resolves true when the user confirms. Without a mounted host (e.g. public pages) it lets the action through. */
export function confirmAction(o: ConfirmOptions): Promise<boolean> {
  if (!show) return Promise.resolve(true)
  return new Promise((resolve) => show!({ ...o, resolve }))
}

/** Runs `fn` only after the user confirms. */
export const withConfirm = (o: ConfirmOptions, fn: () => unknown) => () => void confirmAction(o).then((ok) => ok && fn())

export function ConfirmHost() {
  const [p, setP] = useState<Pending | null>(null)
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    show = (next) => setP((cur) => (cur ? (next.resolve(false), cur) : next))
    return () => {
      show = null
    }
  }, [])

  const done = (ok: boolean) => {
    p?.resolve(ok)
    setP(null)
  }

  useEffect(() => {
    if (!p) return
    okRef.current?.focus()
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(false)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  return (
    <AnimatePresence>
      {p && (
        <motion.div className="d-overlay cf-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => done(false)}>
          <motion.div
            className="d-modal cf-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cf-title"
            aria-describedby={p.body ? 'cf-body' : undefined}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className={`cf-icon ${p.danger ? 'is-danger' : ''}`}>{p.danger ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}</span>
            <h2 id="cf-title">{p.title}</h2>
            {p.body && <p id="cf-body">{p.body}</p>}
            <div className="cf-actions">
              <button type="button" className="d-btn" onClick={() => done(false)}>
                {tr('common.cancel')}
              </button>
              <button type="button" ref={okRef} className={`d-btn ${p.danger ? 'cf-danger' : 'd-btn-ink'}`} onClick={() => done(true)}>
                {p.confirmLabel ?? tr('common.confirm')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
