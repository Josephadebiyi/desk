import { Environment, Float, Lightformer, PerspectiveCamera, RoundedBox, View } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'

/* Palette (logo purple + a softened lime) */
export const C = {
  purple: '#6c34ff',
  purpleSoft: '#9b7bff',
  lavender: '#d9ceff',
  lime: '#c4ec62',
  white: '#f6f3ff',
  ink: '#2a1d55',
}

/* ───────────────────────── Materials ───────────────────────── */

export function Gloss({ color }: { color: string }) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={0.26}
      metalness={0.05}
      clearcoat={1}
      clearcoatRoughness={0.1}
      envMapIntensity={1.15}
    />
  )
}

/** Frosted, iridescent "glass" that reads well on both light and dark pages. */
export function Glass({ color = C.lavender }: { color?: string }) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={0.06}
      metalness={0}
      clearcoat={1}
      clearcoatRoughness={0.04}
      transparent
      opacity={0.78}
      iridescence={0.55}
      iridescenceIOR={1.3}
      envMapIntensity={1.6}
    />
  )
}

/* ───────────────────────── Helpers ───────────────────────── */

function useExtrude(points: [number, number][], depth: number, bevel = 0.03) {
  return useMemo(() => {
    const s = new THREE.Shape()
    points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
    })
    g.center()
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

function useHeart() {
  return useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0.5, 0.5)
    s.bezierCurveTo(0.5, 0.5, 0.4, 0, 0, 0)
    s.bezierCurveTo(-0.6, 0, -0.6, 0.7, -0.6, 0.7)
    s.bezierCurveTo(-0.6, 1.1, -0.3, 1.54, 0.5, 1.9)
    s.bezierCurveTo(1.2, 1.54, 1.6, 1.1, 1.6, 0.7)
    s.bezierCurveTo(1.6, 0.7, 1.6, 0, 1.0, 0)
    s.bezierCurveTo(0.7, 0, 0.5, 0.5, 0.5, 0.5)
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.4,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.12,
      bevelSegments: 8,
      curveSegments: 32,
    })
    g.center()
    g.rotateZ(Math.PI)
    return g
  }, [])
}

function Coin({ position, rotation, color = C.lime, r = 0.5 }: {
  position: [number, number, number]
  rotation?: [number, number, number]
  color?: string
  r?: number
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <cylinderGeometry args={[r, r, 0.14, 48]} />
        <Gloss color={color} />
      </mesh>
      <mesh position={[0, 0.075, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r * 0.72, 0.03, 12, 48]} />
        <Gloss color={C.white} />
      </mesh>
    </group>
  )
}

/* ───────────────────────── Models ───────────────────────── */

export function ChurchModel() {
  const roof = useExtrude([[-0.78, 0], [0.78, 0], [0, 0.55]], 0.9)
  return (
    <group position={[0, -0.15, 0]}>
      <RoundedBox args={[1.4, 0.85, 0.9]} radius={0.06} position={[0, -0.4, 0]}>
        <Gloss color={C.purple} />
      </RoundedBox>
      <mesh geometry={roof} position={[0, 0.27, 0]}>
        <Glass color={C.purpleSoft} />
      </mesh>
      <RoundedBox args={[0.46, 1.55, 0.46]} radius={0.05} position={[0, 0.05, 0.3]}>
        <Glass color={C.white} />
      </RoundedBox>
      <mesh position={[0, 1.08, 0.3]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.36, 0.5, 4]} />
        <Gloss color={C.purple} />
      </mesh>
      <group position={[0, 1.55, 0.3]}>
        <RoundedBox args={[0.09, 0.42, 0.09]} radius={0.02}>
          <Gloss color={C.lime} />
        </RoundedBox>
        <RoundedBox args={[0.28, 0.09, 0.09]} radius={0.02} position={[0, 0.07, 0]}>
          <Gloss color={C.lime} />
        </RoundedBox>
      </group>
      <mesh position={[0, 0.35, 0.54]}>
        <torusGeometry args={[0.11, 0.035, 12, 32]} />
        <Gloss color={C.lime} />
      </mesh>
      <RoundedBox args={[0.3, 0.42, 0.06]} radius={0.03} position={[0, -0.62, 0.54]}>
        <Gloss color={C.lime} />
      </RoundedBox>
    </group>
  )
}

