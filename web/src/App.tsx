import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ConfirmHost, Toasts } from "./components/ui";
import { ConnectScreen } from "./pages/ConnectScreen";
import { DevicePairScreen } from "./pages/Pair";
import { useConn } from "./lib/hooks";
import { loadRemotePrefs, usePrefs } from "./lib/prefs";
import { client } from "./lib/rpc";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Library = lazy(() => import("./pages/Library"));
const QuickActions = lazy(() => import("./pages/QuickActions"));
const Soundboard = lazy(() => import("./pages/Soundboard"));
const AudioCenter = lazy(() => import("./pages/AudioCenter"));
const Monitor = lazy(() => import("./pages/Monitor"));
const Profiles = lazy(() => import("./pages/Profiles"));
const Automations = lazy(() => import("./pages/Automations"));
const Hotkeys = lazy(() => import("./pages/Hotkeys"));
const History = lazy(() => import("./pages/History"));
const Devices = lazy(() => import("./pages/Devices"));
const Notifications = lazy(() => import("./pages/Notifications"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));
const Help = lazy(() => import("./pages/Help"));
const PairAdmin = lazy(() => import("./pages/Pair").then((m) => ({ default: m.PairPage })));

function Loading() {
  return <div className="stack" aria-busy><div className="skeleton" style={{ height: 28, width: "30%" }} /><div className="skeleton" style={{ height: 160 }} /></div>;
}

function Gate() {
  const conn = useConn();
  usePrefs(); // re-render on language/theme change

  useEffect(() => client.on("authenticated", () => { loadRemotePrefs(); }), []);

  // Once logged in, a short connection loss keeps the app visible (with a banner) instead of throwing the user out.
  const authed = conn.auth === "ok" || (conn.auth === "checking" && !!conn.me);
  if (!authed) {
    if (conn.phase !== "online") return <ConnectScreen />;
    if (conn.auth === "checking") return <div className="center-screen"><div className="center-card"><Loading /></div></div>;
    return <DevicePairScreen />;
  }

  return (
    <AppShell>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/games" element={<Library kind="game" />} />
          <Route path="/programs" element={<Library kind="program" />} />
          <Route path="/quick" element={<QuickActions />} />
          <Route path="/soundboard" element={<Soundboard />} />
          <Route path="/audio" element={<AudioCenter />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/hotkeys" element={<Hotkeys />} />
          <Route path="/history" element={<History />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/pair" element={<PairAdmin />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/help" element={<Help />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="app-bg" aria-hidden><div className="img" /><div className="grid" /></div>
      <Gate />
      <Toasts />
      <ConfirmHost />
    </HashRouter>
  );
}
