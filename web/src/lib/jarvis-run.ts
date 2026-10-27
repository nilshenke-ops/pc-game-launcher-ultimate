// JARVIS Gaming – running a step. Website changes are applied here on this device (saved like every other setting,
// with "Rückgängig"); PC actions go through the normal RPC calls with this device's permissions, and their result is
// checked (a started game must show up as running) before JARVIS says it worked.

import { client } from "./rpc";
import { t } from "./i18n";
import { getPrefs, setPrefs } from "./prefs";
import type { Prefs } from "./prefs-core";
import { waitForState } from "./state";
import { listKind } from "./journal";
import type { AssistantAction } from "./assistant";
import type { LibraryItem, Profile, ProfilesFile, SoundsFile } from "./types";
import { coopGames, findItem, findProfile, GAME_PAGE, nextGame, tidy, type SiteIntent } from "./jarvis";

export interface StepResult { text: string; ok: boolean | null; actions?: AssistantAction[]; undo?: Prefs; navigate?: string }

/** Same key as the library page (JSON-encoded, like its other remembered settings). */
export const LIB_SORT_KEY = "pgl.libSort";

const online = () => client.status.auth === "ok" && client.status.phase === "online";
const mobile = () => window.matchMedia("(max-width: 699px)").matches;
const needPc = (): StepResult => ({ text: t("Dafür brauche ich die Verbindung zu deinem PC – gerade ist er nicht erreichbar."), ok: false });
const store = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const fail = (e: unknown): StepResult => ({ text: (e as Error).message, ok: false });

function currentLayoutId(p: Prefs) { return mobile() ? p.activeLayout.mobile : p.activeLayout.desktop; }

