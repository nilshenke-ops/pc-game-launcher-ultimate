import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./styles-refresh.css";
import "./motion-pack.css";
import { initTilt } from "./lib/pointer-tilt";
import "./lib/prefs";
import "./lib/state";
import { captureAdminToken, captureHandoff, client, demoRequested } from "./lib/rpc";
import { startCloudSync } from "./lib/cloud-sync";
import { startTapTracking } from "./lib/last-tap";
import { startAccountToPc } from "./lib/account-to-pc";
import { DEMO_BUILD } from "./lib/demo-flag";
import { languageReady } from "./lib/i18n";
import App from "./App";
import { trackVisibleHeight } from "./lib/visible-height";

// "Teilen → Nexus" from the system share sheet (Android/Chrome installed app): the shared title/text/link goes to "An PC senden".
try {
  const sq = new URLSearchParams(location.search);
  if (sq.get("share") === "1") {
    const shared = [sq.get("title"), sq.get("text"), sq.get("url")].filter((x, i, a) => x && a.indexOf(x) === i).join(" ").trim();
    if (shared) sessionStorage.setItem("pgl.share", shared.slice(0, 4000));
    history.replaceState(null, "", location.pathname + "#/inbox");
  }
} catch { /* no storage: the page just opens empty */ }

declare const __BUILD_ID__: string;

trackVisibleHeight();
captureAdminToken();
captureHandoff();
if (DEMO_BUILD || demoRequested()) client.startDemo();
else client.start();

// The service worker needs a secure context (https or localhost). On http://<LAN-IP> browsers do not allow it;
// the app still works, only without offline caching. Not used inside the companion window.
const embedded = (window as unknown as { __PGL_EMBEDDED__?: boolean }).__PGL_EMBEDDED__;
if ("serviceWorker" in navigator && window.isSecureContext && !embedded && !DEMO_BUILD && import.meta.env.PROD) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register(`sw.js?v=${__BUILD_ID__}`).catch(() => { /* optional feature */ });
  // A new version of the app was installed in the background: offer a reload instead of switching silently.
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) window.dispatchEvent(new Event("pgl-app-updated")); });
}

// English users wait for their texts (one small request) instead of seeing German first.
void import("./lib/free-ai").then((m) => m.warmUpFreeAi());
startCloudSync();
startTapTracking();
startAccountToPc();
void languageReady().finally(() => createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>));
initTilt();
