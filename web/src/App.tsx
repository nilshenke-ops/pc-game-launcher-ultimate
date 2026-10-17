import { Component, lazy, Suspense, useEffect, type ReactNode } from "react";
import { HashRouter, MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { DEMO_BUILD } from "./lib/demo";
import { AppShell } from "./components/AppShell";
import { ConfirmHost, Toasts } from "./components/ui";
import { ConnectScreen } from "./pages/ConnectScreen";
import { DevicePairScreen } from "./pages/Pair";
import { useConn } from "./lib/hooks";
import { loadRemotePrefs, usePrefs } from "./lib/prefs";
import { client } from "./lib/rpc";
import { t } from "./lib/i18n";

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

/** Shows a clear message instead of a blank page if a page part cannot be loaded (e.g. offline and not cached). */
class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card stack" role="alert">
        <h2>{t("Dieser Bereich konnte nicht geladen werden")}</h2>
        <p className="muted">{t("Wahrscheinlich ist der PC aus und der Bereich wurde noch nicht auf diesem Gerät gespeichert. Sobald der PC erreichbar ist, funktioniert er wieder.")}</p>
        <div><button className="btn primary" onClick={() => location.reload()}>{t("Neu laden")}</button></div>
      </div>
    );
  }
}

function Gate() {
  const conn = useConn();
  usePrefs(); // re-render on language/theme change

  useEffect(() => client.on("authenticated", () => { loadRemotePrefs(); }), []);

  // Once logged in, a short connection loss keeps the app visible (with a banner) instead of throwing the user out.
  // Paired devices (and anyone who chose "ohne PC öffnen") get the full app while the PC is off:
  // design and layout work locally, data appears as soon as the PC is reachable.
  const offlineShell = conn.phase !== "online" && (!!client.credentials || !!conn.offlineShell);
  const authed = conn.auth === "ok" || (conn.auth === "checking" && !!conn.me) || offlineShell;
  if (!authed) {
    if (conn.phase !== "online") return <ConnectScreen />;
    if (conn.auth === "checking") return <div className="center-screen"><div className="center-card"><Loading /></div></div>;
    return <DevicePairScreen />;
  }

  return (
    <AppShell>
      <PageErrorBoundary key={location.hash}>
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
      </PageErrorBoundary>
    </AppShell>
  );
}

const Router = DEMO_BUILD ? MemoryRouter : HashRouter;

export default function App() {
  return (
    <Router>
      <div className="app-bg" aria-hidden><div className="img" /><div className="grid" /></div>
      <Gate />
      <Toasts />
      <ConfirmHost />
    </Router>
  );
}
