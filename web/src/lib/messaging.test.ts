import { describe, expect, it } from "vitest";
import { cleanPhone, messageLink, parseMessageCommand } from "./messaging";

describe("Nachricht schreiben (Handy/iPad)", () => {
  it("Links öffnen den Messenger mit fertigem Text – ohne Empfänger, außer eine Nummer wurde genannt", () => {
    expect(messageLink("whatsapp", "Bin gleich da & komme")).toBe("https://wa.me/?text=Bin%20gleich%20da%20%26%20komme");
    expect(messageLink("whatsapp", "Hi", "+49 170 1234567")).toBe("https://wa.me/491701234567?text=Hi");
    expect(messageLink("telegram", "Hi")).toBe("https://t.me/share/url?url=%20&text=Hi");
    expect(messageLink("sms", "Hi")).toBe("sms:?&body=Hi");
    expect(messageLink("mail", "Hi")).toBe("mailto:?body=Hi");
  });
  it("Text wird auf 1000 Zeichen begrenzt, Nummern müssen echte Nummern sein", () => {
    expect(decodeURIComponent(messageLink("whatsapp", "a".repeat(5000)).split("text=")[1])).toHaveLength(1000);
    expect(cleanPhone("123")).toBeNull();
    expect(cleanPhone("javascript:alert(1)")).toBeNull();
    expect(cleanPhone("+49 (170) 123-4567")).toBe("491701234567");
  });
  it("erkennt Schreib-Befehle mit App und Text", () => {
    expect(parseMessageCommand("Schreib bei WhatsApp: Bin gleich da")).toEqual({ app: "whatsapp", body: "Bin gleich da", phone: null });
    expect(parseMessageCommand("Schick eine Nachricht")).toBeNull();
    expect(parseMessageCommand("Schreib eine E-Mail an meinen Chef")).toBeNull();
    expect(parseMessageCommand("Schreib eine SMS an Mama")).toEqual({ app: "sms", body: "", phone: null });
    expect(parseMessageCommand("Schick eine Nachricht: Komme später")).toEqual({ app: null, body: "Komme später", phone: null });
    expect(parseMessageCommand("Sende per Telegram: Hallo zusammen")?.app).toBe("telegram");
    expect(parseMessageCommand("Schreib +49 170 1234567 bei WhatsApp: Hi")).toEqual({ app: "whatsapp", body: "Hi", phone: "491701234567" });
    expect(parseMessageCommand("Schreib Mama per WhatsApp dass ich später komme")?.body).toBe("ich später komme");
  });
  it("normale Fragen und Starten sind keine Schreib-Befehle", () => {
    for (const q of ["Starte WhatsApp", "Wie schreibe ich eine Mail?", "Schreib mir einen Text über Minecraft", "Sag mir wie spät es ist", "Öffne Telegram", "Was ist WhatsApp?"]) expect(parseMessageCommand(q)).toBeNull();
  });
});
