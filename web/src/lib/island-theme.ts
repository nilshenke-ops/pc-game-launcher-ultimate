// Colours and small effects of the island (3.58). A colour of its own, the template's, or "auto": like the app or website in front on the PC
// (Discord blue, Spotify green …), otherwise like the playing song's cover. The PC only tells a short id of what is in front, never a title.
import { useEffect, useState } from "react";
import { client } from "./rpc";

export const ACCENTS: { id: string; label: string }[] = [
  { id: "#9ef0c8", label: "Mint" }, { id: "#2dd4bf", label: "Türkis" }, { id: "#22d3ee", label: "Cyan" }, { id: "#60a5fa", label: "Blau" },
  { id: "#818cf8", label: "Indigo" }, { id: "#a78bfa", label: "Lavendel" }, { id: "#c084fc", label: "Violett" }, { id: "#f472b6", label: "Pink" },
  { id: "#f9a8d4", label: "Sakura" }, { id: "#f87171", label: "Rot" }, { id: "#fb923c", label: "Orange" }, { id: "#fbbf24", label: "Gold" },
  { id: "#facc15", label: "Gelb" }, { id: "#4ade80", label: "Grün" }, { id: "#a3e635", label: "Limette" }, { id: "#f1f5f9", label: "Weiß" },
];
/** Colours of well-known apps and websites (their own brand colours, slightly lifted where they are too dark on black). */
export const BRAND_COLORS: Record<string, string> = {
  discord: "#5865f2", spotify: "#1db954", steam: "#66c0f4", obs: "#c4c4cc", vscode: "#3b9eea", whatsapp: "#25d366", telegram: "#2aabee",
  epic: "#e5e5e5", battlenet: "#148eff", teams: "#7b83eb", slack: "#e01e5a", zoom: "#2d8cff", twitch: "#9146ff", riot: "#ff4655", ea: "#ff4747",
  ubisoft: "#3b8bff", xbox: "#22c55e", youtube: "#ff3d3d", netflix: "#e50914", github: "#a371f7", reddit: "#ff4500", instagram: "#e1306c",
  prime: "#00a8e1", disney: "#3d8bff", x: "#e7e9ea", chatgpt: "#10a37f", claude: "#d97757", gmail: "#ea4335", kick: "#53fc18", tiktok: "#fe2c55",
};
export const BRAND_LABEL: Record<string, string> = {
  discord: "Discord", spotify: "Spotify", steam: "Steam", obs: "OBS", vscode: "VS Code", whatsapp: "WhatsApp", telegram: "Telegram", epic: "Epic Games",
  battlenet: "Battle.net", teams: "Teams", slack: "Slack", zoom: "Zoom", twitch: "Twitch", riot: "Riot", ea: "EA", ubisoft: "Ubisoft", xbox: "Xbox",
  youtube: "YouTube", netflix: "Netflix", github: "GitHub", reddit: "Reddit", instagram: "Instagram", prime: "Prime Video", disney: "Disney+", x: "X",
  chatgpt: "ChatGPT", claude: "Claude", gmail: "Gmail", kick: "Kick", tiktok: "TikTok",
};
export type IslandEffect = "none" | "sakura" | "snow" | "stars";
export const EFFECTS: { id: IslandEffect; label: string }[] = [
  { id: "none", label: "Kein Effekt" }, { id: "sakura", label: "Sakura-Blüten" }, { id: "snow", label: "Schnee" }, { id: "stars", label: "Sterne" },
];
export const isEffect = (v: unknown): v is IslandEffect => EFFECTS.some((e) => e.id === v);
export const isAccent = (v: unknown): v is string => typeof v === "string" && (v === "default" || v === "auto" || /^#[0-9a-f]{6}$/i.test(v));

/** The colour in use: none (the template's), the chosen one, or – on "auto" – the app in front, else the song's cover. */
export function resolveAccent(accent: string, brand: string | null, songAccent: string | null): string | null {
  if (accent === "default") return null;
  if (accent !== "auto") return isAccent(accent) ? accent.toLowerCase() : null;
  return (brand && BRAND_COLORS[brand]) || songAccent || null;
}

/** What is in front on the PC, asked every 2.5 s while wanted (and the page is visible). The island's own window keeps the last answer. */
export function useFrontBrand(enabled: boolean): string | null {
  const [brand, setBrand] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) { setBrand(null); return; }
    let gone = false;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      client.call<{ brand: string | null }>("island.front", {}).then((r) => { if (!gone && r.brand !== "self") setBrand(r.brand ?? null); }, () => undefined);
    };
    ask();
    const id = window.setInterval(ask, 2500);
    return () => { gone = true; window.clearInterval(id); };
  }, [enabled]);
  return brand;
}
