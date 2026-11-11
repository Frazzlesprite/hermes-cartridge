/**
 * Cartridge core adapter.
 *
 * The pane never touches a core method directly — everything goes through this
 * file. That is what makes the vendored emulator replaceable in an afternoon,
 * and it is why swapping `vendor/jsgbc-core` for another MIT core touches one
 * module instead of twelve.
 *
 * Contract (spec §8.2):
 *   loadRom(bytes)        -> { title, isGBC, sha256 }
 *   runFrame()            -> void
 *   framebufferRGBA()     -> Uint8ClampedArray(160*144*4)
 *   setInput(mask)        -> void
 *   saveState()           -> Uint8Array
 *   loadState(bytes)      -> void
 *   batterySave()         -> Uint8Array|null
 *   loadBattery(bytes)    -> void
 *   audioSamples()        -> Int16Array|null
 *   coreVersion()         -> string
 */
import { GameBoy } from '../../vendor/jsgbc-core/src/index'
import { STATE_FIELDS, ADAPTER_EXTRA_FIELDS } from './state-fields.js'

export const SCREEN_WIDTH = 160
export const SCREEN_HEIGHT = 144

// Bumped whenever the snapshot layout changes. States from another version are
// refused rather than half-loaded (spec §2.6).
export const STATE_FORMAT = 1
export const CORE_VERSION = 'jsgbc-core@0.7.0+0d2c721'

/**
 * Input mask bits, in the order the spec lists them. The core's own joypad
 * indices differ (right/left/up/down/a/b/select/start), so translation lives
 * here and nowhere else.
 */
export const BUTTON = {
  UP: 1 << 0,
  DOWN: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  A: 1 << 4,
  B: 1 << 5,
  START: 1 << 6,
  SELECT: 1 << 7
}

const CORE_KEY_INDEX = [
  [BUTTON.RIGHT, 0],
  [BUTTON.LEFT, 1],
  [BUTTON.UP, 2],
  [BUTTON.DOWN, 3],
  [BUTTON.A, 4],
  [BUTTON.B, 5],
  [BUTTON.SELECT, 6],
  [BUTTON.START, 7]
]

/** DMG palettes. Four 24-bit RGB values, lightest first — the core's own order. */
export const PALETTES = {
  pocket: [0xefffde, 0xadd794, 0x529273, 0x183442],
  grey: [0xf8f8f8, 0xa8a8a8, 0x585858, 0x181818],
  green: [0xe0f8d0, 0x88c070, 0x346856, 0x081820]
}
export const DEFAULT_PALETTE = 'pocket'

// --- base64, usable in the renderer and in node without btoa/Buffer ---------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = (() => {
  const t = new Uint8Array(256)
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i
  return t
})()

export function bytesToBase64(bytes) {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '=='
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '='
  }
  return out
}

export function base64ToBytes(text) {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
  // Length comes from the PADDED length: `clean` has already dropped the '='s,
  // so dividing its length straight away silently loses a byte on any payload
  // whose size is 2 mod 3 (32-byte palette tables, for instance), and a
  // too-short buffer makes a typed-array restore fail its size check.
  const byteLength = Math.floor(((clean.length + pad) * 3) / 4) - pad
  const out = new Uint8Array(byteLength)
  let p = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)]
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)]
    const c = B64_LOOKUP[clean.charCodeAt(i + 2)]
    const d = B64_LOOKUP[clean.charCodeAt(i + 3)]
    const n = (a << 18) | (b << 12) | (c << 6) | d
    if (p < byteLength) out[p++] = (n >> 16) & 255
    if (p < byteLength) out[p++] = (n >> 8) & 255
    if (p < byteLength) out[p++] = n & 255
  }
  return out
}

const TYPED_CTORS = { uint8: Uint8Array, int8: Int8Array, int32: Int32Array }

function readPath(target, path) {
  const parts = path.split('.')
  let value = target
  for (const part of parts) {
    if (value == null) return undefined
    value = value[part]
  }
  return value
}

/**
 * Write a snapshot value back into a live object graph.
 *
 * Typed arrays are copied INTO the existing allocation when the shapes match.
 * Replacing them would strand the `Memory`, `GPU` and LCD objects that cached
 * the old references, so identity is preserved on purpose.
 */
