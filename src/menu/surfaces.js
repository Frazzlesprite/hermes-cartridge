/**
 * The surfaces outside the pane: the status-bar chip, the Settings page and the
 * palette commands (spec §14). All of them read the same atoms as the pane, so
 * the chip's number and the pane's number can never disagree.
 */
import {
  host,
  useValue,
  cn,
  ToggleRow,
  ListRow,
  SegmentedControl,
  PALETTE_AREA,
  STATUSBAR_AREAS
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useRef, useState } from 'react'

import { busy, rom, served, prefs, setPrefs, formatServed, dispatch, worker } from '../state/store.js'
import { STATUS, MODE_ALWAYS } from '../state/reducer.js'
import { BUTTON_ORDER, BUTTON_LABELS, labelForCode, conflictFor } from '../input/keymap.js'
import { PALETTES } from '../core/adapter.js'
import { displayName, formatBytes } from '../roms/roms.js'
import { runCommand, commands } from '../pane/commands.js'

const MODE_OPTIONS = [
  { id: 'interrupted', label: 'Interrupted' },
  { id: 'always', label: 'Always on' }
]

const SCALE_OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: '2x', label: '2×' },
  { id: '3x', label: '3×' },
  { id: '4x', label: '4×' }
]

export function modeLabel(mode) {
  return mode === MODE_ALWAYS ? 'always' : 'interrupted'
}

function toneFor(status) {
  if (status === STATUS.PLAYING) return 'text-(--ui-accent)'
  if (status === STATUS.INTERRUPTED) return 'text-(--ui-text-secondary)'
  return 'text-(--ui-text-quaternary)'
}

function glyphFor(state) {
  if (state.status === STATUS.INTERRUPTED) return '❚❚'
  if (state.status === STATUS.PLAYING) return '▶'
  if (state.status === STATUS.PAUSED_BY_USER) return '❚❚'
  return '◼'
}

/** Status-bar chip: mode glyph + time served today (spec §14). */
export function StatusChip() {
  const state = useValue(busy)
  const today = useValue(served)
  const cartridge = useValue(rom)

  const title = cartridge
    ? `${displayName(cartridge.name)} · ${modeLabel(state.mode)} · ${formatServed(today.ms)} played while the agent worked today`
    : `Cartridge · ${modeLabel(state.mode)} · ${formatServed(today.ms)} played while the agent worked today`

  return jsxs('button', {
    type: 'button',
    title,
    className: cn(
      'inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem]',
      toneFor(state.status),
      'hover:underline'
    ),
    onClick: () => {
      // The chip is a remote control: it pauses/resumes without stealing focus
      // from the composer.
      dispatch({ type: 'user-toggle-play' })
    },
    children: [
      jsx('span', { 'aria-hidden': true, children: glyphFor(state) }),
      jsx('span', { children: formatServed(today.ms) })
    ]
  })
}

function BindingRow({ button }) {
  const preferences = useValue(prefs)
  const [listening, setListening] = useState(false)
  const [warning, setWarning] = useState('')
  const cleanupRef = useRef(null)

  const start = () => {
    setListening(true)
    setWarning('')
    const onKey = event => {
      event.preventDefault()
      event.stopPropagation()
      if (event.code === 'Escape') {
        setListening(false)
        cleanup()
        return
      }
      const clash = conflictFor(preferences.bindings, event.code, button)
      if (clash) {
        setWarning(`${labelForCode(event.code)} is already ${BUTTON_LABELS[clash]}`)
        setListening(false)
        cleanup()
        return
      }
      setPrefs({ bindings: { ...preferences.bindings, [button]: event.code } })
      setListening(false)
      cleanup()
    }
    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true)
      cleanupRef.current = null
    }
    cleanupRef.current = cleanup
    window.addEventListener('keydown', onKey, true)
  }

  return jsx(ListRow, {
    title: BUTTON_LABELS[button],
    description: warning || (listening ? 'press a key, Escape to cancel' : undefined),
    action: jsx('button', {
      type: 'button',
      className: 'rounded border border-(--ui-stroke-secondary) px-2 py-0.5 text-xs text-(--ui-text-secondary)',
      onClick: start,
      children: listening ? 'listening…' : labelForCode(preferences.bindings[button])
    })
  })
}

