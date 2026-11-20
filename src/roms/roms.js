/**
 * Cartridge files.
 *
 * The plugin reads exactly one file the user chooses and never touches the
 * network, never logs bytes, and never shows a full path (spec §9.1).
 */
import { BYTES_BASE64 } from 'virtual:selftest-rom'
import { base64ToBytes } from '../core/adapter.js'

/** The bundled WTFPL ROM, inlined at build time from roms/selftest.gb. */
export function selftestRom() {
  return { bytes: base64ToBytes(BYTES_BASE64), name: 'selftest.gb' }
}

/**
 * @param {File} file
 * @returns {Promise<{ bytes: Uint8Array, name: string }>}
 */
export async function readRomFile(file) {
  if (!file) throw new Error('No cartridge was dropped.')
  const name = String(file.name ?? 'cartridge.gb')
  if (!/\.(gb|gbc)$/i.test(name)) {
    const looksZipped = /\.(zip|7z|rar|gz)$/i.test(name)
    throw new Error(
      looksZipped
        ? `“${name}” is an archive. Unzip it and drop the .gb or .gbc inside.`
        : `“${name}” is not a .gb or .gbc file.`
    )
  }
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength === 0) throw new Error(`“${name}” is empty.`)
  return { bytes: new Uint8Array(buffer), name }
}
