/**
 * Cartridge — a handheld ROM pane that plays while the agent works.
 *
 * Entry point. Everything below is a registration against the Desktop SDK;
 * the interesting logic lives in src/state/reducer.js (what to do when the
 * agent needs you) and src/core/adapter.js (the only code that touches the
 * emulator).
 */
import { host, PANES_AREA } from '@hermes/plugin-sdk'
import { jsx } from 'react/jsx-runtime'

import { CartridgePane } from './pane/pane.js'
import { registerPalette, registerSettings, registerStatusChip } from './menu/surfaces.js'
import { hydrate, dispatch, flushServed } from './state/store.js'

const PLUGIN_ID = 'cartridge'
const PANE_ID = `${PLUGIN_ID}:pane`

export default {
  id: PLUGIN_ID,
  name: 'Cartridge',

  register(ctx) {
    hydrate(ctx)

    // --- turn-busy -------------------------------------------------------
    // `host.state.busy` is the focused chat's live turn. It is not the gateway
    // socket: a session can be mid-turn while the socket is open (or idle).
    const unsubscribe = host.state.busy.subscribe(value => {
      dispatch({ type: 'turn-busy', value: Boolean(value) })
    })
    ctx.onDispose(unsubscribe)

    // --- approvals -------------------------------------------------------
    // Canonical prompts arrive as events keyed by prompt_id and are answered
    // through approval.respond. The pane mirrors the card while it holds the
    // frame; the chat keeps working normally throughout.
    ctx.onEvent('approval.request', event => {
      const prompt = event?.payload ?? {}
      if (prompt.kind && prompt.kind !== 'approval') return
      const approval = { ...prompt, session_id: event?.session_id ?? null }
      dispatch({ type: 'approval', value: true, approval })

      // Only interrupt the OS when the pane cannot be seen; otherwise the card
      // in the pane is the notification.
      try {
        const visible = typeof host.paneVisibility === 'function' ? host.paneVisibility(PANE_ID).get() : true
        if (!visible) {
          ctx.os?.notify?.({
            title: 'Hermes needs an approval',
            body: prompt.description || prompt.command || 'Open Cartridge to see the request.'
          })
        }
      } catch {
        /* notifications are best effort */
      }
    })

    ctx.onEvent('approval.settled', () => dispatch({ type: 'approval-cleared' }))
    // A clarify prompt is not an approval, but it is still "the agent needs
    // you". Pause on it without pretending it can be answered from the pane.
    ctx.onEvent('clarify.request', event => {
      dispatch({
        type: 'approval',
        value: true,
        approval: { ...(event?.payload ?? {}), session_id: event?.session_id ?? null, kind: 'clarify' }
      })
    })
    ctx.onEvent('clarify.settled', () => dispatch({ type: 'approval-cleared' }))

    // --- surfaces --------------------------------------------------------
    ctx.register({
      id: 'pane',
      area: PANES_AREA,
      title: 'cartridge',
      data: { placement: 'right', width: '380px' },
      render: () => jsx(CartridgePane, {})
    })

    registerStatusChip(ctx)
    registerPalette(ctx)
    registerSettings(ctx)

    // Time served is a durable daily counter; flush it on a slow timer rather
    // than on every frame.
    ctx.setInterval(() => flushServed(), 15000)
    ctx.onDispose(() => flushServed())
  }
}
