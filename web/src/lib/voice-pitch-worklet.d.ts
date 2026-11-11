export class PitchShifterCore {
  constructor(sampleRate?: number);
  process(input: Float32Array | null | undefined, output: Float32Array, ratio: number): void;
}
