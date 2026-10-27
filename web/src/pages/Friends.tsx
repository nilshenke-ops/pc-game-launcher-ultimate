// Freunde & Gruppe: player cards, "what can we play together?", polls and gaming nights with invite / reply links,
// team roles, mini tournaments, server favourites with status (asked only on request). Works without the PC except
// the server status and the reminders in the PC calendar.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PageTabs } from "../components/page-tabs";
import { Navigate, useSearchParams } from "react-router-dom";
import { CalendarPlus, ClipboardPaste, Download, IdCard, Lock, PartyPopper, Plus, RefreshCw, RotateCcw, Server, Share2, Shield, Trash2, Trophy, Users, Vote } from "lucide-react";
import { t } from "../lib/i18n";
import { dateTime } from "../lib/format";
import { toast, useConn } from "../lib/hooks";
import { client } from "../lib/rpc";
import { downloadText, getEntry, newId, useJournal, type Entry } from "../lib/journal";
import { toIcs } from "../lib/calendar";
import { PLAYER, SERVER, TEAM } from "../lib/collection-schemas";
import { groupBy, type Data } from "../lib/collections";
import {
  applyNightReply, applyPollReply, groupFinder, inZone, isPast, linkFor, newKey, readLink, rsvpCount, tally, validTz, zonedToUtc,
  type Invitee, type NightInvite, type Poll, type PollInvite, type Reply,
} from "../lib/friends";
import { CollectionView, removeWithLinks } from "../components/collection-view";
import { Tournaments } from "../components/tournament-view";
import { JImage, SyncBadge, trySave, useGames } from "../components/journal-ui";
import { Banner, Button, Card, confirmDialog, Empty, Field, Meter, Modal, PageHead } from "../components/ui";

type Tab = "players" | "finder" | "polls" | "nights" | "teams" | "tournaments" | "servers";
const TABS: Tab[] = ["players", "finder", "polls", "nights", "teams", "tournaments", "servers"];
const base = () => `${location.origin}${location.pathname}`;

async function shareOrCopy(url: string, title: string) {
  try { if (navigator.share) { await navigator.share({ title, url }); return; } } catch { /* cancelled: copy instead */ }
  try { await navigator.clipboard.writeText(url); toast(t("Link kopiert"), "success"); } catch { toast(url, "info"); }
}

export default function FriendsPage() {
  const [params, setParams] = useSearchParams();
  // The game facts moved to Spiele-Infos → Faktencheck (old links still work).
  if (params.get("tab") === "facts") return <Navigate to={`/infos?tab=facts${params.get("id") ? `&id=${params.get("id")}` : ""}`} replace />;
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "players") as Tab;
  const link = params.get("l");
  const focus = params.get("id");
  const setTab = (v: Tab) => setParams({ tab: v }, { replace: true });
  return (
    <>
      <PageHead eyebrow={t("Spielbegleiter")} title={t("Freunde & Gruppe")} text={t("Spieler-Karten, gemeinsame Spiele, Abstimmungen, Gaming-Abende, Teams, Turniere und Server – privat, auf diesem Gerät gespeichert. Geteilt wird nur per Link, den du selbst verschickst.")} actions={<SyncBadge />} />
      <div className="stack">
        <PageTabs page="friends" tabs={[["players", <IdCard size={15} />, t("Spieler-Karten")], ["finder", <Users size={15} />, t("Was spielen wir?")], ["polls", <Vote size={15} />, t("Abstimmungen")], ["nights", <PartyPopper size={15} />, t("Gaming-Abende")], ["teams", <Shield size={15} />, t("Teams")], ["tournaments", <Trophy size={15} />, t("Turniere")], ["servers", <Server size={15} />, t("Server")]] as [Tab, ReactNode, string][]} value={tab} onChange={(v) => setTab(v)} />
        {link && <LinkHandler part={link} onDone={() => setParams({ tab }, { replace: true })} />}
        {tab === "players" && <CollectionView key="pl" schema={PLAYER} icon={<IdCard size={18} />} focus={focus}
          intro={t("Alle Angaben sind freiwillig und bleiben bei dir. Spiele und Plattformen deiner Freunde trägst du selbst ein – Nexus kennt ihre Bibliotheken nicht.")}
          cardExtra={(e) => <PlayerCardExtra e={e} />} detail={(e) => <PlayerLinks e={e} />} />}
        {tab === "finder" && <GroupFinder onPlan={(game, names) => { planNight(game, names); setTab("nights"); }} />}
        {tab === "polls" && <Polls onPlan={(game) => { planNight(game, []); setTab("nights"); }} />}
        {tab === "nights" && <Nights focus={focus} />}
        {tab === "teams" && <CollectionView key="tm" schema={TEAM} icon={<Shield size={18} />} focus={focus} detail={(e) => <TeamView e={e} />} />}
        {tab === "tournaments" && <Tournaments focus={focus} />}
        {tab === "servers" && <CollectionView key="sv" schema={SERVER} icon={<Server size={18} />} focus={focus}
          intro={t("Status nur auf Knopfdruck über den PC – für Minecraft Java und Steam/Source-Server. Für andere Spiele steht „Unbekannt“, nichts wird erfunden.")}
          cardExtra={(e) => <StatusBadge s={e.data.lastStatus as ServerStatus | undefined} />} detail={(e, save) => <ServerStatusView e={e} save={save} />} />}
      </div>
    </>
  );
}

