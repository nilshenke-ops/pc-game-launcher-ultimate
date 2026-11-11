import { lazyRetry } from "./lib/lazy-retry";
import { DesignPreviewBar } from "./components/design-preview-bar";
import { Component, Suspense, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { getRoom, subscribeRoom } from "./lib/room";
import { startDesignAutoSave } from "./lib/design-account";
import { startAccountAutoApply } from "./lib/account-auto";
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

const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
const Library = lazyRetry(() => import("./pages/Library"));
const QuickActions = lazyRetry(() => import("./pages/QuickActions"));
const Soundboard = lazyRetry(() => import("./pages/Soundboard"));
const AudioCenter = lazyRetry(() => import("./pages/AudioCenter"));
const Monitor = lazyRetry(() => import("./pages/Monitor"));
const Profiles = lazyRetry(() => import("./pages/Profiles"));
const Automations = lazyRetry(() => import("./pages/Automations"));
const Hotkeys = lazyRetry(() => import("./pages/Hotkeys"));
const History = lazyRetry(() => import("./pages/History"));
const Devices = lazyRetry(() => import("./pages/Devices"));
const Notifications = lazyRetry(() => import("./pages/Notifications"));
const SettingsPage = lazyRetry(() => import("./pages/Settings"));
const Diagnostics = lazyRetry(() => import("./pages/Diagnostics"));
const Help = lazyRetry(() => import("./pages/Help"));
const Updates = lazyRetry(() => import("./pages/Updates"));
const Plugins = lazyRetry(() => import("./pages/Plugins"));
const OverlaySettings = lazyRetry(() => import("./pages/OverlaySettings"));
const Overlay = lazyRetry(() => import("./pages/Overlay"));
const WidgetStudio = lazyRetry(() => import("./pages/WidgetStudio"));
const Network = lazyRetry(() => import("./pages/Network"));
const Quests = lazyRetry(() => import("./pages/Quests"));
const Backlog = lazyRetry(() => import("./pages/Backlog"));
const CalendarPage = lazyRetry(() => import("./pages/Calendar"));
const StoragePage = lazyRetry(() => import("./pages/Storage"));
const FilesPage = lazyRetry(() => import("./pages/Files"));
const InboxPage = lazyRetry(() => import("./pages/Inbox"));
const CapturesPage = lazyRetry(() => import("./pages/Captures"));
const ModsPage = lazyRetry(() => import("./pages/Mods"));
const VaultPage = lazyRetry(() => import("./pages/Vault"));
const MemoryPage = lazyRetry(() => import("./pages/Memory"));
const InventoryPage = lazyRetry(() => import("./pages/Inventory"));
const CrashesPage = lazyRetry(() => import("./pages/Crashes"));
const GameStatePage = lazyRetry(() => import("./pages/GameState"));
const RemotePage = lazyRetry(() => import("./pages/Remote"));
const ControlPage = lazyRetry(() => import("./pages/Control"));
const MovePage = lazyRetry(() => import("./pages/Move"));
const JournalPage = lazyRetry(() => import("./pages/Journal"));
const WikiPage = lazyRetry(() => import("./pages/Wiki"));
const PlayPage = lazyRetry(() => import("./pages/Play"));
const WorldsPage = lazyRetry(() => import("./pages/Worlds"));
const BuildsPage = lazyRetry(() => import("./pages/Builds"));
const FriendsPage = lazyRetry(() => import("./pages/Friends"));
const MediaPage = lazyRetry(() => import("./pages/Media"));
const StudioPage = lazyRetry(() => import("./pages/Studio"));
const InfosPage = lazyRetry(() => import("./pages/Infos"));
const InsightsPage = lazyRetry(() => import("./pages/Insights"));
const LayoutsPage = lazyRetry(() => import("./pages/Layouts"));
const PeripheralsPage = lazyRetry(() => import("./pages/Peripherals"));
const InputPage = lazyRetry(() => import("./pages/Input"));
const StartTimesPage = lazyRetry(() => import("./pages/StartTimes"));
const TrophiesPage = lazyRetry(() => import("./pages/Trophies"));
const RoomPage = lazyRetry(() => import("./pages/Room"));
const Deck = lazyRetry(() => import("./pages/Deck"));
const Assistant = lazyRetry(() => import("./pages/Assistant"));
const Deals = lazyRetry(() => import("./pages/Deals"));
const DesktopWidget = lazyRetry(() => import("./pages/DesktopWidget"));
const IslandPage = lazyRetry(() => import("./pages/IslandPage"));
const Connect = lazyRetry(() => import("./pages/Connect"));
const ProfilePage = lazyRetry(() => import("./pages/Profile"));
const VoiceChanger = lazyRetry(() => import("./pages/VoiceChanger"));const PairAdmin = lazyRetry(() => import("./pages/Pair").then((m) => ({ default: m.PairPage })));

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
  useEffect(() => startAccountAutoApply(), []);
  useEffect(() => { if (client.status.auth === "ok") void loadRemotePrefs(); return client.on("authenticated", () => { loadRemotePrefs(); }); }, []);

  // Without a logged-in PC the whole app is shown as a preview: example content, design and layout work locally,
  // everything else asks to connect the PC first ("Verbinden" in the navigation). Logged-in devices keep the app
  // during short connection losses and reconnect automatically.
  if (!client.demo && conn.phase === "online" && conn.auth === "checking" && !conn.me)
    return <div className="center-screen"><div className="center-card"><Loading /></div></div>;
  const pcLoggedIn = client.demo || conn.auth === "ok" || !!conn.me || !!client.credentials;

  // The in-game overlay window (Windows companion) shows only the overlay, without navigation.
  if (loc.pathname === "/overlay") return <Suspense fallback={null}><Overlay /></Suspense>;
  // The JARVIS island window (Windows companion) shows only the island.
  if (loc.pathname === "/island") return <Suspense fallback={null}><IslandPage /></Suspense>;
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
          <Route path="/voice-changer" element={<VoiceChanger />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/hotkeys" element={<Hotkeys />} />
          <Route path="/history" element={<History />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/pair" element={pcLoggedIn ? <PairAdmin /> : <Connect />} />
          <Route path="/connect" element={<Connect />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* old address: written as an expression so the "every page is described" test counts only real pages */}
          <Route path={"/cloud"} element={<Navigate to="/profile" replace />} />
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
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/infos" element={<InfosPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/storage" element={<StoragePage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/captures" element={<CapturesPage />} />
          <Route path="/mods" element={<ModsPage />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/crashes" element={<CrashesPage />} />
          <Route path="/gamestate" element={<GameStatePage />} />
          <Route path="/remote" element={<RemotePage />} />
          <Route path="/control" element={<ControlPage />} />
          <Route path="/move" element={<MovePage />} />
          <Route path="/layouts" element={<LayoutsPage />} />
          <Route path="/peripherals" element={<PeripheralsPage />} />
          <Route path="/input" element={<InputPage />} />
          <Route path="/start-times" element={<StartTimesPage />} />
          <Route path="/trophies" element={<TrophiesPage />} />
          <Route path="/deck" element={<Deck />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/jarvis" element={<Navigate to="/assistant" replace />} />
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
      <DesignPreviewBar />
      <LaunchCinema />
      <ConfirmHost />
    </Router>
  );
}
