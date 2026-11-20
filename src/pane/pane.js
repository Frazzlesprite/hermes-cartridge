import { host, useValue, cn } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useRef, useState } from 'react'

import { createCore, SCREEN_WIDTH, SCREEN_HEIGHT, BUTTON } from '../core/adapter.js'
import { createPacer, FRAME_MS } from './loop.js'
import { computePaneVisible } from './visibility.js'
import { commands, clearCommands } from './commands.js'
import { createAudioPlayer } from '../audio/player.js'
import { createSaveStore } from '../saves/saves.js'
import { buttonForCode, BUTTON_LABELS, labelForCode } from '../input/keymap.js'
import { readRomFile, selftestRom } from '../roms/roms.js'
import { displayName, formatAgo, formatBytes } from '../util/format.js'
import {
  busy,
  rom,
  phase,
  lastError,
  prefs,
  served,
  worker,
  dispatch,
  addServed,
  flushServed,
  formatServed,
  setPrefs,
  effects as effectBridge
} from '../state/store.js'
import {
  STATUS,
  MODE_ALWAYS,
  MODE_INTERRUPTED,
  isRunning,
  needsAttention,
  statusLabel
} from '../state/reducer.js'

const AUTO_SLOT = 'auto'
const SLOTS = ['1', '2', '3', '4']

/** How often the automatic slot is written while a game is running. */
const AUTO_SAVE_MS = 30000
/** How often battery RAM is compared and, when it moved, written out. */
const BATTERY_SAVE_MS = 5000

const CHOICE_LABELS = {
  once: 'Allow once',
  session: 'Allow for session',
  always: 'Always allow',
  deny: 'Deny'
}

/** Is this element somewhere a user types? */
function isEditable(target) {
  return Boolean(
    target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === true)
  )
}

/** Byte compare, for "has the battery RAM actually changed since we wrote it". */
function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function scaleFor(preference, width, height) {
  if (preference !== 'auto') {
    const fixed = Number.parseInt(preference, 10)
    if (Number.isFinite(fixed) && fixed >= 1) return fixed
  }
  const fit = Math.min(width / SCREEN_WIDTH, height / SCREEN_HEIGHT)
  return Math.max(1, Math.floor(fit))
}

function StatusDot({ tone }) {
  const toneClass =
    tone === 'playing'
      ? 'bg-(--ui-accent)'
      : tone === 'interrupted'
        ? 'bg-(--ui-text-secondary)'
        : 'bg-(--ui-text-quaternary)'
  return jsx('span', {
    'aria-hidden': true,
    className: cn('inline-block size-1.5 rounded-full', toneClass)
  })
}