/** Changes of the website itself (pages, widgets, sorting) and requests about the own games. */
export async function runSite(i: SiteIntent): Promise<StepResult> {
  const before = getPrefs();
  try {
    switch (i.kind) {
      case "pageFor": {
        const existing = before.layouts.find((l) => l.name.toLowerCase() === i.name.toLowerCase());
        if (existing) {
          setPrefs((p) => ({ ...p, activeLayout: { ...p.activeLayout, [mobile() ? "mobile" : "desktop"]: existing.id } }));
          return { text: t("Die Startseite „{n}“ gibt es schon – ich habe sie aktiviert.", { n: existing.name }), ok: true, undo: before, navigate: "/" };
        }
        if (before.layouts.length >= 20) return { text: t("Es gibt schon 20 Startseiten – lösche zuerst eine (Home → Anpassen)."), ok: false };
        const id = "l" + Math.random().toString(36).slice(2, 10);
        setPrefs((p) => ({ ...p, layouts: [...p.layouts, { id, name: i.name, widgets: structuredClone(GAME_PAGE) }], activeLayout: { ...p.activeLayout, [mobile() ? "mobile" : "desktop"]: id } }));
        return { text: t("Neue Startseite „{n}“ angelegt und aktiviert – mit Zuletzt gespielt, laufender Sitzung, PC-Werten, Spielgedächtnis, Bingo, Challenges, Notizen und Favoriten. Oben auf Home wechselst du zwischen deinen Seiten.", { n: i.name }), ok: true, undo: before, navigate: "/" };
      }
      case "tidyHome": {
        const layout = before.layouts.find((l) => l.id === currentLayoutId(before)) ?? before.layouts[0];
        const next = tidy(layout);
        if (next.widgets.map((w) => w.id).join() === layout.widgets.map((w) => w.id).join()) return { text: t("Die Startseite „{n}“ ist schon so geordnet: wichtige Widgets oben, ausgeblendete am Ende.", { n: layout.name }), ok: true };
        setPrefs((p) => ({ ...p, layouts: p.layouts.map((l) => (l.id === layout.id ? next : l)) }));
        const top = next.widgets.filter((w) => w.visible).slice(0, 4).map((w) => w.id).join(", ");
        return { text: t("Startseite „{n}“ neu geordnet: Status und laufende Spiele zuerst, dann Zuletzt gespielt und Favoriten, Werkzeuge danach; ausgeblendete Widgets ans Ende. Nichts wurde entfernt. Oben jetzt: {w}.", { n: layout.name, w: top }), ok: true, undo: before, navigate: "/" };
      }
      case "librarySort": {
        store(LIB_SORT_KEY, JSON.stringify(i.sort));
        const label = { recent: t("zuletzt gespielt zuerst"), rating: t("beste Bewertung zuerst"), name: t("von A bis Z"), added: t("neu hinzugefügt zuerst") }[i.sort];
        return { text: t("Die Spieleübersicht sortiert jetzt {s} – auf diesem Gerät gespeichert.", { s: label }), ok: true, navigate: "/games" };
      }
      case "favoritesFirst": {
        // In the games list favourites are always first already; on Home the favourites widget goes to the top.
        const layout = before.layouts.find((l) => l.id === currentLayoutId(before)) ?? before.layouts[0];
        const fav = layout.widgets.find((w) => w.id === "favorites") ?? { id: "favorites", visible: true, size: "m" as const };
        setPrefs((p) => ({ ...p, layouts: p.layouts.map((l) => (l.id === layout.id ? { ...l, widgets: [{ ...fav, visible: true }, ...l.widgets.filter((w) => w.id !== "favorites")] } : l)) }));
        return { text: t("Favoriten stehen jetzt ganz oben auf deiner Startseite „{n}“. In der Spieleübersicht stehen sie ohnehin immer zuerst.", { n: layout.name }), ok: true, undo: before, navigate: "/" };
      }
      case "favoritesCategory":
      case "category": {
        if (!online()) return needPc();
        const { items } = await client.call<{ items: LibraryItem[] }>("library.list");
        const targets = i.kind === "favoritesCategory" ? items.filter((x) => x.favorite) : i.game ? [findItem(items, i.game)].filter((x): x is LibraryItem => !!x) : [];
        if (i.kind === "category" && !i.game) return { text: t("Eine Kategorie entsteht, sobald ein Spiel sie trägt. Für welche Spiele soll „{c}“ gelten? Zum Beispiel: „Leg eine Kategorie {c} für Minecraft an“.", { c: i.category }), ok: null };
        if (!targets.length) return { text: i.kind === "favoritesCategory" ? t("Du hast noch keine Favoriten – markiere Spiele mit dem Stern, dann lege ich die Kategorie an.") : t("„{g}“ habe ich in deiner Bibliothek nicht gefunden.", { g: i.game ?? "" }), ok: false };
        let changed = 0;
        for (const it of targets) {
          if (it.categories.some((c) => c.toLowerCase() === i.category.toLowerCase())) continue;
          await client.call("library.update", { id: it.id, categories: [...it.categories, i.category].slice(0, 20) });
          changed++;
        }
        return { text: changed ? t("Kategorie „{c}“ angelegt: {n} Spiel(e) – {l}. In der Spieleübersicht als Filter wählbar.", { c: i.category, n: changed, l: targets.slice(0, 6).map((x) => x.name).join(", ") }) : t("Alle diese Spiele haben die Kategorie „{c}“ schon.", { c: i.category }), ok: true, navigate: "/games" };
      }
      case "profileFor": {
        if (!online()) return needPc();
        const [{ items }, pf] = await Promise.all([client.call<{ items: LibraryItem[] }>("library.list"), client.call<ProfilesFile>("profiles.list")]);
        const game = i.next ? nextGame(items) : i.game ? findItem(items, i.game) : null;
        if (!game) return { text: i.next ? t("Im Backlog ist kein Spiel als „Als Nächstes“ oder „Gerade aktiv“ markiert. Für welches Spiel soll das Profil sein?") : t("Für welches Spiel? „{g}“ habe ich in deiner Bibliothek nicht gefunden.", { g: i.game ?? "" }), ok: null };
        const exists = pf.profiles.find((p) => p.name.toLowerCase() === game.name.toLowerCase());
        if (exists) return { text: t("Ein Profil „{n}“ gibt es schon.", { n: exists.name }), ok: true, navigate: "/profiles" };
        await client.call("profiles.save", { profile: { id: "", name: game.name.slice(0, 40), icon: "gamepad-2", color: "#22d3ee", gameIds: [game.id], launchProgramIds: [], quickActionIds: [], hotkeyIds: [], quietNotifications: false } });
        return { text: t("Profil „{n}“ angelegt und mit dem Spiel verknüpft. Programme, Sounds, Audio und Design dafür stellst du unter Profile ein – oder sag mir, was dazugehört.", { n: game.name }), ok: true, navigate: "/profiles" };
      }
      case "profileDashboard": {
        if (!online()) return needPc();
        const pf = await client.call<ProfilesFile>("profiles.list");
        const profile: Profile | null = findProfile(pf.profiles, i.profile) ?? pf.profiles.find((p) => p.id === pf.activeProfileId) ?? pf.profiles[pf.profiles.length - 1] ?? null;
        if (!profile) return { text: t("Es gibt noch kein Gaming-Profil. Sag z. B. „Erstelle ein Profil für Minecraft“."), ok: null };
        let layout = before.layouts.find((l) => l.name.toLowerCase() === profile.name.toLowerCase());
        if (!layout) {
          if (before.layouts.length >= 20) return { text: t("Es gibt schon 20 Startseiten – lösche zuerst eine (Home → Anpassen)."), ok: false };
          layout = { id: "l" + Math.random().toString(36).slice(2, 10), name: profile.name.slice(0, 40), widgets: structuredClone(GAME_PAGE) };
          const l = layout;
          setPrefs((p) => ({ ...p, layouts: [...p.layouts, l] }));
        }
        await client.call("profiles.save", { profile: { ...profile, dashboardLayoutId: layout.name } });
        return { text: t("Startseite „{l}“ gehört jetzt zum Profil „{p}“: Ist das Profil aktiv, zeigt Home diese Seite.", { l: layout.name, p: profile.name }), ok: true, undo: before };
      }
      case "coopGames": {
        if (!online()) return needPc();
        const { items } = await client.call<{ items: LibraryItem[] }>("library.list");
        const r = coopGames(items, listKind<Record<string, never>>("facts").map((e) => e.data));
        if (!r.yes.length) return { text: t("Aus deinen Angaben kenne ich kein Spiel für zwei. Ich nutze nur deine Kategorien (z. B. „Koop“, „Multiplayer“) und deinen Faktencheck – nichts wird geraten. Unbekannt: {n} Spiele.", { n: r.unknown }), ok: true, actions: [{ kind: "navigate", label: t("Faktencheck öffnen"), path: "/infos?tab=facts" }] };
        const line = (x: (typeof r.yes)[number]) => `• ${x.item.name} (${x.why.startsWith("fact:") ? t("laut deinem Faktencheck") : t("Kategorie „{c}“", { c: x.why.slice(4) })})`;
        return {
          text: t("Zu zweit spielbar ({n}):", { n: r.yes.length }) + "\n" + r.yes.slice(0, 15).map(line).join("\n") + (r.unknown ? "\n" + t("Bei {n} weiteren Spielen weiß ich es nicht – im Faktencheck eintragen, dann zähle ich sie mit.", { n: r.unknown }) : ""),
          ok: true,
          actions: r.yes.slice(0, 3).map((x) => ({ kind: "launch", label: t("{n} starten", { n: x.item.name }), method: "library.launch", params: { id: x.item.id }, confirm: true })),
        };
      }
      case "soundboardReady": {
        if (!online()) return { text: t("Ohne PC kann ich das Soundboard öffnen, aber keine Sounds abspielen."), ok: false, navigate: "/soundboard" };
        const { data } = await client.call<{ data: SoundsFile }>("sounds.list");
        const col = data.collections.find((c) => c.id === data.activeCollectionId);
        return { text: t("Soundboard ist bereit: {n} Sounds liegen auf dem PC{c}. Vorladen ist nicht nötig – sie spielen beim Antippen sofort vom PC.", { n: data.sounds.length, c: col ? t(", aktive Sammlung „{s}“", { s: col.name }) : "" }), ok: true, navigate: "/soundboard" };
      }
    }
  } catch (e) { return fail(e); }
}

