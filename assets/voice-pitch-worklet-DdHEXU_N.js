// Real-time pitch shifter for the voice changer (runs in an AudioWorklet, one block of 128 samples at a time).
// Two read heads travel through a short delay line; each fades in and out with a raised-cosine window, so the heads always add up to 1.
// A head moves at "ratio" times the speed of the writing position: ratio 1.5 = a fifth higher, 0.5 = an octave lower. Speech keeps its speed.
// The core is a plain class so it can be tested without a browser.

export class PitchShifterCore {
  /** @param {number} sampleRate */
  constructor(sampleRate = 48000) {
    this.size = 16384;                              // delay line (power of two)
    this.mask = this.size - 1;
    this.buf = new Float32Array(this.size);
    this.w = 0;                                     // write position
    this.win = Math.max(256, Math.round(sampleRate * 0.045));   // window length: ~45 ms
    this.base = 24;                                 // never read the very newest samples
    this.phase = 0;                                 // 0..1, position of the first head in its window
  }

  read(pos) {
    const i = Math.floor(pos), f = pos - i;
    const a = this.buf[i & this.mask], b = this.buf[(i + 1) & this.mask];
    return a + (b - a) * f;
  }

  /**
   * @param {Float32Array | null | undefined} input  samples in (null = silence)
   * @param {Float32Array} output samples out (same length)
   * @param {number} ratio pitch factor, 0.25 … 4
   */
  process(input, output, ratio) {
    const r = Math.min(4, Math.max(0.25, Number.isFinite(ratio) ? ratio : 1));
    const n = output.length, W = this.win;
    for (let i = 0; i < n; i++) {
      this.buf[this.w & this.mask] = input ? input[i] : 0;
      const p1 = this.phase, p2 = (p1 + 0.5) % 1;
      const g1 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p1), g2 = 1 - g1;
      output[i] = this.read(this.w - (this.base + p1 * W)) * g1 + this.read(this.w - (this.base + p2 * W)) * g2;
      this.w++;
      this.phase += (1 - r) / W;
      this.phase -= Math.floor(this.phase);
    }
  }
}

/* eslint-disable no-undef */
if (typeof registerProcessor === "function") {
  class PglPitch extends AudioWorkletProcessor {
    static get parameterDescriptors() { return [{ name: "ratio", defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: "k-rate" }]; }
    constructor() { super(); this.core = new PitchShifterCore(sampleRate); }
    process(inputs, outputs, parameters) {
      const out = outputs[0] && outputs[0][0];
      if (!out) return true;
      this.core.process(inputs[0] && inputs[0][0], out, parameters.ratio[0]);
      return true;
    }
  }
  registerProcessor("pgl-pitch", PglPitch);
}