export function CartridgePane() {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const coreRef = useRef(null)
  const pacerRef = useRef(null)
  const playerRef = useRef(null)
  const savesRef = useRef(null)
  const context2dRef = useRef(null)
  const heldRef = useRef(new Set())
  const pointerHeld = useRef(new Set())
  const paneFocusRef = useRef(false)
  const rootRef = useRef(null)
  const servedRef = useRef(0)
  const noticeTimerRef = useRef(0)
  const effectsBridge = useRef(null)
  const effectQueue = useRef(Promise.resolve())
  // Focus moved into a composer: release the keyboard lock at the end of the
  // task unless a bound key's handler vetoes it (see onCanvasBlur).
  const pendingFocusReleaseRef = useRef(0)
  const lastStatusRef = useRef(null)
  // The bytes and name of a cartridge whose header was refused, so the error
  // card can offer "Load anyway".
  const refusedRef = useRef(null)
  // Last battery image written, so a 5 s poll does not rewrite 32 KiB of RAM
  // that has not moved.
  const lastBatteryRef = useRef(null)
  const batteryTickRef = useRef(0)
  const autoSaveTickRef = useRef(0)
  const [scale, setScale] = useState(3)
  const [savesOpen, setSavesOpen] = useState(false)
  const [slotInfo, setSlotInfo] = useState({})
  const [notice, setNotice] = useState('')
  const [pressed, setPressed] = useState({})
  const [canvasFocused, setCanvasFocused] = useState(false)

  const state = useValue(busy)
  const current = useValue(rom)
  const currentPhase = useValue(phase)
  const error = useValue(lastError)
  const preferences = useValue(prefs)
  const servedToday = useValue(served)

  // Pausing when the window is hidden is the spec's requirement (§10).
  // `host.paneVisibility()` was tried first and returns false for this pane even
  // while it is on screen, which stopped the frame loop entirely — so the
  // document's own visibility is the only signal trusted here.

  // --- input mask ---------------------------------------------------------
  // Two sources feed one mask: keys held on the canvas, and buttons held with
  // the pointer on the on-screen deck. `pressed` mirrors both, so the deck shows
  // the keyboard's state too (spec §11 asks for exactly that).
  const maskOf = () => {
    const bindings = prefs.get().bindings
    let mask = 0
    for (const code of heldRef.current) {
      const button = buttonForCode(bindings, code)
      if (button) mask |= BUTTON[button]
    }
    for (const button of pointerHeld.current) mask |= BUTTON[button]
    return mask
  }

  const syncInput = () => {
    coreRef.current?.setInput(maskOf())
    const bindings = prefs.get().bindings
    const next = {}
    for (const code of heldRef.current) {
      const button = buttonForCode(bindings, code)
      if (button) next[button] = true
    }
    for (const button of pointerHeld.current) next[button] = true
    setPressed(next)
  }

  const pressButton = button => {
    // A press means "I want to play now". In interrupted mode with no turn the
    // loop is idle, so switch to always-on rather than swallowing the input.
    ensurePlayFromInput()
    pointerHeld.current.add(button)
    syncInput()
  }

  function ensurePlayFromInput() {
    const state = busy.get()
    if (state.status === STATUS.PAUSED_BY_USER) {
      dispatch({ type: 'user-toggle-play' })
      return
    }
    if (state.status === STATUS.IDLE && state.mode === MODE_INTERRUPTED) {
      dispatch({ type: 'mode-toggle' })
      setNotice('always on — playing outside a turn')
      window.clearTimeout(noticeTimerRef.current)
      noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2600)
    }
  }

  const releaseButton = button => {
    if (!pointerHeld.current.has(button)) return
    pointerHeld.current.delete(button)
    syncInput()
  }

  const clearHeld = () => {
    if (heldRef.current.size === 0 && pointerHeld.current.size === 0) return
    heldRef.current.clear()
    pointerHeld.current.clear()
    coreRef.current?.setInput(0)
    setPressed({})
  }

  // --- notices -----------------------------------------------------------
  const flash = message => {
    setNotice(message)
    window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2600)
  }

  /** Give the keyboard back to the rest of the app. */
  function releaseFocus() {
    paneFocusRef.current = false
    setCanvasFocused(false)
    clearHeld()
  }

  // --- saves -------------------------------------------------------------
  /**
   * The slot index for this cartridge, refreshed whenever the panel opens.
   *
   * Paints from the index immediately, then reconciles with the disk: a save
   * whose file is gone must not sit in the list offering a "load" that fails.
   */
  async function refreshSlots() {
    const info = rom.get()
    const saves = savesRef.current
    if (!info || !saves) {
      setSlotInfo({})
      return
    }
    setSlotInfo(saves.slots(info.sha256))
    try {
      const verified = await saves.slotsVerified(info.sha256)
      // The cartridge may have changed while we were asking the disk.
      if (rom.get()?.sha256 === info.sha256) setSlotInfo(verified)
    } catch {
      /* keep the index view */
    }
  }

  /**
   * Hold the current frame in the automatic slot.
   *
   * Written on an interrupt, whenever the game stops (turn end, user pause,
   * eject) and every 30 s of play, so "quit and reopen" lands near where you
   * left rather than at the last approval.
   */
  async function autoSaveNow(reason) {
    const core = coreRef.current
    const info = rom.get()
    const saves = savesRef.current
    if (!core || !info || !saves) return false
    try {
      const ok = await saves.write(info.sha256, AUTO_SLOT, core.saveState())
      if (ok) {
        if (reason === 'interrupt') flash('Paused for the agent — frame held')
        void refreshSlots()
      }
      return ok
    } catch (saveError) {
      console.warn('[cartridge] automatic save failed', saveError)
      return false
    }
  }

  /**
   * Write battery RAM when it has changed.
   *
   * This used to run only when the game stopped, which meant always-on mode
   * never persisted a battery save at all — quit while playing and the RAM was
   * gone. A 5 s poll while running plus a forced flush at every stop bounds the
   * loss. `force` skips the unchanged check (used before switching cartridges).
   */
  function bindBatteryFlush(force = false) {
    const core = coreRef.current
    const info = rom.get()
    const saves = savesRef.current
    if (!core || !info?.hasBattery || !saves) return
    let battery = null
    try {
      battery = core.batterySave()
    } catch {
      return
    }
    if (!battery || battery.length === 0) return
    if (!force && sameBytes(lastBatteryRef.current, battery)) return
    // Record the snapshot only once the write reports success, so a failed or
    // full disk is retried on the next poll instead of being treated as saved.
    const snapshot = Uint8Array.from(battery)
    void saves
      .write(info.sha256, 'battery', battery)
      .then(ok => {
        if (ok) lastBatteryRef.current = snapshot
      })
      .catch(() => {})
  }

  // --- loading -----------------------------------------------------------
  const bootRom = async (bytes, name, options = {}) => {
    const core = coreRef.current
    const saves = savesRef.current
    if (!core) return
    phase.set('loading')
    lastError.set('')
    refusedRef.current = null
    try {
      if (core.hasCartridge) {
        // The outgoing cartridge's RAM belongs to the outgoing cartridge, so
        // flush it before the core swaps the MBC out from under it.
        bindBatteryFlush(true)
        await autoSaveNow('switch')
      }
      const info = await core.loadRom(bytes, options)
      const loaded = {
        ...info,
        name: name ?? info.title ?? 'cartridge',
        size: bytes.length,
        title: info.title || name || 'cartridge'
      }
      rom.set(loaded)
      core.setPalette(prefs.get().palette)
      core.setAudioEnabled(prefs.get().audio)
      playerRef.current?.setSampleRate(core.audioSampleRate?.() ?? 44100)
      playerRef.current?.setEnabled(prefs.get().audio)
      lastBatteryRef.current = null
      void refreshSlots()

      if (info.hasBattery) {
        const battery = await saves.read(info.sha256, 'battery')
        if (battery) core.loadBattery(battery)
      }

      // Resume the automatic slot, if this cartridge has one. This is what makes
      // "restart Hermes, land on the same frame" work (spec §12, §13.3).
      const auto = await saves.read(info.sha256, AUTO_SLOT)
      let resumed = false
      if (auto) {
        try {
          core.loadState(auto)
          resumed = true
        } catch (restoreError) {
          console.warn('[cartridge] auto-save not restored', restoreError)
        }
      }

      if (prefs.get().rememberRom) await saves.rememberRom(info.sha256, bytes, loaded.name)

      if (resumed) {
        // Convert the restored framebuffer for display without advancing it.
        core.redraw()
      } else {
        // Power-on. A cartridge needs a few frames to initialise its PPU and
        // draw its first screen; without this the pane shows an empty canvas
        // whenever the agent is idle, which looks broken rather than paused.
        for (let i = 0; i < 8; i++) core.runFrame()
      }
      core.drawTo(context2dRef.current)

      phase.set('ready')
      pacerRef.current?.start()
      // Claim the keyboard when a cartridge lands, so the first Z or X plays the
      // game instead of typing into the composer behind it.
      paneFocusRef.current = true
      canvasRef.current?.focus()
      flash(resumed ? `Resumed ${displayName(loaded.name)}` : `Loaded ${displayName(loaded.name)}`)
    } catch (loadError) {
      phase.set('error')
      lastError.set(loadError?.message ?? String(loadError))
      // A refused header is the one failure the user can override: homebrew
      // with a hand-written header loads fine, the checksum is just stale.
      refusedRef.current = loadError?.code === 'header-checksum' ? { bytes, name } : null
    }
  }

  const forceLoad = () => {
    const pending = refusedRef.current
    if (!pending) return
    void bootRom(pending.bytes, pending.name, { force: true })
  }

  const loadFile = async file => {
    try {
      const { bytes, name } = await readRomFile(file)
      await bootRom(bytes, name)
    } catch (readError) {
      refusedRef.current = null
      phase.set('error')
      lastError.set(readError?.message ?? String(readError))
    }
  }

  const loadSelftest = () => {
    const { bytes, name } = selftestRom()
    return bootRom(bytes, name)
  }

  // --- saves -------------------------------------------------------------
  const writeSlot = async slot => {
    const core = coreRef.current
    const info = rom.get()
    const saves = savesRef.current
    if (!core || !info || !saves) return
    try {
      const ok = await saves.write(info.sha256, slot, core.saveState())
      if (ok) void refreshSlots()
      flash(ok ? `Saved to slot ${slot}` : `Could not save to slot ${slot}`)
    } catch (saveError) {
      flash(saveError?.message ?? 'Save failed')
    }
  }

  const readSlot = async slot => {
    const core = coreRef.current
    const info = rom.get()
    const saves = savesRef.current
    if (!core || !info || !saves) return
    const bytes = await saves.read(info.sha256, slot)
    if (!bytes) {
      flash(`Slot ${slot} is empty`)
      return
    }
    try {
      core.loadState(bytes)
      core.redraw()
      core.drawTo(context2dRef.current)
      flash(`Loaded slot ${slot}`)
    } catch (loadError) {
      flash(loadError?.message ?? 'Could not load that state')
    }
  }

  /** Put the cartridge back in its box: flush what belongs to it, then stop. */
  const ejectCartridge = async () => {
    const core = coreRef.current
    const current = rom.get()
    if (!core || !current) return
    bindBatteryFlush(true)
    await autoSaveNow('eject')
    core.eject()
    rom.set(null)
    phase.set('empty')
    lastError.set('')
    refusedRef.current = null
    lastBatteryRef.current = null
    setSlotInfo({})
    setSavesOpen(false)
    clearHeld()
    flash(`Ejected ${displayName(current.name)}`)
  }

  /** Power-cycle the cartridge, keeping its battery RAM. */
  const resetCartridge = () => {
    const core = coreRef.current
    if (!core?.reset?.()) return
    lastBatteryRef.current = null
    autoSaveTickRef.current = 0
    clearHeld()
    core.redraw()
    core.drawTo(context2dRef.current)
    flash('Cartridge reset')
  }

  // --- approval ----------------------------------------------------------
  const answerApproval = async choice => {
    const approval = busy.get().approval
    if (!approval) return
    try {
      await host.request('approval.respond', {
        choice,
        ...(approval.prompt_id ? { request_id: approval.prompt_id } : {}),
        ...(approval.session_id ? { session_id: approval.session_id } : {})
      })
      dispatch({ type: 'approval-cleared', promptId: approval.prompt_id ?? null })
    } catch (respondError) {
      console.warn('[cartridge] approval.respond failed', respondError)
      flash('Answer this one in the chat — the pane could not reach the approval queue.')
    }
  }

  // --- lifecycle ---------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const player = createAudioPlayer()
    const saves = createSaveStore(worker.ctx, { onNotice: message => flash(message) })
    const core = createCore()
    const context2d = canvas.getContext('2d')
    context2dRef.current = context2d
    core.setPalette(prefs.get().palette)
    core.setAudioEnabled(prefs.get().audio)
    player.setEnabled(prefs.get().audio)

    worker.core = core
    worker.player = player
    worker.saves = saves
    worker.effects = effectBridge
    // Atoms outlive the component (the chip reads them too), so a pane that was
    // closed and reopened would otherwise show the old cartridge's name over a
    // blank screen: this mount has a fresh core with nothing inserted.
    if (rom.get() && !core.hasCartridge) {
      rom.set(null)
      phase.set('empty')
      setSlotInfo({})
    }
    // Effects are serialised: an auto-save and the auto-restore that follows it
    // must not race, or an instant answer restores the previous slot.
    effectBridge.onEffect = effect => {
      effectQueue.current = effectQueue.current
        .then(() => effectsBridge.current?.(effect))
        .catch(error => console.warn('[cartridge] effect failed', effect.type, error))
    }
    coreRef.current = core
    playerRef.current = player
    savesRef.current = saves

    const pacer = createPacer({
      onFrame: () => {
        core.setInput(maskOf())
        core.runFrame()
        // One blit per completed frame, and only after the frame ended.
        core.drawTo(context2d)
        player.push(core.audioSamples())

        servedRef.current += FRAME_MS
        if (servedRef.current >= 1000) {
          const whole = Math.floor(servedRef.current)
          servedRef.current -= whole
          // Time served means "played while the agent worked" (spec §13.3), so
          // it only accrues during a turn, never in always-on idling. The
          // reducer has no counter of its own; this atom is the one number the
          // chip and the header both show.
          if (busy.get().turnBusy) addServed(whole)
        }

        batteryTickRef.current += FRAME_MS
        if (batteryTickRef.current >= BATTERY_SAVE_MS) {
          batteryTickRef.current = 0
          bindBatteryFlush()
        }

        autoSaveTickRef.current += FRAME_MS
        if (autoSaveTickRef.current >= AUTO_SAVE_MS) {
          autoSaveTickRef.current = 0
          void autoSaveNow('periodic')
        }
      },
      shouldRun: () => phase.get() === 'ready' && isRunning(busy.get()) && Boolean(rom.get())
    })
    pacerRef.current = pacer
    pacer.start()

    // --- on-screen visibility -------------------------------------------
    // The host keeps a hidden pane MOUNTED (inactive tab, minimised zone), so
    // "mounted" is not "watchable", and document.visibilityState only knows
    // about the whole window. checkVisibility() reports inherited CSS
    // visibility, and an IntersectionObserver catches a pane scrolled out of
    // the viewport. Polling is needed because a tab switch changes an ancestor's
    // CSS, which fires neither observer nor event.
    const container = containerRef.current
    let intersecting = true
    let lastHidden = null
    let visibilityPoll = 0
    const evaluateVisibility = () => {
      const cssVisible =
        container?.checkVisibility?.({ checkVisibilityCSS: true, contentVisibilityAuto: true }) ?? true
      const visible = computePaneVisible({
        documentHidden: typeof document !== 'undefined' && document.visibilityState !== 'visible',
        cssVisible,
        intersecting
      })
      // Dispatch only on a change: the reducer allocates a fresh state for any
      // action, and a poll that fired every 750 ms would re-render the pane for
      // nothing.
      if (lastHidden !== !visible) {
        lastHidden = !visible
        dispatch({ type: 'pane-hidden', value: !visible })
        if (!visible) bindBatteryFlush()
      }
    }
    const observer =
      container && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            entries => {
              for (const entry of entries) {
                if (entry.target === container) intersecting = entry.isIntersecting
              }
              evaluateVisibility()
            },
            { threshold: 0 }
          )
        : null
    observer?.observe(container)

    // A window blur must release every held key, or the D-pad sticks.
    const onBlur = () => clearHeld()
    const onVisibility = () => evaluateVisibility()

    // Keys are captured at the window (capture phase) while the pane holds
    // focus. Without this, Enter reaches the app's own "focus the composer"
    // shortcut before the canvas ever sees it, and Start becomes a no-op.
    const onCaptureKeyDown = event => {
      if (!paneFocusRef.current) return
      // While an approval card is up the game is held anyway, so keys belong to
      // the card: arrows scroll a long command instead of being swallowed by a
      // paused console. Answering is a click, so nothing is lost.
      if (busy.get().approvalPending) return
      const button = buttonForCode(prefs.get().bindings, event.code)
      if (!button) {
        // An unbound key while a text field holds focus means the user is
        // typing, not playing. Hand the keyboard back instead of swallowing a
        // letter the `beforeinput` guard would otherwise eat.
        if (isEditable(document.activeElement)) releaseFocus()
        return
      }
      // This key belongs to the game. If the host moved focus into the composer
      // a moment ago, cancel the pending "let go of the keyboard" decision: the
      // release is deferred exactly so a bound key can veto it.
      window.clearTimeout(pendingFocusReleaseRef.current)
      event.preventDefault()
      event.stopPropagation()
      // The app registers its own key handling before a plugin can, so on Enter
      // it has already moved focus to the composer by the time this runs. Take
      // the focus back: a key pressed while the game had focus belongs to the
      // game.
      window.setTimeout(() => {
        if (phase.get() !== 'empty' && !isEditable(document.activeElement)) {
          canvasRef.current?.focus()
        }
      }, 0)
      if (event.repeat) return
      ensurePlayFromInput()
      heldRef.current.add(event.code)
      syncInput()
    }
    const onCaptureKeyUp = event => {
      if (!heldRef.current.has(event.code)) return
      event.preventDefault()
      event.stopPropagation()
      heldRef.current.delete(event.code)
      syncInput()
    }

    // The host inserts printable keys into the composer even when the canvas
    // holds focus, so bound letters (Z/X) would pollute the prompt. Cancel the
    // text insertion itself while the game owns the keyboard.
    const onBeforeInput = event => {
      if (!paneFocusRef.current) return
      if (!isEditable(event.target)) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onOutsidePointerDown = event => {
      const root = rootRef.current
      if (!root || root.contains(event.target)) return
      releaseFocus()
    }

    // Closing the app is the one stop that cannot wait for the next turn.
    const onPageHide = () => {
      bindBatteryFlush(true)
      void autoSaveNow('quit')
      flushServed()
    }

    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerdown', onOutsidePointerDown, true)
    window.addEventListener('keydown', onCaptureKeyDown, true)
    window.addEventListener('beforeinput', onBeforeInput, true)
    window.addEventListener('keypress', onBeforeInput, true)
    window.addEventListener('keyup', onCaptureKeyUp, true)
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    evaluateVisibility()
    visibilityPoll = window.setInterval(evaluateVisibility, 750)

    // Restore the cartridge the user asked us to remember.
    const remembered = worker.ctx?.storage.get('rom.remembered', null)
    if (remembered) {
      const rememberedName = worker.ctx?.storage.get('rom.rememberedName', 'remembered cartridge')
      saves
        .rememberedRom(remembered)
        .then(bytes => {
          if (bytes) return bootRom(bytes, rememberedName)
          return null
        })
        .catch(() => {})
    }

    return () => {
      // A pane can unmount while a game is running (the host closes the tab).
      // Hold the frame and the battery RAM before the core goes away.
      bindBatteryFlush(true)
      void autoSaveNow('quit')
      pacer.stop()
      player.dispose()
      observer?.disconnect()
      window.clearInterval(visibilityPoll)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerdown', onOutsidePointerDown, true)
      window.removeEventListener('keydown', onCaptureKeyDown, true)
      window.removeEventListener('beforeinput', onBeforeInput, true)
      window.removeEventListener('keypress', onBeforeInput, true)
      window.removeEventListener('keyup', onCaptureKeyUp, true)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(noticeTimerRef.current)
      window.clearTimeout(pendingFocusReleaseRef.current)
      flushServed()
      clearHeld()
      effectBridge.onEffect = null
      coreRef.current = null
      pacerRef.current = null
      playerRef.current = null
      savesRef.current = null
      worker.core = null
      worker.player = null
      worker.saves = null
      worker.effects = null
    }
    // The pane owns one core for its lifetime; atoms are read imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Busy-state effects: the reducer asks, this performs. Calls arrive through
  // the queue installed above, so an auto-save is complete before the
  // auto-restore that follows it reads the slot.
  effectsBridge.current = async effect => {
    const core = coreRef.current
    const info = rom.get()
    const saves = savesRef.current
    if (!core || !info || !saves) return
    if (effect.type === 'auto-save') {
      await autoSaveNow('interrupt')
    }
    if (effect.type === 'auto-restore') {
      const bytes = await saves.read(info.sha256, AUTO_SLOT)
      if (!bytes) return
      try {
        core.loadState(bytes)
        core.redraw()
        core.drawTo(context2dRef.current)
      } catch (restoreError) {
        console.warn('[cartridge] could not restore the automatic slot', restoreError)
      }
    }
  }

  // --- resize ------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const rect = container.getBoundingClientRect()
      // Leave room for the bezel so the canvas never touches the edges.
      setScale(scaleFor(prefs.get().scale, Math.max(0, rect.width - 10), Math.max(0, rect.height - 10)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setScale(scaleFor(preferences.scale, Math.max(0, rect.width - 10), Math.max(0, rect.height - 10)))
  }, [preferences.scale])

  // --- commands from the palette / settings ------------------------------
  useEffect(() => {
    commands.loadFile = () => fileInputRef.current?.click()
    commands.loadSelftest = () => void loadSelftest()
    commands.saveSlot = () => void writeSlot('1')
    commands.toggleMode = () => dispatch({ type: 'mode-toggle' })
    commands.togglePlay = () => dispatch({ type: 'user-toggle-play' })
    commands.toggleMute = () => setPrefs({ audio: !prefs.get().audio })
    commands.openSaves = () => setSavesOpen(open => !open)
    commands.eject = () => void ejectCartridge()
    commands.reset = () => resetCartridge()
    return () => clearCommands()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A stop is a save point: the turn ended, the user paused, or the window went
  // away. Hold the frame here so a restart lands where play actually stopped,
  // not at the last approval.
  useEffect(() => {
    const previous = lastStatusRef.current
    lastStatusRef.current = state.status
    if (!isRunning(state)) {
      bindBatteryFlush()
      // An interrupt has its own auto-save (the reducer's effect); anything else
      // that stops the game is a save point in its own right.
      if (previous === STATUS.PLAYING && state.status !== STATUS.INTERRUPTED) {
        void autoSaveNow('stop')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  // The slot list is state, not a render-time read: nothing re-renders when a
  // save lands on disk, and the ages would freeze at whatever they were on open.
  useEffect(() => {
    if (savesOpen) void refreshSlots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savesOpen])

  // --- presentation ------------------------------------------------------
  const statusTone =
    state.status === STATUS.PLAYING ? 'playing' : state.status === STATUS.INTERRUPTED ? 'interrupted' : 'idle'

  const onDrop = event => {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (file) void loadFile(file)
  }

  const empty = currentPhase === 'empty'
  const approval = state.approval
  const showApproval = needsAttention(state) && approval

  const canvas = jsx('canvas', {
    ref: canvasRef,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    tabIndex: 0,
    onFocus: () => {
      setCanvasFocused(true)
      paneFocusRef.current = true
    },
    onBlur: event => {
      setCanvasFocused(false)
      // If the lock is held we are about to take focus back, so keep the pressed
      // keys: clearing here would swallow the very press we are handling.
      if (!paneFocusRef.current) {
        clearHeld()
        return
      }
      // Focus landing in a text field is how a user gets back to the composer,
      // by clicking it or by Tab. Decide at the END of this task instead of now:
      // the host moves focus to the composer *before* a plugin sees Enter, so an
      // immediate release would hand the game's Start key to the chat. A bound
      // keydown cancels this timer; anything else (Tab, a shortcut) lets it run.
      const target = event.relatedTarget
      if (isEditable(target) && !rootRef.current?.contains(target)) {
        window.clearTimeout(pendingFocusReleaseRef.current)
        pendingFocusReleaseRef.current = window.setTimeout(() => releaseFocus(), 0)
        return
      }
      window.setTimeout(() => {
        if (paneFocusRef.current && !isEditable(document.activeElement)) {
          canvasRef.current?.focus()
        }
      }, 0)
    },
    onClick: () => {
      void playerRef.current?.unlock()
      canvasRef.current?.focus()
    },
    className: 'rounded-[2px] outline-none',
    style: {
      width: `${SCREEN_WIDTH * scale}px`,
      height: `${SCREEN_HEIGHT * scale}px`,
      imageRendering: 'pixelated',
      display: empty ? 'none' : 'block',
      caretColor: 'transparent'
    }
  })

  const emptyState = empty
    ? jsxs('div', {
        className: 'flex h-full flex-col items-center justify-center gap-3 px-4 text-center',
        children: [
          jsx('div', {
            className: 'text-[length:var(--conversation-caption-font-size)] tracking-wide text-(--ui-text-tertiary) uppercase',
            children: 'cartridge slot'
          }),
          jsx('div', {
            className: 'text-sm text-(--ui-text-secondary)',
            children: 'Drop a .gb or .gbc here'
          }),
          jsxs('div', {
            className: 'flex flex-wrap items-center justify-center gap-2',
            children: [
              jsx('button', {
                type: 'button',
                className: 'rounded border border-(--ui-stroke-secondary) px-2 py-1 text-xs text-(--ui-text-secondary) hover:text-(--ui-text-primary)',
                onClick: () => fileInputRef.current?.click(),
                children: 'Choose file…'
              }),
              jsx('button', {
                type: 'button',
                className: 'rounded border border-(--ui-stroke-secondary) px-2 py-1 text-xs text-(--ui-text-secondary) hover:text-(--ui-text-primary)',
                onClick: () => void loadSelftest(),
                children: 'Self-test cartridge'
              })
            ]
          }),
          jsx('div', {
            className: 'max-w-[26rem] text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
            children: 'Your own cartridges, read locally. Nothing is uploaded, and Cartridge ships no games.'
          })
        ]
      })
    : null

  const errorState =
    currentPhase === 'error'
      ? jsxs('div', {
          className: 'absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center',
          // A dialog over a live game needs its own surface: the theme tokens are
          // translucent, and blurred frames behind the text made the one message
          // that matters hard to read. Fixed colours on purpose, so it reads the
          // same in a light or dark theme.
          style: { background: 'rgba(9, 11, 15, 0.94)' },
          children: [
            jsx('div', {
              className: 'text-sm',
              style: { color: 'rgba(255, 255, 255, 0.94)' },
              children: 'That cartridge did not load'
            }),
            jsx('div', {
              className: 'max-w-[26rem] text-xs',
              style: { color: 'rgba(255, 255, 255, 0.64)' },
              children: error
            }),
            jsxs('div', {
              className: 'flex flex-wrap items-center justify-center gap-2',
              children: [
                // A stale header checksum is a homebrew problem, not a broken
                // file, so the user gets the last word on it.
                refusedRef.current
                  ? jsx('button', {
                      type: 'button',
                      className: 'rounded border px-2 py-1 text-xs',
                      style: { color: 'rgba(255, 255, 255, 0.92)', borderColor: 'rgba(255, 255, 255, 0.3)' },
                      onClick: forceLoad,
                      children: 'Load anyway'
                    })
                  : null,
                jsx('button', {
                  type: 'button',
                  className: 'rounded border px-2 py-1 text-xs',
                  style: { color: 'rgba(255, 255, 255, 0.8)', borderColor: 'rgba(255, 255, 255, 0.3)' },
                  onClick: () => {
                    phase.set(current ? 'ready' : 'empty')
                    lastError.set('')
                    refusedRef.current = null
                  },
                  children: 'Dismiss'
                })
              ]
            })
          ]
        })
      : null

  const approvalCard = showApproval
    ? jsxs('div', {
        className: 'absolute inset-x-2 bottom-2 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-surface, transparent) p-2 shadow-lg backdrop-blur-sm',
        children: [
          jsxs('div', {
            className: 'flex items-center justify-between gap-2',
            children: [
              jsx('div', { className: 'text-xs font-medium', children: 'Hermes needs you' }),
              jsx('div', {
                className: 'text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
                children: 'game held'
              })
            ]
          }),
          approval.description
            ? jsx('div', {
                className: 'mt-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)',
                style: { wordBreak: 'break-word' },
                children: approval.description
              })
            : null,
          // The command is what is actually being approved, so it is shown in
          // full and scrollable. Clipping it let a user approve text they could
          // not read; showing only the description did the same. Scrolls rather
          // than truncates, and renders whenever there is a command to read.
          approval.command
            ? jsx('pre', {
                className:
                  'mt-1 max-h-36 overflow-y-auto rounded bg-black/35 p-1.5 font-mono text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)',
                style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
                tabIndex: 0,
                children: approval.command
              })
            : null,
          jsx('div', {
            className: 'mt-2 flex flex-wrap gap-1.5',
            children: (approval.choices?.length ? approval.choices : ['once', 'deny']).map(choice =>
              jsx(
                'button',
                {
                  type: 'button',
                  className: cn(
                    'rounded border border-(--ui-stroke-secondary) px-2 py-1 text-[length:var(--conversation-caption-font-size)]',
                    choice === 'deny' ? 'text-(--ui-text-tertiary)' : 'text-(--ui-text-secondary)'
                  ),
                  onClick: () => void answerApproval(choice),
                  children: CHOICE_LABELS[choice] ?? choice
                },
                choice
              )
            )
          })
        ]
      })
    : null

  const pausedHint =
    !showApproval && state.status === STATUS.IDLE && current
      ? jsx('div', {
          className: 'pointer-events-none absolute inset-x-0 bottom-1 flex justify-center',
          children: jsx('div', {
            className: 'rounded bg-(--ui-surface, transparent) px-2 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
            children: 'the agent is back in this chat'
          })
        })
      : null

  const userPausedOverlay =
    state.status === STATUS.PAUSED_BY_USER
      ? jsx('div', {
          className: 'absolute inset-0 flex items-center justify-center',
          children: jsx('button', {
            type: 'button',
            className: 'rounded-full border border-(--ui-stroke-secondary) px-3 py-1.5 text-xs text-(--ui-text-secondary) backdrop-blur-sm',
            onClick: () => dispatch({ type: 'user-toggle-play' }),
            children: '▶ resume'
          })
        })
      : null

  // --- on-screen controls (spec §11) --------------------------------------
  // Rendered as hardware, not as form controls: a cross-shaped D-pad, angled
  // magenta A/B and slanted SELECT/START on a faceplate. Pointer and keyboard
  // feed the same mask, so the deck also shows what the keys are doing.
  const HB = {
    plate: 'linear-gradient(180deg, #3b4045 0%, #23272a 100%)',
    plateEdge: '#101214',
    pad: 'linear-gradient(180deg, #3c4046 0%, #24272b 100%)',
    padDown: 'linear-gradient(180deg, #1b1e21 0%, #2c3034 100%)',
    padEdge: '#141618',
    padGlyph: '#b9bfc4',
    key: 'linear-gradient(180deg, #e0668e 0%, #b3305c 100%)',
    keyDown: 'linear-gradient(180deg, #9c2650 0%, #7f1d40 100%)',
    keyEdge: '#751a3a',
    pill: 'linear-gradient(180deg, #4c5054 0%, #2a2d30 100%)',
    pillDown: 'linear-gradient(180deg, #24272a 0%, #3a3e42 100%)',
    pillEdge: '#151719',
    print: '#8d9398'
  }

  const padHandlers = button => ({
    onPointerDown: event => {
      event.preventDefault()
      pressButton(button)
      canvasRef.current?.focus()
    },
    onPointerUp: () => releaseButton(button),
    onPointerLeave: () => releaseButton(button),
    onPointerCancel: () => releaseButton(button),
    // The deck must never hold focus: keyboard input belongs to the canvas, and
    // a focused pad button draws the browser's focus ring over the hardware
    // styling (which showed up as a blue square on the pressed key).
    onFocus: event => event.currentTarget.blur(),
    onContextMenu: event => event.preventDefault()
  })

  const pressable = (button, extra = {}) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': BUTTON_LABELS[button],
    'aria-pressed': Boolean(pressed[button]),
    title: `${BUTTON_LABELS[button]} — ${labelForCode(preferences.bindings[button])}`,
    ...padHandlers(button),
    ...extra
  })

  const padStyle = (button, pos) => ({
    position: 'absolute',
    ...pos,
    width: '22px',
    height: '22px',
    padding: 0,
    borderRadius: '4px',
    outline: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
    border: `1px solid ${HB.padEdge}`,
    background: pressed[button] ? HB.padDown : HB.pad,
    color: HB.padGlyph,
    fontSize: '8px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: pressed[button] ? 'translateY(1px)' : 'none',
    boxShadow: pressed[button]
      ? 'inset 0 2px 5px rgba(0,0,0,0.65)'
      : 'inset 0 1px 0 rgba(255,255,255,0.14), 0 1px 2px rgba(0,0,0,0.55)',
    transition: 'background 50ms linear, transform 50ms linear'
  })

  const padKey = (button, pos, glyph) =>
    jsx('div', pressable(button, { style: padStyle(button, pos), children: glyph }), button)

  const dPad = jsxs('div', {
    className: 'relative shrink-0',
    style: { width: '66px', height: '66px' },
    children: [
      jsx('div', {
        style: {
          position: 'absolute',
          top: '22px',
          left: '22px',
          width: '22px',
          height: '22px',
          background: HB.pad,
          borderTop: `1px solid ${HB.padEdge}`,
          borderLeft: `1px solid ${HB.padEdge}`
        }
      }),
      padKey('UP', { top: 0, left: 22 }, '\u2191'),
      padKey('LEFT', { top: 22, left: 0 }, '\u2190'),
      padKey('RIGHT', { top: 22, left: 44 }, '\u2192'),
      padKey('DOWN', { top: 44, left: 22 }, '\u2193')
    ]
  })

  const keyStyle = button => ({
    width: '30px',
    height: '30px',
    padding: 0,
    borderRadius: '50%',
    outline: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
    border: `1px solid ${HB.keyEdge}`,
    background: pressed[button] ? HB.keyDown : HB.key,
    color: '#fff6f9',
    fontSize: '10px',
    fontWeight: 700,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: pressed[button] ? 'translateY(1px)' : 'none',
    boxShadow: pressed[button]
      ? 'inset 0 3px 6px rgba(0,0,0,0.5)'
      : 'inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 3px rgba(0,0,0,0.55)',
    transition: 'background 50ms linear, transform 50ms linear'
  })

  const pillStyle = button => ({
    width: '30px',
    height: '9px',
    padding: 0,
    borderRadius: '5px',
    outline: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
    border: `1px solid ${HB.pillEdge}`,
    background: pressed[button] ? HB.pillDown : HB.pill,
    transform: pressed[button] ? 'translateY(1px)' : 'none',
    boxShadow: pressed[button]
      ? 'inset 0 2px 4px rgba(0,0,0,0.6)'
      : 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.5)',
    transition: 'background 50ms linear, transform 50ms linear'
  })

  // Straight, like the hardware when you look at it head-on: no tilt.
  const selectStart = jsxs('div', {
    className: 'flex items-start gap-2',
    children: ['SELECT', 'START'].map(button =>
      jsxs(
        'div',
        {
          className: 'flex flex-col items-center',
          style: { gap: '3px' },
          children: [
            jsx('div', pressable(button, { style: pillStyle(button) }), button),
            jsx('span', {
              style: { color: HB.print, fontSize: '6px', letterSpacing: '0.08em' },
              children: button
            })
          ]
        },
        button
      )
    )
  })

  const abGroup = jsxs('div', {
    className: 'flex items-end gap-2',
    // The DMG offsets A above B at an angle; the letters themselves stay upright.
    style: { transform: 'rotate(-24deg)' },
    children: [
      jsx(
        'div',
        pressable('B', {
          style: { ...keyStyle('B'), marginTop: '12px' },
          children: jsx('span', { style: { display: 'block', transform: 'rotate(24deg)' }, children: 'B' })
        }),
        'B'
      ),
      jsx(
        'div',
        pressable('A', {
          style: keyStyle('A'),
          children: jsx('span', { style: { display: 'block', transform: 'rotate(24deg)' }, children: 'A' })
        }),
        'A'
      )
    ]
  })

  const arrowGlyph = code => (String(code).startsWith('Arrow') ? '↑↓←→' : labelForCode(code))

  const legend = [
    `D-pad = ${arrowGlyph(preferences.bindings.UP)}`,
    `A = ${labelForCode(preferences.bindings.A)}`,
    `B = ${labelForCode(preferences.bindings.B)}`,
    `Start = ${labelForCode(preferences.bindings.START)}`,
    `Select = ${labelForCode(preferences.bindings.SELECT)}`
  ].join('  ·  ')

  const controlDeck = jsxs('div', {
    className: 'mx-2 mt-1 rounded-lg px-3 py-2',
    style: {
      background: HB.plate,
      border: `1px solid ${HB.plateEdge}`,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 1px 2px rgba(0,0,0,0.45)'
    },
    children: [
      jsxs('div', {
        className: 'flex items-center justify-between gap-3',
        children: [dPad, selectStart, abGroup]
      }),
      jsx('div', {
        className: 'mt-1.5 text-center text-[length:var(--conversation-caption-font-size)] leading-tight',
        style: { color: HB.print },
        title: 'Keyboard bindings — rebind in Settings → Plugins → Cartridge → Controls',
        children: legend
      })
    ]
  })

  const focusHint =
    !empty && !canvasFocused
      ? jsx('div', {
          className: 'pointer-events-none absolute inset-x-0 top-1 flex justify-center',
          children: jsx('div', {
            className: 'rounded bg-(--ui-surface, transparent) px-2 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
            children: 'click the game to use the keyboard'
          })
        })
      : null

  const savePanel = savesOpen
    ? jsxs('div', {
        className: 'absolute inset-x-2 top-2 z-10 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-surface, transparent) p-2 shadow-lg',
        children: [
          jsxs('div', {
            className: 'mb-1 flex items-center justify-between text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
            children: [
              jsx('span', { children: 'save states' }),
              jsx('span', {
                title: 'Written when the game stops and every 30 seconds while it runs',
                children: slotInfo[AUTO_SLOT]
                  ? `auto · ${formatAgo(slotInfo[AUTO_SLOT].at)}`
                  : 'auto · not written yet'
              })
            ]
          }),
          ...SLOTS.map(slot => {
            const meta = slotInfo[slot]
            return jsxs(
              'div',
              {
                className: 'flex items-center justify-between gap-2 py-0.5',
                children: [
                  jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: `slot ${slot}` }),
                  jsx('span', {
                    className: 'flex-1 truncate pl-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
                    children: meta ? `${formatAgo(meta.at)} · ${formatBytes(meta.size)}` : 'empty'
                  }),
                  jsxs('span', {
                    className: 'flex gap-1',
                    children: [
                      jsx('button', {
                        type: 'button',
                        className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)',
                        onClick: () => void writeSlot(slot),
                        children: 'save'
                      }),
                      jsx('button', {
                        type: 'button',
                        disabled: !meta,
                        className:
                          'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)',
                        style: { opacity: meta ? 1 : 0.45 },
                        onClick: () => void readSlot(slot),
                        children: 'load'
                      })
                    ]
                  })
                ]
              },
              slot
            )
          }),
          jsxs('div', {
            className: 'mt-1.5 flex items-center justify-between gap-2 border-t border-(--ui-stroke-secondary) pt-1',
            children: [
              jsx('span', {
                className: 'text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
                children: 'auto save on every stop, and every 30 s'
              }),
              jsxs('span', {
                className: 'flex gap-1',
                children: [
                  jsx('button', {
                    type: 'button',
                    className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)',
                    onClick: resetCartridge,
                    title: 'Power-cycle the cartridge, keeping its battery save',
                    children: 'reset'
                  }),
                  jsx('button', {
                    type: 'button',
                    className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)',
                    onClick: () => void ejectCartridge(),
                    title: 'Remove the cartridge',
                    children: 'eject'
                  })
                ]
              })
            ]
          })
        ]
      })
    : null

  return jsxs('div', {
    ref: rootRef,
    className: 'flex h-full min-h-0 flex-col text-(--ui-text-primary)',
    tabIndex: 0,
    onPointerDown: () => {
      // Clicking anywhere in the pane claims the keyboard for the game.
      paneFocusRef.current = true
      if (phase.get() !== 'empty') canvasRef.current?.focus()
    },
    onFocus: () => {
      paneFocusRef.current = true
    },
    onBlur: event => {
      // The lock is released by a click outside the pane, or by a deliberate
      // move into a text field — deferred, so a bound key can still veto it.
      if (event.currentTarget.contains(event.relatedTarget)) return
      setCanvasFocused(false)
      if (!paneFocusRef.current) {
        clearHeld()
        return
      }
      if (isEditable(event.relatedTarget)) {
        window.clearTimeout(pendingFocusReleaseRef.current)
        pendingFocusReleaseRef.current = window.setTimeout(() => releaseFocus(), 0)
      }
    },
    onDragOver: event => event.preventDefault(),
    onDrop,
    children: [
      jsxs('div', {
        className: 'flex items-center justify-between gap-2 px-2 py-1',
        children: [
          jsxs('div', {
            className: 'flex min-w-0 items-center gap-1.5',
            children: [
              jsx(StatusDot, { tone: statusTone }),
              jsx('span', {
                className: 'truncate text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)',
                children: current ? displayName(current.name) : 'no cartridge'
              }),
              current?.isGBC
                ? jsx('span', {
                    className: 'rounded-sm border border-(--ui-stroke-secondary) px-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
                    children: 'COLOUR'
                  })
                : null
            ]
          }),
          jsxs('div', {
            className: 'flex items-center gap-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
            children: [
              jsx('span', { children: statusLabel(state) }),
              jsx('span', { children: formatServed(servedToday.ms) })
            ]
          })
        ]
      }),

      jsxs('div', {
        ref: containerRef,
        className: 'relative m-1 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-(--ui-stroke-secondary)',
        onClick: () => canvasRef.current?.focus(),
        children: [canvas, emptyState, errorState, userPausedOverlay, pausedHint, focusHint, approvalCard, savePanel]
      }),

      controlDeck,

      jsxs('div', {
        className: 'flex flex-wrap items-center gap-1.5 px-2 pb-1.5',
        children: [
          jsx('button', {
            type: 'button',
            className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)',
            onClick: () => dispatch({ type: 'mode-toggle' }),
            title:
              state.mode === MODE_ALWAYS
                ? 'Always-on: the game keeps playing through turns and approvals'
                : 'Interrupted: play during a turn, pause for approvals',
            children: state.mode === MODE_ALWAYS ? 'always on' : 'interrupted'
          }),
          jsx('button', {
            type: 'button',
            className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)',
            onClick: () => void writeSlot('1'),
            title: 'Save to slot 1',
            children: 'save'
          }),
          jsx('button', {
            type: 'button',
            className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)',
            onClick: () => setSavesOpen(open => !open),
            title: 'All save slots',
            children: 'saves'
          }),
          jsx('button', {
            type: 'button',
            className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)',
            onClick: () => setPrefs({ audio: !preferences.audio }),
            title: preferences.audio ? 'Mute' : 'Unmute',
            children: preferences.audio ? 'audio on' : 'muted'
          }),
          jsx('span', { className: 'flex-1' }),
          jsx('button', {
            type: 'button',
            className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)',
            onClick: () => fileInputRef.current?.click(),
            children: 'open…'
          }),
          notice
            ? jsx('span', {
                className: 'w-full truncate pt-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
                children: notice
              })
            : null
        ]
      }),

      jsx('input', {
        ref: fileInputRef,
        type: 'file',
        accept: '.gb,.gbc',
        style: { display: 'none' },
        onChange: event => {
          const file = event.target.files?.[0]
          if (file) void loadFile(file)
          event.target.value = ''
        }
      })
    ]
  })
}
