import MBC5 from "./MBC5";

export default class RUMBLE extends MBC5 {
  writeRamBank = (address: number, data: number) => {
    // MBC5 RAM bank switching
    if (data & 0x08) this.emit("rumble");
    data &= 0x7;

    // PATCHED (Cartridge): upstream called `super.writeRamBank(...)` here, but
    // MBC5 declares writeRamBank as an instance field, not a prototype method,
    // so `super.writeRamBank` is undefined and every RUMBLE cartridge throws
    // "(intermediate value).writeRamBank is not a function". MBC5 ignores the
    // address and does exactly this. See THIRD_PARTY.md.
    this.currentMbcRamBank = data & 0xf;
    this.currentRamBankPosition = (this.currentMbcRamBank << 13) - 0xa000;
  };
}
