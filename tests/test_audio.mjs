// Audio is the path that was silently dead for a whole release: the pane calls
// createCore() with no options, so gating capture on `options.audio` meant no
// sample was ever produced. These tests fail if the default ever goes quiet
// again, and cover the mute switch the settings page drives.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createCore } from '../build/core.node.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const romPath = resolve(here, '..', 'roms', 'selftest.gb')

async function bootedCore() {
  const core = createCore()
  await core.loadRom(new Uint8Array(readFileSync(romPath)))
  for (let frame = 0; frame < 30; frame++) core.runFrame()
  return core
}

test('the core captures mixer output without being asked to', async () => {
  const core = await bootedCore()
  const samples = core.audioSamples()
  assert.ok(samples, 'audioSamples() returned null — capture is switched off')
  assert.ok(samples.length > 0, 'no samples after 30 frames')
  assert.ok(samples instanceof Int16Array, 'samples are interleaved int16 PCM')
})

test('captured samples are real audio, not a buffer of zeros', async () => {
  const core = await bootedCore()
  const samples = core.audioSamples()
  let loudest = 0
  for (let i = 0; i < samples.length; i++) {
    const amplitude = Math.abs(samples[i])
    if (amplitude > loudest) loudest = amplitude
  }
  assert.ok(loudest > 0, 'the whole capture is silence')
  assert.ok(loudest <= 32768, 'sample out of int16 range')
})

test('muting stops capture and drops what was queued', async () => {
  const core = await bootedCore()
  core.setAudioEnabled(false)
  assert.equal(core.audioSamples(), null, 'muting clears the queue instead of replaying it')

  for (let frame = 0; frame < 10; frame++) core.runFrame()
  assert.equal(core.audioSamples(), null, 'a muted core must not buffer samples')

  core.setAudioEnabled(true)
  for (let frame = 0; frame < 10; frame++) core.runFrame()
  assert.ok(core.audioSamples(), 'unmuting resumes capture')
})

test('the reported rate is the mixer rate, not a hard-coded 44100', async () => {
  const core = await bootedCore()
  const rate = core.audioSampleRate()
  assert.ok(rate > 40000 && rate < 50000, `unexpected mixer rate ${rate}`)
})