function writePath(target, path, value) {
  const parts = path.split('.')
  let holder = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (holder == null) return false
    holder = holder[parts[i]]
  }
  if (holder == null) return false
  const key = parts[parts.length - 1]
  if (typeof value === 'string') {
    const existing = holder[key]
    const bytes = base64ToBytes(value)
    if (existing && typeof existing.length === 'number' && typeof existing.set === 'function') {
      // Reinterpret the bytes as the destination's element type. A plain
      // `set(bytes)` is element-wise: for an Int32Array it would copy the first
      // N byte values as int32s and silently truncate the real numbers.
      const elementBytes = existing.BYTES_PER_ELEMENT ?? 1
      if (existing.length * elementBytes !== bytes.length) return false
      const view = new existing.constructor(bytes.buffer, bytes.byteOffset, existing.length)
      existing.set(view)
      return true
    }
    return false
  }
  holder[key] = value
  return true
}

function toBase64(value) {
  return bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
}

function fakeContext() {
  // The core insists on a 2D context even when nobody screens the pixels. In
  // node there is no DOM, so the headless harness supplies the minimum surface
  // `LCD.draw()` and `outputFrameBuffer()` actually use.
  return {
    canvas: null,
    imageSmoothingEnabled: false,
    mozImageSmoothingEnabled: false,
    webkitImageSmoothingEnabled: false,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
    drawImage() {},
    fillRect() {},
    clearRect() {}
  }
}

function fakeCanvas(context) {
  return { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, getContext: () => context, style: {} }
}

/**
 * @param {object} [options]
 * @param {object} [options.audio]  `{ context }` for the core's mixer (never used
 *   for its own output; Cartridge captures `writeAudio` instead)
 */
