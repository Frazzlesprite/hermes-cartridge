// The self-test cartridge is a binary the scanner reads, so its provenance and
// its bytes live in the repo. If the bytes change, the golden framebuffer hash
// and this check both have to move together.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const EXPECTED = '275705265cc8dd3d6c15bff07b136c2654a42da5a06664116a0800ce96c1dc00'

const actual = createHash('sha256').update(readFileSync('roms/selftest.gb')).digest('hex')
if (actual !== EXPECTED) {
  console.error('roms/selftest.gb changed:', actual)
  console.error('expected:', EXPECTED)
  process.exit(1)
}
console.log('selftest.gb sha256 ok')