/** Runs one action JARVIS may run directly and checks the result. */
export async function runAuto(a: AssistantAction): Promise<StepResult> {
  if (!a.method) return { text: a.label, ok: null };
  try {
    const r = await client.call<unknown>(a.method, a.params ?? {});
    switch (a.kind) {
      case "launch": {
        const id = String(a.params?.id ?? "");
        const name = a.label.replace(/ starten$/, "");
        const running = await waitForState((s) => s.running.some((x) => x.itemId === id), 30_000);
        return running
          ? { text: t("✓ {n} gestartet – läuft.", { n: name }), ok: true }
          : { text: t("{n}: Startbefehl ausgeführt, aber nach 30 Sekunden läuft es laut PC noch nicht (Launcher lädt evtl. noch oder das Spiel wurde nicht erkannt).", { n: name }), ok: null };
      }
      case "profile": {
        const id = String(a.params?.id ?? "");
        const ok = await waitForState((s) => s.activeProfile?.id === id, 8_000);
        return ok ? { text: t("✓ {n} – ist jetzt aktiv.", { n: a.label }), ok: true } : { text: t("{n}: ausgeführt, aber das Profil wird noch nicht als aktiv gemeldet.", { n: a.label }), ok: null };
      }
      case "sound": return { text: t("✓ {n}", { n: a.label }), ok: true };
      case "stopSounds": return { text: t("✓ Alle Sounds gestoppt."), ok: true };
      case "quick": {
        const ok = (r as { ok?: boolean } | null)?.ok;
        return ok === false ? { text: t("{n}: nicht alle Schritte haben geklappt.", { n: a.label }), ok: false } : { text: t("✓ {n}", { n: a.label }), ok: true };
      }
      default: return { text: t("✓ {n}", { n: a.label }), ok: true };
    }
  } catch (e) { return { text: t("✗ {n}: {e}", { n: a.label, e: (e as Error).message }), ok: false }; }
}
