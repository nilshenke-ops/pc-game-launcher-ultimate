// The sidebar of the designs: logo, the few main entries of the mock-ups (Home, Spiele, Apps, Soundboard, Favoriten,
// Zuletzt verwendet, Einstellungen), the PC state and the user – and "Mehr", which opens every other area (the full,
// sortable navigation: categories, "Weitere Funktionen", edit mode). Each design shows its own variant of this menu.
import { useRef, type ReactNode } from "react";
import { useGlidePill } from "./glide-pill";
import { Link, useLocation } from "react-router-dom";
import { AudioLines, ChevronDown, ChevronRight, Clock, Gamepad2, Home, LayoutGrid, LayoutList, Music, Settings, Star, type LucideIcon } from "lucide-react";
import { t } from "../lib/i18n";
import { homeVariant, usePrefs } from "../lib/prefs";
import type { NavItem } from "../lib/nav";
import { useUserName } from "./home-showcase";

type Variant = ReturnType<typeof homeVariant>;

type Entry = { to: string; key: string; icon: LucideIcon; label: string; end?: boolean };
const ENTRIES: Entry[] = [
  { to: "/", key: "home", icon: Home, label: "Home", end: true },
  { to: "/games", key: "games", icon: Gamepad2, label: "Spiele" },
  { to: "/programs", key: "apps", icon: LayoutGrid, label: "Apps" },
  { to: "/soundboard", key: "sound", icon: Music, label: "Soundboard" },
  { to: "/games?filter=fav", key: "fav", icon: Star, label: "Favoriten" },
  { to: "/history", key: "recent", icon: Clock, label: "Zuletzt verwendet" },
  { to: "/assistant", key: "jarvis", icon: AudioLines, label: "JARVIS" },
  { to: "/settings", key: "settings", icon: Settings, label: "Einstellungen" },
];
/** Which entries each design shows (as in its mock-up). */
const SHOWN: Record<Variant, string[]> = {
  glass: ["home", "games", "apps", "sound", "fav", "recent", "jarvis", "settings"],
  controller: ["home", "apps", "sound", "fav", "jarvis", "settings"],
  stats: ["home", "games", "apps", "sound", "fav", "jarvis", "settings"],
  chrome: ["home", "games", "apps", "sound", "fav", "recent", "jarvis", "settings"],
  chromelight: ["home", "games", "apps", "sound", "fav", "recent", "jarvis", "settings"],
};

/** The logo of each design (own drawings). */
export function BrandMark({ variant }: { variant: Variant }) {
  if (variant === "chrome" || variant === "chromelight") {
    const cols = variant === "chrome" ? 3 : 4, rows = variant === "chrome" ? 4 : 4, gap = 11;
    return (
      <svg className="mn-mark dots" viewBox={`0 0 ${cols * gap} ${rows * gap}`} aria-hidden>
        {Array.from({ length: rows * cols }, (_, i) => <circle key={i} cx={(i % cols) * gap + 5.5} cy={Math.floor(i / cols) * gap + 5.5} r="3.2" fill="currentColor" opacity={i === rows * cols - 2 ? 0.35 : 1} />)}
      </svg>
    );
  }
  if (variant === "controller" || variant === "stats") return <span className="mn-mark pad"><Gamepad2 size={variant === "controller" ? 40 : 46} strokeWidth={1.8} /></span>;
  return (
    <svg className="mn-mark" viewBox="0 0 48 48" aria-hidden>
      <defs><linearGradient id="mn-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d9d2ff" /><stop offset="1" stopColor="#8f86ff" /></linearGradient></defs>
      {[[4, 4], [26, 4], [4, 26], [26, 26]].map(([x, y], i) => <rect key={i} x={x} y={y} width="18" height="18" rx="6" fill="url(#mn-g)" opacity={i === 3 ? 0.75 : 1} />)}
    </svg>
  );
}

export function MockNav({ status, onSheet, moreOpen = false }: { items?: NavItem[]; notifCount?: number; status: ReactNode; onSheet: () => void; moreOpen?: boolean }) {
  const prefs = usePrefs();
  const variant = homeVariant(prefs.theme.preset);
  const loc = useLocation();
  const userName = useUserName() || t("Gamer");
  const iconOnly = variant === "controller";
  const fav = loc.pathname === "/games" && new URLSearchParams(loc.search).get("filter") === "fav";
  const active = (e: Entry) => e.key === "fav" ? fav : e.key === "jarvis" ? loc.pathname === "/assistant" || loc.pathname === "/jarvis" : e.key === "games" ? loc.pathname.startsWith("/games") && !fav : e.end ? loc.pathname === e.to : loc.pathname.startsWith(e.to);
  const list = SHOWN[variant].map((k) => ENTRIES.find((e) => e.key === k)!);
  const named = variant === "glass" || variant === "stats";
  const listRef = useRef<HTMLElement>(null), pillRef = useRef<HTMLSpanElement>(null);
  useGlidePill(listRef, pillRef, ".mn-link.active", [loc.pathname, loc.search, moreOpen, variant]);

  return (
    <div className={`mn v-${variant}`}>
      <Link to="/" className="mn-brand" aria-label="PC Game Launcher Ultimate">
        <BrandMark variant={variant} />
        {named && <span><b>PC Game Launcher</b><small>Ultimate</small></span>}
      </Link>
      <div className="mn-scroll">
        <nav className="mn-list has-pill" aria-label={t("Hauptmenü")} ref={listRef}>
          <span className="mn-pill" ref={pillRef} aria-hidden="true" />
          {list.map((e) => (
            <Link key={e.key} to={e.to} className={`mn-link ${active(e) ? "active" : ""}`} aria-current={active(e) ? "page" : undefined} title={t(e.label)}>
              <e.icon size={22} /><span className="mn-t">{t(e.label)}</span>
            </Link>
          ))}
          {/* "Mehr" opens a window with all other areas – like the Apps window, not a list that pushes the menu around */}
          <button type="button" className={`mn-link mn-more-btn ${moreOpen ? "active" : ""}`} aria-haspopup="dialog" aria-expanded={moreOpen}
            title={t("Mehr")} onClick={onSheet}>
            <LayoutList size={22} /><span className="mn-t">{t("Mehr")}</span>{!iconOnly && <ChevronRight size={15} className="mn-chev" />}
          </button>
        </nav>
      </div>
      <div className="mn-foot">
        {status}
        {(variant === "glass" || variant === "chrome" || variant === "chromelight") && (
          <Link to="/settings" className="mn-user" title={t("Einstellungen")}><span className="mn-av" aria-hidden>{userName.slice(0, 1).toUpperCase()}</span><span className="mn-t">{userName}</span><ChevronDown size={15} /></Link>
        )}
      </div>
    </div>
  );
}
