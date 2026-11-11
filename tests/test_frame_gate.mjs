// Regression guard for the frame gate.
//
// The core exposes a host-pacing gate (`stopEmulator` bit 0) that must be armed
// when a frame is requested. A snapshot restore or a cartridge swap can leave it
// clear, and then either `run()` logs "Iterator restarted a faulted core" on
// every call, or it returns without advancing — both look exactly like a frozen
// game while the pane still reports "playing". runFrame() re-arms the gate; this
// test fails if that recovery is ever removed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createCore } from '../build/core.node.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const romPath = resolve(here, '..', 'roms', 'selftest.gb')

const RIGHT = 1 << 3

function fnv1a(bytes) {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

async function bootedCore() {
  const core = createCore()
  await core.loadRom(new Uint8Array(readFileSync(romPath)))
  for (let frame = 0; frame < 40; frame++) {
    core.setInput(RIGHT)
    core.runFrame()
  }
  return core
}

function runFrames(core, count, input = RIGHT) {
  for (let frame = 0; frame < count; frame++) {
    core.setInput(input)
    core.runFrame()
  }
}

test('a cleared frame gate is re-armed instead of wedging the core', async () => {
  const core = await bootedCore()

  // Both shapes seen in the wild: 0 logs "faulted core" forever, 3 returns
  // silently. Neither must survive one call to runFrame.
  for (const shape of [0, 3]) {
    core.core.stopEmulator = shape
    const before = core.rearmedFrames
    core.runFrame()
    assert.equal(core.core.stopEmulator, 1, `gate was not re-armed from ${shape}`)
    assert.equal(core.rearmedFrames, before + 1, `re-arm not counted for ${shape}`)
  }

  // And the core must actually keep completing frames afterwards.
  core.core.stopEmulator = 0
  core.runFrame()
  runFrames(core, 30)
  assert.equal(core.core.stopEmulator, 1, 'the core did not settle back into a frame boundary')
})

test('re-arming never fires during a healthy run', async () => {
  const core = await bootedCore()
  runFrames(core, 120)
  assert.equal(core.rearmedFrames, 0, 're-arming must stay a recovery path, not normal pacing')
})

test('the core does not report a faulted iterator while frames are requested', async () => {
  const core = await bootedCore()
  const seen = []
  const realError = console.error
  console.error = (...args) => { seen.push(String(args[0])) }
  try {
    core.core.stopEmulator = 0
    runFrames(core, 20)
  } finally {
    console.error = realError
  }
  assert.equal(seen.filter(line => line.includes('faulted')).length, 0,
    'runFrame let the core reach its faulted-iterator branch')
})
