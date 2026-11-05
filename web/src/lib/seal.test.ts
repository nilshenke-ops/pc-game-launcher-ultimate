import { describe, expect, it } from "vitest";
import { sealSecret } from "./seal";

// The same vector is checked in the companion (SecretSealTests) – both sides must produce and open exactly this.
export const VECTOR = { token: "tok-1234", nonce: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff", purpose: "ai.key:openrouter", secret: "sk-or-v1-0123456789abcdef0123456789", iv: "000102030405060708090a0b0c0d0e0f" };

describe("Schlüssel versiegeln (Handy → PC)", () => {
  it("Testvektor (identisch im Begleiter)", () => {
    const iv = Uint8Array.from(VECTOR.iv.match(/../g)!.map((x) => parseInt(x, 16)));
    const s = sealSecret(VECTOR.token, VECTOR.nonce, VECTOR.purpose, VECTOR.secret, iv);
    expect(s).toMatchInlineSnapshot(`
      {
        "ct": "b616db9badb93c8d5d9c75afcb248fa7dbf330af558aad61fb200f4f70aa0a007b94b2",
        "iv": "000102030405060708090a0b0c0d0e0f",
        "tag": "b852acc761a6b6311c7d3b9e31fce5fd89a51274b5622c6a04aa7b8ef52ed7f1",
      }
    `);
  });
  it("jedes Mal anders (zufälliger Start), Klartext steht nicht darin", () => {
    const a = sealSecret(VECTOR.token, VECTOR.nonce, VECTOR.purpose, VECTOR.secret), b = sealSecret(VECTOR.token, VECTOR.nonce, VECTOR.purpose, VECTOR.secret);
    expect(a.ct).not.toBe(b.ct);
    expect(JSON.stringify(a)).not.toContain("sk-or");
    expect(a.ct).toHaveLength(VECTOR.secret.length * 2);
  });
  it("andere Sitzung oder anderer Zweck ergeben andere Bytes und anderen Tag", () => {
    const iv = new Uint8Array(16);
    const base = sealSecret(VECTOR.token, VECTOR.nonce, VECTOR.purpose, VECTOR.secret, iv);
    expect(sealSecret(VECTOR.token, "ff".repeat(32), VECTOR.purpose, VECTOR.secret, iv).tag).not.toBe(base.tag);
    expect(sealSecret(VECTOR.token, VECTOR.nonce, "ai.key:groq", VECTOR.secret, iv).tag).not.toBe(base.tag);
    expect(sealSecret("anderes-token", VECTOR.nonce, VECTOR.purpose, VECTOR.secret, iv).ct).not.toBe(base.ct);
  });
  it("leer oder zu lang wird abgelehnt", () => {
    expect(() => sealSecret("t", "00".repeat(32), "p", "")).toThrow();
    expect(() => sealSecret("t", "00".repeat(32), "p", "x".repeat(401))).toThrow();
  });
});
