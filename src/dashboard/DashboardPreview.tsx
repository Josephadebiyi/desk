import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DashboardFrame } from './DashboardLayout'
import Members from './Members'
import Overview from './Overview'
import { MemberStoreProvider, useMembers } from './store'
import { WorkspaceProvider } from './workspace'

type View = 'overview' | 'members' | 'detail'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The real ZionDesk dashboard (demo data), scaled into a frame on the marketing site,
 * with an animated cursor that walks through Overview → Members → member details.
 */
function Walkthrough() {
  const { members } = useMembers()
  const wrap = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [vw] = useState(() => (window.innerWidth >= 900 ? 1280 : 760))
  const vh = vw === 1280 ? 800 : 1080
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  const visible = useRef(true)
  const [view, setView] = useState<View>('overview')
  const [cursor, setCursor] = useState({ x: vw * 0.62, y: vh * 0.55 })
  const [clicks, setClicks] = useState(0)

  const detailId = useMemo(
    () => [...members].sort((a, b) => b.dateJoined.localeCompare(a.dateJoined))[1]?.id,
    [members],
  )

  // Fit the fixed-size dashboard into whatever width the frame has.
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const k = e.contentRect.width / vw
      scaleRef.current = k
      setScale(k)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [vw])

  // Pause the walkthrough while it is off-screen.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    const wait = async (ms: number) => {
      await sleep(ms)
      while (alive && !visible.current) await sleep(300)
    }
    const clickOn = async (selector: string) => {
      const box = stage.current?.getBoundingClientRect()
      const el = stage.current?.querySelector(selector)?.getBoundingClientRect()
      if (!box || !el) return
      const k = scaleRef.current
      setCursor({ x: (el.left - box.left + el.width / 2) / k, y: (el.top - box.top + el.height / 2) / k })
      await wait(950)
      setClicks((c) => c + 1)
      await wait(220)
    }
    ;(async () => {
      await wait(1600)
      while (alive) {
        await clickOn('[data-nav="members"]')
        if (!alive) break
        setView('members')
        await wait(2400)
        await clickOn('.d-table tbody tr:nth-child(2) .d-name')
        if (!alive) break
        setView('detail')
        await wait(3600)
        await clickOn('[data-nav="overview"]')
        if (!alive) break
        setView('overview')
        await wait(3400)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div ref={wrap} className="dp-wrap" style={{ height: vh * scale }}>
      <div
        ref={stage}
        className="dp-stage"
        style={{ width: vw, height: vh, transform: `scale(${scale})` }}
        inert
        aria-hidden="true"
      >
        <DashboardFrame preview={{ active: view === 'overview' ? 'overview' : 'members' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={view === 'overview' ? 'overview' : 'members'}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {view === 'overview' ? <Overview /> : <Members preview initialOpenId={view === 'detail' ? detailId : undefined} />}
            </motion.div>
          </AnimatePresence>
        </DashboardFrame>

        <motion.div
          className="dp-cursor"
          animate={{ x: cursor.x, y: cursor.y }}
          transition={{ duration: 0.9, ease: [0.45, 0, 0.2, 1] }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24">
            <path d="M4 2.5 20 12l-7.2 1.6L9.5 21z" fill="#111015" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <AnimatePresence>
            <motion.i
              key={clicks}
              className="dp-ripple"
              initial={{ scale: 0.2, opacity: 0.9 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 0.6 }}
            />
          </AnimatePresence>
        </motion.div>
      </div>
      <div className="dp-fade" />
    </div>
  )
}

export default function DashboardPreview() {
  return (
    <MemberStoreProvider demo>
      <WorkspaceProvider demo>
        <Walkthrough />
      </WorkspaceProvider>
    </MemberStoreProvider>
  )
}