export function createCore(options = {}) {
  // The core insists on a 2D context in its constructor, but Cartridge owns the
  // pixels. Handing it a *real* context is what broke in the app: its
  // `createImageData` call goes to the context it was given, so mixing a real
  // visible context with a stub offscreen one produced a plain object and
  // `putImageData` rejected it. Give the core private stubs on both sides and
  // blit the framebuffer ourselves — one code path, headless or on screen.
  const context = fakeContext()
  const canvas = fakeCanvas(context)
  const offscreenContext = fakeContext()
  const offscreenCanvas = fakeCanvas(offscreenContext)

  const gb = new GameBoy({
    audio: options.audio,
    lcd: { canvas, context, offscreenCanvas, offscreenContext }
  })

  // The core's AudioDevice wants an AudioContext + AudioWorklet at init(). We
  // capture its mixer output instead: `writeAudio` is the only seam the audio
  // controller uses to hand samples out.
  let audioChunks = []
  let audioEnabled = Boolean(options.audio?.context)
  gb.audioDevice.init = async () => {}
  gb.audioDevice.remainingBuffer = () => 0
  gb.audioDevice.setVolume = () => {}
  gb.audioDevice.writeAudio = buffer => {
    if (!audioEnabled || !buffer || buffer.length === 0) return
    // Keep at most ~250 ms queued; dropping is better than unbounded growth.
    const queued = audioChunks.reduce((n, c) => n + c.length, 0)
    if (queued > 44100 * 0.5 * 2) return
    audioChunks.push(Float32Array.from(buffer))
  }

  // A real ImageData when the platform has one, so the pane can blit with a
  // single putImageData and no per-frame copy: framebufferRGBA() writes straight
  // into the ImageData's buffer. In node there is no ImageData, and the headless
  // harness only ever reads the array.
  const imageData =
    typeof ImageData !== 'undefined' ? new ImageData(SCREEN_WIDTH, SCREEN_HEIGHT) : null
  const rgba = imageData
    ? imageData.data
    : new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4)
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255

  let inputMask = 0
  let paletteName = DEFAULT_PALETTE
  let romInfo = null
  // Frames whose gate had to be re-armed (see runFrame). Exposed so a regression
  // test can prove the recovery path runs instead of the core wedging.
  let rearmedFrames = 0

  const syncInput = mask => {
    if (mask === inputMask) return
    const changed = mask ^ inputMask
    for (const [bit, key] of CORE_KEY_INDEX) {
      if (!(changed & bit)) continue
      if (mask & bit) gb.joypad.down(key)
      else gb.joypad.up(key)
    }
    inputMask = mask
  }

  const applyPalette = () => {
    if (!gb.cartridge || gb.cartridge.useGbcMode) return
    const colors = PALETTES[paletteName] ?? PALETTES[DEFAULT_PALETTE]
    gb.colors = colors
    // The core decodes BGP/OBP into palette tables once, when the game writes
    // the register. Re-decode them so a palette switch repaints without a reset.
    const bgp = gb.memory[0xff47] ?? 0xe4
    gb.updateGBBGPalette(bgp)
    gb.updateGBOBJPalette(0, gb.memory[0xff48] ?? 0xe4)
    gb.updateGBOBJPalette(1, gb.memory[0xff49] ?? 0xe4)
  }

  const boot = () => {
    gb.start(gb.cartridge)
    // turnOn() would start the core's own requestAnimationFrame loop. The pane
    // owns pacing (spec §2.6), so prime the frame gate and leave the loop alone.
    gb.stopEmulator = 1
    seedCgbPalettes()
  }

  /**
   * Without a colour boot ROM the palette RAM is uninitialised, so a colour
   * cartridge draws one flat colour until it writes its own palettes. Real GBC
   * titles do that in their first frames; enhanced mono titles never do.
   * Seed the same grey DMG-compatibility palette the boot ROM installs, so both
   * kinds of cartridge show something sane from frame one. A game that writes
   * its own palettes simply overwrites these.
   */
  const seedCgbPalettes = () => {
    if (!gb.cartridge?.useGbcMode) return
    const grey = [0x7fff, 0x56b5, 0x294a, 0x0000] // white, light grey, dark grey, black
    const setPalette = (indexRegister, dataRegister) => {
      gb.writeMemory(indexRegister, 0x80) // colour 0, auto-increment
      for (const colour of grey) {
        gb.writeMemory(dataRegister, colour & 0xff)
        gb.writeMemory(dataRegister, (colour >> 8) & 0xff)
      }
    }
    setPalette(0xff68, 0xff69) // BG palette 0
    setPalette(0xff6a, 0xff6b) // OBJ palette 0
  }

  /**
   * The core keeps RGB (3 bytes per pixel); a canvas wants RGBA. Every path that
   * shows or hashes pixels goes through this one conversion.
   */
  const copyFrame = () => {
    const rgb = gb.lcdDevice.swizzledFrame
    if (!rgb) return
    for (let p = 0, s = 0; p < rgba.length; p += 4, s += 3) {
      rgba[p] = rgb[s]
      rgba[p + 1] = rgb[s + 1]
      rgba[p + 2] = rgb[s + 2]
    }
  }

  return {
    get core() {
      return gb
    },

    get rearmedFrames() {
      return rearmedFrames
    },

    get title() {
      return romInfo?.title ?? ''
    },

    get isGBC() {
      return Boolean(gb.cartridge?.useGbcMode)
    },

    async loadRom(bytes) {
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      if (data.length < 0x150) {
        throw new Error('That file is too small to be a cartridge.')
      }
      // A GB cartridge header carries its own checksum at 0x14D. A mismatched
      // header almost always means "this is a zip, not a ROM".
      let sum = 0
      for (let i = 0x134; i <= 0x14c; i++) sum = (sum - data[i] - 1) & 0xff
      if (sum !== data[0x14d]) {
        throw new Error('That file does not look like a handheld cartridge (header checksum mismatch).')
      }

      gb.removeCartridge()
      gb.insertCartridge(data)
      boot()

      const sha256 = await sha256Hex(data)
      romInfo = {
        title: (gb.cartridge.name || '').trim(),
        isGBC: Boolean(gb.cartridge.useGbcMode),
        sha256,
        hasBattery: Boolean(gb.cartridge.hasBattery),
        mapper: gb.cartridge.typeName ?? 'ROM'
      }
      inputMask = 0
      audioChunks = []
      applyPalette()
      return romInfo
    },

    runFrame() {
      // Before a cartridge is inserted there is nothing to run, and the core's
      // run() dereferences the cartridge. Always-on mode asks for frames as soon
      // as the pane mounts, so this guard is load-bearing, not defensive noise.
      if (!gb.cartridge) return
      // A frame is only ever requested at a frame boundary, so the core's frame
      // gate must be exactly 1. A snapshot restore or a cartridge swap can leave
      // it at 0 (the core logs "Iterator restarted a faulted core" on every call
      // and never advances) or at 2/3 (it returns silently). Both look exactly
      // like a frozen game while the pane still reports "playing". Asking for a
      // frame means the core is not paused — the pane pauses by not asking — so
      // normalise the gate here instead of wedging forever.
      if (gb.stopEmulator !== 1) {
        rearmedFrames++
        gb.stopEmulator = 1
      }
      gb.run()
    },

    framebufferRGBA() {
      copyFrame()
      return rgba
    },

    /**
     * Convert the core's current framebuffer for display without advancing a
     * frame. Used after a state restore, where running a frame would move the
     * game off the exact frame the pane is promising to hold.
     */
    redraw() {
      if (!gb.cartridge) return
      gb.lcdDevice.outputFrameBuffer()
    },

    /**
     * Draw the last completed frame. Called once per finished frame, never per
     * rAF tick (spec §10), and only when a frame actually completed.
     *
     * The conversion lives here as well as in framebufferRGBA(): a caller that
     * only draws must still get real pixels, which is exactly the bug the pane
     * shipped with — a zeroed ImageData painted every frame.
     * @param {CanvasRenderingContext2D} target
     */
    drawTo(target) {
      if (!target || !imageData || !gb.cartridge) return false
      copyFrame()
      target.putImageData(imageData, 0, 0)
      return true
    },

    setInput(mask) {
      syncInput(mask & 0xff)
    },

    setPalette(name) {
      paletteName = name
      applyPalette()
    },

    setAudioEnabled(on) {
      audioEnabled = Boolean(on)
      if (!audioEnabled) audioChunks = []
    },

    /** The mixer's real output rate, so playback is not silently pitch-shifted. */
    audioSampleRate() {
      const rate = gb.cpu?.clocksPerSecond / gb.audioController?.resamplerFirstPassFactor
      return Number.isFinite(rate) && rate > 0 ? Math.round(rate) : 44100
    },

    audioSamples() {
      if (!audioEnabled || audioChunks.length === 0) return null
      const total = audioChunks.reduce((n, c) => n + c.length, 0)
      const out = new Int16Array(total)
      let p = 0
      for (const chunk of audioChunks) {
        for (let i = 0; i < chunk.length; i++) {
          const v = chunk[i] < -1 ? -1 : chunk[i] > 1 ? 1 : chunk[i]
          out[p++] = v < 0 ? v * 0x8000 : v * 0x7fff
        }
      }
      audioChunks = []
      return out
    },

    saveState() {
      const fields = {}
      for (const field of STATE_FIELDS) {
        const value = readPath(gb, field.path)
        if (value === undefined) continue
        // Trust the live value's shape, not the table's declared type: a few
        // upstream fields changed type between releases, and serialising a
        // typed array as a plain object loses its element type on restore.
        fields[field.path] = ArrayBuffer.isView(value) ? toBase64(value) : value
      }
      for (const field of ADAPTER_EXTRA_FIELDS) {
        const value = readPath(gb, field.path)
        if (value !== undefined) fields[field.path] = value
      }
      const payload = {
        format: STATE_FORMAT,
        core: CORE_VERSION,
        rom: romInfo?.sha256 ?? null,
        fields
      }
      return new TextEncoder().encode(JSON.stringify(payload))
    },

    loadState(bytes) {
      const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes)
      const payload = JSON.parse(text)
      if (payload.format !== STATE_FORMAT) {
        throw new Error(`Save state format ${payload.format} is not supported (expected ${STATE_FORMAT}).`)
      }
      if (payload.core !== CORE_VERSION) {
        throw new Error(`Save state was written by ${payload.core}; this build runs ${CORE_VERSION}.`)
      }
      if (payload.rom && romInfo?.sha256 && payload.rom !== romInfo.sha256) {
        throw new Error('That save state belongs to a different cartridge.')
      }
      // Set the palette tables from the live registers FIRST, so `gb.colors` is
      // right for future writes, then let the snapshot overwrite the tables it
      // recorded. Recomputing afterwards would replace restored palette data
      // with a fresh decode of whatever the registers happen to hold.
      applyPalette()
      for (const field of STATE_FIELDS) {
        if (!(field.path in payload.fields)) continue
        writePath(gb, field.path, payload.fields[field.path])
      }
      for (const field of ADAPTER_EXTRA_FIELDS) {
        if (field.path in payload.fields) writePath(gb, field.path, payload.fields[field.path])
      }
      // The core's own resume sequence, minus its (upstream-broken) state load.
      gb.initReferencesFromSaveState()
      gb.memoryNew.init()
      gb.lcdDevice.init()
      gb.audioController.noiseSampleTable =
        gb.audioController.channel4BitRange === 0x7fff
          ? gb.audioController.LSFR15Table
          : gb.audioController.LSFR7Table
      gb.audioController.channel4VolumeShifter =
        gb.audioController.channel4BitRange === 0x7fff ? 15 : 7
      gb.stopEmulator = 1
      inputMask = 0
      audioChunks = []
    },

    batterySave() {
      const ram = gb.cartridge?.mbc?.getRam?.()
      if (!ram || ram.length === 0) return null
      return new Uint8Array(ram)
    },

    loadBattery(bytes) {
      if (!bytes || !gb.cartridge?.mbc) return false
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      gb.cartridge.mbc.loadRam(data)
      return true
    },

    coreVersion() {
      return CORE_VERSION
    }
  }
}

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const view = new Uint8Array(digest)
  let out = ''
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0')
  return out
}
