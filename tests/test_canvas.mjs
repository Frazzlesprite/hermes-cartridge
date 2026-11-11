// The bug the app found: the pane painted a zeroed ImageData, because drawTo()
// blitted the buffer without ever converting the core's RGB framebuffer into it.
// The earlier version of this test passed anyway: it asserted that the drawn
// image and framebufferRGBA() were the *same buffer*, which is true whether or
// not either of them holds a picture. These assertions are about pixels.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const romPath = resolve(here, '..', 'roms', 'selftest.gb')

// Stand in for the platform's ImageData before the adapter is asked for one.
class FakeImageData {
  constructor(width, height) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
  }
}
globalThis.ImageData ??= FakeImageData

const { createCore } = await import('../build/core.node.mjs')

function coloursIn(image) {
  const seen = new Set()
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
  }
  return seen
}

test('drawTo blits a real ImageData of the right size', async () => {
  const core = createCore()
  await core.loadRom(new Uint8Array(readFileSync(romPath)))
  for (let frame = 0; frame < 12; frame++) core.runFrame()

  const received = []
  const target = {
    putImageData(image, x, y) {
      received.push({ image, x, y })
    }
  }

  assert.equal(core.drawTo(target), true, 'drawTo should report that it drew')
  assert.equal(received.length, 1, 'exactly one blit per completed frame')
  assert.equal(received[0].x, 0)
  assert.equal(received[0].y, 0)

  const image = received[0].image
  assert.ok(image instanceof FakeImageData, 'a real ImageData, not a plain object')
  assert.equal(image.width, 160)
  assert.equal(image.height, 144)
  assert.equal(image.data.length, 160 * 144 * 4)
  assert.ok(image.data instanceof Uint8ClampedArray)
  assert.equal(image.data[3], 255, 'alpha is opaque')
})

test('drawTo alone produces a picture, without framebufferRGBA() first', async () => {
  const core = createCore()
  await core.loadRom(new Uint8Array(readFileSync(romPath)))
  for (let frame = 0; frame < 12; frame++) core.runFrame()

  let drawn = null
  core.drawTo({ putImageData: image => { drawn = image } })

  // This is the assertion that would have caught the shipped bug: read the
  // drawn image directly, never touching framebufferRGBA().
  const colours = coloursIn(drawn)
  assert.equal(colours.size, 4, `expected the DMG palette, saw ${colours.size} colours`)

  const opaque = new Set()
  for (let i = 3; i < drawn.data.length; i += 4) opaque.add(drawn.data[i])
  assert.deepEqual([...opaque], [255], 'every pixel is opaque')
})

test('the drawn frame is the framebuffer the adapter reports', async () => {
  const core = createCore()
  await core.loadRom(new Uint8Array(readFileSync(romPath)))
  for (let frame = 0; frame < 20; frame++) core.runFrame()

  let drawn = null
  core.drawTo({ putImageData: image => { drawn = image } })
  const reported = core.framebufferRGBA()

  assert.equal(drawn.data, reported, 'one buffer: no per-frame copy')
  for (let i = 0; i < 40; i++) {
    assert.equal(drawn.data[i], reported[i], `pixel byte ${i} disagrees`)
  }
})

const RIGHT = 1 << 3

function hashOf(image) {
  let h = 0x811c9dc5
  const data = image.data
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h >>> 0).toString(16)
}

test('a state restored from a snapshot snapshots back identically', async () => {
  // The strong invariant: save -> load -> save must be a fixed point. It catches
  // any field whose restore is lossy, which a frame replay can paper over
  // because the next frames rebuild derived state.
  const core = createCore()
  await core.loadRom(new Uint8Array(readFileSync(romPath)))
  for (let frame = 0; frame < 20; frame++) {
    core.setInput(RIGHT)
    core.runFrame()
  }

  const first = new TextDecoder().decode(core.saveState())
  core.loadState(new TextEncoder().encode(first))
  const second = new TextDecoder().decode(core.saveState())

  assert.equal(second, first, 'the restored state did not survive a second snapshot')
})

test('loadState + redraw reproduces the held frame exactly', async () => {
  const core = createCore()
  await core.loadRom(new Uint8Array(readFileSync(romPath)))

  // Scroll, so that "did the picture move?" is a question with an answer.
  for (let frame = 0; frame < 20; frame++) {
    core.setInput(RIGHT)
    core.runFrame()
  }

  const snapshot = core.saveState()
  let atSave = null
  core.drawTo({ putImageData: image => { atSave = image } })
  const hashAtSave = hashOf(atSave)

  // Keep playing: the screen should now be somewhere else.
  for (let frame = 0; frame < 15; frame++) {
    core.setInput(RIGHT)
    core.runFrame()
  }
  let later = null
  core.drawTo({ putImageData: image => { later = image } })
  assert.notEqual(hashOf(later), hashAtSave, 'holding right should have scrolled it further')

  // Restore and redraw: back to the held frame, without running a frame.
  core.loadState(snapshot)
  core.redraw()
  let restored = null
  core.drawTo({ putImageData: image => { restored = image } })
  assert.equal(hashOf(restored), hashAtSave, 'the restored frame must be the one that was saved')
})


test('drawTo without a target is a no-op, not a throw', async () => {
  const core = createCore()
  assert.equal(core.drawTo(null), false)
  assert.equal(core.drawTo(undefined), false)
})
