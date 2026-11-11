// Minimal EventEmitter shim for bundling jsGBC-core outside Node.
// The core only uses on/addListener/emit/removeListener semantics.
export class EventEmitter {
  constructor() {
    this._listeners = new Map()
  }
  addListener(type, fn) {
    return this.on(type, fn)
  }
  on(type, fn) {
    const set = this._listeners.get(type) ?? new Set()
    set.add(fn)
    this._listeners.set(type, set)
    return this
  }
  once(type, fn) {
    const wrap = (...args) => {
      this.removeListener(type, wrap)
      fn(...args)
    }
    return this.on(type, wrap)
  }
  removeListener(type, fn) {
    this._listeners.get(type)?.delete(fn)
    return this
  }
  off(type, fn) {
    return this.removeListener(type, fn)
  }
  emit(type, ...args) {
    const set = this._listeners.get(type)
    if (!set || set.size === 0) return false
    for (const fn of [...set]) fn(...args)
    return true
  }
  listenerCount(type) {
    return this._listeners.get(type)?.size ?? 0
  }
}

export default { EventEmitter }
