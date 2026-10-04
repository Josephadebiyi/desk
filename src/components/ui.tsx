import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type HTMLMotionProps,
} from 'framer-motion'
import type { ReactNode, PointerEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../theme'

/** Full ZionDesk wordmark: lime on dark, lime + purple on light. */
export function Logo({ height = 36 }: { height?: number }) {
  const { pathname } = useLocation()
  const { theme } = useTheme()
  return (
    <Link
      to="/"
      className="logo"
      aria-label="ZionDesk home"
      onClick={() => pathname === '/' && window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <img
        src={theme === 'dark' ? '/brand/logo-lime.webp' : '/brand/logo-color.webp'}
        alt="ZionDesk"
        style={{ height, width: 'auto' }}
      />
    </Link>
  )
}

/** Rounded purple app icon. */
export function AppIcon({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/app-icon.png"
      alt="ZionDesk"
      className={`app-icon ${className}`}
      width={size}
      height={size}
    />
  )
}

/** Fades + lifts children into view once. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  ...rest
}: { children: ReactNode; delay?: number; y?: number } & HTMLMotionProps<'div'>) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** Glass card that tilts in 3D toward the pointer and tracks a spotlight. */
export function TiltCard({
  children,
  className = '',
  max = 10,
}: {
  children: ReactNode
  className?: string
  max?: number
}) {
  const reduce = useReducedMotion()
  const rx = useSpring(0, { stiffness: 180, damping: 18 })
  const ry = useSpring(0, { stiffness: 180, damping: 18 })
  const mx = useMotionValue(50)
  const my = useMotionValue(50)
  const spotlight = useMotionTemplate`radial-gradient(420px circle at ${mx}% ${my}%, rgba(196,236,98,.13), rgba(132,87,255,.12) 40%, transparent 70%)`

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    mx.set(px * 100)
    my.set(py * 100)
    if (reduce) return
    ry.set((px - 0.5) * max * 2)
    rx.set(-(py - 0.5) * max * 2)
  }
  const onLeave = () => {
    rx.set(0)
    ry.set(0)
  }

  return (
    <motion.div
      className={`glass tilt ${className}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
    >
      <motion.div className="spotlight" style={{ background: spotlight }} />
      <div className="tilt-inner">{children}</div>
    </motion.div>
  )
}

export function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string
  title: ReactNode
  sub?: string
}) {
  return (
    <Reveal className="section-head">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </Reveal>
  )
}
