// The regression gate (spec §16): run the self-test cartridge headlessly and
// compare a hash of the final framebuffer against a committed golden value.
//
// Runs in CI with no Electron, no canvas and no network, because the core is
// plain JavaScript and the adapter takes a fake 2D context in node.
//
// Regenerate deliberately: `node tests/test_core.mjs --write`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createCore } from '../build/core.node.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const romPath = resolve(here, '..', 'roms', 'selftest.gb')
const goldenPath = resolve(here, 'golden', 'selftest.hash')

const FRAMES = 120
const RIGHT = 1 << 3
const DOWN = 1 << 1

function fnv1a(bytes) {
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * A fixed input schedule. The demo ROM only scrolls when a direction is held,
 * so without input this would hash a static screen and prove very little about
 * the PPU. With it, any regression in CPU, PPU or scrolling changes the hash.
 */
function inputAt(frame) {
  if (frame >= 20 && frame < 60) return RIGHT
  if (frame >= 60 && frame < 90) return RIGHT | DOWN
  if (frame >= 90 && frame < 110) return 0
  return 0
}

export async function runSelftest() {
  const core = createCore()
  await core.loadRom(new Uint8Array(readFileSync(romPath)))
  for (let frame = 0; frame < FRAMES; frame++) {
    core.setInput(inputAt(frame))
    core.runFrame()
  }
  const hash = fnv1a(core.framebufferRGBA())
  return `${hash.toString(16).padStart(8, '0')}`
}

if (process.argv.includes('--write')) {
  const hash = await runSelftest()
  mkdirSync(dirname(goldenPath), { recursive: true })
  writeFileSync(
    goldenPath,
    `# Cartridge self-test golden framebuffer hash\n# test: tests/test_core.mjs  rom: roms/selftest.gb  frames: ${FRAMES}\n# algorithm: FNV-1a 32-bit over RGBA (160x144x4) of the final frame\n${hash}\n`
  )
  console.log(`wrote ${goldenPath}: ${hash}`)
}

test('self-test framebuffer hash matches the golden value', async () => {
  const expected = readFileSync(goldenPath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .pop()

  assert.ok(expected, 'golden hash file is missing its value')
  const actual = await runSelftest()
  assert.equal(actual, expected, 'framebuffer hash changed — the emulation or the input schedule moved')
})

test('the hash is stable across two runs in the same process', async () => {
  const first = await runSelftest()
  const second = await runSelftest()
  assert.equal(first, second, 'the core is not deterministic between instances')
})
