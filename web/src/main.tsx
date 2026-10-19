import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./lib/prefs";
import "./lib/state";
import { captureAdminToken, client, demoRequested } from "./lib/rpc";
import { DEMO_BUILD } from "./lib/demo-flag";
import { languageReady } from "./lib/i18n";
import App from "./App";

declare const __BUILD_ID__: string;

captureAdminToken();
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
void languageReady().finally(() => createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>));
