/**
 * Is the pane actually on screen?
 *
 * A Hermes pane is kept MOUNTED when it stops being visible: an inactive tab in
 * a stack, a minimised zone and a collapsed side are all hidden with CSS, not
 * unmounted, and they keep their layout box. `document.visibilityState` only
 * covers the whole window, so it cannot answer this — and the frame loop must
 * not keep running for a pane nobody can see.
 *
 * Three independent signals, each optional because an older host (or a test
 * run with no DOM) may not supply it:
 *
 *   documentHidden  the OS window is in the background
 *   cssVisible      `checkVisibility()` says the layer is rendered
 *   intersecting    the pane still intersects the viewport
 *
 * All three must say yes. Pure, so the truth table is unit-tested rather than
 * discovered in the app.
 */
export function computePaneVisible(signals = {}) {
  const { documentHidden = false, cssVisible = true, intersecting = true } = signals
  return !documentHidden && cssVisible && intersecting
}
