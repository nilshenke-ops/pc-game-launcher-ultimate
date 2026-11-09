import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloudAccountConfigured, cloudApi, cloudDelete, cloudHealth, cloudLoad, cloudLogin, cloudRegister, cloudSave, customCloudApi, pendingBlob, setCustomCloudApi, setPendingBlob } from "./cloud-account";

const BASE = "https://cloud.example.workers.dev";
const KEY = "aa".repeat(32);

let calls: { url: string; init: RequestInit }[];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Answers one request per call, in order. */
function stub(...answers: (Response | Error)[]) {
  const queue = [...answers];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error("unexpected request: " + url);
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  calls = [];
  setCustomCloudApi(null);
  setPendingBlob(null);
  vi.stubEnv("VITE_CLOUD_API", BASE);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setCustomCloudApi(null);
  setPendingBlob(null);
});

describe("cloud configuration", () => {
  it("is off without an address, so the account stays on the PC", () => {
    vi.stubEnv("VITE_CLOUD_API", "");
    expect(cloudAccountConfigured()).toBe(false);
    expect(cloudApi()).toBeNull();
    vi.stubEnv("VITE_CLOUD_API", "   ");
    expect(cloudAccountConfigured()).toBe(false);
  });

  it("accepts https and rejects plain http outside local development", () => {
    expect(cloudAccountConfigured()).toBe(true);
    vi.stubEnv("VITE_CLOUD_API", "http://cloud.example.workers.dev");
    expect(cloudAccountConfigured()).toBe(false);
    vi.stubEnv("VITE_CLOUD_API", "http://127.0.0.1:8787");
    expect(cloudApi()).toBe("http://127.0.0.1:8787");
    vi.stubEnv("VITE_CLOUD_API", "not a url");
    expect(cloudAccountConfigured()).toBe(false);
  });

  it("trims a trailing slash so paths are not doubled", () => {
    vi.stubEnv("VITE_CLOUD_API", BASE + "/");
    expect(cloudApi()).toBe(BASE);
  });
});

describe("account requests", () => {
  it("registers with name, login key and encrypted blob – never a password", async () => {
    stub(json({ ok: true, user: "nils", updatedAt: "2026-11-08T10:00:00Z" }));
    await cloudRegister("nils", KEY, "QUJD");
    expect(calls[0].url).toBe(`${BASE}/api/account/register`);
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ user: "nils", key: KEY, blob: "QUJD" });
  });

  it("says plainly that the password (key) is wrong", async () => {
    stub(json({ ok: false, error: "unauthorized", message: "Benutzername oder Passwort falsch." }, 401));
    await expect(cloudLogin("nils", KEY)).rejects.toThrow("Benutzername oder Passwort falsch.");
  });

  it("explains a taken name and a lock after too many tries", async () => {
    stub(json({ ok: false, error: "conflict" }, 409));
    await expect(cloudRegister("nils", KEY, "QUJD")).rejects.toThrow(/gibt es schon/);
    stub(json({ ok: false, error: "rate-limited" }, 429));
    await expect(cloudLogin("nils", KEY)).rejects.toThrow(/Zu viele Versuche/);
  });

  it("never shows a server fault as a silent success", async () => {
    stub(json({ ok: false, error: "error" }, 500));
    await expect(cloudLogin("nils", KEY)).rejects.toThrow(/Fehler/);
  });

  it("explains a missing connection instead of hanging", async () => {
    stub(new Error("network down"));
    await expect(cloudLogin("nils", KEY)).rejects.toThrow(/antwortet nicht/);
  });

  it("loads the blob of the account and returns null when nothing was saved yet", async () => {
    stub(json({ ok: true, user: "nils", blob: "QUJD", updatedAt: "2026-11-08T10:00:00Z" }));
    expect(await cloudLoad("nils", KEY)).toEqual({ blob: "QUJD", updatedAt: "2026-11-08T10:00:00Z" });
    stub(json({ ok: true, user: "nils" }));
    expect(await cloudLoad("nils", KEY)).toBeNull();
  });

  it("saves and deletes exactly the named account", async () => {
    stub(json({ ok: true }));
    await cloudSave("nils", KEY, "QUJD");
    expect(calls[0].url).toBe(`${BASE}/api/account/save`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ user: "nils", key: KEY, blob: "QUJD" });
    calls = [];
    stub(json({ ok: true }));
    await cloudDelete("nils", KEY);
    expect(calls[0].url).toBe(`${BASE}/api/account/delete`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ user: "nils", key: KEY });
  });

  it("refuses data bigger than the server allows before sending it", async () => {
    const fn = stub(json({ ok: true }));
    await expect(cloudSave("nils", KEY, "A".repeat(900_001))).rejects.toThrow(/zu groß/);
    expect(fn).not.toHaveBeenCalled();
  });

  it("keeps a change locally until it could be sent", () => {
    setPendingBlob("QUJD");
    expect(pendingBlob()).toBe("QUJD");
    setPendingBlob(null);
    expect(pendingBlob()).toBeNull();
  });
});

describe("own cloud service", () => {
  it("uses the own address instead of the built-in one", () => {
    expect(customCloudApi()).toBeNull();
    expect(cloudApi()).toBe(BASE);
    setCustomCloudApi("https://my-cloud.example.com/");
    expect(customCloudApi()).toBe("https://my-cloud.example.com");
    expect(cloudApi()).toBe("https://my-cloud.example.com");
    expect(cloudAccountConfigured()).toBe(true);
  });

  it("keeps a path prefix and allows plain http only for localhost", () => {
    setCustomCloudApi("https://example.com/nexus/");
    expect(cloudApi()).toBe("https://example.com/nexus");
    setCustomCloudApi("http://127.0.0.1:8787");
    expect(cloudApi()).toBe("http://127.0.0.1:8787");
  });

  it("rejects an unusable address and keeps the previous one", () => {
    setCustomCloudApi("https://my-cloud.example.com");
    expect(() => setCustomCloudApi("http://my-cloud.example.com")).toThrow(/https/);
    expect(() => setCustomCloudApi("not a url")).toThrow(/https/);
    expect(cloudApi()).toBe("https://my-cloud.example.com");
  });

  it("returns to the built-in service", () => {
    setCustomCloudApi("https://my-cloud.example.com");
    setCustomCloudApi(null);
    expect(customCloudApi()).toBeNull();
    expect(cloudApi()).toBe(BASE);
  });

  it("checks the health of the own service", async () => {
    setCustomCloudApi("https://my-cloud.example.com");
    stub(json({ ok: true, service: "nexus-cloud-account" }));
    expect((await cloudHealth()).ok).toBe(true);
    expect(calls[0].url).toBe("https://my-cloud.example.com/api/account/health");
  });
});

describe("service health", () => {
  it("asks the public health route and reports reachable only for ok:true", async () => {
    stub(json({ ok: true, service: "nexus-cloud-account" }));
    expect((await cloudHealth()).ok).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/api/account/health`);
    expect(calls[0].init.method).toBe("GET");

    stub(json({ ok: false }, 500));
    expect((await cloudHealth()).ok).toBe(false);
    stub(new Error("network down"));
    expect((await cloudHealth()).ok).toBe(false);
  });

  it("does not pretend a build without cloud has a reachable service", async () => {
    vi.stubEnv("VITE_CLOUD_API", "");
    const h = await cloudHealth();
    expect(h.ok).toBe(false);
    expect(h.message).toMatch(/nicht eingerichtet/);
  });
});