/** A new gaming night prefilled with a game and invitees (from the finder or a poll). */
function planNight(game: string, names: string[]) {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const id = newId();
  if (trySave("night", id, { title: t("Gaming-Abend: {g}", { g: game }), local, tz, start: zonedToUtc(local, tz), minutes: 180, games: [game], alternatives: [], invitees: names.map((name) => ({ name, rsvp: "open" })), notes: "", rules: "", remindMinutes: 30, key: newKey() } satisfies Night)) toast(t("Gaming-Abend angelegt – bitte Datum prüfen"), "success");
}

// ============================================================================================ players

function PlayerCardExtra({ e }: { e: Entry<Data> }) {
  return (
    <span className="row nowrap" style={{ gap: 8 }}>
      {e.data.avatar ? <span className="j-thumb" style={{ width: 40, height: 40, borderRadius: "50%" }}><JImage id={String(e.data.avatar)} /></span> : null}
      <span className="tiny muted">{((e.data.platforms as string[]) ?? []).join(", ")}{e.data.me ? ` · ${t("Das bin ich")}` : ""}{!e.data.shareAllowed ? " · 🔒" : ""}</span>
    </span>
  );
}

/** Where this player appears: gaming nights and tournaments. */
function PlayerLinks({ e }: { e: Entry<Data> }) {
  const nights = useJournal<Night>("night"), tours = useJournal<{ title: string; participants: string[] }>("tournament");
  const name = String(e.data.title ?? "").toLowerCase();
  const n = nights.filter((x) => x.data.invitees.some((i) => i.name.toLowerCase() === name));
  const tr = tours.filter((x) => x.data.participants.some((p) => p.toLowerCase() === name));
  if (!n.length && !tr.length) return null;
  return (
    <div className="stack-sm">
      {n.length > 0 && <span className="small">{t("Gaming-Abende")}: {n.map((x) => x.data.title).join(", ")}</span>}
      {tr.length > 0 && <span className="small">{t("Turniere")}: {tr.map((x) => x.data.title).join(", ")}</span>}
    </div>
  );
}

// ============================================================================================ F18 group finder

