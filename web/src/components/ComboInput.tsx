import { useState } from "react";
import { t } from "../lib/i18n";
import { comboFromEvent, comboFromMouse } from "../pages/hotkey-combo";

/** Field for a key combination: focus it and press the keys (or a mouse side button) – or type it, e.g. Ctrl+Alt+F9. */
export function ComboInput({ value, onChange, label, placeholder = "Ctrl+Alt+F9" }: { value: string; onChange: (v: string) => void; label?: string; placeholder?: string }) {
  const [recording, setRecording] = useState(false);
  return (
    <input className="input mono" value={value} placeholder={recording ? t("Kombination drücken …") : placeholder} aria-label={label}
      onFocus={() => setRecording(true)} onBlur={() => setRecording(false)}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (["Control", "Alt", "Shift", "Meta", "Backspace"].includes(e.key) || e.key === "Tab") return;
        const c = comboFromEvent(e);
        if (c) { e.preventDefault(); onChange(c); }
      }}
      // Mouse side buttons pressed while the field is active (would otherwise navigate back/forward).
      onMouseDown={(e) => { const c = comboFromMouse(e); if (c) { e.preventDefault(); onChange(c); } }}
      onMouseUp={(e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); }} />
  );
}
