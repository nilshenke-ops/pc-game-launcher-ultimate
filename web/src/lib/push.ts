// Push messages from the PC to this device – also while the app is closed. Needs https (the published website) and,
// on iPhone/iPad, the app added to the home screen (Apple only allows push there, from iOS 16.4).
import { client } from "./rpc";

export type PushSupport = "ok" | "insecure" | "no-sw" | "ios-home-screen" | "unsupported" | "denied";

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return "insecure";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-home-screen";
  if (!("serviceWorker" in navigator)) return "no-sw";
  if (!("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

const b64 = (buf: ArrayBuffer | null) => buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "";
function fromB64(s: string) {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks for permission, subscribes with the PC's key and tells the PC where to send. */
export async function enablePush(categories: string[]) {
  if ((await Notification.requestPermission()) !== "granted") throw new Error("denied");
  const { publicKey } = await client.call<{ publicKey: string }>("push.info", {});
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // A subscription made for another PC key cannot be reused.
  const key = sub?.options.applicationServerKey;
  if (sub && key && b64(key) !== publicKey) { await sub.unsubscribe(); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64(publicKey) });
  await client.call("push.subscribe", { endpoint: sub.endpoint, p256dh: b64(sub.getKey("p256dh")), auth: b64(sub.getKey("auth")), categories });
}

export async function disablePush() {
  const sub = await currentSubscription();
  await client.call("push.unsubscribe", { endpoint: sub?.endpoint ?? null }).catch(() => undefined);
  await sub?.unsubscribe();
}