function GroupFinder({ onPlan }: { onPlan: (game: string, names: string[]) => void }) {
  const players = useJournal<Data>("player");
  const facts = useJournal<Data>("facts");
  const [sel, setSel] = useState<string[]>([]);
  const chosen = players.filter((p) => sel.includes(p.id));
  const res = useMemo(() => groupFinder(chosen.map((p) => ({ id: p.id, name: String(p.data.title), games: ((p.data.games as Data[]) ?? []).map((g) => ({ name: String(g.name ?? ""), platform: (g.platform as string) ?? null })) })),
    facts.map((f) => f.data as never)), [chosen, facts]);
  const label: Record<string, [string, string]> = {
    "same-platform": ["Alle auf {p}", "ok"], crossplay: ["Verschiedene Plattformen – Crossplay laut Quelle", "ok"], "crossplay-unknown": ["Verschiedene Plattformen – Crossplay unbekannt", "warn"],
    "no-crossplay": ["Verschiedene Plattformen – kein Crossplay laut Quelle", "error"], missing: ["Fehlt bei: {m}", ""],
  };
  return (
    <Card title={t("Was können wir zusammen spielen?")} icon={<Users size={18} />}>
      {players.length === 0 ? <Empty icon={<IdCard size={26} />} title={t("Erst Spieler-Karten anlegen")} text={t("Trage bei jeder Person ihre Spiele und Plattformen ein – auch dich selbst („Das bin ich“).")} /> : (
        <div className="stack">
          <div className="chips" role="group" aria-label={t("Wer spielt mit?")}>{players.map((p) => <button key={p.id} type="button" aria-pressed={sel.includes(p.id)} className={`chip ${sel.includes(p.id) ? "on" : ""}`} onClick={() => setSel((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}>{String(p.data.title)}</button>)}</div>
          {chosen.length < 2 ? <span className="small muted">{t("Wähle mindestens zwei Personen.")}</span> : res.length === 0 ? <span className="small muted">{t("Bei den gewählten Personen sind noch keine Spiele eingetragen.")}</span> : (
            <div className="stack-sm">
              {res.map((r) => {
                const [text, kind] = label[r.kind];
                return (
                  <div key={r.game} className="j-conflict">
                    <div className="grow">
                      <b className="small">{r.game}</b>{" "}
                      <span className={`badge ${kind}`}>{t(text, { p: r.common.join(", "), m: r.missing.join(", ") })}</span>
                      {r.tooMany && <span className="badge warn">{t("Mehr Leute als Plätze ({n})", { n: r.maxPlayers ?? 0 })}</span>}
                      <div className="tiny muted">{r.owners.map((o) => `${o.player}: ${o.platforms.map((x) => (x === "?" ? t("Plattform unbekannt") : x)).join("/")}`).join(" · ")}</div>
                      {r.source && <a className="tiny" href={r.source} target="_blank" rel="noopener noreferrer">{t("Quelle zu Crossplay")}</a>}
                    </div>
                    {r.kind !== "missing" && r.kind !== "no-crossplay" && <Button size="sm" icon={<CalendarPlus size={14} />} onClick={() => onPlan(r.game, chosen.map((c) => String(c.data.title)))}>{t("Abend planen")}</Button>}
                  </div>
                );
              })}
            </div>
          )}
          <span className="tiny muted">{t("Grundlage sind nur die Spiele auf den Karten und die Spiel-Fakten (Spiele-Infos → Faktencheck). Ohne Quelle wird Crossplay nie angenommen.")}</span>
        </div>
      )}
    </Card>
  );
}

// ============================================================================================ links from friends

function LinkHandler({ part, onDone }: { part: string; onDone: () => void }) {
  const l = useMemo(() => readLink(part), [part]);
  if (!l) return <Banner kind="error" title={t("Link ungültig")} actions={<Button size="sm" onClick={onDone}>{t("Schließen")}</Button>}>{t("Der Link ist beschädigt oder unvollständig.")}</Banner>;
  if (l.k === "reply") return <ReplyImport r={l} onDone={onDone} />;
  return <InviteAnswer inv={l} onDone={onDone} />;
}

/** A friend opened an invite: vote / answer, then send the reply link back. Nothing is sent anywhere by itself. */
function InviteAnswer({ inv, onDone }: { inv: PollInvite | NightInvite; onDone: () => void }) {
  const [name, setName] = useState("");
  const [choices, setChoices] = useState<number[]>([]);
  const [rsvp, setRsvp] = useState<"yes" | "maybe" | "no" | "">("");
  const [note, setNote] = useState("");
  const ok = name.trim() && (inv.k === "poll" ? choices.length > 0 : !!rsvp);
  const reply: Reply = inv.k === "poll" ? { k: "reply", to: "poll", id: inv.id, key: inv.key, name: name.trim(), choices, note } : { k: "reply", to: "night", id: inv.id, key: inv.key, name: name.trim(), rsvp: (rsvp || "yes") as "yes", note };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return (
    <Card title={inv.title} icon={inv.k === "poll" ? <Vote size={18} /> : <PartyPopper size={18} />} meta={t("Einladung")}>
      <div className="stack">
        {inv.k === "night" && <div className="small">
          <div><b>{inZone(inv.start, tz)}</b> {t("(deine Zeit, {z})", { z: tz })}{inv.tz !== tz && <span className="tiny muted"> · {t("beim Gastgeber {t} ({z})", { t: inZone(inv.start, inv.tz), z: inv.tz })}</span>}</div>
          {inv.games.length > 0 && <div>{t("Spiele")}: {inv.games.join(", ")}</div>}
          {inv.rules && <div className="muted">{t("Regeln")}: {inv.rules}</div>}
          {inv.notes && <div className="muted">{inv.notes}</div>}
        </div>}
        <Field label={t("Dein Name")}><input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {inv.k === "poll" ? (
          <div className="stack-sm" role="group" aria-label={t("Auswahl")}>
            {inv.options.map((o, i) => <label key={i} className="checkbox"><input type={inv.multi ? "checkbox" : "radio"} name="poll" checked={choices.includes(i)} onChange={() => setChoices((c) => (inv.multi ? (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]) : [i]))} />{o}</label>)}
            {inv.until && <span className="tiny muted">{t("Abstimmen bis {d}", { d: dateTime(inv.until) })}</span>}
          </div>
        ) : (
          <div className="chips" role="radiogroup" aria-label={t("Zusage")}>{(["yes", "maybe", "no"] as const).map((r) => <button key={r} type="button" role="radio" aria-checked={rsvp === r} className={`chip ${rsvp === r ? "on" : ""}`} onClick={() => setRsvp(r)}>{t(RSVP_LABEL[r])}</button>)}</div>
        )}
        <Field label={t("Nachricht (optional)")}><input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="row" style={{ gap: 6 }}>
          <Button variant="primary" icon={<Share2 size={15} />} disabled={!ok} onClick={() => void shareOrCopy(linkFor(base(), inv.k === "poll" ? "polls" : "nights", reply), inv.title)}>{t("Antwort-Link senden")}</Button>
          <Button onClick={onDone}>{t("Schließen")}</Button>
        </div>
        <span className="tiny muted">{t("Deine Antwort steckt nur in diesem Link. Schick ihn an die Person zurück, die dich eingeladen hat – sie öffnet ihn, dann zählt deine Antwort. Es gibt keine Live-Ansicht.")}</span>
      </div>
    </Card>
  );
}

const REASON: Record<string, string> = { revoked: "Der Link gehört zu einer zurückgezogenen oder fremden Einladung.", closed: "Die Abstimmung ist geschlossen bzw. der Abend abgesagt.", expired: "Die Frist ist abgelaufen.", invalid: "Die Antwort passt nicht zu den Optionen.", unknown: "Diese Abstimmung / dieser Abend ist auf diesem Gerät nicht gespeichert." };

/** You opened a reply link from a friend: it counts only for your own, still open poll / night with the current key. */
function ReplyImport({ r, onDone }: { r: Reply; onDone: () => void }) {
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  useEffect(() => {
    if (r.to === "poll") {
      const e = getEntry<Poll>(r.id);
      if (!e || e.kind !== "poll") { setMsg({ kind: "error", text: t(REASON.unknown) }); return; }
      const { poll, result } = applyPollReply(e.data, r);
      if (!result.ok) { setMsg({ kind: "error", text: t(REASON[result.reason]) }); return; }
      trySave("poll", r.id, poll);
      setMsg({ kind: "ok", text: result.replaced ? t("Stimme von {n} aktualisiert", { n: r.name }) : t("Stimme von {n} gezählt", { n: r.name }) });
    } else {
      const e = getEntry<Night>(r.id);
      if (!e || e.kind !== "night") { setMsg({ kind: "error", text: t(REASON.unknown) }); return; }
      const { invitees, result } = applyNightReply(e.data, r);
      if (!result.ok) { setMsg({ kind: "error", text: t(REASON[result.reason]) }); return; }
      trySave("night", r.id, { ...e.data, invitees });
      setMsg({ kind: "ok", text: t("{n}: {r}", { n: r.name, r: t(RSVP_LABEL[r.rsvp!]) }) });
    }
  }, [r]);
  if (!msg) return null;
  return <Banner kind={msg.kind} title={t("Antwort-Link")} actions={<Button size="sm" onClick={onDone}>{t("OK")}</Button>}>{msg.text}{r.note && <div className="tiny muted">„{r.note}“</div>}</Banner>;
}

function PasteReply() {
  const [v, setV] = useState("");
  const [, setParams] = useSearchParams();
  const go = () => {
    const m = /[?&]l=([A-Za-z0-9_-]+)/.exec(v.trim());
    if (!m) { toast(t("Das ist kein Antwort-Link."), "error"); return; }
    const tab = /tab=nights/.test(v) ? "nights" : "polls";
    setParams({ tab, l: m[1] });
    setV("");
  };
  return (
    <div className="row nowrap" style={{ gap: 6 }}>
      <input className="input grow" value={v} placeholder={t("Antwort-Link hier einfügen …")} aria-label={t("Antwort-Link einfügen")} onChange={(e) => setV(e.target.value)} />
      <Button size="sm" icon={<ClipboardPaste size={14} />} disabled={!v.trim()} onClick={go}>{t("Übernehmen")}</Button>
    </div>
  );
}

// ============================================================================================ F17 polls

function Polls({ onPlan }: { onPlan: (game: string) => void }) {
  const polls = useJournal<Poll>("poll");
  const [edit, setEdit] = useState<{ id: string; data: Poll } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const cur = polls.find((p) => p.id === open);
  return (
    <>
      <Card title={t("Spiele-Abstimmungen")} icon={<Vote size={18} />} actions={<Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setEdit({ id: newId(), data: { title: t("Was spielen wir?"), options: [{ text: "" }, { text: "" }], key: newKey(), votes: [] } })}>{t("Neue Abstimmung")}</Button>}>
        <div className="stack-sm">
          <span className="small muted">{t("Freunde stimmen über einen Link ab und schicken dir einen Antwort-Link zurück. Schließen beendet die Abstimmung, „Link zurückziehen“ macht alle alten Links ungültig.")}</span>
          <PasteReply />
          {polls.length === 0 ? <Empty icon={<Vote size={26} />} title={t("Noch keine Abstimmung")} /> : polls.map((p) => { const tl = tally(p.data); return (
            <button key={p.id} type="button" className="j-hit" onClick={() => setOpen(p.id)}><Vote size={15} /> <b>{p.data.title}</b><span className="tiny muted">{t("{n} Stimmen", { n: tl.voters })}{p.data.closed ? " · " + t("geschlossen") : ""}{tl.winners.length ? ` · ${tl.winners.map((w) => w.text).join(" / ")}` : ""}</span></button>
          ); })}
        </div>
      </Card>
      {cur && <PollView e={cur} onClose={() => setOpen(null)} onEdit={() => { setEdit({ id: cur.id, data: cur.data }); setOpen(null); }} onPlan={onPlan} />}
      {edit && <PollEditor id={edit.id} initial={edit.data} onClose={(saved) => { setEdit(null); if (saved) setOpen(edit.id); }} />}
    </>
  );
}

