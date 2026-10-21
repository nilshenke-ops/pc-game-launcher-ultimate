// Remote desktop sound: plays the PC's 16-bit PCM chunks with a short buffer (≈150 ms). Browsers (above all iPhone/iPad)
// only allow sound after a tap, so start() must be called from a click.

/** Base64 16-bit little-endian interleaved PCM → one Float32Array per channel. */
export function pcmToChannels(b64: string, channels: number): Float32Array<ArrayBuffer>[] {
  const bin = atob(b64);
  const n = Math.floor(bin.length / 2 / channels);
  const out = Array.from({ length: channels }, () => new Float32Array(new ArrayBuffer(n * 4)));
  for (let i = 0; i < n; i++)
    for (let c = 0; c < channels; c++) {
      const o = (i * channels + c) * 2;
      let v = bin.charCodeAt(o) | (bin.charCodeAt(o + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      out[c][i] = v / 32768;
    }
  return out;
}

export class RemoteAudio {
  static readonly LEAD = 0.15;
  static readonly MAX_AHEAD = 0.6;
  private ctx: AudioContext;
  private gain: GainNode;
  private next = 0;
  played = 0;
  dropped = 0;

  constructor(volume: number) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(this.ctx.destination);
    void this.ctx.resume();
  }

  /** Buffered sound in ms (how far playback is ahead of now). */
  get bufferMs() { return Math.max(0, Math.round((this.next - this.ctx.currentTime) * 1000)); }

  setVolume(v: number) { this.gain.gain.value = Math.max(0, Math.min(1, v)); }

  push(b64: string, rate: number, channels: number) {
    const data = pcmToChannels(b64, channels);
    if (!data[0]?.length) return;
    const buf = this.ctx.createBuffer(channels, data[0].length, rate);
    data.forEach((d, c) => buf.copyToChannel(d, c));
    const now = this.ctx.currentTime;
    // Too far behind (gap) or ahead (piled up after a stall): start again close to "now" so sound stays near the picture.
    if (this.next < now || this.next - now > RemoteAudio.MAX_AHEAD) { if (this.next - now > RemoteAudio.MAX_AHEAD) this.dropped++; this.next = now + RemoteAudio.LEAD; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    src.start(this.next);
    this.next += buf.duration;
    this.played++;
  }

  close() { void this.ctx.close().catch(() => {}); }
}
