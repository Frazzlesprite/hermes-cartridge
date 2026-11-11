// Headless proof that a save state is byte-exact: run, snapshot, run, restore,
// replay the same frames, compare framebuffer hashes. If the adapter's field
// table drifts from the core, this test fails rather than shipping a resume
// that lands on a different frame than the one you left.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createCore } from '../build/core.node.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const romPath = resolve(here, '..', 'roms', 'selftest.gb')

function fnv1a(bytes) {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const RIGHT = 1 << 3
const DOWN = 1 << 1

async function boot() {
  const core = createCore()
  await core.loadRom(new Uint8Array(readFileSync(romPath)))
  return core
}

test('a restored state replays identical frames', async () => {
  const core = await boot()

  for (let f = 0; f < 45; f++) {
    core.setInput(f >= 10 ? RIGHT : 0)
    core.runFrame()
  }

  const snapshot = core.saveState()
  assert.ok(snapshot.length > 1000, 'state should carry real payload')

  for (let f = 0; f < 25; f++) {
    core.setInput(DOWN | RIGHT)
    core.runFrame()
  }
  const expected = fnv1a(core.framebufferRGBA())

  core.loadState(snapshot)

  for (let f = 0; f < 25; f++) {
    core.setInput(DOWN | RIGHT)
    core.runFrame()
  }
  const actual = fnv1a(core.framebufferRGBA())

  assert.equal(actual.toString(16), expected.toString(16), 'restored replay diverged')
})

test('state round-trips through UTF-8 bytes', async () => {
  const core = await boot()
  for (let f = 0; f < 20; f++) core.runFrame()
  const snapshot = core.saveState()
  const text = new TextDecoder().decode(snapshot)
  const payload = JSON.parse(text)
  assert.equal(payload.core, core.coreVersion())
  assert.equal(payload.format, 1)
  assert.ok(Object.keys(payload.fields).length > 150, 'expected the full field table')
})

test('a state from another core version is refused', async () => {
  const core = await boot()
  core.runFrame()
  const payload = JSON.parse(new TextDecoder().decode(core.saveState()))
  payload.core = 'some-other-core@9.9.9'
  assert.throws(
    () => core.loadState(new TextEncoder().encode(JSON.stringify(payload))),
    /written by/
  )
})

test('the selftest ROM boots, scrolls and renders the DMG palette', async () => {
  const core = await boot()
  const info = await core.loadRom(new Uint8Array(readFileSync(romPath)))
  assert.equal(info.isGBC, false)
  assert.equal(
    info.sha256,
    '275705265cc8dd3d6c15bff07b136c2654a42da5a06664116a0800ce96c1dc00',
    'selftest ROM bytes changed'
  )

  for (let f = 0; f < 30; f++) core.runFrame()
  const before = fnv1a(core.framebufferRGBA())

  for (let f = 0; f < 10; f++) {
    core.setInput(RIGHT)
    core.runFrame()
  }
  const after = fnv1a(core.framebufferRGBA())
  assert.notEqual(after, before, 'holding right should scroll the background')

  const rgba = core.framebufferRGBA()
  const colors = new Set()
  for (let i = 0; i < rgba.length; i += 4) colors.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2])
  assert.equal(colors.size, 4, 'DMG output should be exactly four colours')
})
