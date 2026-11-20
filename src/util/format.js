/**
 * Human formatting shared by the pane, the chip and the settings page.
 *
 * Pure: no DOM, no atoms, no imports. That is deliberate — it lets the tests
 * check the strings a user actually reads without mounting a renderer.
 */

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

/**
 * "when was this save written", for the slot list.
 *
 * Floors rather than rounds so a slot never claims to be an hour old at 59m40s,
 * and returns 'empty' rather than a dash when there is no timestamp: the slot
 * list uses this as its whole state.
 */
export function formatAgo(at, now = Date.now()) {
  const when = Number(at)
  if (!Number.isFinite(when) || when <= 0) return 'empty'
  const seconds = Math.max(0, Math.floor((now - when) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