function GeneralSettings() {
  const preferences = useValue(prefs)
  return jsxs('div', {
    children: [
      jsx(ListRow, {
        title: 'Default mode',
        description:
          'Interrupted plays only during a turn and pauses the instant an approval arrives. Always on keeps playing through both.',
        action: jsx(SegmentedControl, {
          value: preferences.mode,
          options: MODE_OPTIONS,
          onChange: value => setPrefs({ mode: value })
        })
      }),
      jsx(ToggleRow, {
        label: 'Audio',
        description: 'Starts on your first click in the pane. Muting keeps the core running silently.',
        checked: preferences.audio,
        onChange: value => setPrefs({ audio: value })
      }),
      jsx(ListRow, {
        title: 'Palette',
        description: 'Monochrome cartridges only. Colour cartridges always use their own colours.',
        action: jsx(SegmentedControl, {
          value: preferences.palette,
          options: [
            { id: 'pocket', label: 'Pocket' },
            { id: 'grey', label: 'Grey' },
            { id: 'green', label: 'Green' }
          ],
          onChange: value => setPrefs({ palette: value })
        })
      }),
      jsx(ListRow, {
        title: 'Scale',
        description: 'Integer scaling only — no blurry pixels. Auto fits the pane.',
        action: jsx(SegmentedControl, {
          value: preferences.scale,
          options: SCALE_OPTIONS,
          onChange: value => setPrefs({ scale: value })
        })
      }),
      jsx(ToggleRow, {
        label: 'Remember the last cartridge',
        description:
          'Stores the ROM in the plugin’s own data folder so the pane reopens with it. Off by default; forgetting it deletes the copy.',
        checked: preferences.rememberRom,
        onChange: value => setPrefs({ rememberRom: value })
      })
    ]
  })
}

function CartridgeSettings() {
  const cartridge = useValue(rom)
  const preferences = useValue(prefs)
  const [message, setMessage] = useState('')

  const forget = async () => {
    const saved = worker.ctx?.storage.get('rom.remembered', null)
    if (!saved) {
      setMessage('No stored cartridge to forget.')
      return
    }
    await worker.saves?.forgetRom(saved)
    setMessage('Stored cartridge deleted.')
  }

  return jsxs('div', {
    children: [
      jsx(ListRow, {
        title: 'Loaded cartridge',
        description: cartridge
          ? `${displayName(cartridge.name)} · ${cartridge.isGBC ? 'Colour' : 'Mono'} · ${formatBytes(cartridge.size)} · ${cartridge.mapper}`
          : 'Nothing loaded. Drop a .gb or .gbc into the pane.',
        action: jsx('button', {
          type: 'button',
          className: 'rounded border border-(--ui-stroke-secondary) px-2 py-0.5 text-xs text-(--ui-text-secondary)',
          onClick: () => {
            if (!runCommand('loadFile')) setMessage('Open the Cartridge pane first.')
          },
          children: 'Open…'
        })
      }),
      jsx(ListRow, {
        title: 'Fingerprint',
        description: cartridge?.sha256 ?? 'SHA-256 of the cartridge bytes; save slots key off it.'
      }),
      jsx(ListRow, {
        title: 'Stored cartridge',
        description: message || 'ROMs are never uploaded. Cartridge makes no network calls.',
        action: jsx('button', {
          type: 'button',
          className: 'rounded border border-(--ui-stroke-secondary) px-2 py-0.5 text-xs text-(--ui-text-secondary)',
          onClick: () => void forget(),
          children: 'Forget'
        })
      }),
      jsx(ListRow, {
        title: 'Core',
        description: `jsGBC-core (MIT) · ${worker.core?.coreVersion?.() ?? 'jsgbc-core@0.7.0+0d2c721'}`,
        action: jsx('span', {
          className: 'text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)',
          children: preferences.audio ? 'audio on' : 'muted'
        })
      })
    ]
  })
}