function PollEditor({ id, initial, onClose }: { id: string; initial: Poll; onClose: (saved: boolean) => void }) {
  const [p, setP] = useState<Poll>(initial);
  const opts = p.options.map((o) => o.text.trim());
  const err = !p.title.trim() ? t("Titel fehlt.") : opts.filter(Boolean).length < 2 ? t("Mindestens zwei Optionen.") : new Set(opts.filter(Boolean).map((o) => o.toLowerCase())).size !== opts.filter(Boolean).length ? t("Jede Option nur einmal.") : p.votes.length && opts.length !== initial.options.length ? t("Nach den ersten Stimmen lassen sich Optionen nur umbenennen, nicht hinzufügen oder entfernen.") : null;
  const save = () => { if (!err && trySave("poll", id, { ...p, title: p.title.trim(), options: p.votes.length ? p.options : p.options.filter((o) => o.text.trim()) })) onClose(true); };
  return (
    <Modal title={t("Abstimmung")} onClose={() => onClose(false)} footer={<><Button onClick={() => onClose(false)}>{t("Abbrechen")}</Button><Button variant="primary" disabled={!!err} onClick={save}>{t("Speichern")}</Button></>}>
      <div className="stack">
        <Field label={t("Frage")}><input className="input" maxLength={120} value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} /></Field>
        <div className="stack-sm">
          <b className="small">{t("Optionen")}</b>
          {p.options.map((o, i) => (
            <div key={i} className="row nowrap" style={{ gap: 6 }}>
              <input className="input grow" maxLength={100} value={o.text} aria-label={t("Option {n}", { n: i + 1 })} onChange={(e) => setP({ ...p, options: p.options.map((x, j) => (j === i ? { text: e.target.value } : x)) })} />
              {!p.votes.length && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Option entfernen")} disabled={p.options.length <= 2} onClick={() => setP({ ...p, options: p.options.filter((_, j) => j !== i) })} />}
            </div>
          ))}
          {!p.votes.length && <div><Button size="sm" icon={<Plus size={14} />} disabled={p.options.length >= 30} onClick={() => setP({ ...p, options: [...p.options, { text: "" }] })}>{t("Option hinzufügen")}</Button></div>}
        </div>
        <label className="checkbox"><input type="checkbox" checked={!!p.multi} disabled={p.votes.length > 0} onChange={(e) => setP({ ...p, multi: e.target.checked })} />{t("Mehrere Antworten erlaubt")}</label>
        <Field label={t("Abstimmen bis (optional)")}><input type="datetime-local" className="input" value={p.until ? new Date(Date.parse(p.until) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} onChange={(e) => setP({ ...p, until: e.target.value ? new Date(e.target.value).toISOString() : null })} /></Field>
        {err && <span className="tiny" style={{ color: "var(--warning)" }}>{err}</span>}
      </div>
    </Modal>
  );
}

function PollView({ e, onClose, onEdit, onPlan }: { e: Entry<Poll>; onClose: () => void; onEdit: () => void; onPlan: (game: string) => void }) {
  const p = e.data, tl = tally(p);
  const invite: PollInvite = { k: "poll", id: e.id, key: p.key, title: p.title, options: p.options.map((o) => o.text), multi: !!p.multi, until: p.until ?? null };
  return (
    <Modal title={p.title} onClose={onClose} wide footer={<>
      <Button variant="ghost" icon={<Trash2 size={15} />} onClick={async () => { if (await confirmDialog(t("Abstimmung löschen?"), t("Sie wird auf allen Geräten gelöscht."), { danger: true, ok: t("Löschen") })) { removeWithLinks(e.id); onClose(); } }}>{t("Löschen")}</Button>
      <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={async () => { if (await confirmDialog(t("Link zurückziehen?"), t("Alle bisher verschickten Links und Antwort-Links werden ungültig. Bereits gezählte Stimmen bleiben."), { ok: t("Zurückziehen") })) { trySave("poll", e.id, { ...p, key: newKey() }); toast(t("Neuer Link erzeugt – alte Links gelten nicht mehr")); } }}>{t("Link zurückziehen")}</Button>
      <Button variant="ghost" icon={<Lock size={15} />} onClick={() => trySave("poll", e.id, { ...p, closed: !p.closed })}>{p.closed ? t("Wieder öffnen") : t("Schließen")}</Button>
      <Button onClick={onEdit}>{t("Bearbeiten")}</Button>
      <Button variant="primary" icon={<Share2 size={15} />} disabled={p.closed} onClick={() => void shareOrCopy(linkFor(base(), "polls", invite), p.title)}>{t("Einladungs-Link")}</Button>
    </>}>
      <div className="stack">
        {p.closed && <Banner kind="info">{t("Geschlossen – neue Antworten werden nicht mehr gezählt.")}</Banner>}
        {tl.counts.map((c) => (
          <div key={c.index} className="stack-sm">
            <div className="row between"><span className="small"><b>{c.text}</b></span><span className="tiny muted">{t("{n} Stimmen", { n: c.votes })}</span></div>
            <Meter value={tl.voters ? (c.votes / tl.voters) * 100 : 0} />
            {c.names.length > 0 && <span className="tiny muted">{c.names.join(", ")}</span>}
          </div>
        ))}
        {tl.winners.length > 0 && <div className="row" style={{ gap: 6 }}><span className="small">{t("Vorne")}: <b>{tl.winners.map((w) => w.text).join(" / ")}</b></span><Button size="sm" icon={<CalendarPlus size={14} />} onClick={() => { onPlan(tl.winners[0].text); onClose(); }}>{t("Gaming-Abend planen")}</Button></div>}
        <span className="tiny muted">{t("Stimmen kommen nur über Antwort-Links an, die du öffnest – keine Live-Zählung.")}</span>
      </div>
    </Modal>
  );
}

// ============================================================================================ F19 gaming nights

interface Night { title: string; local: string; tz: string; start: string; minutes: number; games: string[]; alternatives: string[]; pollId?: string | null; invitees: Invitee[]; notes: string; rules: string; remindMinutes: number | null; cancelled?: boolean; key: string; calendarId?: string | null }
const RSVP_LABEL: Record<string, string> = { yes: "Zusage", maybe: "Vielleicht", no: "Absage", open: "Offen" };

function Nights({ focus }: { focus: string | null }) {
  const nights = useJournal<Night>("night");
  const [past, setPast] = useState(false);
  const [edit, setEdit] = useState<{ id: string; data: Night } | null>(null);
  const [open, setOpen] = useState<string | null>(focus);
  const cur = nights.find((n) => n.id === open);
  const shown = nights.filter((n) => isPast(n.data.start, n.data.minutes) === past).sort((a, b) => (past ? -1 : 1) * (Date.parse(a.data.start) - Date.parse(b.data.start)));
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const fresh = (): Night => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); return { title: t("Gaming-Abend"), local, tz, start: zonedToUtc(local, tz), minutes: 180, games: [], alternatives: [], invitees: [], notes: "", rules: "", remindMinutes: 30, key: newKey() }; };
  return (
    <>
      <Card title={t("Gaming-Abende")} icon={<PartyPopper size={18} />} actions={<Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setEdit({ id: newId(), data: fresh() })}>{t("Neuer Abend")}</Button>}>
        <div className="stack-sm">
          <div className="chips"><button type="button" className={`chip ${!past ? "on" : ""}`} onClick={() => setPast(false)}>{t("Geplant")}</button><button type="button" className={`chip ${past ? "on" : ""}`} onClick={() => setPast(true)}>{t("Vergangen")} ({nights.filter((n) => isPast(n.data.start, n.data.minutes)).length})</button></div>
          <PasteReply />
          {shown.length === 0 ? <Empty icon={<PartyPopper size={26} />} title={past ? t("Noch keine vergangenen Abende") : t("Kein Abend geplant")} /> : shown.map((n) => { const c = rsvpCount(n.data.invitees); return (
            <button key={n.id} type="button" className="j-hit" onClick={() => setOpen(n.id)}><PartyPopper size={15} /> <b>{n.data.title}</b><span className="tiny muted">{inZone(n.data.start, tz)}{n.data.cancelled ? " · " + t("abgesagt") : ""} · {t("{y} Zusagen · {m} vielleicht · {o} offen", { y: c.yes, m: c.maybe, o: c.open })}</span></button>
          ); })}
        </div>
      </Card>
      {cur && <NightView e={cur} onClose={() => setOpen(null)} onEdit={() => { setEdit({ id: cur.id, data: cur.data }); setOpen(null); }} />}
      {edit && <NightEditor id={edit.id} initial={edit.data} onClose={(saved) => { setEdit(null); if (saved) setOpen(edit.id); }} />}
    </>
  );
}

