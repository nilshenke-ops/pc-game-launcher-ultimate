// Calls the test companion like the website does (WebSocket, admin token from the PC) – for tests that need a setting the UI
// hides on a non-Windows companion.
import WebSocket from "ws";
import { COMPANION, state } from "./env";

export async function adminRpc<T = unknown>(method: string, params: object = {}): Promise<T> {
  const ws = new WebSocket(COMPANION.replace(/^http/, "ws") + "/ws");
  await new Promise<void>((res, rej) => { ws.once("open", () => res()); ws.once("error", rej); });
  let id = 0;
  const call = (m: string, p: object) => new Promise<{ ok: boolean; r?: T; e?: { message: string } }>((res, rej) => {
    const n = ++id;
    const t = setTimeout(() => rej(new Error(`${m}: keine Antwort`)), 10000);
    const on = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(String(raw));
      if (msg.id !== n) return;
      clearTimeout(t); ws.off("message", on); res(msg);
    };
    ws.on("message", on);
    ws.send(JSON.stringify({ v: 1, id: n, m, p }));
  });
  try {
    await call("hello", {});
    const login = await call("auth.login", { adminToken: state().adminToken });
    if (!login.ok) throw new Error("Anmeldung fehlgeschlagen: " + login.e?.message);
    const r = await call(method, params);
    if (!r.ok) throw new Error(`${method}: ${r.e?.message}`);
    return r.r as T;
  } finally { ws.close(); }
}

/** One admin connection for tests that make many calls in a row (a new connection per call would hit the companion's connection rate limit). */
export async function adminSession() {
  const ws = new WebSocket(COMPANION.replace(/^http/, "ws") + "/ws");
  await new Promise<void>((res, rej) => { ws.once("open", () => res()); ws.once("error", rej); });
  let id = 0;
  const raw = (m: string, p: object) => new Promise<{ ok: boolean; r?: unknown; e?: { message: string } }>((res, rej) => {
    const n = ++id;
    const t = setTimeout(() => rej(new Error(`${m}: keine Antwort`)), 15000);
    const on = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data));
      if (msg.id !== n) return;
      clearTimeout(t); ws.off("message", on); res(msg);
    };
    ws.on("message", on);
    ws.send(JSON.stringify({ v: 1, id: n, m, p }));
  });
  await raw("hello", {});
  const login = await raw("auth.login", { adminToken: state().adminToken });
  if (!login.ok) throw new Error("Anmeldung fehlgeschlagen: " + login.e?.message);
  return {
    call: async <T = unknown>(method: string, params: object = {}): Promise<T> => {
      const r = await raw(method, params);
      if (!r.ok) throw new Error(`${method}: ${r.e?.message}`);
      return r.r as T;
    },
    close: () => ws.close(),
  };
}
