# Third-party notices

Cartridge vendors one emulator core and one self-test ROM. Neither is fetched at
runtime; both are committed here, with upstream source, so a reviewer can read
what ships and rebuild it.

## Emulator core — jsGBC-core

| | |
|---|---|
| Upstream | https://github.com/ardean/jsGBC-core |
| Licence | MIT (`vendor/jsgbc-core/LICENSE.md`, copyright (c) 2017–2021 ardean) |
| Pinned commit | `0d2c721bb2ce2aaef8720c07f8a859707d1445d1` (v0.7.0, 2022-01-16) |
| Vendored | `vendor/jsgbc-core/src/**` — the complete upstream TypeScript source |
| Built artefact | `desktop/plugin.js`, produced by `npm run build` (esbuild) |

The built bundle is generated from the vendored source at build time, so the
committed `desktop/plugin.js` can be reproduced byte-for-byte by running the
build. Upstream is never modified.

jsGBC-core's Z80 implementation is itself borrowed from
[GameBoy-Online](https://github.com/taisel/GameBoy-Online) (MIT), as the upstream
README records.

### What the build changes

Esbuild resolves four bare imports in the vendored source to small shims in
`src/shims/`:

| Import | Why |
|---|---|
| `events` | A 40-line `EventEmitter`, so the core does not pull a Node polyfill into the renderer. |
| `jszip`, `file-saver` | Stubs. Cartridge saves through `ctx.files`, never through the core's zip/download helpers. |
| `worker-url` | Stub. Cartridge captures the mixer's `writeAudio` output instead of installing an AudioWorklet. |

### Patched: RUMBLE cartridges crashed

`vendor/jsgbc-core/src/cartridge/RUMBLE.ts` carries a three-line patch, marked
`PATCHED (Cartridge)` in the file. Upstream's `writeRamBank` called
`super.writeRamBank(address, data)`, but `MBC5` declares `writeRamBank` as an
instance field rather than a prototype method, so `super.writeRamBank` is
`undefined`: every cartridge with a rumble motor threw
`(intermediate value).writeRamBank is not a function` on its first RAM-bank
write. The patch inlines the three lines of MBC5 behaviour that call was meant
to reach, keeping the arrow-function binding (these writers are handed to
`memoryWriter` detached, so they cannot become prototype methods).

Verified with `murby/demo-dash` (MIT), a rumble cartridge that previously
crashed the core and now renders in colour.

### Upstream save-state regression

At this pin, `StateManager.get()` returns a bare 72 KiB memory dump and
`StateManager.load()` has an empty body, so the core's own save/load is a no-op.
Cartridge does not patch it. The adapter snapshots the machine itself, using a
field table derived mechanically from the core's own `StateManager.loadOld()`
(`tools/derive-state-fields.mjs` → `src/core/state-fields.js`), then runs the
core's documented resume sequence. `tests/test_state_roundtrip.mjs` proves the
result is byte-exact by replaying frames and comparing framebuffer hashes.

## Self-test ROM — flozz/gameboy-examples

| | |
|---|---|
| Upstream | https://github.com/flozz/gameboy-examples |
| Example | `06-graphics3-background` |
| Licence | WTFPL v2 (`roms/LICENSE`, copyright (c) 2004 Sam Hocevar) |
| Pinned commit | `e3796043a4f392a934a00f26f4ed20ce06ad5323` (2020-10-20) |
| Committed | `roms/selftest.gb` (32768 bytes, SHA-256 `275705265cc8dd3d6c15bff07b136c2654a42da5a06664116a0800ce96c1dc00`) |
| Source | `roms/src/` — upstream `main.c`, generated tile data, `Makefile`, `Make.bat` |

The ROM is a homebrew background-scrolling demo: it initialises the tileset and
tilemap, then scrolls the background while a direction is held. It is
deterministic, uses no RNG and no save RAM, and exercises CPU, PPU and
scrolling — which makes it a usable regression fixture.

It is not a game, contains no manufacturer asset, and is the only ROM in this
repository. `roms/selftest.gb` is the upstream build artefact committed by its
author; `roms/src/` is the source that produced it.

## Demo cartridge — named, never vendored

The submission video and the screenshots play *Tobu Tobu Girl Deluxe* to show the
colour path on a real colour cartridge. It is **not in this repository**: no bytes,
no copy under `roms/`, nothing fetched at runtime. Whoever records the demo
downloads it themselves, and an install of Cartridge never contains it.

| | |
|---|---|
| Upstream | https://github.com/SimonLarsen/tobutobugirl-dx |
| Licence | MIT (`LICENSE`, © 2017 Tangram Games) for the source; CC BY 4.0 for all images, text, sound and music |
| Pinned commit | `4985d4d282aa43229f250ffa3b0d86998ebd55d3` (2019-11-09) |
| Distribution | `tobudx.gb`, 262,144 bytes, SHA-256 `0a0e8018dbbc8d7f8cd99f05e7cdc7b4cc9e358ecfe9377ebfb2291a84c6e310` |
| Cartridge | colour flag `0x80`, MBC1 + SRAM + battery — it exercises the colour PPU, palette RAM and the battery-save path |

CC BY 4.0 asks for attribution, so the demo credit — *"Tobu Tobu Girl Deluxe by
Tangram Games, code MIT, art CC BY 4.0"* — is a licence obligation rather than a
courtesy. Because the ROM is never redistributed here, the plugin's own MIT
licence covers everything an installer actually receives.
