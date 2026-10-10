import { describe, expect, it } from 'vitest';
import {
  adjacentOpponents,
  bestShape,
  boardOwner,
  borderTiles,
  conquer,
  distance,
  duelCategory,
  gridShapes,
  neighbors,
  placePlayers,
  shuffle,
} from './grid';
import type { Player, Tile } from './types';

const P = (id: string, categoryId = `cat-${id}`): Player => ({
  id,
  name: id.toUpperCase(),
  color: '#fff',
  categoryId,
  eliminated: false,
});

/** Builds tiles from a layout like ['ab', 'cd'] where each char is an owner id and category is cat-<original>. */
function board(layout: string[], categories?: string[]): Tile[] {
  const flat = layout.join('');
  return [...flat].map((ownerId, index) => ({
    index,
    ownerId,
    categoryId: categories ? categories[index] : `cat-${ownerId}`,
  }));
}

describe('neighbors', () => {
  it('handles corners, edges and centre in a 3x3 grid', () => {
    expect(neighbors(0, 3, 3).sort()).toEqual([1, 3]);
    expect(neighbors(8, 3, 3).sort()).toEqual([5, 7]);
    expect(neighbors(1, 3, 3).sort()).toEqual([0, 2, 4]);
    expect(neighbors(4, 3, 3).sort()).toEqual([1, 3, 5, 7]);
  });

  it('never wraps around row edges', () => {
    // index 2 is end of row 0 in a 3x4 grid (rows=3, cols=4 → index 3 is end); check 3 and 4
    expect(neighbors(3, 3, 4).sort((a, b) => a - b)).toEqual([2, 7]);
    expect(neighbors(4, 3, 4).sort((a, b) => a - b)).toEqual([0, 5, 8]);
  });

  it('works for single row and single column grids', () => {
    expect(neighbors(0, 1, 5)).toEqual([1]);
    expect(neighbors(2, 1, 5).sort()).toEqual([1, 3]);
    expect(neighbors(2, 5, 1).sort()).toEqual([1, 3]);
  });

  it('excludes diagonals', () => {
    expect(neighbors(4, 3, 3)).not.toContain(0);
    expect(neighbors(4, 3, 3)).not.toContain(8);
  });
});

describe('adjacentOpponents', () => {
  it('finds orthogonal neighbours of a single tile', () => {
    const tiles = board(['abc', 'def', 'ghi']);
    expect(adjacentOpponents(tiles, 'e', 3, 3).sort()).toEqual(['b', 'd', 'f', 'h']);
    expect(adjacentOpponents(tiles, 'a', 3, 3).sort()).toEqual(['b', 'd']);
  });

  it('considers every tile of a multi-tile territory', () => {
    const tiles = board(['aac', 'aef', 'ghi']);
    expect(adjacentOpponents(tiles, 'a', 3, 3).sort()).toEqual(['c', 'e', 'g']);
  });

  it('does not count diagonal contact', () => {
    const tiles = board(['ab', 'ca']);
    // a owns 0 and 3 (diagonal to each other); b and c touch a orthogonally
    expect(adjacentOpponents(tiles, 'b', 2, 2).sort()).toEqual(['a']);
    const t2 = board(['ab', 'cd']);
    expect(adjacentOpponents(t2, 'a', 2, 2)).not.toContain('d');
  });

  it('returns nothing when a player owns the whole board', () => {
    expect(adjacentOpponents(board(['aa', 'aa']), 'a', 2, 2)).toEqual([]);
  });
});

describe('borderTiles', () => {
  it('returns only the defender tiles touching the challenger', () => {
    // b owns 1,2,5 ; a owns 0 → only tile 1 borders a
    const tiles = board(['abb', 'ccb', 'ddd']);
    expect(borderTiles(tiles, 'a', 'b', 3, 3).map((t) => t.index)).toEqual([1]);
    // c owns 3,4 → c borders b at 1 (above 4) and 5 (right of 4)
    expect(borderTiles(tiles, 'c', 'b', 3, 3).map((t) => t.index)).toEqual([1, 5]);
  });
});

