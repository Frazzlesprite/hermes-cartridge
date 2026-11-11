// base64 is the wire format for every typed array in a save state. A decoder
// that is one byte short does not throw: the restore's size check fails, the
// field is skipped silently, and the game comes back subtly wrong. These cases
// cover every remainder mod 3 plus the sizes the core actually stores.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bytesToBase64, base64ToBytes } from '../build/core.node.mjs'

const SIZES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 31, 32, 33, 64, 100, 255, 256, 1024, 8192, 92160]

test('base64 round-trips every byte length the core uses', () => {
  for (const size of SIZES) {
    const input = new Uint8Array(size)
    for (let i = 0; i < size; i++) input[i] = (i * 37 + 11) & 0xff

    const encoded = bytesToBase64(input)
    const decoded = base64ToBytes(encoded)

    assert.equal(decoded.length, size, `decoded length for ${size} bytes`)
    assert.deepEqual(Array.from(decoded), Array.from(input), `contents for ${size} bytes`)
  }
})

test('a 32-byte palette table survives, which is where the bug lived', () => {
  // 32 mod 3 == 2, the case the old decoder got wrong.
  const palette = new Int32Array([0, 11392916, 5411443, 1586242, 0, 5411443, 11392916, 15728606])
  const bytes = new Uint8Array(palette.buffer)
  const decoded = base64ToBytes(bytesToBase64(bytes))

  assert.equal(decoded.length, 32)
  const restored = new Int32Array(decoded.buffer, decoded.byteOffset, 8)
  assert.deepEqual(Array.from(restored), Array.from(palette))
})

test('decoding tolerates whitespace and newlines from a pretty-printed state', () => {
  const input = new Uint8Array([1, 2, 3, 4, 5])
  const encoded = bytesToBase64(input)
  const messy = `  ${encoded.slice(0, 4)}\n${encoded.slice(4)}  `
  assert.deepEqual(Array.from(base64ToBytes(messy)), Array.from(input))
})
