// Sortierung der Spielebibliothek – eigene Funktion, damit sie ohne Browser getestet wird.
// „Zuletzt“ = zuletzt am PC gestartet (nur was der PC aufgezeichnet hat); nie Gestartetes steht hinten. Favoriten stehen immer oben.

export type LibrarySort = "name" | "recent" | "added" | "rating";
interface Sortable { id: string; name: string; favorite?: boolean; rating?: number | null; addedAt: string }

export function sortLibrary<T extends Sortable>(list: T[], sort: LibrarySort, lastLaunch: Map<string, number>): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const sorted = [...list].sort((a, b) =>
    sort === "name" ? byName(a, b)
      : sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0) || byName(a, b)
      : sort === "recent" ? (lastLaunch.get(b.id) ?? 0) - (lastLaunch.get(a.id) ?? 0) || byName(a, b)
      : Date.parse(b.addedAt) - Date.parse(a.addedAt));
  return [...sorted.filter((i) => i.favorite), ...sorted.filter((i) => !i.favorite)];
}
