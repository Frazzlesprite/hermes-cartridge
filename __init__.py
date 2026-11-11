"""Cartridge — a Game Boy / Game Boy Color pane for Hermes Desktop.

The desktop half is the product: ``desktop/plugin.js`` (built from ``src/``)
registers the pane, the status-bar chip, the palette commands and the settings
page through ``@hermes/plugin-sdk``.

This module exists so the package is a loadable native Hermes plugin — the
Desktop loader copies ``desktop/plugin.js`` out of a plugin package, and
``hermes plugins doctor`` imports the agent half to check registration. Cartridge
registers no tools and no hooks in v1: emulation, save states and busy-state
arbitration all live in the renderer, where the canvas and the keystrokes are.

Keep this file import-light. It executes inside the gateway process.
"""

from __future__ import annotations


def register(ctx) -> None:  # noqa: ARG001 - signature fixed by the plugin contract
    """Register nothing.

    A deliberate no-op, not a stub waiting to be filled in: Cartridge is a pane,
    not an agent capability. If a later version exposes ``cartridge_status`` to
    the model, it belongs here.
    """
    return None