export function FinanceModel() {
  return (
    <group position={[0, -0.1, 0]}>
      {[0.55, 0.9, 1.25].map((h, i) => (
        <RoundedBox
          key={i}
          args={[0.32, h, 0.32]}
          radius={0.05}
          position={[-0.75 + i * 0.42, -0.65 + h / 2, -0.45]}
        >
          <Glass color={i === 2 ? C.purpleSoft : C.lavender} />
        </RoundedBox>
      ))}
      <Coin position={[0.15, -0.6, 0.3]} />
      <Coin position={[0.1, -0.44, 0.3]} />
      <Coin position={[0.17, -0.28, 0.3]} />
      <Coin position={[0.65, 0.2, 0.35]} rotation={[Math.PI / 2, 0.3, 0]} color={C.purple} r={0.42} />
    </group>
  )
}

export function MessagingModel() {
  const tail = useExtrude([[0, 0], [0.42, 0], [0.05, -0.38]], 0.3)
  return (
    <group>
      <RoundedBox args={[1.0, 0.65, 0.3]} radius={0.15} position={[0.55, 0.62, -0.4]}>
        <Gloss color={C.lime} />
      </RoundedBox>
      <RoundedBox args={[1.65, 1.05, 0.42]} radius={0.22} position={[-0.1, -0.05, 0]}>
        <Glass color={C.purpleSoft} />
      </RoundedBox>
      <mesh geometry={tail} position={[-0.6, -0.65, 0]}>
        <Glass color={C.purpleSoft} />
      </mesh>
      {[-0.5, -0.1, 0.3].map((x) => (
        <mesh key={x} position={[x, -0.05, 0.24]}>
          <sphereGeometry args={[0.11, 24, 24]} />
          <Gloss color={C.white} />
        </mesh>
      ))}
    </group>
  )
}

export function EmailModel() {
  const flap = useExtrude([[-0.84, 0], [0.84, 0], [0, -0.62]], 0.05, 0.02)
  return (
    <group>
      <RoundedBox args={[1.75, 1.15, 0.2]} radius={0.07}>
        <Glass color={C.white} />
      </RoundedBox>
      <mesh geometry={flap} position={[0, 0.27, 0.13]}>
        <Gloss color={C.purple} />
      </mesh>
      <mesh position={[0, -0.03, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.07, 32]} />
        <Gloss color={C.lime} />
      </mesh>
      <mesh position={[0.95, 0.62, 0.1]}>
        <sphereGeometry args={[0.2, 32, 32]} />
        <Gloss color={C.lime} />
      </mesh>
    </group>
  )
}

function Person({ x, z, s, head, body }: { x: number; z: number; s: number; head: string; body: string }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.45, 0]}>
        <sphereGeometry args={[0.28, 40, 40]} />
        <Gloss color={head} />
      </mesh>
      <mesh position={[0, -0.32, 0]} scale={[1, 0.85, 0.8]}>
        <sphereGeometry args={[0.52, 40, 40, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Glass color={body} />
      </mesh>
      <mesh position={[0, -0.32, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.8, 1]}>
        <circleGeometry args={[0.52, 40]} />
        <Glass color={body} />
      </mesh>
    </group>
  )
}

export function CommunityModel() {
  return (
    <group position={[0, -0.05, 0]}>
      <Person x={-0.68} z={-0.3} s={0.8} head={C.lime} body={C.lavender} />
      <Person x={0.68} z={-0.3} s={0.8} head={C.lime} body={C.lavender} />
      <Person x={0} z={0.15} s={1} head={C.purpleSoft} body={C.purple} />
    </group>
  )
}

