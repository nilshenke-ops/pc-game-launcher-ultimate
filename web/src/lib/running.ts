// Which running program counts as "the game". A live wallpaper (Wallpaper Engine …) is in the game list but it runs all day next to
// everything else – it stands for the game only when nothing else runs. Pure, tested.

export const AMBIENT = /wallpaper ?engine|lively wallpaper|rainmeter|wallpaper ?alive|nexus wallpaper/i;
export const isAmbient = (name?: string | null) => !!name && AMBIENT.test(name);

/** Real games first (the one that runs longest comes first as the PC lists them); an ambient program only when no other runs. */
export function mainGame<T extends { name: string }>(running: readonly T[] | null | undefined): T | null {
  const list = running ?? [];
  return list.find((r) => !isAmbient(r.name)) ?? list[0] ?? null;
}
/** The games that are really played (without live wallpapers). */
export const playedGames = <T extends { name: string }>(running: readonly T[] | null | undefined): T[] => (running ?? []).filter((r) => !isAmbient(r.name));
