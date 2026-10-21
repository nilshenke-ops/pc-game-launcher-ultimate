import { Component, lazy, Suspense, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getRoom, subscribeRoom } from "./lib/room";
import { startDesignAutoSave } from "./lib/design-account";
import { HashRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { DEMO_BUILD } from "./lib/demo-flag";
import { AppShell } from "./components/AppShell";
import { AnimatedBackground } from "./components/animated-bg";
import { LaunchCinema } from "./components/launch-cinema";
import { AccessGate } from "./components/AccessGate";
import { ConfirmHost, Toasts } from "./components/ui";
import { useConn } from "./lib/hooks";
import { loadRemotePrefs, usePrefs } from "./lib/prefs";
import { client } from "./lib/rpc";
import { t, useLanguageVersion } from "./lib/i18n";

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
const Updates = lazy(() => import("./pages/Updates"));
const Plugins = lazy(() => import("./pages/Plugins"));
const OverlaySettings = lazy(() => import("./pages/OverlaySettings"));
const Overlay = lazy(() => import("./pages/Overlay"));
const WidgetStudio = lazy(() => import("./pages/WidgetStudio"));
const Network = lazy(() => import("./pages/Network"));
const Quests = lazy(() => import("./pages/Quests"));
const Backlog = lazy(() => import("./pages/Backlog"));
const CalendarPage = lazy(() => import("./pages/Calendar"));
const StoragePage = lazy(() => import("./pages/Storage"));
const FilesPage = lazy(() => import("./pages/Files"));
const CapturesPage = lazy(() => import("./pages/Captures"));
const ModsPage = lazy(() => import("./pages/Mods"));
const VaultPage = lazy(() => import("./pages/Vault"));
const InventoryPage = lazy(() => import("./pages/Inventory"));
const CrashesPage = lazy(() => import("./pages/Crashes"));
const GameStatePage = lazy(() => import("./pages/GameState"));
const RemotePage = lazy(() => import("./pages/Remote"));
const MovePage = lazy(() => import("./pages/Move"));
const JournalPage = lazy(() => import("./pages/Journal"));
const WikiPage = lazy(() => import("./pages/Wiki"));
const PlayPage = lazy(() => import("./pages/Play"));
const WorldsPage = lazy(() => import("./pages/Worlds"));
const BuildsPage = lazy(() => import("./pages/Builds"));
const FriendsPage = lazy(() => import("./pages/Friends"));
const MediaPage = lazy(() => import("./pages/Media"));
const LayoutsPage = lazy(() => import("./pages/Layouts"));
const PeripheralsPage = lazy(() => import("./pages/Peripherals"));
const InputPage = lazy(() => import("./pages/Input"));
const StartTimesPage = lazy(() => import("./pages/StartTimes"));
const TrophiesPage = lazy(() => import("./pages/Trophies"));
const RoomPage = lazy(() => import("./pages/Room"));
const Deck = lazy(() => import("./pages/Deck"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Deals = lazy(() => import("./pages/Deals"));
const DesktopWidget = lazy(() => import("./pages/DesktopWidget"));
const Connect = lazy(() => import("./pages/Connect"));
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
  const loc = useLocation(); // resets the error boundary per page (window.location would be stale here)
  usePrefs(); // re-render on language/theme change
  useLanguageVersion(); // … and when the English texts have been loaded

  // Also when the login already happened before this view existed (fast connection, texts still loading).
  useEffect(() => startDesignAutoSave(), []);
  useEffect(() => { if (client.status.auth === "ok") void loadRemotePrefs(); return client.on("authenticated", () => { loadRemotePrefs(); }); }, []);

  // Without a logged-in PC the whole app is shown as a preview: example content, design and layout work locally,
  // everything else asks to connect the PC first ("Verbinden" in the navigation). Logged-in devices keep the app
  // during short connection losses and reconnect automatically.
  if (!client.demo && conn.phase === "online" && conn.auth === "checking" && !conn.me)
    return <div className="center-screen"><div className="center-card"><Loading /></div></div>;
  const pcLoggedIn = client.demo || conn.auth === "ok" || !!conn.me || !!client.credentials;

  // The in-game overlay window (Windows companion) shows only the overlay, without navigation.
  if (loc.pathname === "/overlay") return <Suspense fallback={null}><Overlay /></Suspense>;
  // A desktop widget window (Windows companion) shows only that widget.
  if (loc.pathname.startsWith("/desktop-widget/"))
    return <Suspense fallback={null}><Routes><Route path="/desktop-widget/:id" element={<DesktopWidget />} /></Routes></Suspense>;

  return (
    <AppShell>
      <PageErrorBoundary key={loc.pathname}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/room" element={<RoomPage />} />
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
          <Route path="/pair" element={pcLoggedIn ? <PairAdmin /> : <Connect />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/help" element={<Help />} />
          <Route path="/updates" element={<Updates />} />
          <Route path="/plugins" element={<Plugins />} />
          <Route path="/overlay-settings" element={<OverlaySettings />} />
          <Route path="/widgets" element={<WidgetStudio />} />
          <Route path="/network" element={<Network />} />
          <Route path="/quests" element={<Quests />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/wiki" element={<WikiPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/worlds" element={<WorldsPage />} />
          <Route path="/builds" element={<BuildsPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/media" element={<MediaPage />} />
          <Route path="/storage" element={<StoragePage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/captures" element={<CapturesPage />} />
          <Route path="/mods" element={<ModsPage />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/crashes" element={<CrashesPage />} />
          <Route path="/gamestate" element={<GameStatePage />} />
          <Route path="/remote" element={<RemotePage />} />
          <Route path="/move" element={<MovePage />} />
          <Route path="/layouts" element={<LayoutsPage />} />
          <Route path="/peripherals" element={<PeripheralsPage />} />
          <Route path="/input" element={<InputPage />} />
          <Route path="/start-times" element={<StartTimesPage />} />
          <Route path="/trophies" element={<TrophiesPage />} />
          <Route path="/deck" element={<Deck />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </PageErrorBoundary>
    </AppShell>
  );
}

/** Home: the dashboard, or the gaming room if chosen as start page (the dashboard stays at /dashboard). */
function StartPage() {
  const room = useSyncExternalStore(subscribeRoom, getRoom);
  return room.startPage ? <RoomPage asStart /> : <Dashboard />;
}

const Router = DEMO_BUILD ? MemoryRouter : HashRouter;

export default function App() {
  return (
    <Router>
      <div className="app-bg" aria-hidden><div className="img" /><div className="grid" /><AnimatedBackground /></div>
      <AccessGate><Gate /></AccessGate>
      <Toasts />
      <LaunchCinema />
      <ConfirmHost />
    </Router>
  );
}
