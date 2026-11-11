// src/plugin.js
import { host as host3, PANES_AREA } from "@hermes/plugin-sdk";
import { jsx as jsx3 } from "react/jsx-runtime";

// src/pane/pane.js
import { host, useValue, cn } from "@hermes/plugin-sdk";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";

// src/shims/jszip.js
var JSZip = {
  loadAsync() {
    throw new Error("jszip is not bundled with Cartridge");
  }
};
var loadAsync = JSZip.loadAsync;

// vendor/jsgbc-core/src/util.ts
function toTypedArray(baseArray, memtype) {
  try {
    if (!baseArray || !(baseArray.length < 1)) return [];
    var length = baseArray.length;
    let typedArrayTemp;
    switch (memtype) {
      case "uint8":
        typedArrayTemp = new Uint8Array(length);
        break;
      case "int8":
        typedArrayTemp = new Int8Array(length);
        break;
      case "int32":
        typedArrayTemp = new Int32Array(length);
        break;
      case "float32":
        typedArrayTemp = new Float32Array(length);
    }
    for (var index = 0; index < length; index++) {
      typedArrayTemp[index] = baseArray[index];
    }
    return typedArrayTemp;
  } catch (error) {
    console.log("Could not convert an array to a typed array: " + error.message, 1);
    return baseArray;
  }
}
function fromTypedArray(baseArray) {
  try {
    if (!baseArray || !baseArray.length) {
      return [];
    }
    var arrayTemp = [];
    for (var index = 0; index < baseArray.length; ++index) {
      arrayTemp[index] = baseArray[index];
    }
    return arrayTemp;
  } catch (error) {
    console.log("Conversion from a typed array failed: " + error.message, 1);
    return baseArray;
  }
}
function getTypedArray(length, defaultValue, numberType) {
  let arrayHandle;
  switch (numberType) {
    case "int8":
      arrayHandle = new Int8Array(length);
      break;
    case "uint8":
      arrayHandle = new Uint8Array(length);
      break;
    case "int32":
      arrayHandle = new Int32Array(length);
      break;
    case "float32":
      arrayHandle = new Float32Array(length);
      break;
    default:
      break;
  }
  if (defaultValue !== 0) {
    let index = 0;
    while (index < length) {
      arrayHandle[index++] = defaultValue;
    }
  }
  return arrayHandle;
}
function concatArrayBuffers(...buffers) {
  let totalLength = 0;
  for (let i = 0; i < buffers.length; i++) {
    totalLength += buffers[i].byteLength;
  }
  const array = new Uint8Array(totalLength);
  for (let i = 0; i < buffers.length; i++) {
    const typedArray = new Uint8Array(buffers[i]);
    if (i === 0) {
      array.set(typedArray);
    } else {
      array.set(typedArray, buffers[i - 1].byteLength);
    }
  }
  return array.buffer;
}
function debounce(func, wait) {
  var timeout, args, context, timestamp, result;
  function later() {
    var last = Date.now() - timestamp;
    if (last < wait && last >= 0) {
      timeout = setTimeout(later, wait - last);
    } else {
      timeout = null;
      result = func.apply(context, args);
      context = args = null;
    }
  }
  ;
  var debounced = function() {
    context = this;
    args = arguments;
    timestamp = Date.now();
    if (!timeout) timeout = setTimeout(later, wait);
    return result;
  };
  debounced.clear = function() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  debounced.flush = function() {
    if (timeout) {
      result = func.apply(context, args);
      context = args = null;
      clearTimeout(timeout);
      timeout = null;
    }
  };
  return debounced;
}

// vendor/jsgbc-core/src/settings.ts
var settings_default = {
  hasGameBoyPriority: false,
  // Give priority to GameBoy mode
  colorizeGBMode: true,
  // Colorize GB mode?
  runInterval: 8,
  // Interval for the emulator loop.
  minAudioBufferSpanAmountOverXInterpreterIterations: 10,
  // Audio buffer minimum span amount over x interpreter iterations.
  maxAudioBufferSpanAmountOverXInterpreterIterations: 20,
  // Audio buffer maximum span amount over x interpreter iterations.
  enabledAudioChannels: [true, true, true, true]
};

// vendor/jsgbc-core/src/CPU.ts
var CPU = class {
  speed = 1;
  ticks = 0;
  // Times for how many instructions to execute before ending the loop.
  cyclesTotal = 0;
  // Relative CPU clocking to speed set, rounded appropriately.
  cyclesTotalBase = 0;
  // Relative CPU clocking to speed set base.
  cyclesTotalCurrent = 0;
  // Relative CPU clocking to speed set, the directly used value.
  cyclesTotalRoundoff = 0;
  // Clocking per iteration rounding catch.
  baseCyclesPerIteration = 0;
  // CPU clocks per iteration at 1x speed.
  totalLinesPassed = 0;
  clocksPerSecond;
  stopped = false;
  constructor() {
    this.calculateTimings();
  }
  calculateTimings() {
    this.clocksPerSecond = this.speed * 4194304;
    this.baseCyclesPerIteration = this.clocksPerSecond / 1e3 * settings_default.runInterval;
    this.cyclesTotalRoundoff = this.baseCyclesPerIteration % 4;
    this.cyclesTotalBase = this.cyclesTotal = this.baseCyclesPerIteration - this.cyclesTotalRoundoff | 0;
    this.cyclesTotalCurrent = 0;
  }
  setSpeed(speed) {
    this.speed = speed;
    this.calculateTimings();
  }
};

// vendor/jsgbc-core/src/ROM.ts
var ROM = class {
  data;
  constructor(data) {
    if (data instanceof Uint8Array) {
      this.data = data;
    } else {
      this.data = new Uint8Array(data);
    }
  }
  getByte(index) {
    return this.data[index];
  }
  getChar(index) {
    return String.fromCharCode(this.getByte(index));
  }
  getString(from, to) {
    let text = "";
    for (let index = from; index <= to; index++) {
      text += this.getChar(index);
    }
    return text;
  }
  get length() {
    return this.data.byteLength;
  }
};

// vendor/jsgbc-core/src/LCD.ts
var LCD = class {
  constructor(gameboy, {
    canvas,
    context,
    offscreenCanvas,
    offscreenContext,
    width,
    height
  }) {
    this.gameboy = gameboy;
    this.canvas = canvas;
    this.context = context;
    this.offscreenCanvas = offscreenCanvas;
    this.offscreenContext = offscreenContext;
    this.gameboy = gameboy;
    this.offscreenWidth = 160;
    this.offscreenHeight = 144;
    this.offscreenRgbCount = this.offscreenWidth * this.offscreenHeight * 3;
    this.offscreenRgbaCount = this.offscreenWidth * this.offscreenHeight * 4;
    this.width = width || this.offscreenWidth;
    this.height = height || this.offscreenHeight;
    if (typeof document !== "undefined") {
      if (!this.canvas) this.canvas = document.createElement("canvas");
      if (!this.offscreenCanvas) this.offscreenCanvas = document.createElement("canvas");
    }
    if (this.canvas) {
      this.canvas.height = this.height;
      this.canvas.width = this.width;
      if (!this.context) this.context = this.canvas.getContext("2d");
    }
    if (this.offscreenCanvas) {
      this.offscreenCanvas.height = this.offscreenHeight;
      this.offscreenCanvas.width = this.offscreenWidth;
      if (!this.offscreenContext) this.offscreenContext = this.offscreenCanvas.getContext("2d");
    }
    if (!this.context) {
      throw new Error("please provide a canvas context in the lcd options");
    }
    if (!this.offscreenContext) {
      throw new Error("please provide a canvas offscreen context in the lcd options");
    }
  }
  gameboy;
  context;
  offscreenContext;
  offscreenWidth;
  offscreenHeight;
  offscreenRgbaCount;
  width;
  height;
  swizzledFrame;
  // The secondary gfx buffer that holds the converted RGBA values.
  canvasBuffer;
  // imageData handle
  newFrameAvailable;
  resizer;
  drewBlank;
  colorizedGbPalettes;
  offscreenCanvas;
  canvas;
  offscreenRgbCount;
  init() {
    this.offscreenContext.msImageSmoothingEnabled = false;
    this.offscreenContext.mozImageSmoothingEnabled = false;
    this.offscreenContext.webkitImageSmoothingEnabled = false;
    this.offscreenContext.imageSmoothingEnabled = false;
    this.context.msImageSmoothingEnabled = false;
    this.context.mozImageSmoothingEnabled = false;
    this.context.webkitImageSmoothingEnabled = false;
    this.context.imageSmoothingEnabled = false;
    this.canvasBuffer = this.offscreenContext.createImageData(
      this.offscreenWidth,
      this.offscreenHeight
    );
    this.swizzledFrame = getTypedArray(
      this.offscreenRgbCount,
      255,
      "uint8"
    );
    let index = this.offscreenRgbaCount;
    while (index > 0) {
      index -= 4;
      this.canvasBuffer.data[index] = 248;
      this.canvasBuffer.data[index + 1] = 248;
      this.canvasBuffer.data[index + 2] = 248;
      this.canvasBuffer.data[index + 3] = 255;
    }
    this.newFrameAvailable = true;
    this.draw();
  }
  drawToCanvas() {
    if (this.offscreenWidth === this.width && this.offscreenHeight === this.height) {
      this.context.putImageData(this.canvasBuffer, 0, 0);
    } else {
      this.offscreenContext.putImageData(this.canvasBuffer, 0, 0);
      this.context.drawImage(
        this.offscreenCanvas,
        0,
        0,
        this.width,
        this.height
      );
    }
  }
  draw() {
    if (!this.newFrameAvailable || this.offscreenRgbaCount !== 92160) return;
    const canvasData = this.canvasBuffer.data;
    let bufferIndex = 0;
    let canvasIndex = 0;
    while (canvasIndex < this.offscreenRgbaCount) {
      canvasData[canvasIndex++] = this.swizzledFrame[bufferIndex++];
      canvasData[canvasIndex++] = this.swizzledFrame[bufferIndex++];
      canvasData[canvasIndex++] = this.swizzledFrame[bufferIndex++];
      ++canvasIndex;
    }
    this.drawToCanvas();
    this.newFrameAvailable = false;
  }
  outputFrameBuffer() {
    const frameBuffer = this.gameboy.frameBuffer;
    const swizzledFrame = this.swizzledFrame;
    let bufferIndex = 0;
    let canvasIndex = 0;
    while (canvasIndex < this.offscreenRgbCount) {
      swizzledFrame[canvasIndex++] = frameBuffer[bufferIndex] >> 16 & 255;
      swizzledFrame[canvasIndex++] = frameBuffer[bufferIndex] >> 8 & 255;
      swizzledFrame[canvasIndex++] = frameBuffer[bufferIndex] & 255;
      ++bufferIndex;
    }
    this.newFrameAvailable = true;
  }
  turnOff() {
    if (this.drewBlank === 0) {
      this.clearFrameBuffer();
      this.newFrameAvailable = true;
    }
    this.drewBlank = 2;
  }
  clearFrameBuffer() {
    const frameBuffer = this.swizzledFrame;
    let bufferIndex = 0;
    if (this.gameboy.cartridge.useGbcMode || this.colorizedGbPalettes) {
      while (bufferIndex < this.offscreenRgbCount) {
        frameBuffer[bufferIndex++] = 248;
      }
    } else {
      while (bufferIndex < this.offscreenRgbCount) {
        frameBuffer[bufferIndex++] = 239;
        frameBuffer[bufferIndex++] = 255;
        frameBuffer[bufferIndex++] = 222;
      }
    }
  }
};

// vendor/jsgbc-core/src/memory/Layout.ts
var INTERRUPT_VECTORS_START = 0;
var CART_ROM_BANK0_END = 16383;
var CART_ROM_SWITCH_BANK_START = 16384;
var CART_ROM_SWITCH_BANK_END = 32767;
var TILE_SET_0_START = 32768;
var TILE_SET_0_END = 36863;
var TILE_SET_1_END = 38911;
var cartridgeRamStartAddress = 40960;
var cartridgeRamEndAddress = 49151;
var INTERNAL_RAM_BANK0_START = 49152;
var INTERNAL_RAM_BANK0_END = 53247;
var INTERNAL_RAM_SWITCH_BANK_START = 53248;
var INTERNAL_RAM_SWITCH_BANK_END = 57343;
var echoRamStartAddress = 57344;
var echoRamEndAddress = 65023;
var SPRITE_ATTRIBUTE_TABLE_START = 65024;
var SPRITE_ATTRIBUTE_TABLE_END = 65183;
var unusableMemoryStartAddress = 65184;
var unusableMemoryEndAddress = 65279;
var joypadAddress = 65280;
var serialDataAddress = 65281;
var serialControlAddress = 65282;
var divAddress = 65284;
var TIMA_REG = 65285;
var TMA_REG = 65286;
var timerControlAddress = 65287;
var INTERRUPT_FLAG_REG = 65295;
var soundChannelVolumeControlAddress = 65316;
var toggleBootRomControlAddress = 65360;
var undocumentedGbcOnlyAddress = 65388;
var interruptEnableAddress = 65535;

// vendor/jsgbc-core/src/Joypad.ts
var initialValue = 15;
var Joypad = class {
  constructor(gameboy) {
    this.gameboy = gameboy;
  }
  gameboy;
  value = 255;
  init() {
    this.gameboy.memory[joypadAddress] = initialValue;
  }
  down(key) {
    this.value &= 255 ^ 1 << key;
    if (this.gameboy.cartridge && !this.gameboy.cartridge.useGbcMode && (!this.gameboy.usedBootRom || !this.gameboy.usedGbcBootRom)) {
      this.gameboy.interruptRequestedFlags |= 1 << 4;
      this.gameboy.remainingClocks = 0;
      this.gameboy.checkIrqMatching();
    }
    this.writeMemory(joypadAddress, this.gameboy.memory[joypadAddress]);
    this.gameboy.cpu.stopped = false;
  }
  up(key) {
    this.value |= 1 << key;
    this.writeMemory(joypadAddress, this.gameboy.memory[joypadAddress]);
    this.gameboy.cpu.stopped = false;
  }
  writeMemory = (address, data) => {
    const switchBits = data & 48;
    const hasDirectionKeys = (data & 16) === 0;
    const directionNibble = this.value & 15;
    const hasButtonKeys = (data & 32) === 0;
    const buttonNibble = this.value >> 4 & 15;
    this.gameboy.memory[address] = switchBits + ((hasButtonKeys ? buttonNibble : 15) & (hasDirectionKeys ? directionNibble : 15));
  };
  readMemory = () => 192 | this.gameboy.memoryNew.readDirectly(joypadAddress);
};

// src/shims/events.js
var EventEmitter = class {
  constructor() {
    this._listeners = /* @__PURE__ */ new Map();
  }
  addListener(type, fn) {
    return this.on(type, fn);
  }
  on(type, fn) {
    const set = this._listeners.get(type) ?? /* @__PURE__ */ new Set();
    set.add(fn);
    this._listeners.set(type, set);
    return this;
  }
  once(type, fn) {
    const wrap = (...args) => {
      this.removeListener(type, wrap);
      fn(...args);
    };
    return this.on(type, wrap);
  }
  removeListener(type, fn) {
    this._listeners.get(type)?.delete(fn);
    return this;
  }
  off(type, fn) {
    return this.removeListener(type, fn);
  }
  emit(type, ...args) {
    const set = this._listeners.get(type);
    if (!set || set.size === 0) return false;
    for (const fn of [...set]) fn(...args);
    return true;
  }
  listenerCount(type) {
    return this._listeners.get(type)?.size ?? 0;
  }
};

// vendor/jsgbc-core/src/actions.ts
var Actions = class extends EventEmitter {
  map = {};
  register(action) {
    this.map[action] = true;
    return this;
  }
  getAll() {
    return Object.keys(this.map);
  }
  is(action) {
    return !!this.map[action];
  }
  down(action, options) {
    this.emit("Down" + action, options);
  }
  change(action, options) {
    this.emit("Change" + action, options);
  }
  up(action, options) {
    this.emit("Up" + action, options);
  }
};

// vendor/jsgbc-core/src/tickTable.ts
var tickTable_default = [
  // Number of machine cycles for each instruction:
  /*   0,  1,  2,  3,  4,  5,  6,  7,      8,  9,  A, B,  C,  D, E,  F*/
  4,
  12,
  8,
  8,
  4,
  4,
  8,
  4,
  20,
  8,
  8,
  8,
  4,
  4,
  8,
  4,
  //0
  4,
  12,
  8,
  8,
  4,
  4,
  8,
  4,
  12,
  8,
  8,
  8,
  4,
  4,
  8,
  4,
  //1
  8,
  12,
  8,
  8,
  4,
  4,
  8,
  4,
  8,
  8,
  8,
  8,
  4,
  4,
  8,
  4,
  //2
  8,
  12,
  8,
  8,
  12,
  12,
  12,
  4,
  8,
  8,
  8,
  8,
  4,
  4,
  8,
  4,
  //3
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  //4
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  //5
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  //6
  8,
  8,
  8,
  8,
  8,
  8,
  4,
  8,
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  //7
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  //8
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  //9
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  //A
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  4,
  4,
  4,
  4,
  4,
  4,
  8,
  4,
  //B
  8,
  12,
  12,
  16,
  12,
  16,
  8,
  16,
  8,
  16,
  12,
  0,
  12,
  24,
  8,
  16,
  //C
  8,
  12,
  12,
  4,
  12,
  16,
  8,
  16,
  8,
  16,
  12,
  4,
  12,
  4,
  8,
  16,
  //D
  12,
  12,
  8,
  4,
  4,
  16,
  8,
  16,
  16,
  4,
  16,
  4,
  4,
  4,
  8,
  16,
  //E
  12,
  12,
  8,
  4,
  4,
  16,
  8,
  16,
  12,
  8,
  16,
  4,
  0,
  4,
  8,
  16
  //F
];

// vendor/jsgbc-core/src/memory/Memory.ts
var Memory = class {
  constructor(gameboy, data = new Uint8Array(65536)) {
    this.gameboy = gameboy;
    this.data = data;
  }
  gameboy;
  data;
  readers = [];
  highReaders = [];
  writers = [];
  highWriters = [];
  read(address) {
    const reader = this.readers[address];
    if (!reader) throw new Error("no_reader");
    return reader(address);
  }
  readHigh(address) {
    address &= 255;
    const reader = this.highReaders[address];
    if (!reader) throw new Error("no_high_reader");
    return reader(65280 | address);
  }
  hasReader(address) {
    return !!this.readers[address];
  }
  hasHighReader(address) {
    address &= 255;
    return !!this.highReaders[address];
  }
  setReaders(from, to, reader) {
    for (let address = from; address <= to; address++) {
      this.setReader(address, reader);
    }
  }
  setReader(address, reader) {
    this.readers[address] = reader;
  }
  setHighReaders(from, to, reader) {
    for (let address = from; address <= to; address++) {
      this.setHighReader(address, reader);
    }
  }
  setHighReader(address, reader) {
    address &= 255;
    this.highReaders[address] = reader;
  }
  write(address, value) {
    const writer = this.writers[address];
    if (!writer) throw new Error("no_writer");
    return writer(address, value);
  }
  writeHigh(address, data) {
    address &= 255;
    const writer = this.highWriters[address];
    if (!writer) throw new Error("no_high_writer");
    return writer(65280 | address, data);
  }
  hasWriter(address) {
    return !!this.writers[address];
  }
  hasHighWriter(address) {
    address &= 255;
    return !!this.highWriters[address];
  }
  setWriters(from, to, writer) {
    for (let address = from; address <= to; address++) {
      this.setWriter(address, writer);
    }
  }
  setWriter(address, writer) {
    this.writers[address] = writer;
  }
  setHighWriter(address, writer) {
    address &= 255;
    this.highWriters[address] = writer;
  }
  init() {
    this.setReaders(INTERRUPT_VECTORS_START, CART_ROM_BANK0_END, (address) => this.data[address]);
    this.setReaders(
      CART_ROM_SWITCH_BANK_START,
      CART_ROM_SWITCH_BANK_END,
      (address) => this.gameboy.cartridge.rom.getByte(
        (this.gameboy.cartridge?.mbc?.currentRomBank || 0) + address
      )
    );
    this.setReaders(TILE_SET_0_START, TILE_SET_1_END, this.gameboy.cartridge.useGbcMode ? this.gameboy.readGbcVideoRam : this.gameboy.readVideoRam);
    this.setReaders(cartridgeRamStartAddress, cartridgeRamEndAddress, this.gameboy.cartridge.useGbcMode ? this.gameboy.readGbcCharacterVideoRam : this.gameboy.readCharacterVideoRam);
    if (this.gameboy.cartridge?.mbc?.ramSize === 0) {
      this.setReaders(cartridgeRamStartAddress, cartridgeRamEndAddress, this.readBad);
    } else if (this.gameboy.cartridge.hasMbc7) {
      this.setReaders(cartridgeRamStartAddress, cartridgeRamEndAddress, this.gameboy.cartridge.mbc?.readRam || this.readBad);
    } else if (this.gameboy.cartridge.hasMbc3) {
      this.setReaders(cartridgeRamStartAddress, cartridgeRamEndAddress, this.gameboy.cartridge.mbc?.readRam || this.readBad);
    } else {
      this.setReaders(cartridgeRamStartAddress, cartridgeRamEndAddress, this.gameboy.cartridge.mbc?.readRam || this.readBad);
    }
    this.setReaders(INTERNAL_RAM_BANK0_START, INTERNAL_RAM_BANK0_END, this.readDirectly);
    if (this.gameboy.cartridge?.useGbcMode) {
      this.setReaders(INTERNAL_RAM_SWITCH_BANK_START, INTERNAL_RAM_SWITCH_BANK_END, this.gameboy.memoryReadGBCMemory);
    } else {
      this.setReaders(INTERNAL_RAM_SWITCH_BANK_START, INTERNAL_RAM_SWITCH_BANK_END, this.readDirectly);
    }
    this.setReaders(echoRamStartAddress, 61439, this.gameboy.readEchoRam);
    if (this.gameboy.cartridge?.useGbcMode) {
      this.setReaders(61440, echoRamEndAddress, this.gameboy.readGbcEchoRam);
    } else {
      this.setReaders(61440, echoRamEndAddress, this.gameboy.readEchoRam);
    }
    this.setReaders(SPRITE_ATTRIBUTE_TABLE_START, SPRITE_ATTRIBUTE_TABLE_END, this.gameboy.memoryReadOAM);
    if (this.gameboy.cartridge?.useGbcMode) {
      this.setReaders(unusableMemoryStartAddress, unusableMemoryEndAddress, this.readDirectly);
    }
    this.setWriter(joypadAddress, this.gameboy.joypad.writeMemory);
    this.setHighWriter(joypadAddress, this.gameboy.joypad.writeMemory);
    this.setReader(joypadAddress, this.gameboy.joypad.readMemory);
    this.setHighReader(joypadAddress, this.gameboy.joypad.readMemory);
    const serialDataReader = () => this.readDirectly(serialControlAddress) < 128 ? this.readDirectly(serialDataAddress) : 255;
    this.setReader(serialDataAddress, serialDataReader);
    this.setHighReader(serialDataAddress, serialDataReader);
    const serialControlReader = this.gameboy.cartridge.useGbcMode ? () => (this.gameboy.serialTimer <= 0 ? 124 : 252) | this.readDirectly(serialControlAddress) : () => (this.gameboy.serialTimer <= 0 ? 126 : 254) | this.readDirectly(serialControlAddress);
    this.setReader(serialControlAddress, serialControlReader);
    this.setHighReader(serialControlAddress, serialControlReader);
    this.setReader(65283, this.readBad);
    this.setHighReader(65283, this.readBad);
    const divReader = () => {
      this.gameboy.memory[divAddress] = this.readDirectly(divAddress) + (this.gameboy.DIVTicks >> 8) & 255;
      this.gameboy.DIVTicks &= 255;
      return this.readDirectly(divAddress);
    };
    this.setReader(divAddress, divReader);
    this.setHighReader(divAddress, divReader);
    this.setReader(TIMA_REG, this.readDirectly);
    this.setHighReader(TIMA_REG, this.gameboy.memoryHighReadNormal);
    this.setReader(TMA_REG, this.readDirectly);
    this.setHighReader(TMA_REG, this.gameboy.memoryHighReadNormal);
    const timerControlReader = () => 248 | this.readDirectly(timerControlAddress);
    this.setReader(timerControlAddress, timerControlReader);
    this.setHighReader(timerControlAddress, timerControlReader);
    this.setReaders(65288, 65294, this.readBad);
    this.setHighReaders(65288, 65294, this.readBad);
    const interruptFlagReader = () => 224 | this.gameboy.interruptRequestedFlags;
    this.setReader(INTERRUPT_FLAG_REG, interruptFlagReader);
    this.setHighReader(INTERRUPT_FLAG_REG, interruptFlagReader);
    this.memoryReadJumpCompile();
    this.memoryWriteJumpCompile();
  }
  updateIoRegisters() {
    if (this.gameboy.isBootingRom) {
      this.enableBootRomControl();
      if (this.gameboy.cartridge.useGbcMode) {
        const undocumentedGbcOnlyWriter = (address, data) => {
          data &= 1;
          if (this.gameboy.isBootingRom) {
            this.gameboy.cartridge.setGbcMode(data);
          }
          this.data[undocumentedGbcOnlyAddress] = data;
        };
        this.setWriter(undocumentedGbcOnlyAddress, undocumentedGbcOnlyWriter);
        this.setHighWriter(undocumentedGbcOnlyAddress, undocumentedGbcOnlyWriter);
      }
    } else {
      this.disableBootRomControl();
    }
  }
  enableBootRomControl() {
    const disableBootRom = (address, data) => {
      console.log("Bootstrap process has ended");
      this.gameboy.isBootingRom = false;
      this.gameboy.disableBootRom();
      this.data[toggleBootRomControlAddress] = data;
    };
    this.setWriter(toggleBootRomControlAddress, disableBootRom);
    this.setHighWriter(toggleBootRomControlAddress, disableBootRom);
  }
  disableBootRomControl() {
    this.setWriter(toggleBootRomControlAddress, this.writeIllegal);
    this.setHighWriter(toggleBootRomControlAddress, this.writeIllegal);
  }
  writeIllegal = (address, data) => {
  };
  readBad = (address) => {
    return 255;
  };
  readDirectly = (address) => {
    return this.data[address];
  };
  memoryReadJumpCompile() {
    for (let address = 0; address <= 65535; address++) {
      if (address >= 65280) {
        switch (address) {
          case 65296:
            this.gameboy.highMemoryReader[16] = this.gameboy.memoryReader[65296] = (address2) => {
              return 128 | this.gameboy.memory[65296];
            };
            break;
          case 65297:
            this.gameboy.highMemoryReader[17] = this.gameboy.memoryReader[65297] = (address2) => {
              return 63 | this.gameboy.memory[65297];
            };
            break;
          case 65298:
            this.gameboy.highMemoryReader[18] = this.gameboy.memoryHighReadNormal;
            this.gameboy.memoryReader[65298] = this.readDirectly;
            break;
          case 65299:
            this.gameboy.highMemoryReader[19] = this.gameboy.memoryReader[65299] = this.readBad;
            break;
          case 65300:
            this.gameboy.highMemoryReader[20] = this.gameboy.memoryReader[65300] = (address2) => {
              return 191 | this.gameboy.memory[65300];
            };
            break;
          case 65301:
            this.gameboy.highMemoryReader[21] = this.readBad;
            this.gameboy.memoryReader[65301] = this.readBad;
            break;
          case 65302:
            this.gameboy.highMemoryReader[22] = this.gameboy.memoryReader[65302] = (address2) => {
              return 63 | this.gameboy.memory[65302];
            };
            break;
          case 65303:
            this.gameboy.highMemoryReader[23] = this.gameboy.memoryHighReadNormal;
            this.gameboy.memoryReader[65303] = this.readDirectly;
            break;
          case 65304:
            this.gameboy.highMemoryReader[24] = this.gameboy.memoryReader[65304] = this.readBad;
            break;
          case 65305:
            this.gameboy.highMemoryReader[25] = this.gameboy.memoryReader[65305] = (address2) => {
              return 191 | this.gameboy.memory[65305];
            };
            break;
          case 65306:
            this.gameboy.highMemoryReader[26] = this.gameboy.memoryReader[65306] = (address2) => {
              return 127 | this.gameboy.memory[65306];
            };
            break;
          case 65307:
            this.gameboy.highMemoryReader[27] = this.gameboy.memoryReader[65307] = this.readBad;
            break;
          case 65308:
            this.gameboy.highMemoryReader[28] = this.gameboy.memoryReader[65308] = (address2) => {
              return 159 | this.gameboy.memory[65308];
            };
            break;
          case 65309:
            this.gameboy.highMemoryReader[29] = this.gameboy.memoryReader[65309] = this.readBad;
            break;
          case 65310:
            this.gameboy.highMemoryReader[30] = this.gameboy.memoryReader[65310] = (address2) => {
              return 191 | this.gameboy.memory[65310];
            };
            break;
          case 65311:
          case 65312:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryReader[address] = this.readBad;
            break;
          case 65313:
          case 65314:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryHighReadNormal;
            this.gameboy.memoryReader[address] = this.readDirectly;
            break;
          case 65315:
            this.gameboy.highMemoryReader[35] = this.gameboy.memoryReader[65315] = (address2) => {
              return 191 | this.gameboy.memory[65315];
            };
            break;
          case 65316:
          case 65317:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryHighReadNormal;
            this.gameboy.memoryReader[address] = this.readDirectly;
            break;
          case 65318:
            this.gameboy.highMemoryReader[38] = this.gameboy.memoryReader[65318] = (address2) => {
              this.gameboy.audioController.run();
              return 112 | this.gameboy.memory[65318];
            };
            break;
          case 65319:
          case 65320:
          case 65321:
          case 65322:
          case 65323:
          case 65324:
          case 65325:
          case 65326:
          case 65327:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryReader[address] = this.readBad;
            break;
          case 65328:
          case 65329:
          case 65330:
          case 65331:
          case 65332:
          case 65333:
          case 65334:
          case 65335:
          case 65336:
          case 65337:
          case 65338:
          case 65339:
          case 65340:
          case 65341:
          case 65342:
          case 65343:
            this.gameboy.memoryReader[address] = (address2) => {
              return this.gameboy.audioController.channel3CanPlay ? this.gameboy.memory[65280 | this.gameboy.audioController.channel3LastSampleLookup >> 1] : this.gameboy.memory[address2];
            };
            this.gameboy.highMemoryReader[address & 255] = (address2) => {
              return this.gameboy.audioController.channel3CanPlay ? this.gameboy.memory[65280 | this.gameboy.audioController.channel3LastSampleLookup >> 1] : this.gameboy.memory[65280 | address2];
            };
            break;
          case 65344:
            this.gameboy.highMemoryReader[64] = this.gameboy.memoryHighReadNormal;
            this.gameboy.memoryReader[65344] = this.readDirectly;
            break;
          case 65345:
            this.gameboy.highMemoryReader[65] = this.gameboy.memoryReader[65345] = (address2) => {
              return 128 | this.gameboy.memory[65345] | this.gameboy.modeSTAT;
            };
            break;
          case 65346:
            this.gameboy.highMemoryReader[66] = this.gameboy.memoryReader[65346] = (address2) => {
              return this.gameboy.backgroundY;
            };
            break;
          case 65347:
            this.gameboy.highMemoryReader[67] = this.gameboy.memoryReader[65347] = (address2) => {
              return this.gameboy.backgroundX;
            };
            break;
          case 65348:
            this.gameboy.highMemoryReader[68] = this.gameboy.memoryReader[65348] = (address2) => {
              return this.gameboy.gpu.lcdEnabled ? this.gameboy.memory[65348] : 0;
            };
            break;
          case 65349:
          case 65350:
          case 65351:
          case 65352:
          case 65353:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryHighReadNormal;
            this.gameboy.memoryReader[address] = this.readDirectly;
            break;
          case 65354:
            this.gameboy.highMemoryReader[74] = this.gameboy.memoryReader[65354] = (address2) => {
              return this.gameboy.windowY;
            };
            break;
          case 65355:
            this.gameboy.highMemoryReader[75] = this.gameboy.memoryHighReadNormal;
            this.gameboy.memoryReader[65355] = this.readDirectly;
            break;
          case 65356:
            this.gameboy.highMemoryReader[76] = this.gameboy.memoryReader[65356] = this.readBad;
            break;
          case 65357:
            this.gameboy.highMemoryReader[77] = this.gameboy.memoryHighReadNormal;
            this.gameboy.memoryReader[65357] = this.readDirectly;
            break;
          case 65358:
            this.gameboy.highMemoryReader[78] = this.gameboy.memoryReader[65358] = this.readBad;
            break;
          case 65359:
            this.gameboy.highMemoryReader[79] = this.gameboy.memoryReader[65359] = (address2) => {
              return this.gameboy.currentVideoRamBank;
            };
            break;
          case toggleBootRomControlAddress:
          case 65361:
          case 65362:
          case 65363:
          case 65364:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryHighReadNormal;
            this.gameboy.memoryReader[address] = this.readDirectly;
            break;
          case 65365:
            if (this.gameboy.cartridge.useGbcMode) {
              this.gameboy.highMemoryReader[85] = this.gameboy.memoryReader[65365] = (address2) => {
                if (!this.gameboy.gpu.lcdEnabled && this.gameboy.hdmaRunning) {
                  this.gameboy.writeDirectlyToMemory((this.gameboy.memory[65365] & 127) + 1);
                  this.gameboy.memory[65365] = 255;
                  this.gameboy.hdmaRunning = false;
                }
                return this.gameboy.memory[65365];
              };
            } else {
              this.gameboy.memoryReader[65365] = this.readDirectly;
              this.gameboy.highMemoryReader[85] = this.gameboy.memoryHighReadNormal;
            }
            break;
          case 65366:
            if (this.gameboy.cartridge.useGbcMode) {
              this.gameboy.highMemoryReader[86] = this.gameboy.memoryReader[65366] = (address2) => {
                return 60 | (this.gameboy.memory[65366] >= 192 ? 2 | this.gameboy.memory[65366] & 193 : this.gameboy.memory[65366] & 195);
              };
            } else {
              this.gameboy.memoryReader[65366] = this.readDirectly;
              this.gameboy.highMemoryReader[86] = this.gameboy.memoryHighReadNormal;
            }
            break;
          case 65367:
          case 65368:
          case 65369:
          case 65370:
          case 65371:
          case 65372:
          case 65373:
          case 65374:
          case 65375:
          case 65376:
          case 65377:
          case 65378:
          case 65379:
          case 65380:
          case 65381:
          case 65382:
          case 65383:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryReader[address] = this.readBad;
            break;
          case 65384:
          case 65385:
          case 65386:
          case 65387:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryHighReadNormal;
            this.gameboy.memoryReader[address] = this.readDirectly;
            break;
          case 65388:
            if (this.gameboy.cartridge.useGbcMode) {
              this.gameboy.highMemoryReader[108] = this.gameboy.memoryReader[65388] = (address2) => {
                return 254 | this.gameboy.memory[65388];
              };
            } else {
              this.gameboy.highMemoryReader[108] = this.gameboy.memoryReader[65388] = this.readBad;
            }
            break;
          case 65389:
          case 65390:
          case 65391:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryReader[address] = this.readBad;
            break;
          case 65392:
            if (this.gameboy.cartridge.useGbcMode) {
              this.gameboy.highMemoryReader[112] = this.gameboy.memoryReader[65392] = (address2) => {
                return 64 | this.gameboy.memory[65392];
              };
            } else {
              this.gameboy.highMemoryReader[112] = this.gameboy.memoryReader[65392] = this.readBad;
            }
            break;
          case 65393:
            this.gameboy.highMemoryReader[113] = this.gameboy.memoryReader[65393] = this.readBad;
            break;
          case 65394:
          case 65395:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryReader[address] = this.readDirectly;
            break;
          case 65396:
            if (this.gameboy.cartridge.useGbcMode) {
              this.gameboy.highMemoryReader[116] = this.gameboy.memoryReader[65396] = this.readDirectly;
            } else {
              this.gameboy.highMemoryReader[116] = this.gameboy.memoryReader[65396] = this.readBad;
            }
            break;
          case 65397:
            this.gameboy.highMemoryReader[117] = this.gameboy.memoryReader[65397] = (address2) => {
              return 143 | this.gameboy.memory[65397];
            };
            break;
          case 65398:
            this.gameboy.highMemoryReader[118] = this.gameboy.memoryReader[65398] = (address2) => {
              this.gameboy.audioController.run();
              return this.gameboy.audioController.channel2.envelopeVolume << 4 | this.gameboy.audioController.channel1.envelopeVolume;
            };
            break;
          case 65399:
            this.gameboy.highMemoryReader[119] = this.gameboy.memoryReader[65399] = (address2) => {
              this.gameboy.audioController.run();
              return this.gameboy.audioController.channel4EnvelopeVolume << 4 | this.gameboy.audioController.channel3envelopeVolume;
            };
            break;
          case 65400:
          case 65401:
          case 65402:
          case 65403:
          case 65404:
          case 65405:
          case 65406:
          case 65407:
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryReader[address] = this.readBad;
            break;
          case interruptEnableAddress:
            this.gameboy.highMemoryReader[255] = this.gameboy.memoryReader[interruptEnableAddress] = (address2) => this.gameboy.interruptEnabledFlags;
            break;
          default:
            this.gameboy.memoryReader[address] = this.readDirectly;
            this.gameboy.highMemoryReader[address & 255] = this.gameboy.memoryHighReadNormal;
        }
      } else {
        this.gameboy.memoryReader[address] = this.readBad;
      }
    }
  }
  memoryWriteJumpCompile() {
    for (let address = 0; address <= 65535; address++) {
      if (address <= CART_ROM_SWITCH_BANK_END) {
        if (this.gameboy.cartridge.hasMbc1) {
          if (address < 8192) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc.toggle;
          } else if (address < 16384) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc1.writeRomBank;
          } else if (address < 24576) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc1.writeRamBank;
          } else {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc1.writeType;
          }
        } else if (this.gameboy.cartridge.hasMbc2) {
          if (address < 4096) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc.toggle;
          } else if (address >= 8448 && address < 8704) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc2.writeRomBank;
          } else {
            this.gameboy.memoryWriter[address] = this.writeIllegal;
          }
        } else if (this.gameboy.cartridge.hasMbc3) {
          if (address < 8192) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc.toggle;
          } else if (address < 16384) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc3.writeRomBank;
          } else if (address < 24576) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc3.writeRamBank;
          } else {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc3.rtc.writeLatch;
          }
        } else if (this.gameboy.cartridge.hasMbc5 || this.gameboy.cartridge.hasMbc7 || this.gameboy.cartridge.hasRumble) {
          if (address < 8192) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc.toggle;
          } else if (address < 12288) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc5.writRomBank;
          } else if (address < 16384) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc5.writeHighRomBank;
          } else if (address < 24576) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.hasRumble ? this.gameboy.cartridge.rumble.writeRamBank : this.gameboy.cartridge.mbc5.writeRamBank;
          } else {
            this.gameboy.memoryWriter[address] = this.writeIllegal;
          }
        } else if (this.gameboy.cartridge.hasHuc3) {
          if (address < 8192) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc.toggle;
          } else if (address < 16384) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc3.writeRomBank;
          } else if (address < 24576) {
            this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc3.writeHuc3RamBank;
          } else {
            this.gameboy.memoryWriter[address] = this.writeIllegal;
          }
        } else {
          this.gameboy.memoryWriter[address] = this.writeIllegal;
        }
      } else if (address <= TILE_SET_0_END) {
        this.gameboy.memoryWriter[address] = this.gameboy.cartridge.useGbcMode ? this.gameboy.VRAMGBCDATAWrite : this.gameboy.VRAMGBDATAWrite;
      } else if (address < 38912) {
        this.gameboy.memoryWriter[address] = this.gameboy.cartridge.useGbcMode ? this.gameboy.VRAMGBCDATAWrite : this.gameboy.VRAMGBDATAUpperWrite;
      } else if (address < 40960) {
        this.gameboy.memoryWriter[address] = this.gameboy.cartridge.useGbcMode ? this.gameboy.VRAMGBCCHRMAPWrite : this.gameboy.VRAMGBCHRMAPWrite;
      } else if (address < 49152) {
        if (this.gameboy.cartridge?.mbc?.ramSize > 0) {
          this.gameboy.memoryWriter[address] = this.gameboy.cartridge.mbc.writeRam;
        } else {
          this.gameboy.memoryWriter[address] = this.writeIllegal;
        }
      } else if (address < 57344) {
        if (this.gameboy.cartridge.useGbcMode && address >= 53248) {
          this.gameboy.memoryWriter[address] = this.gameboy.memoryWriteGBCRAM;
        } else {
          this.gameboy.memoryWriter[address] = this.gameboy.memoryWriteNormal;
        }
      } else if (address < 65024) {
        if (this.gameboy.cartridge.useGbcMode && address >= 61440) {
          this.gameboy.memoryWriter[address] = this.gameboy.memoryWriteECHOGBCRAM;
        } else {
          this.gameboy.memoryWriter[address] = this.gameboy.memoryWriteECHONormal;
        }
      } else if (address <= 65184) {
        this.gameboy.memoryWriter[address] = this.gameboy.memoryWriteOAMRAM;
      } else if (address < 65280) {
        if (this.gameboy.cartridge.useGbcMode) {
          this.gameboy.memoryWriter[address] = this.gameboy.memoryWriteNormal;
        } else {
          this.gameboy.memoryWriter[address] = this.writeIllegal;
        }
      } else {
        this.gameboy.memoryWriter[address] = this.gameboy.memoryWriteNormal;
        this.gameboy.highMemoryWriter[address & 255] = this.gameboy.memoryHighWriteNormal;
      }
    }
    this.registerIOMemoryWriters();
  }
  registerIOMemoryWriters() {
    this.gameboy.highMemoryWriter[1] = this.gameboy.memoryWriter[serialDataAddress] = (address, data) => {
      if (this.gameboy.memory[serialControlAddress] < 128) {
        this.gameboy.memory[serialDataAddress] = data;
      }
    };
    this.gameboy.highMemoryWriter[2] = this.gameboy.memoryHighWriteNormal;
    this.gameboy.memoryWriter[serialControlAddress] = this.gameboy.memoryWriteNormal;
    this.gameboy.highMemoryWriter[3] = this.gameboy.memoryWriter[65283] = this.writeIllegal;
    this.gameboy.highMemoryWriter[4] = this.gameboy.memoryWriter[divAddress] = (address, data) => {
      this.gameboy.DIVTicks &= 255;
      this.gameboy.memory[divAddress] = 0;
    };
    this.gameboy.highMemoryWriter[5] = this.gameboy.memoryWriter[65285] = (address, data) => {
      this.gameboy.memory[65285] = data;
    };
    this.gameboy.highMemoryWriter[6] = this.gameboy.memoryWriter[65286] = (address, data) => {
      this.gameboy.memory[65286] = data;
    };
    this.gameboy.highMemoryWriter[7] = this.gameboy.memoryWriter[65287] = (address, data) => {
      this.gameboy.memory[65287] = data & 7;
      this.gameboy.TIMAEnabled = (data & 4) === 4;
      this.gameboy.TACClocker = Math.pow(4, (data & 3) !== 0 ? data & 3 : 4) << 2;
    };
    this.gameboy.highMemoryWriter[8] = this.gameboy.memoryWriter[65288] = this.writeIllegal;
    this.gameboy.highMemoryWriter[9] = this.gameboy.memoryWriter[65289] = this.writeIllegal;
    this.gameboy.highMemoryWriter[10] = this.gameboy.memoryWriter[65290] = this.writeIllegal;
    this.gameboy.highMemoryWriter[11] = this.gameboy.memoryWriter[65291] = this.writeIllegal;
    this.gameboy.highMemoryWriter[12] = this.gameboy.memoryWriter[65292] = this.writeIllegal;
    this.gameboy.highMemoryWriter[13] = this.gameboy.memoryWriter[65293] = this.writeIllegal;
    this.gameboy.highMemoryWriter[14] = this.gameboy.memoryWriter[65294] = this.writeIllegal;
    this.gameboy.highMemoryWriter[15] = this.gameboy.memoryWriter[65295] = (address, data) => {
      this.gameboy.interruptRequestedFlags = data;
      this.gameboy.checkIrqMatching();
    };
    this.gameboy.audioController.registerMemoryWriters();
    this.gameboy.highMemoryWriter[39] = this.gameboy.memoryWriter[65319] = this.writeIllegal;
    this.gameboy.highMemoryWriter[40] = this.gameboy.memoryWriter[65320] = this.writeIllegal;
    this.gameboy.highMemoryWriter[41] = this.gameboy.memoryWriter[65321] = this.writeIllegal;
    this.gameboy.highMemoryWriter[42] = this.gameboy.memoryWriter[65322] = this.writeIllegal;
    this.gameboy.highMemoryWriter[43] = this.gameboy.memoryWriter[65323] = this.writeIllegal;
    this.gameboy.highMemoryWriter[44] = this.gameboy.memoryWriter[65324] = this.writeIllegal;
    this.gameboy.highMemoryWriter[45] = this.gameboy.memoryWriter[65325] = this.writeIllegal;
    this.gameboy.highMemoryWriter[46] = this.gameboy.memoryWriter[65326] = this.writeIllegal;
    this.gameboy.highMemoryWriter[47] = this.gameboy.memoryWriter[65327] = this.writeIllegal;
    this.gameboy.audioController.registerWaveformMemoryWriters();
    this.gameboy.highMemoryWriter[66] = this.gameboy.memoryWriter[65346] = (address, data) => {
      if (this.gameboy.backgroundY !== data) {
        this.gameboy.midScanlineJIT();
        this.gameboy.backgroundY = data;
      }
    };
    this.gameboy.highMemoryWriter[67] = this.gameboy.memoryWriter[65347] = (address, data) => {
      if (this.gameboy.backgroundX !== data) {
        this.gameboy.midScanlineJIT();
        this.gameboy.backgroundX = data;
      }
    };
    this.gameboy.highMemoryWriter[68] = this.gameboy.memoryWriter[65348] = (address, data) => {
      if (this.gameboy.gpu.lcdEnabled) {
        this.gameboy.modeSTAT = 2;
        this.gameboy.midScanlineOffset = -1;
        this.gameboy.cpu.totalLinesPassed = this.gameboy.currentX = this.gameboy.queuedScanlines = this.gameboy.lastUnrenderedLine = this.gameboy.LCDTicks = this.gameboy.STATTracker = this.gameboy.actualScanline = this.gameboy.memory[65348] = 0;
      }
    };
    this.gameboy.highMemoryWriter[69] = this.gameboy.memoryWriter[65349] = (address, data) => {
      if (this.gameboy.memory[65349] !== data) {
        this.gameboy.memory[65349] = data;
        if (this.gameboy.gpu.lcdEnabled) {
          this.gameboy.matchLYC();
        }
      }
    };
    this.gameboy.highMemoryWriter[74] = this.gameboy.memoryWriter[65354] = (address, data) => {
      if (this.gameboy.windowY !== data) {
        this.gameboy.midScanlineJIT();
        this.gameboy.windowY = data;
      }
    };
    this.gameboy.highMemoryWriter[75] = this.gameboy.memoryWriter[65355] = (address, data) => {
      if (this.gameboy.memory[65355] !== data) {
        this.gameboy.midScanlineJIT();
        this.gameboy.memory[65355] = data;
        this.gameboy.windowX = data - 7;
      }
    };
    this.gameboy.highMemoryWriter[114] = this.gameboy.memoryWriter[65394] = (address, data) => {
      this.gameboy.memory[65394] = data;
    };
    this.gameboy.highMemoryWriter[115] = this.gameboy.memoryWriter[65395] = (address, data) => {
      this.gameboy.memory[65395] = data;
    };
    this.gameboy.highMemoryWriter[117] = this.gameboy.memoryWriter[65397] = (address, data) => {
      this.gameboy.memory[65397] = data;
    };
    this.gameboy.highMemoryWriter[118] = this.gameboy.memoryWriter[65398] = this.writeIllegal;
    this.gameboy.highMemoryWriter[119] = this.gameboy.memoryWriter[65399] = this.writeIllegal;
    this.gameboy.highMemoryWriter[255] = this.gameboy.memoryWriter[interruptEnableAddress] = (address, data) => {
      this.gameboy.interruptEnabledFlags = data;
      this.gameboy.checkIrqMatching();
    };
    this.recompileModelSpecificIOWriteHandling();
    this.updateIoRegisters();
  }
  recompileModelSpecificIOWriteHandling() {
    if (this.gameboy.cartridge.useGbcMode) {
      this.gameboy.highMemoryWriter[2] = this.gameboy.memoryWriter[serialControlAddress] = (address, data) => {
        if ((data & 1) === 1) {
          this.gameboy.memory[serialControlAddress] = data & 127;
          this.gameboy.serialTimer = (data & 2) === 0 ? 4096 : 128;
          this.gameboy.serialShiftTimer = this.gameboy.serialShiftTimerAllocated = (data & 2) === 0 ? 512 : 16;
        } else {
          this.gameboy.memory[serialControlAddress] = data;
          this.gameboy.serialShiftTimer = this.gameboy.serialShiftTimerAllocated = this.gameboy.serialTimer = 0;
        }
      };
      this.gameboy.highMemoryWriter[64] = this.gameboy.memoryWriter[65344] = (address, data) => {
        if (this.gameboy.memory[65344] !== data) {
          this.gameboy.midScanlineJIT();
          const isLcdOn = data > 127;
          if (isLcdOn !== this.gameboy.gpu.lcdEnabled) {
            this.gameboy.gpu.lcdEnabled = isLcdOn;
            this.gameboy.memory[65345] &= 120;
            this.gameboy.midScanlineOffset = -1;
            this.gameboy.cpu.totalLinesPassed = this.gameboy.currentX = this.gameboy.queuedScanlines = this.gameboy.lastUnrenderedLine = this.gameboy.STATTracker = this.gameboy.LCDTicks = this.gameboy.actualScanline = this.gameboy.memory[65348] = 0;
            if (this.gameboy.gpu.lcdEnabled) {
              this.gameboy.modeSTAT = 2;
              this.gameboy.matchLYC();
              this.gameboy.gpu.enableLCD();
            } else {
              this.gameboy.modeSTAT = 0;
              this.gameboy.gpu.disableLCD();
              this.gameboy.lcdDevice.turnOff();
            }
            this.gameboy.interruptRequestedFlags &= 253;
          }
          this.gameboy.gfxWindowCHRBankPosition = (data & 64) === 64 ? 1024 : 0;
          this.gameboy.gfxWindowDisplay = (data & 32) === 32;
          this.gameboy.gfxBackgroundBankOffset = (data & 16) === 16 ? 0 : 128;
          this.gameboy.gfxBackgroundCHRBankPosition = (data & 8) === 8 ? 1024 : 0;
          this.gameboy.gfxSpriteNormalHeight = (data & 4) === 0;
          this.gameboy.gfxSpriteShow = (data & 2) === 2;
          this.gameboy.hasBackgroundPriority = (data & 1) === 1;
          this.gameboy.gpu.initRenderer();
          this.gameboy.memory[65344] = data;
        }
      };
      this.gameboy.highMemoryWriter[65] = this.gameboy.memoryWriter[65345] = (address, data) => {
        this.gameboy.LYCMatchTriggerSTAT = (data & 64) === 64;
        this.gameboy.mode2TriggerSTAT = (data & 32) === 32;
        this.gameboy.mode1TriggerSTAT = (data & 16) === 16;
        this.gameboy.mode0TriggerSTAT = (data & 8) === 8;
        this.gameboy.memory[65345] = data & 120;
      };
      this.gameboy.highMemoryWriter[70] = this.gameboy.memoryWriter[65350] = (address, data) => {
        this.gameboy.memory[65350] = data;
        if (data < 224) {
          data <<= 8;
          address = 65024;
          const stat = this.gameboy.modeSTAT;
          this.gameboy.modeSTAT = 0;
          do {
            const newData = this.readDirectly(data++);
            if (newData !== this.gameboy.memory[address]) {
              this.gameboy.modeSTAT = stat;
              this.gameboy.graphicsJIT();
              this.gameboy.modeSTAT = 0;
              this.gameboy.memory[address++] = newData;
              break;
            }
          } while (++address < 65184);
          if (address < 65184) {
            do {
              this.gameboy.memory[address++] = this.readDirectly(data++);
              this.gameboy.memory[address++] = this.readDirectly(data++);
              this.gameboy.memory[address++] = this.readDirectly(data++);
              this.gameboy.memory[address++] = this.readDirectly(data++);
            } while (address < 65184);
          }
          this.gameboy.modeSTAT = stat;
        }
      };
      this.gameboy.highMemoryWriter[77] = this.gameboy.memoryWriter[65357] = (address, data) => {
        this.gameboy.memory[65357] = data & 127 | this.gameboy.memory[65357] & 128;
      };
      this.gameboy.highMemoryWriter[79] = this.gameboy.memoryWriter[65359] = (address, data) => {
        this.gameboy.currentVideoRamBank = data & 1;
        if (this.gameboy.currentVideoRamBank > 0) {
          this.gameboy.BGCHRCurrentBank = this.gameboy.BGCHRBank2;
        } else {
          this.gameboy.BGCHRCurrentBank = this.gameboy.BGCHRBank1;
        }
      };
      this.gameboy.highMemoryWriter[81] = this.gameboy.memoryWriter[65361] = (address, data) => {
        if (!this.gameboy.hdmaRunning) {
          this.gameboy.memory[65361] = data;
        }
      };
      this.gameboy.highMemoryWriter[82] = this.gameboy.memoryWriter[65362] = (address, data) => {
        if (!this.gameboy.hdmaRunning) {
          this.gameboy.memory[65362] = data & 240;
        }
      };
      this.gameboy.highMemoryWriter[83] = this.gameboy.memoryWriter[65363] = (address, data) => {
        if (!this.gameboy.hdmaRunning) {
          this.gameboy.memory[65363] = data & 31;
        }
      };
      this.gameboy.highMemoryWriter[84] = this.gameboy.memoryWriter[65364] = (address, data) => {
        if (!this.gameboy.hdmaRunning) {
          this.gameboy.memory[65364] = data & 240;
        }
      };
      this.gameboy.highMemoryWriter[85] = this.gameboy.memoryWriter[65365] = (address, data) => {
        if (!this.gameboy.hdmaRunning) {
          if ((data & 128) === 0) {
            this.gameboy.writeDirectlyToMemory((data & 127) + 1);
            this.gameboy.memory[65365] = 255;
          } else {
            this.gameboy.hdmaRunning = true;
            this.gameboy.memory[65365] = data & 127;
          }
        } else if ((data & 128) === 0) {
          this.gameboy.hdmaRunning = false;
          this.gameboy.memory[65365] |= 128;
        } else {
          this.gameboy.memory[65365] = data & 127;
        }
      };
      this.gameboy.highMemoryWriter[104] = this.gameboy.memoryWriter[65384] = (address, data) => {
        this.gameboy.memory[65385] = this.gameboy.gbcBGRawPalette[data & 63];
        this.gameboy.memory[65384] = data;
      };
      this.gameboy.highMemoryWriter[105] = this.gameboy.memoryWriter[65385] = (address, data) => {
        this.gameboy.updateGBCBGPalette(this.gameboy.memory[65384] & 63, data);
        if (this.gameboy.memory[65384] > 127) {
          var next = this.gameboy.memory[65384] + 1 & 63;
          this.gameboy.memory[65384] = next | 128;
          this.gameboy.memory[65385] = this.gameboy.gbcBGRawPalette[next];
        } else {
          this.gameboy.memory[65385] = data;
        }
      };
      this.gameboy.highMemoryWriter[106] = this.gameboy.memoryWriter[65386] = (address, data) => {
        this.gameboy.memory[65387] = this.gameboy.gbcOBJRawPalette[data & 63];
        this.gameboy.memory[65386] = data;
      };
      this.gameboy.highMemoryWriter[107] = this.gameboy.memoryWriter[65387] = (address, data) => {
        this.gameboy.updateGBCOBJPalette(this.gameboy.memory[65386] & 63, data);
        if (this.gameboy.memory[65386] > 127) {
          var next = this.gameboy.memory[65386] + 1 & 63;
          this.gameboy.memory[65386] = next | 128;
          this.gameboy.memory[65387] = this.gameboy.gbcOBJRawPalette[next];
        } else {
          this.gameboy.memory[65387] = data;
        }
      };
      this.gameboy.highMemoryWriter[112] = this.gameboy.memoryWriter[65392] = (address, data) => {
        var addressCheck = this.gameboy.memory[65361] << 8 | this.gameboy.memory[65362];
        if (!this.gameboy.hdmaRunning || addressCheck < 53248 || addressCheck >= 57344) {
          this.gameboy.gbcRamBank = Math.max(data & 7, 1);
          this.gameboy.gbcRamBankPosition = (this.gameboy.gbcRamBank - 1 << 12) - 53248;
          this.gameboy.gbcEchoRamBankPosition = this.gameboy.gbcRamBankPosition - 8192;
        }
        this.gameboy.memory[65392] = data;
      };
      this.gameboy.highMemoryWriter[116] = this.gameboy.memoryWriter[65396] = (address, data) => {
        this.gameboy.memory[65396] = data;
      };
    } else {
      this.gameboy.highMemoryWriter[2] = this.gameboy.memoryWriter[serialControlAddress] = (address, data) => {
        if ((data & 1) === 1) {
          this.gameboy.memory[serialControlAddress] = data & 127;
          this.gameboy.serialTimer = 4096;
          this.gameboy.serialShiftTimer = this.gameboy.serialShiftTimerAllocated = 512;
        } else {
          this.gameboy.memory[serialControlAddress] = data;
          this.gameboy.serialShiftTimer = this.gameboy.serialShiftTimerAllocated = this.gameboy.serialTimer = 0;
        }
      };
      this.gameboy.highMemoryWriter[64] = this.gameboy.memoryWriter[65344] = (address, data) => {
        if (this.gameboy.memory[65344] !== data) {
          this.gameboy.midScanlineJIT();
          const newState = data > 127;
          if (newState !== this.gameboy.gpu.lcdEnabled) {
            this.gameboy.gpu.lcdEnabled = newState;
            this.gameboy.memory[65345] &= 120;
            this.gameboy.midScanlineOffset = -1;
            this.gameboy.cpu.totalLinesPassed = this.gameboy.currentX = this.gameboy.queuedScanlines = this.gameboy.lastUnrenderedLine = this.gameboy.STATTracker = this.gameboy.LCDTicks = this.gameboy.actualScanline = this.gameboy.memory[65348] = 0;
            if (this.gameboy.gpu.lcdEnabled) {
              this.gameboy.modeSTAT = 2;
              this.gameboy.matchLYC();
              this.gameboy.gpu.enableLCD();
            } else {
              this.gameboy.modeSTAT = 0;
              this.gameboy.gpu.disableLCD();
              this.gameboy.lcdDevice.turnOff();
            }
            this.gameboy.interruptRequestedFlags &= 253;
          }
          this.gameboy.gfxWindowCHRBankPosition = (data & 64) === 64 ? 1024 : 0;
          this.gameboy.gfxWindowDisplay = (data & 32) === 32;
          this.gameboy.gfxBackgroundBankOffset = (data & 16) === 16 ? 0 : 128;
          this.gameboy.gfxBackgroundCHRBankPosition = (data & 8) === 8 ? 1024 : 0;
          this.gameboy.gfxSpriteNormalHeight = (data & 4) === 0;
          this.gameboy.gfxSpriteShow = (data & 2) === 2;
          this.gameboy.backgroundEnabled = (data & 1) === 1;
          this.gameboy.memory[65344] = data;
        }
      };
      this.gameboy.highMemoryWriter[65] = this.gameboy.memoryWriter[65345] = (address, data) => {
        this.gameboy.LYCMatchTriggerSTAT = (data & 64) === 64;
        this.gameboy.mode2TriggerSTAT = (data & 32) === 32;
        this.gameboy.mode1TriggerSTAT = (data & 16) === 16;
        this.gameboy.mode0TriggerSTAT = (data & 8) === 8;
        this.gameboy.memory[65345] = data & 120;
        if ((!this.gameboy.usedBootRom || !this.gameboy.usedGbcBootRom) && this.gameboy.gpu.lcdEnabled && this.gameboy.modeSTAT < 2) {
          this.gameboy.interruptRequestedFlags |= 2;
          this.gameboy.checkIrqMatching();
        }
      };
      this.gameboy.highMemoryWriter[70] = this.gameboy.memoryWriter[65350] = (address, data) => {
        this.gameboy.memory[65350] = data;
        if (data > 127 && data < 224) {
          data <<= 8;
          address = 65024;
          var stat = this.gameboy.modeSTAT;
          this.gameboy.modeSTAT = 0;
          var newData = 0;
          do {
            newData = this.readDirectly(data++);
            if (newData !== this.gameboy.memory[address]) {
              this.gameboy.modeSTAT = stat;
              this.gameboy.graphicsJIT();
              this.gameboy.modeSTAT = 0;
              this.gameboy.memory[address++] = newData;
              break;
            }
          } while (++address < 65184);
          if (address < 65184) {
            do {
              this.gameboy.memory[address++] = this.readDirectly(data++);
              this.gameboy.memory[address++] = this.readDirectly(data++);
              this.gameboy.memory[address++] = this.readDirectly(data++);
              this.gameboy.memory[address++] = this.readDirectly(data++);
            } while (address < 65184);
          }
          this.gameboy.modeSTAT = stat;
        }
      };
      this.gameboy.highMemoryWriter[71] = this.gameboy.memoryWriter[65351] = (address, data) => {
        if (this.gameboy.memory[65351] !== data) {
          this.gameboy.midScanlineJIT();
          this.gameboy.updateGBBGPalette(data);
          this.gameboy.memory[65351] = data;
        }
      };
      this.gameboy.highMemoryWriter[72] = this.gameboy.memoryWriter[65352] = (address, data) => {
        if (this.gameboy.memory[65352] !== data) {
          this.gameboy.midScanlineJIT();
          this.gameboy.updateGBOBJPalette(0, data);
          this.gameboy.memory[65352] = data;
        }
      };
      this.gameboy.highMemoryWriter[73] = this.gameboy.memoryWriter[65353] = (address, data) => {
        if (this.gameboy.memory[65353] !== data) {
          this.gameboy.midScanlineJIT();
          this.gameboy.updateGBOBJPalette(4, data);
          this.gameboy.memory[65353] = data;
        }
      };
      this.gameboy.highMemoryWriter[77] = this.gameboy.memoryWriter[65357] = (address, data) => {
        this.gameboy.memory[65357] = data;
      };
      this.gameboy.highMemoryWriter[79] = this.gameboy.memoryWriter[65359] = this.writeIllegal;
      this.gameboy.highMemoryWriter[85] = this.gameboy.memoryWriter[65365] = this.writeIllegal;
      this.gameboy.highMemoryWriter[104] = this.gameboy.memoryWriter[65384] = this.writeIllegal;
      this.gameboy.highMemoryWriter[105] = this.gameboy.memoryWriter[65385] = this.writeIllegal;
      this.gameboy.highMemoryWriter[106] = this.gameboy.memoryWriter[65386] = this.writeIllegal;
      this.gameboy.highMemoryWriter[107] = this.gameboy.memoryWriter[65387] = this.writeIllegal;
      this.gameboy.highMemoryWriter[108] = this.gameboy.memoryWriter[65388] = this.writeIllegal;
      this.gameboy.highMemoryWriter[112] = this.gameboy.memoryWriter[65392] = this.writeIllegal;
      this.gameboy.highMemoryWriter[116] = this.gameboy.memoryWriter[65396] = this.writeIllegal;
    }
  }
};

// vendor/jsgbc-core/src/dutyLookup.ts
var dutyLookup_default = [
  // map the duty values given to ones we can work with.
  [false, false, false, false, false, false, false, true],
  [true, false, false, false, false, false, false, true],
  [true, false, false, false, false, true, true, true],
  [false, true, true, true, true, true, true, false]
];

// vendor/jsgbc-core/src/initialState.ts
var initialState_default = [
  true,
  // Whether we're in the GBC boot ROM.
  // CPU Registers and Flags:
  1,
  // Register A (Accumulator)
  true,
  // Register F  - Result was zero
  false,
  // Register F  - Subtraction was executed
  true,
  // Register F  - Half carry or half borrow
  true,
  // Register F  - Carry or borrow
  0,
  // Register B
  19,
  // Register C
  0,
  // Register D
  216,
  // Register E
  333,
  // Registers H and L combined
  65534,
  // Stack Pointer
  256,
  // Program Counter
  // Some CPU Emulation State Variables:
  false,
  // Has the CPU been suspended until the next interrupt?
  true,
  // Are interrupts enabled?
  false,
  // HDMA Transfer Flag - GBC only
  0,
  // The number of clock cycles emulated.
  0,
  // GBC double speed clocking shifter.
  [],
  // Main Core Memory
  [],
  // Extra VRAM bank for GBC.
  0,
  // Current VRAM bank for GBC.
  [],
  // GBC main RAM Banks
  1,
  // Currently Switched GameBoy Color ram bank
  -53248,
  // GBC RAM offset from address start.
  0,
  // Offset of the ROM bank switching.
  0,
  // The parsed current ROM bank selection.
  0,
  // The scan line mode (for lines 1-144 it's 2-3-0, for 145-154 it's 1)
  false,
  // Should we trigger an interrupt if LY==LYC?
  false,
  // Should we trigger an interrupt if in mode 2?
  false,
  // Should we trigger an interrupt if in mode 1?
  false,
  // Should we trigger an interrupt if in mode 0?
  false,
  // Is the emulated LCD controller on?
  0,
  // The current bank of the character map the window uses.
  false,
  // Is the windows enabled?
  false,
  // Are sprites enabled?
  true,
  // Are we doing 8x8 or 8x16 sprites?
  0,
  // The current bank of the character map the background uses.
  128,
  // Fast mapping of the tile numbering/
  false,
  // Is TIMA enabled?
  56,
  // DIV Ticks Counter (Invisible lower 8-bit)
  60,
  // Counter for how many instructions have been executed on a scanline so far.
  0,
  // Counter for the TIMA timer.
  1024,
  // Timer Max Ticks
  0,
  // Serial IRQ Timer
  0,
  // Serial Transfer Shift Timer
  0,
  // Serial Transfer Shift Timer Refill
  0,
  // Are the interrupts on queue to be enabled?
  (/* @__PURE__ */ new Date()).getTime(),
  // The last time we iterated the main loop.
  0,
  // To prevent the repeating of drawing a blank screen.
  [],
  // The internal frame-buffer.
  true,
  // Is the BG enabled?
  8192,
  // channel1FrequencyTracker
  512,
  // channel1FrequencyCounter
  0,
  // channel1totalLength
  0,
  // channel1envelopeVolume
  false,
  // channel1envelopeType
  0,
  // channel1envelopeSweeps
  0,
  // channel1envelopeSweepsLast
  true,
  // channel1consecutive
  0,
  // channel1frequency
  false,
  // channel1SweepFault
  0,
  // channel1ShadowFrequency
  1,
  // channel1timeSweep
  0,
  // channel1lastTimeSweep
  false,
  // channel1Swept
  0,
  // channel1frequencySweepDivider
  false,
  // channel1decreaseSweep
  8192,
  // channel2FrequencyTracker
  512,
  // channel2FrequencyCounter
  0,
  // channel2totalLength
  0,
  // channel2envelopeVolume
  false,
  // channel2envelopeType
  0,
  // channel2envelopeSweeps
  0,
  // channel2envelopeSweepsLast
  true,
  // channel2consecutive
  0,
  // channel2frequency
  false,
  // channel3canPlay
  0,
  // channel3totalLength
  4,
  // channel3patternType
  0,
  // channel3frequency
  true,
  // channel3consecutive
  null,
  // Channel 3 adjusted sample buffer.
  8,
  // channel4FrequencyPeriod
  0,
  // channel4lastSampleLookup
  0,
  // channel4totalLength
  0,
  // channel4envelopeVolume
  0,
  // channel4currentVolume
  false,
  // channel4envelopeType
  0,
  // channel4envelopeSweeps
  0,
  // channel4envelopeSweepsLast
  true,
  // channel4consecutive
  32767,
  // channel4BitRange
  false,
  // As its name implies
  // Vin Shit:
  8,
  // Computed post-mixing volume.
  8,
  // Computed post-mixing volume.
  // Channel paths enabled:
  false,
  // leftChannel1
  false,
  // leftChannel2
  false,
  // leftChannel3
  false,
  // leftChannel4
  false,
  // rightChannel1
  false,
  // rightChannel2
  false,
  // rightChannel3
  false,
  // rightChannel4
  // Channel output level caches:
  0,
  // channel1currentSampleLeft
  0,
  // channel1currentSampleRight
  0,
  // channel2currentSampleLeft
  0,
  // channel2currentSampleRight
  0,
  // channel3currentSampleLeft
  0,
  // channel3currentSampleRight
  0,
  // channel4currentSampleLeft
  0,
  // channel4currentSampleRight
  0,
  // channel1currentSampleLeftSecondary
  0,
  // channel1currentSampleRightSecondary
  0,
  // channel2currentSampleLeftSecondary
  0,
  // channel2currentSampleRightSecondary
  0,
  // channel3currentSampleLeftSecondary
  0,
  // channel3currentSampleRightSecondary
  0,
  // channel4currentSampleLeftSecondary
  0,
  // channel4currentSampleRightSecondary
  0,
  // channel1currentSampleLeftTrimary
  0,
  // channel1currentSampleRightTrimary
  0,
  // channel2currentSampleLeftTrimary
  0,
  // channel2currentSampleRightTrimary
  0,
  // mixerOutputCache
  0,
  // channel1DutyTracker
  dutyLookup_default[2],
  // channel1CachedDuty
  0,
  // channel2DutyTracker
  dutyLookup_default[2],
  // channel2CachedDuty
  false,
  // channel1Enabled
  false,
  // channel2Enabled
  false,
  // channel3Enabled
  false,
  // channel4Enabled
  8192,
  // sequencerClocks
  0,
  // sequencePosition
  2048,
  // channel3Counter
  8,
  // channel4Counter
  0,
  // cachedChannel3Sample
  0,
  // cachedChannel4Sample
  2048,
  // channel3FrequencyPeriod
  0,
  // channel3lastSampleLookup
  144,
  // Actual scan line...
  0,
  // Last rendered scan line...
  0,
  // queuedScanlines
  // RTC (Real Time Clock for MBC3):
  false,
  // RTCisLatched
  0,
  // RTC latched seconds.
  0,
  // RTC latched minutes.
  0,
  // RTC latched hours.
  0,
  // RTC latched lower 8-bits of the day counter.
  0,
  // RTC latched high-bit of the day counter.
  0,
  // RTC seconds counter.
  0,
  // RTC minutes counter.
  0,
  // RTC hours counter.
  0,
  // RTC days counter.
  false,
  // Did the RTC overflow and wrap the day counter?
  false,
  // Is the RTC allowed to clock up?
  false,
  // Updated upon ROM loading...
  false,
  // Did we trip the DMG Halt bug?
  0,
  // Tracker for STAT triggering.
  -61440,
  // GBC RAM (ECHO mirroring) offset from address start.
  0,
  // Current Y offset of the window.
  0,
  // Current X offset of the window.
  null,
  // gbcOBJRawPalette
  null,
  // gbcBGRawPalette
  null,
  // gbOBJPalette
  null,
  // gbBGPalette
  null,
  // gbcOBJPalette
  null,
  // gbcBGPalette
  null,
  // gbBGColorizedPalette
  null,
  // gbOBJColorizedPalette
  null,
  // cachedBGPaletteConversion
  null,
  // cachedOBJPaletteConversion
  // BG Tile Pointer Caches:
  null,
  // BGCHRBank1
  null,
  // BGCHRBank2
  0,
  // Post-Halt clocking.
  0,
  // IF Register
  0,
  // IE Register
  0,
  // HALT clocking overrun carry over.
  false,
  // colorizedGBPalettes
  0,
  // Register SCY (Y-Scroll)
  0,
  // Register SCX (X-Scroll)
  false,
  // CPU STOP status.
  1,
  // audioClocksUntilNextEvent
  1
  // audioClocksUntilNextEventCounter
];

// vendor/jsgbc-core/src/StateManager.ts
var StateManager = class {
  constructor(gameboy) {
    this.gameboy = gameboy;
  }
  gameboy;
  init() {
    this.loadOld(initialState_default.slice(0));
  }
  get() {
    const gameboy = this.gameboy;
    if (!gameboy.cartridge) return null;
    return concatArrayBuffers(
      gameboy.memory.buffer.slice(0),
      gameboy.videoRam.buffer.slice(0)
    );
  }
  load(state) {
    let index = 0;
    const gameboy = this.gameboy;
  }
  loadOld(state) {
    let index = 0;
    const gameboy = this.gameboy;
    gameboy.isBootingRom = state[index++];
    gameboy.registerA = state[index++];
    gameboy.FZero = state[index++];
    gameboy.FSubtract = state[index++];
    gameboy.FHalfCarry = state[index++];
    gameboy.FCarry = state[index++];
    gameboy.registerB = state[index++];
    gameboy.registerC = state[index++];
    gameboy.registerD = state[index++];
    gameboy.registerE = state[index++];
    gameboy.registersHL = state[index++];
    gameboy.stackPointer = state[index++];
    gameboy.programCounter = state[index++];
    gameboy.halt = state[index++];
    gameboy.IME = state[index++];
    gameboy.hdmaRunning = state[index++];
    gameboy.currentInstructionCycleCount = state[index++];
    gameboy.doubleSpeedShifter = state[index++];
    gameboy.memory = toTypedArray(state[index++], "uint8");
    gameboy.videoRam = toTypedArray(state[index++], "uint8");
    gameboy.currentVideoRamBank = state[index++];
    gameboy.gbcMemory = toTypedArray(state[index++], "uint8");
    gameboy.gbcRamBank = state[index++];
    gameboy.gbcRamBankPosition = state[index++];
    gameboy.ROMBank1Offset = state[index++];
    if (gameboy.cartridge?.mbc) {
      gameboy.cartridge.mbc.currentRomBank = state[index++];
    } else {
      index++;
    }
    gameboy.modeSTAT = state[index++];
    gameboy.LYCMatchTriggerSTAT = state[index++];
    gameboy.mode2TriggerSTAT = state[index++];
    gameboy.mode1TriggerSTAT = state[index++];
    gameboy.mode0TriggerSTAT = state[index++];
    gameboy.gpu.lcdEnabled = state[index++];
    gameboy.gfxWindowCHRBankPosition = state[index++];
    gameboy.gfxWindowDisplay = state[index++];
    gameboy.gfxSpriteShow = state[index++];
    gameboy.gfxSpriteNormalHeight = state[index++];
    gameboy.gfxBackgroundCHRBankPosition = state[index++];
    gameboy.gfxBackgroundBankOffset = state[index++];
    gameboy.TIMAEnabled = state[index++];
    gameboy.DIVTicks = state[index++];
    gameboy.LCDTicks = state[index++];
    gameboy.timerTicks = state[index++];
    gameboy.TACClocker = state[index++];
    gameboy.serialTimer = state[index++];
    gameboy.serialShiftTimer = state[index++];
    gameboy.serialShiftTimerAllocated = state[index++];
    gameboy.IRQEnableDelay = state[index++];
    if (gameboy.cartridge?.hasRtc) {
      gameboy.cartridge.mbc3.rtc.lastTime = state[index++];
    } else {
      index++;
    }
    gameboy.drewBlank = state[index++];
    gameboy.frameBuffer = toTypedArray(state[index++], "int32");
    gameboy.backgroundEnabled = state[index++];
    gameboy.audioController.channel1.frequencyTracker = state[index++];
    gameboy.audioController.channel1.frequencyCounter = state[index++];
    gameboy.audioController.channel1.totalLength = state[index++];
    gameboy.audioController.channel1.envelopeVolume = state[index++];
    gameboy.audioController.channel1.envelopeType = state[index++];
    gameboy.audioController.channel1.envelopeSweeps = state[index++];
    gameboy.audioController.channel1.envelopeSweepsLast = state[index++];
    gameboy.audioController.channel1.consecutive = state[index++];
    gameboy.audioController.channel1.frequency = state[index++];
    gameboy.audioController.channel1.sweepFault = state[index++];
    gameboy.audioController.channel1.shadowFrequency = state[index++];
    gameboy.audioController.channel1.timeSweep = state[index++];
    gameboy.audioController.channel1.lastTimeSweep = state[index++];
    gameboy.audioController.channel1.swept = state[index++];
    gameboy.audioController.channel1.frequencySweepDivider = state[index++];
    gameboy.audioController.channel1.decreaseSweep = state[index++];
    gameboy.audioController.channel2.frequencyTracker = state[index++];
    gameboy.audioController.channel2.frequencyCounter = state[index++];
    gameboy.audioController.channel2.totalLength = state[index++];
    gameboy.audioController.channel2.envelopeVolume = state[index++];
    gameboy.audioController.channel2.envelopeType = state[index++];
    gameboy.audioController.channel2.envelopeSweeps = state[index++];
    gameboy.audioController.channel2.envelopeSweepsLast = state[index++];
    gameboy.audioController.channel2.consecutive = state[index++];
    gameboy.audioController.channel2.frequency = state[index++];
    gameboy.audioController.channel3CanPlay = state[index++];
    gameboy.audioController.channel3TotalLength = state[index++];
    gameboy.audioController.channel3PatternType = state[index++];
    gameboy.audioController.channel3frequency = state[index++];
    gameboy.audioController.channel3Consecutive = state[index++];
    gameboy.audioController.channel3PcmData = toTypedArray(state[index++], "int8");
    gameboy.audioController.channel4FrequencyPeriod = state[index++];
    gameboy.audioController.channel4LastSampleLookup = state[index++];
    gameboy.audioController.channel4TotalLength = state[index++];
    gameboy.audioController.channel4EnvelopeVolume = state[index++];
    gameboy.audioController.channel4CurrentVolume = state[index++];
    gameboy.audioController.channel4EnvelopeType = state[index++];
    gameboy.audioController.channel4EnvelopeSweeps = state[index++];
    gameboy.audioController.channel4EnvelopeSweepsLast = state[index++];
    gameboy.audioController.channel4Consecutive = state[index++];
    gameboy.audioController.channel4BitRange = state[index++];
    gameboy.audioController.enabled = state[index++];
    gameboy.audioController.cartridgeLeftChannelInputVolume = state[index++];
    gameboy.audioController.cartridgeRightChannelInputVolume = state[index++];
    gameboy.audioController.channel1.leftChannelEnabled = state[index++];
    gameboy.audioController.channel2.leftChannelEnabled = state[index++];
    gameboy.audioController.leftChannel3 = state[index++];
    gameboy.audioController.leftChannel4 = state[index++];
    gameboy.audioController.channel1.rightChannelEnabled = state[index++];
    gameboy.audioController.channel2.rightChannelEnabled = state[index++];
    gameboy.audioController.rightChannel3 = state[index++];
    gameboy.audioController.rightChannel4 = state[index++];
    gameboy.audioController.channel1.currentSampleLeft = state[index++];
    gameboy.audioController.channel1.currentSampleRight = state[index++];
    gameboy.audioController.channel2.currentSampleLeft = state[index++];
    gameboy.audioController.channel2.currentSampleRight = state[index++];
    gameboy.audioController.channel3CurrentSampleLeft = state[index++];
    gameboy.audioController.channel3CurrentSampleRight = state[index++];
    gameboy.audioController.channel4CurrentSampleLeft = state[index++];
    gameboy.audioController.channel4CurrentSampleRight = state[index++];
    gameboy.audioController.channel1.currentSampleLeftSecondary = state[index++];
    gameboy.audioController.channel1.currentSampleRightSecondary = state[index++];
    gameboy.audioController.channel2.currentSampleLeftSecondary = state[index++];
    gameboy.audioController.channel2.currentSampleRightSecondary = state[index++];
    gameboy.audioController.channel3CurrentSampleLeftSecondary = state[index++];
    gameboy.audioController.channel3CurrentSampleRightSecondary = state[index++];
    gameboy.audioController.channel4CurrentSampleLeftSecondary = state[index++];
    gameboy.audioController.channel4CurrentSampleRightSecondary = state[index++];
    gameboy.audioController.channel1.currentSampleLeftTrimary = state[index++];
    gameboy.audioController.channel1.currentSampleRightTrimary = state[index++];
    gameboy.audioController.channel2.currentSampleLeftTrimary = state[index++];
    gameboy.audioController.channel2.currentSampleRightTrimary = state[index++];
    gameboy.audioController.mixerOutputCache = state[index++];
    gameboy.audioController.channel1.dutyTracker = state[index++];
    gameboy.audioController.channel1.cachedDuty = state[index++];
    gameboy.audioController.channel2.dutyTracker = state[index++];
    gameboy.audioController.channel2.cachedDuty = state[index++];
    gameboy.audioController.channel1.enabled = state[index++];
    gameboy.audioController.channel2.enabled = state[index++];
    gameboy.audioController.channel3Enabled = state[index++];
    gameboy.audioController.channel4Enabled = state[index++];
    gameboy.audioController.sequencerClocks = state[index++];
    gameboy.audioController.sequencePosition = state[index++];
    gameboy.audioController.channel3Counter = state[index++];
    gameboy.audioController.channel4Counter = state[index++];
    gameboy.audioController.cachedChannel3Sample = state[index++];
    gameboy.audioController.cachedChannel4Sample = state[index++];
    gameboy.audioController.channel3FrequencyPeriod = state[index++];
    gameboy.audioController.channel3LastSampleLookup = state[index++];
    gameboy.actualScanline = state[index++];
    gameboy.lastUnrenderedLine = state[index++];
    gameboy.queuedScanlines = state[index++];
    if (gameboy.cartridge?.hasRtc) {
      gameboy.cartridge.mbc3.rtc.RTCisLatched = state[index++];
      gameboy.cartridge.mbc3.rtc.latchedSeconds = state[index++];
      gameboy.cartridge.mbc3.rtc.latchedMinutes = state[index++];
      gameboy.cartridge.mbc3.rtc.latchedHours = state[index++];
      gameboy.cartridge.mbc3.rtc.latchedLDays = state[index++];
      gameboy.cartridge.mbc3.rtc.latchedHDays = state[index++];
      gameboy.cartridge.mbc3.rtc.RTCSeconds = state[index++];
      gameboy.cartridge.mbc3.rtc.RTCMinutes = state[index++];
      gameboy.cartridge.mbc3.rtc.RTCHours = state[index++];
      gameboy.cartridge.mbc3.rtc.RTCDays = state[index++];
      gameboy.cartridge.mbc3.rtc.RTCDayOverFlow = state[index++];
      gameboy.cartridge.mbc3.rtc.RTCHalt = state[index++];
    } else {
      index += 12;
    }
    gameboy.usedBootRom = state[index++];
    gameboy.skipPCIncrement = state[index++];
    gameboy.STATTracker = state[index++];
    gameboy.gbcEchoRamBankPosition = state[index++];
    gameboy.windowY = state[index++];
    gameboy.windowX = state[index++];
    gameboy.gbcOBJRawPalette = toTypedArray(state[index++], "uint8");
    gameboy.gbcBGRawPalette = toTypedArray(state[index++], "uint8");
    gameboy.gbOBJPalette = toTypedArray(state[index++], "int32");
    gameboy.gbBGPalette = toTypedArray(state[index++], "int32");
    gameboy.gbcOBJPalette = toTypedArray(state[index++], "int32");
    gameboy.gbcBGPalette = toTypedArray(state[index++], "int32");
    gameboy.gbBGColorizedPalette = toTypedArray(state[index++], "int32");
    gameboy.gbOBJColorizedPalette = toTypedArray(state[index++], "int32");
    gameboy.cachedBGPaletteConversion = toTypedArray(
      state[index++],
      "int32"
    );
    gameboy.cachedOBJPaletteConversion = toTypedArray(
      state[index++],
      "int32"
    );
    gameboy.BGCHRBank1 = toTypedArray(state[index++], "uint8");
    gameboy.BGCHRBank2 = toTypedArray(state[index++], "uint8");
    gameboy.haltPostClocks = state[index++];
    gameboy.interruptRequestedFlags = state[index++];
    gameboy.interruptEnabledFlags = state[index++];
    gameboy.checkIrqMatching();
    gameboy.remainingClocks = state[index++];
    gameboy.colorizedGBPalettes = state[index++];
    gameboy.backgroundY = state[index++];
    gameboy.backgroundX = state[index++];
    gameboy.cpu.stopped = state[index++];
    gameboy.audioController.audioClocksUntilNextEvent = state[index++];
    gameboy.audioController.audioClocksUntilNextEventCounter = state[index];
  }
};

// vendor/jsgbc-core/src/audio/Resampler.ts
var Resampler = class {
  constructor(fromSampleRate, toSampleRate, channels, outputBufferSize) {
    this.fromSampleRate = fromSampleRate;
    this.toSampleRate = toSampleRate;
    this.channels = channels;
    this.outputBufferSize = outputBufferSize;
    if (this.fromSampleRate <= 0 || this.toSampleRate <= 0 || this.channels <= 0) throw new Error("Invalid settings specified for the resampler.");
    this.ratioWeight = this.fromSampleRate / this.toSampleRate;
    if (this.fromSampleRate < this.toSampleRate) {
      this.lastWeight = 1;
    }
    this.outputBuffer = new Float32Array(this.outputBufferSize);
    this.lastOutput = new Float32Array(this.channels);
  }
  fromSampleRate;
  toSampleRate;
  channels;
  outputBufferSize;
  ratioWeight;
  lastWeight;
  tailExists;
  outputBuffer;
  lastOutput;
  resample(buffer) {
    let bufferLength = buffer.length;
    if (bufferLength % this.channels !== 0) throw new Error("Buffer was of incorrect sample length.");
    if (bufferLength === 0) return;
    let weight = this.lastWeight;
    let firstWeight = 0;
    let secondWeight = 0;
    let sourceOffset = 0;
    let outputOffset = 0;
    for (; weight < 1; weight += this.ratioWeight) {
      secondWeight = weight % 1;
      firstWeight = 1 - secondWeight;
      for (let channel = 0; channel < this.channels; channel++) {
        this.outputBuffer[outputOffset++] = this.lastOutput[channel] * firstWeight + buffer[channel] * secondWeight;
      }
    }
    weight -= 1;
    for (bufferLength -= this.channels, sourceOffset = Math.floor(weight) * this.channels; outputOffset < this.outputBufferSize && sourceOffset < bufferLength; ) {
      secondWeight = weight % 1;
      firstWeight = 1 - secondWeight;
      for (let channel = 0; channel < this.channels; channel++) {
        this.outputBuffer[outputOffset++] = buffer[sourceOffset + channel] * firstWeight + buffer[sourceOffset + this.channels + channel] * secondWeight;
      }
      weight += this.ratioWeight;
      sourceOffset = Math.floor(weight) * this.channels;
    }
    for (let channel = 0; channel < this.channels; ++channel) {
      this.lastOutput[channel] = buffer[sourceOffset++];
    }
    this.lastWeight = weight % 1;
    return outputOffset;
  }
};

// src/shims/worker-url.js
var WorkerUrl = class {
  constructor() {
    throw new Error("AudioWorklet capture is not used by Cartridge");
  }
};

// vendor/jsgbc-core/src/audio/AudioDevice.ts
var AudioContextClass = typeof window !== "undefined" ? typeof AudioContext !== "undefined" ? AudioContext : window.webkitAudioContext : null;
var AudioDevice = class {
  inputBuffer;
  inputBufferSize;
  resampler;
  outputBuffer;
  outputBufferSize;
  outputBufferStart;
  outputBufferEnd;
  volume = 1;
  context;
  audioWorkletSupport;
  samplesPerCallback = 2048;
  // Has to be between 2048 and 4096 (If over, then samples are ignored, if under then silence is added).
  channelsAllocated;
  sampleRate;
  bufferSize;
  minBufferSize;
  maxBufferSize;
  gainNode;
  audioNode;
  constructor({ context, channels, minBufferSize }) {
    this.context = context;
    this.channelsAllocated = Math.max(channels, 1);
    this.bufferSize = this.samplesPerCallback * this.channelsAllocated;
    this.minBufferSize = minBufferSize || this.bufferSize;
  }
  setSampleRate(sampleRate) {
    this.sampleRate = sampleRate;
  }
  setMaxBufferSize(maxBufferSize) {
    this.maxBufferSize = Math.floor(maxBufferSize) > this.minBufferSize + this.channelsAllocated ? maxBufferSize & -this.channelsAllocated : this.minBufferSize * this.channelsAllocated;
  }
  writeAudio(buffer) {
    let bufferIndex = 0;
    while (bufferIndex < buffer.length && this.inputBufferSize < this.maxBufferSize) {
      this.inputBuffer[this.inputBufferSize++] = buffer[bufferIndex++];
    }
  }
  remainingBuffer() {
    return Math.floor(
      this.resampledSamplesLeft() * this.resampler?.ratioWeight / this.channelsAllocated
    ) * this.channelsAllocated + this.inputBufferSize;
  }
  async init() {
    if (!this.context) this.context = new AudioContextClass();
    if (!this.audioNode) {
      this.gainNode = this.context.createGain();
      if (!this.context?.audioWorklet) {
        const workletUrl = new WorkerUrl(
          new URL("./noise.worklet.ts", import.meta.url),
          {
            name: "worklet"
          }
        );
        await this.context.audioWorklet.addModule(workletUrl);
        this.audioNode = new AudioWorkletNode(this.context, "noise-generator");
      } else {
        const scriptProcessorNode = this.audioNode = this.context.createScriptProcessor(this.samplesPerCallback, 0, this.channelsAllocated);
        scriptProcessorNode.onaudioprocess = (e) => this.processAudio(e);
      }
      this.audioNode.connect(this.gainNode);
      this.gainNode.connect(this.context.destination);
      this.resetAudioBuffer(this.context.sampleRate);
    }
  }
  processAudio(e) {
    const channels = [];
    let channel = 0;
    while (channel < this.channelsAllocated) {
      channels[channel] = e.outputBuffer.getChannelData(channel);
      ++channel;
    }
    this.refillResampledBuffer();
    let index = 0;
    while (index < this.samplesPerCallback && this.outputBufferStart !== this.outputBufferEnd) {
      channel = 0;
      while (channel < this.channelsAllocated) {
        channels[channel][index] = this.outputBuffer[this.outputBufferStart++];
        ++channel;
      }
      if (this.outputBufferStart === this.outputBufferSize) {
        this.outputBufferStart = 0;
      }
      ++index;
    }
    while (index < this.samplesPerCallback) {
      for (channel = 0; channel < this.channelsAllocated; ++channel) {
        channels[channel][index] = 0;
      }
      ++index;
    }
  }
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.gainNode.gain.setTargetAtTime(this.volume, this.context.currentTime, 0);
  }
  resetAudioBuffer(targetSampleRate) {
    this.inputBufferSize = this.outputBufferEnd = this.outputBufferStart = 0;
    this.initializeResampler(targetSampleRate);
    this.outputBuffer = new Float32Array(this.outputBufferSize);
  }
  refillResampledBuffer() {
    if (this.inputBufferSize > 0) {
      const resampleLength = this.resampler.resample(this.getBufferSamples());
      const resampledResult = this.resampler.outputBuffer;
      for (let i = 0; i < resampleLength; ) {
        this.outputBuffer[this.outputBufferEnd++] = resampledResult[i++];
        if (this.outputBufferEnd === this.outputBufferSize) {
          this.outputBufferEnd = 0;
        }
        if (this.outputBufferStart === this.outputBufferEnd) {
          this.outputBufferStart += this.channelsAllocated;
          if (this.outputBufferStart === this.outputBufferSize) {
            this.outputBufferStart = 0;
          }
        }
      }
      this.inputBufferSize = 0;
    }
  }
  initializeResampler(targetSampleRate) {
    this.inputBuffer = new Float32Array(this.maxBufferSize);
    this.outputBufferSize = Math.max(
      this.maxBufferSize * Math.ceil(targetSampleRate / this.sampleRate) + this.channelsAllocated,
      this.bufferSize
    );
    this.resampler = new Resampler(
      this.sampleRate,
      targetSampleRate,
      this.channelsAllocated,
      this.outputBufferSize
    );
  }
  resampledSamplesLeft() {
    return (this.outputBufferStart <= this.outputBufferEnd ? 0 : this.outputBufferSize) + this.outputBufferEnd - this.outputBufferStart;
  }
  getBufferSamples() {
    return this.inputBuffer.subarray(0, this.inputBufferSize);
  }
};

// vendor/jsgbc-core/src/cartridge/MBC.ts
var MBC = class extends EventEmitter {
  currentRomBank;
  romBank1Offset;
  ram;
  romBankEdge;
  currentMbcRamBank;
  currentRamBankPosition;
  ramBanksEnabled;
  romSize;
  ramSize;
  rtc;
  romSizes = [
    32768,
    // 32K
    65536,
    // 64K
    131072,
    // 128K
    262144,
    // 256K
    524288,
    // 512K
    1048576,
    // 1024K
    2097152,
    // 2048K
    4194304,
    // 4096K
    8388608
    // 8192K
  ];
  ramSizes = [
    0,
    // 0K
    8192,
    // 2K  // Changed to 2000 to avoid problems
    8192,
    // 8K
    32768,
    // 32K
    131072,
    // 128K
    65536
    // 64K
  ];
  cartridge;
  constructor(cartridge) {
    super();
    this.cartridge = cartridge;
    this.ramBanksEnabled = false;
    this.currentRamBankPosition = -40960;
    this.currentMbcRamBank = 0;
    this.romBankEdge = Math.floor(cartridge.rom.length / 16384);
  }
  setupRom() {
    this.romSize = this.romSizes[this.cartridge.romSizeType];
    console.log("ROM size 0x" + this.romSize.toString(16));
  }
  setupRAM() {
    this.ramSize = this.ramSizes[this.cartridge.ramSizeType];
    console.log("RAM size 0x" + this.ramSize.toString(16));
    this.ram = new Uint8Array(this.ramSize);
  }
  loadRam(data) {
    if (data.byteLength !== this.ramSize) return;
    this.ram = data.slice(0);
  }
  getRam() {
    return new Uint8Array(this.ram.buffer.slice(0, this.ramSize));
  }
  cutSRAMFromBatteryFileArray(data) {
    return new Uint8Array(data.slice(0, this.ramSize));
  }
  saveState() {
    if (!this.cartridge.hasBattery || this.ram.length === 0) return;
    return fromTypedArray(this.ram);
  }
  readRam = (address) => {
    if (!this.ramBanksEnabled) return 255;
    return this.ram[address + this.currentRamBankPosition];
  };
  writeRam = (address, data) => {
    if (!this.ramBanksEnabled) return;
    this.emit("ramWrite");
    this.ram[address + this.currentRamBankPosition] = data;
  };
  // TODO: for MBC2 & MBC3, compare with other MBCx
  setCurrentROMBank() {
    this.currentRomBank = Math.max(
      this.romBank1Offset % this.romBankEdge - 1,
      0
    ) << 14;
  }
  toggle = (address, data) => {
    this.ramBanksEnabled = (data & 15) === 10;
  };
};

// vendor/jsgbc-core/src/cartridge/MBC1.ts
var MBC1 = class extends MBC {
  MBC1Mode = false;
  // MBC1 Type (4/32, 16/8)
  writeType = (address, data) => {
    this.MBC1Mode = (data & 1) === 1;
    if (this.MBC1Mode) {
      this.romBank1Offset &= 31;
      this.setCurrentROMBank();
    } else {
      this.currentMbcRamBank = 0;
      this.currentRamBankPosition = -40960;
    }
  };
  writeRomBank = (address, data) => {
    this.romBank1Offset = this.romBank1Offset & 96 | data & 31;
    this.setCurrentROMBank();
  };
  writeRamBank = (address, data) => {
    if (this.MBC1Mode) {
      this.currentMbcRamBank = data & 3;
      this.currentRamBankPosition = (this.currentMbcRamBank << 13) - 40960;
    } else {
      this.romBank1Offset = (data & 3) << 5 | this.romBank1Offset & 31;
      this.setCurrentROMBank();
    }
  };
  setCurrentROMBank() {
    switch (this.romBank1Offset) {
      case 0:
      case 32:
      case 64:
      case 96:
        this.currentRomBank = this.romBank1Offset % this.romBankEdge << 14;
        break;
      default:
        this.currentRomBank = this.romBank1Offset % this.romBankEdge - 1 << 14;
    }
  }
};

// vendor/jsgbc-core/src/cartridge/MBC2.ts
var MBC2 = class extends MBC {
  writeRomBank = (address, data) => {
    this.romBank1Offset = data & 15;
    this.setCurrentROMBank();
  };
};

// vendor/jsgbc-core/src/cartridge/RTC.ts
var RTC = class {
  constructor(mbc) {
    this.mbc = mbc;
  }
  mbc;
  lastTime;
  latchedLDays;
  latchedHours;
  latchedMinutes;
  latchedSeconds;
  latchedHDays;
  RTCDayOverFlow;
  RTCDays;
  RTCHours;
  RTCMinutes;
  RTCSeconds;
  RTCHalt;
  RTCisLatched;
  // TODO: rename RTC vars
  writeSeconds(data) {
    if (data < 60) {
      this.RTCSeconds = data;
    } else {
      console.log(
        "(Bank #" + this.mbc.currentMbcRamBank + ") RTC write out of range: " + data
      );
    }
  }
  writeMinutes(data) {
    if (data < 60) {
      this.RTCMinutes = data;
    } else {
      console.log(
        "(Bank #" + this.mbc.currentMbcRamBank + ") RTC write out of range: " + data
      );
    }
  }
  writeDaysLow(data) {
    this.RTCDays = data & 255 | this.RTCDays & 256;
  }
  writeDaysHigh(data) {
    this.RTCDayOverFlow = data > 127;
    this.RTCHalt = (data & 64) === 64;
    this.RTCDays = (data & 1) << 8 | this.RTCDays & 255;
  }
  writeHours(data) {
    if (data < 24) {
      this.RTCHours = data;
    } else {
      console.log(
        "(Bank #" + this.mbc.currentMbcRamBank + ") RTC write out of range: " + data
      );
    }
  }
  readSeconds() {
    return this.latchedSeconds;
  }
  readMinutes() {
    return this.latchedMinutes;
  }
  readHours() {
    return this.latchedHours;
  }
  readDaysLow() {
    return this.latchedLDays;
  }
  readDaysHigh() {
    return (this.RTCDayOverFlow ? 128 : 0) + (this.RTCHalt ? 64 : 0) + this.latchedHDays;
  }
  writeLatch = (address, data) => {
    if (data === 0) {
      this.RTCisLatched = false;
    } else if (!this.RTCisLatched) {
      this.RTCisLatched = true;
      this.latchedSeconds = this.RTCSeconds | 0;
      this.latchedMinutes = this.RTCMinutes;
      this.latchedHours = this.RTCHours;
      this.latchedLDays = this.RTCDays & 255;
      this.latchedHDays = this.RTCDays >> 8;
    }
  };
  get() {
    const lastTimeSeconds = Math.round(this.lastTime / 1e3);
    const lastTimeLow = lastTimeSeconds >> 0 & 65535;
    const lastTimeHigh = lastTimeSeconds >> 16 & 65535;
    const data = new Uint32Array([
      this.RTCSeconds,
      this.RTCMinutes,
      this.RTCHours,
      this.RTCDays,
      this.RTCDayOverFlow ? 1 : 0,
      this.latchedSeconds,
      this.latchedMinutes,
      this.latchedHours,
      this.latchedLDays,
      this.latchedHDays,
      lastTimeLow,
      lastTimeHigh
    ]);
    return data;
  }
  load(array) {
    const options = this.extract(array);
    this.RTCSeconds = options.seconds;
    this.RTCMinutes = options.minutes;
    this.RTCHours = options.hours;
    this.RTCDays = options.daysLow;
    this.RTCDayOverFlow = options.daysHigh;
    this.latchedSeconds = options.latchedSeconds;
    this.latchedMinutes = options.latchedMinutes;
    this.latchedHours = options.latchedHours;
    this.latchedLDays = options.latchedDaysLow;
    this.latchedHDays = options.latchedDaysHigh;
    this.lastTime = options.lastTime;
  }
  cutBatteryFileArray(data) {
    return new Uint32Array(data.slice(this.mbc.ramSize, this.mbc.ramSize + 4 * 12));
  }
  extract(array) {
    const seconds = array[0];
    const minutes = array[1];
    const hours = array[2];
    const daysLow = array[3];
    const daysHigh = array[4];
    const latchedSeconds = array[5];
    const latchedMinutes = array[6];
    const latchedHours = array[7];
    const latchedDaysLow = array[8];
    const latchedDaysHigh = array[9];
    const lastTimeLow = array[10];
    const lastTimeHigh = array[11];
    let lastTimeSeconds = lastTimeLow;
    if (lastTimeLow && lastTimeHigh) {
      lastTimeSeconds = lastTimeHigh << 16 | lastTimeLow;
    }
    return {
      seconds,
      minutes,
      hours,
      daysLow,
      daysHigh,
      latchedSeconds,
      latchedMinutes,
      latchedHours,
      latchedDaysLow,
      latchedDaysHigh,
      lastTime: lastTimeSeconds * 1e3
    };
  }
  saveState() {
    return [
      this.lastTime,
      this.RTCisLatched,
      this.latchedSeconds,
      this.latchedMinutes,
      this.latchedHours,
      this.latchedLDays,
      this.latchedHDays,
      this.RTCSeconds,
      this.RTCMinutes,
      this.RTCHours,
      this.RTCDays,
      this.RTCDayOverFlow,
      this.RTCHalt
    ];
  }
  loadState(data) {
    let index = 0;
    this.lastTime = data[index++];
    this.RTCisLatched = data[index++];
    this.latchedSeconds = data[index++];
    this.latchedMinutes = data[index++];
    this.latchedHours = data[index++];
    this.latchedLDays = data[index++];
    this.latchedHDays = data[index++];
    this.RTCSeconds = data[index++];
    this.RTCMinutes = data[index++];
    this.RTCHours = data[index++];
    this.RTCDays = data[index++];
    this.RTCDayOverFlow = data[index++];
    this.RTCHalt = data[index];
  }
  updateClock() {
    const currentTime = (/* @__PURE__ */ new Date()).getTime();
    const elapsedTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    if (!this.RTCHalt) {
      this.RTCSeconds += elapsedTime / 1e3;
      while (this.RTCSeconds >= 60) {
        this.RTCSeconds -= 60;
        ++this.RTCMinutes;
        if (this.RTCMinutes >= 60) {
          this.RTCMinutes -= 60;
          ++this.RTCHours;
          if (this.RTCHours >= 24) {
            this.RTCHours -= 24;
            ++this.RTCDays;
            if (this.RTCDays >= 512) {
              this.RTCDays -= 512;
              this.RTCDayOverFlow = true;
            }
          }
        }
      }
    }
  }
};

// vendor/jsgbc-core/src/cartridge/MBC3.ts
var MBC3 = class extends MBC {
  rtc;
  constructor(cartridge) {
    super(cartridge);
    this.rtc = new RTC(this);
  }
  writeRomBank = (address, data) => {
    this.romBank1Offset = data & 127;
    this.setCurrentROMBank();
  };
  writeRamBank = (address, data) => {
    this.currentMbcRamBank = data;
    if (data < 4) {
      this.currentRamBankPosition = (this.currentMbcRamBank << 13) - 40960;
    }
  };
  writeHuc3RamBank = (address, data) => {
    this.cartridge.mbc.currentMbcRamBank = data & 3;
    this.cartridge.mbc.currentRamBankPosition = (this.cartridge.mbc.currentMbcRamBank << 13) - 40960;
  };
  writeRam = (address, data) => {
    if (!this.ramBanksEnabled) return;
    switch (this.currentMbcRamBank) {
      case 0:
      case 1:
      case 2:
      case 3:
        this.emit("ramWrite");
        this.ram[address + this.currentRamBankPosition] = data;
        break;
      case 8:
        this.rtc?.writeSeconds(data);
        break;
      case 9:
        this.rtc?.writeMinutes(data);
        break;
      case 10:
        this.rtc?.writeHours(data);
        break;
      case 11:
        this.rtc?.writeDaysLow(data);
        break;
      case 12:
        this.rtc?.writeDaysHigh(data);
        break;
      default:
        console.log("Invalid MBC3 bank address selected: " + this.currentMbcRamBank);
    }
  };
  readRam = (address) => {
    if (!this.ramBanksEnabled) return 255;
    switch (this.currentMbcRamBank) {
      case 0:
      case 1:
      case 2:
      case 3:
        return this.ram[address + this.currentRamBankPosition];
      case 8:
        if (this.rtc) return this.rtc.readSeconds();
        break;
      case 9:
        if (this.rtc) return this.rtc.readMinutes();
        break;
      case 10:
        if (this.rtc) return this.rtc.readHours();
        break;
      case 11:
        if (this.rtc) return this.rtc.readDaysLow();
        break;
      case 12:
        if (this.rtc) return this.rtc.readDaysHigh();
        break;
    }
  };
};

// vendor/jsgbc-core/src/cartridge/MBC5.ts
var MBC5 = class extends MBC {
  setCurrentROMBank() {
    this.currentRomBank = this.romBank1Offset % this.romBankEdge - 1 << 14;
  }
  writRomBank = (address, data) => {
    this.romBank1Offset = this.romBank1Offset & 256 | data;
    this.setCurrentROMBank();
  };
  writeHighRomBank = (address, data) => {
    this.romBank1Offset = (data & 1) << 8 | this.romBank1Offset & 255;
    this.setCurrentROMBank();
  };
  writeRamBank = (address, data) => {
    this.currentMbcRamBank = data & 15;
    this.currentRamBankPosition = (this.currentMbcRamBank << 13) - 40960;
  };
};

// vendor/jsgbc-core/src/cartridge/MBC7.ts
var MBC7 = class extends MBC {
  // Gyro
  highX = 127;
  lowX = 127;
  highY = 127;
  lowY = 127;
  applyGyroEvent(x, y) {
    x *= -100;
    x += 2047;
    this.highX = x >> 8;
    this.lowX = x & 255;
    y *= -100;
    y += 2047;
    this.highY = y >> 8;
    this.lowY = y & 255;
  }
  read(address) {
    if (!this.ramBanksEnabled) return 255;
    switch (address) {
      case 40960:
      case 41056:
      case 41072:
        return 0;
      case 41088:
        return 0;
      case 41040:
        return this.highY;
      case 41024:
        return this.lowY;
      case 41008:
        return this.highX;
      case 40992:
        return this.lowX;
      default:
        return this.ram[address + this.currentRamBankPosition];
    }
  }
};

// vendor/jsgbc-core/src/cartridge/RUMBLE.ts
var RUMBLE = class extends MBC5 {
  writeRamBank = (address, data) => {
    if (data & 8) this.emit("rumble");
    data &= 7;
    this.currentMbcRamBank = data & 15;
    this.currentRamBankPosition = (this.currentMbcRamBank << 13) - 40960;
  };
};

// vendor/jsgbc-core/src/cartridge/Cartridge.ts
var gameAndWatchGameCode = "Game and Watch 50";
var Cartridge = class {
  hasMbc1 = false;
  // does the cartridge use MBC1?
  hasMbc2 = false;
  // does the cartridge use MBC2?
  hasMbc3 = false;
  // does the cartridge use MBC3?
  hasMbc5 = false;
  // does the cartridge use MBC5?
  hasMbc7 = false;
  // does the cartridge use MBC7?
  hasRam = false;
  // does the cartridge use save RAM?
  hasRumble = false;
  // does the cartridge have Rumble addressing? (modified MBC5)
  hasCamera = false;
  // is the cartridge a GameBoy Camera?
  hasTama5 = false;
  // does the cartridge use TAMA5? (Tamagotchi Cartridge)
  hasHuc3 = false;
  // does the cartridge use HuC3? (Hudson Soft / modified MBC3)
  hasHuc1 = false;
  // does the cartridge use HuC1 (Hudson Soft / modified MBC1)?
  hasMmmO1 = false;
  hasRtc = false;
  // does the cartridge have a RTC?
  hasBattery = false;
  gameboy;
  rom;
  useGbcMode;
  name;
  gameCode;
  colorCompatibilityByte;
  type;
  typeName;
  romSizeType;
  ramSizeType;
  hasNewLicenseCode;
  licenseCode;
  mbc;
  mbc1;
  mbc2;
  mbc3;
  mbc5;
  mbc7;
  rumble;
  constructor(rom2) {
    this.rom = rom2 instanceof ROM ? rom2 : new ROM(rom2);
  }
  connect(gameboy) {
    this.gameboy = gameboy;
  }
  disconnect() {
    this.gameboy = void 0;
  }
  interpret() {
    this.name = this.rom.getString(308, 318);
    this.gameCode = this.rom.getString(319, 322);
    this.colorCompatibilityByte = this.rom.getByte(323);
    this.type = this.rom.getByte(327);
    this.setTypeName();
    if (this.name) {
      console.log("Game Title: " + this.name);
    }
    if (this.gameCode) {
      console.log("Game Code: " + this.gameCode);
    }
    if (this.colorCompatibilityByte) {
      console.log("Color Compatibility Byte: " + this.colorCompatibilityByte);
    }
    if (this.type) {
      console.log("Cartridge Type: " + this.type);
    }
    if (this.typeName) {
      console.log("Cartridge Type Name: " + this.typeName);
    }
    this.romSizeType = this.rom.getByte(328);
    this.ramSizeType = this.rom.getByte(329);
    if (!this.gameboy.usedBootRom) {
      switch (this.colorCompatibilityByte) {
        case 0:
          this.useGbcMode = false;
          break;
        case 50:
          if (!settings_default.hasGameBoyPriority && this.name + this.gameCode + this.colorCompatibilityByte === gameAndWatchGameCode) {
            this.useGbcMode = true;
            console.log("Created a boot exception for Game and Watch Gallery 2 (GBC ID byte is wrong on the cartridge).");
          } else {
            this.useGbcMode = false;
          }
          break;
        case 128:
          this.useGbcMode = !settings_default.hasGameBoyPriority;
          break;
        case 192:
          this.useGbcMode = true;
          break;
        default:
          this.useGbcMode = false;
          console.warn("Unknown GameBoy game type code #" + this.colorCompatibilityByte + ", defaulting to GB mode (Old games don't have a type code).");
      }
    } else {
      console.log("used boot rom");
      this.useGbcMode = this.gameboy.usedGbcBootRom;
    }
    const oldLicenseCode = this.rom.getByte(331);
    const newLicenseCode = this.rom.getByte(324) & 65280 | this.rom.getByte(325) & 255;
    if (oldLicenseCode !== 51) {
      this.hasNewLicenseCode = false;
      this.licenseCode = oldLicenseCode;
    } else {
      this.hasNewLicenseCode = true;
      this.licenseCode = newLicenseCode;
    }
  }
  setGbcMode(data) {
    this.useGbcMode = (data & 1) === 0;
    if (this.name + this.gameCode + this.colorCompatibilityByte === gameAndWatchGameCode) {
      this.useGbcMode = true;
      console.log("Created a boot exception for Game and Watch Gallery 2 (GBC ID byte is wrong on the cartridge).");
    }
    console.log("Booted to GBC Mode: " + this.useGbcMode);
  }
  setTypeName() {
    switch (this.type) {
      case 0:
        this.typeName = "ROM";
        break;
      case 1:
        this.hasMbc1 = true;
        this.typeName = "MBC1";
        break;
      case 2:
        this.hasMbc1 = true;
        this.hasRam = true;
        this.typeName = "MBC1 + SRAM";
        break;
      case 3:
        this.hasMbc1 = true;
        this.hasRam = true;
        this.hasBattery = true;
        this.typeName = "MBC1 + SRAM + Battery";
        break;
      case 5:
        this.hasMbc2 = true;
        this.typeName = "MBC2";
        break;
      case 6:
        this.hasMbc2 = true;
        this.hasBattery = true;
        this.typeName = "MBC2 + Battery";
        break;
      case 8:
        this.hasRam = true;
        this.typeName = "ROM + SRAM";
        break;
      case 9:
        this.hasRam = true;
        this.hasBattery = true;
        this.typeName = "ROM + SRAM + Battery";
        break;
      case 11:
        this.hasMmmO1 = true;
        this.typeName = "MMMO1";
        break;
      case 12:
        this.hasMmmO1 = true;
        this.hasRam = true;
        this.typeName = "MMMO1 + SRAM";
        break;
      case 13:
        this.hasMmmO1 = true;
        this.hasRam = true;
        this.hasBattery = true;
        this.typeName = "MMMO1 + SRAM + Battery";
        break;
      case 15:
        this.hasMbc3 = true;
        this.hasRtc = true;
        this.hasBattery = true;
        this.typeName = "MBC3 + RTC + Battery";
        break;
      case 16:
        this.hasMbc3 = true;
        this.hasRtc = true;
        this.hasBattery = true;
        this.hasRam = true;
        this.typeName = "MBC3 + RTC + Battery + SRAM";
        break;
      case 17:
        this.hasMbc3 = true;
        this.typeName = "MBC3";
        break;
      case 18:
        this.hasMbc3 = true;
        this.hasRam = true;
        this.typeName = "MBC3 + SRAM";
        break;
      case 19:
        this.hasMbc3 = true;
        this.hasRam = true;
        this.hasBattery = true;
        this.typeName = "MBC3 + SRAM + Battery";
        break;
      case 25:
        this.hasMbc5 = true;
        this.typeName = "MBC5";
        break;
      case 26:
        this.hasMbc5 = true;
        this.hasRam = true;
        this.typeName = "MBC5 + SRAM";
        break;
      case 27:
        this.hasMbc5 = true;
        this.hasRam = true;
        this.hasBattery = true;
        this.typeName = "MBC5 + SRAM + Battery";
        break;
      case 28:
        this.hasRumble = true;
        this.typeName = "RUMBLE";
        break;
      case 29:
        this.hasRumble = true;
        this.hasRam = true;
        this.typeName = "RUMBLE + SRAM";
        break;
      case 30:
        this.hasRumble = true;
        this.hasRam = true;
        this.hasBattery = true;
        this.typeName = "RUMBLE + SRAM + Battery";
        break;
      case 31:
        this.hasCamera = true;
        this.typeName = "GameBoy Camera";
        break;
      case 34:
        this.hasMbc7 = true;
        this.hasRam = true;
        this.hasBattery = true;
        this.typeName = "MBC7 + SRAM + Battery";
        break;
      case 253:
        this.hasTama5 = true;
        this.typeName = "TAMA5";
        break;
      case 254:
        this.hasHuc3 = true;
        this.typeName = "HuC3";
        break;
      case 255:
        this.hasHuc1 = true;
        this.typeName = "HuC1";
        break;
      default:
        throw new Error("Unknown Cartridge Type");
    }
    if (this.hasMbc1) this.mbc1 = new MBC1(this);
    if (this.hasMbc2) this.mbc2 = new MBC2(this);
    if (this.hasMbc3) this.mbc3 = new MBC3(this);
    if (this.hasMbc5) this.mbc5 = new MBC5(this);
    if (this.hasMbc7) this.mbc7 = new MBC7(this);
    if (this.hasRumble) this.mbc5 = this.rumble = new RUMBLE(this);
    this.mbc = this.mbc1 || this.mbc2 || this.mbc3 || this.mbc5 || this.mbc7 || this.rumble || void 0;
  }
  setupRAM() {
    if (this.mbc) this.mbc.setupRAM();
    this.gameboy.loadRam();
    this.gameboy.loadRtc();
  }
};

// vendor/jsgbc-core/src/GPU.ts
var totalScanlineCount = 154;
var GPU = class {
  constructor(gameboy) {
    this.gameboy = gameboy;
    this.disableLCD();
  }
  gameboy;
  lcdEnabled = false;
  scanlineProcessors = [];
  renderBackgroundLayer;
  renderWindowLayer;
  renderSpriteLayer;
  initRenderer() {
    if (!this.gameboy.cartridge.useGbcMode) {
      this.renderBackgroundLayer = this.renderGbBackgroundLayer;
      this.renderWindowLayer = this.renderGbWindowLayer;
      this.renderSpriteLayer = this.renderGbSpriteLayer;
    } else {
      if (this.gameboy.hasBackgroundPriority) {
        this.renderBackgroundLayer = this.renderGbcBackgroundLayer;
        this.renderWindowLayer = this.renderGbcWindowLayer;
      } else {
        this.renderBackgroundLayer = this.renderGbcBackgroundLayerWithoutPriorityFlagging;
        this.renderWindowLayer = this.renderGbcWindowLayerWithoutPriorityFlagging;
      }
      this.renderSpriteLayer = this.renderGbcSpriteLayer;
    }
  }
  renderGbcSpriteLayer = (scanline) => {
    if (this.gameboy.gfxSpriteShow) {
      var OAMAddress = 65024;
      var lineAdjusted = scanline + 16;
      var yoffset = 0;
      var xcoord = 0;
      var endX = 0;
      var xCounter = 0;
      var attrCode = 0;
      var palette = 0;
      var tile = null;
      var data = 0;
      var currentPixel = 0;
      var spriteCount = 0;
      if (this.gameboy.gfxSpriteNormalHeight) {
        for (; OAMAddress < 65184 && spriteCount < 10; OAMAddress += 4) {
          yoffset = lineAdjusted - this.gameboy.memory[OAMAddress];
          if ((yoffset & 7) === yoffset) {
            xcoord = this.gameboy.memory[OAMAddress | 1] - 8;
            endX = Math.min(160, xcoord + 8);
            attrCode = this.gameboy.memory[OAMAddress | 3];
            palette = (attrCode & 7) << 2;
            tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | this.gameboy.memory[OAMAddress | 2]];
            xCounter = xcoord > 0 ? xcoord : 0;
            xcoord -= yoffset << 3;
            for (currentPixel = this.gameboy.pixelStart + xCounter; xCounter < endX; ++xCounter, ++currentPixel) {
              if (this.gameboy.frameBuffer[currentPixel] >= 33554432) {
                data = tile[xCounter - xcoord];
                if (data > 0) {
                  this.gameboy.frameBuffer[currentPixel] = this.gameboy.gbcOBJPalette[palette | data];
                }
              } else if (this.gameboy.frameBuffer[currentPixel] < 16777216) {
                data = tile[xCounter - xcoord];
                if (data > 0 && attrCode < 128) {
                  this.gameboy.frameBuffer[currentPixel] = this.gameboy.gbcOBJPalette[palette | data];
                }
              }
            }
            ++spriteCount;
          }
        }
      } else {
        for (; OAMAddress < 65184 && spriteCount < 10; OAMAddress += 4) {
          yoffset = lineAdjusted - this.gameboy.memory[OAMAddress];
          if ((yoffset & 15) === yoffset) {
            xcoord = this.gameboy.memory[OAMAddress | 1] - 8;
            endX = Math.min(160, xcoord + 8);
            attrCode = this.gameboy.memory[OAMAddress | 3];
            palette = (attrCode & 7) << 2;
            if ((attrCode & 64) === (64 & yoffset << 3)) {
              tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | this.gameboy.memory[OAMAddress | 2] & 254];
            } else {
              tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | this.gameboy.memory[OAMAddress | 2] | 1];
            }
            xCounter = xcoord > 0 ? xcoord : 0;
            xcoord -= (yoffset & 7) << 3;
            for (currentPixel = this.gameboy.pixelStart + xCounter; xCounter < endX; ++xCounter, ++currentPixel) {
              if (this.gameboy.frameBuffer[currentPixel] >= 33554432) {
                data = tile[xCounter - xcoord];
                if (data > 0) {
                  this.gameboy.frameBuffer[currentPixel] = this.gameboy.gbcOBJPalette[palette | data];
                }
              } else if (this.gameboy.frameBuffer[currentPixel] < 16777216) {
                data = tile[xCounter - xcoord];
                if (data > 0 && attrCode < 128) {
                  this.gameboy.frameBuffer[currentPixel] = this.gameboy.gbcOBJPalette[palette | data];
                }
              }
            }
            ++spriteCount;
          }
        }
      }
    }
  };
  renderGbBackgroundLayer = (scanline) => {
    var scrollYAdjusted = this.gameboy.backgroundY + scanline & 255;
    var tileYLine = (scrollYAdjusted & 7) << 3;
    var tileYDown = this.gameboy.gfxBackgroundCHRBankPosition | (scrollYAdjusted & 248) << 2;
    var scrollXAdjusted = this.gameboy.backgroundX + this.gameboy.currentX & 255;
    var pixelPosition = this.gameboy.pixelStart + this.gameboy.currentX;
    var pixelPositionEnd = this.gameboy.pixelStart + (this.gameboy.gfxWindowDisplay && scanline - this.gameboy.windowY >= 0 ? Math.min(Math.max(this.gameboy.windowX, 0) + this.gameboy.currentX, this.gameboy.pixelEnd) : this.gameboy.pixelEnd);
    var tileNumber = tileYDown + (scrollXAdjusted >> 3);
    var chrCode = this.gameboy.BGCHRBank1[tileNumber];
    if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
      chrCode |= 256;
    }
    var tile = this.gameboy.tileCache[chrCode];
    for (var texel = scrollXAdjusted & 7; texel < 8 && pixelPosition < pixelPositionEnd && scrollXAdjusted < 256; ++scrollXAdjusted) {
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[tileYLine | texel++]];
    }
    var scrollXAdjustedAligned = Math.min(pixelPositionEnd - pixelPosition, 256 - scrollXAdjusted) >> 3;
    scrollXAdjusted += scrollXAdjustedAligned << 3;
    scrollXAdjustedAligned += tileNumber;
    while (tileNumber < scrollXAdjustedAligned) {
      chrCode = this.gameboy.BGCHRBank1[++tileNumber];
      if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
        chrCode |= 256;
      }
      tile = this.gameboy.tileCache[chrCode];
      texel = tileYLine;
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel]];
    }
    if (pixelPosition < pixelPositionEnd) {
      if (scrollXAdjusted < 256) {
        chrCode = this.gameboy.BGCHRBank1[++tileNumber];
        if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
          chrCode |= 256;
        }
        tile = this.gameboy.tileCache[chrCode];
        for (texel = tileYLine - 1; pixelPosition < pixelPositionEnd && scrollXAdjusted < 256; ++scrollXAdjusted) {
          this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[++texel]];
        }
      }
      scrollXAdjustedAligned = (pixelPositionEnd - pixelPosition >> 3) + tileYDown;
      while (tileYDown < scrollXAdjustedAligned) {
        chrCode = this.gameboy.BGCHRBank1[tileYDown++];
        if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
          chrCode |= 256;
        }
        tile = this.gameboy.tileCache[chrCode];
        texel = tileYLine;
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel]];
      }
      if (pixelPosition < pixelPositionEnd) {
        chrCode = this.gameboy.BGCHRBank1[tileYDown];
        if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
          chrCode |= 256;
        }
        tile = this.gameboy.tileCache[chrCode];
        switch (pixelPositionEnd - pixelPosition) {
          case 7:
            this.gameboy.frameBuffer[pixelPosition + 6] = this.gameboy.backgroundPalette[tile[tileYLine | 6]];
          case 6:
            this.gameboy.frameBuffer[pixelPosition + 5] = this.gameboy.backgroundPalette[tile[tileYLine | 5]];
          case 5:
            this.gameboy.frameBuffer[pixelPosition + 4] = this.gameboy.backgroundPalette[tile[tileYLine | 4]];
          case 4:
            this.gameboy.frameBuffer[pixelPosition + 3] = this.gameboy.backgroundPalette[tile[tileYLine | 3]];
          case 3:
            this.gameboy.frameBuffer[pixelPosition + 2] = this.gameboy.backgroundPalette[tile[tileYLine | 2]];
          case 2:
            this.gameboy.frameBuffer[pixelPosition + 1] = this.gameboy.backgroundPalette[tile[tileYLine | 1]];
          case 1:
            this.gameboy.frameBuffer[pixelPosition] = this.gameboy.backgroundPalette[tile[tileYLine]];
        }
      }
    }
  };
  renderGbcBackgroundLayerWithoutPriorityFlagging(scanline) {
    var scrollYAdjusted = this.gameboy.backgroundY + scanline & 255;
    var tileYLine = (scrollYAdjusted & 7) << 3;
    var tileYDown = this.gameboy.gfxBackgroundCHRBankPosition | (scrollYAdjusted & 248) << 2;
    var scrollXAdjusted = this.gameboy.backgroundX + this.gameboy.currentX & 255;
    var pixelPosition = this.gameboy.pixelStart + this.gameboy.currentX;
    var pixelPositionEnd = this.gameboy.pixelStart + (this.gameboy.gfxWindowDisplay && scanline - this.gameboy.windowY >= 0 ? Math.min(Math.max(this.gameboy.windowX, 0) + this.gameboy.currentX, this.gameboy.pixelEnd) : this.gameboy.pixelEnd);
    var tileNumber = tileYDown + (scrollXAdjusted >> 3);
    var chrCode = this.gameboy.BGCHRBank1[tileNumber];
    if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
      chrCode |= 256;
    }
    var attrCode = this.gameboy.BGCHRBank2[tileNumber];
    var tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
    var palette = (attrCode & 7) << 2;
    for (var texel = scrollXAdjusted & 7; texel < 8 && pixelPosition < pixelPositionEnd && scrollXAdjusted < 256; ++scrollXAdjusted) {
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | texel++]];
    }
    var scrollXAdjustedAligned = Math.min(pixelPositionEnd - pixelPosition, 256 - scrollXAdjusted) >> 3;
    scrollXAdjusted += scrollXAdjustedAligned << 3;
    scrollXAdjustedAligned += tileNumber;
    while (tileNumber < scrollXAdjustedAligned) {
      chrCode = this.gameboy.BGCHRBank1[++tileNumber];
      if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
        chrCode |= 256;
      }
      attrCode = this.gameboy.BGCHRBank2[tileNumber];
      tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
      palette = (attrCode & 7) << 2;
      texel = tileYLine;
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel]];
    }
    if (pixelPosition < pixelPositionEnd) {
      if (scrollXAdjusted < 256) {
        chrCode = this.gameboy.BGCHRBank1[++tileNumber];
        if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
          chrCode |= 256;
        }
        attrCode = this.gameboy.BGCHRBank2[tileNumber];
        tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
        palette = (attrCode & 7) << 2;
        for (texel = tileYLine - 1; pixelPosition < pixelPositionEnd && scrollXAdjusted < 256; ++scrollXAdjusted) {
          this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[++texel]];
        }
      }
      scrollXAdjustedAligned = (pixelPositionEnd - pixelPosition >> 3) + tileYDown;
      while (tileYDown < scrollXAdjustedAligned) {
        chrCode = this.gameboy.BGCHRBank1[tileYDown];
        if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
          chrCode |= 256;
        }
        attrCode = this.gameboy.BGCHRBank2[tileYDown++];
        tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
        palette = (attrCode & 7) << 2;
        texel = tileYLine;
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel]];
      }
      if (pixelPosition < pixelPositionEnd) {
        chrCode = this.gameboy.BGCHRBank1[tileYDown];
        if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
          chrCode |= 256;
        }
        attrCode = this.gameboy.BGCHRBank2[tileYDown];
        tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
        palette = (attrCode & 7) << 2;
        switch (pixelPositionEnd - pixelPosition) {
          case 7:
            this.gameboy.frameBuffer[pixelPosition + 6] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 6]];
          case 6:
            this.gameboy.frameBuffer[pixelPosition + 5] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 5]];
          case 5:
            this.gameboy.frameBuffer[pixelPosition + 4] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 4]];
          case 4:
            this.gameboy.frameBuffer[pixelPosition + 3] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 3]];
          case 3:
            this.gameboy.frameBuffer[pixelPosition + 2] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 2]];
          case 2:
            this.gameboy.frameBuffer[pixelPosition + 1] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 1]];
          case 1:
            this.gameboy.frameBuffer[pixelPosition] = this.gameboy.gbcBGPalette[palette | tile[tileYLine]];
        }
      }
    }
  }
  renderGbWindowLayer = (scanline) => {
    if (this.gameboy.gfxWindowDisplay) {
      var scrollYAdjusted = scanline - this.gameboy.windowY;
      if (scrollYAdjusted >= 0) {
        var scrollXRangeAdjusted = this.gameboy.windowX > 0 ? this.gameboy.windowX + this.gameboy.currentX : this.gameboy.currentX;
        var pixelPosition = this.gameboy.pixelStart + scrollXRangeAdjusted;
        var pixelPositionEnd = this.gameboy.pixelStart + this.gameboy.pixelEnd;
        if (pixelPosition < pixelPositionEnd) {
          var tileYLine = (scrollYAdjusted & 7) << 3;
          var tileNumber = (this.gameboy.gfxWindowCHRBankPosition | (scrollYAdjusted & 248) << 2) + (this.gameboy.currentX >> 3);
          var chrCode = this.gameboy.BGCHRBank1[tileNumber];
          if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
            chrCode |= 256;
          }
          var tile = this.gameboy.tileCache[chrCode];
          var texel = scrollXRangeAdjusted - this.gameboy.windowX & 7;
          scrollXRangeAdjusted = Math.min(8, texel + pixelPositionEnd - pixelPosition);
          while (texel < scrollXRangeAdjusted) {
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[tileYLine | texel++]];
          }
          scrollXRangeAdjusted = tileNumber + (pixelPositionEnd - pixelPosition >> 3);
          while (tileNumber < scrollXRangeAdjusted) {
            chrCode = this.gameboy.BGCHRBank1[++tileNumber];
            if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
              chrCode |= 256;
            }
            tile = this.gameboy.tileCache[chrCode];
            texel = tileYLine;
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.backgroundPalette[tile[texel]];
          }
          if (pixelPosition < pixelPositionEnd) {
            chrCode = this.gameboy.BGCHRBank1[++tileNumber];
            if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
              chrCode |= 256;
            }
            tile = this.gameboy.tileCache[chrCode];
            switch (pixelPositionEnd - pixelPosition) {
              case 7:
                this.gameboy.frameBuffer[pixelPosition + 6] = this.gameboy.backgroundPalette[tile[tileYLine | 6]];
              case 6:
                this.gameboy.frameBuffer[pixelPosition + 5] = this.gameboy.backgroundPalette[tile[tileYLine | 5]];
              case 5:
                this.gameboy.frameBuffer[pixelPosition + 4] = this.gameboy.backgroundPalette[tile[tileYLine | 4]];
              case 4:
                this.gameboy.frameBuffer[pixelPosition + 3] = this.gameboy.backgroundPalette[tile[tileYLine | 3]];
              case 3:
                this.gameboy.frameBuffer[pixelPosition + 2] = this.gameboy.backgroundPalette[tile[tileYLine | 2]];
              case 2:
                this.gameboy.frameBuffer[pixelPosition + 1] = this.gameboy.backgroundPalette[tile[tileYLine | 1]];
              case 1:
                this.gameboy.frameBuffer[pixelPosition] = this.gameboy.backgroundPalette[tile[tileYLine]];
            }
          }
        }
      }
    }
  };
  renderGbcWindowLayer(scanline) {
    if (this.gameboy.gfxWindowDisplay) {
      var scrollYAdjusted = scanline - this.gameboy.windowY;
      if (scrollYAdjusted >= 0) {
        var scrollXRangeAdjusted = this.gameboy.windowX > 0 ? this.gameboy.windowX + this.gameboy.currentX : this.gameboy.currentX;
        var pixelPosition = this.gameboy.pixelStart + scrollXRangeAdjusted;
        var pixelPositionEnd = this.gameboy.pixelStart + this.gameboy.pixelEnd;
        if (pixelPosition < pixelPositionEnd) {
          var tileYLine = (scrollYAdjusted & 7) << 3;
          var tileNumber = (this.gameboy.gfxWindowCHRBankPosition | (scrollYAdjusted & 248) << 2) + (this.gameboy.currentX >> 3);
          var chrCode = this.gameboy.BGCHRBank1[tileNumber];
          if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
            chrCode |= 256;
          }
          var attrCode = this.gameboy.BGCHRBank2[tileNumber];
          var tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
          var palette = (attrCode & 7) << 2 | (attrCode & 128) >> 2;
          var texel = scrollXRangeAdjusted - this.gameboy.windowX & 7;
          scrollXRangeAdjusted = Math.min(8, texel + pixelPositionEnd - pixelPosition);
          while (texel < scrollXRangeAdjusted) {
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | texel++]];
          }
          scrollXRangeAdjusted = tileNumber + (pixelPositionEnd - pixelPosition >> 3);
          while (tileNumber < scrollXRangeAdjusted) {
            chrCode = this.gameboy.BGCHRBank1[++tileNumber];
            if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
              chrCode |= 256;
            }
            attrCode = this.gameboy.BGCHRBank2[tileNumber];
            tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
            palette = (attrCode & 7) << 2 | (attrCode & 128) >> 2;
            texel = tileYLine;
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel]];
          }
          if (pixelPosition < pixelPositionEnd) {
            chrCode = this.gameboy.BGCHRBank1[++tileNumber];
            if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
              chrCode |= 256;
            }
            attrCode = this.gameboy.BGCHRBank2[tileNumber];
            tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
            palette = (attrCode & 7) << 2 | (attrCode & 128) >> 2;
            switch (pixelPositionEnd - pixelPosition) {
              case 7:
                this.gameboy.frameBuffer[pixelPosition + 6] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 6]];
              case 6:
                this.gameboy.frameBuffer[pixelPosition + 5] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 5]];
              case 5:
                this.gameboy.frameBuffer[pixelPosition + 4] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 4]];
              case 4:
                this.gameboy.frameBuffer[pixelPosition + 3] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 3]];
              case 3:
                this.gameboy.frameBuffer[pixelPosition + 2] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 2]];
              case 2:
                this.gameboy.frameBuffer[pixelPosition + 1] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 1]];
              case 1:
                this.gameboy.frameBuffer[pixelPosition] = this.gameboy.gbcBGPalette[palette | tile[tileYLine]];
            }
          }
        }
      }
    }
  }
  renderGbcWindowLayerWithoutPriorityFlagging(scanline) {
    if (this.gameboy.gfxWindowDisplay) {
      var scrollYAdjusted = scanline - this.gameboy.windowY;
      if (scrollYAdjusted >= 0) {
        var scrollXRangeAdjusted = this.gameboy.windowX > 0 ? this.gameboy.windowX + this.gameboy.currentX : this.gameboy.currentX;
        var pixelPosition = this.gameboy.pixelStart + scrollXRangeAdjusted;
        var pixelPositionEnd = this.gameboy.pixelStart + this.gameboy.pixelEnd;
        if (pixelPosition < pixelPositionEnd) {
          var tileYLine = (scrollYAdjusted & 7) << 3;
          var tileNumber = (this.gameboy.gfxWindowCHRBankPosition | (scrollYAdjusted & 248) << 2) + (this.gameboy.currentX >> 3);
          var chrCode = this.gameboy.BGCHRBank1[tileNumber];
          if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
            chrCode |= 256;
          }
          var attrCode = this.gameboy.BGCHRBank2[tileNumber];
          var tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
          var palette = (attrCode & 7) << 2;
          var texel = scrollXRangeAdjusted - this.gameboy.windowX & 7;
          scrollXRangeAdjusted = Math.min(8, texel + pixelPositionEnd - pixelPosition);
          while (texel < scrollXRangeAdjusted) {
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | texel++]];
          }
          scrollXRangeAdjusted = tileNumber + (pixelPositionEnd - pixelPosition >> 3);
          while (tileNumber < scrollXRangeAdjusted) {
            chrCode = this.gameboy.BGCHRBank1[++tileNumber];
            if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
              chrCode |= 256;
            }
            attrCode = this.gameboy.BGCHRBank2[tileNumber];
            tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
            palette = (attrCode & 7) << 2;
            texel = tileYLine;
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
            this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel]];
          }
          if (pixelPosition < pixelPositionEnd) {
            chrCode = this.gameboy.BGCHRBank1[++tileNumber];
            if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
              chrCode |= 256;
            }
            attrCode = this.gameboy.BGCHRBank2[tileNumber];
            tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
            palette = (attrCode & 7) << 2;
            switch (pixelPositionEnd - pixelPosition) {
              case 7:
                this.gameboy.frameBuffer[pixelPosition + 6] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 6]];
              case 6:
                this.gameboy.frameBuffer[pixelPosition + 5] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 5]];
              case 5:
                this.gameboy.frameBuffer[pixelPosition + 4] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 4]];
              case 4:
                this.gameboy.frameBuffer[pixelPosition + 3] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 3]];
              case 3:
                this.gameboy.frameBuffer[pixelPosition + 2] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 2]];
              case 2:
                this.gameboy.frameBuffer[pixelPosition + 1] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 1]];
              case 1:
                this.gameboy.frameBuffer[pixelPosition] = this.gameboy.gbcBGPalette[palette | tile[tileYLine]];
            }
          }
        }
      }
    }
  }
  renderGbcBackgroundLayer(scanline) {
    var scrollYAdjusted = this.gameboy.backgroundY + scanline & 255;
    var tileYLine = (scrollYAdjusted & 7) << 3;
    var tileYDown = this.gameboy.gfxBackgroundCHRBankPosition | (scrollYAdjusted & 248) << 2;
    var scrollXAdjusted = this.gameboy.backgroundX + this.gameboy.currentX & 255;
    var pixelPosition = this.gameboy.pixelStart + this.gameboy.currentX;
    var pixelPositionEnd = this.gameboy.pixelStart + (this.gameboy.gfxWindowDisplay && scanline - this.gameboy.windowY >= 0 ? Math.min(Math.max(this.gameboy.windowX, 0) + this.gameboy.currentX, this.gameboy.pixelEnd) : this.gameboy.pixelEnd);
    var tileNumber = tileYDown + (scrollXAdjusted >> 3);
    var chrCode = this.gameboy.BGCHRBank1[tileNumber];
    if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
      chrCode |= 256;
    }
    var attrCode = this.gameboy.BGCHRBank2[tileNumber];
    var tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
    var palette = (attrCode & 7) << 2 | (attrCode & 128) >> 2;
    for (var texel = scrollXAdjusted & 7; texel < 8 && pixelPosition < pixelPositionEnd && scrollXAdjusted < 256; ++scrollXAdjusted) {
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | texel++]];
    }
    var scrollXAdjustedAligned = Math.min(pixelPositionEnd - pixelPosition, 256 - scrollXAdjusted) >> 3;
    scrollXAdjusted += scrollXAdjustedAligned << 3;
    scrollXAdjustedAligned += tileNumber;
    while (tileNumber < scrollXAdjustedAligned) {
      chrCode = this.gameboy.BGCHRBank1[++tileNumber];
      if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
        chrCode |= 256;
      }
      attrCode = this.gameboy.BGCHRBank2[tileNumber];
      tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
      palette = (attrCode & 7) << 2 | (attrCode & 128) >> 2;
      texel = tileYLine;
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
      this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel]];
    }
    if (pixelPosition < pixelPositionEnd) {
      if (scrollXAdjusted < 256) {
        chrCode = this.gameboy.BGCHRBank1[++tileNumber];
        if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
          chrCode |= 256;
        }
        attrCode = this.gameboy.BGCHRBank2[tileNumber];
        tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
        palette = (attrCode & 7) << 2 | (attrCode & 128) >> 2;
        for (texel = tileYLine - 1; pixelPosition < pixelPositionEnd && scrollXAdjusted < 256; ++scrollXAdjusted) {
          this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[++texel]];
        }
      }
      scrollXAdjustedAligned = (pixelPositionEnd - pixelPosition >> 3) + tileYDown;
      while (tileYDown < scrollXAdjustedAligned) {
        chrCode = this.gameboy.BGCHRBank1[tileYDown];
        if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
          chrCode |= 256;
        }
        attrCode = this.gameboy.BGCHRBank2[tileYDown++];
        tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
        palette = (attrCode & 7) << 2 | (attrCode & 128) >> 2;
        texel = tileYLine;
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel++]];
        this.gameboy.frameBuffer[pixelPosition++] = this.gameboy.gbcBGPalette[palette | tile[texel]];
      }
      if (pixelPosition < pixelPositionEnd) {
        chrCode = this.gameboy.BGCHRBank1[tileYDown];
        if (chrCode < this.gameboy.gfxBackgroundBankOffset) {
          chrCode |= 256;
        }
        attrCode = this.gameboy.BGCHRBank2[tileYDown];
        tile = this.gameboy.tileCache[(attrCode & 8) << 8 | (attrCode & 96) << 4 | chrCode];
        palette = (attrCode & 7) << 2 | (attrCode & 128) >> 2;
        switch (pixelPositionEnd - pixelPosition) {
          case 7:
            this.gameboy.frameBuffer[pixelPosition + 6] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 6]];
          case 6:
            this.gameboy.frameBuffer[pixelPosition + 5] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 5]];
          case 5:
            this.gameboy.frameBuffer[pixelPosition + 4] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 4]];
          case 4:
            this.gameboy.frameBuffer[pixelPosition + 3] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 3]];
          case 3:
            this.gameboy.frameBuffer[pixelPosition + 2] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 2]];
          case 2:
            this.gameboy.frameBuffer[pixelPosition + 1] = this.gameboy.gbcBGPalette[palette | tile[tileYLine | 1]];
          case 1:
            this.gameboy.frameBuffer[pixelPosition] = this.gameboy.gbcBGPalette[palette | tile[tileYLine]];
        }
      }
    }
  }
  renderGbSpriteLayer = (scanlineToRender) => {
    if (!this.gameboy.gfxSpriteShow) return;
    const lineAdjusted = scanlineToRender + 16;
    let OAMAddress = 65024;
    let yoffset = 0;
    let xcoord = 1;
    let xCoordStart = 0;
    let xCoordEnd = 0;
    let attrCode = 0;
    let palette = 0;
    let tile = null;
    let data = 0;
    let spriteCount = 0;
    let currentPixel = 0;
    let linePixel = 0;
    while (xcoord < 168) {
      this.gameboy.sortBuffer[xcoord++] = 255;
    }
    if (this.gameboy.gfxSpriteNormalHeight) {
      for (let length = this.gameboy.findLowestSpriteDrawable(lineAdjusted, 7); spriteCount < length; ++spriteCount) {
        OAMAddress = this.gameboy.OAMAddressCache[spriteCount];
        yoffset = lineAdjusted - this.gameboy.memory[OAMAddress] << 3;
        attrCode = this.gameboy.memory[OAMAddress | 3];
        palette = (attrCode & 16) >> 2;
        tile = this.gameboy.tileCache[(attrCode & 96) << 4 | this.gameboy.memory[OAMAddress | 2]];
        linePixel = xCoordStart = this.gameboy.memory[OAMAddress | 1];
        xCoordEnd = Math.min(168 - linePixel, 8);
        xcoord = linePixel > 7 ? 0 : 8 - linePixel;
        for (currentPixel = this.gameboy.pixelStart + (linePixel > 8 ? linePixel - 8 : 0); xcoord < xCoordEnd; ++xcoord, ++currentPixel, ++linePixel) {
          if (this.gameboy.sortBuffer[linePixel] > xCoordStart) {
            if (this.gameboy.frameBuffer[currentPixel] >= 33554432) {
              data = tile[yoffset | xcoord];
              if (data > 0) {
                this.gameboy.frameBuffer[currentPixel] = this.gameboy.OBJPalette[palette | data];
                this.gameboy.sortBuffer[linePixel] = xCoordStart;
              }
            } else if (this.gameboy.frameBuffer[currentPixel] < 16777216) {
              data = tile[yoffset | xcoord];
              if (data > 0 && attrCode < 128) {
                this.gameboy.frameBuffer[currentPixel] = this.gameboy.OBJPalette[palette | data];
                this.gameboy.sortBuffer[linePixel] = xCoordStart;
              }
            }
          }
        }
      }
    } else {
      for (let length = this.gameboy.findLowestSpriteDrawable(lineAdjusted, 15); spriteCount < length; ++spriteCount) {
        OAMAddress = this.gameboy.OAMAddressCache[spriteCount];
        yoffset = lineAdjusted - this.gameboy.memory[OAMAddress] << 3;
        attrCode = this.gameboy.memory[OAMAddress | 3];
        palette = (attrCode & 16) >> 2;
        if ((attrCode & 64) === (64 & yoffset)) {
          tile = this.gameboy.tileCache[(attrCode & 96) << 4 | this.gameboy.memory[OAMAddress | 2] & 254];
        } else {
          tile = this.gameboy.tileCache[(attrCode & 96) << 4 | this.gameboy.memory[OAMAddress | 2] | 1];
        }
        yoffset &= 63;
        linePixel = xCoordStart = this.gameboy.memory[OAMAddress | 1];
        xCoordEnd = Math.min(168 - linePixel, 8);
        xcoord = linePixel > 7 ? 0 : 8 - linePixel;
        for (currentPixel = this.gameboy.pixelStart + (linePixel > 8 ? linePixel - 8 : 0); xcoord < xCoordEnd; ++xcoord, ++currentPixel, ++linePixel) {
          if (this.gameboy.sortBuffer[linePixel] > xCoordStart) {
            if (this.gameboy.frameBuffer[currentPixel] >= 33554432) {
              data = tile[yoffset | xcoord];
              if (data > 0) {
                this.gameboy.frameBuffer[currentPixel] = this.gameboy.OBJPalette[palette | data];
                this.gameboy.sortBuffer[linePixel] = xCoordStart;
              }
            } else if (this.gameboy.frameBuffer[currentPixel] < 16777216) {
              data = tile[yoffset | xcoord];
              if (data > 0 && attrCode < 128) {
                this.gameboy.frameBuffer[currentPixel] = this.gameboy.OBJPalette[palette | data];
                this.gameboy.sortBuffer[linePixel] = xCoordStart;
              }
            }
          }
        }
      }
    }
  };
  runScanline(lineNumber) {
    this.scanlineProcessors[lineNumber]();
  }
  disableLCD() {
    for (let line = 0; line < totalScanlineCount; ++line) {
      this.scanlineProcessors[line] = () => {
      };
    }
    this.lcdEnabled = false;
  }
  enableLCD() {
    for (let line = 0; line < totalScanlineCount; ++line) {
      if (line < 143) {
        this.scanlineProcessors[line] = this.runVisibleScanline;
      } else if (line === 143) {
        this.scanlineProcessors[143] = this.runLastVisibleScanline;
      } else if (line < 153) {
        this.scanlineProcessors[line] = this.runVBlankScanline;
      } else {
        this.scanlineProcessors[153] = this.runLastVBlankScanline;
      }
    }
    this.lcdEnabled = true;
  }
  runVisibleScanline = () => {
    if (this.gameboy.LCDTicks < 80) {
      this.gameboy.scanLineMode2();
    } else if (this.gameboy.LCDTicks < 252) {
      this.gameboy.scanLineMode3();
    } else if (this.gameboy.LCDTicks < 456) {
      this.gameboy.scanLineMode0();
    } else {
      this.gameboy.LCDTicks -= 456;
      if (this.gameboy.STATTracker !== 3) {
        if (this.gameboy.STATTracker !== 2) {
          if (this.gameboy.STATTracker === 0 && this.gameboy.mode2TriggerSTAT) {
            this.gameboy.interruptRequestedFlags |= 2;
          }
          this.gameboy.incrementScanlineQueue();
        }
        if (this.gameboy.hdmaRunning) {
          this.gameboy.executeHDMA();
        }
        if (this.gameboy.mode0TriggerSTAT) {
          this.gameboy.interruptRequestedFlags |= 2;
        }
      }
      this.gameboy.actualScanline = ++this.gameboy.memory[65348];
      if (this.gameboy.actualScanline === this.gameboy.memory[65349]) {
        this.gameboy.memory[65345] |= 4;
        if (this.gameboy.LYCMatchTriggerSTAT) {
          this.gameboy.interruptRequestedFlags |= 2;
        }
      } else {
        this.gameboy.memory[65345] &= 123;
      }
      this.gameboy.checkIrqMatching();
      this.gameboy.STATTracker = 0;
      this.gameboy.modeSTAT = 2;
      this.scanlineProcessors[this.gameboy.actualScanline]();
    }
  };
  runLastVisibleScanline = () => {
    if (this.gameboy.LCDTicks < 80) {
      this.gameboy.scanLineMode2();
    } else if (this.gameboy.LCDTicks < 252) {
      this.gameboy.scanLineMode3();
    } else if (this.gameboy.LCDTicks < 456) {
      this.gameboy.scanLineMode0();
    } else {
      this.gameboy.LCDTicks -= 456;
      if (this.gameboy.STATTracker !== 3) {
        if (this.gameboy.STATTracker !== 2) {
          if (this.gameboy.STATTracker === 0 && this.gameboy.mode2TriggerSTAT) {
            this.gameboy.interruptRequestedFlags |= 2;
          }
          this.gameboy.incrementScanlineQueue();
        }
        if (this.gameboy.hdmaRunning) {
          this.gameboy.executeHDMA();
        }
        if (this.gameboy.mode0TriggerSTAT) {
          this.gameboy.interruptRequestedFlags |= 2;
        }
      }
      this.gameboy.actualScanline = this.gameboy.memory[65348] = 144;
      if (this.gameboy.memory[65349] === 144) {
        this.gameboy.memory[65345] |= 4;
        if (this.gameboy.LYCMatchTriggerSTAT) {
          this.gameboy.interruptRequestedFlags |= 2;
        }
      } else {
        this.gameboy.memory[65345] &= 123;
      }
      this.gameboy.STATTracker = 0;
      this.gameboy.modeSTAT = 1;
      this.gameboy.interruptRequestedFlags |= this.gameboy.mode1TriggerSTAT ? 3 : 1;
      this.gameboy.checkIrqMatching();
      if (this.gameboy.drewBlank === 0) {
        if (this.gameboy.cpu.totalLinesPassed < 144 || this.gameboy.cpu.totalLinesPassed === 144 && this.gameboy.midScanlineOffset > -1) {
          this.gameboy.graphicsJITVBlank();
          this.gameboy.lcdDevice.outputFrameBuffer();
        }
      } else {
        --this.gameboy.drewBlank;
      }
      this.scanlineProcessors[144]();
    }
  };
  runVBlankScanline = () => {
    if (this.gameboy.LCDTicks >= 456) {
      this.gameboy.LCDTicks -= 456;
      this.gameboy.actualScanline = ++this.gameboy.memory[65348];
      if (this.gameboy.actualScanline === this.gameboy.memory[65349]) {
        this.gameboy.memory[65345] |= 4;
        if (this.gameboy.LYCMatchTriggerSTAT) {
          this.gameboy.interruptRequestedFlags |= 2;
          this.gameboy.checkIrqMatching();
        }
      } else {
        this.gameboy.memory[65345] &= 123;
      }
      this.scanlineProcessors[this.gameboy.actualScanline]();
    }
  };
  runLastVBlankScanline = () => {
    if (this.gameboy.LCDTicks >= 8) {
      if (this.gameboy.STATTracker !== 4 && this.gameboy.memory[65348] === 153) {
        this.gameboy.memory[65348] = 0;
        if (this.gameboy.memory[65349] === 0) {
          this.gameboy.memory[65345] |= 4;
          if (this.gameboy.LYCMatchTriggerSTAT) {
            this.gameboy.interruptRequestedFlags |= 2;
            this.gameboy.checkIrqMatching();
          }
        } else {
          this.gameboy.memory[65345] &= 123;
        }
        this.gameboy.STATTracker = 4;
      }
      if (this.gameboy.LCDTicks >= 456) {
        this.gameboy.LCDTicks -= 456;
        this.gameboy.STATTracker = this.gameboy.actualScanline = 0;
        this.scanlineProcessors[0]();
      }
    }
  };
};

// vendor/jsgbc-core/src/postBootRomState.ts
var postBootRomState_default = [
  15,
  0,
  124,
  255,
  0,
  0,
  0,
  248,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  1,
  128,
  191,
  243,
  255,
  191,
  255,
  63,
  0,
  255,
  191,
  127,
  255,
  159,
  255,
  191,
  255,
  255,
  0,
  0,
  191,
  119,
  243,
  241,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  0,
  255,
  0,
  255,
  0,
  255,
  0,
  255,
  0,
  255,
  0,
  255,
  0,
  255,
  0,
  255,
  145,
  128,
  0,
  0,
  0,
  0,
  0,
  252,
  0,
  0,
  0,
  0,
  255,
  126,
  255,
  254,
  255,
  255,
  255,
  255,
  255,
  255,
  62,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  192,
  255,
  193,
  0,
  254,
  255,
  255,
  255,
  248,
  255,
  0,
  0,
  0,
  143,
  0,
  0,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  255,
  206,
  237,
  102,
  102,
  204,
  13,
  0,
  11,
  3,
  115,
  0,
  131,
  0,
  12,
  0,
  13,
  0,
  8,
  17,
  31,
  136,
  137,
  0,
  14,
  220,
  204,
  110,
  230,
  221,
  221,
  217,
  153,
  187,
  187,
  103,
  99,
  110,
  14,
  236,
  204,
  221,
  220,
  153,
  159,
  187,
  185,
  51,
  62,
  69,
  236,
  82,
  250,
  8,
  183,
  7,
  93,
  1,
  253,
  192,
  255,
  8,
  252,
  0,
  229,
  11,
  248,
  194,
  206,
  244,
  249,
  15,
  127,
  69,
  109,
  61,
  254,
  70,
  151,
  51,
  94,
  8,
  239,
  241,
  255,
  134,
  131,
  36,
  116,
  18,
  252,
  0,
  159,
  180,
  183,
  6,
  213,
  208,
  122,
  0,
  158,
  4,
  95,
  65,
  47,
  29,
  119,
  54,
  117,
  129,
  170,
  112,
  58,
  152,
  209,
  113,
  2,
  77,
  1,
  193,
  255,
  13,
  0,
  211,
  5,
  249,
  0,
  11,
  0
];

// vendor/jsgbc-core/src/bitInstructions.ts
var bitInstructions_default = [
  //RLC B
  //#0x00:
  function() {
    this.FCarry = this.registerB > 127;
    this.registerB = this.registerB << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerB === 0;
  },
  //RLC C
  //#0x01:
  function() {
    this.FCarry = this.registerC > 127;
    this.registerC = this.registerC << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerC === 0;
  },
  //RLC D
  //#0x02:
  function() {
    this.FCarry = this.registerD > 127;
    this.registerD = this.registerD << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerD === 0;
  },
  //RLC E
  //#0x03:
  function() {
    this.FCarry = this.registerE > 127;
    this.registerE = this.registerE << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerE === 0;
  },
  //RLC H
  //#0x04:
  function() {
    this.FCarry = this.registersHL > 32767;
    this.registersHL = this.registersHL << 1 & 65024 | (this.FCarry ? 256 : 0) | this.registersHL & 255;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registersHL < 256;
  },
  //RLC L
  //#0x05:
  function() {
    this.FCarry = (this.registersHL & 128) === 128;
    this.registersHL = this.registersHL & 65280 | this.registersHL << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = (this.registersHL & 255) === 0;
  },
  //RLC (HL)
  //#0x06:
  function() {
    var temp_var = this.readMemory(this.registersHL);
    this.FCarry = temp_var > 127;
    temp_var = temp_var << 1 & 255 | (this.FCarry ? 1 : 0);
    this.memoryWriter[this.registersHL](this.registersHL, temp_var);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = temp_var === 0;
  },
  //RLC A
  //#0x07:
  function() {
    this.FCarry = this.registerA > 127;
    this.registerA = this.registerA << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerA === 0;
  },
  //RRC B
  //#0x08:
  function() {
    this.FCarry = (this.registerB & 1) === 1;
    this.registerB = (this.FCarry ? 128 : 0) | this.registerB >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerB === 0;
  },
  //RRC C
  //#0x09:
  function() {
    this.FCarry = (this.registerC & 1) === 1;
    this.registerC = (this.FCarry ? 128 : 0) | this.registerC >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerC === 0;
  },
  //RRC D
  //#0x0A:
  function() {
    this.FCarry = (this.registerD & 1) === 1;
    this.registerD = (this.FCarry ? 128 : 0) | this.registerD >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerD === 0;
  },
  //RRC E
  //#0x0B:
  function() {
    this.FCarry = (this.registerE & 1) === 1;
    this.registerE = (this.FCarry ? 128 : 0) | this.registerE >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerE === 0;
  },
  //RRC H
  //#0x0C:
  function() {
    this.FCarry = (this.registersHL & 256) === 256;
    this.registersHL = (this.FCarry ? 32768 : 0) | this.registersHL >> 1 & 65280 | this.registersHL & 255;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registersHL < 256;
  },
  //RRC L
  //#0x0D:
  function() {
    this.FCarry = (this.registersHL & 1) === 1;
    this.registersHL = this.registersHL & 65280 | (this.FCarry ? 128 : 0) | (this.registersHL & 255) >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = (this.registersHL & 255) === 0;
  },
  //RRC (HL)
  //#0x0E:
  function() {
    var temp_var = this.readMemory(this.registersHL);
    this.FCarry = (temp_var & 1) === 1;
    temp_var = (this.FCarry ? 128 : 0) | temp_var >> 1;
    this.memoryWriter[this.registersHL](this.registersHL, temp_var);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = temp_var === 0;
  },
  //RRC A
  //#0x0F:
  function() {
    this.FCarry = (this.registerA & 1) === 1;
    this.registerA = (this.FCarry ? 128 : 0) | this.registerA >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerA === 0;
  },
  //RL B
  //#0x10:
  function() {
    var newFCarry = this.registerB > 127;
    this.registerB = this.registerB << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerB === 0;
  },
  //RL C
  //#0x11:
  function() {
    var newFCarry = this.registerC > 127;
    this.registerC = this.registerC << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerC === 0;
  },
  //RL D
  //#0x12:
  function() {
    var newFCarry = this.registerD > 127;
    this.registerD = this.registerD << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerD === 0;
  },
  //RL E
  //#0x13:
  function() {
    var newFCarry = this.registerE > 127;
    this.registerE = this.registerE << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerE === 0;
  },
  //RL H
  //#0x14:
  function() {
    var newFCarry = this.registersHL > 32767;
    this.registersHL = this.registersHL << 1 & 65024 | (this.FCarry ? 256 : 0) | this.registersHL & 255;
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registersHL < 256;
  },
  //RL L
  //#0x15:
  function() {
    var newFCarry = (this.registersHL & 128) === 128;
    this.registersHL = this.registersHL & 65280 | this.registersHL << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = (this.registersHL & 255) === 0;
  },
  //RL (HL)
  //#0x16:
  function() {
    var temp_var = this.readMemory(this.registersHL);
    var newFCarry = temp_var > 127;
    temp_var = temp_var << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FCarry = newFCarry;
    this.memoryWriter[this.registersHL](this.registersHL, temp_var);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = temp_var === 0;
  },
  //RL A
  //#0x17:
  function() {
    var newFCarry = this.registerA > 127;
    this.registerA = this.registerA << 1 & 255 | (this.FCarry ? 1 : 0);
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerA === 0;
  },
  //RR B
  //#0x18:
  function() {
    var newFCarry = (this.registerB & 1) === 1;
    this.registerB = (this.FCarry ? 128 : 0) | this.registerB >> 1;
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerB === 0;
  },
  //RR C
  //#0x19:
  function() {
    var newFCarry = (this.registerC & 1) === 1;
    this.registerC = (this.FCarry ? 128 : 0) | this.registerC >> 1;
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerC === 0;
  },
  //RR D
  //#0x1A:
  function() {
    var newFCarry = (this.registerD & 1) === 1;
    this.registerD = (this.FCarry ? 128 : 0) | this.registerD >> 1;
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerD === 0;
  },
  //RR E
  //#0x1B:
  function() {
    var newFCarry = (this.registerE & 1) === 1;
    this.registerE = (this.FCarry ? 128 : 0) | this.registerE >> 1;
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerE === 0;
  },
  //RR H
  //#0x1C:
  function() {
    var newFCarry = (this.registersHL & 256) === 256;
    this.registersHL = (this.FCarry ? 32768 : 0) | this.registersHL >> 1 & 65280 | this.registersHL & 255;
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registersHL < 256;
  },
  //RR L
  //#0x1D:
  function() {
    var newFCarry = (this.registersHL & 1) === 1;
    this.registersHL = this.registersHL & 65280 | (this.FCarry ? 128 : 0) | (this.registersHL & 255) >> 1;
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = (this.registersHL & 255) === 0;
  },
  //RR (HL)
  //#0x1E:
  function() {
    var temp_var = this.readMemory(this.registersHL);
    var newFCarry = (temp_var & 1) === 1;
    temp_var = (this.FCarry ? 128 : 0) | temp_var >> 1;
    this.FCarry = newFCarry;
    this.memoryWriter[this.registersHL](this.registersHL, temp_var);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = temp_var === 0;
  },
  //RR A
  //#0x1F:
  function() {
    var newFCarry = (this.registerA & 1) === 1;
    this.registerA = (this.FCarry ? 128 : 0) | this.registerA >> 1;
    this.FCarry = newFCarry;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerA === 0;
  },
  //SLA B
  //#0x20:
  function() {
    this.FCarry = this.registerB > 127;
    this.registerB = this.registerB << 1 & 255;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerB === 0;
  },
  //SLA C
  //#0x21:
  function() {
    this.FCarry = this.registerC > 127;
    this.registerC = this.registerC << 1 & 255;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerC === 0;
  },
  //SLA D
  //#0x22:
  function() {
    this.FCarry = this.registerD > 127;
    this.registerD = this.registerD << 1 & 255;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerD === 0;
  },
  //SLA E
  //#0x23:
  function() {
    this.FCarry = this.registerE > 127;
    this.registerE = this.registerE << 1 & 255;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerE === 0;
  },
  //SLA H
  //#0x24:
  function() {
    this.FCarry = this.registersHL > 32767;
    this.registersHL = this.registersHL << 1 & 65024 | this.registersHL & 255;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registersHL < 256;
  },
  //SLA L
  //#0x25:
  function() {
    this.FCarry = (this.registersHL & 128) === 128;
    this.registersHL = this.registersHL & 65280 | this.registersHL << 1 & 255;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = (this.registersHL & 255) === 0;
  },
  //SLA (HL)
  //#0x26:
  function() {
    var temp_var = this.readMemory(this.registersHL);
    this.FCarry = temp_var > 127;
    temp_var = temp_var << 1 & 255;
    this.memoryWriter[this.registersHL](this.registersHL, temp_var);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = temp_var === 0;
  },
  //SLA A
  //#0x27:
  function() {
    this.FCarry = this.registerA > 127;
    this.registerA = this.registerA << 1 & 255;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerA === 0;
  },
  //SRA B
  //#0x28:
  function() {
    this.FCarry = (this.registerB & 1) === 1;
    this.registerB = this.registerB & 128 | this.registerB >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerB === 0;
  },
  //SRA C
  //#0x29:
  function() {
    this.FCarry = (this.registerC & 1) === 1;
    this.registerC = this.registerC & 128 | this.registerC >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerC === 0;
  },
  //SRA D
  //#0x2A:
  function() {
    this.FCarry = (this.registerD & 1) === 1;
    this.registerD = this.registerD & 128 | this.registerD >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerD === 0;
  },
  //SRA E
  //#0x2B:
  function() {
    this.FCarry = (this.registerE & 1) === 1;
    this.registerE = this.registerE & 128 | this.registerE >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerE === 0;
  },
  //SRA H
  //#0x2C:
  function() {
    this.FCarry = (this.registersHL & 256) === 256;
    this.registersHL = this.registersHL >> 1 & 65280 | this.registersHL & 33023;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registersHL < 256;
  },
  //SRA L
  //#0x2D:
  function() {
    this.FCarry = (this.registersHL & 1) === 1;
    this.registersHL = this.registersHL & 65408 | (this.registersHL & 255) >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = (this.registersHL & 255) === 0;
  },
  //SRA (HL)
  //#0x2E:
  function() {
    var temp_var = this.readMemory(this.registersHL);
    this.FCarry = (temp_var & 1) === 1;
    temp_var = temp_var & 128 | temp_var >> 1;
    this.memoryWriter[this.registersHL](this.registersHL, temp_var);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = temp_var === 0;
  },
  //SRA A
  //#0x2F:
  function() {
    this.FCarry = (this.registerA & 1) === 1;
    this.registerA = this.registerA & 128 | this.registerA >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerA === 0;
  },
  //SWAP B
  //#0x30:
  function() {
    this.registerB = (this.registerB & 15) << 4 | this.registerB >> 4;
    this.FZero = this.registerB === 0;
    this.FCarry = this.FHalfCarry = this.FSubtract = false;
  },
  //SWAP C
  //#0x31:
  function() {
    this.registerC = (this.registerC & 15) << 4 | this.registerC >> 4;
    this.FZero = this.registerC === 0;
    this.FCarry = this.FHalfCarry = this.FSubtract = false;
  },
  //SWAP D
  //#0x32:
  function() {
    this.registerD = (this.registerD & 15) << 4 | this.registerD >> 4;
    this.FZero = this.registerD === 0;
    this.FCarry = this.FHalfCarry = this.FSubtract = false;
  },
  //SWAP E
  //#0x33:
  function() {
    this.registerE = (this.registerE & 15) << 4 | this.registerE >> 4;
    this.FZero = this.registerE === 0;
    this.FCarry = this.FHalfCarry = this.FSubtract = false;
  },
  //SWAP H
  //#0x34:
  function() {
    this.registersHL = (this.registersHL & 3840) << 4 | (this.registersHL & 61440) >> 4 | this.registersHL & 255;
    this.FZero = this.registersHL < 256;
    this.FCarry = this.FHalfCarry = this.FSubtract = false;
  },
  //SWAP L
  //#0x35:
  function() {
    this.registersHL = this.registersHL & 65280 | (this.registersHL & 15) << 4 | (this.registersHL & 240) >> 4;
    this.FZero = (this.registersHL & 255) === 0;
    this.FCarry = this.FHalfCarry = this.FSubtract = false;
  },
  //SWAP (HL)
  //#0x36:
  function() {
    var temp_var = this.readMemory(this.registersHL);
    temp_var = (temp_var & 15) << 4 | temp_var >> 4;
    this.memoryWriter[this.registersHL](this.registersHL, temp_var);
    this.FZero = temp_var === 0;
    this.FCarry = this.FHalfCarry = this.FSubtract = false;
  },
  //SWAP A
  //#0x37:
  function() {
    this.registerA = (this.registerA & 15) << 4 | this.registerA >> 4;
    this.FZero = this.registerA === 0;
    this.FCarry = this.FHalfCarry = this.FSubtract = false;
  },
  //SRL B
  //#0x38:
  function() {
    this.FCarry = (this.registerB & 1) === 1;
    this.registerB >>= 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerB === 0;
  },
  //SRL C
  //#0x39:
  function() {
    this.FCarry = (this.registerC & 1) === 1;
    this.registerC >>= 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerC === 0;
  },
  //SRL D
  //#0x3A:
  function() {
    this.FCarry = (this.registerD & 1) === 1;
    this.registerD >>= 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerD === 0;
  },
  //SRL E
  //#0x3B:
  function() {
    this.FCarry = (this.registerE & 1) === 1;
    this.registerE >>= 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerE === 0;
  },
  //SRL H
  //#0x3C:
  function() {
    this.FCarry = (this.registersHL & 256) === 256;
    this.registersHL = this.registersHL >> 1 & 65280 | this.registersHL & 255;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registersHL < 256;
  },
  //SRL L
  //#0x3D:
  function() {
    this.FCarry = (this.registersHL & 1) === 1;
    this.registersHL = this.registersHL & 65280 | (this.registersHL & 255) >> 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = (this.registersHL & 255) === 0;
  },
  //SRL (HL)
  //#0x3E:
  function() {
    var temp_var = this.readMemory(this.registersHL);
    this.FCarry = (temp_var & 1) === 1;
    this.memoryWriter[this.registersHL](this.registersHL, temp_var >> 1);
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = temp_var < 2;
  },
  //SRL A
  //#0x3F:
  function() {
    this.FCarry = (this.registerA & 1) === 1;
    this.registerA >>= 1;
    this.FHalfCarry = this.FSubtract = false;
    this.FZero = this.registerA === 0;
  },
  //BIT 0, B
  //#0x40:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerB & 1) === 0;
  },
  //BIT 0, C
  //#0x41:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerC & 1) === 0;
  },
  //BIT 0, D
  //#0x42:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerD & 1) === 0;
  },
  //BIT 0, E
  //#0x43:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerE & 1) === 0;
  },
  //BIT 0, H
  //#0x44:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 256) === 0;
  },
  //BIT 0, L
  //#0x45:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 1) === 0;
  },
  //BIT 0, (HL)
  //#0x46:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.readMemory(this.registersHL) & 1) === 0;
  },
  //BIT 0, A
  //#0x47:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerA & 1) === 0;
  },
  //BIT 1, B
  //#0x48:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerB & 2) === 0;
  },
  //BIT 1, C
  //#0x49:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerC & 2) === 0;
  },
  //BIT 1, D
  //#0x4A:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerD & 2) === 0;
  },
  //BIT 1, E
  //#0x4B:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerE & 2) === 0;
  },
  //BIT 1, H
  //#0x4C:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 512) === 0;
  },
  //BIT 1, L
  //#0x4D:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 2) === 0;
  },
  //BIT 1, (HL)
  //#0x4E:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.readMemory(this.registersHL) & 2) === 0;
  },
  //BIT 1, A
  //#0x4F:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerA & 2) === 0;
  },
  //BIT 2, B
  //#0x50:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerB & 4) === 0;
  },
  //BIT 2, C
  //#0x51:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerC & 4) === 0;
  },
  //BIT 2, D
  //#0x52:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerD & 4) === 0;
  },
  //BIT 2, E
  //#0x53:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerE & 4) === 0;
  },
  //BIT 2, H
  //#0x54:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 1024) === 0;
  },
  //BIT 2, L
  //#0x55:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 4) === 0;
  },
  //BIT 2, (HL)
  //#0x56:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.readMemory(this.registersHL) & 4) === 0;
  },
  //BIT 2, A
  //#0x57:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerA & 4) === 0;
  },
  //BIT 3, B
  //#0x58:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerB & 8) === 0;
  },
  //BIT 3, C
  //#0x59:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerC & 8) === 0;
  },
  //BIT 3, D
  //#0x5A:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerD & 8) === 0;
  },
  //BIT 3, E
  //#0x5B:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerE & 8) === 0;
  },
  //BIT 3, H
  //#0x5C:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 2048) === 0;
  },
  //BIT 3, L
  //#0x5D:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 8) === 0;
  },
  //BIT 3, (HL)
  //#0x5E:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.readMemory(this.registersHL) & 8) === 0;
  },
  //BIT 3, A
  //#0x5F:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerA & 8) === 0;
  },
  //BIT 4, B
  //#0x60:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerB & 16) === 0;
  },
  //BIT 4, C
  //#0x61:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerC & 16) === 0;
  },
  //BIT 4, D
  //#0x62:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerD & 16) === 0;
  },
  //BIT 4, E
  //#0x63:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerE & 16) === 0;
  },
  //BIT 4, H
  //#0x64:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 4096) === 0;
  },
  //BIT 4, L
  //#0x65:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 16) === 0;
  },
  //BIT 4, (HL)
  //#0x66:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.readMemory(this.registersHL) & 16) === 0;
  },
  //BIT 4, A
  //#0x67:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerA & 16) === 0;
  },
  //BIT 5, B
  //#0x68:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerB & 32) === 0;
  },
  //BIT 5, C
  //#0x69:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerC & 32) === 0;
  },
  //BIT 5, D
  //#0x6A:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerD & 32) === 0;
  },
  //BIT 5, E
  //#0x6B:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerE & 32) === 0;
  },
  //BIT 5, H
  //#0x6C:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 8192) === 0;
  },
  //BIT 5, L
  //#0x6D:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 32) === 0;
  },
  //BIT 5, (HL)
  //#0x6E:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.readMemory(this.registersHL) & 32) === 0;
  },
  //BIT 5, A
  //#0x6F:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerA & 32) === 0;
  },
  //BIT 6, B
  //#0x70:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerB & 64) === 0;
  },
  //BIT 6, C
  //#0x71:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerC & 64) === 0;
  },
  //BIT 6, D
  //#0x72:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerD & 64) === 0;
  },
  //BIT 6, E
  //#0x73:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerE & 64) === 0;
  },
  //BIT 6, H
  //#0x74:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 16384) === 0;
  },
  //BIT 6, L
  //#0x75:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 64) === 0;
  },
  //BIT 6, (HL)
  //#0x76:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.readMemory(this.registersHL) & 64) === 0;
  },
  //BIT 6, A
  //#0x77:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerA & 64) === 0;
  },
  //BIT 7, B
  //#0x78:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerB & 128) === 0;
  },
  //BIT 7, C
  //#0x79:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerC & 128) === 0;
  },
  //BIT 7, D
  //#0x7A:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerD & 128) === 0;
  },
  //BIT 7, E
  //#0x7B:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerE & 128) === 0;
  },
  //BIT 7, H
  //#0x7C:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 32768) === 0;
  },
  //BIT 7, L
  //#0x7D:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registersHL & 128) === 0;
  },
  //BIT 7, (HL)
  //#0x7E:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.readMemory(this.registersHL) & 128) === 0;
  },
  //BIT 7, A
  //#0x7F:
  function() {
    this.FHalfCarry = true;
    this.FSubtract = false;
    this.FZero = (this.registerA & 128) === 0;
  },
  //RES 0, B
  //#0x80:
  function() {
    this.registerB &= 254;
  },
  //RES 0, C
  //#0x81:
  function() {
    this.registerC &= 254;
  },
  //RES 0, D
  //#0x82:
  function() {
    this.registerD &= 254;
  },
  //RES 0, E
  //#0x83:
  function() {
    this.registerE &= 254;
  },
  //RES 0, H
  //#0x84:
  function() {
    this.registersHL &= 65279;
  },
  //RES 0, L
  //#0x85:
  function() {
    this.registersHL &= 65534;
  },
  //RES 0, (HL)
  //#0x86:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) & 254
    );
  },
  //RES 0, A
  //#0x87:
  function() {
    this.registerA &= 254;
  },
  //RES 1, B
  //#0x88:
  function() {
    this.registerB &= 253;
  },
  //RES 1, C
  //#0x89:
  function() {
    this.registerC &= 253;
  },
  //RES 1, D
  //#0x8A:
  function() {
    this.registerD &= 253;
  },
  //RES 1, E
  //#0x8B:
  function() {
    this.registerE &= 253;
  },
  //RES 1, H
  //#0x8C:
  function() {
    this.registersHL &= 65023;
  },
  //RES 1, L
  //#0x8D:
  function() {
    this.registersHL &= 65533;
  },
  //RES 1, (HL)
  //#0x8E:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) & 253
    );
  },
  //RES 1, A
  //#0x8F:
  function() {
    this.registerA &= 253;
  },
  //RES 2, B
  //#0x90:
  function() {
    this.registerB &= 251;
  },
  //RES 2, C
  //#0x91:
  function() {
    this.registerC &= 251;
  },
  //RES 2, D
  //#0x92:
  function() {
    this.registerD &= 251;
  },
  //RES 2, E
  //#0x93:
  function() {
    this.registerE &= 251;
  },
  //RES 2, H
  //#0x94:
  function() {
    this.registersHL &= 64511;
  },
  //RES 2, L
  //#0x95:
  function() {
    this.registersHL &= 65531;
  },
  //RES 2, (HL)
  //#0x96:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) & 251
    );
  },
  //RES 2, A
  //#0x97:
  function() {
    this.registerA &= 251;
  },
  //RES 3, B
  //#0x98:
  function() {
    this.registerB &= 247;
  },
  //RES 3, C
  //#0x99:
  function() {
    this.registerC &= 247;
  },
  //RES 3, D
  //#0x9A:
  function() {
    this.registerD &= 247;
  },
  //RES 3, E
  //#0x9B:
  function() {
    this.registerE &= 247;
  },
  //RES 3, H
  //#0x9C:
  function() {
    this.registersHL &= 63487;
  },
  //RES 3, L
  //#0x9D:
  function() {
    this.registersHL &= 65527;
  },
  //RES 3, (HL)
  //#0x9E:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) & 247
    );
  },
  //RES 3, A
  //#0x9F:
  function() {
    this.registerA &= 247;
  },
  //RES 3, B
  //#0xA0:
  function() {
    this.registerB &= 239;
  },
  //RES 4, C
  //#0xA1:
  function() {
    this.registerC &= 239;
  },
  //RES 4, D
  //#0xA2:
  function() {
    this.registerD &= 239;
  },
  //RES 4, E
  //#0xA3:
  function() {
    this.registerE &= 239;
  },
  //RES 4, H
  //#0xA4:
  function() {
    this.registersHL &= 61439;
  },
  //RES 4, L
  //#0xA5:
  function() {
    this.registersHL &= 65519;
  },
  //RES 4, (HL)
  //#0xA6:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) & 239
    );
  },
  //RES 4, A
  //#0xA7:
  function() {
    this.registerA &= 239;
  },
  //RES 5, B
  //#0xA8:
  function() {
    this.registerB &= 223;
  },
  //RES 5, C
  //#0xA9:
  function() {
    this.registerC &= 223;
  },
  //RES 5, D
  //#0xAA:
  function() {
    this.registerD &= 223;
  },
  //RES 5, E
  //#0xAB:
  function() {
    this.registerE &= 223;
  },
  //RES 5, H
  //#0xAC:
  function() {
    this.registersHL &= 57343;
  },
  //RES 5, L
  //#0xAD:
  function() {
    this.registersHL &= 65503;
  },
  //RES 5, (HL)
  //#0xAE:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) & 223
    );
  },
  //RES 5, A
  //#0xAF:
  function() {
    this.registerA &= 223;
  },
  //RES 6, B
  //#0xB0:
  function() {
    this.registerB &= 191;
  },
  //RES 6, C
  //#0xB1:
  function() {
    this.registerC &= 191;
  },
  //RES 6, D
  //#0xB2:
  function() {
    this.registerD &= 191;
  },
  //RES 6, E
  //#0xB3:
  function() {
    this.registerE &= 191;
  },
  //RES 6, H
  //#0xB4:
  function() {
    this.registersHL &= 49151;
  },
  //RES 6, L
  //#0xB5:
  function() {
    this.registersHL &= 65471;
  },
  //RES 6, (HL)
  //#0xB6:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) & 191
    );
  },
  //RES 6, A
  //#0xB7:
  function() {
    this.registerA &= 191;
  },
  //RES 7, B
  //#0xB8:
  function() {
    this.registerB &= 127;
  },
  //RES 7, C
  //#0xB9:
  function() {
    this.registerC &= 127;
  },
  //RES 7, D
  //#0xBA:
  function() {
    this.registerD &= 127;
  },
  //RES 7, E
  //#0xBB:
  function() {
    this.registerE &= 127;
  },
  //RES 7, H
  //#0xBC:
  function() {
    this.registersHL &= 32767;
  },
  //RES 7, L
  //#0xBD:
  function() {
    this.registersHL &= 65407;
  },
  //RES 7, (HL)
  //#0xBE:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) & 127
    );
  },
  //RES 7, A
  //#0xBF:
  function() {
    this.registerA &= 127;
  },
  //SET 0, B
  //#0xC0:
  function() {
    this.registerB |= 1;
  },
  //SET 0, C
  //#0xC1:
  function() {
    this.registerC |= 1;
  },
  //SET 0, D
  //#0xC2:
  function() {
    this.registerD |= 1;
  },
  //SET 0, E
  //#0xC3:
  function() {
    this.registerE |= 1;
  },
  //SET 0, H
  //#0xC4:
  function() {
    this.registersHL |= 256;
  },
  //SET 0, L
  //#0xC5:
  function() {
    this.registersHL |= 1;
  },
  //SET 0, (HL)
  //#0xC6:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) | 1
    );
  },
  //SET 0, A
  //#0xC7:
  function() {
    this.registerA |= 1;
  },
  //SET 1, B
  //#0xC8:
  function() {
    this.registerB |= 2;
  },
  //SET 1, C
  //#0xC9:
  function() {
    this.registerC |= 2;
  },
  //SET 1, D
  //#0xCA:
  function() {
    this.registerD |= 2;
  },
  //SET 1, E
  //#0xCB:
  function() {
    this.registerE |= 2;
  },
  //SET 1, H
  //#0xCC:
  function() {
    this.registersHL |= 512;
  },
  //SET 1, L
  //#0xCD:
  function() {
    this.registersHL |= 2;
  },
  //SET 1, (HL)
  //#0xCE:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) | 2
    );
  },
  //SET 1, A
  //#0xCF:
  function() {
    this.registerA |= 2;
  },
  //SET 2, B
  //#0xD0:
  function() {
    this.registerB |= 4;
  },
  //SET 2, C
  //#0xD1:
  function() {
    this.registerC |= 4;
  },
  //SET 2, D
  //#0xD2:
  function() {
    this.registerD |= 4;
  },
  //SET 2, E
  //#0xD3:
  function() {
    this.registerE |= 4;
  },
  //SET 2, H
  //#0xD4:
  function() {
    this.registersHL |= 1024;
  },
  //SET 2, L
  //#0xD5:
  function() {
    this.registersHL |= 4;
  },
  //SET 2, (HL)
  //#0xD6:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) | 4
    );
  },
  //SET 2, A
  //#0xD7:
  function() {
    this.registerA |= 4;
  },
  //SET 3, B
  //#0xD8:
  function() {
    this.registerB |= 8;
  },
  //SET 3, C
  //#0xD9:
  function() {
    this.registerC |= 8;
  },
  //SET 3, D
  //#0xDA:
  function() {
    this.registerD |= 8;
  },
  //SET 3, E
  //#0xDB:
  function() {
    this.registerE |= 8;
  },
  //SET 3, H
  //#0xDC:
  function() {
    this.registersHL |= 2048;
  },
  //SET 3, L
  //#0xDD:
  function() {
    this.registersHL |= 8;
  },
  //SET 3, (HL)
  //#0xDE:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) | 8
    );
  },
  //SET 3, A
  //#0xDF:
  function() {
    this.registerA |= 8;
  },
  //SET 4, B
  //#0xE0:
  function() {
    this.registerB |= 16;
  },
  //SET 4, C
  //#0xE1:
  function() {
    this.registerC |= 16;
  },
  //SET 4, D
  //#0xE2:
  function() {
    this.registerD |= 16;
  },
  //SET 4, E
  //#0xE3:
  function() {
    this.registerE |= 16;
  },
  //SET 4, H
  //#0xE4:
  function() {
    this.registersHL |= 4096;
  },
  //SET 4, L
  //#0xE5:
  function() {
    this.registersHL |= 16;
  },
  //SET 4, (HL)
  //#0xE6:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) | 16
    );
  },
  //SET 4, A
  //#0xE7:
  function() {
    this.registerA |= 16;
  },
  //SET 5, B
  //#0xE8:
  function() {
    this.registerB |= 32;
  },
  //SET 5, C
  //#0xE9:
  function() {
    this.registerC |= 32;
  },
  //SET 5, D
  //#0xEA:
  function() {
    this.registerD |= 32;
  },
  //SET 5, E
  //#0xEB:
  function() {
    this.registerE |= 32;
  },
  //SET 5, H
  //#0xEC:
  function() {
    this.registersHL |= 8192;
  },
  //SET 5, L
  //#0xED:
  function() {
    this.registersHL |= 32;
  },
  //SET 5, (HL)
  //#0xEE:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) | 32
    );
  },
  //SET 5, A
  //#0xEF:
  function() {
    this.registerA |= 32;
  },
  //SET 6, B
  //#0xF0:
  function() {
    this.registerB |= 64;
  },
  //SET 6, C
  //#0xF1:
  function() {
    this.registerC |= 64;
  },
  //SET 6, D
  //#0xF2:
  function() {
    this.registerD |= 64;
  },
  //SET 6, E
  //#0xF3:
  function() {
    this.registerE |= 64;
  },
  //SET 6, H
  //#0xF4:
  function() {
    this.registersHL |= 16384;
  },
  //SET 6, L
  //#0xF5:
  function() {
    this.registersHL |= 64;
  },
  //SET 6, (HL)
  //#0xF6:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) | 64
    );
  },
  //SET 6, A
  //#0xF7:
  function() {
    this.registerA |= 64;
  },
  //SET 7, B
  //#0xF8:
  function() {
    this.registerB |= 128;
  },
  //SET 7, C
  //#0xF9:
  function() {
    this.registerC |= 128;
  },
  //SET 7, D
  //#0xFA:
  function() {
    this.registerD |= 128;
  },
  //SET 7, E
  //#0xFB:
  function() {
    this.registerE |= 128;
  },
  //SET 7, H
  //#0xFC:
  function() {
    this.registersHL |= 32768;
  },
  //SET 7, L
  //#0xFD:
  function() {
    this.registersHL |= 128;
  },
  //SET 7, (HL)
  //#0xFE:
  function() {
    this.memoryWriter[this.registersHL](
      this.registersHL,
      this.readMemory(this.registersHL) | 128
    );
  },
  //SET 7, A
  //#0xFF:
  function() {
    this.registerA |= 128;
  }
];

// vendor/jsgbc-core/src/secondaryTickTable.ts
var secondaryTickTable_default = [
  // Number of machine cycles for each 0xCBXX instruction:
  // 0, 1, 2, 3, 4, 5,  6, 7, 8, 9, A, B, C, D,  E, F
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // 0
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // 1
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // 2
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // 3
  8,
  8,
  8,
  8,
  8,
  8,
  12,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  12,
  8,
  // 4
  8,
  8,
  8,
  8,
  8,
  8,
  12,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  12,
  8,
  // 5
  8,
  8,
  8,
  8,
  8,
  8,
  12,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  12,
  8,
  // 6
  8,
  8,
  8,
  8,
  8,
  8,
  12,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  12,
  8,
  // 7
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // 8
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // 9
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // A
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // B
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // C
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // D
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  // E
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8,
  8,
  8,
  8,
  8,
  8,
  8,
  16,
  8
  // F
];

// vendor/jsgbc-core/src/MainInstructions.ts
var MainInstructions_default = [
  // NOP
  // 0x00:
  () => {
  },
  // LD BC, nn
  // 0x01:
  function() {
    this.registerC = this.readMemory(this.programCounter);
    this.registerB = this.readMemory(this.programCounter + 1 & 65535);
    this.programCounter = this.programCounter + 2 & 65535;
  },
  // LD (BC), A
  // 0x02:
  function() {
    this.writeMemory(this.registerB << 8 | this.registerC, this.registerA);
  },
  //INC BC
  //#0x03:
  function() {
    var temp_var = (this.registerB << 8 | this.registerC) + 1;
    this.registerB = temp_var >> 8 & 255;
    this.registerC = temp_var & 255;
  },
  //INC B
  //#0x04:
  function() {
    this.registerB = this.registerB + 1 & 255;
    this.FZero = this.registerB === 0;
    this.FHalfCarry = (this.registerB & 15) === 0;
    this.FSubtract = false;
  },
  //DEC B
  //#0x05:
  function() {
    this.registerB = this.registerB - 1 & 255;
    this.FZero = this.registerB === 0;
    this.FHalfCarry = (this.registerB & 15) === 15;
    this.FSubtract = true;
  },
  //LD B, n
  //#0x06:
  function() {
    this.registerB = this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
  },
  //RLCA
  //#0x07:
  function() {
    this.FCarry = this.registerA > 127;
    this.registerA = this.registerA << 1 & 255 | this.registerA >> 7;
    this.FZero = this.FSubtract = this.FHalfCarry = false;
  },
  //LD (nn), SP
  //#0x08:
  function() {
    var temp_var = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 2 & 65535;
    this.writeMemory(temp_var, this.stackPointer & 255);
    this.writeMemory(temp_var + 1 & 65535, this.stackPointer >> 8);
  },
  //ADD HL, BC
  //#0x09:
  function() {
    var dirtySum = this.registersHL + (this.registerB << 8 | this.registerC);
    this.FHalfCarry = (this.registersHL & 4095) > (dirtySum & 4095);
    this.FCarry = dirtySum > 65535;
    this.registersHL = dirtySum & 65535;
    this.FSubtract = false;
  },
  //LD A, (BC)
  //#0x0A:
  function() {
    this.registerA = this.readMemory(this.registerB << 8 | this.registerC);
  },
  //DEC BC
  //#0x0B:
  function() {
    var temp_var = (this.registerB << 8 | this.registerC) - 1 & 65535;
    this.registerB = temp_var >> 8;
    this.registerC = temp_var & 255;
  },
  //INC C
  //#0x0C:
  function() {
    this.registerC = this.registerC + 1 & 255;
    this.FZero = this.registerC === 0;
    this.FHalfCarry = (this.registerC & 15) === 0;
    this.FSubtract = false;
  },
  //DEC C
  //#0x0D:
  function() {
    this.registerC = this.registerC - 1 & 255;
    this.FZero = this.registerC === 0;
    this.FHalfCarry = (this.registerC & 15) === 15;
    this.FSubtract = true;
  },
  //LD C, n
  //#0x0E:
  function() {
    this.registerC = this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
  },
  //RRCA
  //#0x0F:
  function() {
    this.registerA = this.registerA >> 1 | (this.registerA & 1) << 7;
    this.FCarry = this.registerA > 127;
    this.FZero = this.FSubtract = this.FHalfCarry = false;
  },
  //STOP
  //#0x10:
  function() {
    if (this.cartridge.useGbcMode) {
      if ((this.memory[65357] & 1) === 1) {
        if (this.memory[65357] > 127) {
          console.log("Going into single clock speed mode.");
          this.doubleSpeedShifter = 0;
          this.memory[65357] &= 127;
        } else {
          console.log("Going into double clock speed mode.");
          this.doubleSpeedShifter = 1;
          this.memory[65357] |= 128;
        }
        this.memory[65357] &= 254;
      } else {
        this.stop();
      }
    } else {
      this.stop();
    }
  },
  //LD DE, nn
  //#0x11:
  function() {
    this.registerE = this.readMemory(this.programCounter);
    this.registerD = this.readMemory(this.programCounter + 1 & 65535);
    this.programCounter = this.programCounter + 2 & 65535;
  },
  //LD (DE), A
  //#0x12:
  function() {
    this.writeMemory(this.registerD << 8 | this.registerE, this.registerA);
  },
  //INC DE
  //#0x13:
  function() {
    var temp_var = (this.registerD << 8 | this.registerE) + 1;
    this.registerD = temp_var >> 8 & 255;
    this.registerE = temp_var & 255;
  },
  //INC D
  //#0x14:
  function() {
    this.registerD = this.registerD + 1 & 255;
    this.FZero = this.registerD === 0;
    this.FHalfCarry = (this.registerD & 15) === 0;
    this.FSubtract = false;
  },
  //DEC D
  //#0x15:
  function() {
    this.registerD = this.registerD - 1 & 255;
    this.FZero = this.registerD === 0;
    this.FHalfCarry = (this.registerD & 15) === 15;
    this.FSubtract = true;
  },
  //LD D, n
  //#0x16:
  function() {
    this.registerD = this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
  },
  //RLA
  //#0x17:
  function() {
    var carry_flag = this.FCarry ? 1 : 0;
    this.FCarry = this.registerA > 127;
    this.registerA = this.registerA << 1 & 255 | carry_flag;
    this.FZero = this.FSubtract = this.FHalfCarry = false;
  },
  //JR n
  //#0x18:
  function() {
    this.programCounter = this.programCounter + (this.readMemory(this.programCounter) << 24 >> 24) + 1 & 65535;
  },
  //ADD HL, DE
  //#0x19:
  function() {
    var dirtySum = this.registersHL + (this.registerD << 8 | this.registerE);
    this.FHalfCarry = (this.registersHL & 4095) > (dirtySum & 4095);
    this.FCarry = dirtySum > 65535;
    this.registersHL = dirtySum & 65535;
    this.FSubtract = false;
  },
  //LD A, (DE)
  //#0x1A:
  function() {
    this.registerA = this.readMemory(this.registerD << 8 | this.registerE);
  },
  //DEC DE
  //#0x1B:
  function() {
    var temp_var = (this.registerD << 8 | this.registerE) - 1 & 65535;
    this.registerD = temp_var >> 8;
    this.registerE = temp_var & 255;
  },
  //INC E
  //#0x1C:
  function() {
    this.registerE = this.registerE + 1 & 255;
    this.FZero = this.registerE === 0;
    this.FHalfCarry = (this.registerE & 15) === 0;
    this.FSubtract = false;
  },
  //DEC E
  //#0x1D:
  function() {
    this.registerE = this.registerE - 1 & 255;
    this.FZero = this.registerE === 0;
    this.FHalfCarry = (this.registerE & 15) === 15;
    this.FSubtract = true;
  },
  //LD E, n
  //#0x1E:
  function() {
    this.registerE = this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
  },
  //RRA
  //#0x1F:
  function() {
    var carry_flag = this.FCarry ? 128 : 0;
    this.FCarry = (this.registerA & 1) === 1;
    this.registerA = this.registerA >> 1 | carry_flag;
    this.FZero = this.FSubtract = this.FHalfCarry = false;
  },
  //JR NZ, n
  //#0x20:
  function() {
    if (!this.FZero) {
      this.programCounter = this.programCounter + (this.readMemory(this.programCounter) << 24 >> 24) + 1 & 65535;
      this.currentInstructionCycleCount += 4;
    } else {
      this.programCounter = this.programCounter + 1 & 65535;
    }
  },
  //LD HL, nn
  //#0x21:
  function() {
    this.registersHL = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 2 & 65535;
  },
  //LDI (HL), A
  //#0x22:
  function() {
    this.writeMemory(
      this.registersHL,
      this.registerA
    );
    this.registersHL = this.registersHL + 1 & 65535;
  },
  //INC HL
  //#0x23:
  function() {
    this.registersHL = this.registersHL + 1 & 65535;
  },
  //INC H
  //#0x24:
  function() {
    var H = (this.registersHL >> 8) + 1 & 255;
    this.FZero = H === 0;
    this.FHalfCarry = (H & 15) === 0;
    this.FSubtract = false;
    this.registersHL = H << 8 | this.registersHL & 255;
  },
  //DEC H
  //#0x25:
  function() {
    var H = (this.registersHL >> 8) - 1 & 255;
    this.FZero = H === 0;
    this.FHalfCarry = (H & 15) === 15;
    this.FSubtract = true;
    this.registersHL = H << 8 | this.registersHL & 255;
  },
  //LD H, n
  //#0x26:
  function() {
    this.registersHL = this.readMemory(this.programCounter) << 8 | this.registersHL & 255;
    this.programCounter = this.programCounter + 1 & 65535;
  },
  //DAA
  //#0x27:
  function() {
    if (!this.FSubtract) {
      if (this.FCarry || this.registerA > 153) {
        this.registerA = this.registerA + 96 & 255;
        this.FCarry = true;
      }
      if (this.FHalfCarry || (this.registerA & 15) > 9) {
        this.registerA = this.registerA + 6 & 255;
        this.FHalfCarry = false;
      }
    } else if (this.FCarry && this.FHalfCarry) {
      this.registerA = this.registerA + 154 & 255;
      this.FHalfCarry = false;
    } else if (this.FCarry) {
      this.registerA = this.registerA + 160 & 255;
    } else if (this.FHalfCarry) {
      this.registerA = this.registerA + 250 & 255;
      this.FHalfCarry = false;
    }
    this.FZero = this.registerA === 0;
  },
  //JR Z, n
  //#0x28:
  function() {
    if (this.FZero) {
      this.programCounter = this.programCounter + (this.readMemory(this.programCounter) << 24 >> 24) + 1 & 65535;
      this.currentInstructionCycleCount += 4;
    } else {
      this.programCounter = this.programCounter + 1 & 65535;
    }
  },
  //ADD HL, HL
  //#0x29:
  function() {
    this.FHalfCarry = (this.registersHL & 4095) > 2047;
    this.FCarry = this.registersHL > 32767;
    this.registersHL = this.registersHL << 1 & 65535;
    this.FSubtract = false;
  },
  //LDI A, (HL)
  //#0x2A:
  function() {
    this.registerA = this.readMemory(this.registersHL);
    this.registersHL = this.registersHL + 1 & 65535;
  },
  //DEC HL
  //#0x2B:
  function() {
    this.registersHL = this.registersHL - 1 & 65535;
  },
  //INC L
  //#0x2C:
  function() {
    var L = this.registersHL + 1 & 255;
    this.FZero = L === 0;
    this.FHalfCarry = (L & 15) === 0;
    this.FSubtract = false;
    this.registersHL = this.registersHL & 65280 | L;
  },
  //DEC L
  //#0x2D:
  function() {
    var L = this.registersHL - 1 & 255;
    this.FZero = L === 0;
    this.FHalfCarry = (L & 15) === 15;
    this.FSubtract = true;
    this.registersHL = this.registersHL & 65280 | L;
  },
  //LD L, n
  //#0x2E:
  function() {
    this.registersHL = this.registersHL & 65280 | this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
  },
  //CPL
  //#0x2F:
  function() {
    this.registerA ^= 255;
    this.FSubtract = this.FHalfCarry = true;
  },
  //JR NC, n
  //#0x30:
  function() {
    if (!this.FCarry) {
      this.programCounter = this.programCounter + (this.readMemory(this.programCounter) << 24 >> 24) + 1 & 65535;
      this.currentInstructionCycleCount += 4;
    } else {
      this.programCounter = this.programCounter + 1 & 65535;
    }
  },
  //LD SP, nn
  //#0x31:
  function() {
    this.stackPointer = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 2 & 65535;
  },
  //LDD (HL), A
  //#0x32:
  function() {
    this.writeMemory(
      this.registersHL,
      this.registerA
    );
    this.registersHL = this.registersHL - 1 & 65535;
  },
  //INC SP
  //#0x33:
  function() {
    this.stackPointer = this.stackPointer + 1 & 65535;
  },
  //INC (HL)
  //#0x34:
  function() {
    var temp_var = this.readMemory(this.registersHL) + 1 & 255;
    this.FZero = temp_var === 0;
    this.FHalfCarry = (temp_var & 15) === 0;
    this.FSubtract = false;
    this.writeMemory(
      this.registersHL,
      temp_var
    );
  },
  //DEC (HL)
  //#0x35:
  function() {
    var temp_var = this.readMemory(this.registersHL) - 1 & 255;
    this.FZero = temp_var === 0;
    this.FHalfCarry = (temp_var & 15) === 15;
    this.FSubtract = true;
    this.writeMemory(
      this.registersHL,
      temp_var
    );
  },
  //LD (HL), n
  //#0x36:
  function() {
    this.writeMemory(
      this.registersHL,
      this.readMemory(this.programCounter)
    );
    this.programCounter = this.programCounter + 1 & 65535;
  },
  //SCF
  //#0x37:
  function() {
    this.FCarry = true;
    this.FSubtract = this.FHalfCarry = false;
  },
  //JR C, n
  //#0x38:
  function() {
    if (this.FCarry) {
      this.programCounter = this.programCounter + (this.readMemory(this.programCounter) << 24 >> 24) + 1 & 65535;
      this.currentInstructionCycleCount += 4;
    } else {
      this.programCounter = this.programCounter + 1 & 65535;
    }
  },
  //ADD HL, SP
  //#0x39:
  function() {
    var dirtySum = this.registersHL + this.stackPointer;
    this.FHalfCarry = (this.registersHL & 4095) > (dirtySum & 4095);
    this.FCarry = dirtySum > 65535;
    this.registersHL = dirtySum & 65535;
    this.FSubtract = false;
  },
  //LDD A, (HL)
  //#0x3A:
  function() {
    this.registerA = this.readMemory(this.registersHL);
    this.registersHL = this.registersHL - 1 & 65535;
  },
  //DEC SP
  //#0x3B:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
  },
  //INC A
  //#0x3C:
  function() {
    this.registerA = this.registerA + 1 & 255;
    this.FZero = this.registerA === 0;
    this.FHalfCarry = (this.registerA & 15) === 0;
    this.FSubtract = false;
  },
  //DEC A
  //#0x3D:
  function() {
    this.registerA = this.registerA - 1 & 255;
    this.FZero = this.registerA === 0;
    this.FHalfCarry = (this.registerA & 15) === 15;
    this.FSubtract = true;
  },
  //LD A, n
  //#0x3E:
  function() {
    this.registerA = this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
  },
  //CCF
  //#0x3F:
  function() {
    this.FCarry = !this.FCarry;
    this.FSubtract = this.FHalfCarry = false;
  },
  //LD B, B
  //#0x40:
  function() {
  },
  //LD B, C
  //#0x41:
  function() {
    this.registerB = this.registerC;
  },
  //LD B, D
  //#0x42:
  function() {
    this.registerB = this.registerD;
  },
  //LD B, E
  //#0x43:
  function() {
    this.registerB = this.registerE;
  },
  //LD B, H
  //#0x44:
  function() {
    this.registerB = this.registersHL >> 8;
  },
  //LD B, L
  //#0x45:
  function() {
    this.registerB = this.registersHL & 255;
  },
  //LD B, (HL)
  //#0x46:
  function() {
    this.registerB = this.readMemory(this.registersHL);
  },
  //LD B, A
  //#0x47:
  function() {
    this.registerB = this.registerA;
  },
  //LD C, B
  //#0x48:
  function() {
    this.registerC = this.registerB;
  },
  //LD C, C
  //#0x49:
  function() {
  },
  //LD C, D
  //#0x4A:
  function() {
    this.registerC = this.registerD;
  },
  //LD C, E
  //#0x4B:
  function() {
    this.registerC = this.registerE;
  },
  //LD C, H
  //#0x4C:
  function() {
    this.registerC = this.registersHL >> 8;
  },
  //LD C, L
  //#0x4D:
  function() {
    this.registerC = this.registersHL & 255;
  },
  //LD C, (HL)
  //#0x4E:
  function() {
    this.registerC = this.readMemory(this.registersHL);
  },
  //LD C, A
  //#0x4F:
  function() {
    this.registerC = this.registerA;
  },
  //LD D, B
  //#0x50:
  function() {
    this.registerD = this.registerB;
  },
  //LD D, C
  //#0x51:
  function() {
    this.registerD = this.registerC;
  },
  //LD D, D
  //#0x52:
  function() {
  },
  //LD D, E
  //#0x53:
  function() {
    this.registerD = this.registerE;
  },
  //LD D, H
  //#0x54:
  function() {
    this.registerD = this.registersHL >> 8;
  },
  //LD D, L
  //#0x55:
  function() {
    this.registerD = this.registersHL & 255;
  },
  //LD D, (HL)
  //#0x56:
  function() {
    this.registerD = this.readMemory(this.registersHL);
  },
  //LD D, A
  //#0x57:
  function() {
    this.registerD = this.registerA;
  },
  //LD E, B
  //#0x58:
  function() {
    this.registerE = this.registerB;
  },
  //LD E, C
  //#0x59:
  function() {
    this.registerE = this.registerC;
  },
  //LD E, D
  //#0x5A:
  function() {
    this.registerE = this.registerD;
  },
  //LD E, E
  //#0x5B:
  function() {
  },
  //LD E, H
  //#0x5C:
  function() {
    this.registerE = this.registersHL >> 8;
  },
  //LD E, L
  //#0x5D:
  function() {
    this.registerE = this.registersHL & 255;
  },
  //LD E, (HL)
  //#0x5E:
  function() {
    this.registerE = this.readMemory(this.registersHL);
  },
  //LD E, A
  //#0x5F:
  function() {
    this.registerE = this.registerA;
  },
  //LD H, B
  //#0x60:
  function() {
    this.registersHL = this.registerB << 8 | this.registersHL & 255;
  },
  //LD H, C
  //#0x61:
  function() {
    this.registersHL = this.registerC << 8 | this.registersHL & 255;
  },
  //LD H, D
  //#0x62:
  function() {
    this.registersHL = this.registerD << 8 | this.registersHL & 255;
  },
  //LD H, E
  //#0x63:
  function() {
    this.registersHL = this.registerE << 8 | this.registersHL & 255;
  },
  //LD H, H
  //#0x64:
  function() {
  },
  //LD H, L
  //#0x65:
  function() {
    this.registersHL = (this.registersHL & 255) * 257;
  },
  //LD H, (HL)
  //#0x66:
  function() {
    this.registersHL = this.readMemory(this.registersHL) << 8 | this.registersHL & 255;
  },
  //LD H, A
  //#0x67:
  function() {
    this.registersHL = this.registerA << 8 | this.registersHL & 255;
  },
  //LD L, B
  //#0x68:
  function() {
    this.registersHL = this.registersHL & 65280 | this.registerB;
  },
  //LD L, C
  //#0x69:
  function() {
    this.registersHL = this.registersHL & 65280 | this.registerC;
  },
  //LD L, D
  //#0x6A:
  function() {
    this.registersHL = this.registersHL & 65280 | this.registerD;
  },
  //LD L, E
  //#0x6B:
  function() {
    this.registersHL = this.registersHL & 65280 | this.registerE;
  },
  //LD L, H
  //#0x6C:
  function() {
    this.registersHL = this.registersHL & 65280 | this.registersHL >> 8;
  },
  //LD L, L
  //#0x6D:
  function() {
  },
  //LD L, (HL)
  //#0x6E:
  function() {
    this.registersHL = this.registersHL & 65280 | this.readMemory(this.registersHL);
  },
  //LD L, A
  //#0x6F:
  function() {
    this.registersHL = this.registersHL & 65280 | this.registerA;
  },
  //LD (HL), B
  //#0x70:
  function() {
    this.writeMemory(
      this.registersHL,
      this.registerB
    );
  },
  //LD (HL), C
  //#0x71:
  function() {
    this.writeMemory(
      this.registersHL,
      this.registerC
    );
  },
  //LD (HL), D
  //#0x72:
  function() {
    this.writeMemory(
      this.registersHL,
      this.registerD
    );
  },
  //LD (HL), E
  //#0x73:
  function() {
    this.writeMemory(
      this.registersHL,
      this.registerE
    );
  },
  //LD (HL), H
  //#0x74:
  function() {
    this.writeMemory(
      this.registersHL,
      this.registersHL >> 8
    );
  },
  //LD (HL), L
  //#0x75:
  function() {
    this.writeMemory(
      this.registersHL,
      this.registersHL & 255
    );
  },
  //HALT
  //#0x76:
  function() {
    if ((this.interruptEnabledFlags & this.interruptRequestedFlags & 31) > 0) {
      if (!this.cartridge.useGbcMode && !this.usedBootROM) {
        this.skipPCIncrement = true;
      } else {
        this.currentInstructionCycleCount += 4;
      }
    } else {
      this.calculateHALTPeriod();
    }
  },
  //LD (HL), A
  //#0x77:
  function() {
    this.writeMemory(
      this.registersHL,
      this.registerA
    );
  },
  //LD A, B
  //#0x78:
  function() {
    this.registerA = this.registerB;
  },
  //LD A, C
  //#0x79:
  function() {
    this.registerA = this.registerC;
  },
  //LD A, D
  //#0x7A:
  function() {
    this.registerA = this.registerD;
  },
  //LD A, E
  //#0x7B:
  function() {
    this.registerA = this.registerE;
  },
  //LD A, H
  //#0x7C:
  function() {
    this.registerA = this.registersHL >> 8;
  },
  //LD A, L
  //#0x7D:
  function() {
    this.registerA = this.registersHL & 255;
  },
  //LD, A, (HL)
  //#0x7E:
  function() {
    this.registerA = this.readMemory(this.registersHL);
  },
  //LD A, A
  //#0x7F:
  function() {
  },
  //ADD A, B
  //#0x80:
  function() {
    var dirtySum = this.registerA + this.registerB;
    this.FHalfCarry = (dirtySum & 15) < (this.registerA & 15);
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADD A, C
  //#0x81:
  function() {
    var dirtySum = this.registerA + this.registerC;
    this.FHalfCarry = (dirtySum & 15) < (this.registerA & 15);
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADD A, D
  //#0x82:
  function() {
    var dirtySum = this.registerA + this.registerD;
    this.FHalfCarry = (dirtySum & 15) < (this.registerA & 15);
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADD A, E
  //#0x83:
  function() {
    var dirtySum = this.registerA + this.registerE;
    this.FHalfCarry = (dirtySum & 15) < (this.registerA & 15);
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADD A, H
  //#0x84:
  function() {
    var dirtySum = this.registerA + (this.registersHL >> 8);
    this.FHalfCarry = (dirtySum & 15) < (this.registerA & 15);
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADD A, L
  //#0x85:
  function() {
    var dirtySum = this.registerA + (this.registersHL & 255);
    this.FHalfCarry = (dirtySum & 15) < (this.registerA & 15);
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADD A, (HL)
  //#0x86:
  function() {
    var dirtySum = this.registerA + this.readMemory(this.registersHL);
    this.FHalfCarry = (dirtySum & 15) < (this.registerA & 15);
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADD A, A
  //#0x87:
  function() {
    this.FHalfCarry = (this.registerA & 8) === 8;
    this.FCarry = this.registerA > 127;
    this.registerA = this.registerA << 1 & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADC A, B
  //#0x88:
  function() {
    var dirtySum = this.registerA + this.registerB + (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) + (this.registerB & 15) + (this.FCarry ? 1 : 0) > 15;
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADC A, C
  //#0x89:
  function() {
    var dirtySum = this.registerA + this.registerC + (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) + (this.registerC & 15) + (this.FCarry ? 1 : 0) > 15;
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADC A, D
  //#0x8A:
  function() {
    var dirtySum = this.registerA + this.registerD + (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) + (this.registerD & 15) + (this.FCarry ? 1 : 0) > 15;
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADC A, E
  //#0x8B:
  function() {
    var dirtySum = this.registerA + this.registerE + (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) + (this.registerE & 15) + (this.FCarry ? 1 : 0) > 15;
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADC A, H
  //#0x8C:
  function() {
    var tempValue = this.registersHL >> 8;
    var dirtySum = this.registerA + tempValue + (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) + (tempValue & 15) + (this.FCarry ? 1 : 0) > 15;
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADC A, L
  //#0x8D:
  function() {
    var tempValue = this.registersHL & 255;
    var dirtySum = this.registerA + tempValue + (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) + (tempValue & 15) + (this.FCarry ? 1 : 0) > 15;
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADC A, (HL)
  //#0x8E:
  function() {
    var tempValue = this.readMemory(this.registersHL);
    var dirtySum = this.registerA + tempValue + (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) + (tempValue & 15) + (this.FCarry ? 1 : 0) > 15;
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //ADC A, A
  //#0x8F:
  function() {
    var dirtySum = this.registerA << 1 | (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA << 1 & 30 | (this.FCarry ? 1 : 0)) > 15;
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //SUB A, B
  //#0x90:
  function() {
    var dirtySum = this.registerA - this.registerB;
    this.FHalfCarry = (this.registerA & 15) < (dirtySum & 15);
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //SUB A, C
  //#0x91:
  function() {
    var dirtySum = this.registerA - this.registerC;
    this.FHalfCarry = (this.registerA & 15) < (dirtySum & 15);
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //SUB A, D
  //#0x92:
  function() {
    var dirtySum = this.registerA - this.registerD;
    this.FHalfCarry = (this.registerA & 15) < (dirtySum & 15);
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //SUB A, E
  //#0x93:
  function() {
    var dirtySum = this.registerA - this.registerE;
    this.FHalfCarry = (this.registerA & 15) < (dirtySum & 15);
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //SUB A, H
  //#0x94:
  function() {
    var dirtySum = this.registerA - (this.registersHL >> 8);
    this.FHalfCarry = (this.registerA & 15) < (dirtySum & 15);
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //SUB A, L
  //#0x95:
  function() {
    var dirtySum = this.registerA - (this.registersHL & 255);
    this.FHalfCarry = (this.registerA & 15) < (dirtySum & 15);
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //SUB A, (HL)
  //#0x96:
  function() {
    var dirtySum = this.registerA - this.readMemory(this.registersHL);
    this.FHalfCarry = (this.registerA & 15) < (dirtySum & 15);
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //SUB A, A
  //#0x97:
  function() {
    this.registerA = 0;
    this.FHalfCarry = this.FCarry = false;
    this.FZero = this.FSubtract = true;
  },
  //SBC A, B
  //#0x98:
  function() {
    var dirtySum = this.registerA - this.registerB - (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) - (this.registerB & 15) - (this.FCarry ? 1 : 0) < 0;
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = true;
  },
  //SBC A, C
  //#0x99:
  function() {
    var dirtySum = this.registerA - this.registerC - (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) - (this.registerC & 15) - (this.FCarry ? 1 : 0) < 0;
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = true;
  },
  //SBC A, D
  //#0x9A:
  function() {
    var dirtySum = this.registerA - this.registerD - (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) - (this.registerD & 15) - (this.FCarry ? 1 : 0) < 0;
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = true;
  },
  //SBC A, E
  //#0x9B:
  function() {
    var dirtySum = this.registerA - this.registerE - (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) - (this.registerE & 15) - (this.FCarry ? 1 : 0) < 0;
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = true;
  },
  //SBC A, H
  //#0x9C:
  function() {
    var temp_var = this.registersHL >> 8;
    var dirtySum = this.registerA - temp_var - (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) - (temp_var & 15) - (this.FCarry ? 1 : 0) < 0;
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = true;
  },
  //SBC A, L
  //#0x9D:
  function() {
    var dirtySum = this.registerA - (this.registersHL & 255) - (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) - (this.registersHL & 15) - (this.FCarry ? 1 : 0) < 0;
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = true;
  },
  //SBC A, (HL)
  //#0x9E:
  function() {
    var temp_var = this.readMemory(this.registersHL);
    var dirtySum = this.registerA - temp_var - (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) - (temp_var & 15) - (this.FCarry ? 1 : 0) < 0;
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = true;
  },
  //SBC A, A
  //#0x9F:
  function() {
    if (this.FCarry) {
      this.FZero = false;
      this.FSubtract = this.FHalfCarry = this.FCarry = true;
      this.registerA = 255;
    } else {
      this.FHalfCarry = this.FCarry = false;
      this.FSubtract = this.FZero = true;
      this.registerA = 0;
    }
  },
  //AND B
  //#0xA0:
  function() {
    this.registerA &= this.registerB;
    this.FZero = this.registerA === 0;
    this.FHalfCarry = true;
    this.FSubtract = this.FCarry = false;
  },
  //AND C
  //#0xA1:
  function() {
    this.registerA &= this.registerC;
    this.FZero = this.registerA === 0;
    this.FHalfCarry = true;
    this.FSubtract = this.FCarry = false;
  },
  //AND D
  //#0xA2:
  function() {
    this.registerA &= this.registerD;
    this.FZero = this.registerA === 0;
    this.FHalfCarry = true;
    this.FSubtract = this.FCarry = false;
  },
  //AND E
  //#0xA3:
  function() {
    this.registerA &= this.registerE;
    this.FZero = this.registerA === 0;
    this.FHalfCarry = true;
    this.FSubtract = this.FCarry = false;
  },
  //AND H
  //#0xA4:
  function() {
    this.registerA &= this.registersHL >> 8;
    this.FZero = this.registerA === 0;
    this.FHalfCarry = true;
    this.FSubtract = this.FCarry = false;
  },
  //AND L
  //#0xA5:
  function() {
    this.registerA &= this.registersHL;
    this.FZero = this.registerA === 0;
    this.FHalfCarry = true;
    this.FSubtract = this.FCarry = false;
  },
  //AND (HL)
  //#0xA6:
  function() {
    this.registerA &= this.readMemory(this.registersHL);
    this.FZero = this.registerA === 0;
    this.FHalfCarry = true;
    this.FSubtract = this.FCarry = false;
  },
  //AND A
  //#0xA7:
  function() {
    this.FZero = this.registerA === 0;
    this.FHalfCarry = true;
    this.FSubtract = this.FCarry = false;
  },
  //XOR B
  //#0xA8:
  function() {
    this.registerA ^= this.registerB;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FHalfCarry = this.FCarry = false;
  },
  //XOR C
  //#0xA9:
  function() {
    this.registerA ^= this.registerC;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FHalfCarry = this.FCarry = false;
  },
  //XOR D
  //#0xAA:
  function() {
    this.registerA ^= this.registerD;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FHalfCarry = this.FCarry = false;
  },
  //XOR E
  //#0xAB:
  function() {
    this.registerA ^= this.registerE;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FHalfCarry = this.FCarry = false;
  },
  //XOR H
  //#0xAC:
  function() {
    this.registerA ^= this.registersHL >> 8;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FHalfCarry = this.FCarry = false;
  },
  //XOR L
  //#0xAD:
  function() {
    this.registerA ^= this.registersHL & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FHalfCarry = this.FCarry = false;
  },
  //XOR (HL)
  //#0xAE:
  function() {
    this.registerA ^= this.readMemory(this.registersHL);
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FHalfCarry = this.FCarry = false;
  },
  //XOR A
  //#0xAF:
  function() {
    this.registerA = 0;
    this.FZero = true;
    this.FSubtract = this.FHalfCarry = this.FCarry = false;
  },
  //OR B
  //#0xB0:
  function() {
    this.registerA |= this.registerB;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FCarry = this.FHalfCarry = false;
  },
  //OR C
  //#0xB1:
  function() {
    this.registerA |= this.registerC;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FCarry = this.FHalfCarry = false;
  },
  //OR D
  //#0xB2:
  function() {
    this.registerA |= this.registerD;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FCarry = this.FHalfCarry = false;
  },
  //OR E
  //#0xB3:
  function() {
    this.registerA |= this.registerE;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FCarry = this.FHalfCarry = false;
  },
  //OR H
  //#0xB4:
  function() {
    this.registerA |= this.registersHL >> 8;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FCarry = this.FHalfCarry = false;
  },
  //OR L
  //#0xB5:
  function() {
    this.registerA |= this.registersHL & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FCarry = this.FHalfCarry = false;
  },
  //OR (HL)
  //#0xB6:
  function() {
    this.registerA |= this.readMemory(this.registersHL);
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FCarry = this.FHalfCarry = false;
  },
  //OR A
  //#0xB7:
  function() {
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FCarry = this.FHalfCarry = false;
  },
  //CP B
  //#0xB8:
  function() {
    var dirtySum = this.registerA - this.registerB;
    this.FHalfCarry = (dirtySum & 15) > (this.registerA & 15);
    this.FCarry = dirtySum < 0;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //CP C
  //#0xB9:
  function() {
    var dirtySum = this.registerA - this.registerC;
    this.FHalfCarry = (dirtySum & 15) > (this.registerA & 15);
    this.FCarry = dirtySum < 0;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //CP D
  //#0xBA:
  function() {
    var dirtySum = this.registerA - this.registerD;
    this.FHalfCarry = (dirtySum & 15) > (this.registerA & 15);
    this.FCarry = dirtySum < 0;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //CP E
  //#0xBB:
  function() {
    var dirtySum = this.registerA - this.registerE;
    this.FHalfCarry = (dirtySum & 15) > (this.registerA & 15);
    this.FCarry = dirtySum < 0;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //CP H
  //#0xBC:
  function() {
    var dirtySum = this.registerA - (this.registersHL >> 8);
    this.FHalfCarry = (dirtySum & 15) > (this.registerA & 15);
    this.FCarry = dirtySum < 0;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //CP L
  //#0xBD:
  function() {
    var dirtySum = this.registerA - (this.registersHL & 255);
    this.FHalfCarry = (dirtySum & 15) > (this.registerA & 15);
    this.FCarry = dirtySum < 0;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //CP (HL)
  //#0xBE:
  function() {
    var dirtySum = this.registerA - this.readMemory(this.registersHL);
    this.FHalfCarry = (dirtySum & 15) > (this.registerA & 15);
    this.FCarry = dirtySum < 0;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //CP A
  //#0xBF:
  function() {
    this.FHalfCarry = this.FCarry = false;
    this.FZero = this.FSubtract = true;
  },
  //RET !FZ
  //#0xC0:
  function() {
    if (!this.FZero) {
      this.programCounter = this.readMemory(this.stackPointer + 1 & 65535) << 8 | this.readMemory(this.stackPointer);
      this.stackPointer = this.stackPointer + 2 & 65535;
      this.currentInstructionCycleCount += 12;
    }
  },
  //POP BC
  //#0xC1:
  function() {
    this.registerC = this.readMemory(this.stackPointer);
    this.registerB = this.readMemory(this.stackPointer + 1 & 65535);
    this.stackPointer = this.stackPointer + 2 & 65535;
  },
  //JP !FZ, nn
  //#0xC2:
  function() {
    if (!this.FZero) {
      this.programCounter = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
      this.currentInstructionCycleCount += 4;
    } else {
      this.programCounter = this.programCounter + 2 & 65535;
    }
  },
  //JP nn
  //#0xC3:
  function() {
    this.programCounter = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
  },
  //CALL !FZ, nn
  //#0xC4:
  function() {
    if (!this.FZero) {
      var temp_pc = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
      this.programCounter = this.programCounter + 2 & 65535;
      this.stackPointer = this.stackPointer - 1 & 65535;
      this.writeMemory(
        this.stackPointer,
        this.programCounter >> 8
      );
      this.stackPointer = this.stackPointer - 1 & 65535;
      this.writeMemory(
        this.stackPointer,
        this.programCounter & 255
      );
      this.programCounter = temp_pc;
      this.currentInstructionCycleCount += 12;
    } else {
      this.programCounter = this.programCounter + 2 & 65535;
    }
  },
  //PUSH BC
  //#0xC5:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.registerB
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.registerC
    );
  },
  //ADD, n
  //#0xC6:
  function() {
    var dirtySum = this.registerA + this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
    this.FHalfCarry = (dirtySum & 15) < (this.registerA & 15);
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //RST 0
  //#0xC7:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter >> 8
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter & 255
    );
    this.programCounter = 0;
  },
  //RET FZ
  //#0xC8:
  function() {
    if (this.FZero) {
      this.programCounter = this.readMemory(this.stackPointer + 1 & 65535) << 8 | this.readMemory(this.stackPointer);
      this.stackPointer = this.stackPointer + 2 & 65535;
      this.currentInstructionCycleCount += 12;
    }
  },
  //RET
  //#0xC9:
  function() {
    this.programCounter = this.readMemory(this.stackPointer + 1 & 65535) << 8 | this.readMemory(this.stackPointer);
    this.stackPointer = this.stackPointer + 2 & 65535;
  },
  //JP FZ, nn
  //#0xCA:
  function() {
    if (this.FZero) {
      this.programCounter = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
      this.currentInstructionCycleCount += 4;
    } else {
      this.programCounter = this.programCounter + 2 & 65535;
    }
  },
  //Secondary OP Code Set:
  //#0xCB:
  function() {
    const operationCode = this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
    this.currentInstructionCycleCount += secondaryTickTable_default[operationCode];
    bitInstructions_default[operationCode].apply(this);
  },
  //CALL FZ, nn
  //#0xCC:
  function() {
    if (this.FZero) {
      var temp_pc = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
      this.programCounter = this.programCounter + 2 & 65535;
      this.stackPointer = this.stackPointer - 1 & 65535;
      this.writeMemory(
        this.stackPointer,
        this.programCounter >> 8
      );
      this.stackPointer = this.stackPointer - 1 & 65535;
      this.writeMemory(
        this.stackPointer,
        this.programCounter & 255
      );
      this.programCounter = temp_pc;
      this.currentInstructionCycleCount += 12;
    } else {
      this.programCounter = this.programCounter + 2 & 65535;
    }
  },
  //CALL nn
  //#0xCD:
  function() {
    var temp_pc = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 2 & 65535;
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter >> 8
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter & 255
    );
    this.programCounter = temp_pc;
  },
  //ADC A, n
  //#0xCE:
  function() {
    var tempValue = this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
    var dirtySum = this.registerA + tempValue + (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) + (tempValue & 15) + (this.FCarry ? 1 : 0) > 15;
    this.FCarry = dirtySum > 255;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = false;
  },
  //RST 0x8
  //#0xCF:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter >> 8
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter & 255
    );
    this.programCounter = 8;
  },
  //RET !FC
  //#0xD0:
  function() {
    if (!this.FCarry) {
      this.programCounter = this.readMemory(this.stackPointer + 1 & 65535) << 8 | this.readMemory(this.stackPointer);
      this.stackPointer = this.stackPointer + 2 & 65535;
      this.currentInstructionCycleCount += 12;
    }
  },
  //POP DE
  //#0xD1:
  function() {
    this.registerE = this.readMemory(this.stackPointer);
    this.registerD = this.readMemory(this.stackPointer + 1 & 65535);
    this.stackPointer = this.stackPointer + 2 & 65535;
  },
  //JP !FC, nn
  //#0xD2:
  function() {
    if (!this.FCarry) {
      this.programCounter = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
      this.currentInstructionCycleCount += 4;
    } else {
      this.programCounter = this.programCounter + 2 & 65535;
    }
  },
  //0xD3 - Illegal
  //#0xD3:
  function() {
    console.error("Illegal op code 0xD3 called, pausing emulation.");
  },
  //CALL !FC, nn
  //#0xD4:
  function() {
    if (!this.FCarry) {
      var temp_pc = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
      this.programCounter = this.programCounter + 2 & 65535;
      this.stackPointer = this.stackPointer - 1 & 65535;
      this.writeMemory(
        this.stackPointer,
        this.programCounter >> 8
      );
      this.stackPointer = this.stackPointer - 1 & 65535;
      this.writeMemory(
        this.stackPointer,
        this.programCounter & 255
      );
      this.programCounter = temp_pc;
      this.currentInstructionCycleCount += 12;
    } else {
      this.programCounter = this.programCounter + 2 & 65535;
    }
  },
  //PUSH DE
  //#0xD5:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.registerD
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.registerE
    );
  },
  //SUB A, n
  //#0xD6:
  function() {
    var dirtySum = this.registerA - this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
    this.FHalfCarry = (this.registerA & 15) < (dirtySum & 15);
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //RST 0x10
  //#0xD7:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter >> 8
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter & 255
    );
    this.programCounter = 16;
  },
  //RET FC
  //#0xD8:
  function() {
    if (this.FCarry) {
      this.programCounter = this.readMemory(this.stackPointer + 1 & 65535) << 8 | this.readMemory(this.stackPointer);
      this.stackPointer = this.stackPointer + 2 & 65535;
      this.currentInstructionCycleCount += 12;
    }
  },
  //RETI
  //#0xD9:
  function() {
    this.programCounter = this.readMemory(this.stackPointer + 1 & 65535) << 8 | this.readMemory(this.stackPointer);
    this.stackPointer = this.stackPointer + 2 & 65535;
    this.IRQEnableDelay = this.IRQEnableDelay === 2 || this.readMemory(this.programCounter) === 118 ? 1 : 2;
  },
  //JP FC, nn
  //#0xDA:
  function() {
    if (this.FCarry) {
      this.programCounter = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
      this.currentInstructionCycleCount += 4;
    } else {
      this.programCounter = this.programCounter + 2 & 65535;
    }
  },
  //0xDB - Illegal
  //#0xDB:
  function() {
    console.error("Illegal op code 0xDB called, pausing emulation.");
  },
  //CALL FC, nn
  //#0xDC:
  function() {
    if (this.FCarry) {
      var temp_pc = this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter);
      this.programCounter = this.programCounter + 2 & 65535;
      this.stackPointer = this.stackPointer - 1 & 65535;
      this.writeMemory(
        this.stackPointer,
        this.programCounter >> 8
      );
      this.stackPointer = this.stackPointer - 1 & 65535;
      this.writeMemory(
        this.stackPointer,
        this.programCounter & 255
      );
      this.programCounter = temp_pc;
      this.currentInstructionCycleCount += 12;
    } else {
      this.programCounter = this.programCounter + 2 & 65535;
    }
  },
  //0xDD - Illegal
  //#0xDD:
  function() {
    console.error("Illegal op code 0xDD called, pausing emulation.");
  },
  //SBC A, n
  //#0xDE:
  function() {
    var temp_var = this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
    var dirtySum = this.registerA - temp_var - (this.FCarry ? 1 : 0);
    this.FHalfCarry = (this.registerA & 15) - (temp_var & 15) - (this.FCarry ? 1 : 0) < 0;
    this.FCarry = dirtySum < 0;
    this.registerA = dirtySum & 255;
    this.FZero = this.registerA === 0;
    this.FSubtract = true;
  },
  //RST 0x18
  //#0xDF:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter >> 8
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter & 255
    );
    this.programCounter = 24;
  },
  //LDH (n), A
  //#0xE0:
  function() {
    this.memoryHighWrite(this.readMemory(this.programCounter), this.registerA);
    this.programCounter = this.programCounter + 1 & 65535;
  },
  //POP HL
  //#0xE1:
  function() {
    this.registersHL = this.readMemory(this.stackPointer + 1 & 65535) << 8 | this.readMemory(this.stackPointer);
    this.stackPointer = this.stackPointer + 2 & 65535;
  },
  //LD (0xFF00 + C), A
  //#0xE2:
  function() {
    this.memoryHighWrite(this.registerC, this.registerA);
  },
  //0xE3 - Illegal
  //#0xE3:
  function() {
    console.log("Illegal op code 0xE3 called, pausing emulation.");
  },
  //0xE4 - Illegal
  //#0xE4:
  function() {
    console.log("Illegal op code 0xE4 called, pausing emulation.");
  },
  //PUSH HL
  //#0xE5:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.registersHL >> 8
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.registersHL & 255
    );
  },
  //AND n
  //#0xE6:
  function() {
    this.registerA &= this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
    this.FZero = this.registerA === 0;
    this.FHalfCarry = true;
    this.FSubtract = this.FCarry = false;
  },
  //RST 0x20
  //#0xE7:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter >> 8
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter & 255
    );
    this.programCounter = 32;
  },
  //ADD SP, n
  //#0xE8:
  function() {
    var temp_value2 = this.readMemory(this.programCounter) << 24 >> 24;
    this.programCounter = this.programCounter + 1 & 65535;
    var temp_value = this.stackPointer + temp_value2 & 65535;
    temp_value2 = this.stackPointer ^ temp_value2 ^ temp_value;
    this.stackPointer = temp_value;
    this.FCarry = (temp_value2 & 256) === 256;
    this.FHalfCarry = (temp_value2 & 16) === 16;
    this.FZero = this.FSubtract = false;
  },
  //JP, (HL)
  //#0xE9:
  function() {
    this.programCounter = this.registersHL;
  },
  //LD n, A
  //#0xEA:
  function() {
    this.writeMemory(
      this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter),
      this.registerA
    );
    this.programCounter = this.programCounter + 2 & 65535;
  },
  //0xEB - Illegal
  //#0xEB:
  function() {
    console.error("Illegal op code 0xEB called, pausing emulation.");
  },
  //0xEC - Illegal
  //#0xEC:
  function() {
    console.error("Illegal op code 0xEC called, pausing emulation.");
  },
  //0xED - Illegal
  //#0xED:
  function() {
    console.error("Illegal op code 0xED called, pausing emulation.");
  },
  //XOR n
  //#0xEE:
  function() {
    this.registerA ^= this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
    this.FZero = this.registerA === 0;
    this.FSubtract = this.FHalfCarry = this.FCarry = false;
  },
  //RST 0x28
  //#0xEF:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter >> 8
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter & 255
    );
    this.programCounter = 40;
  },
  //LDH A, (n)
  //#0xF0:
  function() {
    this.registerA = this.memoryHighRead(this.readMemory(this.programCounter));
    this.programCounter = this.programCounter + 1 & 65535;
  },
  //POP AF
  //#0xF1:
  function() {
    var temp_var = this.readMemory(this.stackPointer);
    this.FZero = temp_var > 127;
    this.FSubtract = (temp_var & 64) === 64;
    this.FHalfCarry = (temp_var & 32) === 32;
    this.FCarry = (temp_var & 16) === 16;
    this.registerA = this.readMemory(this.stackPointer + 1 & 65535);
    this.stackPointer = this.stackPointer + 2 & 65535;
  },
  //LD A, (0xFF00 + C)
  //#0xF2:
  function() {
    this.registerA = this.memoryHighRead(this.registerC);
  },
  //DI
  //#0xF3:
  function() {
    this.IME = false;
    this.IRQEnableDelay = 0;
  },
  //0xF4 - Illegal
  //#0xF4:
  function() {
    console.error("Illegal op code 0xF4 called, pausing emulation.");
  },
  //PUSH AF
  //#0xF5:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.registerA
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      (this.FZero ? 128 : 0) | (this.FSubtract ? 64 : 0) | (this.FHalfCarry ? 32 : 0) | (this.FCarry ? 16 : 0)
    );
  },
  //OR n
  //#0xF6:
  function() {
    this.registerA |= this.readMemory(this.programCounter);
    this.FZero = this.registerA === 0;
    this.programCounter = this.programCounter + 1 & 65535;
    this.FSubtract = this.FCarry = this.FHalfCarry = false;
  },
  //RST 0x30
  //#0xF7:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter >> 8
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter & 255
    );
    this.programCounter = 48;
  },
  //LDHL SP, n
  //#0xF8:
  function() {
    var temp_var = this.readMemory(this.programCounter) << 24 >> 24;
    this.programCounter = this.programCounter + 1 & 65535;
    this.registersHL = this.stackPointer + temp_var & 65535;
    temp_var = this.stackPointer ^ temp_var ^ this.registersHL;
    this.FCarry = (temp_var & 256) === 256;
    this.FHalfCarry = (temp_var & 16) === 16;
    this.FZero = this.FSubtract = false;
  },
  //LD SP, HL
  //#0xF9:
  function() {
    this.stackPointer = this.registersHL;
  },
  //LD A, (nn)
  //#0xFA:
  function() {
    this.registerA = this.readMemory(
      this.readMemory(this.programCounter + 1 & 65535) << 8 | this.readMemory(this.programCounter)
    );
    this.programCounter = this.programCounter + 2 & 65535;
  },
  //EI
  //#0xFB:
  function() {
    this.IRQEnableDelay = this.IRQEnableDelay === 2 || this.readMemory(this.programCounter) === 118 ? 1 : 2;
  },
  //0xFC - Illegal
  //#0xFC:
  () => console.error("Illegal op code 0xFC called, pausing emulation."),
  //0xFD - Illegal
  //#0xFD:
  () => console.error("Illegal op code 0xFD called, pausing emulation."),
  //CP n
  //#0xFE:
  function() {
    var dirtySum = this.registerA - this.readMemory(this.programCounter);
    this.programCounter = this.programCounter + 1 & 65535;
    this.FHalfCarry = (dirtySum & 15) > (this.registerA & 15);
    this.FCarry = dirtySum < 0;
    this.FZero = dirtySum === 0;
    this.FSubtract = true;
  },
  //RST 0x38
  //#0xFF:
  function() {
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter >> 8
    );
    this.stackPointer = this.stackPointer - 1 & 65535;
    this.writeMemory(
      this.stackPointer,
      this.programCounter & 255
    );
    this.programCounter = 56;
  }
];

// vendor/jsgbc-core/src/storages/Storage.ts
var Storage = class {
  getState(name) {
    return this.get("state-" + name);
  }
  getRam(name) {
    return this.get("ram-" + name);
  }
  getRtc(name) {
    return this.get("rtc-" + name);
  }
  setState(name, buffer) {
    return this.set("state-" + name, buffer);
  }
  setRam(name, buffer) {
    return this.set("ram-" + name, buffer);
  }
  setRtc(name, buffer) {
    return this.set("rtc-" + name, buffer);
  }
};

// vendor/jsgbc-core/src/storages/LocalStorage.ts
var LocalStorage = class extends Storage {
  get(name) {
    const data = window.localStorage.getItem(name);
    return base64ToArrayBuffer(data);
  }
  set(name, buffer) {
    const data = arrayBufferToBase64(buffer);
    window.localStorage.setItem(name, data);
  }
};
function base64ToArrayBuffer(data) {
  if (!data || data.length <= 0) return null;
  data = atob(data);
  const array = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    array[i] = data.charCodeAt(i);
  }
  return array.buffer;
}
function arrayBufferToBase64(array) {
  if (!array || array.length <= 0) return null;
  array = new Uint8Array(array);
  let data = "";
  for (let i = 0; i < array.byteLength; i++) {
    data += String.fromCharCode(array[i]);
  }
  return btoa(data);
}

// vendor/jsgbc-core/src/storages/MemoryStorage.ts
var MemoryStorage = class extends Storage {
  memory = {};
  get(name) {
    return this.memory[name];
  }
  set(name, buffer) {
    this.memory[name] = buffer;
  }
};

// vendor/jsgbc-core/src/audio/AudioChannel.ts
var AudioChannel = class {
  constructor(gameboy) {
    this.gameboy = gameboy;
  }
  gameboy;
  enabled = false;
  leftChannelEnabled = false;
  rightChannelEnabled = false;
  canPlay = false;
};

// vendor/jsgbc-core/src/audio/SquareAudioChannel.ts
var SquareAudioChannel = class extends AudioChannel {
  constructor(gameboy, options = {}) {
    super(gameboy);
    this.gameboy = gameboy;
    this.sweepEnabled = !!options.sweepEnabled;
  }
  gameboy;
  currentSampleLeft;
  currentSampleRight;
  currentSampleLeftSecondary;
  currentSampleRightSecondary;
  currentSampleLeftTrimary;
  currentSampleRightTrimary;
  frequencyCounter;
  frequencyTracker;
  dutyTracker;
  cachedDuty;
  totalLength;
  envelopeVolume;
  envelopeType;
  consecutive;
  frequency;
  shadowFrequency;
  envelopeSweeps;
  envelopeSweepsLast;
  sweepEnabled = false;
  sweepFault;
  timeSweep;
  lastTimeSweep;
  swept;
  decreaseSweep;
  frequencySweepDivider;
  init() {
    this.leftChannelEnabled = false;
    this.rightChannelEnabled = false;
    this.frequency = 0;
    this.consecutive = false;
  }
  setInitialState() {
    this.enabled = false;
    this.canPlay = false;
    this.frequencyCounter = 8192;
    this.frequencyTracker = 8192;
    this.dutyTracker = 0;
    this.cachedDuty = dutyLookup_default[2];
    this.totalLength = 0;
    this.envelopeVolume = 0;
    this.envelopeType = false;
    this.consecutive = true;
    this.frequency = 0;
    this.shadowFrequency = 0;
    this.envelopeSweeps = 0;
    this.envelopeSweepsLast = 0;
    if (this.sweepEnabled) {
      this.sweepFault = false;
      this.timeSweep = 1;
      this.lastTimeSweep = 0;
      this.swept = false;
      this.frequencySweepDivider = 0;
      this.decreaseSweep = false;
    }
  }
  setSkippedBootRomState() {
    this.leftChannelEnabled = true;
    this.rightChannelEnabled = true;
    this.frequencyCounter = 512;
    this.frequencyTracker = 8192;
    this.dutyTracker = 0;
    this.cachedDuty = dutyLookup_default[2];
    this.totalLength = 0;
    this.envelopeVolume = 0;
    this.envelopeType = false;
    this.consecutive = true;
    this.frequency = 1985;
    this.shadowFrequency = 1985;
    this.envelopeSweeps = 0;
    this.envelopeSweepsLast = 0;
    if (this.sweepEnabled) {
      this.swept = false;
      this.sweepFault = true;
      this.decreaseSweep = false;
      this.frequencySweepDivider = 0;
      this.timeSweep = 1;
      this.lastTimeSweep = 0;
    }
  }
  envelope() {
    if (this.envelopeSweepsLast > -1) {
      if (this.envelopeSweeps > 0) {
        --this.envelopeSweeps;
      } else {
        if (!this.envelopeType) {
          if (this.envelopeVolume > 0) {
            --this.envelopeVolume;
            this.envelopeSweeps = this.envelopeSweepsLast;
            this.setFirstStageSamples();
            this.setSecondStageSamples();
            this.setThirdStageSamples();
            this.gameboy.audioController.cacheMixerOutputLevel();
          } else {
            this.envelopeSweepsLast = -1;
          }
        } else if (this.envelopeVolume < 15) {
          ++this.envelopeVolume;
          this.envelopeSweeps = this.envelopeSweepsLast;
          this.setFirstStageSamples();
          this.setSecondStageSamples();
          this.setThirdStageSamples();
          this.gameboy.audioController.cacheMixerOutputLevel();
        } else {
          this.envelopeSweepsLast = -1;
        }
      }
    }
  }
  setSweep(data) {
    if (this.decreaseSweep && (data & 8) === 0) {
      if (this.swept) {
        this.sweepFault = true;
      }
    }
    this.lastTimeSweep = (data & 112) >> 4;
    this.frequencySweepDivider = data & 7;
    this.decreaseSweep = (data & 8) === 8;
  }
  setDuty(data) {
    this.cachedDuty = dutyLookup_default[data >> 6];
  }
  setLength(data) {
    this.totalLength = 64 - (data & 63);
  }
  setEnvelopeVolume(address, data) {
    if (this.enabled && this.envelopeSweeps === 0) {
      if (((this.gameboy.memory[address] ^ data) & 8) === 8) {
        if ((this.gameboy.memory[address] & 8) === 0) {
          if ((this.gameboy.memory[address] & 7) === 7) {
            this.envelopeVolume += 2;
          } else {
            ++this.envelopeVolume;
          }
        }
        this.envelopeVolume = 16 - this.envelopeVolume & 15;
      } else if ((this.gameboy.memory[address] & 15) === 8) {
        this.envelopeVolume = 1 + this.envelopeVolume & 15;
      }
      this.setFirstStageSamples();
      this.setSecondStageSamples();
      this.setThirdStageSamples();
      this.gameboy.audioController.cacheMixerOutputLevel();
    }
  }
  setEnvelopeType(data) {
    this.envelopeType = (data & 8) === 8;
  }
  setFrequency(data) {
    this.frequency = this.frequency & 1792 | data;
    this.frequencyTracker = 2048 - this.frequency << 2;
  }
  setHighFrequency(data) {
    this.frequency = (data & 7) << 8 | this.frequency & 255;
    this.frequencyTracker = 2048 - this.frequency << 2;
  }
  checkEnabled() {
    this.enabled = (this.consecutive || this.totalLength > 0) && !this.sweepFault && this.canPlay;
    this.setSecondStageSamples();
    this.setThirdStageSamples();
    this.gameboy.audioController.cacheMixerOutputLevel();
  }
  checkVolumeEnabled() {
    this.canPlay = this.gameboy.memory[65298] > 7;
    this.checkEnabled();
    this.setSecondStageSamples();
    this.setThirdStageSamples();
    this.gameboy.audioController.cacheMixerOutputLevel();
  }
  length(value) {
    if (this.totalLength > 1) {
      --this.totalLength;
    } else if (this.totalLength === 1) {
      this.totalLength = 0;
      this.checkEnabled();
      this.gameboy.memory[65318] &= value;
    }
  }
  sweep() {
    if (!this.sweepFault && this.timeSweep > 0) {
      if (--this.timeSweep === 0) {
        if (this.lastTimeSweep > 0) {
          if (this.frequencySweepDivider > 0) {
            this.swept = true;
            if (this.decreaseSweep) {
              this.shadowFrequency -= this.shadowFrequency >> this.frequencySweepDivider;
              this.frequency = this.shadowFrequency & 2047;
              this.frequencyTracker = 2048 - this.frequency << 2;
            } else {
              this.shadowFrequency += this.shadowFrequency >> this.frequencySweepDivider;
              this.frequency = this.shadowFrequency;
              if (this.shadowFrequency <= 2047) {
                this.frequencyTracker = 2048 - this.frequency << 2;
                if (this.shadowFrequency + (this.shadowFrequency >> this.frequencySweepDivider) > 2047) {
                  this.sweepFault = true;
                  this.checkEnabled();
                  this.gameboy.memory[65318] &= 254;
                }
              } else {
                this.frequency &= 2047;
                this.sweepFault = true;
                this.checkEnabled();
                this.gameboy.memory[65318] &= 254;
              }
            }
            this.timeSweep = this.lastTimeSweep;
          } else {
            this.sweepFault = true;
            this.checkEnabled();
          }
        }
      }
    }
  }
  setFirstStageSamples() {
    this.currentSampleLeft = this.leftChannelEnabled ? this.envelopeVolume : 0;
    this.currentSampleRight = this.rightChannelEnabled ? this.envelopeVolume : 0;
  }
  setSecondStageSamples() {
    if (this.enabled) {
      this.currentSampleLeftSecondary = this.currentSampleLeft;
      this.currentSampleRightSecondary = this.currentSampleRight;
    } else {
      this.currentSampleLeftSecondary = 0;
      this.currentSampleRightSecondary = 0;
    }
  }
  setThirdStageSamples() {
    if (this.cachedDuty[this.dutyTracker] && settings_default.enabledAudioChannels[0]) {
      this.currentSampleLeftTrimary = this.currentSampleLeftSecondary;
      this.currentSampleRightTrimary = this.currentSampleRightSecondary;
    } else {
      this.currentSampleLeftTrimary = 0;
      this.currentSampleRightTrimary = 0;
    }
  }
};

// vendor/jsgbc-core/src/audio/AudioController.ts
var AudioController = class {
  cartridgeLeftChannelInputVolume;
  cartridgeRightChannelInputVolume;
  mixerOutputCache;
  sequencerClocks;
  sequencePosition;
  audioClocksUntilNextEvent;
  audioClocksUntilNextEventCounter;
  resamplerFirstPassFactor;
  leftChannel3;
  rightChannel3;
  channel3Enabled;
  channel3CanPlay;
  cachedChannel3Sample;
  channel3CurrentSampleLeft;
  channel3CurrentSampleRight;
  channel3CurrentSampleLeftSecondary;
  channel3CurrentSampleRightSecondary;
  channel3envelopeVolume;
  channel3TotalLength;
  channel3PatternType;
  channel3frequency;
  channel3Consecutive;
  channel3Counter;
  channel3FrequencyPeriod;
  channel3LastSampleLookup;
  channel3PcmData;
  leftChannel4;
  rightChannel4;
  channel4Enabled;
  channel4CanPlay;
  cachedChannel4Sample;
  channel4Counter;
  channel4CurrentSampleLeft;
  channel4CurrentSampleRight;
  channel4CurrentSampleLeftSecondary;
  channel4CurrentSampleRightSecondary;
  channel4FrequencyPeriod;
  channel4TotalLength;
  channel4EnvelopeVolume;
  channel4CurrentVolume;
  channel4EnvelopeType;
  channel4EnvelopeSweeps;
  channel4EnvelopeSweepsLast;
  channel4Consecutive;
  channel4BitRange;
  channel4VolumeShifter;
  channel4LastSampleLookup;
  downSampleInputDivider;
  device;
  memory;
  gameboy;
  cpu;
  LSFR15Table;
  LSFR7Table;
  noiseSampleTable;
  bufferLength = 0;
  // Length of the sound buffers
  audioTicks = 0;
  // Used to sample the audio system every x CPU instructions
  audioIndex = 0;
  // Used to keep alignment on audio generation
  bufferContainAmount = 0;
  // Buffer maintenance metric
  bufferPosition = 0;
  // Used to keep alignment on audio generation
  downsampleInput = 0;
  buffer;
  enabled = true;
  channel1;
  channel2;
  constructor({ cpu, gameboy }) {
    this.cpu = cpu;
    this.gameboy = gameboy;
    this.channel1 = new SquareAudioChannel(this.gameboy, { sweepEnabled: true });
    this.channel2 = new SquareAudioChannel(this.gameboy);
    this.generateWhiteNoise();
    this.setInitialState();
  }
  setMemory(memory) {
    this.memory = memory;
  }
  initMemory() {
    this.channel3PcmData = new Int8Array(32);
  }
  init() {
    this.channel1.init();
    this.channel2.init();
    this.leftChannel3 = false;
    this.rightChannel3 = false;
    this.leftChannel4 = false;
    this.rightChannel4 = false;
    this.channel4Consecutive = false;
    this.cartridgeLeftChannelInputVolume = 8;
    this.cartridgeRightChannelInputVolume = 8;
  }
  setInitialState() {
    this.channel1.setInitialState();
    this.channel2.setInitialState();
    this.channel3TotalLength = 0;
    this.channel3PatternType = 4;
    this.channel3frequency = 0;
    this.channel3Consecutive = true;
    this.channel3Counter = 2048;
    this.channel3FrequencyPeriod = 2048;
    this.channel3LastSampleLookup = 0;
    this.cachedChannel3Sample = 0;
    this.channel3Enabled = false;
    this.channel3CanPlay = false;
    this.channel4FrequencyPeriod = 8;
    this.channel4TotalLength = 0;
    this.channel4EnvelopeVolume = 0;
    this.channel4CurrentVolume = 0;
    this.channel4EnvelopeType = false;
    this.channel4EnvelopeSweeps = 0;
    this.channel4EnvelopeSweepsLast = 0;
    this.channel4Consecutive = true;
    this.channel4BitRange = 32767;
    this.channel4VolumeShifter = 15;
    this.channel4LastSampleLookup = 0;
    this.channel4FrequencyPeriod = 8;
    this.channel4Counter = 8;
    this.cachedChannel4Sample = 0;
    this.channel4Enabled = false;
    this.channel4CanPlay = false;
    this.cartridgeLeftChannelInputVolume = 8;
    this.cartridgeRightChannelInputVolume = 8;
    this.mixerOutputCache = 0;
    this.sequencerClocks = 8192;
    this.sequencePosition = 0;
    this.audioClocksUntilNextEvent = 1;
    this.audioClocksUntilNextEventCounter = 1;
    this.channel1.setFirstStageSamples();
    this.channel1.setSecondStageSamples();
    this.channel1.setThirdStageSamples();
    this.cacheMixerOutputLevel();
    this.channel2.setFirstStageSamples();
    this.channel2.setSecondStageSamples();
    this.channel2.setThirdStageSamples();
    this.cacheMixerOutputLevel();
    this.cacheChannel3OutputLevel();
    this.cacheChannel4OutputLevel();
    this.noiseSampleTable = this.LSFR15Table;
  }
  setSkippedBootRomState() {
    this.channel1.setSkippedBootRomState();
    this.channel2.setSkippedBootRomState();
    this.leftChannel3 = true;
    this.rightChannel3 = false;
    this.channel3CanPlay = false;
    this.channel3TotalLength = 0;
    this.channel3PatternType = 4;
    this.channel3frequency = 0;
    this.channel3Consecutive = true;
    this.channel3Counter = 2048;
    this.channel3FrequencyPeriod = 2048;
    this.channel3LastSampleLookup = 0;
    this.leftChannel4 = true;
    this.rightChannel4 = false;
    this.channel4FrequencyPeriod = 8;
    this.channel4TotalLength = 0;
    this.channel4EnvelopeVolume = 0;
    this.channel4CurrentVolume = 0;
    this.channel4EnvelopeType = false;
    this.channel4EnvelopeSweeps = 0;
    this.channel4EnvelopeSweepsLast = 0;
    this.channel4Consecutive = true;
    this.channel4BitRange = 32767;
    this.channel4VolumeShifter = 15;
    this.channel4LastSampleLookup = 0;
    this.cartridgeLeftChannelInputVolume = 8;
    this.cartridgeRightChannelInputVolume = 8;
  }
  // Below are the audio generation functions timed against the CPU:
  generate(sampleCount) {
    if (this.gameboy.audioController.enabled && !this.gameboy.cpu.stopped) {
      for (let clockUpTo = 0; sampleCount > 0; ) {
        clockUpTo = Math.min(this.audioClocksUntilNextEventCounter, this.sequencerClocks, sampleCount);
        this.audioClocksUntilNextEventCounter -= clockUpTo;
        this.sequencerClocks -= clockUpTo;
        sampleCount -= clockUpTo;
        while (clockUpTo > 0) {
          const multiplier = Math.min(clockUpTo, this.resamplerFirstPassFactor - this.audioIndex);
          clockUpTo -= multiplier;
          this.audioIndex += multiplier;
          this.downsampleInput += this.mixerOutputCache * multiplier;
          if (this.audioIndex === this.resamplerFirstPassFactor) {
            this.audioIndex = 0;
            this.outputAudio();
          }
        }
        if (this.sequencerClocks === 0) {
          this.audioComputeSequencer();
          this.sequencerClocks = 8192;
        }
        if (this.audioClocksUntilNextEventCounter === 0) {
          this.computeChannels();
        }
      }
    } else {
      while (sampleCount > 0) {
        const multiplier = Math.min(sampleCount, this.resamplerFirstPassFactor - this.audioIndex);
        sampleCount -= multiplier;
        this.audioIndex += multiplier;
        if (this.audioIndex === this.resamplerFirstPassFactor) {
          this.audioIndex = 0;
          this.outputAudio();
        }
      }
    }
  }
  enable() {
    this.memory[65318] = 128;
    this.enabled = true;
    this.setInitialState();
  }
  disable() {
    this.memory[65318] = 0;
    this.enabled = false;
    for (let address = 65296; address < 65318; address++) {
      this.gameboy.writeMemory(address, 0);
    }
  }
  run() {
    this.generate(this.audioTicks);
    this.audioTicks = 0;
  }
  clockAudioEnvelope() {
    this.channel1.envelope();
    this.channel2.envelope();
    if (this.channel4EnvelopeSweepsLast > -1) {
      if (this.channel4EnvelopeSweeps > 0) {
        --this.channel4EnvelopeSweeps;
      } else {
        if (!this.channel4EnvelopeType) {
          if (this.channel4EnvelopeVolume > 0) {
            this.channel4CurrentVolume = --this.channel4EnvelopeVolume << this.channel4VolumeShifter;
            this.channel4EnvelopeSweeps = this.channel4EnvelopeSweepsLast;
            this.cacheChannel4Update();
          } else {
            this.channel4EnvelopeSweepsLast = -1;
          }
        } else if (this.channel4EnvelopeVolume < 15) {
          this.channel4CurrentVolume = ++this.channel4EnvelopeVolume << this.channel4VolumeShifter;
          this.channel4EnvelopeSweeps = this.channel4EnvelopeSweepsLast;
          this.cacheChannel4Update();
        } else {
          this.channel4EnvelopeSweepsLast = -1;
        }
      }
    }
  }
  performChannel1AudioSweepDummy() {
    if (this.channel1.frequencySweepDivider > 0) {
      if (!this.channel1.decreaseSweep) {
        const channel1ShadowFrequency = this.channel1.shadowFrequency + (this.channel1.shadowFrequency >> this.channel1.frequencySweepDivider);
        if (channel1ShadowFrequency <= 2047) {
          if (channel1ShadowFrequency + (channel1ShadowFrequency >> this.channel1.frequencySweepDivider) > 2047) {
            this.channel1.sweepFault = true;
            this.channel1.checkEnabled();
            this.memory[65318] &= 254;
          }
        } else {
          this.channel1.sweepFault = true;
          this.channel1.checkEnabled();
          this.memory[65318] &= 254;
        }
      }
    }
  }
  audioComputeSequencer() {
    switch (this.sequencePosition++) {
      case 0:
        this.clockAudioLength();
        break;
      case 2:
        this.clockAudioLength();
        this.clockAudioSweep();
        break;
      case 4:
        this.clockAudioLength();
        break;
      case 6:
        this.clockAudioLength();
        this.clockAudioSweep();
        break;
      case 7:
        this.clockAudioEnvelope();
        this.sequencePosition = 0;
    }
  }
  clockAudioLength() {
    this.channel1.length(254);
    this.channel2.length(253);
    if (this.channel3TotalLength > 1) {
      --this.channel3TotalLength;
    } else if (this.channel3TotalLength === 1) {
      this.channel3TotalLength = 0;
      this.checkChannel3Enable();
      this.memory[65318] &= 251;
    }
    if (this.channel4TotalLength > 1) {
      --this.channel4TotalLength;
    } else if (this.channel4TotalLength === 1) {
      this.channel4TotalLength = 0;
      this.checkChannel4Enable();
      this.memory[65318] &= 247;
    }
  }
  clockAudioSweep() {
    this.channel1.sweep();
  }
  computeChannels() {
    this.channel1.frequencyCounter -= this.audioClocksUntilNextEvent;
    this.channel2.frequencyCounter -= this.audioClocksUntilNextEvent;
    this.channel3Counter -= this.audioClocksUntilNextEvent;
    this.channel4Counter -= this.audioClocksUntilNextEvent;
    if (this.channel1.frequencyCounter === 0) {
      this.channel1.frequencyCounter = this.channel1.frequencyTracker;
      this.channel1.dutyTracker = this.channel1.dutyTracker + 1 & 7;
      this.channel1.setThirdStageSamples();
      this.cacheMixerOutputLevel();
    }
    if (this.channel2.frequencyCounter === 0) {
      this.channel2.frequencyCounter = this.channel2.frequencyTracker;
      this.channel2.dutyTracker = this.channel2.dutyTracker + 1 & 7;
      this.channel2.setThirdStageSamples();
      this.cacheMixerOutputLevel();
    }
    if (this.channel3Counter === 0) {
      if (this.channel3CanPlay) {
        this.channel3LastSampleLookup = this.channel3LastSampleLookup + 1 & 31;
      }
      this.channel3Counter = this.channel3FrequencyPeriod;
      this.cacheChannel3Update();
    }
    if (this.channel4Counter === 0) {
      this.channel4LastSampleLookup = this.channel4LastSampleLookup + 1 & this.channel4BitRange;
      this.channel4Counter = this.channel4FrequencyPeriod;
      this.cacheChannel4Update();
    }
    this.audioClocksUntilNextEventCounter = this.audioClocksUntilNextEvent = Math.min(
      this.channel1.frequencyCounter,
      this.channel2.frequencyCounter,
      this.channel3Counter,
      this.channel4Counter
    );
  }
  cacheChannel3Update() {
    this.cachedChannel3Sample = this.channel3PcmData[this.channel3LastSampleLookup] >> this.channel3PatternType;
    this.cacheChannel3OutputLevel();
  }
  checkChannel3Enable() {
    this.channel3Enabled = this.channel3Consecutive || this.channel3TotalLength > 0;
    this.channel3OutputLevelSecondaryCache();
  }
  cacheChannel3OutputLevel() {
    this.channel3CurrentSampleLeft = this.leftChannel3 ? this.cachedChannel3Sample : 0;
    this.channel3CurrentSampleRight = this.rightChannel3 ? this.cachedChannel3Sample : 0;
    this.channel3OutputLevelSecondaryCache();
  }
  channel3OutputLevelSecondaryCache() {
    if (this.channel3Enabled && settings_default.enabledAudioChannels[2]) {
      this.channel3CurrentSampleLeftSecondary = this.channel3CurrentSampleLeft;
      this.channel3CurrentSampleRightSecondary = this.channel3CurrentSampleRight;
    } else {
      this.channel3CurrentSampleLeftSecondary = 0;
      this.channel3CurrentSampleRightSecondary = 0;
    }
    this.cacheMixerOutputLevel();
  }
  checkChannel4Enable() {
    this.channel4Enabled = (this.channel4Consecutive || this.channel4TotalLength > 0) && this.channel4CanPlay;
    this.cacheChannel4OutputLevelSecondary();
  }
  cacheChannel4Update() {
    this.cachedChannel4Sample = this.noiseSampleTable[this.channel4CurrentVolume | this.channel4LastSampleLookup];
    this.cacheChannel4OutputLevel();
  }
  cacheChannel4OutputLevel() {
    this.channel4CurrentSampleLeft = this.leftChannel4 ? this.cachedChannel4Sample : 0;
    this.channel4CurrentSampleRight = this.rightChannel4 ? this.cachedChannel4Sample : 0;
    this.cacheChannel4OutputLevelSecondary();
  }
  checkChannel4VolumeEnable() {
    this.channel4CanPlay = this.memory[65313] > 7;
    this.checkChannel4Enable();
    this.cacheChannel4OutputLevelSecondary();
  }
  cacheChannel4OutputLevelSecondary() {
    if (this.channel4Enabled && settings_default.enabledAudioChannels[3]) {
      this.channel4CurrentSampleLeftSecondary = this.channel4CurrentSampleLeft;
      this.channel4CurrentSampleRightSecondary = this.channel4CurrentSampleRight;
    } else {
      this.channel4CurrentSampleLeftSecondary = 0;
      this.channel4CurrentSampleRightSecondary = 0;
    }
    this.cacheMixerOutputLevel();
  }
  cacheMixerOutputLevel() {
    const currentLeftSample = this.channel1.currentSampleLeftTrimary + this.channel2.currentSampleLeftTrimary + this.channel3CurrentSampleLeftSecondary + this.channel4CurrentSampleLeftSecondary;
    const currentRightSample = this.channel1.currentSampleRightTrimary + this.channel2.currentSampleRightTrimary + this.channel3CurrentSampleRightSecondary + this.channel4CurrentSampleRightSecondary;
    this.mixerOutputCache = currentLeftSample * this.cartridgeLeftChannelInputVolume << 16 | currentRightSample * this.cartridgeRightChannelInputVolume;
  }
  connectDevice(device) {
    this.resamplerFirstPassFactor = Math.max(
      Math.min(
        Math.floor(this.cpu.clocksPerSecond / 44100),
        Math.floor(65535 / 480)
      ),
      1
    );
    this.downSampleInputDivider = 1 / (this.resamplerFirstPassFactor * 240);
    const sampleRate = this.cpu.clocksPerSecond / this.resamplerFirstPassFactor;
    const maxBufferSize = Math.max(
      this.cpu.baseCyclesPerIteration * settings_default.maxAudioBufferSpanAmountOverXInterpreterIterations / this.resamplerFirstPassFactor,
      8192
    ) << 1;
    device.setSampleRate(sampleRate);
    device.setMaxBufferSize(maxBufferSize);
    device.init();
    this.device = device;
    this.audioIndex = 0;
    this.bufferPosition = 0;
    this.downsampleInput = 0;
    this.bufferContainAmount = Math.max(this.cpu.baseCyclesPerIteration * settings_default.minAudioBufferSpanAmountOverXInterpreterIterations / this.resamplerFirstPassFactor, 4096) << 1;
    this.bufferLength = this.cpu.baseCyclesPerIteration / this.resamplerFirstPassFactor << 1;
    this.buffer = new Float32Array(this.bufferLength);
  }
  setVolume(volume) {
    this.device?.setVolume(volume);
  }
  adjustUnderrun() {
    let underrunAmount = this.device.remainingBuffer();
    if (typeof underrunAmount === "number") {
      underrunAmount = this.bufferContainAmount - Math.max(underrunAmount, 0);
      if (underrunAmount > 0) {
        this.recalculateIterationClockLimitForAudio((underrunAmount >> 1) * this.resamplerFirstPassFactor);
      }
    }
  }
  recalculateIterationClockLimitForAudio(audioClocking) {
    this.cpu.cyclesTotal += Math.min(audioClocking >> 2 << 2, this.cpu.cyclesTotalBase << 1);
  }
  outputAudio() {
    this.fillBuffer();
    if (this.bufferPosition === this.bufferLength) {
      this.device.writeAudio(this.buffer);
      this.bufferPosition = 0;
    }
    this.downsampleInput = 0;
  }
  fillBuffer() {
    this.buffer[this.bufferPosition++] = (this.downsampleInput >>> 16) * this.downSampleInputDivider - 1;
    this.buffer[this.bufferPosition++] = (this.downsampleInput & 65535) * this.downSampleInputDivider - 1;
  }
  generateWhiteNoise() {
    this.LSFR7Table = this.generateLSFR7Table();
    this.LSFR15Table = this.generateLSFR15Table();
    this.noiseSampleTable = this.LSFR15Table;
  }
  generateLSFR7Table() {
    const LSFR7Table = new Int8Array(2048);
    let LSFR = 127;
    for (let index = 0; index < 128; ++index) {
      const randomFactor = 1 - (LSFR & 1);
      LSFR7Table[128 | index] = randomFactor;
      LSFR7Table[256 | index] = randomFactor * 2;
      LSFR7Table[384 | index] = randomFactor * 3;
      LSFR7Table[512 | index] = randomFactor * 4;
      LSFR7Table[640 | index] = randomFactor * 5;
      LSFR7Table[768 | index] = randomFactor * 6;
      LSFR7Table[896 | index] = randomFactor * 7;
      LSFR7Table[1024 | index] = randomFactor * 8;
      LSFR7Table[1152 | index] = randomFactor * 9;
      LSFR7Table[1280 | index] = randomFactor * 10;
      LSFR7Table[1408 | index] = randomFactor * 11;
      LSFR7Table[1536 | index] = randomFactor * 12;
      LSFR7Table[1664 | index] = randomFactor * 13;
      LSFR7Table[1792 | index] = randomFactor * 14;
      LSFR7Table[1920 | index] = randomFactor * 15;
      const LSFRShifted = LSFR >> 1;
      LSFR = LSFRShifted | ((LSFRShifted ^ LSFR) & 1) << 6;
    }
    return LSFR7Table;
  }
  generateLSFR15Table() {
    const LSFR15Table = new Int8Array(524288);
    let LSFR = 32767;
    for (let index = 0; index < 32768; ++index) {
      const randomFactor = 1 - (LSFR & 1);
      LSFR15Table[32768 | index] = randomFactor;
      LSFR15Table[65536 | index] = randomFactor * 2;
      LSFR15Table[98304 | index] = randomFactor * 3;
      LSFR15Table[131072 | index] = randomFactor * 4;
      LSFR15Table[163840 | index] = randomFactor * 5;
      LSFR15Table[196608 | index] = randomFactor * 6;
      LSFR15Table[229376 | index] = randomFactor * 7;
      LSFR15Table[262144 | index] = randomFactor * 8;
      LSFR15Table[294912 | index] = randomFactor * 9;
      LSFR15Table[327680 | index] = randomFactor * 10;
      LSFR15Table[360448 | index] = randomFactor * 11;
      LSFR15Table[393216 | index] = randomFactor * 12;
      LSFR15Table[425984 | index] = randomFactor * 13;
      LSFR15Table[458752 | index] = randomFactor * 14;
      LSFR15Table[491520 | index] = randomFactor * 15;
      const LSFRShifted = LSFR >> 1;
      LSFR = LSFRShifted | ((LSFRShifted ^ LSFR) & 1) << 14;
    }
    return LSFR15Table;
  }
  registerMemoryWriters() {
    this.gameboy.highMemoryWriter[16] = this.gameboy.memoryWriter[65296] = (address, data) => {
      if (this.enabled) {
        this.run();
        this.channel1.setSweep(data);
        this.memory[65296] = data;
        this.channel1.checkEnabled();
      }
    };
    this.gameboy.highMemoryWriter[17] = this.gameboy.memoryWriter[65297] = (address, data) => {
      if (this.enabled || !this.gameboy.cartridge.useGbcMode) {
        if (this.enabled) {
          this.run();
        } else {
          data &= 63;
        }
        this.channel1.setDuty(data);
        this.channel1.setLength(data);
        this.memory[65297] = data;
        this.channel1.checkEnabled();
      }
    };
    this.gameboy.highMemoryWriter[18] = this.gameboy.memoryWriter[65298] = (address, data) => {
      if (this.enabled) {
        this.run();
        this.channel1.setEnvelopeVolume(65298, data);
        this.channel1.setEnvelopeType(data);
        this.memory[65298] = data;
        this.channel1.checkVolumeEnabled();
      }
    };
    this.gameboy.highMemoryWriter[19] = this.gameboy.memoryWriter[65299] = (address, data) => {
      if (this.enabled) {
        this.run();
        this.channel1.setFrequency(data);
      }
    };
    this.gameboy.highMemoryWriter[20] = this.gameboy.memoryWriter[65300] = (address, data) => {
      if (this.enabled) {
        this.run();
        this.channel1.consecutive = (data & 64) === 0;
        this.channel1.setHighFrequency(data);
        if (data > 127) {
          this.channel1.timeSweep = this.channel1.lastTimeSweep;
          this.channel1.swept = false;
          var nr12 = this.memory[65298];
          this.channel1.envelopeVolume = nr12 >> 4;
          this.channel1.setFirstStageSamples();
          this.channel1.setSecondStageSamples();
          this.channel1.setThirdStageSamples();
          this.cacheMixerOutputLevel();
          this.channel1.envelopeSweepsLast = (nr12 & 7) - 1;
          if (this.channel1.totalLength === 0) {
            this.channel1.totalLength = 64;
          }
          if (this.channel1.lastTimeSweep > 0 || this.channel1.frequencySweepDivider > 0) {
            this.memory[65318] |= 1;
          } else {
            this.memory[65318] &= 254;
          }
          if ((data & 64) === 64) {
            this.memory[65318] |= 1;
          }
          this.channel1.shadowFrequency = this.channel1.frequency;
          this.channel1.sweepFault = false;
          this.performChannel1AudioSweepDummy();
        }
        this.channel1.checkEnabled();
        this.memory[65300] = data;
      }
    };
    this.gameboy.highMemoryWriter[21] = this.gameboy.memoryWriter[65301] = this.gameboy.memoryNew.writeIllegal;
    this.gameboy.highMemoryWriter[22] = this.gameboy.memoryWriter[65302] = (address, data) => {
      if (this.enabled || !this.gameboy.cartridge.useGbcMode) {
        if (this.enabled) {
          this.run();
        } else {
          data &= 63;
        }
        this.channel2.setDuty(data);
        this.channel2.setLength(data);
        this.memory[65302] = data;
        this.channel2.checkEnabled();
      }
    };
    this.gameboy.highMemoryWriter[23] = this.gameboy.memoryWriter[65303] = (address, data) => {
      if (this.enabled) {
        this.run();
        this.channel2.setEnvelopeVolume(65303, data);
        this.channel2.setEnvelopeType(data);
        this.memory[65303] = data;
        this.channel2.checkVolumeEnabled();
      }
    };
    this.gameboy.highMemoryWriter[24] = this.gameboy.memoryWriter[65304] = (address, data) => {
      if (this.enabled) {
        this.run();
        this.channel2.setFrequency(data);
      }
    };
    this.gameboy.highMemoryWriter[25] = this.gameboy.memoryWriter[65305] = (address, data) => {
      if (this.enabled) {
        this.run();
        if (data > 127) {
          const nr22 = this.memory[65303];
          this.channel2.envelopeVolume = nr22 >> 4;
          this.channel2.setFirstStageSamples();
          this.channel2.setSecondStageSamples();
          this.channel2.setThirdStageSamples();
          this.cacheMixerOutputLevel();
          this.channel2.envelopeSweepsLast = (nr22 & 7) - 1;
          if (this.channel2.totalLength === 0) {
            this.channel2.totalLength = 64;
          }
          if ((data & 64) === 64) {
            this.memory[65318] |= 2;
          }
        }
        this.channel2.consecutive = (data & 64) === 0;
        this.channel2.setHighFrequency(data);
        this.memory[65305] = data;
        this.channel2.checkEnabled();
      }
    };
    this.gameboy.highMemoryWriter[26] = this.gameboy.memoryWriter[65306] = (address, data) => {
      if (this.enabled) {
        this.run();
        if (!this.channel3CanPlay && data >= 128) {
          this.channel3LastSampleLookup = 0;
          this.cacheChannel3Update();
        }
        this.channel3CanPlay = data > 127;
        if (this.channel3CanPlay && this.memory[65306] > 127 && !this.channel3Consecutive) {
          this.memory[65318] |= 4;
        }
        this.memory[65306] = data;
      }
    };
    this.gameboy.highMemoryWriter[27] = this.gameboy.memoryWriter[65307] = (address, data) => {
      if (this.enabled || !this.gameboy.cartridge.useGbcMode) {
        if (this.enabled) {
          this.run();
        }
        this.channel3TotalLength = 256 - data;
        this.checkChannel3Enable();
      }
    };
    this.gameboy.highMemoryWriter[28] = this.gameboy.memoryWriter[65308] = (address, data) => {
      if (this.enabled) {
        this.run();
        data &= 96;
        this.memory[65308] = data;
        this.channel3PatternType = data === 0 ? 4 : (data >> 5) - 1;
      }
    };
    this.gameboy.highMemoryWriter[29] = this.gameboy.memoryWriter[65309] = (address, data) => {
      if (this.enabled) {
        this.run();
        this.channel3frequency = this.channel3frequency & 1792 | data;
        this.channel3FrequencyPeriod = 2048 - this.channel3frequency << 1;
      }
    };
    this.gameboy.highMemoryWriter[30] = this.gameboy.memoryWriter[65310] = (address, data) => {
      if (this.enabled) {
        this.run();
        if (data > 127) {
          if (this.channel3TotalLength === 0) {
            this.channel3TotalLength = 256;
          }
          this.channel3LastSampleLookup = 0;
          if ((data & 64) === 64) {
            this.memory[65318] |= 4;
          }
        }
        this.channel3Consecutive = (data & 64) === 0;
        this.channel3frequency = (data & 7) << 8 | this.channel3frequency & 255;
        this.channel3FrequencyPeriod = 2048 - this.channel3frequency << 1;
        this.memory[65310] = data;
        this.checkChannel3Enable();
      }
    };
    this.gameboy.highMemoryWriter[31] = this.gameboy.memoryWriter[65311] = this.gameboy.memoryNew.writeIllegal;
    this.gameboy.highMemoryWriter[32] = this.gameboy.memoryWriter[65312] = (address, data) => {
      if (this.enabled || !this.gameboy.cartridge.useGbcMode) {
        if (this.enabled) {
          this.run();
        }
        this.channel4TotalLength = 64 - (data & 63);
        this.checkChannel4Enable();
      }
    };
    this.gameboy.highMemoryWriter[33] = this.gameboy.memoryWriter[65313] = (address, data) => {
      if (this.enabled) {
        this.run();
        if (this.channel4Enabled && this.channel4EnvelopeSweeps === 0) {
          if (((this.memory[65313] ^ data) & 8) === 8) {
            if ((this.memory[65313] & 8) === 0) {
              if ((this.memory[65313] & 7) === 7) {
                this.channel4EnvelopeVolume += 2;
              } else {
                ++this.channel4EnvelopeVolume;
              }
            }
            this.channel4EnvelopeVolume = 16 - this.channel4EnvelopeVolume & 15;
          } else if ((this.memory[65313] & 15) === 8) {
            this.channel4EnvelopeVolume = 1 + this.channel4EnvelopeVolume & 15;
          }
          this.channel4CurrentVolume = this.channel4EnvelopeVolume << this.channel4VolumeShifter;
        }
        this.channel4EnvelopeType = (data & 8) === 8;
        this.memory[65313] = data;
        this.cacheChannel4Update();
        this.checkChannel4VolumeEnable();
      }
    };
    this.gameboy.highMemoryWriter[34] = this.gameboy.memoryWriter[65314] = (address, data) => {
      if (this.enabled) {
        this.run();
        this.channel4FrequencyPeriod = Math.max((data & 7) << 4, 8) << (data >> 4);
        var bitWidth = data & 8;
        if (bitWidth === 8 && this.channel4BitRange === 32767 || bitWidth === 0 && this.channel4BitRange === 127) {
          this.channel4LastSampleLookup = 0;
          this.channel4BitRange = bitWidth === 8 ? 127 : 32767;
          this.channel4VolumeShifter = bitWidth === 8 ? 7 : 15;
          this.channel4CurrentVolume = this.channel4EnvelopeVolume << this.channel4VolumeShifter;
          this.noiseSampleTable = bitWidth === 8 ? this.LSFR7Table : this.LSFR15Table;
        }
        this.memory[65314] = data;
        this.cacheChannel4Update();
      }
    };
    this.gameboy.highMemoryWriter[35] = this.gameboy.memoryWriter[65315] = (address, data) => {
      if (this.enabled) {
        this.run();
        this.memory[65315] = data;
        this.channel4Consecutive = (data & 64) === 0;
        if (data > 127) {
          var nr42 = this.memory[65313];
          this.channel4EnvelopeVolume = nr42 >> 4;
          this.channel4CurrentVolume = this.channel4EnvelopeVolume << this.channel4VolumeShifter;
          this.channel4EnvelopeSweepsLast = (nr42 & 7) - 1;
          if (this.channel4TotalLength === 0) {
            this.channel4TotalLength = 64;
          }
          if ((data & 64) === 64) {
            this.memory[65318] |= 8;
          }
        }
        this.checkChannel4Enable();
      }
    };
    this.gameboy.memoryNew.setWriter(soundChannelVolumeControlAddress, this.channelVolumeControlWriter);
    this.gameboy.memoryNew.setHighWriter(soundChannelVolumeControlAddress, this.channelVolumeControlWriter);
    this.gameboy.highMemoryWriter[37] = this.gameboy.memoryWriter[65317] = (address, data) => {
      if (this.enabled && this.memory[65317] !== data) {
        this.run();
        this.memory[65317] = data;
        this.channel1.rightChannelEnabled = (data & 1) === 1;
        this.channel2.rightChannelEnabled = (data & 2) === 2;
        this.rightChannel3 = (data & 4) === 4;
        this.rightChannel4 = (data & 8) === 8;
        this.channel1.leftChannelEnabled = (data & 16) === 16;
        this.channel2.leftChannelEnabled = (data & 32) === 32;
        this.leftChannel3 = (data & 64) === 64;
        this.leftChannel4 = data > 127;
        this.channel1.setFirstStageSamples();
        this.channel1.setSecondStageSamples();
        this.channel1.setThirdStageSamples();
        this.cacheMixerOutputLevel();
        this.channel2.setFirstStageSamples();
        this.channel2.setSecondStageSamples();
        this.channel2.setThirdStageSamples();
        this.cacheMixerOutputLevel();
        this.cacheChannel3OutputLevel();
        this.cacheChannel4OutputLevel();
      }
    };
    this.gameboy.highMemoryWriter[38] = this.gameboy.memoryWriter[65318] = (address, data) => {
      this.run();
      const action = data > 127 ? "Enable" : "Disable";
      if (!this.enabled && action === "Enable") {
        this.enable();
      } else if (this.enabled && action === "Disable") {
        this.disable();
      }
    };
  }
  registerWaveformMemoryWriters() {
    this.gameboy.highMemoryWriter[48] = this.gameboy.memoryWriter[65328] = (address, data) => {
      this.writeWaveformRam(0, data);
    };
    this.gameboy.highMemoryWriter[49] = this.gameboy.memoryWriter[65329] = (address, data) => {
      this.writeWaveformRam(1, data);
    };
    this.gameboy.highMemoryWriter[50] = this.gameboy.memoryWriter[65330] = (address, data) => {
      this.writeWaveformRam(2, data);
    };
    this.gameboy.highMemoryWriter[51] = this.gameboy.memoryWriter[65331] = (address, data) => {
      this.writeWaveformRam(3, data);
    };
    this.gameboy.highMemoryWriter[52] = this.gameboy.memoryWriter[65332] = (address, data) => {
      this.writeWaveformRam(4, data);
    };
    this.gameboy.highMemoryWriter[53] = this.gameboy.memoryWriter[65333] = (address, data) => {
      this.writeWaveformRam(5, data);
    };
    this.gameboy.highMemoryWriter[54] = this.gameboy.memoryWriter[65334] = (address, data) => {
      this.writeWaveformRam(6, data);
    };
    this.gameboy.highMemoryWriter[55] = this.gameboy.memoryWriter[65335] = (address, data) => {
      this.writeWaveformRam(7, data);
    };
    this.gameboy.highMemoryWriter[56] = this.gameboy.memoryWriter[65336] = (address, data) => {
      this.writeWaveformRam(8, data);
    };
    this.gameboy.highMemoryWriter[57] = this.gameboy.memoryWriter[65337] = (address, data) => {
      this.writeWaveformRam(9, data);
    };
    this.gameboy.highMemoryWriter[58] = this.gameboy.memoryWriter[65338] = (address, data) => {
      this.writeWaveformRam(10, data);
    };
    this.gameboy.highMemoryWriter[59] = this.gameboy.memoryWriter[65339] = (address, data) => {
      this.writeWaveformRam(11, data);
    };
    this.gameboy.highMemoryWriter[60] = this.gameboy.memoryWriter[65340] = (address, data) => {
      this.writeWaveformRam(12, data);
    };
    this.gameboy.highMemoryWriter[61] = this.gameboy.memoryWriter[65341] = (address, data) => {
      this.writeWaveformRam(13, data);
    };
    this.gameboy.highMemoryWriter[62] = this.gameboy.memoryWriter[65342] = (address, data) => {
      this.writeWaveformRam(14, data);
    };
    this.gameboy.highMemoryWriter[63] = this.gameboy.memoryWriter[65343] = (address, data) => {
      this.writeWaveformRam(15, data);
    };
  }
  writeWaveformRam(address, data) {
    if (this.channel3CanPlay) {
      this.run();
    }
    this.memory[65328 | address] = data;
    address <<= 1;
    this.channel3PcmData[address] = data >> 4;
    this.channel3PcmData[address | 1] = data & 15;
  }
  channelVolumeControlWriter = (address, data) => {
    if (!this.enabled || this.memory[soundChannelVolumeControlAddress] === data) return;
    this.run();
    this.memory[soundChannelVolumeControlAddress] = data;
    this.cartridgeLeftChannelInputVolume = (data >> 4 & 7) + 1;
    this.cartridgeRightChannelInputVolume = (data & 7) + 1;
    this.cacheMixerOutputLevel();
  };
};

// vendor/jsgbc-core/src/GameBoy.ts
var actions = [
  "Right",
  "Left",
  "Up",
  "Down",
  "A",
  "B",
  "Select",
  "Start"
];
var GameBoy = class extends EventEmitter {
  interval;
  debouncedAutoSave;
  core;
  isOn;
  actions;
  storage;
  cartridge;
  lastRun;
  // Graphics Variables
  midScanlineOffset = -1;
  //mid-scanline rendering offset.
  currentX = 0;
  //The x-coord we left off at for mid-scanline rendering.
  stopEmulator = 3;
  // Has the emulation been paused or a frame has ended?
  matchedIrqLines = 0;
  // CPU IRQ assertion.
  ROMBank1Offset;
  haltPostClocks;
  spriteCount = 252;
  // Mode 3 extra clocking counter (Depends on how many sprites are on the current line.).
  BGCHRCurrentBank;
  // BG Tile Pointer Caches:
  tileCache;
  // Tile Data Cache
  colors = [15728606, 11392916, 5411443, 1586242];
  // "Classic" GameBoy palette colors.
  OBJPalette;
  backgroundPalette;
  updateGBBGPalette;
  updateGBOBJPalette;
  pixelStart = 0;
  // Temp variable for holding the current working framebuffer offset.
  pixelEnd = 0;
  // track the x-coord limit for line rendering (mid-scanline usage).
  memory;
  isBootingRom = true;
  videoRam;
  gbcMemory;
  frameBuffer;
  BGCHRBank1;
  registerA;
  registerB;
  registerC;
  registerD;
  registerE;
  FZero;
  FSubtract;
  FHalfCarry;
  FCarry;
  registersHL;
  programCounter;
  stackPointer;
  IME;
  interruptRequestedFlags;
  interruptEnabledFlags;
  hdmaRunning;
  currentInstructionCycleCount;
  STATTracker;
  modeSTAT;
  LYCMatchTriggerSTAT;
  mode2TriggerSTAT;
  mode1TriggerSTAT;
  mode0TriggerSTAT;
  DIVTicks;
  LCDTicks;
  timerTicks;
  TIMAEnabled;
  TACClocker;
  serialTimer;
  serialShiftTimer;
  serialShiftTimerAllocated;
  IRQEnableDelay;
  actualScanline;
  lastUnrenderedLine;
  gfxWindowDisplay;
  gfxSpriteShow;
  gfxSpriteNormalHeight;
  backgroundEnabled;
  hasBackgroundPriority;
  gfxWindowCHRBankPosition;
  gfxBackgroundCHRBankPosition;
  gfxBackgroundBankOffset;
  windowY;
  windowX;
  drewBlank;
  halt;
  skipPCIncrement;
  doubleSpeedShifter;
  colorizedGBPalettes;
  backgroundX;
  gbcOBJRawPalette;
  gbcBGRawPalette;
  gbcOBJPalette;
  gbcBGPalette;
  BGCHRBank2;
  currentVideoRamBank;
  gbOBJPalette;
  gbBGPalette;
  sortBuffer;
  OAMAddressCache;
  gbBGColorizedPalette;
  gbOBJColorizedPalette;
  cachedBGPaletteConversion;
  cachedOBJPaletteConversion;
  backgroundY;
  queuedScanlines;
  remainingClocks;
  gbcRamBankPosition;
  gbcEchoRamBankPosition;
  gbcRamBank;
  stateManager;
  lcdDevice;
  joypad;
  audioController;
  audioDevice;
  cpu;
  gpu;
  memoryNew;
  usedBootRom;
  gbBootRom;
  gbcBootRom;
  usedGbcBootRom;
  memoryReader = [];
  // Array of functions mapped to read back memory
  memoryWriter = [];
  // Array of functions mapped to write to memory
  highMemoryReader = [];
  // Array of functions mapped to read back 0xFFXX memory
  highMemoryWriter = [];
  // Array of functions mapped to write to 0xFFXX memory
  constructor(options = {}) {
    super();
    this.debouncedAutoSave = debounce(
      this.autoSave.bind(this),
      100
    );
    this.addListener("mbcRamWrite", () => {
      if (!this.cartridge) return;
      this.debouncedAutoSave();
    });
    this.isOn = false;
    this.actions = new Actions();
    this.registerActions();
    if (typeof document !== "undefined") {
      this.storage = new LocalStorage();
    } else {
      this.storage = new MemoryStorage();
    }
    this.cpu = new CPU();
    this.gpu = new GPU(this);
    this.audioDevice = new AudioDevice({
      context: options.audio?.context,
      channels: 2
    });
    this.audioController = new AudioController({
      cpu: this.cpu,
      gameboy: this
    });
    this.joypad = new Joypad(this);
    this.lcdDevice = new LCD(
      this,
      options.lcd
    );
    this.stateManager = new StateManager(this);
    this.stateManager.init();
    this.updateGBBGPalette = this.updateGBRegularBGPalette;
    this.updateGBOBJPalette = this.updateGBRegularOBJPalette;
  }
  isPaused() {
    return typeof document !== "undefined" && document.hidden;
  }
  setStorage(storage) {
    this.storage = storage;
  }
  registerActions() {
    for (const action of actions) {
      const index = actions.indexOf(action);
      this.actions.register(action).addListener("Down" + action, () => {
        this.joypad.down(index);
      }).addListener("Up" + action, () => {
        this.joypad.up(index);
      });
    }
    this.actions.register("Speed").addListener("DownSpeed", (options) => this.handleSpeed(options)).addListener("ChangeSpeed", (options) => this.handleSpeed(options)).addListener("UpSpeed", () => {
      this.setSpeed(1);
    });
  }
  handleSpeed(options) {
    let multiplier = 2;
    if (options && typeof options.value === "number") {
      multiplier = options.value * 2 + 1;
    }
    this.setSpeed(multiplier);
  }
  turnOn() {
    if (this.isOn) return;
    this.isOn = true;
    this.start(this.cartridge);
    this.stopEmulator = 1;
    this.requestFrame(this.frameHandler);
  }
  frameHandler = (now) => {
    if (this.isPaused()) return;
    if (!this.lastRun || this.lastRun < now - settings_default.runInterval) {
      this.run();
      this.lastRun = now;
    }
    this.requestFrame(this.frameHandler);
  };
  turnOff() {
    if (!this.isOn) return;
    this.isOn = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  restart() {
    this.turnOff();
    this.turnOn();
  }
  setGbBootRom(rom2) {
    if (!(rom2 instanceof ROM)) {
      rom2 = new ROM(rom2);
    }
    this.gbBootRom = rom2;
  }
  setGbcBootRom(rom2) {
    if (!(rom2 instanceof ROM)) {
      rom2 = new ROM(rom2);
    }
    this.gbcBootRom = rom2;
  }
  replaceCartridge(cartridge) {
    this.turnOff();
    this.removeCartridge();
    this.insertCartridge(cartridge);
    this.turnOn();
  }
  removeCartridge() {
    this.cartridge = null;
  }
  insertCartridge(cartridge) {
    if (!(cartridge instanceof Cartridge)) {
      cartridge = new Cartridge(cartridge);
    }
    this.cartridge = cartridge;
  }
  actionDown(action, options) {
    this.actions.down(action, options);
  }
  actionChange(action, options) {
    this.actions.change(action, options);
  }
  actionUp(action, options) {
    this.actions.up(action, options);
  }
  autoSave() {
    this.saveRam();
    this.saveRtc();
  }
  async saveState(state) {
    if (!this.storage || !this.cartridge) return;
    const name = this.cartridge.name;
    if (!state) {
      state = this.stateManager.get();
      if (!state) return false;
    }
    await this.storage.setState(name, state);
    this.emit("stateSaved", { name, state });
  }
  async saveRam(ram) {
    if (!this.storage || !this.cartridge?.mbc) return;
    const name = this.cartridge.name;
    if (!ram) {
      ram = this.cartridge.mbc.getRam();
      if (!ram) return false;
    }
    await this.storage.setRam(name, ram.buffer);
    this.emit("ramSaved", { name, ram });
  }
  async saveRtc(rtc) {
    if (!this.storage || !this.cartridge?.mbc?.rtc) return;
    const name = this.cartridge.name;
    if (!rtc) {
      rtc = this.cartridge.mbc.rtc.get();
      if (!rtc) return false;
    }
    await this.storage.setRtc(name, rtc.buffer);
    this.emit("rtcSaved", { name, rtc });
  }
  loadState(state) {
    if (!this.storage || !this.cartridge) return;
    const name = this.cartridge.name;
    if (!state) {
      state = this.storage.getState(name);
      if (!state) return false;
    }
    this.stateManager.load(state);
    this.initReferencesFromSaveState();
    this.memoryNew.init();
    this.lcdDevice.init();
    this.audioController.noiseSampleTable = this.audioController.channel4BitRange === 32767 ? this.audioController.LSFR15Table : this.audioController.LSFR7Table;
    this.audioController.channel4VolumeShifter = this.audioController.channel4BitRange === 32767 ? 15 : 7;
    this.emit("stateLoaded", { name, state });
  }
  loadRam(ram) {
    if (!this.storage || !this.cartridge) return;
    const name = this.cartridge.name;
    if (!ram) {
      ram = this.storage.getRam(name);
      if (!ram) return false;
      ram = new Uint8Array(ram);
    }
    this.cartridge.mbc.loadRam(ram);
    this.emit("ramLoaded", { name, ram });
  }
  loadRtc(rtc) {
    if (!this.storage || !this.core?.cartridge?.hasRtc) return;
    const name = this.cartridge.name;
    if (!rtc) {
      rtc = this.storage.getRtc(name);
      if (!rtc) return false;
      rtc = new Uint32Array(rtc);
    }
    this.cartridge.mbc.rtc.load(rtc);
    this.emit("rtcLoaded", { name, rtc });
  }
  getBatteryFileArrayBuffer() {
    if (!this.cartridge?.mbc) return;
    const ram = this.cartridge.mbc.getRam();
    const rtc = this.cartridge.mbc.rtc?.get();
    return rtc ? concatArrayBuffers(ram.buffer, rtc.buffer) : ram.buffer;
  }
  async loadBatteryFileArrayBuffer(data) {
    if (!this.cartridge?.mbc) return;
    const ram = this.cartridge.mbc.cutSRAMFromBatteryFileArray(data);
    const rtc = this.cartridge.mbc.rtc?.cutBatteryFileArray(data);
    this.cartridge.mbc.loadRam(ram);
    if (rtc) this.cartridge.mbc.rtc.load(rtc);
    await this.saveRam(ram);
    if (rtc) await this.saveRtc(rtc);
    this.restart();
  }
  requestFrame(fn) {
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(fn);
    } else {
      const now = (typeof performance !== "undefined" ? performance : Date).now();
      setTimeout(() => fn(now), 0);
    }
  }
  connectCartridge(cartridge) {
    this.cartridge?.mbc?.removeListener("rumble", this.rumble)?.removeListener("ramWrite", this.onMbcRamWrite);
    this.cartridge?.disconnect();
    cartridge.connect(this);
    cartridge.interpret();
    cartridge.mbc?.addListener("rumble", this.rumble)?.addListener("ramWrite", this.onMbcRamWrite);
    cartridge.mbc?.setupRom();
    this.cartridge = cartridge;
    this.loadCartridgeRomIntoMemory();
    if (this.gbcBootRom) this.loadGbcBootRomIntoMemory();
    else if (this.gbBootRom) this.loadGbBootRomIntoMemory();
  }
  rumble() {
    if (typeof window !== "undefined" && "vibrate" in window.navigator) {
      window.navigator.vibrate(200);
    }
  }
  onMbcRamWrite = () => {
    this.emit("mbcRamWrite");
  };
  loadGbcBootRomIntoMemory() {
    let address = 0;
    while (address < 256) {
      this.memory[address] = this.gbcBootRom.getByte(address);
      ++address;
    }
    while (address < 512) {
      this.memory[address] = this.cartridge.rom.getByte(address);
      ++address;
    }
    while (address < 2304) {
      this.memory[address] = this.gbcBootRom.getByte(address);
      ++address;
    }
    this.usedBootRom = true;
    this.usedGbcBootRom = true;
  }
  loadGbBootRomIntoMemory() {
    let address = 0;
    while (address < 256) {
      this.memory[address] = this.gbBootRom.getByte(address);
      ++address;
    }
    this.usedBootRom = true;
  }
  loadCartridgeRomIntoMemory() {
    for (let address = 0; address < 16384; address++) {
      this.memory[address] = this.cartridge.rom.getByte(address);
    }
  }
  start(cartridge) {
    this.stateManager.init();
    this.memory = new Uint8Array(65536);
    this.audioController.setMemory(this.memory);
    this.frameBuffer = getTypedArray(23040, 16316664, "int32");
    this.BGCHRBank1 = new Uint8Array(2048);
    this.audioController.initMemory();
    this.memoryNew = new Memory(this, this.memory);
    this.lcdDevice.init();
    this.audioController.connectDevice(this.audioDevice);
    this.connectCartridge(cartridge);
    this.cartridge.setupRAM();
    if (this.cartridge.useGbcMode) {
      this.videoRam = new Uint8Array(8192);
      this.gbcMemory = new Uint8Array(28672);
    }
    this.memoryNew.init();
    if (this.cartridge.useGbcMode) {
      this.gbcOBJRawPalette = new Uint8Array(64);
      this.gbcBGRawPalette = new Uint8Array(64);
      this.gbcOBJPalette = getTypedArray(32, 16777216, "int32");
      this.gbcBGPalette = new Int32Array(64);
      this.BGCHRBank2 = new Uint8Array(2048);
      this.BGCHRCurrentBank = this.currentVideoRamBank > 0 ? this.BGCHRBank2 : this.BGCHRBank1;
      this.tileCache = this.generateCacheArray(3968);
    } else {
      this.gbOBJPalette = new Int32Array(8);
      this.gbBGPalette = new Int32Array(4);
      this.backgroundPalette = this.gbBGPalette;
      this.OBJPalette = this.gbOBJPalette;
      this.tileCache = this.generateCacheArray(1792);
      this.sortBuffer = new Uint8Array(256);
      this.OAMAddressCache = new Int32Array(10);
    }
    this.gpu.initRenderer();
    if (!this.usedBootRom) {
      this.isBootingRom = false;
      this.skipBootRom();
    } else {
      this.initBootRom();
    }
    this.checkIrqMatching();
  }
  generateCacheArray(tileAmount) {
    const tileArray = [];
    let tileNumber = 0;
    while (tileNumber < tileAmount) {
      tileArray[tileNumber++] = new Uint8Array(64);
    }
    return tileArray;
  }
  skipBootRom() {
    var index = 255;
    while (index >= 0) {
      if (index >= 48 && index < 64) {
        this.writeMemory(65280 | index, postBootRomState_default[index]);
      } else {
        switch (index) {
          case 0:
          case 1:
          case 2:
          case 5:
          case 7:
          case 15:
          case 255:
            this.writeMemory(65280 | index, postBootRomState_default[index]);
            break;
          default:
            this.memory[65280 | index] = postBootRomState_default[index];
        }
      }
      --index;
    }
    if (this.cartridge.useGbcMode) {
      this.memory[65388] = 254;
      this.memory[65396] = 254;
    } else {
      this.memory[65352] = 255;
      this.memory[65353] = 255;
      this.memory[65388] = 255;
      this.memory[65396] = 255;
    }
    console.log("Starting without the GBC boot ROM.");
    this.registerA = this.cartridge.useGbcMode ? 17 : 1;
    this.registerB = 0;
    this.registerC = 19;
    this.registerD = 0;
    this.registerE = 216;
    this.FZero = true;
    this.FSubtract = false;
    this.FHalfCarry = true;
    this.FCarry = true;
    this.registersHL = 333;
    this.gpu.enableLCD();
    this.IME = false;
    this.matchedIrqLines = 0;
    this.interruptRequestedFlags = 225;
    this.interruptEnabledFlags = 0;
    this.hdmaRunning = false;
    this.currentInstructionCycleCount = 12;
    this.STATTracker = 0;
    this.modeSTAT = 1;
    this.spriteCount = 252;
    this.LYCMatchTriggerSTAT = false;
    this.mode2TriggerSTAT = false;
    this.mode1TriggerSTAT = false;
    this.mode0TriggerSTAT = false;
    this.audioController.setSkippedBootRomState();
    this.DIVTicks = 27044;
    this.LCDTicks = 160;
    this.timerTicks = 0;
    this.TIMAEnabled = false;
    this.TACClocker = 1024;
    this.serialTimer = 0;
    this.serialShiftTimer = 0;
    this.serialShiftTimerAllocated = 0;
    this.IRQEnableDelay = 0;
    this.actualScanline = 144;
    this.lastUnrenderedLine = 0;
    this.gfxWindowDisplay = false;
    this.gfxSpriteShow = false;
    this.gfxSpriteNormalHeight = true;
    this.backgroundEnabled = true;
    this.hasBackgroundPriority = true;
    this.gfxWindowCHRBankPosition = 0;
    this.gfxBackgroundCHRBankPosition = 0;
    this.gfxBackgroundBankOffset = 0;
    this.windowY = 0;
    this.windowX = 0;
    this.drewBlank = 0;
    this.midScanlineOffset = -1;
    this.currentX = 0;
  }
  initBootRom() {
    console.log("Starting boot rom");
    this.programCounter = 0;
    this.stackPointer = 0;
    this.IME = false;
    this.LCDTicks = 0;
    this.DIVTicks = 0;
    this.registerA = 0;
    this.registerB = 0;
    this.registerC = 0;
    this.registerD = 0;
    this.registerE = 0;
    this.FZero = this.FSubtract = this.FHalfCarry = this.FCarry = false;
    this.registersHL = 0;
    this.audioController.init();
    this.joypad.init();
  }
  disableBootRom() {
    this.loadCartridgeRomIntoMemory();
    if (this.usedGbcBootRom) {
      if (!this.cartridge.useGbcMode) {
        this.adjustGbctoGbMode();
      } else {
        this.memoryNew.updateIoRegisters();
      }
    } else {
      this.memoryNew.updateIoRegisters();
    }
  }
  setSpeed(speed) {
    this.cpu.setSpeed(speed);
    this.audioController.connectDevice(this.audioDevice);
  }
  run() {
    if ((this.stopEmulator & 2) === 0) {
      if ((this.stopEmulator & 1) === 1) {
        if (!this.cpu.stopped) {
          this.stopEmulator = 0;
          this.audioController.adjustUnderrun();
          this.cartridge.mbc?.rtc?.updateClock();
          if (this.halt) {
            this.currentInstructionCycleCount = 0;
            this.calculateHALTPeriod();
            if (this.halt) {
              this.updateCore();
              this.iterationEndRoutine();
            } else {
              this.executeIteration();
            }
          } else {
            this.executeIteration();
          }
          this.lcdDevice.draw();
        } else {
          this.audioController.adjustUnderrun();
          this.audioController.audioTicks += this.cpu.cyclesTotal;
          this.audioController.run();
          this.stopEmulator |= 1;
        }
      } else {
        console.error("Iterator restarted a faulted core.");
      }
    }
  }
  executeIteration() {
    while (this.stopEmulator === 0) {
      switch (this.IRQEnableDelay) {
        case 1:
          this.IME = true;
          this.checkIrqMatching();
          --this.IRQEnableDelay;
          break;
        case 2:
          --this.IRQEnableDelay;
          break;
        default:
          break;
      }
      if (this.matchedIrqLines > 0) {
        this.launchIRQ();
      }
      const operationCode = this.readMemory(this.programCounter);
      this.programCounter = this.programCounter + 1 & 65535;
      if (this.skipPCIncrement) {
        this.programCounter = this.programCounter - 1 & 65535;
        this.skipPCIncrement = false;
      }
      this.currentInstructionCycleCount = tickTable_default[operationCode];
      MainInstructions_default[operationCode].apply(this);
      const timedTicks = this.currentInstructionCycleCount >> this.doubleSpeedShifter;
      this.LCDTicks += timedTicks;
      this.gpu.runScanline(this.actualScanline);
      this.audioController.audioTicks += timedTicks;
      this.cpu.ticks += timedTicks;
      this.DIVTicks += this.currentInstructionCycleCount;
      if (this.TIMAEnabled) {
        this.timerTicks += this.currentInstructionCycleCount;
        while (this.timerTicks >= this.TACClocker) {
          this.timerTicks -= this.TACClocker;
          if (++this.memory[65285] === 256) {
            this.memory[65285] = this.memory[65286];
            this.interruptRequestedFlags |= 4;
            this.checkIrqMatching();
          }
        }
      }
      if (this.serialTimer > 0) {
        this.serialTimer -= this.currentInstructionCycleCount;
        if (this.serialTimer <= 0) {
          this.interruptRequestedFlags |= 8;
          this.checkIrqMatching();
        }
        this.serialShiftTimer -= this.currentInstructionCycleCount;
        if (this.serialShiftTimer <= 0) {
          this.serialShiftTimer = this.serialShiftTimerAllocated;
          this.memory[serialDataAddress] = this.memory[serialDataAddress] << 1 & 254 | 1;
        }
      }
      if (this.cpu.ticks >= this.cpu.cyclesTotal) {
        this.iterationEndRoutine();
      }
    }
  }
  iterationEndRoutine() {
    if ((this.stopEmulator & 1) === 0) {
      this.audioController.run();
      this.memory[divAddress] = this.memory[divAddress] + (this.DIVTicks >> 8) & 255;
      this.DIVTicks &= 255;
      this.stopEmulator |= 1;
      this.cpu.ticks -= this.cpu.cyclesTotal;
      this.cpu.cyclesTotalCurrent += this.cpu.cyclesTotalRoundoff;
      this.recalculateIterationClockLimit();
    }
  }
  stop() {
    this.cpu.stopped = true;
    this.iterationEndRoutine();
    if (this.cpu.ticks < 0) {
      this.audioController.audioTicks -= this.cpu.ticks;
      this.audioController.run();
    }
  }
  recalculateIterationClockLimit() {
    const endModulus = this.cpu.cyclesTotalCurrent % 4;
    this.cpu.cyclesTotal = this.cpu.cyclesTotalBase + this.cpu.cyclesTotalCurrent - endModulus;
    this.cpu.cyclesTotalCurrent = endModulus;
  }
  scanLineMode2() {
    if (this.STATTracker !== 1) {
      if (this.mode2TriggerSTAT) {
        this.interruptRequestedFlags |= 2;
        this.checkIrqMatching();
      }
      this.STATTracker = 1;
      this.modeSTAT = 2;
    }
  }
  scanLineMode3() {
    if (this.modeSTAT !== 3) {
      if (this.STATTracker === 0 && this.mode2TriggerSTAT) {
        this.interruptRequestedFlags |= 2;
        this.checkIrqMatching();
      }
      this.STATTracker = 1;
      this.modeSTAT = 3;
    }
  }
  scanLineMode0() {
    if (this.modeSTAT !== 0) {
      if (this.STATTracker !== 2) {
        if (this.STATTracker === 0) {
          if (this.mode2TriggerSTAT) {
            this.interruptRequestedFlags |= 2;
            this.checkIrqMatching();
          }
          this.modeSTAT = 3;
        }
        this.incrementScanlineQueue();
        this.updateSpriteCount(this.actualScanline);
        this.STATTracker = 2;
      }
      if (this.LCDTicks >= this.spriteCount) {
        if (this.hdmaRunning) {
          this.executeHDMA();
        }
        if (this.mode0TriggerSTAT) {
          this.interruptRequestedFlags |= 2;
          this.checkIrqMatching();
        }
        this.STATTracker = 3;
        this.modeSTAT = 0;
      }
    }
  }
  clocksUntilLYCMatch() {
    if (this.memory[65349] !== 0) {
      if (this.memory[65349] > this.actualScanline) {
        return 456 * (this.memory[65349] - this.actualScanline);
      }
      return 456 * (totalScanlineCount - this.actualScanline + this.memory[65349]);
    }
    return 456 * (this.actualScanline === 153 && this.memory[65348] === 0 ? totalScanlineCount : 153 - this.actualScanline) + 8;
  }
  clocksUntilMode0() {
    switch (this.modeSTAT) {
      case 0:
        if (this.actualScanline === 143) {
          this.updateSpriteCount(0);
          return this.spriteCount + 5016;
        }
        this.updateSpriteCount(this.actualScanline + 1);
        return this.spriteCount + 456;
      case 2:
      case 3:
        this.updateSpriteCount(this.actualScanline);
        return this.spriteCount;
      case 1:
        this.updateSpriteCount(0);
        return this.spriteCount + 456 * (totalScanlineCount - this.actualScanline);
    }
  }
  updateSpriteCount(line) {
    this.spriteCount = 252;
    if (this.cartridge.useGbcMode && this.gfxSpriteShow) {
      var lineAdjusted = line + 16;
      var yoffset = 0;
      var yCap = this.gfxSpriteNormalHeight ? 8 : 16;
      for (var OAMAddress = 65024; OAMAddress < 65184 && this.spriteCount < 312; OAMAddress += 4) {
        yoffset = lineAdjusted - this.memory[OAMAddress];
        if (yoffset > -1 && yoffset < yCap) {
          this.spriteCount += 6;
        }
      }
    }
  }
  matchLYC() {
    if (this.memory[65348] === this.memory[65349]) {
      this.memory[65345] |= 4;
      if (this.LYCMatchTriggerSTAT) {
        this.interruptRequestedFlags |= 2;
        this.checkIrqMatching();
      }
    } else {
      this.memory[65345] &= 123;
    }
  }
  updateCore() {
    this.LCDTicks += this.currentInstructionCycleCount >> this.doubleSpeedShifter;
    this.gpu.runScanline(this.actualScanline);
    var timedTicks = this.currentInstructionCycleCount >> this.doubleSpeedShifter;
    this.audioController.audioTicks += timedTicks;
    this.cpu.ticks += timedTicks;
    this.DIVTicks += this.currentInstructionCycleCount;
    if (this.TIMAEnabled) {
      this.timerTicks += this.currentInstructionCycleCount;
      while (this.timerTicks >= this.TACClocker) {
        this.timerTicks -= this.TACClocker;
        if (++this.memory[65285] === 256) {
          this.memory[65285] = this.memory[65286];
          this.interruptRequestedFlags |= 4;
          this.checkIrqMatching();
        }
      }
    }
    if (this.serialTimer > 0) {
      this.serialTimer -= this.currentInstructionCycleCount;
      if (this.serialTimer <= 0) {
        this.interruptRequestedFlags |= 8;
        this.checkIrqMatching();
      }
      this.serialShiftTimer -= this.currentInstructionCycleCount;
      if (this.serialShiftTimer <= 0) {
        this.serialShiftTimer = this.serialShiftTimerAllocated;
        this.memory[serialDataAddress] = this.memory[serialDataAddress] << 1 & 254 | 1;
      }
    }
  }
  updateCoreFull() {
    this.updateCore();
    if (this.cpu.ticks >= this.cpu.cyclesTotal) {
      this.iterationEndRoutine();
    }
  }
  executeHDMA() {
    this.writeDirectlyToMemory(1);
    if (this.halt) {
      if (this.LCDTicks - this.spriteCount < (4 >> this.doubleSpeedShifter | 32)) {
        this.currentInstructionCycleCount = 4 + (32 + this.spriteCount << this.doubleSpeedShifter);
        this.LCDTicks = this.spriteCount + (4 >> this.doubleSpeedShifter | 32);
      }
    } else {
      this.LCDTicks += 4 >> this.doubleSpeedShifter | 32;
    }
    if (this.memory[65365] === 0) {
      this.hdmaRunning = false;
      this.memory[65365] = 255;
    } else {
      --this.memory[65365];
    }
  }
  renderScanline(scanline) {
    this.pixelStart = scanline * 160;
    if (this.backgroundEnabled) {
      this.pixelEnd = 160;
      this.gpu.renderBackgroundLayer(scanline);
      this.gpu.renderWindowLayer(scanline);
    } else {
      const pixelLine = (scanline + 1) * 160;
      const defaultColor = this.cartridge.useGbcMode || this.colorizedGBPalettes ? 16316664 : 15728606;
      for (let pixelPosition = scanline * 160 + this.currentX; pixelPosition < pixelLine; pixelPosition++) {
        this.frameBuffer[pixelPosition] = defaultColor;
      }
    }
    this.gpu.renderSpriteLayer(scanline);
    this.currentX = 0;
    this.midScanlineOffset = -1;
  }
  renderMidScanline() {
    if (this.actualScanline < 144 && this.modeSTAT === 3) {
      if (this.midScanlineOffset === -1) {
        this.midScanlineOffset = this.backgroundX & 7;
      }
      if (this.LCDTicks >= 82) {
        this.pixelEnd = this.LCDTicks - 74;
        this.pixelEnd = Math.min(
          this.pixelEnd - this.midScanlineOffset - this.pixelEnd % 8,
          160
        );
        if (this.backgroundEnabled) {
          this.pixelStart = this.lastUnrenderedLine * 160;
          this.gpu.renderBackgroundLayer(this.lastUnrenderedLine);
          this.gpu.renderWindowLayer(this.lastUnrenderedLine);
        } else {
          var pixelLine = this.lastUnrenderedLine * 160 + this.pixelEnd;
          var defaultColor = this.cartridge.useGbcMode || this.colorizedGBPalettes ? 16316664 : 15728606;
          for (var pixelPosition = this.lastUnrenderedLine * 160 + this.currentX; pixelPosition < pixelLine; pixelPosition++) {
            this.frameBuffer[pixelPosition] = defaultColor;
          }
        }
        this.currentX = this.pixelEnd;
      }
    }
  }
  adjustGbctoGbMode() {
    console.log("Stepping down from GBC mode.");
    this.videoRam = this.gbcMemory = this.BGCHRCurrentBank = this.BGCHRBank2 = void 0;
    this.tileCache.length = 1792;
    if (settings_default.colorizeGBMode) {
      this.gbBGColorizedPalette = new Int32Array(4);
      this.gbOBJColorizedPalette = new Int32Array(8);
      this.cachedBGPaletteConversion = new Int32Array(4);
      this.cachedOBJPaletteConversion = new Int32Array(8);
      this.backgroundPalette = this.gbBGColorizedPalette;
      this.OBJPalette = this.gbOBJColorizedPalette;
      this.gbOBJPalette = this.gbBGPalette = void 0;
      this.getGBCColor();
    } else {
      this.gbOBJPalette = new Int32Array(8);
      this.gbBGPalette = new Int32Array(4);
      this.backgroundPalette = this.gbBGPalette;
      this.OBJPalette = this.gbOBJPalette;
    }
    this.sortBuffer = new Uint8Array(256);
    this.OAMAddressCache = new Int32Array(10);
    this.gpu.initRenderer();
    this.memoryNew.init();
  }
  initReferencesFromSaveState() {
    if (!this.cartridge.useGbcMode) {
      if (this.colorizedGBPalettes) {
        this.backgroundPalette = this.gbBGColorizedPalette;
        this.OBJPalette = this.gbOBJColorizedPalette;
        this.updateGBBGPalette = this.updateGBColorizedBGPalette;
        this.updateGBOBJPalette = this.updateGBColorizedOBJPalette;
      } else {
        this.backgroundPalette = this.gbBGPalette;
        this.OBJPalette = this.gbOBJPalette;
      }
      this.tileCache = this.generateCacheArray(1792);
      for (let tileIndex = 32768; tileIndex < 36864; tileIndex += 2) {
        this.generateGBOAMTileLine(tileIndex);
      }
      for (let tileIndex = 36864; tileIndex < 38912; tileIndex += 2) {
        this.generateGBTileLine(tileIndex);
      }
      this.sortBuffer = new Uint8Array(256);
      this.OAMAddressCache = new Int32Array(10);
    } else {
      this.BGCHRCurrentBank = this.currentVideoRamBank > 0 ? this.BGCHRBank2 : this.BGCHRBank1;
      this.tileCache = this.generateCacheArray(3968);
      for (let tileIndex = 0; tileIndex < 6144; tileIndex += 16) {
        this.generateGBCTileBank1(tileIndex);
        this.generateGBCTileBank2(tileIndex);
      }
    }
    this.gpu.initRenderer();
  }
  adjustRGBTint(value) {
    const red = value & 31;
    const green = value >> 5 & 31;
    const blue = value >> 10 & 31;
    return red * 13 + green * 2 + blue >> 1 << 16 | green * 3 + blue << 9 | red * 3 + green * 2 + blue * 11 >> 1;
  }
  getGBCColor() {
    for (let counter = 0; counter < 4; counter++) {
      const adjustedIndex = counter << 1;
      this.cachedBGPaletteConversion[counter] = this.adjustRGBTint(
        this.gbcBGRawPalette[adjustedIndex | 1] << 8 | this.gbcBGRawPalette[adjustedIndex]
      );
      this.cachedOBJPaletteConversion[counter] = this.adjustRGBTint(
        this.gbcOBJRawPalette[adjustedIndex | 1] << 8 | this.gbcOBJRawPalette[adjustedIndex]
      );
    }
    for (let counter = 4; counter < 8; counter++) {
      const adjustedIndex = counter << 1;
      this.cachedOBJPaletteConversion[counter] = this.adjustRGBTint(
        this.gbcOBJRawPalette[adjustedIndex | 1] << 8 | this.gbcOBJRawPalette[adjustedIndex]
      );
    }
    this.updateGBBGPalette = this.updateGBColorizedBGPalette;
    this.updateGBOBJPalette = this.updateGBColorizedOBJPalette;
    this.updateGBBGPalette(this.memory[65351]);
    this.updateGBOBJPalette(0, this.memory[65352]);
    this.updateGBOBJPalette(1, this.memory[65353]);
    this.colorizedGBPalettes = true;
  }
  updateGBRegularBGPalette(data) {
    this.gbBGPalette[0] = this.colors[data & 3] | 33554432;
    this.gbBGPalette[1] = this.colors[data >> 2 & 3];
    this.gbBGPalette[2] = this.colors[data >> 4 & 3];
    this.gbBGPalette[3] = this.colors[data >> 6];
  }
  updateGBColorizedBGPalette(data) {
    this.gbBGColorizedPalette[0] = this.cachedBGPaletteConversion[data & 3] | 33554432;
    this.gbBGColorizedPalette[1] = this.cachedBGPaletteConversion[data >> 2 & 3];
    this.gbBGColorizedPalette[2] = this.cachedBGPaletteConversion[data >> 4 & 3];
    this.gbBGColorizedPalette[3] = this.cachedBGPaletteConversion[data >> 6];
  }
  updateGBRegularOBJPalette(address, data) {
    this.gbOBJPalette[address | 1] = this.colors[data >> 2 & 3];
    this.gbOBJPalette[address | 2] = this.colors[data >> 4 & 3];
    this.gbOBJPalette[address | 3] = this.colors[data >> 6];
  }
  updateGBColorizedOBJPalette(address, data) {
    this.gbOBJColorizedPalette[address | 1] = this.cachedOBJPaletteConversion[address | data >> 2 & 3];
    this.gbOBJColorizedPalette[address | 2] = this.cachedOBJPaletteConversion[address | data >> 4 & 3];
    this.gbOBJColorizedPalette[address | 3] = this.cachedOBJPaletteConversion[address | data >> 6];
  }
  updateGBCBGPalette(address, data) {
    if (this.gbcBGRawPalette[address] !== data) {
      this.midScanlineJIT();
      this.gbcBGRawPalette[address] = data;
      if ((address & 6) === 0) {
        data = 33554432 | this.adjustRGBTint(this.gbcBGRawPalette[address | 1] << 8 | this.gbcBGRawPalette[address & 62]);
        address >>= 1;
        this.gbcBGPalette[address] = data;
        this.gbcBGPalette[32 | address] = 16777216 | data;
      } else {
        data = this.adjustRGBTint(this.gbcBGRawPalette[address | 1] << 8 | this.gbcBGRawPalette[address & 62]);
        address >>= 1;
        this.gbcBGPalette[address] = data;
        this.gbcBGPalette[32 | address] = 16777216 | data;
      }
    }
  }
  updateGBCOBJPalette(address, data) {
    if (this.gbcOBJRawPalette[address] !== data) {
      this.gbcOBJRawPalette[address] = data;
      if ((address & 6) > 0) {
        this.midScanlineJIT();
        this.gbcOBJPalette[address >> 1] = 16777216 | this.adjustRGBTint(this.gbcOBJRawPalette[address | 1] << 8 | this.gbcOBJRawPalette[address & 62]);
      }
    }
  }
  findLowestSpriteDrawable(scanline, drawableRange) {
    let address = 65024;
    let spriteCount = 0;
    let diff = 0;
    while (address < 65184 && spriteCount < 10) {
      diff = scanline - this.memory[address];
      if ((diff & drawableRange) === diff) {
        this.OAMAddressCache[spriteCount++] = address;
      }
      address += 4;
    }
    return spriteCount;
  }
  //Generate only a single tile line for the GB tile cache mode:
  generateGBTileLine(address) {
    var lineCopy = this.memory[1 | address] << 8 | this.memory[40958 & address];
    var tileBlock = this.tileCache[(address & 8176) >> 4];
    address = (address & 14) << 2;
    tileBlock[address | 7] = (lineCopy & 256) >> 7 | lineCopy & 1;
    tileBlock[address | 6] = (lineCopy & 512) >> 8 | (lineCopy & 2) >> 1;
    tileBlock[address | 5] = (lineCopy & 1024) >> 9 | (lineCopy & 4) >> 2;
    tileBlock[address | 4] = (lineCopy & 2048) >> 10 | (lineCopy & 8) >> 3;
    tileBlock[address | 3] = (lineCopy & 4096) >> 11 | (lineCopy & 16) >> 4;
    tileBlock[address | 2] = (lineCopy & 8192) >> 12 | (lineCopy & 32) >> 5;
    tileBlock[address | 1] = (lineCopy & 16384) >> 13 | (lineCopy & 64) >> 6;
    tileBlock[address] = (lineCopy & 32768) >> 14 | (lineCopy & 128) >> 7;
  }
  //Generate only a single tile line for the GBC tile cache mode (Bank 1):
  generateGBCTileLineBank1(address) {
    var lineCopy = this.memory[1 | address] << 8 | this.memory[40958 & address];
    address &= 8190;
    var tileBlock1 = this.tileCache[address >> 4];
    var tileBlock2 = this.tileCache[512 | address >> 4];
    var tileBlock3 = this.tileCache[1024 | address >> 4];
    var tileBlock4 = this.tileCache[1536 | address >> 4];
    address = (address & 14) << 2;
    var addressFlipped = 56 - address;
    tileBlock4[addressFlipped] = tileBlock2[address] = tileBlock3[addressFlipped | 7] = tileBlock1[address | 7] = (lineCopy & 256) >> 7 | lineCopy & 1;
    tileBlock4[addressFlipped | 1] = tileBlock2[address | 1] = tileBlock3[addressFlipped | 6] = tileBlock1[address | 6] = (lineCopy & 512) >> 8 | (lineCopy & 2) >> 1;
    tileBlock4[addressFlipped | 2] = tileBlock2[address | 2] = tileBlock3[addressFlipped | 5] = tileBlock1[address | 5] = (lineCopy & 1024) >> 9 | (lineCopy & 4) >> 2;
    tileBlock4[addressFlipped | 3] = tileBlock2[address | 3] = tileBlock3[addressFlipped | 4] = tileBlock1[address | 4] = (lineCopy & 2048) >> 10 | (lineCopy & 8) >> 3;
    tileBlock4[addressFlipped | 4] = tileBlock2[address | 4] = tileBlock3[addressFlipped | 3] = tileBlock1[address | 3] = (lineCopy & 4096) >> 11 | (lineCopy & 16) >> 4;
    tileBlock4[addressFlipped | 5] = tileBlock2[address | 5] = tileBlock3[addressFlipped | 2] = tileBlock1[address | 2] = (lineCopy & 8192) >> 12 | (lineCopy & 32) >> 5;
    tileBlock4[addressFlipped | 6] = tileBlock2[address | 6] = tileBlock3[addressFlipped | 1] = tileBlock1[address | 1] = (lineCopy & 16384) >> 13 | (lineCopy & 64) >> 6;
    tileBlock4[addressFlipped | 7] = tileBlock2[address | 7] = tileBlock3[addressFlipped] = tileBlock1[address] = (lineCopy & 32768) >> 14 | (lineCopy & 128) >> 7;
  }
  //Generate all the flip combinations for a full GBC VRAM bank 1 tile:
  generateGBCTileBank1(vramAddress) {
    var address = vramAddress >> 4;
    var tileBlock1 = this.tileCache[address];
    var tileBlock2 = this.tileCache[512 | address];
    var tileBlock3 = this.tileCache[1024 | address];
    var tileBlock4 = this.tileCache[1536 | address];
    var lineCopy = 0;
    vramAddress |= 32768;
    address = 0;
    var addressFlipped = 56;
    do {
      lineCopy = this.memory[1 | vramAddress] << 8 | this.memory[vramAddress];
      tileBlock4[addressFlipped] = tileBlock2[address] = tileBlock3[addressFlipped | 7] = tileBlock1[address | 7] = (lineCopy & 256) >> 7 | lineCopy & 1;
      tileBlock4[addressFlipped | 1] = tileBlock2[address | 1] = tileBlock3[addressFlipped | 6] = tileBlock1[address | 6] = (lineCopy & 512) >> 8 | (lineCopy & 2) >> 1;
      tileBlock4[addressFlipped | 2] = tileBlock2[address | 2] = tileBlock3[addressFlipped | 5] = tileBlock1[address | 5] = (lineCopy & 1024) >> 9 | (lineCopy & 4) >> 2;
      tileBlock4[addressFlipped | 3] = tileBlock2[address | 3] = tileBlock3[addressFlipped | 4] = tileBlock1[address | 4] = (lineCopy & 2048) >> 10 | (lineCopy & 8) >> 3;
      tileBlock4[addressFlipped | 4] = tileBlock2[address | 4] = tileBlock3[addressFlipped | 3] = tileBlock1[address | 3] = (lineCopy & 4096) >> 11 | (lineCopy & 16) >> 4;
      tileBlock4[addressFlipped | 5] = tileBlock2[address | 5] = tileBlock3[addressFlipped | 2] = tileBlock1[address | 2] = (lineCopy & 8192) >> 12 | (lineCopy & 32) >> 5;
      tileBlock4[addressFlipped | 6] = tileBlock2[address | 6] = tileBlock3[addressFlipped | 1] = tileBlock1[address | 1] = (lineCopy & 16384) >> 13 | (lineCopy & 64) >> 6;
      tileBlock4[addressFlipped | 7] = tileBlock2[address | 7] = tileBlock3[addressFlipped] = tileBlock1[address] = (lineCopy & 32768) >> 14 | (lineCopy & 128) >> 7;
      address += 8;
      addressFlipped -= 8;
      vramAddress += 2;
    } while (addressFlipped > -1);
  }
  //Generate only a single tile line for the GBC tile cache mode (Bank 2):
  generateGBCTileLineBank2(address) {
    var lineCopy = this.videoRam[1 | address] << 8 | this.videoRam[8190 & address];
    var tileBlock1 = this.tileCache[2048 | address >> 4];
    var tileBlock2 = this.tileCache[2560 | address >> 4];
    var tileBlock3 = this.tileCache[3072 | address >> 4];
    var tileBlock4 = this.tileCache[3584 | address >> 4];
    address = (address & 14) << 2;
    var addressFlipped = 56 - address;
    tileBlock4[addressFlipped] = tileBlock2[address] = tileBlock3[addressFlipped | 7] = tileBlock1[address | 7] = (lineCopy & 256) >> 7 | lineCopy & 1;
    tileBlock4[addressFlipped | 1] = tileBlock2[address | 1] = tileBlock3[addressFlipped | 6] = tileBlock1[address | 6] = (lineCopy & 512) >> 8 | (lineCopy & 2) >> 1;
    tileBlock4[addressFlipped | 2] = tileBlock2[address | 2] = tileBlock3[addressFlipped | 5] = tileBlock1[address | 5] = (lineCopy & 1024) >> 9 | (lineCopy & 4) >> 2;
    tileBlock4[addressFlipped | 3] = tileBlock2[address | 3] = tileBlock3[addressFlipped | 4] = tileBlock1[address | 4] = (lineCopy & 2048) >> 10 | (lineCopy & 8) >> 3;
    tileBlock4[addressFlipped | 4] = tileBlock2[address | 4] = tileBlock3[addressFlipped | 3] = tileBlock1[address | 3] = (lineCopy & 4096) >> 11 | (lineCopy & 16) >> 4;
    tileBlock4[addressFlipped | 5] = tileBlock2[address | 5] = tileBlock3[addressFlipped | 2] = tileBlock1[address | 2] = (lineCopy & 8192) >> 12 | (lineCopy & 32) >> 5;
    tileBlock4[addressFlipped | 6] = tileBlock2[address | 6] = tileBlock3[addressFlipped | 1] = tileBlock1[address | 1] = (lineCopy & 16384) >> 13 | (lineCopy & 64) >> 6;
    tileBlock4[addressFlipped | 7] = tileBlock2[address | 7] = tileBlock3[addressFlipped] = tileBlock1[address] = (lineCopy & 32768) >> 14 | (lineCopy & 128) >> 7;
  }
  //Generate all the flip combinations for a full GBC VRAM bank 2 tile:
  generateGBCTileBank2(vramAddress) {
    var address = vramAddress >> 4;
    var tileBlock1 = this.tileCache[2048 | address];
    var tileBlock2 = this.tileCache[2560 | address];
    var tileBlock3 = this.tileCache[3072 | address];
    var tileBlock4 = this.tileCache[3584 | address];
    var lineCopy = 0;
    address = 0;
    var addressFlipped = 56;
    do {
      lineCopy = this.videoRam[1 | vramAddress] << 8 | this.videoRam[vramAddress];
      tileBlock4[addressFlipped] = tileBlock2[address] = tileBlock3[addressFlipped | 7] = tileBlock1[address | 7] = (lineCopy & 256) >> 7 | lineCopy & 1;
      tileBlock4[addressFlipped | 1] = tileBlock2[address | 1] = tileBlock3[addressFlipped | 6] = tileBlock1[address | 6] = (lineCopy & 512) >> 8 | (lineCopy & 2) >> 1;
      tileBlock4[addressFlipped | 2] = tileBlock2[address | 2] = tileBlock3[addressFlipped | 5] = tileBlock1[address | 5] = (lineCopy & 1024) >> 9 | (lineCopy & 4) >> 2;
      tileBlock4[addressFlipped | 3] = tileBlock2[address | 3] = tileBlock3[addressFlipped | 4] = tileBlock1[address | 4] = (lineCopy & 2048) >> 10 | (lineCopy & 8) >> 3;
      tileBlock4[addressFlipped | 4] = tileBlock2[address | 4] = tileBlock3[addressFlipped | 3] = tileBlock1[address | 3] = (lineCopy & 4096) >> 11 | (lineCopy & 16) >> 4;
      tileBlock4[addressFlipped | 5] = tileBlock2[address | 5] = tileBlock3[addressFlipped | 2] = tileBlock1[address | 2] = (lineCopy & 8192) >> 12 | (lineCopy & 32) >> 5;
      tileBlock4[addressFlipped | 6] = tileBlock2[address | 6] = tileBlock3[addressFlipped | 1] = tileBlock1[address | 1] = (lineCopy & 16384) >> 13 | (lineCopy & 64) >> 6;
      tileBlock4[addressFlipped | 7] = tileBlock2[address | 7] = tileBlock3[addressFlipped] = tileBlock1[address] = (lineCopy & 32768) >> 14 | (lineCopy & 128) >> 7;
      address += 8;
      addressFlipped -= 8;
      vramAddress += 2;
    } while (addressFlipped > -1);
  }
  // Generate only a single tile line for the GB tile cache mode (OAM accessible range):
  generateGBOAMTileLine(address) {
    var lineCopy = this.memory[1 | address] << 8 | this.memory[40958 & address];
    address &= 8190;
    var tileBlock1 = this.tileCache[address >> 4];
    var tileBlock2 = this.tileCache[512 | address >> 4];
    var tileBlock3 = this.tileCache[1024 | address >> 4];
    var tileBlock4 = this.tileCache[1536 | address >> 4];
    address = (address & 14) << 2;
    var addressFlipped = 56 - address;
    tileBlock4[addressFlipped] = tileBlock2[address] = tileBlock3[addressFlipped | 7] = tileBlock1[address | 7] = (lineCopy & 256) >> 7 | lineCopy & 1;
    tileBlock4[addressFlipped | 1] = tileBlock2[address | 1] = tileBlock3[addressFlipped | 6] = tileBlock1[address | 6] = (lineCopy & 512) >> 8 | (lineCopy & 2) >> 1;
    tileBlock4[addressFlipped | 2] = tileBlock2[address | 2] = tileBlock3[addressFlipped | 5] = tileBlock1[address | 5] = (lineCopy & 1024) >> 9 | (lineCopy & 4) >> 2;
    tileBlock4[addressFlipped | 3] = tileBlock2[address | 3] = tileBlock3[addressFlipped | 4] = tileBlock1[address | 4] = (lineCopy & 2048) >> 10 | (lineCopy & 8) >> 3;
    tileBlock4[addressFlipped | 4] = tileBlock2[address | 4] = tileBlock3[addressFlipped | 3] = tileBlock1[address | 3] = (lineCopy & 4096) >> 11 | (lineCopy & 16) >> 4;
    tileBlock4[addressFlipped | 5] = tileBlock2[address | 5] = tileBlock3[addressFlipped | 2] = tileBlock1[address | 2] = (lineCopy & 8192) >> 12 | (lineCopy & 32) >> 5;
    tileBlock4[addressFlipped | 6] = tileBlock2[address | 6] = tileBlock3[addressFlipped | 1] = tileBlock1[address | 1] = (lineCopy & 16384) >> 13 | (lineCopy & 64) >> 6;
    tileBlock4[addressFlipped | 7] = tileBlock2[address | 7] = tileBlock3[addressFlipped] = tileBlock1[address] = (lineCopy & 32768) >> 14 | (lineCopy & 128) >> 7;
  }
  graphicsJIT() {
    if (this.gpu.lcdEnabled) {
      this.cpu.totalLinesPassed = 0;
      this.renderQueuedScanlines();
    }
  }
  graphicsJITVBlank() {
    this.cpu.totalLinesPassed += this.queuedScanlines;
    this.renderQueuedScanlines();
  }
  renderQueuedScanlines() {
    while (this.queuedScanlines > 0) {
      this.renderScanline(this.lastUnrenderedLine);
      if (this.lastUnrenderedLine < 143) {
        ++this.lastUnrenderedLine;
      } else {
        this.lastUnrenderedLine = 0;
      }
      --this.queuedScanlines;
    }
  }
  incrementScanlineQueue() {
    if (this.queuedScanlines < 144) {
      ++this.queuedScanlines;
    } else {
      this.currentX = 0;
      this.midScanlineOffset = -1;
      if (this.lastUnrenderedLine < 143) {
        ++this.lastUnrenderedLine;
      } else {
        this.lastUnrenderedLine = 0;
      }
    }
  }
  midScanlineJIT() {
    this.graphicsJIT();
    this.renderMidScanline();
  }
  //Check for the highest priority IRQ to fire:
  launchIRQ() {
    var bitShift = 0;
    var testbit = 1;
    do {
      if ((testbit & this.matchedIrqLines) === testbit) {
        this.IME = false;
        this.interruptRequestedFlags -= testbit;
        this.matchedIrqLines = 0;
        this.currentInstructionCycleCount = 20;
        this.stackPointer = this.stackPointer - 1 & 65535;
        this.writeMemory(this.stackPointer, this.programCounter >> 8);
        this.stackPointer = this.stackPointer - 1 & 65535;
        this.writeMemory(this.stackPointer, this.programCounter & 255);
        this.programCounter = 64 | bitShift << 3;
        this.updateCore();
        return;
      }
      testbit = 1 << ++bitShift;
    } while (bitShift < 5);
  }
  /*
    Check for IRQs to be fired while not in HALT:
  */
  checkIrqMatching() {
    if (!this.IME) return;
    this.matchedIrqLines = this.interruptEnabledFlags & this.interruptRequestedFlags & 31;
  }
  /*
    Handle the HALT opcode by predicting all IRQ cases correctly,
    then selecting the next closest IRQ firing from the prediction to
    clock up to. This prevents hacky looping that doesn't predict, but
    instead just clocks through the core update procedure by one which
    is very slow. Not many emulators do this because they have to cover
    all the IRQ prediction cases and they usually get them wrong.
  */
  calculateHALTPeriod() {
    if (!this.halt) {
      this.halt = true;
      var currentClocks = -1;
      if (this.gpu.lcdEnabled) {
        if ((this.interruptEnabledFlags >> 0 & 1) === 1) {
          currentClocks = 456 * ((this.modeSTAT === 1 ? 298 : 144) - this.actualScanline) - this.LCDTicks << this.doubleSpeedShifter;
        }
        if ((this.interruptEnabledFlags >> 1 & 1) === 1) {
          if (this.mode0TriggerSTAT) {
            const temp_var = this.clocksUntilMode0() - this.LCDTicks << this.doubleSpeedShifter;
            if (temp_var <= currentClocks || currentClocks === -1) {
              currentClocks = temp_var;
            }
          }
          if (this.mode1TriggerSTAT && (this.interruptEnabledFlags & 1) === 0) {
            const temp_var = 456 * ((this.modeSTAT === 1 ? 298 : 144) - this.actualScanline) - this.LCDTicks << this.doubleSpeedShifter;
            if (temp_var <= currentClocks || currentClocks === -1) {
              currentClocks = temp_var;
            }
          }
          if (this.mode2TriggerSTAT) {
            const temp_var = (this.actualScanline >= 143 ? 456 * (totalScanlineCount - this.actualScanline) : 456) - this.LCDTicks << this.doubleSpeedShifter;
            if (temp_var <= currentClocks || currentClocks === -1) {
              currentClocks = temp_var;
            }
          }
          if (this.LYCMatchTriggerSTAT && this.memory[65349] <= 153) {
            const temp_var = this.clocksUntilLYCMatch() - this.LCDTicks << this.doubleSpeedShifter;
            if (temp_var <= currentClocks || currentClocks === -1) {
              currentClocks = temp_var;
            }
          }
        }
      }
      if (this.TIMAEnabled && (this.interruptEnabledFlags >> 2 & 1) === 1) {
        const temp_var = (256 - this.memory[65285]) * this.TACClocker - this.timerTicks;
        if (temp_var <= currentClocks || currentClocks === -1) {
          currentClocks = temp_var;
        }
      }
      if (this.serialTimer > 0 && (this.interruptEnabledFlags >> 3 & 1) === 1) {
        if (this.serialTimer <= currentClocks || currentClocks === -1) {
          currentClocks = this.serialTimer;
        }
      }
    } else {
      currentClocks = this.remainingClocks;
    }
    const maxClocks = this.cpu.cyclesTotal - this.cpu.ticks << this.doubleSpeedShifter;
    if (currentClocks >= 0) {
      if (currentClocks <= maxClocks) {
        this.currentInstructionCycleCount = Math.max(currentClocks, this.currentInstructionCycleCount);
        this.updateCoreFull();
        this.halt = false;
        this.currentInstructionCycleCount = 0;
      } else {
        this.currentInstructionCycleCount = Math.max(maxClocks, this.currentInstructionCycleCount);
        this.remainingClocks = currentClocks - this.currentInstructionCycleCount;
      }
    } else {
      this.currentInstructionCycleCount += maxClocks;
    }
  }
  // Memory Reading:
  readMemory = (address) => {
    if (this.memoryNew.hasReader(address)) return this.memoryNew.read(address);
    return this.memoryReader[address].apply(this, [address]);
  };
  memoryHighRead(address) {
    if (this.memoryNew.hasHighReader(address)) return this.memoryNew.readHigh(address);
    return this.highMemoryReader[address].apply(this, [address]);
  }
  // Memory Writing:
  writeMemory(address, data) {
    if (this.memoryNew.hasWriter(address)) return this.memoryNew.write(address, data);
    return this.memoryWriter[address].apply(this, [address, data]);
  }
  //0xFFXX fast path:
  memoryHighWrite(address, data) {
    if (this.memoryNew.hasHighWriter(address)) return this.memoryNew.writeHigh(address, data);
    return this.highMemoryWriter[address].apply(this, [address, data]);
  }
  memoryHighReadNormal = (address) => {
    return this.memory[65280 | address];
  };
  memoryReadGBCMemory = (address) => {
    return this.gbcMemory[address + this.gbcRamBankPosition];
  };
  memoryReadOAM = (address) => {
    return this.modeSTAT > 1 ? 255 : this.memory[address];
  };
  readGbcEchoRam = (address) => {
    return this.gbcMemory[address + this.gbcEchoRamBankPosition];
  };
  readEchoRam = (address) => {
    return this.memory[address - 8192];
  };
  readGbcVideoRam = (address) => {
    return this.modeSTAT > 2 ? 255 : this.currentVideoRamBank === 0 ? this.memory[address] : this.videoRam[address & 8191];
  };
  readVideoRam = (address) => {
    return this.modeSTAT > 2 ? 255 : this.memory[address];
  };
  readGbcCharacterVideoRam = (address) => {
    return this.modeSTAT > 2 ? 255 : this.BGCHRCurrentBank[address & 2047];
  };
  readCharacterVideoRam = (address) => {
    return this.modeSTAT > 2 ? 255 : this.BGCHRBank1[address & 2047];
  };
  memoryWriteNormal = (address, data) => {
    this.memory[address] = data;
  };
  memoryHighWriteNormal = (address, data) => {
    this.memory[65280 | address] = data;
  };
  memoryWriteGBCRAM = (address, data) => {
    this.gbcMemory[address + this.gbcRamBankPosition] = data;
  };
  memoryWriteOAMRAM(address, data) {
    if (this.modeSTAT < 2) {
      if (this.memory[address] !== data) {
        this.graphicsJIT();
        this.memory[address] = data;
      }
    }
  }
  memoryWriteECHOGBCRAM(address, data) {
    this.gbcMemory[address + this.gbcEchoRamBankPosition] = data;
  }
  memoryWriteECHONormal = (address, data) => {
    this.memory[address - 8192] = data;
  };
  VRAMGBDATAWrite(address, data) {
    if (this.modeSTAT < 3) {
      if (this.memory[address] !== data) {
        this.graphicsJIT();
        this.memory[address] = data;
        this.generateGBOAMTileLine(address);
      }
    }
  }
  VRAMGBDATAUpperWrite(address, data) {
    if (this.modeSTAT < 3) {
      if (this.memory[address] !== data) {
        this.graphicsJIT();
        this.memory[address] = data;
        this.generateGBTileLine(address);
      }
    }
  }
  VRAMGBCDATAWrite(address, data) {
    if (this.modeSTAT < 3) {
      if (this.currentVideoRamBank === 0) {
        if (this.memory[address] !== data) {
          this.graphicsJIT();
          this.memory[address] = data;
          this.generateGBCTileLineBank1(address);
        }
      } else {
        address &= 8191;
        if (this.videoRam[address] !== data) {
          this.graphicsJIT();
          this.videoRam[address] = data;
          this.generateGBCTileLineBank2(address);
        }
      }
    }
  }
  VRAMGBCHRMAPWrite(address, data) {
    if (this.modeSTAT < 3) {
      address &= 2047;
      if (this.BGCHRBank1[address] !== data) {
        this.graphicsJIT();
        this.BGCHRBank1[address] = data;
      }
    }
  }
  VRAMGBCCHRMAPWrite(address, data) {
    if (this.modeSTAT < 3) {
      address &= 2047;
      if (this.BGCHRCurrentBank[address] !== data) {
        this.graphicsJIT();
        this.BGCHRCurrentBank[address] = data;
      }
    }
  }
  writeDirectlyToMemory(tilesToTransfer) {
    if (!this.halt) {
      this.currentInstructionCycleCount += 4 | tilesToTransfer << 5 << this.doubleSpeedShifter;
    }
    let source = this.memory[65361] << 8 | this.memory[65362];
    let destination = this.memory[65363] << 8 | this.memory[65364];
    this.graphicsJIT();
    const memory = this.memory;
    if (this.currentVideoRamBank === 0) {
      do {
        if (destination < 6144) {
          memory[32768 | destination] = this.readMemory(source++);
          memory[32769 | destination] = this.readMemory(source++);
          memory[32770 | destination] = this.readMemory(source++);
          memory[32771 | destination] = this.readMemory(source++);
          memory[32772 | destination] = this.readMemory(source++);
          memory[32773 | destination] = this.readMemory(source++);
          memory[32774 | destination] = this.readMemory(source++);
          memory[32775 | destination] = this.readMemory(source++);
          memory[32776 | destination] = this.readMemory(source++);
          memory[32777 | destination] = this.readMemory(source++);
          memory[32778 | destination] = this.readMemory(source++);
          memory[32779 | destination] = this.readMemory(source++);
          memory[32780 | destination] = this.readMemory(source++);
          memory[32781 | destination] = this.readMemory(source++);
          memory[32782 | destination] = this.readMemory(source++);
          memory[32783 | destination] = this.readMemory(source++);
          this.generateGBCTileBank1(destination);
          destination += 16;
        } else {
          destination &= 2032;
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          this.BGCHRBank1[destination++] = this.readMemory(source++);
          destination = destination + 6144 & 8176;
        }
        source &= 65520;
        --tilesToTransfer;
      } while (tilesToTransfer > 0);
    } else {
      var VRAM = this.videoRam;
      do {
        if (destination < 6144) {
          VRAM[destination] = this.readMemory(source++);
          VRAM[destination | 1] = this.readMemory(source++);
          VRAM[destination | 2] = this.readMemory(source++);
          VRAM[destination | 3] = this.readMemory(source++);
          VRAM[destination | 4] = this.readMemory(source++);
          VRAM[destination | 5] = this.readMemory(source++);
          VRAM[destination | 6] = this.readMemory(source++);
          VRAM[destination | 7] = this.readMemory(source++);
          VRAM[destination | 8] = this.readMemory(source++);
          VRAM[destination | 9] = this.readMemory(source++);
          VRAM[destination | 10] = this.readMemory(source++);
          VRAM[destination | 11] = this.readMemory(source++);
          VRAM[destination | 12] = this.readMemory(source++);
          VRAM[destination | 13] = this.readMemory(source++);
          VRAM[destination | 14] = this.readMemory(source++);
          VRAM[destination | 15] = this.readMemory(source++);
          this.generateGBCTileBank2(destination);
          destination += 16;
        } else {
          destination &= 2032;
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          this.BGCHRBank2[destination++] = this.readMemory(source++);
          destination = destination + 6144 & 8176;
        }
        source &= 65520;
        --tilesToTransfer;
      } while (tilesToTransfer > 0);
    }
    memory[65361] = source >> 8;
    memory[65362] = source & 240;
    memory[65363] = destination >> 8;
    memory[65364] = destination & 240;
  }
};

// src/core/state-fields.js
var STATE_FIELDS = [
  { path: "isBootingRom", type: "number" },
  { path: "registerA", type: "number" },
  { path: "FZero", type: "number" },
  { path: "FSubtract", type: "number" },
  { path: "FHalfCarry", type: "number" },
  { path: "FCarry", type: "number" },
  { path: "registerB", type: "number" },
  { path: "registerC", type: "number" },
  { path: "registerD", type: "number" },
  { path: "registerE", type: "number" },
  { path: "registersHL", type: "number" },
  { path: "stackPointer", type: "number" },
  { path: "programCounter", type: "number" },
  { path: "halt", type: "number" },
  { path: "IME", type: "number" },
  { path: "hdmaRunning", type: "number" },
  { path: "currentInstructionCycleCount", type: "number" },
  { path: "doubleSpeedShifter", type: "number" },
  { path: "memory", type: "uint8" },
  { path: "videoRam", type: "uint8" },
  { path: "currentVideoRamBank", type: "number" },
  { path: "gbcMemory", type: "uint8" },
  { path: "gbcRamBank", type: "number" },
  { path: "gbcRamBankPosition", type: "number" },
  { path: "ROMBank1Offset", type: "number" },
  { path: "cartridge.mbc.currentRomBank", type: "number" },
  { path: "modeSTAT", type: "number" },
  { path: "LYCMatchTriggerSTAT", type: "number" },
  { path: "mode2TriggerSTAT", type: "number" },
  { path: "mode1TriggerSTAT", type: "number" },
  { path: "mode0TriggerSTAT", type: "number" },
  { path: "gpu.lcdEnabled", type: "number" },
  { path: "gfxWindowCHRBankPosition", type: "number" },
  { path: "gfxWindowDisplay", type: "number" },
  { path: "gfxSpriteShow", type: "number" },
  { path: "gfxSpriteNormalHeight", type: "number" },
  { path: "gfxBackgroundCHRBankPosition", type: "number" },
  { path: "gfxBackgroundBankOffset", type: "number" },
  { path: "TIMAEnabled", type: "number" },
  { path: "DIVTicks", type: "number" },
  { path: "LCDTicks", type: "number" },
  { path: "timerTicks", type: "number" },
  { path: "TACClocker", type: "number" },
  { path: "serialTimer", type: "number" },
  { path: "serialShiftTimer", type: "number" },
  { path: "serialShiftTimerAllocated", type: "number" },
  { path: "IRQEnableDelay", type: "number" },
  { path: "cartridge.mbc3.rtc.lastTime", type: "number" },
  { path: "drewBlank", type: "number" },
  { path: "frameBuffer", type: "int32" },
  { path: "backgroundEnabled", type: "number" },
  { path: "audioController.channel1.frequencyTracker", type: "number" },
  { path: "audioController.channel1.frequencyCounter", type: "number" },
  { path: "audioController.channel1.totalLength", type: "number" },
  { path: "audioController.channel1.envelopeVolume", type: "number" },
  { path: "audioController.channel1.envelopeType", type: "number" },
  { path: "audioController.channel1.envelopeSweeps", type: "number" },
  { path: "audioController.channel1.envelopeSweepsLast", type: "number" },
  { path: "audioController.channel1.consecutive", type: "number" },
  { path: "audioController.channel1.frequency", type: "number" },
  { path: "audioController.channel1.sweepFault", type: "number" },
  { path: "audioController.channel1.shadowFrequency", type: "number" },
  { path: "audioController.channel1.timeSweep", type: "number" },
  { path: "audioController.channel1.lastTimeSweep", type: "number" },
  { path: "audioController.channel1.swept", type: "number" },
  { path: "audioController.channel1.frequencySweepDivider", type: "number" },
  { path: "audioController.channel1.decreaseSweep", type: "number" },
  { path: "audioController.channel2.frequencyTracker", type: "number" },
  { path: "audioController.channel2.frequencyCounter", type: "number" },
  { path: "audioController.channel2.totalLength", type: "number" },
  { path: "audioController.channel2.envelopeVolume", type: "number" },
  { path: "audioController.channel2.envelopeType", type: "number" },
  { path: "audioController.channel2.envelopeSweeps", type: "number" },
  { path: "audioController.channel2.envelopeSweepsLast", type: "number" },
  { path: "audioController.channel2.consecutive", type: "number" },
  { path: "audioController.channel2.frequency", type: "number" },
  { path: "audioController.channel3CanPlay", type: "number" },
  { path: "audioController.channel3TotalLength", type: "number" },
  { path: "audioController.channel3PatternType", type: "number" },
  { path: "audioController.channel3frequency", type: "number" },
  { path: "audioController.channel3Consecutive", type: "number" },
  { path: "audioController.channel3PcmData", type: "int8" },
  { path: "audioController.channel4FrequencyPeriod", type: "number" },
  { path: "audioController.channel4LastSampleLookup", type: "number" },
  { path: "audioController.channel4TotalLength", type: "number" },
  { path: "audioController.channel4EnvelopeVolume", type: "number" },
  { path: "audioController.channel4CurrentVolume", type: "number" },
  { path: "audioController.channel4EnvelopeType", type: "number" },
  { path: "audioController.channel4EnvelopeSweeps", type: "number" },
  { path: "audioController.channel4EnvelopeSweepsLast", type: "number" },
  { path: "audioController.channel4Consecutive", type: "number" },
  { path: "audioController.channel4BitRange", type: "number" },
  { path: "audioController.enabled", type: "number" },
  { path: "audioController.cartridgeLeftChannelInputVolume", type: "number" },
  { path: "audioController.cartridgeRightChannelInputVolume", type: "number" },
  { path: "audioController.channel1.leftChannelEnabled", type: "number" },
  { path: "audioController.channel2.leftChannelEnabled", type: "number" },
  { path: "audioController.leftChannel3", type: "number" },
  { path: "audioController.leftChannel4", type: "number" },
  { path: "audioController.channel1.rightChannelEnabled", type: "number" },
  { path: "audioController.channel2.rightChannelEnabled", type: "number" },
  { path: "audioController.rightChannel3", type: "number" },
  { path: "audioController.rightChannel4", type: "number" },
  { path: "audioController.channel1.currentSampleLeft", type: "number" },
  { path: "audioController.channel1.currentSampleRight", type: "number" },
  { path: "audioController.channel2.currentSampleLeft", type: "number" },
  { path: "audioController.channel2.currentSampleRight", type: "number" },
  { path: "audioController.channel3CurrentSampleLeft", type: "number" },
  { path: "audioController.channel3CurrentSampleRight", type: "number" },
  { path: "audioController.channel4CurrentSampleLeft", type: "number" },
  { path: "audioController.channel4CurrentSampleRight", type: "number" },
  { path: "audioController.channel1.currentSampleLeftSecondary", type: "number" },
  { path: "audioController.channel1.currentSampleRightSecondary", type: "number" },
  { path: "audioController.channel2.currentSampleLeftSecondary", type: "number" },
  { path: "audioController.channel2.currentSampleRightSecondary", type: "number" },
  { path: "audioController.channel3CurrentSampleLeftSecondary", type: "number" },
  { path: "audioController.channel3CurrentSampleRightSecondary", type: "number" },
  { path: "audioController.channel4CurrentSampleLeftSecondary", type: "number" },
  { path: "audioController.channel4CurrentSampleRightSecondary", type: "number" },
  { path: "audioController.channel1.currentSampleLeftTrimary", type: "number" },
  { path: "audioController.channel1.currentSampleRightTrimary", type: "number" },
  { path: "audioController.channel2.currentSampleLeftTrimary", type: "number" },
  { path: "audioController.channel2.currentSampleRightTrimary", type: "number" },
  { path: "audioController.mixerOutputCache", type: "number" },
  { path: "audioController.channel1.dutyTracker", type: "number" },
  { path: "audioController.channel1.cachedDuty", type: "number" },
  { path: "audioController.channel2.dutyTracker", type: "number" },
  { path: "audioController.channel2.cachedDuty", type: "number" },
  { path: "audioController.channel1.enabled", type: "number" },
  { path: "audioController.channel2.enabled", type: "number" },
  { path: "audioController.channel3Enabled", type: "number" },
  { path: "audioController.channel4Enabled", type: "number" },
  { path: "audioController.sequencerClocks", type: "number" },
  { path: "audioController.sequencePosition", type: "number" },
  { path: "audioController.channel3Counter", type: "number" },
  { path: "audioController.channel4Counter", type: "number" },
  { path: "audioController.cachedChannel3Sample", type: "number" },
  { path: "audioController.cachedChannel4Sample", type: "number" },
  { path: "audioController.channel3FrequencyPeriod", type: "number" },
  { path: "audioController.channel3LastSampleLookup", type: "number" },
  { path: "actualScanline", type: "number" },
  { path: "lastUnrenderedLine", type: "number" },
  { path: "queuedScanlines", type: "number" },
  { path: "cartridge.mbc3.rtc.RTCisLatched", type: "number" },
  { path: "cartridge.mbc3.rtc.latchedSeconds", type: "number" },
  { path: "cartridge.mbc3.rtc.latchedMinutes", type: "number" },
  { path: "cartridge.mbc3.rtc.latchedHours", type: "number" },
  { path: "cartridge.mbc3.rtc.latchedLDays", type: "number" },
  { path: "cartridge.mbc3.rtc.latchedHDays", type: "number" },
  { path: "cartridge.mbc3.rtc.RTCSeconds", type: "number" },
  { path: "cartridge.mbc3.rtc.RTCMinutes", type: "number" },
  { path: "cartridge.mbc3.rtc.RTCHours", type: "number" },
  { path: "cartridge.mbc3.rtc.RTCDays", type: "number" },
  { path: "cartridge.mbc3.rtc.RTCDayOverFlow", type: "number" },
  { path: "cartridge.mbc3.rtc.RTCHalt", type: "number" },
  { path: "usedBootROM", type: "number" },
  { path: "skipPCIncrement", type: "number" },
  { path: "STATTracker", type: "number" },
  { path: "gbcRamBankPositionECHO", type: "number" },
  { path: "windowY", type: "number" },
  { path: "windowX", type: "number" },
  { path: "gbcOBJRawPalette", type: "uint8" },
  { path: "gbcBGRawPalette", type: "uint8" },
  { path: "gbOBJPalette", type: "int32" },
  { path: "gbBGPalette", type: "int32" },
  { path: "gbcOBJPalette", type: "int32" },
  { path: "gbcBGPalette", type: "int32" },
  { path: "gbBGColorizedPalette", type: "int32" },
  { path: "gbOBJColorizedPalette", type: "int32" },
  { path: "cachedBGPaletteConversion", type: "int32" },
  { path: "cachedOBJPaletteConversion", type: "int32" },
  { path: "BGCHRBank1", type: "uint8" },
  { path: "BGCHRBank2", type: "uint8" },
  { path: "haltPostClocks", type: "number" },
  { path: "interruptRequestedFlags", type: "number" },
  { path: "interruptEnabledFlags", type: "number" },
  { path: "remainingClocks", type: "number" },
  { path: "colorizedGBPalettes", type: "number" },
  { path: "backgroundY", type: "number" },
  { path: "backgroundX", type: "number" },
  { path: "cpu.stopped", type: "number" },
  { path: "audioController.audioClocksUntilNextEvent", type: "number" }
];
var ADAPTER_EXTRA_FIELDS = [
  { path: "joypad.value", type: "number" },
  { path: "cpu.ticks", type: "number" },
  { path: "cpu.cyclesTotal", type: "number" },
  { path: "cpu.cyclesTotalCurrent", type: "number" },
  { path: "stopEmulator", type: "number" },
  { path: "audioController.audioTicks", type: "number" }
];

// src/core/adapter.js
var SCREEN_WIDTH = 160;
var SCREEN_HEIGHT = 144;
var STATE_FORMAT = 1;
var CORE_VERSION = "jsgbc-core@0.7.0+0d2c721";
var BUTTON = {
  UP: 1 << 0,
  DOWN: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  A: 1 << 4,
  B: 1 << 5,
  START: 1 << 6,
  SELECT: 1 << 7
};
var CORE_KEY_INDEX = [
  [BUTTON.RIGHT, 0],
  [BUTTON.LEFT, 1],
  [BUTTON.UP, 2],
  [BUTTON.DOWN, 3],
  [BUTTON.A, 4],
  [BUTTON.B, 5],
  [BUTTON.SELECT, 6],
  [BUTTON.START, 7]
];
var PALETTES = {
  pocket: [15728606, 11392916, 5411443, 1586242],
  grey: [16316664, 11053224, 5789784, 1579032],
  green: [14743760, 8962160, 3434582, 530464]
};
var DEFAULT_PALETTE = "pocket";
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var B64_LOOKUP = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();
function bytesToBase64(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + "==";
  } else if (rest === 2) {
    const n = bytes[i] << 16 | bytes[i + 1] << 8;
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + "=";
  }
  return out;
}
function base64ToBytes(text) {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const pad = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const byteLength = Math.floor((clean.length + pad) * 3 / 4) - pad;
  const out = new Uint8Array(byteLength);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)];
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const d = B64_LOOKUP[clean.charCodeAt(i + 3)];
    const n = a << 18 | b << 12 | c << 6 | d;
    if (p < byteLength) out[p++] = n >> 16 & 255;
    if (p < byteLength) out[p++] = n >> 8 & 255;
    if (p < byteLength) out[p++] = n & 255;
  }
  return out;
}
function readPath(target, path) {
  const parts = path.split(".");
  let value = target;
  for (const part of parts) {
    if (value == null) return void 0;
    value = value[part];
  }
  return value;
}
function writePath(target, path, value) {
  const parts = path.split(".");
  let holder = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (holder == null) return false;
    holder = holder[parts[i]];
  }
  if (holder == null) return false;
  const key = parts[parts.length - 1];
  if (typeof value === "string") {
    const existing = holder[key];
    const bytes = base64ToBytes(value);
    if (existing && typeof existing.length === "number" && typeof existing.set === "function") {
      const elementBytes = existing.BYTES_PER_ELEMENT ?? 1;
      if (existing.length * elementBytes !== bytes.length) return false;
      const view = new existing.constructor(bytes.buffer, bytes.byteOffset, existing.length);
      existing.set(view);
      return true;
    }
    return false;
  }
  holder[key] = value;
  return true;
}
function toBase64(value) {
  return bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
}
function fakeContext() {
  return {
    canvas: null,
    imageSmoothingEnabled: false,
    mozImageSmoothingEnabled: false,
    webkitImageSmoothingEnabled: false,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {
    },
    drawImage() {
    },
    fillRect() {
    },
    clearRect() {
    }
  };
}
function fakeCanvas(context) {
  return { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, getContext: () => context, style: {} };
}
function createCore(options = {}) {
  const context = fakeContext();
  const canvas = fakeCanvas(context);
  const offscreenContext = fakeContext();
  const offscreenCanvas = fakeCanvas(offscreenContext);
  const gb = new GameBoy({
    audio: options.audio,
    lcd: { canvas, context, offscreenCanvas, offscreenContext }
  });
  let audioChunks = [];
  let audioEnabled = Boolean(options.audio?.context);
  gb.audioDevice.init = async () => {
  };
  gb.audioDevice.remainingBuffer = () => 0;
  gb.audioDevice.setVolume = () => {
  };
  gb.audioDevice.writeAudio = (buffer) => {
    if (!audioEnabled || !buffer || buffer.length === 0) return;
    const queued = audioChunks.reduce((n, c) => n + c.length, 0);
    if (queued > 44100 * 0.5 * 2) return;
    audioChunks.push(Float32Array.from(buffer));
  };
  const imageData = typeof ImageData !== "undefined" ? new ImageData(SCREEN_WIDTH, SCREEN_HEIGHT) : null;
  const rgba = imageData ? imageData.data : new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  let inputMask = 0;
  let paletteName = DEFAULT_PALETTE;
  let romInfo = null;
  let rearmedFrames = 0;
  const syncInput = (mask) => {
    if (mask === inputMask) return;
    const changed = mask ^ inputMask;
    for (const [bit, key] of CORE_KEY_INDEX) {
      if (!(changed & bit)) continue;
      if (mask & bit) gb.joypad.down(key);
      else gb.joypad.up(key);
    }
    inputMask = mask;
  };
  const applyPalette = () => {
    if (!gb.cartridge || gb.cartridge.useGbcMode) return;
    const colors = PALETTES[paletteName] ?? PALETTES[DEFAULT_PALETTE];
    gb.colors = colors;
    const bgp = gb.memory[65351] ?? 228;
    gb.updateGBBGPalette(bgp);
    gb.updateGBOBJPalette(0, gb.memory[65352] ?? 228);
    gb.updateGBOBJPalette(1, gb.memory[65353] ?? 228);
  };
  const boot = () => {
    gb.start(gb.cartridge);
    gb.stopEmulator = 1;
    seedCgbPalettes();
  };
  const seedCgbPalettes = () => {
    if (!gb.cartridge?.useGbcMode) return;
    const grey = [32767, 22197, 10570, 0];
    const setPalette = (indexRegister, dataRegister) => {
      gb.writeMemory(indexRegister, 128);
      for (const colour of grey) {
        gb.writeMemory(dataRegister, colour & 255);
        gb.writeMemory(dataRegister, colour >> 8 & 255);
      }
    };
    setPalette(65384, 65385);
    setPalette(65386, 65387);
  };
  const copyFrame = () => {
    const rgb = gb.lcdDevice.swizzledFrame;
    if (!rgb) return;
    for (let p = 0, s = 0; p < rgba.length; p += 4, s += 3) {
      rgba[p] = rgb[s];
      rgba[p + 1] = rgb[s + 1];
      rgba[p + 2] = rgb[s + 2];
    }
  };
  return {
    get core() {
      return gb;
    },
    get rearmedFrames() {
      return rearmedFrames;
    },
    get title() {
      return romInfo?.title ?? "";
    },
    get isGBC() {
      return Boolean(gb.cartridge?.useGbcMode);
    },
    async loadRom(bytes) {
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (data.length < 336) {
        throw new Error("That file is too small to be a cartridge.");
      }
      let sum = 0;
      for (let i = 308; i <= 332; i++) sum = sum - data[i] - 1 & 255;
      if (sum !== data[333]) {
        throw new Error("That file does not look like a handheld cartridge (header checksum mismatch).");
      }
      gb.removeCartridge();
      gb.insertCartridge(data);
      boot();
      const sha256 = await sha256Hex(data);
      romInfo = {
        title: (gb.cartridge.name || "").trim(),
        isGBC: Boolean(gb.cartridge.useGbcMode),
        sha256,
        hasBattery: Boolean(gb.cartridge.hasBattery),
        mapper: gb.cartridge.typeName ?? "ROM"
      };
      inputMask = 0;
      audioChunks = [];
      applyPalette();
      return romInfo;
    },
    runFrame() {
      if (!gb.cartridge) return;
      if (gb.stopEmulator !== 1) {
        rearmedFrames++;
        gb.stopEmulator = 1;
      }
      gb.run();
    },
    framebufferRGBA() {
      copyFrame();
      return rgba;
    },
    /**
     * Convert the core's current framebuffer for display without advancing a
     * frame. Used after a state restore, where running a frame would move the
     * game off the exact frame the pane is promising to hold.
     */
    redraw() {
      if (!gb.cartridge) return;
      gb.lcdDevice.outputFrameBuffer();
    },
    /**
     * Draw the last completed frame. Called once per finished frame, never per
     * rAF tick (spec §10), and only when a frame actually completed.
     *
     * The conversion lives here as well as in framebufferRGBA(): a caller that
     * only draws must still get real pixels, which is exactly the bug the pane
     * shipped with — a zeroed ImageData painted every frame.
     * @param {CanvasRenderingContext2D} target
     */
    drawTo(target) {
      if (!target || !imageData || !gb.cartridge) return false;
      copyFrame();
      target.putImageData(imageData, 0, 0);
      return true;
    },
    setInput(mask) {
      syncInput(mask & 255);
    },
    setPalette(name) {
      paletteName = name;
      applyPalette();
    },
    setAudioEnabled(on) {
      audioEnabled = Boolean(on);
      if (!audioEnabled) audioChunks = [];
    },
    /** The mixer's real output rate, so playback is not silently pitch-shifted. */
    audioSampleRate() {
      const rate = gb.cpu?.clocksPerSecond / gb.audioController?.resamplerFirstPassFactor;
      return Number.isFinite(rate) && rate > 0 ? Math.round(rate) : 44100;
    },
    audioSamples() {
      if (!audioEnabled || audioChunks.length === 0) return null;
      const total = audioChunks.reduce((n, c) => n + c.length, 0);
      const out = new Int16Array(total);
      let p = 0;
      for (const chunk of audioChunks) {
        for (let i = 0; i < chunk.length; i++) {
          const v = chunk[i] < -1 ? -1 : chunk[i] > 1 ? 1 : chunk[i];
          out[p++] = v < 0 ? v * 32768 : v * 32767;
        }
      }
      audioChunks = [];
      return out;
    },
    saveState() {
      const fields = {};
      for (const field of STATE_FIELDS) {
        const value = readPath(gb, field.path);
        if (value === void 0) continue;
        fields[field.path] = ArrayBuffer.isView(value) ? toBase64(value) : value;
      }
      for (const field of ADAPTER_EXTRA_FIELDS) {
        const value = readPath(gb, field.path);
        if (value !== void 0) fields[field.path] = value;
      }
      const payload = {
        format: STATE_FORMAT,
        core: CORE_VERSION,
        rom: romInfo?.sha256 ?? null,
        fields
      };
      return new TextEncoder().encode(JSON.stringify(payload));
    },
    loadState(bytes) {
      const text = typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes);
      const payload = JSON.parse(text);
      if (payload.format !== STATE_FORMAT) {
        throw new Error(`Save state format ${payload.format} is not supported (expected ${STATE_FORMAT}).`);
      }
      if (payload.core !== CORE_VERSION) {
        throw new Error(`Save state was written by ${payload.core}; this build runs ${CORE_VERSION}.`);
      }
      if (payload.rom && romInfo?.sha256 && payload.rom !== romInfo.sha256) {
        throw new Error("That save state belongs to a different cartridge.");
      }
      applyPalette();
      for (const field of STATE_FIELDS) {
        if (!(field.path in payload.fields)) continue;
        writePath(gb, field.path, payload.fields[field.path]);
      }
      for (const field of ADAPTER_EXTRA_FIELDS) {
        if (field.path in payload.fields) writePath(gb, field.path, payload.fields[field.path]);
      }
      gb.initReferencesFromSaveState();
      gb.memoryNew.init();
      gb.lcdDevice.init();
      gb.audioController.noiseSampleTable = gb.audioController.channel4BitRange === 32767 ? gb.audioController.LSFR15Table : gb.audioController.LSFR7Table;
      gb.audioController.channel4VolumeShifter = gb.audioController.channel4BitRange === 32767 ? 15 : 7;
      gb.stopEmulator = 1;
      inputMask = 0;
      audioChunks = [];
    },
    batterySave() {
      const ram = gb.cartridge?.mbc?.getRam?.();
      if (!ram || ram.length === 0) return null;
      return new Uint8Array(ram);
    },
    loadBattery(bytes) {
      if (!bytes || !gb.cartridge?.mbc) return false;
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      gb.cartridge.mbc.loadRam(data);
      return true;
    },
    coreVersion() {
      return CORE_VERSION;
    }
  };
}
async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, "0");
  return out;
}

// src/pane/loop.js
var FRAME_HZ = 59.7275;
var FRAME_MS = 1e3 / FRAME_HZ;
var MAX_CATCH_UP = 4;
var MAX_DELTA_MS = 250;
function createPacer({ onFrame, shouldRun, frameMs = FRAME_MS }) {
  let handle = 0;
  let last = 0;
  let accumulator = 0;
  let running = false;
  const step = (now) => {
    handle = requestAnimationFrame(step);
    if (!last) {
      last = now;
      return;
    }
    const delta = Math.min(now - last, MAX_DELTA_MS);
    last = now;
    if (!shouldRun()) {
      accumulator = 0;
      return;
    }
    accumulator += delta;
    let frames = 0;
    while (accumulator >= frameMs && frames < MAX_CATCH_UP) {
      onFrame();
      accumulator -= frameMs;
      frames++;
    }
    if (accumulator >= frameMs) accumulator = 0;
  };
  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      accumulator = 0;
      handle = requestAnimationFrame(step);
    },
    stop() {
      running = false;
      if (handle) cancelAnimationFrame(handle);
      handle = 0;
    },
    get isRunning() {
      return running;
    }
  };
}

// src/pane/commands.js
var commands = {
  loadFile: null,
  loadSelftest: null,
  saveSlot: null,
  toggleMode: null,
  togglePlay: null,
  toggleMute: null,
  openSaves: null
};
function runCommand(name) {
  const fn = commands[name];
  if (typeof fn !== "function") return false;
  fn();
  return true;
}

// src/audio/player.js
function createAudioPlayer() {
  let context = null;
  let gain = null;
  let enabled = true;
  let nextTime = 0;
  let sampleRate = 44100;
  const ensure = () => {
    if (context) return context;
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    gain = context.createGain();
    gain.gain.value = enabled ? 1 : 0;
    gain.connect(context.destination);
    return context;
  };
  return {
    get latencyMs() {
      if (!context) return 0;
      return Math.max(0, Math.round((nextTime - context.currentTime) * 1e3));
    },
    /** Call from a user gesture: the click on the pane. */
    async unlock() {
      const ctx = ensure();
      if (!ctx) return false;
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          return false;
        }
      }
      return ctx.state === "running";
    },
    setEnabled(on) {
      enabled = Boolean(on);
      if (gain) gain.gain.value = enabled ? 1 : 0;
      if (!enabled) nextTime = 0;
    },
    isEnabled() {
      return enabled;
    },
    setSampleRate(rate) {
      if (Number.isFinite(rate) && rate > 8e3 && rate < 192e3) sampleRate = Math.round(rate);
    },
    /** @param {Int16Array|null} samples interleaved stereo */
    push(samples) {
      if (!enabled || !samples || samples.length < 2) return;
      const ctx = ensure();
      if (!ctx || ctx.state !== "running") return;
      const frames = Math.floor(samples.length / 2);
      const buffer = ctx.createBuffer(2, frames, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      for (let i = 0, j = 0; i < frames; i++, j += 2) {
        left[i] = samples[j] / 32768;
        right[i] = samples[j + 1] / 32768;
      }
      const now = ctx.currentTime;
      if (nextTime < now + 0.01) nextTime = now + 0.03;
      if (nextTime - now > 0.1) nextTime = now + 0.03;
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      node.start(nextTime);
      nextTime += buffer.duration;
    },
    dispose() {
      try {
        gain?.disconnect();
        context?.close();
      } catch {
      }
      context = null;
      gain = null;
      nextTime = 0;
    }
  };
}

// src/saves/saves.js
var DATA = "data";
var INDEX_KEY = "saves.index";
var WRAPPER = "cartridge.save.v1";
function fileName(romSha, slot) {
  return `cartridge-${romSha.slice(0, 16)}-${slot}.json`;
}
function hasFiles(ctx) {
  return Boolean(ctx?.files?.writeText && ctx?.files?.readText);
}
function encode(bytes) {
  return JSON.stringify({ v: WRAPPER, at: Date.now(), bytes: bytesToBase64(bytes) });
}
function decode(text) {
  const parsed = JSON.parse(text);
  if (parsed?.v !== WRAPPER || typeof parsed.bytes !== "string") {
    throw new Error("not a Cartridge save file");
  }
  const bytes = base64ToBytes(parsed.bytes);
  return { bytes, at: parsed.at ?? null };
}
function createSaveStore(ctx, { onNotice } = {}) {
  const notice = (message) => {
    try {
      onNotice?.(message);
    } catch {
    }
  };
  const readIndex = () => {
    try {
      return ctx.storage.get(INDEX_KEY, {}) ?? {};
    } catch {
      return {};
    }
  };
  const writeIndex = (index) => {
    try {
      ctx.storage.set(INDEX_KEY, index);
    } catch {
    }
  };
  const remember = (romSha, slot, at, size) => {
    const index = readIndex();
    const forRom = index[romSha] ?? {};
    forRom[slot] = { at, size };
    index[romSha] = forRom;
    writeIndex(index);
  };
  const forget = (romSha, slot) => {
    const index = readIndex();
    if (index[romSha]) {
      delete index[romSha][slot];
      if (Object.keys(index[romSha]).length === 0) delete index[romSha];
      writeIndex(index);
    }
  };
  return {
    slots(romSha) {
      return readIndex()[romSha] ?? {};
    },
    async write(romSha, slot, bytes) {
      if (!romSha || !bytes) return false;
      const text = encode(bytes);
      if (hasFiles(ctx)) {
        const result = await ctx.files.writeText(DATA, fileName(romSha, slot), text);
        if (result?.ok) {
          remember(romSha, slot, Date.now(), bytes.length);
          return true;
        }
        notice(`Could not write the save file: ${result?.error ?? "unknown error"}`);
      }
      try {
        ctx.storage.set(`save.${romSha}.${slot}`, text);
        remember(romSha, slot, Date.now(), bytes.length);
        return true;
      } catch {
        notice("No room left to store that save.");
        return false;
      }
    },
    async read(romSha, slot) {
      if (!romSha) return null;
      if (hasFiles(ctx)) {
        const result = await ctx.files.readText(DATA, fileName(romSha, slot));
        if (result?.ok && result.text) {
          try {
            return decode(result.text).bytes;
          } catch {
            return null;
          }
        }
        if (result && result.error && result.error !== "not-found") {
          notice(`Could not read the save file: ${result.error}`);
        }
      }
      try {
        const text = ctx.storage.get(`save.${romSha}.${slot}`, null);
        return text ? decode(text).bytes : null;
      } catch {
        return null;
      }
    },
    async remove(romSha, slot) {
      forget(romSha, slot);
      if (hasFiles(ctx)) {
        await ctx.files.trash(DATA, fileName(romSha, slot));
      }
      try {
        ctx.storage.remove(`save.${romSha}.${slot}`);
      } catch {
      }
    },
    /** "Remember this ROM" (off by default, spec §9.1). */
    async rememberRom(romSha, bytes, name) {
      if (!hasFiles(ctx)) return false;
      const text = encode(bytes);
      if (text.length > 4 * 1024 * 1024) {
        notice("That cartridge is too large to remember (4 MiB of base64 is the limit).");
        return false;
      }
      const result = await ctx.files.writeText(DATA, `cartridge-${romSha}-rom.json`, text);
      if (!result?.ok) {
        notice(`Could not remember that cartridge: ${result?.error ?? "unknown error"}`);
        return false;
      }
      ctx.storage.set("rom.remembered", romSha);
      if (name) ctx.storage.set("rom.rememberedName", String(name));
      return true;
    },
    async rememberedRom(romSha) {
      if (!hasFiles(ctx)) return null;
      const result = await ctx.files.readText(DATA, `cartridge-${romSha}-rom.json`);
      if (!result?.ok || !result.text) return null;
      try {
        return decode(result.text).bytes;
      } catch {
        return null;
      }
    },
    async forgetRom(romSha) {
      ctx.storage.remove("rom.remembered");
      if (hasFiles(ctx)) await ctx.files.trash(DATA, `cartridge-${romSha}-rom.json`);
    }
  };
}

// src/input/keymap.js
var DEFAULT_BINDINGS = {
  UP: "ArrowUp",
  DOWN: "ArrowDown",
  LEFT: "ArrowLeft",
  RIGHT: "ArrowRight",
  // Letters cannot be used: the host appends printable keys to the composer
  // before any plugin listener runs, so Z/X would type into the prompt. F-keys
  // are inert and verified clean.
  A: "F1",
  B: "F2",
  START: "Enter",
  SELECT: "ShiftLeft"
};
var BUTTON_ORDER = ["UP", "DOWN", "LEFT", "RIGHT", "A", "B", "START", "SELECT"];
var BUTTON_LABELS = {
  UP: "Up",
  DOWN: "Down",
  LEFT: "Left",
  RIGHT: "Right",
  A: "A",
  B: "B",
  START: "Start",
  SELECT: "Select"
};
function codesFor(binding) {
  if (binding === "ShiftLeft") return ["ShiftLeft", "ShiftRight"];
  return [binding];
}
function buttonForCode(bindings, code) {
  for (const button of BUTTON_ORDER) {
    if (codesFor(bindings[button]).includes(code)) return button;
  }
  return null;
}
function labelForCode(code) {
  if (!code) return "\u2014";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "Space") return "Space";
  if (code.startsWith("Arrow")) return code.slice(5);
  return code;
}
function conflictFor(bindings, code, ignoreButton) {
  for (const button of BUTTON_ORDER) {
    if (button === ignoreButton) continue;
    if (codesFor(bindings[button]).includes(code)) return button;
  }
  return null;
}

// selftest:virtual:selftest-rom
var BYTES_BASE64 = "yf///////////////////4BAIBAIBAIBAQIECBAgQID//////////////////////////////////////////+UhqcDDZwD/5SG5wMNnAP/lIcnAw2cA/+Uh2cDDZwD/5SHpwMNnAPXF1Sq2KAvlOm5nzX4A4SMY8dHB8eHZ6f///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wDDUAHO7WZmzA0ACwNzAIMADAANAAgRH4iJAA7czG7m3d3Zmbu7Z2NuDuzM3dyZn7u5Mz4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB5sFe81evMQDgIf/fDiAGADIFIPwNIPkh//4GADIFIPwh//8GgDIFIPx66qDAzSQNr+BC4EPgQeBKPgfgSwGA/yE7DQYKKuIMBSD6AfwMzbMMAUUNzcUMPuTgR+BIPhvgST7A4ECv4A8+CeD/r+Am4AI+ZuABPoDgAq/Nvw/7zQ8OAAIBAHYY/f//////////////yf////////////////////////////////////////8hlQLlPl/1M6/1M82jDugEIYUI5T4g9TM+IPUzr/Uzr/UzzUEP6AYRQP8aTwYAy8EhQP9xzYsOy1MoDtU+//Uzr/UzzTEO6ALRy1soDtU+AfUzr/UzzTEO6ALRy0soDtWv9TM+//UzzTEO6ALRy0MoDtWv9TM+AfUzzTEO6ALRy3soC6/1M6/1M82aDugCzQ0NwzQCyVAAUQECAgQEKAkmBwkPEBMoAKiAQMAl4BXw4GCS8CrYoACiAAIAAABQAFAAAAAAAAAAgACAAAUABQBQAFAAAADfYB/AH2AvYK9gX8A/wJ9g/wD/AP8A/wD/AP8A/wD/APsG+AP4BvQG9Qb6A/wD+QagJpscJz9IR5GGY2weGAcHdIw4WOT8Eu4ZZ442WJjg4FAAUAAAAAIAKgAoAAAAAAAoACgAAACFAIUAAAAKAAoAAQEHBx0bbXvtm+2b7Zvtm///AP//AAD//wAA//8AAP+AgODguNi23rfZt9m32bfZXyCfQJdIA/gjGBAvFikAAP8A/wD/AP8A/wD/AH+Af8D/AP8A/wD/AP4B/AL7BPAI/wDgH4BgAIAAAAAAAACAAP8A/wB/gD9AHyAfIB8gXzAQAy0CHQJ9Aj4BXwAvAAsASMB0wHjAfsD8gPoA9ADQAO2b7Zvtm+2b7Zvtm+2b7Zv/AAD//wAA//8AAP//AAD/t9m32bfZt9m32bfZt9m32fAI9Aj2CO4R7hHsE+wTzBODAEQDeId4h/CP8I9hnuOcn3Af8B/wD/gP+G+4+xjbOO2b7Zvtm+2b7Zvtm+2b75v/AAD//wAA//8AAP//AP//t9m32bfZt9m32bfZt9n32f8A/wD+AfgG8Aj0CO8Q7xD/AP8AH+APEAcIBwg3CM84zRPiDtYmyTDmGfAP+Qb/AGecp9x9foADOMQB/oB//AOVcpF2I+wTzAc4j3Af4D/A7J/wv//A//8YFx8QFxAQEAD/AP//AP//gH9/AH8AAAA3+Q/9/wP//4h4bBh8CAwY/wD/AP8A/wDnGIV6MM9jAM8QzxDvAMIx5BjwD/wD/wAL+An6A/QLxCcYD/A/wP8A/wD/AP8A/wD/AP8A/wD+AfoE+QLpEsAfxBgI9GiUAAAXEBcQFxAYEB8QHxAXEBAQ9wD3APcAAAB/AH8AfwAAAPcA9wD3AAAAfwB/P39gcE/3APcA9wAAAH8A//z/Bg7y9wD3APcAAAB/AH8/fyA/IPcA9wD3AAAAfwD//v+C/oLsGOwY/AgMGGwYbBh8CAwY71DvUO9QYFBgX29Qb1BvUPcC9wL3AgYCB/L3AvcC9gL6JfUq6jU0K2A/fz9/AAAA65bXqqvW0q6D/v/+fwAAABcQDwgHBwcABwAHAAMAAAD3APcA////AP8A/wD/AAAA4FD/QP9//8D/AP8A/wAAAAcC/wL//v8D/wD/AP8AAADsGPwQ/OD8APwA/AD4AAAAAAB/AH8AfwAAAAcABwAHAAAAfwB/AH8AAAD3APcA9wAAAH8AfwB/AAAA8ADwAPAAAAAAAAAAAAAAAPAA8ADwAAAAAAAAAAAAAAAHAAcABwAAAAAAAAAAAAAA9wD3APcAAAB/AH8AfwAAAAAAAAAAAHYB3DO8e03Ls4cAeAH+IN9kANxgyHTq/BocimwA9gD2JgA7BhMuVz9YOFE2AG8CbfwD/wD/AP8A/wD/AP8A/wAODjExQUFDQT8hHxkLDw8JAAAAAAAAgADA/z/Af4D/AAAAAAAAAAAAAf//AP8A/wBwcIyMgoLCgv6E/pjc8PiQ8Ab5AvoD+gP5BfwC/AP+ATsJyzmLeTv5y8kLOQv5C/mA//sE+wT7BID//wD/AP8AAf//APcI/wAB//8A/wD/ALOQtpmwn7yftpezm7CcsJ8PYJ9AX8BfwJ+gP0A/wH+A+wn7CfsJ+wn7CfsJ+wn7CbGesZ6xnrGesZ6xnrGesZ7wBvkC+gP6A/kF/QL9Av8AgP//AO8Q/wCA//8A/wD/AAH/7xDvEO8QAf//AP8A/wCA//8A+wT/AID/3yDfIN8gAf/7BPsE+wQB//8A9wj/AID//wD/AP8AgP//AO8Q/wAB/3+Af4B/gAH//wDvEP8A+wn7CfsJ+wn7Ccs5C/nvGbGesZ6xnrGesZ6xnrGe8J8fHyEhQUFDQSM9HxEfEQ8OgP//AP8A/wCA/4AAgACAAAH//wD/AP8AAf8AAAAAAAD5/oWGgoLCgsa8/oj8iHxwAAECAwIDAgMCAwIDAgMCAwIEBQUFBQUFBQUFBQUFBgMHCAkAAQoLDAwMDAwMDQkKCQ4PBQUFBQUQERIFBQUGChMUAgcIAxUWFhYWFhYXAgMCAwQFBQUFBRgZGgUFBQYDCQABExQKGxwcHBwcHB0JCgkKBAUFBR4fICEiBQUFBgoCBwgDAgMjJCQkJCQkJQIDAgMOJg8FJygFBQUFBSkqAwkTFAoJCissLS4sLzAxCQoJCgkKDiYPBR4fBQUpKgkKAgMCAwIDKywyMyw0NTECAwIDAgMCAw4PJygFKSoDAAEAAQkKCQo2Nzg5Nzc3OgkKCQoJAAEKCQ4mJiYqCQoHCAcIAgMCAwI7PDw9AwIDAgMCAwIHCAMCAwABAgABAxMUExQJCgkKCQo7PDw9CQoJCgkKCRMUAAEKBwgJBwgKCQo+Az9APgMCOzw8PQMCAwIDAgMAAQIHCAMTFAITFAM/QDw8PDw8PDw8PDw9P0A+CQoJCgcICRMUP0A+P0A8PDw8PDw8PDw8PDw8PDw8PDw8PgIDExQCPzw8PDw8PDw8PDwJQUEKQTs8PDw8PDw8PDw8PDxAQDw8PDw8PDw8PQoJQUJCQkJDAwIDOz0CAwI7PDw8PDw8PDw9AwJBQQMCA0RCRUVFRQYKCUZHSEkKCQoJCkE7PDw9QQkKCQoJCgkKBEUFBQUFSkJCS0xNTkMCAwIAAQMCAwIDAgMCREJCQkJPBQUFBQUFRUVQTE1RUkJCQwcICgkKCURCQkJPRUVFRQUFBQUFBQUFBVBTVFEFRUUGExQDAgMCBEVFRQUFBQUFBQUFBQUFBQUFUFVWUQUFBUpCQkJCQkJPBQUFBQUFBQUFBQUFBQUFBQVQV1hRBQUFBUVFRUVFRQUFBQUFBQUFBQUFBQUFBQUFBVBMTVEFBQUFBQUFBQUFBQUFBQUFBQUFBQUmDwUFBQUFUFNUUQUFBQUFBQUFBQUFBQUFBQUFBQUFKQkODwUFBQVQVVZRBQUFBQUFBQUFBQUFEBESBQUFBSkqAAEOJiYmJllXWFomDwUFBQUFBQUFBQUYGRoFHh8FBgMHCAkKCQoJW1xdXgoEBQUFBQUFBQUFBSAhIgUnKAUGChMUAAECAwIDAgMCAw4mJg8FBQUFBR4fBQUFBQUFBQYDCQoHCAkKCQoJCgkKCQoJDg8FBQUFJygFHh8FBQUpKgoAARMUAgABAwIDAgMCAwIDDg8FBQUFBQUnKAUFBQYCAwcIAAEJBwgKCQoJCgkKCQoJBAUFBQUFBQUFBQUFBgkKExQHCAITFAMCAwIDAgMCAwIEBQUFBQUFBQUFBQVKQwMJChMUCQoJCgkKCQoJCgkKCQQFBQUFBQUFBQUFBQUGCn3qocDmA28B4AHLJcslCekhqcDD0QwhucDD0QwhycDD0Qwh2cDD0Qwh6cDD0QwhqcDD8QwhucDD8QwhycDD8Qwh2cDD8Qwh6cDD8QwqX1ayyHu5IPd6uCDzrzJ3PFRdGyMqEkcTKhITsMgY9Sq2KAMjGPlwK3HJIafANCACIzTNgP8+AeqlwMnwQIfQr/PqpcD7dgD6pcC3KPiv6qXAyfBAh9DwRP6SMPrwRP6ROPrwQOZ/4EDJPsDgRj4oPSD9yfqkwP4CIAnwAeqjwD4AGA7+ASAW8AH+VSgEPgQYAj4A6qTAr+ACPmbgAT6A4ALJ+AJuJgDNhQzJIaHAXsn7yfPJ+qDAw1AB8/gCr+APfuD/+8nF+AROI0bNlQzBycX4BE4jRs2bDMHJxfgETiNGzaEMwcnF+AROI0bNpwzBycX4BE4jRs2tDMHJxfgETiNGzbMMwcnF+AROI0bNuQzBycX4BE4jRs2/DMHJxfgETiNGzcUMwcnF+AROI0bNywzBySGnwPMq+1Zfycnh+qbA9V4jViMqI+XqpsDqACAhKA7la2Lp4fHqACDqpsDp+AKvvigF8EOG4EMjr74oBfBChuBCyfXFBv/NVw63IPgFIPfB8cnFPiDgAPAA8AAv5g/LN0c+EOAA8ADwAPAA8ADwAPAAL+YPsMs3Rz4w4AB4wcnNVw6gKPrJzVcOX8nF+ARGzYQOX8HJ+AIq4EMq4ELJ8EDLZ8LwDsX4B0YrTiteK27lr7MgBREAEBgJJgBrKSkpKVRd4X0Hn2cpKSkpxQEAkAnBy1woBstkKALLpPBB5gIg+goiAxt6syDowcnF+AdGK04rXitu5a+zIAURABAYCSYAaykpKSlUXeEmACkpKSnFAQCACcHNHw/ByfBB5gIg+goiAxt6syDyycX4CVYrXitGK04rOm5nzR8PwcnF+ARWI174CUYrTis6Zm/NZg/ByeXwQMt3IAUhAJgYFCEAnBgP5fBAy18gBSEAmBgDIQCcxa+zKAcBIAAJHSD8BgBKCcHR5dXwQeYCIPoKIgMVIPThVOEdKArFASAACcHl1RjkycX4C0YrTitWK174BNVWI14jKm5nzXUPwcnJ//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8=";

// src/roms/roms.js
function selftestRom() {
  return { bytes: base64ToBytes(BYTES_BASE64), name: "selftest.gb" };
}
async function readRomFile(file) {
  if (!file) throw new Error("No cartridge was dropped.");
  const name = String(file.name ?? "cartridge.gb");
  if (!/\.(gb|gbc)$/i.test(name)) {
    const looksZipped = /\.(zip|7z|rar|gz)$/i.test(name);
    throw new Error(
      looksZipped ? `\u201C${name}\u201D is an archive. Unzip it and drop the .gb or .gbc inside.` : `\u201C${name}\u201D is not a .gb or .gbc file.`
    );
  }
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error(`\u201C${name}\u201D is empty.`);
  return { bytes: new Uint8Array(buffer), name };
}
function displayName(name) {
  if (!name) return "";
  const bare = String(name).split(/[\\/]/).pop() ?? "";
  return bare.length > 40 ? `${bare.slice(0, 37)}\u2026` : bare;
}
function formatBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

// src/state/store.js
import { atom } from "@hermes/plugin-sdk";

// src/state/reducer.js
var MODE_INTERRUPTED = "interrupted";
var MODE_ALWAYS = "always";
var STATUS = {
  IDLE: "idle",
  PLAYING: "playing",
  PAUSED_BY_USER: "paused-by-user",
  INTERRUPTED: "interrupted"
};
function createState(overrides = {}) {
  const state = {
    mode: MODE_INTERRUPTED,
    turnBusy: false,
    approvalPending: false,
    userPaused: false,
    paneHidden: false,
    status: STATUS.IDLE,
    approval: null,
    timeServedMs: 0,
    ...overrides
  };
  state.status = derive(state);
  return state;
}
function derive(state) {
  if (state.mode === MODE_INTERRUPTED && state.approvalPending) return STATUS.INTERRUPTED;
  if (state.userPaused) return STATUS.PAUSED_BY_USER;
  if (state.mode === MODE_INTERRUPTED && !state.turnBusy) return STATUS.IDLE;
  return STATUS.PLAYING;
}
function isRunning(state) {
  return state.status === STATUS.PLAYING && !state.paneHidden;
}
function needsAttention(state) {
  return state.approvalPending;
}
function reduce(prev, action) {
  const next = { ...prev };
  switch (action.type) {
    case "turn-busy":
      next.turnBusy = Boolean(action.value);
      break;
    case "approval":
      next.approvalPending = Boolean(action.value);
      next.approval = action.value ? action.approval ?? null : null;
      break;
    case "approval-cleared":
      next.approvalPending = false;
      next.approval = null;
      break;
    case "user-toggle-play":
      next.userPaused = !prev.userPaused;
      break;
    case "user-pause":
      next.userPaused = true;
      break;
    case "mode-toggle":
      next.mode = prev.mode === MODE_INTERRUPTED ? MODE_ALWAYS : MODE_INTERRUPTED;
      break;
    case "set-mode":
      next.mode = action.value === MODE_ALWAYS ? MODE_ALWAYS : MODE_INTERRUPTED;
      break;
    case "pane-hidden":
      next.paneHidden = Boolean(action.value);
      break;
    case "tick":
      if (prev.status === STATUS.PLAYING && prev.turnBusy && !prev.paneHidden) {
        next.timeServedMs = prev.timeServedMs + Math.max(0, Number(action.ms) || 0);
      }
      break;
    case "reset-clock":
      next.timeServedMs = 0;
      break;
    default:
      return { state: prev, effects: [] };
  }
  next.status = derive(next);
  const effects2 = [];
  if (prev.status !== STATUS.INTERRUPTED && next.status === STATUS.INTERRUPTED) {
    effects2.push({ type: "auto-save" });
  }
  if (prev.status === STATUS.INTERRUPTED && next.status === STATUS.PLAYING) {
    effects2.push({ type: "auto-restore" });
  }
  return { state: next, effects: effects2 };
}

// src/state/store.js
var busy = atom(createState());
var rom = atom(null);
var phase = atom("empty");
var lastError = atom("");
var prefs = atom({
  mode: "interrupted",
  palette: DEFAULT_PALETTE,
  scale: "auto",
  audio: true,
  bindings: { ...DEFAULT_BINDINGS },
  rememberRom: false
});
var served = atom({ day: todayKey(), ms: 0 });
var effects = { onEffect: null };
var worker = {
  ctx: null,
  saves: null,
  player: null,
  core: null,
  audioRate: 44100
};
function todayKey(date = /* @__PURE__ */ new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function dispatch(action) {
  const prev = busy.get();
  const { state, effects: requested } = reduce(prev, action);
  if (state !== prev) busy.set(state);
  for (const effect of requested) {
    try {
      effects.onEffect?.(effect);
    } catch (error) {
      console.warn("[cartridge] effect failed", effect.type, error);
    }
  }
  return state;
}
function setPrefs(patch) {
  const next = { ...prefs.get(), ...patch };
  prefs.set(next);
  try {
    worker.ctx?.storage.set("prefs", next);
  } catch {
  }
  if (patch.mode) dispatch({ type: "set-mode", value: patch.mode });
  if (patch.palette) worker.core?.setPalette(patch.palette);
  if (typeof patch.audio === "boolean") worker.player?.setEnabled(patch.audio);
  return next;
}
function addServed(ms) {
  if (!(ms > 0)) return;
  const current = served.get();
  const day = todayKey();
  const base = current.day === day ? current.ms : 0;
  served.set({ day, ms: base + ms });
}
function flushServed() {
  const current = served.get();
  try {
    worker.ctx?.storage.set("served", { day: current.day, ms: current.ms });
  } catch {
  }
}
function hydrate(ctx) {
  worker.ctx = ctx;
  try {
    const stored = ctx.storage.get("prefs", null);
    if (stored && typeof stored === "object") {
      prefs.set({
        ...prefs.get(),
        ...stored,
        bindings: { ...DEFAULT_BINDINGS, ...stored.bindings ?? {} }
      });
    }
  } catch {
  }
  try {
    const stored = ctx.storage.get("served", null);
    if (stored && stored.day === todayKey()) served.set(stored);
  } catch {
  }
  dispatch({ type: "set-mode", value: prefs.get().mode === MODE_ALWAYS ? MODE_ALWAYS : "interrupted" });
}
function formatServed(ms) {
  const total = Math.max(0, Math.floor(ms / 1e3));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

// src/pane/pane.js
var AUTO_SLOT = "auto";
var SLOTS = ["1", "2", "3", "4"];
var CHOICE_LABELS = {
  once: "Allow once",
  session: "Allow for session",
  always: "Always allow",
  deny: "Deny"
};
function scaleFor(preference, width, height) {
  if (preference !== "auto") {
    const fixed = Number.parseInt(preference, 10);
    if (Number.isFinite(fixed) && fixed >= 1) return fixed;
  }
  const fit = Math.min(width / SCREEN_WIDTH, height / SCREEN_HEIGHT);
  return Math.max(1, Math.floor(fit));
}
function StatusDot({ tone }) {
  const toneClass = tone === "playing" ? "bg-(--ui-accent)" : tone === "interrupted" ? "bg-(--ui-text-secondary)" : "bg-(--ui-text-quaternary)";
  return jsx("span", {
    "aria-hidden": true,
    className: cn("inline-block size-1.5 rounded-full", toneClass)
  });
}
function CartridgePane() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const coreRef = useRef(null);
  const pacerRef = useRef(null);
  const playerRef = useRef(null);
  const savesRef = useRef(null);
  const context2dRef = useRef(null);
  const heldRef = useRef(/* @__PURE__ */ new Set());
  const pointerHeld = useRef(/* @__PURE__ */ new Set());
  const paneFocusRef = useRef(false);
  const rootRef = useRef(null);
  const servedRef = useRef(0);
  const noticeTimerRef = useRef(0);
  const effectsBridge = useRef(null);
  const [scale, setScale] = useState(3);
  const [savesOpen, setSavesOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pressed, setPressed] = useState({});
  const [canvasFocused, setCanvasFocused] = useState(false);
  const state = useValue(busy);
  const current = useValue(rom);
  const currentPhase = useValue(phase);
  const error = useValue(lastError);
  const preferences = useValue(prefs);
  const servedToday = useValue(served);
  const maskOf = () => {
    const bindings = prefs.get().bindings;
    let mask = 0;
    for (const code of heldRef.current) {
      const button = buttonForCode(bindings, code);
      if (button) mask |= BUTTON[button];
    }
    for (const button of pointerHeld.current) mask |= BUTTON[button];
    return mask;
  };
  const syncInput = () => {
    coreRef.current?.setInput(maskOf());
    const bindings = prefs.get().bindings;
    const next = {};
    for (const code of heldRef.current) {
      const button = buttonForCode(bindings, code);
      if (button) next[button] = true;
    }
    for (const button of pointerHeld.current) next[button] = true;
    setPressed(next);
  };
  const pressButton = (button) => {
    ensurePlayFromInput();
    pointerHeld.current.add(button);
    syncInput();
  };
  function ensurePlayFromInput() {
    const state2 = busy.get();
    if (state2.status === STATUS.PAUSED_BY_USER) {
      dispatch({ type: "user-toggle-play" });
      return;
    }
    if (state2.status === STATUS.IDLE && state2.mode === MODE_INTERRUPTED) {
      dispatch({ type: "mode-toggle" });
      setNotice("always on \u2014 playing outside a turn");
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => setNotice(""), 2600);
    }
  }
  const releaseButton = (button) => {
    if (!pointerHeld.current.has(button)) return;
    pointerHeld.current.delete(button);
    syncInput();
  };
  const clearHeld = () => {
    if (heldRef.current.size === 0 && pointerHeld.current.size === 0) return;
    heldRef.current.clear();
    pointerHeld.current.clear();
    coreRef.current?.setInput(0);
    setPressed({});
  };
  const flash = (message) => {
    setNotice(message);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 2600);
  };
  const bootRom = async (bytes, name) => {
    const core = coreRef.current;
    const saves = savesRef.current;
    if (!core) return;
    phase.set("loading");
    lastError.set("");
    try {
      const info = await core.loadRom(bytes);
      const loaded = {
        ...info,
        name: name ?? info.title ?? "cartridge",
        size: bytes.length,
        title: info.title || name || "cartridge"
      };
      rom.set(loaded);
      core.setPalette(prefs.get().palette);
      playerRef.current?.setSampleRate(core.audioSampleRate?.() ?? 44100);
      if (info.hasBattery) {
        const battery = await saves.read(info.sha256, "battery");
        if (battery) core.loadBattery(battery);
      }
      const auto = await saves.read(info.sha256, AUTO_SLOT);
      let resumed = false;
      if (auto) {
        try {
          core.loadState(auto);
          resumed = true;
        } catch (restoreError) {
          console.warn("[cartridge] auto-save not restored", restoreError);
        }
      }
      if (prefs.get().rememberRom) await saves.rememberRom(info.sha256, bytes, loaded.name);
      if (resumed) {
        core.redraw();
      } else {
        for (let i = 0; i < 8; i++) core.runFrame();
      }
      core.drawTo(context2dRef.current);
      phase.set("ready");
      pacerRef.current?.start();
      paneFocusRef.current = true;
      canvasRef.current?.focus();
      flash(resumed ? `Resumed ${displayName(loaded.name)}` : `Loaded ${displayName(loaded.name)}`);
    } catch (loadError) {
      phase.set("error");
      lastError.set(loadError?.message ?? String(loadError));
    }
  };
  const loadFile = async (file) => {
    try {
      const { bytes, name } = await readRomFile(file);
      await bootRom(bytes, name);
    } catch (readError) {
      phase.set("error");
      lastError.set(readError?.message ?? String(readError));
    }
  };
  const loadSelftest = () => {
    const { bytes, name } = selftestRom();
    return bootRom(bytes, name);
  };
  const writeSlot = async (slot) => {
    const core = coreRef.current;
    const info = rom.get();
    const saves = savesRef.current;
    if (!core || !info || !saves) return;
    try {
      const ok = await saves.write(info.sha256, slot, core.saveState());
      flash(ok ? `Saved to slot ${slot}` : `Could not save to slot ${slot}`);
    } catch (saveError) {
      flash(saveError?.message ?? "Save failed");
    }
  };
  const readSlot = async (slot) => {
    const core = coreRef.current;
    const info = rom.get();
    const saves = savesRef.current;
    if (!core || !info || !saves) return;
    const bytes = await saves.read(info.sha256, slot);
    if (!bytes) {
      flash(`Slot ${slot} is empty`);
      return;
    }
    try {
      core.loadState(bytes);
      core.redraw();
      core.drawTo(context2dRef.current);
      flash(`Loaded slot ${slot}`);
    } catch (loadError) {
      flash(loadError?.message ?? "Could not load that state");
    }
  };
  const answerApproval = async (choice) => {
    const approval2 = busy.get().approval;
    if (!approval2) return;
    try {
      await host.request("approval.respond", {
        choice,
        ...approval2.prompt_id ? { request_id: approval2.prompt_id } : {},
        ...approval2.session_id ? { session_id: approval2.session_id } : {}
      });
      dispatch({ type: "approval-cleared" });
    } catch (respondError) {
      console.warn("[cartridge] approval.respond failed", respondError);
      flash("Answer this one in the chat \u2014 the pane could not reach the approval queue.");
    }
  };
  useEffect(() => {
    const canvas2 = canvasRef.current;
    if (!canvas2) return;
    const player = createAudioPlayer();
    const saves = createSaveStore(worker.ctx, { onNotice: (message) => flash(message) });
    const core = createCore();
    const context2d = canvas2.getContext("2d");
    context2dRef.current = context2d;
    core.setPalette(prefs.get().palette);
    player.setEnabled(prefs.get().audio);
    worker.core = core;
    worker.player = player;
    worker.saves = saves;
    worker.effects = effects;
    effects.onEffect = (effect) => void effectsBridge.current?.(effect);
    coreRef.current = core;
    playerRef.current = player;
    savesRef.current = saves;
    const pacer = createPacer({
      onFrame: () => {
        core.setInput(maskOf());
        core.runFrame();
        core.drawTo(context2d);
        player.push(core.audioSamples());
        servedRef.current += FRAME_MS;
        if (servedRef.current >= 1e3) {
          const whole = Math.floor(servedRef.current);
          servedRef.current -= whole;
          const before = busy.get();
          dispatch({ type: "tick", ms: whole });
          if (before.turnBusy) addServed(whole);
        }
      },
      shouldRun: () => isRunning(busy.get()) && Boolean(rom.get())
    });
    pacerRef.current = pacer;
    pacer.start();
    const onBlur = () => clearHeld();
    const onVisibility = () => {
      dispatch({ type: "pane-hidden", value: document.visibilityState !== "visible" });
    };
    const onCaptureKeyDown = (event) => {
      if (!paneFocusRef.current) return;
      if (busy.get().approvalPending) return;
      const button = buttonForCode(prefs.get().bindings, event.code);
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      window.setTimeout(() => {
        if (phase.get() !== "empty") canvasRef.current?.focus();
      }, 0);
      if (event.repeat) return;
      ensurePlayFromInput();
      heldRef.current.add(event.code);
      syncInput();
    };
    const onCaptureKeyUp = (event) => {
      if (!heldRef.current.has(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      heldRef.current.delete(event.code);
      syncInput();
    };
    const onBeforeInput = (event) => {
      if (!paneFocusRef.current) return;
      const target = event.target;
      const editable = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable === true);
      if (!editable) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onOutsidePointerDown = (event) => {
      const root = rootRef.current;
      if (!root || root.contains(event.target)) return;
      paneFocusRef.current = false;
      setCanvasFocused(false);
      clearHeld();
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointerdown", onOutsidePointerDown, true);
    window.addEventListener("keydown", onCaptureKeyDown, true);
    window.addEventListener("beforeinput", onBeforeInput, true);
    window.addEventListener("keypress", onBeforeInput, true);
    window.addEventListener("keyup", onCaptureKeyUp, true);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    const remembered = worker.ctx?.storage.get("rom.remembered", null);
    if (remembered) {
      const rememberedName = worker.ctx?.storage.get("rom.rememberedName", "remembered cartridge");
      saves.rememberedRom(remembered).then((bytes) => {
        if (bytes) return bootRom(bytes, rememberedName);
        return null;
      }).catch(() => {
      });
    }
    return () => {
      pacer.stop();
      player.dispose();
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onCaptureKeyDown, true);
      window.removeEventListener("beforeinput", onBeforeInput, true);
      window.removeEventListener("keypress", onBeforeInput, true);
      window.removeEventListener("keyup", onCaptureKeyUp, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(noticeTimerRef.current);
      flushServed();
      clearHeld();
      coreRef.current = null;
      pacerRef.current = null;
      playerRef.current = null;
      savesRef.current = null;
      worker.core = null;
      worker.player = null;
      worker.saves = null;
      worker.effects = null;
    };
  }, []);
  effectsBridge.current = async (effect) => {
    const core = coreRef.current;
    const info = rom.get();
    const saves = savesRef.current;
    if (!core || !info || !saves) return;
    if (effect.type === "auto-save") {
      const ok = await saves.write(info.sha256, AUTO_SLOT, core.saveState());
      if (ok) flash("Paused for the agent \u2014 frame held");
    }
    if (effect.type === "auto-restore") {
      const bytes = await saves.read(info.sha256, AUTO_SLOT);
      if (!bytes) return;
      try {
        core.loadState(bytes);
        core.redraw();
        core.drawTo(context2dRef.current);
      } catch (restoreError) {
        console.warn("[cartridge] could not restore the automatic slot", restoreError);
      }
    }
  };
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const rect = container.getBoundingClientRect();
      setScale(scaleFor(prefs.get().scale, Math.max(0, rect.width - 10), Math.max(0, rect.height - 10)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setScale(scaleFor(preferences.scale, Math.max(0, rect.width - 10), Math.max(0, rect.height - 10)));
  }, [preferences.scale]);
  useEffect(() => {
    commands.loadFile = () => fileInputRef.current?.click();
    commands.loadSelftest = () => void loadSelftest();
    commands.saveSlot = () => void writeSlot("1");
    commands.toggleMode = () => dispatch({ type: "mode-toggle" });
    commands.togglePlay = () => dispatch({ type: "user-toggle-play" });
    commands.toggleMute = () => setPrefs({ audio: !prefs.get().audio });
    commands.openSaves = () => setSavesOpen((open) => !open);
    return () => {
      for (const key of Object.keys(commands)) commands[key] = null;
    };
  }, []);
  const bindBatteryFlush = () => {
    const core = coreRef.current;
    const info = rom.get();
    const saves = savesRef.current;
    if (!core || !info?.hasBattery || !saves) return;
    const battery = core.batterySave();
    if (battery) void saves.write(info.sha256, "battery", battery);
  };
  useEffect(() => {
    if (isRunning(state)) return;
    bindBatteryFlush();
  }, [state.status]);
  const statusTone = state.status === STATUS.PLAYING ? "playing" : state.status === STATUS.INTERRUPTED ? "interrupted" : "idle";
  const statusLabel = state.status === STATUS.PLAYING ? "playing" : state.status === STATUS.INTERRUPTED ? "paused \xB7 approval" : state.status === STATUS.PAUSED_BY_USER ? "paused" : "standby";
  const onDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  };
  const empty = currentPhase === "empty";
  const approval = state.approval;
  const showApproval = needsAttention(state) && approval;
  const canvas = jsx("canvas", {
    ref: canvasRef,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    tabIndex: 0,
    onFocus: () => {
      setCanvasFocused(true);
      paneFocusRef.current = true;
    },
    onBlur: (event) => {
      setCanvasFocused(false);
      if (!paneFocusRef.current) clearHeld();
      if (paneFocusRef.current) {
        window.setTimeout(() => {
          if (paneFocusRef.current) canvasRef.current?.focus();
        }, 0);
      }
    },
    onClick: () => {
      void playerRef.current?.unlock();
      canvasRef.current?.focus();
    },
    className: "rounded-[2px] outline-none",
    style: {
      width: `${SCREEN_WIDTH * scale}px`,
      height: `${SCREEN_HEIGHT * scale}px`,
      imageRendering: "pixelated",
      display: empty ? "none" : "block",
      caretColor: "transparent"
    }
  });
  const emptyState = empty ? jsxs("div", {
    className: "flex h-full flex-col items-center justify-center gap-3 px-4 text-center",
    children: [
      jsx("div", {
        className: "text-[length:var(--conversation-caption-font-size)] tracking-wide text-(--ui-text-tertiary) uppercase",
        children: "cartridge slot"
      }),
      jsx("div", {
        className: "text-sm text-(--ui-text-secondary)",
        children: "Drop a .gb or .gbc here"
      }),
      jsxs("div", {
        className: "flex flex-wrap items-center justify-center gap-2",
        children: [
          jsx("button", {
            type: "button",
            className: "rounded border border-(--ui-stroke-secondary) px-2 py-1 text-xs text-(--ui-text-secondary) hover:text-(--ui-text-primary)",
            onClick: () => fileInputRef.current?.click(),
            children: "Choose file\u2026"
          }),
          jsx("button", {
            type: "button",
            className: "rounded border border-(--ui-stroke-secondary) px-2 py-1 text-xs text-(--ui-text-secondary) hover:text-(--ui-text-primary)",
            onClick: () => void loadSelftest(),
            children: "Self-test cartridge"
          })
        ]
      }),
      jsx("div", {
        className: "max-w-[26rem] text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)",
        children: "Your own cartridges, read locally. Nothing is uploaded, and Cartridge ships no games."
      })
    ]
  }) : null;
  const errorState = currentPhase === "error" ? jsxs("div", {
    className: "flex h-full flex-col items-center justify-center gap-2 px-4 text-center",
    children: [
      jsx("div", { className: "text-sm text-(--ui-text-secondary)", children: "That cartridge did not load" }),
      jsx("div", { className: "max-w-[26rem] text-xs text-(--ui-text-tertiary)", children: error }),
      jsx("button", {
        type: "button",
        className: "rounded border border-(--ui-stroke-secondary) px-2 py-1 text-xs text-(--ui-text-secondary)",
        onClick: () => {
          phase.set(current ? "ready" : "empty");
          lastError.set("");
        },
        children: "Dismiss"
      })
    ]
  }) : null;
  const approvalCard = showApproval ? jsxs("div", {
    className: "absolute inset-x-2 bottom-2 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-surface, transparent) p-2 shadow-lg backdrop-blur-sm",
    children: [
      jsxs("div", {
        className: "flex items-center justify-between gap-2",
        children: [
          jsx("div", { className: "text-xs font-medium", children: "Hermes needs you" }),
          jsx("div", {
            className: "text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)",
            children: "game held"
          })
        ]
      }),
      approval.description ? jsx("div", {
        className: "mt-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)",
        style: { wordBreak: "break-word" },
        children: approval.description
      }) : null,
      // The command is what is actually being approved, so it is shown in
      // full and scrollable. Clipping it let a user approve text they could
      // not read; showing only the description did the same. Scrolls rather
      // than truncates, and renders whenever there is a command to read.
      approval.command ? jsx("pre", {
        className: "mt-1 max-h-36 overflow-y-auto rounded bg-black/35 p-1.5 font-mono text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)",
        style: { whiteSpace: "pre-wrap", wordBreak: "break-word" },
        tabIndex: 0,
        children: approval.command
      }) : null,
      jsx("div", {
        className: "mt-2 flex flex-wrap gap-1.5",
        children: (approval.choices?.length ? approval.choices : ["once", "deny"]).map(
          (choice) => jsx(
            "button",
            {
              type: "button",
              className: cn(
                "rounded border border-(--ui-stroke-secondary) px-2 py-1 text-[length:var(--conversation-caption-font-size)]",
                choice === "deny" ? "text-(--ui-text-tertiary)" : "text-(--ui-text-secondary)"
              ),
              onClick: () => void answerApproval(choice),
              children: CHOICE_LABELS[choice] ?? choice
            },
            choice
          )
        )
      })
    ]
  }) : null;
  const pausedHint = !showApproval && state.status === STATUS.IDLE && current ? jsx("div", {
    className: "pointer-events-none absolute inset-x-0 bottom-1 flex justify-center",
    children: jsx("div", {
      className: "rounded bg-(--ui-surface, transparent) px-2 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)",
      children: "the agent is back"
    })
  }) : null;
  const userPausedOverlay = state.status === STATUS.PAUSED_BY_USER ? jsx("div", {
    className: "absolute inset-0 flex items-center justify-center",
    children: jsx("button", {
      type: "button",
      className: "rounded-full border border-(--ui-stroke-secondary) px-3 py-1.5 text-xs text-(--ui-text-secondary) backdrop-blur-sm",
      onClick: () => dispatch({ type: "user-toggle-play" }),
      children: "\u25B6 resume"
    })
  }) : null;
  const HB = {
    plate: "linear-gradient(180deg, #3b4045 0%, #23272a 100%)",
    plateEdge: "#101214",
    pad: "linear-gradient(180deg, #3c4046 0%, #24272b 100%)",
    padDown: "linear-gradient(180deg, #1b1e21 0%, #2c3034 100%)",
    padEdge: "#141618",
    padGlyph: "#b9bfc4",
    key: "linear-gradient(180deg, #e0668e 0%, #b3305c 100%)",
    keyDown: "linear-gradient(180deg, #9c2650 0%, #7f1d40 100%)",
    keyEdge: "#751a3a",
    pill: "linear-gradient(180deg, #4c5054 0%, #2a2d30 100%)",
    pillDown: "linear-gradient(180deg, #24272a 0%, #3a3e42 100%)",
    pillEdge: "#151719",
    print: "#8d9398"
  };
  const padHandlers = (button) => ({
    onPointerDown: (event) => {
      event.preventDefault();
      pressButton(button);
      canvasRef.current?.focus();
    },
    onPointerUp: () => releaseButton(button),
    onPointerLeave: () => releaseButton(button),
    onPointerCancel: () => releaseButton(button),
    // The deck must never hold focus: keyboard input belongs to the canvas, and
    // a focused pad button draws the browser's focus ring over the hardware
    // styling (which showed up as a blue square on the pressed key).
    onFocus: (event) => event.currentTarget.blur(),
    onContextMenu: (event) => event.preventDefault()
  });
  const pressable = (button, extra = {}) => ({
    role: "button",
    tabIndex: 0,
    "aria-label": BUTTON_LABELS[button],
    "aria-pressed": Boolean(pressed[button]),
    title: `${BUTTON_LABELS[button]} \u2014 ${labelForCode(preferences.bindings[button])}`,
    ...padHandlers(button),
    ...extra
  });
  const padStyle = (button, pos) => ({
    position: "absolute",
    ...pos,
    width: "22px",
    height: "22px",
    padding: 0,
    borderRadius: "4px",
    outline: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
    border: `1px solid ${HB.padEdge}`,
    background: pressed[button] ? HB.padDown : HB.pad,
    color: HB.padGlyph,
    fontSize: "8px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: pressed[button] ? "translateY(1px)" : "none",
    boxShadow: pressed[button] ? "inset 0 2px 5px rgba(0,0,0,0.65)" : "inset 0 1px 0 rgba(255,255,255,0.14), 0 1px 2px rgba(0,0,0,0.55)",
    transition: "background 50ms linear, transform 50ms linear"
  });
  const padKey = (button, pos, glyph) => jsx("div", pressable(button, { style: padStyle(button, pos), children: glyph }), button);
  const dPad = jsxs("div", {
    className: "relative shrink-0",
    style: { width: "66px", height: "66px" },
    children: [
      jsx("div", {
        style: {
          position: "absolute",
          top: "22px",
          left: "22px",
          width: "22px",
          height: "22px",
          background: HB.pad,
          borderTop: `1px solid ${HB.padEdge}`,
          borderLeft: `1px solid ${HB.padEdge}`
        }
      }),
      padKey("UP", { top: 0, left: 22 }, "\u2191"),
      padKey("LEFT", { top: 22, left: 0 }, "\u2190"),
      padKey("RIGHT", { top: 22, left: 44 }, "\u2192"),
      padKey("DOWN", { top: 44, left: 22 }, "\u2193")
    ]
  });
  const keyStyle = (button) => ({
    width: "30px",
    height: "30px",
    padding: 0,
    borderRadius: "50%",
    outline: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
    border: `1px solid ${HB.keyEdge}`,
    background: pressed[button] ? HB.keyDown : HB.key,
    color: "#fff6f9",
    fontSize: "10px",
    fontWeight: 700,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: pressed[button] ? "translateY(1px)" : "none",
    boxShadow: pressed[button] ? "inset 0 3px 6px rgba(0,0,0,0.5)" : "inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 3px rgba(0,0,0,0.55)",
    transition: "background 50ms linear, transform 50ms linear"
  });
  const pillStyle = (button) => ({
    width: "30px",
    height: "9px",
    padding: 0,
    borderRadius: "5px",
    outline: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
    border: `1px solid ${HB.pillEdge}`,
    background: pressed[button] ? HB.pillDown : HB.pill,
    transform: pressed[button] ? "translateY(1px)" : "none",
    boxShadow: pressed[button] ? "inset 0 2px 4px rgba(0,0,0,0.6)" : "inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.5)",
    transition: "background 50ms linear, transform 50ms linear"
  });
  const selectStart = jsxs("div", {
    className: "flex items-start gap-2",
    children: ["SELECT", "START"].map(
      (button) => jsxs(
        "div",
        {
          className: "flex flex-col items-center",
          style: { gap: "3px" },
          children: [
            jsx("div", pressable(button, { style: pillStyle(button) }), button),
            jsx("span", {
              style: { color: HB.print, fontSize: "6px", letterSpacing: "0.08em" },
              children: button
            })
          ]
        },
        button
      )
    )
  });
  const abGroup = jsxs("div", {
    className: "flex items-end gap-2",
    // The DMG offsets A above B at an angle; the letters themselves stay upright.
    style: { transform: "rotate(-24deg)" },
    children: [
      jsx(
        "div",
        pressable("B", {
          style: { ...keyStyle("B"), marginTop: "12px" },
          children: jsx("span", { style: { display: "block", transform: "rotate(24deg)" }, children: "B" })
        }),
        "B"
      ),
      jsx(
        "div",
        pressable("A", {
          style: keyStyle("A"),
          children: jsx("span", { style: { display: "block", transform: "rotate(24deg)" }, children: "A" })
        }),
        "A"
      )
    ]
  });
  const arrowGlyph = (code) => String(code).startsWith("Arrow") ? "\u2191\u2193\u2190\u2192" : labelForCode(code);
  const legend = [
    `D-pad = ${arrowGlyph(preferences.bindings.UP)}`,
    `A = ${labelForCode(preferences.bindings.A)}`,
    `B = ${labelForCode(preferences.bindings.B)}`,
    `Start = ${labelForCode(preferences.bindings.START)}`,
    `Select = ${labelForCode(preferences.bindings.SELECT)}`
  ].join("  \xB7  ");
  const controlDeck = jsxs("div", {
    className: "mx-2 mt-1 rounded-lg px-3 py-2",
    style: {
      background: HB.plate,
      border: `1px solid ${HB.plateEdge}`,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 1px 2px rgba(0,0,0,0.45)"
    },
    children: [
      jsxs("div", {
        className: "flex items-center justify-between gap-3",
        children: [dPad, selectStart, abGroup]
      }),
      jsx("div", {
        className: "mt-1.5 text-center text-[length:var(--conversation-caption-font-size)] leading-tight",
        style: { color: HB.print },
        title: "Keyboard bindings \u2014 rebind in Settings \u2192 Plugins \u2192 Cartridge \u2192 Controls",
        children: legend
      })
    ]
  });
  const focusHint = !empty && !canvasFocused ? jsx("div", {
    className: "pointer-events-none absolute inset-x-0 top-1 flex justify-center",
    children: jsx("div", {
      className: "rounded bg-(--ui-surface, transparent) px-2 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)",
      children: "click the game to use the keyboard"
    })
  }) : null;
  const savePanel = savesOpen ? jsxs("div", {
    className: "absolute inset-x-2 top-2 z-10 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-surface, transparent) p-2 shadow-lg",
    children: [
      jsx("div", {
        className: "mb-1 flex items-center justify-between text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)",
        children: jsx("span", { children: "save states" })
      }),
      ...SLOTS.map(
        (slot) => jsxs(
          "div",
          {
            className: "flex items-center justify-between gap-2 py-0.5",
            children: [
              jsx("span", { className: "text-xs text-(--ui-text-tertiary)", children: `slot ${slot}` }),
              jsxs("span", {
                className: "flex gap-1",
                children: [
                  jsx("button", {
                    type: "button",
                    className: "rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)",
                    onClick: () => void writeSlot(slot),
                    children: "save"
                  }),
                  jsx("button", {
                    type: "button",
                    className: "rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)",
                    onClick: () => void readSlot(slot),
                    children: "load"
                  })
                ]
              })
            ]
          },
          slot
        )
      ),
      jsx("div", {
        className: "mt-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)",
        children: "an automatic slot is written when the agent interrupts"
      })
    ]
  }) : null;
  return jsxs("div", {
    ref: rootRef,
    className: "flex h-full min-h-0 flex-col text-(--ui-text-primary)",
    tabIndex: 0,
    onPointerDown: () => {
      paneFocusRef.current = true;
      if (phase.get() !== "empty") canvasRef.current?.focus();
    },
    onFocus: () => {
      paneFocusRef.current = true;
    },
    onBlur: (event) => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      setCanvasFocused(false);
      if (!paneFocusRef.current) clearHeld();
    },
    onDragOver: (event) => event.preventDefault(),
    onDrop,
    children: [
      jsxs("div", {
        className: "flex items-center justify-between gap-2 px-2 py-1",
        children: [
          jsxs("div", {
            className: "flex min-w-0 items-center gap-1.5",
            children: [
              jsx(StatusDot, { tone: statusTone }),
              jsx("span", {
                className: "truncate text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)",
                children: current ? displayName(current.name) : "no cartridge"
              }),
              current?.isGBC ? jsx("span", {
                className: "rounded-sm border border-(--ui-stroke-secondary) px-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)",
                children: "COLOUR"
              }) : null
            ]
          }),
          jsxs("div", {
            className: "flex items-center gap-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)",
            children: [
              jsx("span", { children: statusLabel }),
              jsx("span", { children: formatServed(servedToday.ms) })
            ]
          })
        ]
      }),
      jsxs("div", {
        ref: containerRef,
        className: "relative m-1 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-(--ui-stroke-secondary)",
        onClick: () => canvasRef.current?.focus(),
        children: [canvas, emptyState, errorState, userPausedOverlay, pausedHint, focusHint, approvalCard, savePanel]
      }),
      controlDeck,
      jsxs("div", {
        className: "flex flex-wrap items-center gap-1.5 px-2 pb-1.5",
        children: [
          jsx("button", {
            type: "button",
            className: "rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)",
            onClick: () => dispatch({ type: "mode-toggle" }),
            title: state.mode === MODE_ALWAYS ? "Always-on: the game keeps playing through turns and approvals" : "Interrupted: play during a turn, pause for approvals",
            children: state.mode === MODE_ALWAYS ? "always on" : "interrupted"
          }),
          jsx("button", {
            type: "button",
            className: "rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)",
            onClick: () => void writeSlot("1"),
            title: "Save to slot 1",
            children: "save"
          }),
          jsx("button", {
            type: "button",
            className: "rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)",
            onClick: () => setSavesOpen((open) => !open),
            title: "All save slots",
            children: "saves"
          }),
          jsx("button", {
            type: "button",
            className: "rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)",
            onClick: () => setPrefs({ audio: !preferences.audio }),
            title: preferences.audio ? "Mute" : "Unmute",
            children: preferences.audio ? "audio on" : "muted"
          }),
          jsx("span", { className: "flex-1" }),
          jsx("button", {
            type: "button",
            className: "rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)",
            onClick: () => fileInputRef.current?.click(),
            children: "open\u2026"
          }),
          notice ? jsx("span", {
            className: "w-full truncate pt-0.5 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)",
            children: notice
          }) : null
        ]
      }),
      jsx("input", {
        ref: fileInputRef,
        type: "file",
        accept: ".gb,.gbc",
        style: { display: "none" },
        onChange: (event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
          event.target.value = "";
        }
      })
    ]
  });
}

// src/menu/surfaces.js
import {
  host as host2,
  useValue as useValue2,
  cn as cn2,
  ToggleRow,
  ListRow,
  SegmentedControl,
  PALETTE_AREA,
  STATUSBAR_AREAS
} from "@hermes/plugin-sdk";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
import { useRef as useRef2, useState as useState2 } from "react";
var MODE_OPTIONS = [
  { id: "interrupted", label: "Interrupted" },
  { id: "always", label: "Always on" }
];
var SCALE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "2x", label: "2\xD7" },
  { id: "3x", label: "3\xD7" },
  { id: "4x", label: "4\xD7" }
];
function modeLabel(mode) {
  return mode === MODE_ALWAYS ? "always" : "interrupted";
}
function toneFor(status) {
  if (status === STATUS.PLAYING) return "text-(--ui-accent)";
  if (status === STATUS.INTERRUPTED) return "text-(--ui-text-secondary)";
  return "text-(--ui-text-quaternary)";
}
function glyphFor(state) {
  if (state.status === STATUS.INTERRUPTED) return "\u275A\u275A";
  if (state.status === STATUS.PLAYING) return "\u25B6";
  if (state.status === STATUS.PAUSED_BY_USER) return "\u275A\u275A";
  return "\u25FC";
}
function StatusChip() {
  const state = useValue2(busy);
  const today = useValue2(served);
  const cartridge = useValue2(rom);
  const title = cartridge ? `${displayName(cartridge.name)} \xB7 ${modeLabel(state.mode)} \xB7 ${formatServed(today.ms)} played while the agent worked today` : `Cartridge \xB7 ${modeLabel(state.mode)} \xB7 ${formatServed(today.ms)} played while the agent worked today`;
  return jsxs2("button", {
    type: "button",
    title,
    className: cn2(
      "inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem]",
      toneFor(state.status),
      "hover:underline"
    ),
    onClick: () => {
      dispatch({ type: "user-toggle-play" });
    },
    children: [
      jsx2("span", { "aria-hidden": true, children: glyphFor(state) }),
      jsx2("span", { children: formatServed(today.ms) })
    ]
  });
}
function BindingRow({ button }) {
  const preferences = useValue2(prefs);
  const [listening, setListening] = useState2(false);
  const [warning, setWarning] = useState2("");
  const cleanupRef = useRef2(null);
  const start = () => {
    setListening(true);
    setWarning("");
    const onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setListening(false);
        cleanup();
        return;
      }
      const clash = conflictFor(preferences.bindings, event.code, button);
      if (clash) {
        setWarning(`${labelForCode(event.code)} is already ${BUTTON_LABELS[clash]}`);
        setListening(false);
        cleanup();
        return;
      }
      setPrefs({ bindings: { ...preferences.bindings, [button]: event.code } });
      setListening(false);
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener("keydown", onKey, true);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    window.addEventListener("keydown", onKey, true);
  };
  return jsx2(ListRow, {
    title: BUTTON_LABELS[button],
    description: warning || (listening ? "press a key, Escape to cancel" : void 0),
    action: jsx2("button", {
      type: "button",
      className: "rounded border border-(--ui-stroke-secondary) px-2 py-0.5 text-xs text-(--ui-text-secondary)",
      onClick: start,
      children: listening ? "listening\u2026" : labelForCode(preferences.bindings[button])
    })
  });
}
function GeneralSettings() {
  const preferences = useValue2(prefs);
  return jsxs2("div", {
    children: [
      jsx2(ListRow, {
        title: "Default mode",
        description: "Interrupted plays only during a turn and pauses the instant an approval arrives. Always on keeps playing through both.",
        action: jsx2(SegmentedControl, {
          value: preferences.mode,
          options: MODE_OPTIONS,
          onChange: (value) => setPrefs({ mode: value })
        })
      }),
      jsx2(ToggleRow, {
        label: "Audio",
        description: "Starts on your first click in the pane. Muting keeps the core running silently.",
        checked: preferences.audio,
        onChange: (value) => setPrefs({ audio: value })
      }),
      jsx2(ListRow, {
        title: "Palette",
        description: "Monochrome cartridges only. Colour cartridges always use their own colours.",
        action: jsx2(SegmentedControl, {
          value: preferences.palette,
          options: [
            { id: "pocket", label: "Pocket" },
            { id: "grey", label: "Grey" },
            { id: "green", label: "Green" }
          ],
          onChange: (value) => setPrefs({ palette: value })
        })
      }),
      jsx2(ListRow, {
        title: "Scale",
        description: "Integer scaling only \u2014 no blurry pixels. Auto fits the pane.",
        action: jsx2(SegmentedControl, {
          value: preferences.scale,
          options: SCALE_OPTIONS,
          onChange: (value) => setPrefs({ scale: value })
        })
      }),
      jsx2(ToggleRow, {
        label: "Remember the last cartridge",
        description: "Stores the ROM in the plugin\u2019s own data folder so the pane reopens with it. Off by default; forgetting it deletes the copy.",
        checked: preferences.rememberRom,
        onChange: (value) => setPrefs({ rememberRom: value })
      })
    ]
  });
}
function CartridgeSettings() {
  const cartridge = useValue2(rom);
  const preferences = useValue2(prefs);
  const [message, setMessage] = useState2("");
  const forget = async () => {
    const saved = worker.ctx?.storage.get("rom.remembered", null);
    if (!saved) {
      setMessage("No stored cartridge to forget.");
      return;
    }
    await worker.saves?.forgetRom(saved);
    setMessage("Stored cartridge deleted.");
  };
  return jsxs2("div", {
    children: [
      jsx2(ListRow, {
        title: "Loaded cartridge",
        description: cartridge ? `${displayName(cartridge.name)} \xB7 ${cartridge.isGBC ? "Colour" : "Mono"} \xB7 ${formatBytes(cartridge.size)} \xB7 ${cartridge.mapper}` : "Nothing loaded. Drop a .gb or .gbc into the pane.",
        action: jsx2("button", {
          type: "button",
          className: "rounded border border-(--ui-stroke-secondary) px-2 py-0.5 text-xs text-(--ui-text-secondary)",
          onClick: () => {
            if (!runCommand("loadFile")) setMessage("Open the Cartridge pane first.");
          },
          children: "Open\u2026"
        })
      }),
      jsx2(ListRow, {
        title: "Fingerprint",
        description: cartridge?.sha256 ?? "SHA-256 of the cartridge bytes; save slots key off it."
      }),
      jsx2(ListRow, {
        title: "Stored cartridge",
        description: message || "ROMs are never uploaded. Cartridge makes no network calls.",
        action: jsx2("button", {
          type: "button",
          className: "rounded border border-(--ui-stroke-secondary) px-2 py-0.5 text-xs text-(--ui-text-secondary)",
          onClick: () => void forget(),
          children: "Forget"
        })
      }),
      jsx2(ListRow, {
        title: "Core",
        description: `jsGBC-core (MIT) \xB7 ${worker.core?.coreVersion?.() ?? "jsgbc-core@0.7.0+0d2c721"}`,
        action: jsx2("span", {
          className: "text-[length:var(--conversation-caption-font-size)] text-(--ui-text-quaternary)",
          children: preferences.audio ? "audio on" : "muted"
        })
      })
    ]
  });
}
function KeysSettings() {
  return jsx2("div", {
    children: BUTTON_ORDER.map((button) => jsx2(BindingRow, { button }, button))
  });
}
function registerSettings(ctx) {
  const colours = Object.keys(PALETTES).join(", ");
  ctx.registerSettingsPage?.({
    id: "cartridge",
    title: "Cartridge",
    icon: "device-gamepad",
    order: 40,
    render: () => jsx2(GeneralSettings, {}),
    children: [
      { id: "cartridge", title: "Cartridge", render: () => jsx2(CartridgeSettings, {}) },
      { id: "keys", title: "Controls", render: () => jsx2(KeysSettings, {}) },
      {
        id: "about",
        title: "About",
        render: () => jsxs2("div", {
          children: [
            jsx2(ListRow, {
              title: "Cartridge 0.1.0",
              description: "A handheld ROM pane that plays while the agent works and holds the frame when it needs you."
            }),
            jsx2(ListRow, {
              title: "No ROMs, no network",
              description: "Ships no games and no commercial ROMs. One WTFPL self-test cartridge is included. The pane never makes an outbound call.",
              action: jsx2("button", {
                type: "button",
                className: "rounded border border-(--ui-stroke-secondary) px-2 py-0.5 text-xs text-(--ui-text-secondary)",
                onClick: () => void runCommand("loadSelftest"),
                children: "Run self-test"
              })
            }),
            jsx2(ListRow, { title: "Palettes", description: colours }),
            jsx2(ListRow, {
              title: "Licences",
              description: "Plugin MIT \xB7 jsGBC-core MIT (ardean) \xB7 self-test ROM WTFPL (flozz)"
            })
          ]
        })
      }
    ]
  });
}
function paletteCommand(id, label, keywords, run) {
  return {
    id: `cartridge.${id}`,
    area: PALETTE_AREA,
    data: { id: `cartridge.${id}`, label, keywords: ["cartridge", "handheld", "rom", ...keywords], run }
  };
}
var NOT_OPEN = "Open the Cartridge pane first (it lives on the right).";
function registerPalette(ctx) {
  ctx.registerMany([
    paletteCommand("open", "Cartridge: Open a ROM\u2026", ["rom", "gb", "gbc", "load"], () => {
      if (!runCommand("loadFile")) host2.notify({ kind: "info", message: NOT_OPEN });
    }),
    paletteCommand("selftest", "Cartridge: Load self-test cartridge", ["rom", "test"], () => {
      if (!runCommand("loadSelftest")) host2.notify({ kind: "info", message: NOT_OPEN });
    }),
    paletteCommand("mode", "Cartridge: Toggle always-on mode", ["mode", "pause", "interrupt"], () => {
      if (!runCommand("toggleMode")) dispatch({ type: "mode-toggle" });
      host2.notify({ kind: "info", message: `Cartridge is ${modeLabel(busy.get().mode)}.` });
    }),
    paletteCommand("play", "Cartridge: Pause or resume", ["pause", "resume", "play"], () => {
      if (!runCommand("togglePlay")) dispatch({ type: "user-toggle-play" });
    }),
    paletteCommand("mute", "Cartridge: Mute or unmute", ["audio", "mute", "sound"], () => {
      if (!runCommand("toggleMute")) setPrefs({ audio: !prefs.get().audio });
      host2.notify({ kind: "info", message: prefs.get().audio ? "Cartridge audio on." : "Cartridge muted." });
    }),
    paletteCommand("save", "Cartridge: Save state to slot 1", ["save", "state"], () => {
      if (!runCommand("saveSlot")) host2.notify({ kind: "info", message: NOT_OPEN });
    })
  ]);
}
function registerStatusChip(ctx) {
  ctx.register({
    id: "chip",
    area: STATUSBAR_AREAS.right,
    order: 120,
    render: () => jsx2(StatusChip, {})
  });
}

// src/plugin.js
var PLUGIN_ID = "cartridge";
var PANE_ID = `${PLUGIN_ID}:pane`;
var plugin_default = {
  id: PLUGIN_ID,
  name: "Cartridge",
  register(ctx) {
    hydrate(ctx);
    const unsubscribe = host3.state.busy.subscribe((value) => {
      dispatch({ type: "turn-busy", value: Boolean(value) });
    });
    ctx.onDispose(unsubscribe);
    ctx.onEvent("approval.request", (event) => {
      const prompt = event?.payload ?? {};
      if (prompt.kind && prompt.kind !== "approval") return;
      const approval = { ...prompt, session_id: event?.session_id ?? null };
      dispatch({ type: "approval", value: true, approval });
      try {
        const visible = typeof host3.paneVisibility === "function" ? host3.paneVisibility(PANE_ID).get() : true;
        if (!visible) {
          ctx.os?.notify?.({
            title: "Hermes needs an approval",
            body: prompt.description || prompt.command || "Open Cartridge to see the request."
          });
        }
      } catch {
      }
    });
    ctx.onEvent("approval.settled", () => dispatch({ type: "approval-cleared" }));
    ctx.onEvent("clarify.request", (event) => {
      dispatch({
        type: "approval",
        value: true,
        approval: { ...event?.payload ?? {}, session_id: event?.session_id ?? null, kind: "clarify" }
      });
    });
    ctx.onEvent("clarify.settled", () => dispatch({ type: "approval-cleared" }));
    ctx.register({
      id: "pane",
      area: PANES_AREA,
      title: "cartridge",
      data: { placement: "right", width: "380px" },
      render: () => jsx3(CartridgePane, {})
    });
    registerStatusChip(ctx);
    registerPalette(ctx);
    registerSettings(ctx);
    ctx.setInterval(() => flushServed(), 15e3);
    ctx.onDispose(() => flushServed());
  }
};
export {
  plugin_default as default
};
