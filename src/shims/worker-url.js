// Stub: Cartridge replaces the core's AudioWorklet path with a plain
// writeAudio capture (see adapter.js), so this constructor is never reached.
export class WorkerUrl {
  constructor() {
    throw new Error('AudioWorklet capture is not used by Cartridge')
  }
}
export default WorkerUrl
