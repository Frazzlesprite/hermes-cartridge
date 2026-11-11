import { host, useValue, cn } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useRef, useState } from 'react'

import { createCore, SCREEN_WIDTH, SCREEN_HEIGHT, BUTTON } from '../core/adapter.js'
import { createPacer, FRAME_MS } from './loop.js'
import { commands } from './commands.js'
import { createAudioPlayer } from '../audio/player.js'
import { createSaveStore } from '../saves/saves.js'
import { buttonForCode, BUTTON_LABELS, labelForCode } from '../input/keymap.js'
import { readRomFile, selftestRom, displayName } from '../roms/roms.js'
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
import { STATUS, MODE_ALWAYS, MODE_INTERRUPTED, isRunning, needsAttention } from '../state/reducer.js'

const AUTO_SLOT = 'auto'
const SLOTS = ['1', '2', '3', '4']

const CHOICE_LABELS = {
  once: 'Allow once',
  session: 'Allow for session',
  always: 'Always allow',
  deny: 'Deny'
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
  const [scale, setScale] = useState(3)
  const [savesOpen, setSavesOpen] = useState(false)
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

  // --- loading -----------------------------------------------------------
  const bootRom = async (bytes, name) => {
    const core = coreRef.current
    const saves = savesRef.current
    if (!core) return
    phase.set('loading')
    lastError.set('')
    try {
      const info = await core.loadRom(bytes)
      const loaded = {
        ...info,
        name: name ?? info.title ?? 'cartridge',
        size: bytes.length,
        title: info.title || name || 'cartridge'
      }
      rom.set(loaded)
      core.setPalette(prefs.get().palette)
      playerRef.current?.setSampleRate(core.audioSampleRate?.() ?? 44100)

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
    }
  }

  const loadFile = async file => {
    try {
      const { bytes, name } = await readRomFile(file)
      await bootRom(bytes, name)
    } catch (readError) {
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
      dispatch({ type: 'approval-cleared' })
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
    player.setEnabled(prefs.get().audio)

    worker.core = core
    worker.player = player
    worker.saves = saves
    worker.effects = effectBridge
    effectBridge.onEffect = effect => void effectsBridge.current?.(effect)
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
          const before = busy.get()
          dispatch({ type: 'tick', ms: whole })
          // Time served means "played while the agent worked" (spec §13.3), so
          // it only accrues during a turn, never in always-on idling.
          if (before.turnBusy) addServed(whole)
        }
      },
      shouldRun: () => isRunning(busy.get()) && Boolean(rom.get())
    })
    pacerRef.current = pacer
    pacer.start()

    // A window blur must release every held key, or the D-pad sticks.
    const onBlur = () => clearHeld()
    const onVisibility = () => {
      dispatch({ type: 'pane-hidden', value: document.visibilityState !== 'visible' })
    }

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
      if (!button) return
      event.preventDefault()
      event.stopPropagation()
      // The app registers its own key handling before a plugin can, so on Enter
      // it has already moved focus to the composer by the time this runs. Take
      // the focus back: a key pressed while the game had focus belongs to the
      // game.
      window.setTimeout(() => {
        if (phase.get() !== 'empty') canvasRef.current?.focus()
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
      const target = event.target
      const editable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable === true)
      if (!editable) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onOutsidePointerDown = event => {
      const root = rootRef.current
      if (!root || root.contains(event.target)) return
      paneFocusRef.current = false
      setCanvasFocused(false)
      clearHeld()
    }

    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerdown', onOutsidePointerDown, true)
    window.addEventListener('keydown', onCaptureKeyDown, true)
    window.addEventListener('beforeinput', onBeforeInput, true)
    window.addEventListener('keypress', onBeforeInput, true)
    window.addEventListener('keyup', onCaptureKeyUp, true)
    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()

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
      pacer.stop()
      player.dispose()
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', onCaptureKeyDown, true)
      window.removeEventListener('beforeinput', onBeforeInput, true)
      window.removeEventListener('keypress', onBeforeInput, true)
      window.removeEventListener('keyup', onCaptureKeyUp, true)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(noticeTimerRef.current)
      flushServed()
      clearHeld()
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

  // Busy-state effects: the reducer asks, this performs.
  effectsBridge.current = async effect => {
    const core = coreRef.current
    const info = rom.get()
    const saves = savesRef.current
    if (!core || !info || !saves) return
    if (effect.type === 'auto-save') {
      const ok = await saves.write(info.sha256, AUTO_SLOT, core.saveState())
      if (ok) flash('Paused for the agent — frame held')
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
    return () => {
      for (const key of Object.keys(commands)) commands[key] = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bindBatteryFlush = () => {
    const core = coreRef.current
    const info = rom.get()
    const saves = savesRef.current
    if (!core || !info?.hasBattery || !saves) return
    const battery = core.batterySave()
    if (battery) void saves.write(info.sha256, 'battery', battery)
  }

  useEffect(() => {
    if (isRunning(state)) return
    bindBatteryFlush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  // --- presentation ------------------------------------------------------
  const statusTone =
    state.status === STATUS.PLAYING ? 'playing' : state.status === STATUS.INTERRUPTED ? 'interrupted' : 'idle'
  const statusLabel =
    state.status === STATUS.PLAYING
      ? 'playing'
      : state.status === STATUS.INTERRUPTED
        ? 'paused · approval'
        : state.status === STATUS.PAUSED_BY_USER
          ? 'paused'
          : 'standby'

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
      if (!paneFocusRef.current) clearHeld()
      if (paneFocusRef.current) {
        window.setTimeout(() => {
          if (paneFocusRef.current) canvasRef.current?.focus()
        }, 0)
      }
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
          className: 'flex h-full flex-col items-center justify-center gap-2 px-4 text-center',
          children: [
            jsx('div', { className: 'text-sm text-(--ui-text-secondary)', children: 'That cartridge did not load' }),
            jsx('div', { className: 'max-w-[26rem] text-xs text-(--ui-text-tertiary)', children: error }),
            jsx('button', {
              type: 'button',
              className: 'rounded border border-(--ui-stroke-secondary) px-2 py-1 text-xs text-(--ui-text-secondary)',
              onClick: () => {
                phase.set(current ? 'ready' : 'empty')
                lastError.set('')
              },
              children: 'Dismiss'
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
            children: 'the agent is back'
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

  const savePanel = savesOpen    ? jsxs('div', {
        className: 'absolute inset-x-2 top-2 z-10 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-surface, transparent) p-2 shadow-lg',
        children: [
          jsx('div', {
            className: 'mb-1 flex items-center justify-between text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
            children: jsx('span', { children: 'save states' })
          }),
          ...SLOTS.map(slot =>
            jsxs(
              'div',
              {
                className: 'flex items-center justify-between gap-2 py-0.5',
                children: [
                  jsx('span', { className: 'text-xs text-(--ui-text-tertiary)', children: `slot ${slot}` }),
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
                        className: 'rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)',
                        onClick: () => void readSlot(slot),
                        children: 'load'
                      })
                    ]
                  })
                ]
              },
              slot
            )
          ),
          jsx('div', {
            className: 'mt-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
            children: 'an automatic slot is written when the agent interrupts'
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
      // The lock is released by a click outside the pane, never by focus drift.
      if (event.currentTarget.contains(event.relatedTarget)) return
      setCanvasFocused(false)
      if (!paneFocusRef.current) clearHeld()
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
              jsx('span', { children: statusLabel }),
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
