/**
 * Keyboard mapping (spec §11). Pure: given a bindings map and a KeyboardEvent
 * code, answer "which button?". The pane owns focus and preventDefault; this
 * module never touches the DOM.
 */
import { BUTTON } from '../core/adapter.js'

export const DEFAULT_BINDINGS = {
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  // Letters cannot be used: the host appends printable keys to the composer
  // before any plugin listener runs, so Z/X would type into the prompt. F-keys
  // are inert and verified clean.
  A: 'F1',
  B: 'F2',
  START: 'Enter',
  SELECT: 'ShiftLeft'
}

export const BUTTON_ORDER = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'START', 'SELECT']

export const BUTTON_LABELS = {
  UP: 'Up',
  DOWN: 'Down',
  LEFT: 'Left',
  RIGHT: 'Right',
  A: 'A',
  B: 'B',
  START: 'Start',
  SELECT: 'Select'
}

/**
 * Codes that scroll the composer or the window. Only swallowed while the pane
 * itself has focus, or the chat input stops working (spec §2.6).
 */
const SWALLOWED = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Enter',
  'ShiftLeft',
  'ShiftRight'
])

export function shouldPreventDefault(code) {
  return SWALLOWED.has(code)
}

/** `ShiftLeft` in the map also answers to the right shift key. */
function codesFor(binding) {
  if (binding === 'ShiftLeft') return ['ShiftLeft', 'ShiftRight']
  return [binding]
}

export function buttonForCode(bindings, code) {
  for (const button of BUTTON_ORDER) {
    if (codesFor(bindings[button]).includes(code)) return button
  }
  return null
}

export function maskForCode(bindings, code) {
  const button = buttonForCode(bindings, code)
  return button ? BUTTON[button] : 0
}

/** Human label for a KeyboardEvent code, for the rebinding UI. */
export function labelForCode(code) {
  if (!code) return '—'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift'
  if (code === 'Space') return 'Space'
  if (code.startsWith('Arrow')) return code.slice(5)
  return code
}

/** Reject a rebind that would make two buttons answer to one key. */
export function conflictFor(bindings, code, ignoreButton) {
  for (const button of BUTTON_ORDER) {
    if (button === ignoreButton) continue
    if (codesFor(bindings[button]).includes(code)) return button
  }
  return null
}
