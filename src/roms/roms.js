/**
 * Cartridge files.
 *
 * The plugin reads exactly one file the user chooses and never touches the
 * network, never logs bytes, and never shows a full path (spec §9.1).
 */
import { BYTES_BASE64, SHA256 } from 'virtual:selftest-rom'
import { base64ToBytes } from '../core/adapter.js'

export const SELFTEST_SHA256 = SHA256

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

/** Base filename only: a pane has no business showing where you keep things. */
export function displayName(name) {
  if (!name) return ''
  const bare = String(name).split(/[\\/]/).pop() ?? ''
  return bare.length > 40 ? `${bare.slice(0, 37)}…` : bare
}

export function formatBytes(n) {
  const bytes = Number(n) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}
