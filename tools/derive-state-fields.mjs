// Derive a path/type table from upstream StateManager.loadOld() so the adapter's
// snapshot can never drift from the core's own field order.
// Run: node tools/derive-state-fields.mjs <path-to-StateManager.ts>
import { readFileSync } from 'node:fs'

const src = readFileSync(process.argv[2], 'utf8')
const start = src.indexOf('loadOld(state)')
const end = src.indexOf('\n  }', start)
// Collapse whitespace so multi-line toTypedArray(...) calls read as one field.
const body = src.slice(start, end).replace(/\s+/g, ' ')

const re = /gameboy\.([A-Za-z0-9_.]+)\s*=\s*(?:state\[index\+\+\]|toTypedArray\(\s*state\[index\+\+\]\s*,\s*"([a-z0-9]+)"\s*\))/g
const fields = []
let m
while ((m = re.exec(body))) {
  fields.push({ path: m[1], type: m[2] ?? 'number' })
}

const out = [
  '// Derived from jsGBC-core StateManager.loadOld() by tools/derive-state-fields.mjs.',
  '// Do not hand-edit: re-run the tool against the pinned upstream commit.',
  `// ${fields.length} fields.`,
  'export const STATE_FIELDS = [',
  ...fields.map(f => `  { path: ${JSON.stringify(f.path)}, type: ${JSON.stringify(f.type)} },`),
  ']',
  ''
].join('\n')

process.stdout.write(out)
console.error(`fields: ${fields.length}`)
