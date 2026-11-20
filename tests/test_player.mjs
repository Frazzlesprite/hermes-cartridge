// The audio player, against a fake AudioContext.
//
// Two things matter here: a silent pane must stay silent (mute), and the player
// must not build one Web Audio node per 60 Hz frame. The batching is the reason
// this file exists — it is easy to get the counters wrong and only notice by
// ear.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAudioPlayer } from '../src/audio/player.js'

class FakeBuffer {
  constructor(channels, length, rate) {
    this.length = length
    this.sampleRate = rate
    this.duration = length / rate
    this.channels = Array.from({ length: channels }, () => new Float32Array(length))
  }
  copyToChannel(source, channel) {
    assert.equal(source.length, this.length, 'a channel copy must fill the buffer')
    this.channels[channel].set(source)
  }
  getChannelData(channel) {
    return this.channels[channel]
  }
}

class FakeSource {
  constructor(log) {
    this.log = log
    this.buffer = null
  }
  connect() {}
  start(when) {
    this.log.startTimes.push(when)
  }
}

function fakeAudio() {
  const log = { buffers: [], startTimes: [], context: null }
  class FakeContext {
    constructor() {
      this.state = 'running'
      this.currentTime = 0
      this.destination = {}
      this.closed = false
      log.context = this
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} }
    }
    createBuffer(channels, length, rate) {
      const buffer = new FakeBuffer(channels, length, rate)
      log.buffers.push(buffer)
      return buffer
    }
    createBufferSource() {
      return new FakeSource(log)
    }
    resume() {
      this.state = 'running'
      return Promise.resolve()
    }
    close() {
      this.closed = true
      return Promise.resolve()
    }
  }
  return { Ctor: FakeContext, log }
}

function stereo(frames, left = 0.25, right = -0.25) {
  const samples = new Int16Array(frames * 2)
  for (let i = 0; i < frames; i++) {
    samples[i * 2] = Math.round(left * 32767)
    samples[i * 2 + 1] = Math.round(right * 32767)
  }
  return samples
}

async function readyPlayer() {
  const { Ctor, log } = fakeAudio()
  const previous = globalThis.AudioContext
  globalThis.AudioContext = Ctor
  const player = createAudioPlayer()
  player.setSampleRate(44100)
  await player.unlock()
  return { player, log, restore: () => (globalThis.AudioContext = previous) }
}

test('one frame of audio is batched, not scheduled immediately', async () => {
  const { player, log, restore } = await readyPlayer()
  try {
    // One 60 Hz frame at 44.1 kHz is 735 stereo frames; the batch is 50 ms
    // (2205 frames), so two pushes must produce no node at all.
    player.push(stereo(735))
    player.push(stereo(735))
    assert.equal(log.buffers.length, 0, 'a partial batch must not be scheduled')

    player.push(stereo(735))
    assert.equal(log.buffers.length, 1, 'the third push completes the batch')
    assert.equal(log.buffers[0].length, 2205)
    assert.equal(log.startTimes.length, 1)

    const left = log.buffers[0].getChannelData(0)
    const right = log.buffers[0].getChannelData(1)
    assert.ok(left[0] > 0.2 && left[0] < 0.3, 'left channel carries the mix')
    assert.ok(right[0] < -0.2 && right[0] > -0.3, 'right channel carries the mix')
  } finally {
    restore()
  }
})

test('a long push is split into full batches, with the remainder kept', async () => {
  const { player, log, restore } = await readyPlayer()
  try {
    player.push(stereo(2205 * 2 + 100))
    assert.equal(log.buffers.length, 2, 'two complete batches scheduled')
    assert.equal(log.buffers[0].length, 2205)
    assert.equal(log.buffers[1].length, 2205)
  } finally {
    restore()
  }
})

test('muting drops the batch and stops scheduling', async () => {
  const { player, log, restore } = await readyPlayer()
  try {
    player.setEnabled(false)
    player.push(stereo(5000))
    assert.equal(log.buffers.length, 0, 'a muted player must not build buffers')

    player.setEnabled(true)
    player.push(stereo(2205))
    assert.equal(log.buffers.length, 1, 'unmuting resumes scheduling')
  } finally {
    restore()
  }
})

test('the scheduler keeps latency inside the budget', async () => {
  const { player, log, restore } = await readyPlayer()
  try {
    // Two full batches, 50 ms apart, as the frame loop actually delivers them.
    player.push(stereo(2205))
    log.context.currentTime += 0.05
    player.push(stereo(2205))
    assert.ok(player.latencyMs <= 100, `latency ${player.latencyMs} ms exceeds the budget`)
    assert.ok(player.latencyMs > 0, 'the queue should have some depth')
    assert.equal(log.buffers.length, 2)
  } finally {
    restore()
  }
})

test('changing the mixer rate drops the old batch', async () => {
  const { player, log, restore } = await readyPlayer()
  try {
    player.push(stereo(735))
    player.setSampleRate(48000)
    player.push(stereo(1000))
    // 48000 * 0.05 = 2400 frames per batch; 1000 alone must not flush.
    assert.equal(log.buffers.length, 0)
    player.push(stereo(1400))
    assert.equal(log.buffers.length, 1)
    assert.equal(log.buffers[0].length, 2400)
  } finally {
    restore()
  }
})
