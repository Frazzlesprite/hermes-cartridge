// Every transition in spec §13, including the nasty ones: an approval that
// arrives mid-turn, a mode flip mid-turn, and a pane that hides while busy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  reduce,
  createState,
  isRunning,
  needsAttention,
  STATUS,
  MODE_ALWAYS,
  MODE_INTERRUPTED
} from '../src/state/reducer.js'

const run = (state, ...actions) => {
  let current = state
  const effects = []
  for (const action of actions) {
    const result = reduce(current, action)
    current = result.state
    effects.push(...result.effects)
  }
  return { state: current, effects }
}

test('idle until a turn starts', () => {
  const s = createState()
  assert.equal(s.status, STATUS.IDLE)
  assert.equal(isRunning(s), false)
})

test('plays during a turn in interrupted mode', () => {
  const { state } = run(createState(), { type: 'turn-busy', value: true })
  assert.equal(state.status, STATUS.PLAYING)
  assert.equal(isRunning(state), true)
})

test('stops when the agent comes back, and does not reset', () => {
  const { state } = run(
    createState(),
    { type: 'turn-busy', value: true },
    { type: 'tick', ms: 5000 },
    { type: 'turn-busy', value: false }
  )
  assert.equal(state.status, STATUS.IDLE)
  assert.equal(isRunning(state), false)
  assert.equal(state.timeServedMs, 5000, 'time served survives the pause')
})

test('an approval pauses immediately and asks for an auto-save', () => {
  const { state, effects } = run(
    createState(),
    { type: 'turn-busy', value: true },
    { type: 'approval', value: true, approval: { prompt_id: 'p1', command: 'rm -rf /tmp/x' } }
  )
  assert.equal(state.status, STATUS.INTERRUPTED)
  assert.equal(isRunning(state), false)
  assert.equal(needsAttention(state), true)
  assert.deepEqual(effects, [{ type: 'auto-save' }])
})

test('answering the approval restores and resumes on the same frame', () => {
  const { state, effects } = run(
    createState(),
    { type: 'turn-busy', value: true },
    { type: 'approval', value: true, approval: { prompt_id: 'p1' } },
    { type: 'approval-cleared' }
  )
  assert.equal(state.status, STATUS.PLAYING)
  assert.equal(effects.filter(e => e.type === 'auto-restore').length, 1)
})

test('while paused by the user, an approval does not start playing', () => {
  const { state } = run(
    createState(),
    { type: 'turn-busy', value: true },
    { type: 'user-toggle-play' },
    { type: 'approval', value: true, approval: { prompt_id: 'p1' } }
  )
  assert.equal(state.userPaused, true)
  assert.notEqual(state.status, STATUS.PLAYING)
})

test('always mode keeps playing through an approval but still badges it', () => {
  const { state } = run(
    createState({ mode: MODE_ALWAYS }),
    { type: 'turn-busy', value: true },
    { type: 'approval', value: true, approval: { prompt_id: 'p1' } }
  )
  assert.equal(state.status, STATUS.PLAYING)
  assert.equal(isRunning(state), true)
  assert.equal(needsAttention(state), true, 'the request is surfaced, not swallowed')
})

test('toggling mode mid-turn flips the decision on the spot', () => {
  const busy = run(createState(), { type: 'turn-busy', value: true }).state

  const interrupted = run(busy, { type: 'approval', value: true, approval: { prompt_id: 'p1' } }).state
  assert.equal(interrupted.status, STATUS.INTERRUPTED)

  const always = run(interrupted, { type: 'mode-toggle' }).state
  assert.equal(always.mode, MODE_ALWAYS)
  assert.equal(always.status, STATUS.PLAYING, 'always mode resumes the instant it is chosen')

  const back = run(always, { type: 'mode-toggle' }).state
  assert.equal(back.mode, MODE_INTERRUPTED)
  assert.equal(back.status, STATUS.INTERRUPTED, 'and pauses again when flipped back')
})

test('a hidden pane never burns frames', () => {
  const { state } = run(
    createState(),
    { type: 'turn-busy', value: true },
    { type: 'pane-hidden', value: true }
  )
  assert.equal(state.status, STATUS.PLAYING, 'status is not a lie about why')
  assert.equal(isRunning(state), false)
})

test('always mode is idle before any turn starts', () => {
  const { state } = run(createState(), { type: 'set-mode', value: MODE_ALWAYS })
  assert.equal(state.status, STATUS.PLAYING, 'always means always, turn or no turn')
})

test('time served only counts while playing during a turn', () => {
  const idle = run(createState(), { type: 'tick', ms: 1000 }).state
  assert.equal(idle.timeServedMs, 0)

  const paused = run(
    createState(),
    { type: 'turn-busy', value: true },
    { type: 'user-pause' },
    { type: 'tick', ms: 1000 }
  ).state
  assert.equal(paused.timeServedMs, 0)

  const playing = run(
    createState(),
    { type: 'turn-busy', value: true },
    { type: 'tick', ms: 1000 }
  ).state
  assert.equal(playing.timeServedMs, 1000)
})

test('unknown actions are ignored without allocating a new state', () => {
  const s = createState({ turnBusy: true })
  const result = reduce(s, { type: 'nonsense' })
  assert.equal(result.state, s)
  assert.deepEqual(result.effects, [])
})
