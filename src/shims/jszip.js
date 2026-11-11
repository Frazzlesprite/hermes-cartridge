// Stub: the adapter never calls the core's zip import/export helpers.
// Save states go through the adapter's raw bytes path, not .zip bundles.
const JSZip = {
  loadAsync() {
    throw new Error('jszip is not bundled with Cartridge')
  }
}
export default JSZip
export const loadAsync = JSZip.loadAsync
