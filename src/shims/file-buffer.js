// Stub: Cartridge writes files through ctx.files, never through the core's
// own browser-download helper.
export function saveAs() {
  throw new Error('file-buffer shim: the core download path is not used by Cartridge')
}
export default { saveAs }