export function EventsModel() {
  return (
    <group>
      <RoundedBox args={[1.55, 1.45, 0.24]} radius={0.1}>
        <Glass color={C.white} />
      </RoundedBox>
      <RoundedBox args={[1.55, 0.42, 0.28]} radius={0.1} position={[0, 0.52, 0.01]}>
        <Gloss color={C.purple} />
      </RoundedBox>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, 0.78, 0.02]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.1, 0.035, 12, 32]} />
          <Gloss color={C.lime} />
        </mesh>
      ))}
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <RoundedBox
            key={`${r}${c}`}
            args={[0.3, 0.2, 0.06]}
            radius={0.03}
            position={[-0.4 + c * 0.4, 0.05 - r * 0.3, 0.14]}
          >
            <Gloss color={r === 1 && c === 2 ? C.lime : C.lavender} />
          </RoundedBox>
        )),
      )}
    </group>
  )
}

export function DesignModel() {
  return (
    <group>
      <RoundedBox args={[1.05, 1.45, 0.06]} radius={0.05} position={[0.3, 0.08, -0.25]} rotation={[0, 0, 0.16]}>
        <Glass color={C.purpleSoft} />
      </RoundedBox>
      <group position={[-0.18, -0.04, 0.1]} rotation={[0, 0, -0.1]}>
        <RoundedBox args={[1.05, 1.45, 0.08]} radius={0.05}>
          <Gloss color={C.white} />
        </RoundedBox>
        <RoundedBox args={[0.85, 0.62, 0.03]} radius={0.04} position={[0, 0.3, 0.05]}>
          <Gloss color={C.purple} />
        </RoundedBox>
        <mesh position={[0.18, 0.4, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.03, 32]} />
          <Gloss color={C.lime} />
        </mesh>
        {[0.62, 0.45, 0.32].map((w, i) => (
          <RoundedBox key={i} args={[w, 0.07, 0.03]} radius={0.02} position={[-0.42 + w / 2, -0.18 - i * 0.15, 0.05]}>
            <Gloss color={i === 0 ? C.ink : C.lavender} />
          </RoundedBox>
        ))}
      </group>
      <group position={[0.62, -0.42, 0.42]} rotation={[0, 0, -0.75]}>
        <mesh>
          <cylinderGeometry args={[0.07, 0.07, 0.95, 24]} />
          <Gloss color={C.lime} />
        </mesh>
        <mesh position={[0, -0.55, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.07, 0.16, 24]} />
          <Gloss color={C.ink} />
        </mesh>
      </group>
    </group>
  )
}

export function GivingModel() {
  const heart = useHeart()
  return (
    <group>
      <mesh geometry={heart} scale={0.62} position={[0, -0.12, 0]}>
        <Glass color={C.purpleSoft} />
      </mesh>
      <Coin position={[0.05, 0.92, 0.1]} rotation={[Math.PI / 2, 0, 0]} r={0.32} />
    </group>
  )
}

