/**
 * Stub of `@hermes/plugin-sdk` for render tests.
 *
 * This is not a mock of behaviour — it is a stand-in for the *shape* of the
 * SDK, enough for real React to mount a contribution in node. Its job is to
 * catch the class of bug that a bundle cannot catch on its own: a free
 * identifier, a hooks-order violation, a component that throws on first paint.
 * The app is still the only place that can prove the pane looks right.
 */
import { useSyncExternalStore } from 'react'

export const atom = value => {
  const listeners = new Set()
  let current = value
  return {
    get: () => current,
    set: next => {
      current = next
      for (const listener of listeners) listener(current)
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export const computed = fn => ({ get: fn })
export const useValue = store => useSyncExternalStore(store.subscribe, store.get, store.get)
export const cn = (...args) => args.filter(Boolean).join(' ')
export const haptic = () => {}
export const icons = {}
export const coarseElapsed = ms => String(ms)
export const queryClient = { invalidateQueries: () => {} }

export const host = {
  state: {
    busy: atom(false),
    busyBySession: atom({}),
    activeSessionId: atom(null),
    focusedSessionId: atom(null),
    gateway: atom('open'),
    viewport: atom({ width: 1200, height: 800, narrow: false })
  },
  notify: () => {},
  notifyError: () => {},
  request: async () => ({}),
  paneVisibility: () => atom(true),
  navigate: () => {},
  openSession: () => {},
  newChat: () => {}
}

export const PANES_AREA = 'panes'
export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' }
export const PALETTE_AREA = 'palette'
export const KEYBINDS_AREA = 'keybinds'

const Null = () => null
export const ToggleRow = Null
export const ListRow = Null
export const SegmentedControl = Null
export const Button = Null
export const Badge = Null
export const Tip = Null
export const Codicon = Null
export const Switch = Null
