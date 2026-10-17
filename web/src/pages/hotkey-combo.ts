/** Converts a keyboard event into the companion's notation, e.g. "Ctrl+Alt+F9". */
export function comboFromEvent(e: { key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null {
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win"].filter(Boolean) as string[];
  let key: string | null = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) key = "Num" + e.code.slice(6);
  else if (/^F\d{1,2}$/.test(e.key)) key = e.key;
  else key = ({ " ": "Space", Enter: "Enter", Escape: "Escape", Tab: "Tab", Delete: "Delete", Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Pause: "Pause", ScrollLock: "ScrollLock", PrintScreen: "PrintScreen" } as Record<string, string>)[e.key] ?? null;
  if (!key) return null;
  return [...mods, key].join("+");
}
