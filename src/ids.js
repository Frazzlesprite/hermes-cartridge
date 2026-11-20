/**
 * Contribution ids, in one place.
 *
 * The host namespaces every contribution as `<pluginId>:<id>`, and a pane's
 * on-screen visibility is addressed by that full name. Keeping the two halves
 * together stops the pane id in one file drifting from the id registered in
 * another.
 */
export const PLUGIN_ID = 'cartridge'
export const PANE_ID = `${PLUGIN_ID}:pane`
