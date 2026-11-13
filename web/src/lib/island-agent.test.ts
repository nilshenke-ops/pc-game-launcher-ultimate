import { describe, expect, it } from "vitest";
import { AGENT_DONE_MS, agentLine, agentPhase, agentProgress, type AgentBrief } from "./island-agent";

const b = (x: Partial<AgentBrief>): AgentBrief & { at: number } => ({ id: "t", kind: "diagnose", state: "planned", summary: "Ursache: Kabel", by: "Handy", done: 0, total: 3, critical: false, steps: 3, at: 1000, ...x });

describe("AI Activity Island", () => {
  it("zeigt Entscheidung, Arbeit, Ergebnis – das Ergebnis nur kurz", () => {
    expect(agentPhase(b({}), 1000)).toBe("decide");
    expect(agentPhase(b({ steps: 0 }), 1000)).toBeNull(); // nothing to decide (e.g. "already set up")
    expect(agentPhase(b({ state: "running" }), 99999)).toBe("working");
    expect(agentPhase(b({ state: "done" }), 1000 + AGENT_DONE_MS - 1)).toBe("done");
    expect(agentPhase(b({ state: "done" }), 1000 + AGENT_DONE_MS + 1)).toBeNull();
    expect(agentPhase(b({ state: "failed" }), 1500)).toBe("error");
    expect(agentPhase(b({ state: "cancelled" }), 1500)).toBeNull();
  });
  it("Texte nennen Schritt und Fehler aus dem echten Zustand", () => {
    expect(agentLine(b({ state: "running", current: "Audio prüfen", done: 1 }), "working")).toBe("JARVIS arbeitet (2/3): Audio prüfen");
    expect(agentLine(b({ error: "Recht fehlt" }), "error")).toContain("Recht fehlt");
    expect(agentProgress(b({ done: 2, total: 4 }))).toBe(0.5);
  });
});