function NightEditor({ id, initial, onClose }: { id: string; initial: Night; onClose: (saved: boolean) => void }) {
  const [n, setN] = useState<Night>(initial);
  const players = useJournal<Data>("player");
  const polls = useJournal<Poll>("poll");
  const games = useGames();
  const [inv, setInv] = useState("");
  const err = !n.title.trim() ? t("Titel fehlt.") : !n.local || isNaN(Date.parse(n.local)) ? t("Datum und Uhrzeit fehlen.") : !validTz(n.tz) ? t("Unbekannte Zeitzone.") : n.minutes < 0 || n.minutes > 24 * 60 ? t("Dauer: 0 bis 24 Stunden.") : null;
  const addInvitee = (name: string) => { const nm = name.trim(); if (nm && !n.invitees.some((i) => i.name.toLowerCase() === nm.toLowerCase())) setN({ ...n, invitees: [...n.invitees, { name: nm, rsvp: "open" }] }); };
  const save = () => { if (!err && trySave("night", id, { ...n, title: n.title.trim(), start: zonedToUtc(n.local, n.tz) })) onClose(true); };
  const list = (k: "games" | "alternatives") => (
    <Field label={k === "games" ? t("Spiele") : t("Alternativen")} hint={t("Mit Komma trennen")}>
      <input className="input" list="night-games" value={n[k].join(", ")} onChange={(e) => setN({ ...n, [k]: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10) })} />
    </Field>
  );
  return (
    <Modal title={t("Gaming-Abend")} onClose={() => onClose(false)} wide footer={<><Button onClick={() => onClose(false)}>{t("Abbrechen")}</Button><Button variant="primary" disabled={!!err} onClick={save}>{t("Speichern")}</Button></>}>
      <div className="stack">
        <Field label={t("Titel")}><input className="input" maxLength={120} value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} /></Field>
        <div className="grid-2" style={{ gap: 10 }}>
          <Field label={t("Datum und Uhrzeit")}><input type="datetime-local" className="input" value={n.local} onChange={(e) => setN({ ...n, local: e.target.value })} /></Field>
          <Field label={t("Zeitzone")} hint={t("Gilt für Datum und Uhrzeit oben")}><input className="input" value={n.tz} onChange={(e) => setN({ ...n, tz: e.target.value.trim() })} /></Field>
          <Field label={t("Dauer (Minuten)")}><input className="input" inputMode="numeric" value={String(n.minutes)} onChange={(e) => setN({ ...n, minutes: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></Field>
          <Field label={t("Erinnerung (Minuten vorher)")} hint={t("Über den Gaming-Kalender des PCs")}><input className="input" inputMode="numeric" value={n.remindMinutes == null ? "" : String(n.remindMinutes)} onChange={(e) => setN({ ...n, remindMinutes: e.target.value === "" ? null : Math.min(10080, Number(e.target.value.replace(/\D/g, "")) || 0) })} /></Field>
        </div>
        {list("games")}{list("alternatives")}
        <datalist id="night-games">{games.map((g) => <option key={g.id} value={g.name} />)}</datalist>
        {polls.length > 0 && <Field label={t("Zugehörige Abstimmung")}><select className="input" value={n.pollId ?? ""} onChange={(e) => setN({ ...n, pollId: e.target.value || null })}><option value="">–</option>{polls.map((p) => <option key={p.id} value={p.id}>{p.data.title}</option>)}</select></Field>}
        <div className="stack-sm">
          <b className="small">{t("Eingeladen")} ({n.invitees.length})</b>
          <div className="row" style={{ gap: 6 }}>{n.invitees.map((i) => <span key={i.name} className="chip on">{i.name}<button type="button" className="chip-x" aria-label={t("{n} entfernen", { n: i.name })} onClick={() => setN({ ...n, invitees: n.invitees.filter((x) => x !== i) })}>×</button></span>)}</div>
          <div className="row nowrap" style={{ gap: 6 }}><input className="input grow" value={inv} maxLength={40} placeholder={t("Name")} onChange={(e) => setInv(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addInvitee(inv); setInv(""); } }} /><Button size="sm" onClick={() => { addInvitee(inv); setInv(""); }}>{t("Hinzufügen")}</Button></div>
          {players.length > 0 && <div className="row" style={{ gap: 6 }}>{players.filter((p) => !p.data.me).map((p) => <button key={p.id} type="button" className="chip" onClick={() => addInvitee(String(p.data.title))}>+ {String(p.data.title)}</button>)}</div>}
        </div>
        <Field label={t("Notizen")}><textarea className="input" rows={2} maxLength={1000} value={n.notes} onChange={(e) => setN({ ...n, notes: e.target.value })} /></Field>
        <Field label={t("Regeln (optional)")}><textarea className="input" rows={2} maxLength={1000} value={n.rules} onChange={(e) => setN({ ...n, rules: e.target.value })} /></Field>
        <label className="checkbox"><input type="checkbox" checked={!!n.cancelled} onChange={(e) => setN({ ...n, cancelled: e.target.checked })} />{t("Abgesagt")}</label>
        {err && <span className="tiny" style={{ color: "var(--warning)" }}>{err}</span>}
      </div>
    </Modal>
  );
}

