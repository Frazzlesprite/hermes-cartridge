// Two things the picker promises: a cartridge whose header is intact loads,
// and one that is not gets refused with a useful message. Plus a smoke test of
// the CGB code path, using a CGB-flagged copy of the self-test cartridge so no
// commercial ROM is involved.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createCore, SCREEN_WIDTH, SCREEN_HEIGHT } from '../build/core.node.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const romPath = resolve(here, '..', 'roms', 'selftest.gb')

function headerChecksum(bytes) {
  let sum = 0
  for (let i = 0x134; i <= 0x14c; i++) sum = (sum - bytes[i] - 1) & 0xff
  return sum
}

/** The self-test cartridge, told to boot in colour mode. */
function asCgb(bytes) {
  const copy = Uint8Array.from(bytes)
  copy[0x143] = 0x80 // CGB-enhanced
  copy[0x14d] = headerChecksum(copy)
  return copy
}

function distinctColours(rgba) {
  const seen = new Set()
  for (let i = 0; i < rgba.length; i += 4) {
    seen.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2])
  }
  return seen.size
}

const RIGHT = 1 << 3

test('a monochrome cartridge reports mono mode and 160x144 output', async () => {
  const core = createCore()
  const info = await core.loadRom(new Uint8Array(readFileSync(romPath)))
  assert.equal(info.isGBC, false)
  core.runFrame()
  assert.equal(core.framebufferRGBA().length, SCREEN_WIDTH * SCREEN_HEIGHT * 4)
})

test('a colour-flagged cartridge boots in colour mode and renders', async () => {
  const core = createCore()
  const info = await core.loadRom(asCgb(new Uint8Array(readFileSync(romPath))))
  assert.equal(info.isGBC, true, 'CGB flag should switch the core to colour mode')

  for (let frame = 0; frame < 40; frame++) {
    core.setInput(frame >= 10 ? RIGHT : 0)
    core.runFrame()
  }

  const colours = distinctColours(core.framebufferRGBA())
  assert.ok(colours >= 4, `expected a colour frame, saw ${colours} distinct colours`)
})

test('a cartridge with a broken header is refused, not half-loaded', async () => {
  const bytes = new Uint8Array(readFileSync(romPath))
  bytes[0x14d] = bytes[0x14d] ^ 0xff // corrupt the header checksum

  const core = createCore()
  await assert.rejects(() => core.loadRom(bytes), /header checksum/i)
})

test('a truncated file is refused before it reaches the core', async () => {
  const core = createCore()
  await assert.rejects(() => core.loadRom(new Uint8Array(64)), /too small/i)
})

/**
 * Optional integration run against a real colour cartridge that is not
 * in this repository (Cartridge ships no games). Point CARTRIDGE_GBC_ROM at a
 * .gbc file to exercise it:
 *
 *   CARTRIDGE_GBC_ROM=/path/demo-dash.gbc node --test tests/test_gbc.mjs
 *
 * This is how the RUMBLE mapper crash was found and fixed; keeping the hook
 * means the next mapper bug can be reproduced the same way.
 */
const externalGbc = process.env.CARTRIDGE_GBC_ROM

test('a real colour cartridge boots, renders colour and runs at speed', { skip: !externalGbc }, async () => {
  const core = createCore()
  const info = await core.loadRom(new Uint8Array(readFileSync(externalGbc)))
  assert.equal(info.isGBC, true)

  const started = performance.now()
  for (let frame = 0; frame < 120; frame++) {
    core.setInput(frame > 20 && frame < 90 ? RIGHT : 0)
    core.runFrame()
  }
  const msPerFrame = (performance.now() - started) / 120

  const colours = distinctColours(core.framebufferRGBA())
  assert.ok(colours >= 4, `expected colour output, saw ${colours} colours`)
  assert.ok(msPerFrame < 8, `frame budget blown: ${msPerFrame.toFixed(2)} ms`)
})

