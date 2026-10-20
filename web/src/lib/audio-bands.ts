// Pure helper of the music visualizer (components/visualizer.tsx).

/** Bar heights 0..1 from the analyser bytes, grouped into n bands on a log scale (low notes get more room, like the ear). */
export function bands(data: Uint8Array, n: number): number[] {
  const out: number[] = [];
  const max = data.length;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(Math.pow(max, i / n)), b = Math.max(a + 1, Math.floor(Math.pow(max, (i + 1) / n)));
    let sum = 0;
    for (let k = a; k < b && k < max; k++) sum += data[k];
    out.push(sum / ((Math.min(b, max) - a) || 1) / 255);
  }
  return out;
}