function NightView({ e, onClose, onEdit }: { e: Entry<Night>; onClose: () => void; onEdit: () => void }) {
  const n = e.data, c = rsvpCount(n.invitees);
  const players = useJournal<Data>("player");
  const poll = n.pollId ? getEntry<Poll>(n.pollId) : undefined;
  const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const tzOf = (name: string) => { const p = players.find((x) => String(x.data.title).toLowerCase() === name.toLowerCase()); const tz = p?.data.timezone as string | undefined; return tz && validTz(tz) ? tz : null; };
  const invite: NightInvite = { k: "night", id: e.id, key: n.key, title: n.title, start: n.start, tz: n.tz, minutes: n.minutes, games: [...n.games, ...n.alternatives.map((a) => `${a} (${t("Alternative")})`)], notes: n.notes, rules: n.rules };
  const calEvent = { id: n.calendarId ?? "cal_" + e.id.slice(2, 30), title: n.title, start: n.start, durationMinutes: n.minutes, allDay: false, repeat: "none" as const, remindMinutes: n.remindMinutes, note: [n.games.join(", "), n.notes].filter(Boolean).join(" – ").slice(0, 500) };
  const toCalendar = async () => {
    try { await client.call("calendar.save", calEvent); trySave("night", e.id, { ...n, calendarId: calEvent.id }); toast(client.status.auth === "ok" ? t("Im Gaming-Kalender eingetragen – der PC erinnert") : t("Vorgemerkt – wird beim Verbinden in den Kalender des PCs eingetragen"), "success"); }
    catch (err) { toast((err as Error).message, "error"); }
  };
  return (
    <Modal title={n.title} onClose={onClose} wide footer={<>
      <Button variant="ghost" icon={<Trash2 size={15} />} onClick={async () => { if (await confirmDialog(t("Abend löschen?"), t("Er wird auf allen Geräten gelöscht."), { danger: true, ok: t("Löschen") })) { removeWithLinks(e.id); onClose(); } }}>{t("Löschen")}</Button>
      <Button variant="ghost" icon={<Download size={15} />} onClick={() => downloadText(`${n.title.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40)}.ics`, toIcs([calEvent]), "text/calendar")}>{t("Kalenderdatei (.ics)")}</Button>
      <Button variant="ghost" icon={<CalendarPlus size={15} />} onClick={() => void toCalendar()}>{n.calendarId ? t("Im Kalender aktualisieren") : t("In den Gaming-Kalender")}</Button>
      <Button onClick={onEdit}>{t("Bearbeiten")}</Button>
      <Button variant="primary" icon={<Share2 size={15} />} disabled={n.cancelled} onClick={() => void shareOrCopy(linkFor(base(), "nights", invite), n.title)}>{t("Einladungs-Link")}</Button>
    </>}>
      <div className="stack">
        {n.cancelled && <Banner kind="warn">{t("Abgesagt – Antwort-Links werden nicht mehr gezählt.")}</Banner>}
        <div className="small"><b>{inZone(n.start, myTz)}</b> {t("(deine Zeit)")} · {t("{m} Min.", { m: n.minutes })}{n.tz !== myTz && <span className="tiny muted"> · {t("geplant in {z}", { z: n.tz })}</span>}</div>
        {(n.games.length > 0 || n.alternatives.length > 0) && <div className="small">{t("Spiele")}: {n.games.join(", ") || "–"}{n.alternatives.length > 0 && <span className="muted"> · {t("Alternativen")}: {n.alternatives.join(", ")}</span>}</div>}
        {poll && <span className="small">{t("Abstimmung")}: {poll.data.title} – {tally(poll.data).winners.map((w) => w.text).join(" / ") || t("noch keine Stimmen")}</span>}
        <div className="row" style={{ gap: 6 }}><span className="badge ok">{t("{n} Zusagen", { n: c.yes })}</span><span className="badge warn">{t("{n} vielleicht", { n: c.maybe })}</span><span className="badge error">{t("{n} Absagen", { n: c.no })}</span><span className="badge">{t("{n} offen", { n: c.open })}</span></div>
        <div className="stack-sm">
          {n.invitees.map((i) => { const tz = tzOf(i.name); return (
            <div key={i.name} className="row nowrap small" style={{ gap: 8 }}>
              <span className="grow">{i.name}{i.note && <span className="tiny muted"> · „{i.note}“</span>}{tz && tz !== myTz && <span className="tiny muted"> · {t("bei ihr/ihm: {t}", { t: inZone(n.start, tz) })}</span>}</span>
              <select className="input" style={{ maxWidth: 140 }} value={i.rsvp ?? "open"} aria-label={t("Antwort von {n}", { n: i.name })} onChange={(ev) => trySave("night", e.id, { ...n, invitees: n.invitees.map((x) => (x === i ? { ...x, rsvp: ev.target.value as Invitee["rsvp"] } : x)) })}>
                {Object.entries(RSVP_LABEL).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
              </select>
            </div>
          ); })}
        </div>
        {n.rules && <div className="small"><b>{t("Regeln")}:</b> {n.rules}</div>}
        {n.notes && <div className="small muted" style={{ whiteSpace: "pre-wrap" }}>{n.notes}</div>}
        <span className="tiny muted">{t("Einladung per Link: Freunde antworten mit einem Antwort-Link, den du hier öffnest oder einfügst. Zu- und Absagen kannst du auch selbst eintragen.")}</span>
      </div>
    </Modal>
  );
}

// ============================================================================================ F20 teams

function TeamView({ e }: { e: Entry<Data> }) {
  const lineups = groupBy((e.data.lineups as Data[]) ?? [], "lineup", t("Ohne Namen"));
  const roles = (e.data.roles as Data[]) ?? [];
  if (!lineups.length && !roles.length) return null;
  return (
    <div className="stack">
      {roles.length > 0 && <div className="row" style={{ gap: 6 }}>{roles.map((r, i) => <span key={i} className="badge" title={String(r.description ?? "")}>{String(r.name)}</span>)}</div>}
      {lineups.map(([name, rows]) => (
        <div key={name} className="j-item">
          <b className="small">{name}</b>
          {rows.map((r, i) => <div key={i} className="row nowrap small" style={{ gap: 8 }}><span className="badge info">{String(r.role)}</span><span className="grow">{r.member ? String(r.member) : <span className="muted">{t("offen")}</span>}</span>{r.task ? <span className="tiny muted">{String(r.task)}</span> : null}</div>)}
        </div>
      ))}
    </div>
  );
}

// ============================================================================================ P2-F2 servers

interface ServerStatus { status: "online" | "offline" | "unknown"; players?: number | null; maxPlayers?: number | null; name?: string | null; version?: string | null; motd?: string | null; map?: string | null; latencyMs?: number | null; error?: string | null; checkedAt: string }

function StatusBadge({ s }: { s?: ServerStatus }) {
  if (!s) return <span className="badge">{t("Status unbekannt")}</span>;
  return <span className={`badge ${s.status === "online" ? "ok" : s.status === "offline" ? "error" : ""}`}>{s.status === "online" ? t("Online") : s.status === "offline" ? t("Nicht erreichbar") : t("Unbekannt")}{s.players != null ? ` · ${s.players}/${s.maxPlayers ?? "?"}` : ""} · {t("zuletzt {d}", { d: dateTime(s.checkedAt) })}</span>;
}

function ServerStatusView({ e, save }: { e: Entry<Data>; save: (d: Data) => void }) {
  const conn = useConn();
  const online = conn.auth === "ok" && !client.demo;
  const [busy, setBusy] = useState(false);
  const s = e.data.lastStatus as ServerStatus | undefined;
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await client.call<ServerStatus>("servers.query", { protocol: e.data.protocol, host: e.data.host, ...(e.data.port ? { port: e.data.port } : {}) });
      save({ ...e.data, lastStatus: r });
    } catch (err) { toast((err as Error).message, "error"); }
    setBusy(false);
  };
  return (
    <div className="j-item">
      <div className="row between"><b className="small">{t("Zuletzt bekannter Status")}</b><Button size="sm" icon={<RefreshCw size={14} />} busy={busy} disabled={!online || e.data.protocol === "other"} onClick={() => void refresh()}>{t("Aktualisieren")}</Button></div>
      {e.data.protocol === "other" ? <span className="small muted">{t("Für dieses Spiel gibt es keine unterstützte Statusabfrage – Status unbekannt.")}</span>
        : !online && <span className="tiny muted">{t("Abfragen geht nur, wenn der PC verbunden ist (er fragt den Server direkt).")}</span>}
      {s ? (
        <div className="small stack-sm">
          <StatusBadge s={s} />
          {s.name && <span>{t("Name laut Server")}: {s.name}</span>}
          {s.motd && <span>{s.motd}</span>}
          {(s.version || s.map) && <span className="tiny muted">{[s.version, s.map].filter(Boolean).join(" · ")}</span>}
          {s.latencyMs != null && <span className="tiny muted">{t("Antwortzeit {n} ms (vom PC aus)", { n: s.latencyMs })}</span>}
          {s.error && <span className="tiny muted">{t(s.error)}</span>}
        </div>
      ) : <span className="small muted">{t("Noch nie abgefragt.")}</span>}
    </div>
  );
}

