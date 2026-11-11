/**
 * Shared state for the pane, the status chip and the settings page.
 *
 * Atoms are the SDK's own primitive, so every surface re-renders from the same
 * source. Handlers read `.get()` imperatively — a render closure would go stale
 * between frames (spec: SDK pitfalls).
 */
import { atom } from '@hermes/plugin-sdk'
import { createState, reduce, MODE_ALWAYS } from './reducer.js'
import { DEFAULT_BINDINGS } from '../input/keymap.js'
import { DEFAULT_PALETTE } from '../core/adapter.js'

export const busy = atom(createState())

/** null | { name, title, isGBC, sha256, size, mapper, hasBattery } */
export const rom = atom(null)

/** 'empty' | 'loading' | 'ready' | 'error' */
export const phase = atom('empty')
export const lastError = atom('')

export const prefs = atom({
  mode: 'interrupted',
  palette: DEFAULT_PALETTE,
  scale: 'auto',
  audio: true,
  bindings: { ...DEFAULT_BINDINGS },
  rememberRom: false
})

/** { day: 'YYYY-MM-DD', ms: number } — "time served today" (spec §14). */
export const served = atom({ day: todayKey(), ms: 0 })

/** Set by the host wiring; the pane installs the real implementation. */
export const effects = { onEffect: null }

export const worker = {
  ctx: null,
  saves: null,
  player: null,
  core: null,
  audioRate: 44100
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function dispatch(action) {
  const prev = busy.get()
  const { state, effects: requested } = reduce(prev, action)
  if (state !== prev) busy.set(state)
  for (const effect of requested) {
    try {
      effects.onEffect?.(effect)
    } catch (error) {
      console.warn('[cartridge] effect failed', effect.type, error)
    }
  }
  return state
}

export function setPrefs(patch) {
  const next = { ...prefs.get(), ...patch }
  prefs.set(next)
  try {
    worker.ctx?.storage.set('prefs', next)
  } catch {
    /* preferences are a nicety, never a crash */
  }
  if (patch.mode) dispatch({ type: 'set-mode', value: patch.mode })
  if (patch.palette) worker.core?.setPalette(patch.palette)
  if (typeof patch.audio === 'boolean') worker.player?.setEnabled(patch.audio)
  return next
}

export function addServed(ms) {
  if (!(ms > 0)) return
  const current = served.get()
  const day = todayKey()
  const base = current.day === day ? current.ms : 0
  served.set({ day, ms: base + ms })
}

export function flushServed() {
  const current = served.get()
  try {
    worker.ctx?.storage.set('served', { day: current.day, ms: current.ms })
  } catch {
    /* ignore */
  }
}

export function hydrate(ctx) {
  worker.ctx = ctx
  try {
    const stored = ctx.storage.get('prefs', null)
    if (stored && typeof stored === 'object') {
      prefs.set({
        ...prefs.get(),
        ...stored,
        bindings: { ...DEFAULT_BINDINGS, ...(stored.bindings ?? {}) }
      })
    }
  } catch {
    /* keep defaults */
  }
  try {
    const stored = ctx.storage.get('served', null)
    if (stored && stored.day === todayKey()) served.set(stored)
  } catch {
    /* keep zero */
  }
  dispatch({ type: 'set-mode', value: prefs.get().mode === MODE_ALWAYS ? MODE_ALWAYS : 'interrupted' })
}

export function formatServed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}
