/**
 * Undo / redo for the editor. A drag or a slider produces many changes; with a `coalesce` key they collapse into
 * one undo step (same key within 700 ms). History is kept in memory (structural sharing keeps it small).
 */
import { useCallback, useReducer } from 'react'
import type { DesignSpec } from '../design/spec'

interface H {
  spec: DesignSpec
  past: DesignSpec[]
  future: DesignSpec[]
  key: string | null
  at: number
}
type A = { t: 'set'; spec: DesignSpec; coalesce?: string } | { t: 'undo' } | { t: 'redo' } | { t: 'reset'; spec: DesignSpec }
const LIMIT = 150

function reduce(h: H, a: A): H {
  if (a.t === 'reset') return { spec: a.spec, past: [], future: [], key: null, at: 0 }
  if (a.t === 'undo') return h.past.length ? { spec: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.spec, ...h.future], key: null, at: 0 } : h
  if (a.t === 'redo') return h.future.length ? { spec: h.future[0], past: [...h.past, h.spec], future: h.future.slice(1), key: null, at: 0 } : h
  if (a.spec === h.spec) return h
  const now = Date.now()
  const merge = a.coalesce && a.coalesce === h.key && now - h.at < 700
  return { spec: a.spec, past: merge ? h.past : [...h.past, h.spec].slice(-LIMIT), future: [], key: a.coalesce ?? null, at: now }
}

export function useHistory(initial: DesignSpec) {
  const [h, dispatch] = useReducer(reduce, { spec: initial, past: [], future: [], key: null, at: 0 })
  return {
    spec: h.spec,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    set: useCallback((spec: DesignSpec, coalesce?: string) => dispatch({ t: 'set', spec, coalesce }), []),
    undo: useCallback(() => dispatch({ t: 'undo' }), []),
    redo: useCallback(() => dispatch({ t: 'redo' }), []),
    reset: useCallback((spec: DesignSpec) => dispatch({ t: 'reset', spec }), []),
  }
}
