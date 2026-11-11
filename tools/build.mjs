// Two bundles, one source tree:
//   build/core.node.mjs  — the adapter alone, for the headless test harness
//   desktop/plugin.js    — the whole plugin, single-file ESM, uncompiled by the
//                          Desktop loader, so the only bare imports it may keep
//                          are @hermes/plugin-sdk and react.
import { build } from 'esbuild'
import { readFileSync, statSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const p = (...parts) => resolve(root, ...parts)

const alias = {
  events: p('src/shims/events.js'),
  jszip: p('src/shims/jszip.js'),
  'file-saver': p('src/shims/file-buffer.js'),
  'worker-url': p('src/shims/worker-url.js')
}

// `virtual:selftest-rom` inlines the bundled WTFPL ROM as base64 so the pane can
// always offer its self-test without a file picker or a backend route. The bytes
// are the ones committed at roms/selftest.gb — the build asserts the hash.
const selftestRom = readFileSync(p('roms/selftest.gb'))
const selftestSha = createHash('sha256').update(selftestRom).digest('hex')
const selftestPlugin = {
  name: 'selftest-rom',
  setup(b) {
    b.onResolve({ filter: /^virtual:selftest-rom$/ }, () => ({
      path: 'virtual:selftest-rom',
      namespace: 'selftest'
    }))
    b.onLoad({ filter: /.*/, namespace: 'selftest' }, () => ({
      contents:
        `export const SHA256 = ${JSON.stringify(selftestSha)}\n` +
        `export const BYTES_BASE64 = ${JSON.stringify(selftestRom.toString('base64'))}\n`,
      loader: 'js'
    }))
  }
}

const shared = {
  bundle: true,
  sourcemap: false,
  logLevel: 'info',
  target: ['es2022'],
  legalComments: 'inline',
  alias
}

mkdirSync(p('build'), { recursive: true })

await build({
  ...shared,
  entryPoints: [p('src/core/adapter.js')],
  outfile: p('build/core.node.mjs'),
  format: 'esm',
  platform: 'node'
})

await build({
  ...shared,
  entryPoints: [p('src/plugin.js')],
  outfile: p('desktop/plugin.js'),
  format: 'esm',
  platform: 'browser',
  external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'],
  plugins: [selftestPlugin]
})

const bytes = statSync(p('desktop/plugin.js')).size
const budget = 1_500_000
console.log(`desktop/plugin.js  ${(bytes / 1024).toFixed(1)} KiB  (budget ${(budget / 1024).toFixed(0)} KiB)`)
if (bytes > budget) {
  console.error('over the spec §15 single-file budget')
  process.exitCode = 1
}
console.log(`selftest ROM       ${selftestSha.slice(0, 16)}…  ${selftestRom.length} bytes`)
