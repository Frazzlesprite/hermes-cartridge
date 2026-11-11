// Mount every contribution the plugin registers, with real React, in node.
//
// Why this exists: `desktop/plugin.js` is bundled, not type-checked. A free
// identifier (a missing import) survives bundling, then throws inside the
// renderer and the user sees `"cartridge:pane" failed to render` — which is a
// bad way to find out. This test is the cheap tripwire between the two.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { renderToString } from 'react-dom/server'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const work = resolve(root, 'build', 'render')

const bundle = readFileSync(resolve(root, 'desktop', 'plugin.js'), 'utf8')

// The loader rewrites these three specifiers in place; the test does the same,
// pointing the SDK at the stub. react and react/jsx-runtime stay real.
mkdirSync(work, { recursive: true })
writeFileSync(
  resolve(work, 'plugin.mjs'),
  bundle.replaceAll('"@hermes/plugin-sdk"', '"./sdk-stub.mjs"')
)
writeFileSync(
  resolve(work, 'sdk-stub.mjs'),
  readFileSync(resolve(here, 'support', 'sdk-stub.mjs'), 'utf8')
)

const { default: plugin } = await import(pathToFileURL(resolve(work, 'plugin.mjs')).href)

function fakeContext() {
  const registrations = []
  const settings = []
  const events = []
  const ctx = {
    source: `plugin:${plugin.id}`,
    register: contribution => {
      registrations.push(contribution)
      return () => {}
    },
    registerMany: contributions => {
      registrations.push(...contributions)
      return () => {}
    },
    registerSettingsPage: page => {
      settings.push(page)
      return () => {}
    },
    rest: async () => ({}),
    socket: () => () => {},
    onEvent: (type, listener) => {
      events.push({ type, listener })
      return () => {}
    },
    onDispose: () => () => {},
    setTimeout: () => () => {},
    setInterval: () => () => {},
    addEventListener: () => () => {},
    os: { notify: () => {}, openExternal: async () => true, revealPath: async () => true },
    pet: { say: () => () => {}, clear: () => {}, visible: { get: () => true } },
    preview: {},
    storage: { get: (key, fallback) => fallback, set: () => {}, remove: () => {} },
    files: {
      writeText: async () => ({ ok: true }),
      readText: async () => ({ ok: false, error: 'not-found' }),
      trash: async () => ({ ok: true }),
      list: async () => ({ ok: true, entries: [] })
    }
  }
  return { ctx, registrations, settings, events }
}

test('the plugin exports a HermesPlugin shape', () => {
  assert.equal(typeof plugin, 'object')
  assert.equal(plugin.id, 'cartridge')
  assert.equal(typeof plugin.register, 'function')
})

test('register() announces the surfaces Cartridge promises', () => {
  const { ctx, registrations, settings, events } = fakeContext()
  plugin.register(ctx)

  const areas = registrations.map(r => r.area)
  assert.ok(areas.includes('panes'), 'a pane is the whole point')
  assert.ok(areas.includes('statusBar.right'), 'the time-served chip')
  assert.ok(areas.filter(a => a === 'palette').length >= 4, 'palette commands')
  assert.equal(settings.length, 1, 'one Settings entry with sub-pages')
  assert.deepEqual(
    settings[0].children.map(child => child.id),
    ['cartridge', 'keys', 'about']
  )
  assert.ok(events.some(e => e.type === 'approval.request'), 'must see approvals')
  assert.ok(events.some(e => e.type === 'approval.settled'), 'must see them settle')
})

test('every contribution renders without throwing', () => {
  const { ctx, registrations, settings } = fakeContext()
  plugin.register(ctx)

  const surfaces = registrations.filter(c => typeof c.render === 'function')
  assert.ok(surfaces.length >= 2, 'expected the pane and the chip')

  for (const contribution of surfaces) {
    const html = renderToString(contribution.render())
    assert.ok(html.length > 0, `${contribution.area}:${contribution.id} rendered nothing`)
  }

  // Settings pages and their sub-pages mount the same way, with the same
  // failure mode if an import is missing.
  const pages = [settings[0], ...settings[0].children]
  for (const page of pages) {
    const html = renderToString(page.render())
    assert.ok(html.length > 0, `settings page ${page.id} rendered nothing`)
  }
})

test('the pane renders the empty cartridge slot before a ROM is loaded', () => {
  const { ctx, registrations } = fakeContext()
  plugin.register(ctx)
  const pane = registrations.find(c => c.area === 'panes')
  const html = renderToString(pane.render())

  assert.match(html, /canvas/, 'the emulator surface is a canvas')
  assert.match(html, /width="160"/)
  assert.match(html, /height="144"/)
  assert.match(html, /cartridge slot/i, 'the drop zone copy')
  assert.match(html, /Self-test cartridge/i, 'a way in without a file picker')
})
