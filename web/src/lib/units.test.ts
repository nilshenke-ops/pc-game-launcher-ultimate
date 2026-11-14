import { describe, expect, it } from "vitest";
import { dataSize, fileSpeed, mbit, netSpeed } from "./units";

describe("Einheiten", () => {
  it("Netzwerk in Mbit/s (Bits, nicht Bytes)", () => {
    expect(netSpeed(15_625_000)).toBe("125 Mbit/s");    // 15,6 MB/s = 125 Mbit/s
    expect(netSpeed(3_000_000)).toBe("24 Mbit/s");
    expect(netSpeed(1_050_000)).toBe("8,4 Mbit/s");
    expect(netSpeed(80_000)).toBe("640 kbit/s");
    expect(netSpeed(150_000_000)).toBe("1,2 Gbit/s");
    expect(netSpeed(null)).toBe("–");
    expect(mbit(15_625_000)).toBe(125);
  });
  it("Dateien und Laufwerke in MB/s, Mengen in MB/GB", () => {
    expect(fileSpeed(540_000_000)).toBe("540 MB/s");
    expect(fileSpeed(12_500_000)).toBe("12,5 MB/s");
    expect(fileSpeed(300_000)).toBe("300 KB/s");
    expect(dataSize(12_400_000_000)).toBe("12,4 GB");
    expect(dataSize(850_000_000)).toBe("850 MB");
    expect(dataSize(1_200_000_000_000)).toBe("1,2 TB");
  });
});
