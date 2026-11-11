/**
 * Frame pacing (spec §2.6, §10).
 *
 * requestAnimationFrame + an accumulator at the handheld's real 59.7275 Hz.
 * Catch-up is capped at four frames; past that we drop time rather than spiral
 * into a render storm. One `onFrame()` call is one emulated frame, and we only
 * redraw when a frame actually completed.
 */
export const FRAME_HZ = 59.7275
export const FRAME_MS = 1000 / FRAME_HZ
const MAX_CATCH_UP = 4
const MAX_DELTA_MS = 250

export function createPacer({ onFrame, shouldRun, frameMs = FRAME_MS }) {
  let handle = 0
  let last = 0
  let accumulator = 0
  let running = false

  const step = now => {
    handle = requestAnimationFrame(step)
    if (!last) {
      last = now
      return
    }
    const delta = Math.min(now - last, MAX_DELTA_MS)
    last = now

    if (!shouldRun()) {
      accumulator = 0
      return
    }

    accumulator += delta
    let frames = 0
    while (accumulator >= frameMs && frames < MAX_CATCH_UP) {
      onFrame()
      accumulator -= frameMs
      frames++
    }
    if (accumulator >= frameMs) accumulator = 0
  }

  return {
    start() {
      if (running) return
      running = true
      last = 0
      accumulator = 0
      handle = requestAnimationFrame(step)
    },
    stop() {
      running = false
      if (handle) cancelAnimationFrame(handle)
      handle = 0
    },
    get isRunning() {
      return running
    }
  }
}