/** Fixed pseudo-random module pattern so the QR icon looks real but stays stable. */
const QR_BITS = '101101001110010110100111001011010011100101101'
export function QrModel() {
  const modules = useMemo(() => {
    const out: [number, number][] = []
    const n = 9
    let k = 0
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const inFinder = (r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3)
        if (inFinder) continue
        if (QR_BITS[k++ % QR_BITS.length] === '1') out.push([r, c])
      }
    return out
  }, [])
  const cell = 0.15
  const origin = -0.6
  const finder = (r: number, c: number) => {
    const x = origin + (c + 1) * cell
    const y = -(origin + (r + 1) * cell)
    return (
      <group key={`${r}${c}`} position={[x, y, 0.1]}>
        <RoundedBox args={[0.42, 0.42, 0.06]} radius={0.06}>
          <Gloss color={C.purple} />
        </RoundedBox>
        <RoundedBox args={[0.28, 0.28, 0.07]} radius={0.04} position={[0, 0, 0.01]}>
          <Gloss color={C.white} />
        </RoundedBox>
        <RoundedBox args={[0.16, 0.16, 0.08]} radius={0.03} position={[0, 0, 0.02]}>
          <Gloss color={C.purple} />
        </RoundedBox>
      </group>
    )
  }
  return (
    <group>
      <RoundedBox args={[1.65, 1.65, 0.12]} radius={0.14}>
        <Glass color={C.white} />
      </RoundedBox>
      {finder(0, 0)}
      {finder(0, 6)}
      {finder(6, 0)}
      {modules.map(([r, c]) => (
        <RoundedBox
          key={`${r}-${c}`}
          args={[0.12, 0.12, 0.08]}
          radius={0.025}
          position={[origin + c * cell, -(origin + r * cell), 0.09]}
        >
          <Gloss color={(r + c) % 5 === 0 ? C.lime : C.purple} />
        </RoundedBox>
      ))}
      <RoundedBox args={[1.9, 0.05, 0.05]} radius={0.02} position={[0, 0, 0.2]}>
        <meshBasicMaterial color={C.lime} toneMapped={false} />
      </RoundedBox>
    </group>
  )
}

export function CrossModel() {
  return (
    <group>
      <RoundedBox args={[0.32, 1.6, 0.32]} radius={0.08}>
        <Glass color={C.lavender} />
      </RoundedBox>
      <RoundedBox args={[1.05, 0.32, 0.32]} radius={0.08} position={[0, 0.3, 0]}>
        <Glass color={C.lavender} />
      </RoundedBox>
    </group>
  )
}

export const MODELS = {
  church: ChurchModel,
  finance: FinanceModel,
  messaging: MessagingModel,
  email: EmailModel,
  community: CommunityModel,
  events: EventsModel,
  design: DesignModel,
  giving: GivingModel,
  qr: QrModel,
  cross: CrossModel,
}
export type IconName = keyof typeof MODELS

/* ───────────────────────── Stage ───────────────────────── */

function Sway({ children, offset = 0 }: { children: ReactNode; offset?: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((s) => {
    if (!ref.current) return
    const t = s.clock.elapsedTime + offset
    ref.current.rotation.y = -0.45 + Math.sin(t * 0.6) * 0.35
    ref.current.rotation.x = 0.18 + Math.sin(t * 0.4) * 0.06
  })
  return <group ref={ref}>{children}</group>
}

export function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 5]} intensity={1.8} />
      <directionalLight position={[-4, -1, 2]} intensity={0.9} color={C.purpleSoft} />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 2, 5]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={2} color={C.purpleSoft} position={[-5, 0, 2]} scale={[2, 6, 1]} />
        <Lightformer form="rect" intensity={1.6} color={C.lime} position={[5, -1, 2]} scale={[2, 5, 1]} />
        <Lightformer form="circle" intensity={2} position={[0, 5, -4]} scale={3} />
      </Environment>
    </>
  )
}

/** A DOM slot that renders a floating 3D church icon through the shared canvas. */
export function Icon3D({ name, className = '' }: { name: IconName; className?: string }) {
  const Model = MODELS[name]
  const offset = useMemo(() => Math.random() * 10, [])
  return (
    <View className={`icon3d ${className}`}>
      <PerspectiveCamera makeDefault position={[0, 0, 5.2]} fov={32} />
      <StudioLights />
      <Float speed={2} rotationIntensity={0.25} floatIntensity={0.5}>
        <Sway offset={offset}>
          <Model />
        </Sway>
      </Float>
    </View>
  )
}

/** One WebGL canvas, fixed behind the page, that paints every <Icon3D /> slot. */
export function IconCanvas() {
  return (
    <Canvas
      className="icon-canvas"
      eventSource={document.getElementById('root')!}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 5 }}
    >
      <View.Port />
    </Canvas>
  )
}
