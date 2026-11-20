/**
 * Busy-state arbitration, as a pure reducer (spec §13).
 *
 * Nothing in here touches React, the emulator or a timer. The pane dispatches
 * actions; the reducer returns the next state plus a small list of side effects
 * for the host to perform. That is what makes every transition in §13 testable
 * without a renderer, an emulator or a DOM.
 */

export const MODE_INTERRUPTED = 'interrupted'
export const MODE_ALWAYS = 'always'

export const STATUS = {
  IDLE: 'idle',
  PLAYING: 'playing',
  PAUSED_BY_USER: 'paused-by-user',
  INTERRUPTED: 'interrupted'
}

export function createState(overrides = {}) {
  const state = {
    mode: MODE_INTERRUPTED,
    turnBusy: false,
    approvalPending: false,
    userPaused: false,
    paneHidden: false,
    status: STATUS.IDLE,
    approval: null,
    ...overrides
  }
  // `status` is always derived, never supplied.
  state.status = derive(state)
  return state
}

/**
 * The rules, in one place:
 *   interrupted: turnBusy && !approvalPending && !userPaused && !paneHidden
 *   always:      !userPaused && !paneHidden  (approvals badge, never pause)
 */
function derive(state) {
  if (state.mode === MODE_INTERRUPTED && state.approvalPending) return STATUS.INTERRUPTED
  if (state.userPaused) return STATUS.PAUSED_BY_USER
  if (state.mode === MODE_INTERRUPTED && !state.turnBusy) return STATUS.IDLE
  return STATUS.PLAYING
}

/** Should the frame loop advance? Hidden panes never burn CPU (spec §10). */
export function isRunning(state) {
  return state.status === STATUS.PLAYING && !state.paneHidden
}

/** Does the agent want attention right now? */
export function needsAttention(state) {
  return state.approvalPending
}

/** The word the pane, the chip and the palette all use for a status. */
export function statusLabel(state) {
  if (state.status === STATUS.PLAYING) return 'playing'
  if (state.status === STATUS.INTERRUPTED) return 'paused · approval'
  if (state.status === STATUS.PAUSED_BY_USER) return 'paused'
  return 'standby'
}

/**
 * @returns {{ state: object, effects: Array<{type: string, [k: string]: any}> }}
 */
export function reduce(prev, action) {
  const next = { ...prev }

  switch (action.type) {
    case 'turn-busy':
      next.turnBusy = Boolean(action.value)
      break

    case 'approval':
      next.approvalPending = Boolean(action.value)
      next.approval = action.value ? action.approval ?? null : null
      break

    case 'approval-cleared': {
      // A settle event belongs to one prompt. If a different prompt is on
      // screen (two approvals in flight), this one says nothing about it.
      const onScreen = prev.approval?.prompt_id ?? null
      if (action.promptId && onScreen && action.promptId !== onScreen) {
        return { state: prev, effects: [] }
      }
      next.approvalPending = false
      next.approval = null
      break
    }

    case 'user-toggle-play':
      next.userPaused = !prev.userPaused
      break

    case 'user-pause':
      next.userPaused = true
      break

    case 'mode-toggle':
      next.mode = prev.mode === MODE_INTERRUPTED ? MODE_ALWAYS : MODE_INTERRUPTED
      break

    case 'set-mode':
      next.mode = action.value === MODE_ALWAYS ? MODE_ALWAYS : MODE_INTERRUPTED
      break

    case 'pane-hidden':
      next.paneHidden = Boolean(action.value)
      break

    default:
      return { state: prev, effects: [] }
  }

  next.status = derive(next)

  const effects = []
  if (prev.status !== STATUS.INTERRUPTED && next.status === STATUS.INTERRUPTED) {
    // Entering an interrupt: freeze the frame in the automatic slot so a
    // restart lands on exactly this scanline.
    effects.push({ type: 'auto-save' })
  }
  if (prev.status === STATUS.INTERRUPTED && next.status === STATUS.PLAYING) {
    // Approval answered: restore, then carry on from the same frame.
    effects.push({ type: 'auto-restore' })
  }

  return { state: next, effects }
}
