/**
 * Audio out.
 *
 * The core hands us interleaved float samples through `AudioDevice.writeAudio`,
 * which the adapter captures. Here they go into an AudioContext with a small
 * queue so latency stays under the spec's 100 ms budget.
 *
 * Samples are batched into ~50 ms buffers rather than one node per 60 Hz frame.
 * A buffer source per frame worked, but it allocated a buffer and copied the
 * mix 60 times a second; batching cuts that by three and stays well inside the
 * latency budget.
 *
 * Autoplay policy: an AudioContext starts suspended. Nothing here makes noise
 * until the user clicks the pane, which is exactly the gesture the platform
 * wants (spec §2.6).
 */
export function createAudioPlayer() {
  let context = null
  let gain = null
  let enabled = true
  let nextTime = 0
  let sampleRate = 44100

  // The batch being filled. Sized to 50 ms at the current rate; a full batch is
  // scheduled and the counters reset, so the partial batch at a pause is simply
  // never played (there is nothing to hear over a paused game).
  let flushFrames = 0
  let pendingLeft = null
  let pendingRight = null
  let pendingFrames = 0

  const ensure = () => {
    if (context) return context
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext
    if (!Ctor) return null
    context = new Ctor()
    gain = context.createGain()
    gain.gain.value = enabled ? 1 : 0
    gain.connect(context.destination)
    return context
  }

  const resetBatch = () => {
    pendingLeft = null
    pendingRight = null
    pendingFrames = 0
    flushFrames = 0
  }

  const ensureBatch = () => {
    if (pendingLeft) return
    flushFrames = Math.max(256, Math.round(sampleRate * 0.05))
    pendingLeft = new Float32Array(flushFrames)
    pendingRight = new Float32Array(flushFrames)
    pendingFrames = 0
  }

  const flush = () => {
    if (!context || pendingFrames === 0) return
    const frames = pendingFrames
    const buffer = context.createBuffer(2, frames, sampleRate)
    buffer.copyToChannel(pendingLeft.subarray(0, frames), 0)
    buffer.copyToChannel(pendingRight.subarray(0, frames), 1)

    const now = context.currentTime
    // Re-anchor after a stall, but keep at least one frame of headroom so a
    // late push does not click as much as a gap would.
    if (nextTime < now + 0.01) nextTime = now + 0.03
    // Drift guard: if the queue grows past the latency budget, drop the
    // backlog rather than drifting further behind the picture.
    if (nextTime - now > 0.1) nextTime = now + 0.03

    const node = context.createBufferSource()
    node.buffer = buffer
    node.connect(gain)
    node.start(nextTime)
    nextTime += buffer.duration
    pendingFrames = 0
  }

  return {
    get latencyMs() {
      if (!context) return 0
      return Math.max(0, Math.round((nextTime - context.currentTime) * 1000))
    },

    /** Call from a user gesture: the click on the pane. */
    async unlock() {
      const ctx = ensure()
      if (!ctx) return false
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume()
        } catch {
          return false
        }
      }
      return ctx.state === 'running'
    },

    setEnabled(on) {
      enabled = Boolean(on)
      if (gain) gain.gain.value = enabled ? 1 : 0
      if (!enabled) {
        nextTime = 0
        resetBatch()
      }
    },

    isEnabled() {
      return enabled
    },

    setSampleRate(rate) {
      if (Number.isFinite(rate) && rate > 8000 && rate < 192000) {
        const next = Math.round(rate)
        if (next !== sampleRate) resetBatch()
        sampleRate = next
      }
    },

    /** @param {Int16Array|null} samples interleaved stereo */
    push(samples) {
      if (!enabled || !samples || samples.length < 2) return
      const ctx = ensure()
      if (!ctx || ctx.state !== 'running') return

      ensureBatch()
      const inputFrames = Math.floor(samples.length / 2)
      let at = 0
      while (at < inputFrames) {
        const take = Math.min(inputFrames - at, flushFrames - pendingFrames)
        for (let i = 0; i < take; i++) {
          const s = (at + i) * 2
          pendingLeft[pendingFrames + i] = samples[s] / 32768
          pendingRight[pendingFrames + i] = samples[s + 1] / 32768
        }
        pendingFrames += take
        at += take
        if (pendingFrames === flushFrames) flush()
      }
    },

    dispose() {
      try {
        gain?.disconnect()
        context?.close()
      } catch {
        /* already gone */
      }
      context = null
      gain = null
      nextTime = 0
      resetBatch()
    }
  }
}
