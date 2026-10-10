import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, pickQuestion, reducer, type Action } from './reducer';
import type { GameState, Player } from './types';

const P = (id: string): Player => ({ id, name: id, color: '#fff', categoryId: `cat-${id}`, eliminated: false });

function start(ids: string[], rows: number, cols: number): GameState {
  return reducer(
    { ...({} as GameState) },
    { type: 'START_GAME', settings: { ...DEFAULT_SETTINGS, rows, cols }, players: ids.map(P) },
  );
}

const run = (s: GameState, ...actions: Action[]) => actions.reduce(reducer, s);
const Q = { questionCount: 40, rand: 0 };

/** Runs a full duel where `loser` side runs out of time. */
function duel(s: GameState, challenger: string, defender: string, winner: 'challenger' | 'defender') {
  return run(
    s,
    { type: 'RANDOM_PICKED', playerId: challenger },
    { type: 'START_DUEL', defenderId: defender },
    { type: 'DUEL_BEGIN', ...Q },
    { type: 'FORCE_WIN', side: winner },
    { type: 'RESOLVE_DUEL' },
  );
}

describe('pickQuestion', () => {
  it('never repeats a question and returns null when exhausted', () => {
    let used: Record<string, number[]> = {};
    const seen = new Set<number>();
    for (let i = 0; i < 5; i++) {
      const r = pickQuestion(used, 'c', 5, Math.random());
      expect(r.index).not.toBeNull();
      expect(seen.has(r.index!)).toBe(false);
      seen.add(r.index!);
      used = r.used;
    }
    expect(pickQuestion(used, 'c', 5, 0.5).index).toBeNull();
  });
});

describe('game flow', () => {
  it('starts with one tile per player on the board', () => {
    const s = start(['a', 'b', 'c', 'd'], 2, 2);
    expect(s.phase).toBe('board');
    expect(s.tiles.map((t) => t.ownerId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('refuses a duel against a non-adjacent player', () => {
    const s = run(start(['a', 'b', 'c', 'd'], 2, 2), { type: 'RANDOM_PICKED', playerId: 'a' });
    expect(run(s, { type: 'START_DUEL', defenderId: 'd' }).phase).toBe('board');
  });

  it('challenger answers first and the clock switches on correct', () => {
    let s = run(
      start(['a', 'b'], 1, 2),
      { type: 'RANDOM_PICKED', playerId: 'a' },
      { type: 'START_DUEL', defenderId: 'b' },
      { type: 'DUEL_BEGIN', ...Q },
    );
    expect(s.duel!.active).toBe('challenger');
    expect(s.duel!.categoryId).toBe('cat-b');
    s = run(s, { type: 'TICK', elapsed: 1000 }, { type: 'CORRECT', ...Q });
    expect(s.duel!.active).toBe('defender');
    expect(s.duel!.remaining.challenger).toBe(44000);
    expect(s.used['cat-b']).toHaveLength(2);
  });

  it('pass deducts the penalty and keeps the same player answering', () => {
    let s = run(
      start(['a', 'b'], 1, 2),
      { type: 'RANDOM_PICKED', playerId: 'a' },
      { type: 'START_DUEL', defenderId: 'b' },
      { type: 'DUEL_BEGIN', ...Q },
      { type: 'PASS', ...Q },
    );
    expect(s.duel!.active).toBe('challenger');
    expect(s.duel!.remaining.challenger).toBe(42000);
    expect(s.duel!.reveal?.kind).toBe('pass');
    s = run(s, { type: 'TICK', elapsed: 42000 });
    expect(s.duel!.status).toBe('over');
    expect(s.duel!.winner).toBe('defender');
  });

  it('ignores ticks while paused', () => {
    const s = run(
      start(['a', 'b'], 1, 2),
      { type: 'RANDOM_PICKED', playerId: 'a' },
      { type: 'START_DUEL', defenderId: 'b' },
      { type: 'DUEL_BEGIN', ...Q },
      { type: 'PAUSE' },
      { type: 'TICK', elapsed: 5000 },
    );
    expect(s.duel!.remaining.challenger).toBe(45000);
  });

  it('winner takes all loser tiles, loser is eliminated, winner gets to choose', () => {
    const s = duel(start(['a', 'b', 'c', 'd'], 2, 2), 'a', 'b', 'challenger');
    expect(s.tiles.map((t) => t.ownerId)).toEqual(['a', 'a', 'c', 'd']);
    expect(s.tiles.map((t) => t.categoryId)).toEqual(['cat-a', 'cat-b', 'cat-c', 'cat-d']);
    expect(s.players.find((p) => p.id === 'b')!.eliminated).toBe(true);
    expect(s.turn).toEqual({ stage: 'postWin', activePlayerId: 'a' });
  });

  it('a defender who wins takes the challenger territory and the turn', () => {
    const s = duel(start(['a', 'b', 'c', 'd'], 2, 2), 'a', 'b', 'defender');
    expect(s.tiles.map((t) => t.ownerId)).toEqual(['b', 'b', 'c', 'd']);
    expect(s.turn.activePlayerId).toBe('b');
  });

  it('the conquered tile category is used by the next challenger', () => {
    // a b
    // c d   → a beats b, so a holds tile 1 (cat-b). d borders a only through tile 1.
    let s = duel(start(['a', 'b', 'c', 'd'], 2, 2), 'a', 'b', 'challenger');
    s = run(s, { type: 'TO_RANDOMIZER' }, { type: 'RANDOM_PICKED', playerId: 'd' }, { type: 'START_DUEL', defenderId: 'a' });
    expect(s.duel!.categoryId).toBe('cat-b');
  });

  it('ends the game when one player owns the board', () => {
    let s = duel(start(['a', 'b', 'c'], 1, 3), 'a', 'b', 'challenger');
    s = run(s, { type: 'DUEL_AGAIN' });
    s = duel(s, 'a', 'c', 'challenger');
    expect(s.phase).toBe('winner');
  });

  it('undo restores the board and turn before the last duel', () => {
    const before = run(start(['a', 'b', 'c', 'd'], 2, 2));
    const after = duel(before, 'a', 'b', 'challenger');
    const undone = run(after, { type: 'UNDO' });
    expect(undone.tiles).toEqual(before.tiles);
    expect(undone.players.every((p) => !p.eliminated)).toBe(true);
    expect(undone.turn).toEqual({ stage: 'choose', activePlayerId: 'a' });
    expect(undone.history[0].undone).toBe(true);
    expect(run(undone, { type: 'UNDO' })).toBe(undone);
  });

  it('swap gives the last duel to the other player', () => {
    const after = duel(start(['a', 'b', 'c', 'd'], 2, 2), 'a', 'b', 'challenger');
    const swapped = run(after, { type: 'SWAP_LAST_RESULT' });
    expect(swapped.tiles.map((t) => t.ownerId)).toEqual(['b', 'b', 'c', 'd']);
    expect(swapped.players.find((p) => p.id === 'a')!.eliminated).toBe(true);
    expect(swapped.history.map((h) => [h.kind, !!h.undone])).toEqual([
      ['duel', true],
      ['swap', false],
    ]);
    // swapping again goes back
    const back = run(swapped, { type: 'SWAP_LAST_RESULT' });
    expect(back.tiles.map((t) => t.ownerId)).toEqual(['a', 'a', 'c', 'd']);
  });
});
