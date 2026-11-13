import { describe, expect, it } from "vitest";
import { chosenSteps, durationText, maybeAgentRequest, needsCritical, type AgentTask } from "./jarvis-agent";

const task = (steps: Partial<AgentTask["steps"][number]>[]): AgentTask => ({
  id: "t", kind: "diagnose", by: "PC", createdAt: "", model: "", costUsd: 0, state: "planned", summary: "", findings: [],
  steps: steps.map((s, i) => ({ id: "s" + i, kind: "check", title: "", tier: "read", permission: "view", selected: true, status: "planned", ...s })),
});

describe("JARVIS-Steuerzentrale (Web)", () => {
  it("fragt den PC nur bei passenden Aufträgen nach einem Plan", () => {
    expect(maybeAgentRequest("Bereite meinen PC für eine Runde vor")).toBe(true);
    expect(maybeAgentRequest("Warum funktioniert mein Soundboard nicht?")).toBe(true);
    expect(maybeAgentRequest("Wenn ich Counter-Strike starte, öffne Discord")).toBe(true);
    expect(maybeAgentRequest("Erzähl mir was über Zelda")).toBe(false);
    expect(maybeAgentRequest("Starte Minecraft")).toBe(false);
  });
  it("Auswahl: abgewählte Schritte fehlen, die Prüfung danach kommt ans Ende, kritische brauchen eigene Bestätigung", () => {
    const t = task([{ kind: "verify" }, { kind: "audio-voice", tier: "execute" }, { kind: "audio-reset", tier: "critical", selected: false }]);
    expect(chosenSteps(t, {})).toEqual(["s1", "s0"]);
    expect(needsCritical(t, chosenSteps(t, {}))).toBe(false);
    expect(needsCritical(t, chosenSteps(t, { s2: true }))).toBe(true);
    expect(chosenSteps(t, { s1: false })).toEqual(["s0"]);
  });
  it("Dauer aus Start und Ende", () => {
    expect(durationText({ ...task([]), startedAt: "2026-11-13T10:00:00Z", endedAt: "2026-11-13T10:00:02.5Z" })).toBe("2,5 s");
    expect(durationText(task([]))).toBeNull();
  });
});