function KeysSettings() {
  return jsx('div', {
    children: BUTTON_ORDER.map(button => jsx(BindingRow, { button }, button))
  })
}

export function registerSettings(ctx) {
  const colours = Object.keys(PALETTES).join(', ')
  ctx.registerSettingsPage?.({
    id: 'cartridge',
    title: 'Cartridge',
    icon: 'device-gamepad',
    order: 40,
    render: () => jsx(GeneralSettings, {}),
    children: [
      { id: 'cartridge', title: 'Cartridge', render: () => jsx(CartridgeSettings, {}) },
      { id: 'keys', title: 'Controls', render: () => jsx(KeysSettings, {}) },
      {
        id: 'about',
        title: 'About',
        render: () =>
          jsxs('div', {
            children: [
              jsx(ListRow, {
                title: 'Cartridge 0.1.0',
                description:
                  'A handheld ROM pane that plays while the agent works and holds the frame when it needs you.'
              }),
              jsx(ListRow, {
                title: 'No ROMs, no network',
                description:
                  'Ships no games and no commercial ROMs. One WTFPL self-test cartridge is included. The pane never makes an outbound call.',
                action: jsx('button', {
                  type: 'button',
                  className: 'rounded border border-(--ui-stroke-secondary) px-2 py-0.5 text-xs text-(--ui-text-secondary)',
                  onClick: () => void runCommand('loadSelftest'),
                  children: 'Run self-test'
                })
              }),
              jsx(ListRow, { title: 'Palettes', description: colours }),
              jsx(ListRow, {
                title: 'Licences',
                description: 'Plugin MIT · jsGBC-core MIT (ardean) · self-test ROM WTFPL (flozz)'
              })
            ]
          })
      }
    ]
  })
}

function paletteCommand(id, label, keywords, run) {
  return {
    id: `cartridge.${id}`,
    area: PALETTE_AREA,
    data: { id: `cartridge.${id}`, label, keywords: ['cartridge', 'handheld', 'rom', ...keywords], run }
  }
}

const NOT_OPEN = 'Open the Cartridge pane first (it lives on the right).'

export function registerPalette(ctx) {
  ctx.registerMany([
    paletteCommand('open', 'Cartridge: Open a ROM…', ['rom', 'gb', 'gbc', 'load'], () => {
      if (!runCommand('loadFile')) host.notify({ kind: 'info', message: NOT_OPEN })
    }),
    paletteCommand('selftest', 'Cartridge: Load self-test cartridge', ['rom', 'test'], () => {
      if (!runCommand('loadSelftest')) host.notify({ kind: 'info', message: NOT_OPEN })
    }),
    paletteCommand('mode', 'Cartridge: Toggle always-on mode', ['mode', 'pause', 'interrupt'], () => {
      if (!runCommand('toggleMode')) dispatch({ type: 'mode-toggle' })
      host.notify({ kind: 'info', message: `Cartridge is ${modeLabel(busy.get().mode)}.` })
    }),
    paletteCommand('play', 'Cartridge: Pause or resume', ['pause', 'resume', 'play'], () => {
      if (!runCommand('togglePlay')) dispatch({ type: 'user-toggle-play' })
    }),
    paletteCommand('mute', 'Cartridge: Mute or unmute', ['audio', 'mute', 'sound'], () => {
      if (!runCommand('toggleMute')) setPrefs({ audio: !prefs.get().audio })
      host.notify({ kind: 'info', message: prefs.get().audio ? 'Cartridge audio on.' : 'Cartridge muted.' })
    }),
    paletteCommand('save', 'Cartridge: Save state to slot 1', ['save', 'state'], () => {
      if (!runCommand('saveSlot')) host.notify({ kind: 'info', message: NOT_OPEN })
    })
  ])
}

export function registerStatusChip(ctx) {
  ctx.register({
    id: 'chip',
    area: STATUSBAR_AREAS.right,
    order: 120,
    render: () => jsx(StatusChip, {})
  })
}
