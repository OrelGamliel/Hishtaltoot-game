import type { Player, Tile } from './types';

/** Orthogonal neighbours of a tile index in a rows×cols grid. */
export function neighbors(index: number, rows: number, cols: number): number[] {
  const r = Math.floor(index / cols);
  const c = index % cols;
  const out: number[] = [];
  if (r > 0) out.push(index - cols);
  if (r < rows - 1) out.push(index + cols);
  if (c > 0) out.push(index - 1);
  if (c < cols - 1) out.push(index + 1);
  return out;
}

export function tilesOf(tiles: Tile[], playerId: string): Tile[] {
  return tiles.filter((t) => t.ownerId === playerId);
}

/** Player ids whose territory touches `playerId`'s territory orthogonally. */
export function adjacentOpponents(tiles: Tile[], playerId: string, rows: number, cols: number): string[] {
  const found = new Set<string>();
  for (const t of tiles) {
    if (t.ownerId !== playerId) continue;
    for (const n of neighbors(t.index, rows, cols)) {
      const owner = tiles[n].ownerId;
      if (owner !== playerId) found.add(owner);
    }
  }
  return [...found];
}

/** Defender tiles that border the challenger's territory. */
export function borderTiles(
  tiles: Tile[],
  challengerId: string,
  defenderId: string,
  rows: number,
  cols: number,
): Tile[] {
  return tiles.filter(
    (t) =>
      t.ownerId === defenderId &&
      neighbors(t.index, rows, cols).some((n) => tiles[n].ownerId === challengerId),
  );
}

/**
 * Category for a duel: the category of the defender's tile bordering the challenger.
 * If the bordering tiles carry several different categories, the defender's original
 * category wins. Returns null if the players are not adjacent.
 */
export function duelCategory(
  tiles: Tile[],
  players: Player[],
  challengerId: string,
  defenderId: string,
  rows: number,
  cols: number,
): string | null {
  const border = borderTiles(tiles, challengerId, defenderId, rows, cols);
  if (border.length === 0) return null;
  const cats = new Set(border.map((t) => t.categoryId));
  if (cats.size === 1) return border[0].categoryId;
  const defender = players.find((p) => p.id === defenderId);
  return defender ? defender.categoryId : border[0].categoryId;
}

/** Winner takes every tile of the loser. Tile categories are kept. */
export function conquer(tiles: Tile[], winnerId: string, loserId: string): Tile[] {
  return tiles.map((t) => (t.ownerId === loserId ? { ...t, ownerId: winnerId } : t));
}

export function remainingPlayers(players: Player[]): Player[] {
  return players.filter((p) => !p.eliminated);
}

/** The single owner of the whole board, or null if the game is still on. */
export function boardOwner(tiles: Tile[]): string | null {
  if (tiles.length === 0) return null;
  const first = tiles[0].ownerId;
  return tiles.every((t) => t.ownerId === first) ? first : null;
}

/** All [rows, cols] pairs with rows*cols === n, rows <= cols first, e.g. 12 -> [1,12],[2,6],[3,4],[4,3]... */
export function gridShapes(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 1; r <= n; r++) if (n % r === 0) out.push([r, n / r]);
  return out;
}

/** The most square-ish shape for n tiles, preferring wider-than-tall (TV aspect). */
export function bestShape(n: number): [number, number] {
  const shapes = gridShapes(n).filter(([r, c]) => r <= c);
  return shapes[shapes.length - 1] ?? [1, n];
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Initial tiles: one per player, in the given order. */
export function placePlayers(players: Player[]): Tile[] {
  return players.map((p, index) => ({ index, ownerId: p.id, categoryId: p.categoryId }));
}

/** Manhattan distance between two tile indexes; used to stagger takeover animations. */
export function distance(a: number, b: number, cols: number): number {
  return Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) + Math.abs((a % cols) - (b % cols));
}
