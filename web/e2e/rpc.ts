// Calls the test companion like the website does (WebSocket, admin token from the PC) – for tests that need a setting the UI
// hides on a non-Windows companion.
import WebSocket from "ws";
import { COMPANION, state } from "./env";

// One shared admin connection for all calls of a test run: a new connection per call would hit the companion's own limit on new
// connections per minute (a protection against floods) once many tests run one after the other. If the companion restarts
// (some tests do that), the next call opens a fresh connection.
let shared: Promise<Awaited<ReturnType<typeof adminSession>>> | null = null;

export async function adminRpc<T = unknown>(method: string, params: object = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (!shared) { shared = adminSession(() => { shared = null; }); shared.catch(() => { shared = null; }); }
    let session: Awaited<ReturnType<typeof adminSession>>;
    try { session = await shared; }
    catch (e) { shared = null; if (attempt < 1) continue; throw e; }
    try { return await session.call<T>(method, params); }
    catch (e) {
      // A connection that died (companion restarted) is retried once with a new one; a real error of the method is not.
      if (!session.open() && attempt < 1) { shared = null; continue; }
      throw e;
    }
  }
}

/** One admin connection for tests that make many calls in a row (a new connection per call would hit the companion's connection rate limit). */
export async function adminSession(onClose?: () => void) {
  const ws = new WebSocket(COMPANION.replace(/^http/, "ws") + "/ws");
  await new Promise<void>((res, rej) => { ws.once("open", () => res()); ws.once("error", rej); });
  ws.on("close", () => onClose?.());
  ws.on("error", () => undefined);
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
    open: () => ws.readyState === WebSocket.OPEN,
  };
}
