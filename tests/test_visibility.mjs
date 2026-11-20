// Frame pacing must stop for a pane nobody can see. The host keeps hidden
// panes MOUNTED (an inactive tab, a minimised zone), and document.visibilityState
// only knows about the whole window, so the decision is a pure AND of the three
// signals the pane can actually observe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePaneVisible } from '../src/pane/visibility.js'

const yes = { documentHidden: false, cssVisible: true, intersecting: true }

test('a pane that is visible by every signal runs', () => {
  assert.equal(computePaneVisible(yes), true)
})

test('the whole window in the background stops the loop', () => {
  assert.equal(computePaneVisible({ ...yes, documentHidden: true }), false)
})

test('an inactive tab or collapsed zone stops the loop', () => {
  assert.equal(computePaneVisible({ ...yes, cssVisible: false }), false)
})

test('a pane scrolled out of the viewport stops the loop', () => {
  assert.equal(computePaneVisible({ ...yes, intersecting: false }), false)
})

test('missing signals default to visible, never to a frozen pane', () => {
  // Older hosts have no checkVisibility(), and the test environment has no
  // IntersectionObserver. Absence of evidence is not evidence of absence.
  assert.equal(computePaneVisible({}), true)
  assert.equal(computePaneVisible(), true)
  assert.equal(computePaneVisible({ cssVisible: undefined, intersecting: undefined }), true)
})
