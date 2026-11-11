// Manifest and bundle guards.
//
// These started life as `node -e "..."` blocks inside ci.yml. Bash ends the
// double-quoted argument at the `"` in `">="`, so the step never ran: every
// push failed on a mangled command line before a single assertion was made.
// Keeping the checks in a file makes them runnable here and in CI.
import { readFileSync } from 'node:fs'

const problems = []

const yaml = readFileSync('plugin.yaml', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

const version = yaml.match(/^version:\s*(\S+)/m)?.[1]
if (!version) problems.push('plugin.yaml has no version')
else if (version !== pkg.version) problems.push(`plugin.yaml version ${version} != package.json ${pkg.version}`)

if (!/^requires_hermes:\s*"[>=]=?[0-9]+\.[0-9]+\.[0-9]+"/m.test(yaml)) {
  problems.push('requires_hermes must be a SemVer floor, quoted')
}

// A key that ends up indented is no longer a top-level key: YAML folds it into
// the value above, the loader loses it, and the plugin will not load. That is
// exactly how `homepage:` shipped inside `license:` once. Assert every required
// key starts at column 0 rather than trusting the file to look right.
const TOP_LEVEL = ['name', 'version', 'manifest_version', 'api_version', 'description', 'license', 'homepage', 'requires_hermes']
for (const key of TOP_LEVEL) {
  if (!new RegExp(`^${key}:\\s*\\S`, 'm').test(yaml)) {
    problems.push(`plugin.yaml: "${key}" is missing from column 0 (indented keys do not survive YAML parsing)`)
  }
}

// The name and interface are the product surface. A manufacturer mark here is a
// review failure, not a style nit, so the build refuses it. \s+ rather than \s?
// so the vendored core's `this.gameboy` identifiers do not trip the check.
const marks = /Game\s+Boy|Nintendo/i
for (const file of ['plugin.yaml', 'desktop/plugin.js']) {
  const text = readFileSync(file, 'utf8')
  if (marks.test(text)) problems.push(`${file} contains a manufacturer mark`)
}

// README/THIRD_PARTY name upstream projects on purpose; they are attribution
// and are deliberately not checked here.

if (problems.length) {
  for (const problem of problems) console.error('-', problem)
  process.exit(1)
}

console.log(`manifest consistent: ${version}, top-level keys intact, no marks in the shipped surface`)
