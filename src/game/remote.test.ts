import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, reducer, type Action } from './reducer';
import { buildSnapshot, snapshotKey } from './remote';
import type { GameState, Pack, Player } from './types';

const P = (id: string, color = '#f00'): Player => ({ id, name: id.toUpperCase(), color, categoryId: `cat-${id}`, eliminated: false });
const pack: Pack = {
  id: 'cat-b',
  name: 'Fruits',
  lang: 'he',
  questions: [
    { prompt: '', image: '/packs/x/1.jpg', answer: 'Apple' },
    { prompt: 'Q2', answer: 'Two' },
  ],
};
const get = (id: string) => (id === 'cat-b' ? pack : undefined);
const run = (s: GameState, ...a: Action[]) => a.reduce(reducer, s);
const start = () =>
  reducer({} as GameState, { type: 'START_GAME', settings: { ...DEFAULT_SETTINGS, rows: 1, cols: 2 }, players: [P('a'), P('b', '#0f0')] });

describe('buildSnapshot', () => {
  it('describes the board turn', () => {
    const s = run(start(), { type: 'RANDOM_PICKED', playerId: 'a' });
    const snap = buildSnapshot(s, get, 'he');
    expect(snap.phase).toBe('board');
    expect(snap.board).toEqual({ stage: 'choose', activeName: 'A', activeColor: '#f00', playersLeft: 2 });
    expect(snap.duel).toBeNull();
  });

  it('includes the current question and answer during a duel', () => {
    const s = run(
      start(),
      { type: 'RANDOM_PICKED', playerId: 'a' },
      { type: 'START_DUEL', defenderId: 'b' },
      { type: 'DUEL_BEGIN', questionCount: 2, rand: 0 },
      { type: 'TICK', elapsed: 1234.4 },
    );
    const d = buildSnapshot(s, get, 'en').duel!;
    expect(d.category).toBe('Fruits');
    expect(d.status).toBe('running');
    expect(d.active).toBe('challenger');
    expect(d.challenger).toMatchObject({ name: 'A', remaining: 43766 });
    expect(d.defender).toMatchObject({ name: 'B', color: '#0f0', remaining: 45000 });
    expect(d.question).toEqual({ prompt: '', image: '/packs/x/1.jpg', answer: 'Apple' });
    expect(d.outOfQuestions).toBe(false);
  });

  it('hides the question before the clock starts', () => {
    const s = run(start(), { type: 'RANDOM_PICKED', playerId: 'a' }, { type: 'START_DUEL', defenderId: 'b' });
    const d = buildSnapshot(s, get, 'he').duel!;
    expect(d.status).toBe('ready');
    expect(d.question).toBeNull();
    expect(d.outOfQuestions).toBe(false);
  });

  it('drops huge inline images but keeps the answer', () => {
    const big: Pack = { ...pack, questions: [{ prompt: '', image: `data:image/png;base64,${'A'.repeat(300_000)}`, answer: 'Big' }] };
    const s = run(
      start(),
      { type: 'RANDOM_PICKED', playerId: 'a' },
      { type: 'START_DUEL', defenderId: 'b' },
      { type: 'DUEL_BEGIN', questionCount: 1, rand: 0 },
    );
    expect(buildSnapshot(s, () => big, 'he').duel!.question).toEqual({ prompt: '', answer: 'Big' });
  });

  it('reports the champion', () => {
    const s = run(
      start(),
      { type: 'RANDOM_PICKED', playerId: 'a' },
      { type: 'START_DUEL', defenderId: 'b' },
      { type: 'DUEL_BEGIN', questionCount: 2, rand: 0 },
      { type: 'FORCE_WIN', side: 'challenger' },
      { type: 'RESOLVE_DUEL' },
    );
    expect(buildSnapshot(s, get, 'he').champion).toEqual({ name: 'A', color: '#f00' });
  });
});

describe('snapshotKey', () => {
  it('ignores clock ticks but not question changes', () => {
    const s = run(
      start(),
      { type: 'RANDOM_PICKED', playerId: 'a' },
      { type: 'START_DUEL', defenderId: 'b' },
      { type: 'DUEL_BEGIN', questionCount: 2, rand: 0 },
    );
    const k = snapshotKey(buildSnapshot(s, get, 'he'));
    expect(snapshotKey(buildSnapshot(run(s, { type: 'TICK', elapsed: 500 }), get, 'he'))).toBe(k);
    expect(snapshotKey(buildSnapshot(run(s, { type: 'CORRECT', questionCount: 2, rand: 0 }), get, 'he'))).not.toBe(k);
  });
});
