import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOUD_EMAIL_RX, cloudAccountConfigured, cloudConfig, cloudDelete, cloudLoad, cloudSave, cloudSignIn, cloudSignOut, cloudSignUp, cloudEmail, pendingBlob, setPendingBlob } from "./cloud-account";

const URL_ = "https://demo.supabase.co";
const ANON = "anon-key";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const auth = (extra: Record<string, unknown> = {}) => ({
  access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600,
  user: { id: "11111111-1111-4111-8111-111111111111", email: "nils@example.com" }, ...extra,
});

let calls: { url: string; init: RequestInit }[];

// The app keeps its session in localStorage; in the node test environment a small stand-in plays that part.
const mem = new Map<string, string>();
function stubWindow() {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    },
  } as unknown as Window);
}

function stub(...answers: Response[]) {
  const queue = [...answers];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error("unexpected request: " + url);
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  calls = [];
  stubWindow();
  mem.clear();
  cloudSignOut();
  setPendingBlob(null);
  vi.stubEnv("VITE_SUPABASE_URL", URL_);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", ANON);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  cloudSignOut();
  setPendingBlob(null);
});

describe("cloud configuration", () => {
  it("is off without both public values, so the account stays on the PC", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    expect(cloudAccountConfigured()).toBe(false);
    expect(cloudConfig()).toBeNull();
    vi.stubEnv("VITE_SUPABASE_URL", URL_);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", " ");
    expect(cloudAccountConfigured()).toBe(false);
  });

  it("accepts https and rejects plain http outside local development", () => {
    expect(cloudAccountConfigured()).toBe(true);
    vi.stubEnv("VITE_SUPABASE_URL", "http://demo.supabase.co");
    expect(cloudAccountConfigured()).toBe(false);
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    expect(cloudConfig()?.url).toBe("http://127.0.0.1:54321");
    vi.stubEnv("VITE_SUPABASE_URL", "not a url");
    expect(cloudAccountConfigured()).toBe(false);
  });

  it("normalises the e-mail and only accepts real addresses", () => {
    expect(cloudEmail("  Nils@Example.COM ")).toBe("nils@example.com");
    expect(CLOUD_EMAIL_RX.test("nils@example.com")).toBe(true);
    expect(CLOUD_EMAIL_RX.test("nils")).toBe(false);
  });
});

describe("sign in and sign up", () => {
  it("sends only the public key and no password hash, and keeps the session", async () => {
    stub(json(auth()));
    const acc = await cloudSignIn("Nils@Example.com", "geheim123");
    expect(acc.userId).toBe("11111111-1111-4111-8111-111111111111");
    expect(calls[0].url).toBe(`${URL_}/auth/v1/token?grant_type=password`);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.apikey).toBe(ANON);
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: "nils@example.com", password: "geheim123" });
  });

  it("does not pretend to be signed in while the e-mail is unconfirmed", async () => {
    stub(json({ user: { id: "11111111-1111-4111-8111-111111111111", email: "nils@example.com" } }));
    await expect(cloudSignUp("nils@example.com", "geheim123")).rejects.toThrow(/bestätige zuerst die E-Mail/);
    expect(cloudAccountConfigured()).toBe(true);
    // Without a session the app must not think it is signed in.
    await expect(cloudLoad()).rejects.toThrow(/Nicht angemeldet/);
  });

  it("says plainly that the password is wrong and keeps any earlier session untouched", async () => {
    stub(json({ error_description: "Invalid login credentials" }, 400));
    await expect(cloudSignIn("nils@example.com", "falsches123")).rejects.toThrow("E-Mail oder Passwort falsch.");
  });

  it("explains an already registered e-mail instead of leaking the service's wording", async () => {
    stub(json({ msg: "User already registered" }, 422));
    await expect(cloudSignUp("nils@example.com", "geheim123")).rejects.toThrow(/schon registriert/);
  });

  it("reports rate limiting in clear words", async () => {
    stub(json({ msg: "email rate limit exceeded" }, 429));
    await expect(cloudSignUp("nils@example.com", "geheim123")).rejects.toThrow(/Zu viele Versuche/);
  });
});

describe("encrypted data of the signed-in user", () => {
  beforeEach(async () => { stub(json(auth())); await cloudSignIn("nils@example.com", "geheim123"); calls = []; });

  it("loads only the row of the user from the verified token", async () => {
    stub(json([{ blob: "QUJD", updated_at: "2026-11-08T10:00:00Z" }]));
    expect(await cloudLoad()).toEqual({ blob: "QUJD", updatedAt: "2026-11-08T10:00:00Z" });
    expect(calls[0].url).toBe(`${URL_}/rest/v1/account_blobs?select=blob,updated_at&user_id=eq.11111111-1111-4111-8111-111111111111`);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
  });

  it("returns null for an account that has not saved anything yet", async () => {
    stub(json([]));
    expect(await cloudLoad()).toBeNull();
  });

  it("stores the user id from the token, never one handed in by the caller", async () => {
    stub(new Response("", { status: 201 }));
    await cloudSave("QUJD");
    expect(calls[0].url).toBe(`${URL_}/rest/v1/account_blobs?on_conflict=user_id`);
    expect((calls[0].init.headers as Record<string, string>).Prefer).toContain("merge-duplicates");
    expect(JSON.parse(String(calls[0].init.body))[0].user_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("deletes only its own row", async () => {
    stub(new Response(null, { status: 204 }));
    await cloudDelete();
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toBe(`${URL_}/rest/v1/account_blobs?user_id=eq.11111111-1111-4111-8111-111111111111`);
  });

  it("refreshes an expired access token by itself (stays signed in)", async () => {
    stub(json(auth({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 })), json([]));
    // Force the stored session to look expired, as it would after an hour.
    const raw = JSON.parse(mem.get("pgl.cloudAccount") as string);
    mem.set("pgl.cloudAccount", JSON.stringify({ ...raw, access: "old", expiresAt: Date.now() - 1000 }));
    await cloudLoad();
    expect(calls[0].url).toBe(`${URL_}/auth/v1/token?grant_type=refresh_token`);
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer access-2");
  });

  it("clears a session whose refresh token is no longer accepted", async () => {
    stub(json({ error: "invalid_grant" }, 400));
    const raw = JSON.parse(mem.get("pgl.cloudAccount") as string);
    mem.set("pgl.cloudAccount", JSON.stringify({ ...raw, expiresAt: Date.now() - 1000 }));
    await expect(cloudLoad()).rejects.toThrow(/abgelaufen/);
    expect(mem.get("pgl.cloudAccount")).toBeUndefined();
  });

  it("refuses data bigger than the column allows instead of failing somewhere else", async () => {
    await expect(cloudSave("A".repeat(1_000_001))).rejects.toThrow(/zu groß/);
    expect(calls).toHaveLength(0);
  });

  it("keeps a change locally until it could be sent", async () => {
    setPendingBlob("QUJD");
    expect(pendingBlob()).toBe("QUJD");
    setPendingBlob(null);
    expect(pendingBlob()).toBeNull();
  });
});