describe('duelCategory', () => {
  const players = [P('a'), P('b'), P('c'), P('d')];

  it('uses the category of the single bordering tile', () => {
    // b conquered c's tile at index 2; a borders only index 1 (cat-b)
    const tiles = board(['abb', 'ddd'], ['cat-a', 'cat-b', 'cat-c', 'cat-d', 'cat-d', 'cat-d']);
    expect(duelCategory(tiles, players, 'a', 'b', 2, 3)).toBe('cat-b');
  });

  it('uses a conquered tile category when that is what borders the challenger', () => {
    // b owns tiles 0 (cat-b) and 1 (cat-c, conquered). a sits at 2, bordering only tile 1.
    const tiles = board(['bba', 'ddd'], ['cat-b', 'cat-c', 'cat-a', 'cat-d', 'cat-d', 'cat-d']);
    expect(duelCategory(tiles, players, 'a', 'b', 2, 3)).toBe('cat-c');
  });

  it("falls back to the defender's original category when border categories differ", () => {
    // a at 4 (centre); b owns 1 (cat-c) and 3 (cat-d), both border a
    const tiles = board(['xbx', 'bax', 'xxx'], ['x', 'cat-c', 'x', 'cat-d', 'cat-a', 'x', 'x', 'x', 'x']);
    expect(duelCategory(tiles, players, 'a', 'b', 3, 3)).toBe('cat-b');
  });

  it('uses the shared category when several border tiles carry the same one', () => {
    const tiles = board(['xbx', 'bax', 'xxx'], ['x', 'cat-c', 'x', 'cat-c', 'cat-a', 'x', 'x', 'x', 'x']);
    expect(duelCategory(tiles, players, 'a', 'b', 3, 3)).toBe('cat-c');
  });

  it('returns null for non-adjacent players', () => {
    const tiles = board(['ab', 'cd']);
    expect(duelCategory(tiles, players, 'a', 'd', 2, 2)).toBeNull();
  });
});

describe('conquer', () => {
  it('moves every loser tile to the winner and keeps categories', () => {
    const tiles = board(['abb', 'cbd'], ['cat-a', 'cat-b', 'cat-e', 'cat-c', 'cat-f', 'cat-d']);
    const after = conquer(tiles, 'a', 'b');
    expect(after.filter((t) => t.ownerId === 'a').map((t) => t.index)).toEqual([0, 1, 2, 4]);
    expect(after.some((t) => t.ownerId === 'b')).toBe(false);
    expect(after.map((t) => t.categoryId)).toEqual(tiles.map((t) => t.categoryId));
    // untouched owners stay put
    expect(after[3].ownerId).toBe('c');
    expect(after[5].ownerId).toBe('d');
  });

  it('does not mutate the input', () => {
    const tiles = board(['ab']);
    conquer(tiles, 'a', 'b');
    expect(tiles[1].ownerId).toBe('b');
  });
});

describe('boardOwner', () => {
  it('detects a finished game', () => {
    expect(boardOwner(board(['aa', 'aa']))).toBe('a');
    expect(boardOwner(board(['aa', 'ab']))).toBeNull();
  });
});

describe('grid shapes', () => {
  it('lists every factor pair', () => {
    expect(gridShapes(12)).toEqual([
      [1, 12],
      [2, 6],
      [3, 4],
      [4, 3],
      [6, 2],
      [12, 1],
    ]);
    expect(gridShapes(7)).toEqual([
      [1, 7],
      [7, 1],
    ]);
  });

  it('prefers a square-ish wide shape', () => {
    expect(bestShape(9)).toEqual([3, 3]);
    expect(bestShape(16)).toEqual([4, 4]);
    expect(bestShape(12)).toEqual([3, 4]);
    expect(bestShape(7)).toEqual([1, 7]);
  });
});

describe('placement and helpers', () => {
  it('places one tile per player carrying their category', () => {
    const tiles = placePlayers([P('a', 'x'), P('b', 'y')]);
    expect(tiles).toEqual([
      { index: 0, ownerId: 'a', categoryId: 'x' },
      { index: 1, ownerId: 'b', categoryId: 'y' },
    ]);
  });

  it('shuffle keeps all items', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(shuffle(items).sort()).toEqual(items);
  });

  it('distance is Manhattan distance', () => {
    expect(distance(0, 8, 3)).toBe(4);
    expect(distance(4, 4, 3)).toBe(0);
  });
});
