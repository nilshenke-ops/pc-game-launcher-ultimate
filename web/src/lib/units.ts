// Units used everywhere the PC's values are shown (3.66), so nothing is mixed up:
// - network speed in Mbit/s (bits – what providers and speed tests use),
// - file and drive speed in MB/s (bytes),
// - amounts of data in MB / GB.
// The companion always sends bytes; the conversion happens only here.

const de = (n: number, digits: number) => n.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Bytes per second of a network connection → "125 Mbit/s", "8,4 Mbit/s", "640 kbit/s". */
export function netSpeed(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond)) return "–";
  const bits = Math.max(0, bytesPerSecond) * 8;
  if (bits >= 1e9) return `${de(bits / 1e9, 2)} Gbit/s`;
  if (bits >= 1e6) return `${de(bits / 1e6, bits >= 1e8 ? 0 : 1)} Mbit/s`;
  return `${de(Math.round(bits / 1e3), 0)} kbit/s`;
}

/** Megabits per second as a plain number (for charts). */
export const mbit = (bytesPerSecond: number) => (bytesPerSecond * 8) / 1e6;

/** Bytes per second of a file or a drive → "540 MB/s", "12,5 MB/s", "300 KB/s". */
export function fileSpeed(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond)) return "–";
  const b = Math.max(0, bytesPerSecond);
  if (b >= 1e9) return `${de(b / 1e9, 2)} GB/s`;
  if (b >= 1e6) return `${de(b / 1e6, b >= 1e8 ? 0 : 1)} MB/s`;
  return `${de(Math.round(b / 1e3), 0)} KB/s`;
}

/** An amount of data → "850 MB", "12,4 GB", "1,2 TB" (decimal units, like Windows' drive sizes are sold). */
export function dataSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "–";
  const b = Math.max(0, bytes);
  if (b >= 1e12) return `${de(b / 1e12, 2)} TB`;
  if (b >= 1e9) return `${de(b / 1e9, 1)} GB`;
  if (b >= 1e6) return `${de(b / 1e6, 0)} MB`;
  return `${de(Math.round(b / 1e3), 0)} KB`;
}
