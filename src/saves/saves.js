/**
 * Save states and battery saves, stored through the plugin's own data folder.
 *
 * `ctx.files` with the `'data'` handle is private to the plugin, needs no
 * prompt, and survives restarts. It has no binary write, so blobs are base64 in
 * a small JSON envelope; that also makes a state diffable when something goes
 * wrong. When the door is missing (older Desktop build), the same envelope goes
 * into `ctx.storage`, which is smaller but keeps save states working.
 */
import { bytesToBase64, base64ToBytes } from '../core/adapter.js'

const DATA = 'data'
const INDEX_KEY = 'saves.index'
const WRAPPER = 'cartridge.save.v1'

/** Flat names only: ctx.files cannot create a directory. */
function fileName(romSha, slot) {
  return `cartridge-${romSha.slice(0, 16)}-${slot}.json`
}

function hasFiles(ctx) {
  return Boolean(ctx?.files?.writeText && ctx?.files?.readText)
}

function encode(bytes) {
  return JSON.stringify({ v: WRAPPER, at: Date.now(), bytes: bytesToBase64(bytes) })
}

function decode(text) {
  const parsed = JSON.parse(text)
  if (parsed?.v !== WRAPPER || typeof parsed.bytes !== 'string') {
    throw new Error('not a Cartridge save file')
  }
  const bytes = base64ToBytes(parsed.bytes)
  return { bytes, at: parsed.at ?? null }
}

export function createSaveStore(ctx, { onNotice } = {}) {
  const notice = message => {
    try {
      onNotice?.(message)
    } catch {
      /* a failed notice must never break a save */
    }
  }

  const readIndex = () => {
    try {
      return ctx.storage.get(INDEX_KEY, {}) ?? {}
    } catch {
      return {}
    }
  }

  const writeIndex = index => {
    try {
      ctx.storage.set(INDEX_KEY, index)
    } catch {
      /* non-fatal */
    }
  }

  const remember = (romSha, slot, at, size) => {
    const index = readIndex()
    const forRom = index[romSha] ?? {}
    forRom[slot] = { at, size }
    index[romSha] = forRom
    writeIndex(index)
  }

  const forget = (romSha, slot) => {
    const index = readIndex()
    if (index[romSha]) {
      delete index[romSha][slot]
      if (Object.keys(index[romSha]).length === 0) delete index[romSha]
      writeIndex(index)
    }
  }

  return {
    slots(romSha) {
      return readIndex()[romSha] ?? {}
    },

    async write(romSha, slot, bytes) {
      if (!romSha || !bytes) return false
      const text = encode(bytes)
      if (hasFiles(ctx)) {
        const result = await ctx.files.writeText(DATA, fileName(romSha, slot), text)
        if (result?.ok) {
          remember(romSha, slot, Date.now(), bytes.length)
          return true
        }
        notice(`Could not write the save file: ${result?.error ?? 'unknown error'}`)
      }
      // Fallback: plugin-scoped storage. Keeps the demo alive on a build with
      // no ctx.files door, at the cost of a much smaller budget.
      try {
        ctx.storage.set(`save.${romSha}.${slot}`, text)
        remember(romSha, slot, Date.now(), bytes.length)
        return true
      } catch {
        notice('No room left to store that save.')
        return false
      }
    },

    async read(romSha, slot) {
      if (!romSha) return null
      if (hasFiles(ctx)) {
        const result = await ctx.files.readText(DATA, fileName(romSha, slot))
        if (result?.ok && result.text) {
          try {
            return decode(result.text).bytes
          } catch {
            return null
          }
        }
        if (result && result.error && result.error !== 'not-found') {
          notice(`Could not read the save file: ${result.error}`)
        }
      }
      try {
        const text = ctx.storage.get(`save.${romSha}.${slot}`, null)
        return text ? decode(text).bytes : null
      } catch {
        return null
      }
    },

    async remove(romSha, slot) {
      forget(romSha, slot)
      if (hasFiles(ctx)) {
        await ctx.files.trash(DATA, fileName(romSha, slot))
      }
      try {
        ctx.storage.remove(`save.${romSha}.${slot}`)
      } catch {
        /* already gone */
      }
    },

    /** "Remember this ROM" (off by default, spec §9.1). */
    async rememberRom(romSha, bytes, name) {
      if (!hasFiles(ctx)) return false
      const text = encode(bytes)
      if (text.length > 4 * 1024 * 1024) {
        notice('That cartridge is too large to remember (4 MiB of base64 is the limit).')
        return false
      }
      const result = await ctx.files.writeText(DATA, `cartridge-${romSha}-rom.json`, text)
      if (!result?.ok) {
        notice(`Could not remember that cartridge: ${result?.error ?? 'unknown error'}`)
        return false
      }
      ctx.storage.set('rom.remembered', romSha)
      if (name) ctx.storage.set('rom.rememberedName', String(name))
      return true
    },

    async rememberedRom(romSha) {
      if (!hasFiles(ctx)) return null
      const result = await ctx.files.readText(DATA, `cartridge-${romSha}-rom.json`)
      if (!result?.ok || !result.text) return null
      try {
        return decode(result.text).bytes
      } catch {
        return null
      }
    },

    async forgetRom(romSha) {
      ctx.storage.remove('rom.remembered')
      if (hasFiles(ctx)) await ctx.files.trash(DATA, `cartridge-${romSha}-rom.json`)
    }
  }
}
