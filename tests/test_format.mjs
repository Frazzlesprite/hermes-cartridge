// The strings a user reads. They were previously trapped inside modules that
// needed a DOM or an emulator to import, which is why none of this was tested.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayName, formatAgo, formatBytes } from '../src/util/format.js'

test('a display name never leaks a path and never grows past 40 chars', () => {
  assert.equal(displayName('C:\\Users\\me\\roms\\tobudx.gb'), 'tobudx.gb')
  assert.equal(displayName('/home/me/roms/tobudx.gb'), 'tobudx.gb')
  const long = `${'a'.repeat(60)}.gbc`
  const shown = displayName(long)
  assert.equal(shown.length, 38, '37 characters plus the ellipsis')
  assert.ok(shown.endsWith('…'))
  assert.equal(displayName(''), '')
})

test('byte sizes stay honest at each boundary', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1023), '1023 B')
  assert.equal(formatBytes(1024), '1 KiB')
  assert.equal(formatBytes(1024 * 1024 - 1), '1024 KiB')
  assert.equal(formatBytes(1024 * 1024), '1.0 MiB')
})

test('slot ages floor, so a slot never claims to be older than it is', () => {
  const now = 1_700_000_000_000
  assert.equal(formatAgo(now - 1_000, now), 'just now')
  assert.equal(formatAgo(now - 59_000, now), 'just now')
  assert.equal(formatAgo(now - 60_000, now), '1m ago')
  assert.equal(formatAgo(now - 59 * 60_000, now), '59m ago')
  assert.equal(formatAgo(now - 60 * 60_000, now), '1h ago')
  assert.equal(formatAgo(now - 23 * 3_600_000, now), '23h ago')
  assert.equal(formatAgo(now - 24 * 3_600_000, now), '1d ago')
})

test('an unwritten slot says so', () => {
  assert.equal(formatAgo(undefined), 'empty')
  assert.equal(formatAgo(null), 'empty')
  assert.equal(formatAgo(0), 'empty')
})
