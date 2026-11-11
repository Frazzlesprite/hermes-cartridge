/**
 * Audio out.
 *
 * The core hands us interleaved float samples through `AudioDevice.writeAudio`,
 * which the adapter captures. Here they go into an AudioContext with a small
 * queue so latency stays under the spec's 100 ms budget.
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
      if (!enabled) nextTime = 0
    },

    isEnabled() {
      return enabled
    },

    setSampleRate(rate) {
      if (Number.isFinite(rate) && rate > 8000 && rate < 192000) sampleRate = Math.round(rate)
    },

    /** @param {Int16Array|null} samples interleaved stereo */
    push(samples) {
      if (!enabled || !samples || samples.length < 2) return
      const ctx = ensure()
      if (!ctx || ctx.state !== 'running') return

      const frames = Math.floor(samples.length / 2)
      const buffer = ctx.createBuffer(2, frames, sampleRate)
      const left = buffer.getChannelData(0)
      const right = buffer.getChannelData(1)
      for (let i = 0, j = 0; i < frames; i++, j += 2) {
        left[i] = samples[j] / 32768
        right[i] = samples[j + 1] / 32768
      }

      const now = ctx.currentTime
      // Re-anchor after a stall, but keep at least one frame of headroom so a
      // late push does not click as much as a gap would.
      if (nextTime < now + 0.01) nextTime = now + 0.03
      // Drift guard: if the queue grows past the latency budget, drop the
      // backlog rather than drifting further behind the picture.
      if (nextTime - now > 0.1) nextTime = now + 0.03

      const node = ctx.createBufferSource()
      node.buffer = buffer
      node.connect(gain)
      node.start(nextTime)
      nextTime += buffer.duration
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
    }
  }
}
