# Cartridge

*Play while it works.*

A handheld ROM emulator that lives in a Hermes Desktop pane. It loads **your
own** `.gb` and `.gbc` files, runs them at full speed, saves and restores state —
and it knows when the agent is working. Playable during a turn, paused the
instant Hermes needs an approval, resumed on the same frame once you answer.

---

## Contents

- [Licence](#licence)
- [ROMs: what Cartridge does and does not do](#roms-what-cartridge-does-and-does-not-do)
- [Why this is a plugin and not a skill](#why-this-is-a-plugin-and-not-a-skill)
- [Install](#install)
- [Using it](#using-it)
- [How the arbitration works](#how-the-arbitration-works)
- [Settings](#settings)
- [Architecture](#architecture)
- [Development](#development)
- [Known limits in 0.1.0](#known-limits-in-010)
- [Licences and provenance](#licences-and-provenance)

## Licence

**MIT** — see [`LICENSE`](LICENSE). The emulator core is MIT and vendored with
its copyright line intact; the one bundled ROM is WTFPL. Full provenance,
including the exact upstream commits, is in [`THIRD_PARTY.md`](THIRD_PARTY.md).

## ROMs: what Cartridge does and does not do

- **No games are bundled.** Not one commercial ROM, and no download links.
- **Your cartridges stay local.** A file you choose is read into the renderer,
  identified by SHA-256, and played. Bytes are never uploaded, never sent to a
  model, never written outside the plugin's own data folder.
- **One self-test cartridge ships** (`roms/selftest.gb`): a WTFPL
  background-scrolling example from flozz's example set, with its complete
  source and Makefile beside it, so the repo can be reviewed and the ROM rebuilt.
  It is how the pane proves the emulator works before you supply a game.
- **Display shows the base filename only** — never a full path.
- **No network calls at all.** Cartridge has no updater, no telemetry, no CDN,
  no remote anything. The plugin's only dependencies are `@hermes/plugin-sdk`
  and React, both provided by the app.

Cartridge is not affiliated with, endorsed by, or licensed by any console
manufacturer, and uses no manufacturer marks in its name or interface. Cartridge
formats are named by file extension (`.gb`, `.gbc`) rather than by brand.

## Why this is a plugin and not a skill

A skill cannot render a canvas, capture keystrokes, hold a 59.7275 Hz loop,
persist a save state, read per-session turn-busy state, or pause another surface
when an approval arrives. Every one of those is a Desktop SDK capability, and the
pause-on-interrupt behaviour is the whole product.

## Install

The plugin is installed like any Hermes plugin:

```bash
hermes plugins install Frazzlesprite/hermes-cartridge
```

It is default-enabled: after installing, enable it in **Capabilities → Plugins**
if your install kept it off, and the `cartridge` pane appears in the right-hand
column. If the layout has no room for it, `Ctrl+K` → **Reload desktop plugins**.

To develop against a checkout, link it instead of installing:

```bash
ln -s /path/to/cartridge-plugin ~/.hermes/plugins/cartridge   # macOS/Linux
```

## Using it

- **Drop a `.gb` or `.gbc`** anywhere on the pane, or use *Choose file…*.
- **No cartridge to hand?** *Self-test cartridge* loads the bundled WTFPL
  homebrew. Arrow keys scroll the background — small, but it proves the CPU,
  the PPU and your keyboard mapping all work.

| Key | Button |
|---|---|
| Arrow keys | D-pad |
| `F1` | A |
| `F2` | B |
| `Enter` | Start |
| `Shift` | Select |

> **Why not `Z` and `X`?** Hermes's composer appends printable keys to the prompt
> before any plugin listener runs, so a letter binding types into the chat instead
> of playing. Function keys are inert, so they are the safe default. Every binding
> can be changed in **Settings → Plugins → Cartridge → Controls**, and the
> on-screen deck works regardless of the keyboard.

Keys are captured only while the game itself has focus — click the screen once,
and the pane says so until you do. The **control deck under the screen** works
without the keyboard entirely: click or tap the D-pad, select, start, A and B,
and they light up when pressed. They light up for keyboard presses too, so you
can see what the keys are doing. The key legend under the buttons always shows
your current bindings.

Keys are captured only while the pane has focus, and `preventDefault` is applied
only there, so the composer keeps working normally. All bindings are rebindable
in **Settings → Plugins → Cartridge → Controls**.

The footer gives you mode, quick-save, save slots, mute and a file picker. The
status chip in the bar shows today's time served; click it to pause or resume.

## How the arbitration works

Two modes, one rule each:

| Mode | Plays when |
|---|---|
| **interrupted** (default) | a turn is running, no approval is pending, you have not paused, and the pane is visible |
| **always** | you have not paused and the pane is visible — approvals show a badge instead of pausing |

- An approval **pauses immediately**, writes the automatic save slot, and puts
  the request in the pane with the same choices Hermes would offer. Answering it
  restores the slot and carries on from the same frame.
- When the turn ends the pane stops and shows *the agent is back*. It does not
  reset, and it does not replay the title screen.
- **Time served** only counts while frames actually advanced during a turn,
  which is why the number in the chip is honest.
- A pane that is hidden or scrolled away stops advancing frames. Nothing burns
  CPU in the background.

The state machine is a pure reducer (`src/state/reducer.js`) with no React, no
emulator and no timers in it, so every transition is unit-tested — including an
approval arriving mid-turn and a mode flip while one is pending.

## Settings

**Settings → Plugins → Cartridge** has three pages:

- **Cartridge** — default mode, audio, palette (`pocket` / `grey` / `green`,
  DMG only), integer scale, remember-the-last-cartridge, and *forget* for the
  stored copy.
- **Controls** — rebind every button; conflicting keys are refused.
- **About** — version, core version, palette list and the licence summary.

`plugin.yaml` also declares the same keys in `config_schema`, so the agent-side
settings form shows them.

## Architecture

```
desktop/plugin.js        built single-file ESM entry (the app loads this)
src/
  plugin.js              registration: pane, chip, palette, settings
  state/reducer.js       busy-state arbitration, pure
  state/store.js         atoms shared by the pane and the chip
  core/adapter.js        the ONLY module that touches the emulator
  core/state-fields.js   save-state field table, derived from upstream
  pane/                  canvas, frame pacing, commands
  input/keymap.js        bindings and focus gating, pure
  audio/player.js        ring buffer + AudioContext
  roms/roms.js           file reading, self-test, SHA-256 identity
  saves/saves.js         slots and battery saves via ctx.files
vendor/jsgbc-core/       pinned MIT core, upstream source included
roms/                    WTFPL self-test ROM + its source
tests/                   headless harness
```

Two decisions worth knowing about:

- **Everything goes through one adapter.** The pane never calls a core method
  directly, so swapping the emulator is one file, not twelve.
- **There is no Python backend.** Save states and battery saves go through
  `ctx.files` (the plugin's own data folder) instead of a `plugin_api.py` route.
  That keeps the install a single half, needs no `plugins.enabled` entry, and
  keeps the "no network" promise trivially true. `__init__.py` exists so the
  package is a loadable native plugin, and registers nothing.

## Development

```bash
npm install
npm run build     # src/ -> desktop/plugin.js (+ build/core.node.mjs)
npm test          # 27 headless tests
npm run verify    # build, then test
```

`desktop/plugin.js` is committed because the Desktop loader reads it uncompiled.
It is generated: CI fails if it does not match a fresh build. Only
`@hermes/plugin-sdk`, `react` and `react/jsx-runtime` may appear as bare imports.

The tests that matter most:

| Test | What it proves |
|---|---|
| `test_core.mjs` | 120 frames of the self-test ROM hash to a golden value (FNV-1a over RGBA) |
| `test_state_roundtrip.mjs` | a save state replays **identical** frames after a restore |
| `test_reducer.mjs` | every arbitration transition, approval-during-play included |
| `test_render.mjs` | every surface mounts with real React — the bug class that a bundle cannot catch |
| `test_gbc.mjs` | colour mode renders, and a corrupt cartridge header is refused |

Sanity gates, run against the plugin directory:

```bash
hermes plugins doctor . --ci
hermes plugins validate . --install-deps
```

## Known limits in 0.1.0

Written down rather than hidden:

- **Audio starts on a click.** Browser autoplay rules; the first click in the
  pane unlocks it. Muting keeps the core running silently.
- **Save states are refused across core versions.** A state records the core
  version and the cartridge's SHA-256; loading a mismatched one fails loudly
  instead of corrupting your game.
- **`remember this cartridge` is capped at ~2 MiB** of ROM, because the data
  door writes text. Larger cartridges still play perfectly; they just are not
  stored for the next launch.
- **No link cable, cheats, rewind, fast-forward, shaders, netplay or gamepad.**
- **Save states do not include the cartridge's battery RAM**; that lives in its
  own slot and is written when the pane pauses.
- **Colour compatibility is verified with a colour-flagged self-test**, not
  with a commercial title. If a specific `.gbc` file misbehaves, that is a core
  bug and worth an issue with the file's SHA-256 and mapper.

## Licences and provenance

| Component | Licence | Where |
|---|---|---|
| Cartridge | MIT | `LICENSE` |
| jsGBC-core (emulator) | MIT, © 2017–2021 ardean | `vendor/jsgbc-core/`, commit pinned in `THIRD_PARTY.md` |
| Self-test ROM | WTFPL v2, © 2004 Sam Hocevar | `roms/`, upstream `flozz/gameboy-examples` |

No commercial ROM, no manufacturer asset, no manufacturer mark in the plugin name or UI.
