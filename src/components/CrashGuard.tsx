import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { tr } from '../i18n'

/**
 * Keeps a crash on one screen from blanking the whole app (website and desktop app).
 *
 * 1. A new website upload replaces the page files (assets/*.js). A window opened before the upload then asks for
 *    files that no longer exist. That isn't a bug in the screen, so we reload once to pick up the new version.
 * 2. Any other error shows a friendly message with Reload / Back instead of a blank screen.
 */
const RELOAD_KEY = 'zd-chunk-reload'
const isStaleChunk = (e: unknown) =>
  /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically|ChunkLoadError|Unable to preload CSS/i.test(
    e instanceof Error ? `${e.name} ${e.message}` : String(e),
  )

/** Reloads the page once (not in a loop) when the site has been updated under an open window. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < 30_000) return false // already tried just now: show the message instead
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    /* storage blocked: still try once */
  }
  window.location.reload()
  return true
}

// Vite reports a page file that failed to load here (before React sees it).
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForNewVersion()) e.preventDefault()
  })
}

type Props = { children: ReactNode; resetKey: string; inDashboard?: boolean }
type State = { error: unknown }

class Boundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ZionDesk] screen crashed:', error, info.componentStack)
    if (isStaleChunk(error)) reloadForNewVersion()
  }
  componentDidUpdate(prev: Props) {
    // Moving to another screen clears the error.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    const detail = this.state.error instanceof Error ? this.state.error.message : String(this.state.error)
    return (
      <div className={`crash-card ${this.props.inDashboard ? 'in-dash' : ''}`} role="alert">
        <h2>{tr('common.crash.title')}</h2>
        <p>{tr('common.crash.body')}</p>
        <div className="crash-actions">
          <button type="button" className="btn btn-purple" onClick={() => window.location.reload()}>
            {tr('common.crash.reload')}
          </button>
          <a className="btn btn-ghost" href={this.props.inDashboard ? '/dashboard' : '/'}>
            {tr(this.props.inDashboard ? 'common.crash.dashboard' : 'common.crash.home')}
          </a>
        </div>
        <details>
          <summary>{tr('common.crash.details')}</summary>
          <code>{detail}</code>
        </details>
      </div>
    )
  }
}

/** Wrap a group of screens; the error clears when the address changes. */
export function CrashGuard({ children, inDashboard }: { children: ReactNode; inDashboard?: boolean }) {
  const { pathname } = useLocation()
  return (
    <Boundary resetKey={pathname} inDashboard={inDashboard}>
      {children}
    </Boundary>
  )
}
