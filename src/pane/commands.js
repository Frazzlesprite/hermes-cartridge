/**
 * Command bus between the palette/settings surfaces and the live pane.
 * The pane registers handlers on mount and clears them on unmount, so a palette
 * command fired with no pane open can say so instead of failing silently.
 */
export const commands = {
  loadFile: null,
  loadSelftest: null,
  saveSlot: null,
  toggleMode: null,
  togglePlay: null,
  toggleMute: null,
  openSaves: null
}

export function runCommand(name) {
  const fn = commands[name]
  if (typeof fn !== 'function') return false
  fn()
  return true
}

export function clearCommands() {
  for (const key of Object.keys(commands)) commands[key] = null
}
