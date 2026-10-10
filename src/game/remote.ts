import type { GameState, Lang, Pack, Side } from './types';

/** Commands a phone can send (keep in sync with scripts/lib/remote-utils.mjs). */
export type RemoteCommand = 'begin' | 'correct' | 'pass' | 'pause' | 'resume' | 'continue' | 'spin';

/** Window event the TV raises when a phone command arrives; screens listen for it. */
export const REMOTE_EVENT = 'takeover-remote';

export interface RemoteSide {
  name: string;
  color: string;
  /** milliseconds left when the snapshot was taken */
  remaining: number;
  correct: number;
  passes: number;
}

export interface RemoteSnapshot {
  v: 1;
  lang: Lang;
  phase: GameState['phase'];
  board: null | {
    stage: GameState['turn']['stage'];
    activeName: string | null;
    activeColor: string | null;
    playersLeft: number;
  };
  duel: null | {
    category: string;
    status: 'ready' | 'running' | 'paused' | 'over';
    active: Side;
    winner: Side | null;
    challenger: RemoteSide;
    defender: RemoteSide;
    /** null before the clock starts, or when the category ran out of questions */
    question: null | { prompt: string; image?: string; answer: string };
    outOfQuestions: boolean;
  };
  champion: null | { name: string; color: string };
}

/** Inline images bigger than this are left out of snapshots; phones load /packs/... URLs fine. */
const MAX_INLINE_IMAGE = 200_000;

export function buildSnapshot(state: GameState, getPack: (id: string) => Pack | undefined, lang: Lang): RemoteSnapshot {
  const player = (id: string | null) => state.players.find((p) => p.id === id) ?? null;
  const snap: RemoteSnapshot = { v: 1, lang, phase: state.phase, board: null, duel: null, champion: null };

  if (state.phase === 'board') {
    const active = player(state.turn.activePlayerId);
    snap.board = {
      stage: state.turn.stage,
      activeName: active?.name ?? null,
      activeColor: active?.color ?? null,
      playersLeft: state.players.filter((p) => !p.eliminated).length,
    };
  }

  if (state.phase === 'duel' && state.duel) {
    const d = state.duel;
    const pack = getPack(d.categoryId);
    const q = pack && d.questionIndex !== null ? pack.questions[d.questionIndex] : null;
    const side = (s: Side): RemoteSide => {
      const p = player(s === 'challenger' ? d.challengerId : d.defenderId);
      return {
        name: p?.name ?? '?',
        color: p?.color ?? '#888',
        remaining: Math.max(0, Math.round(d.remaining[s])),
        correct: d.correct[s],
        passes: d.passes[s],
      };
    };
    const image = q?.image && !(q.image.startsWith('data:') && q.image.length > MAX_INLINE_IMAGE) ? q.image : undefined;
    snap.duel = {
      category: pack?.name ?? '?',
      status: d.status,
      active: d.active,
      winner: d.winner,
      challenger: side('challenger'),
      defender: side('defender'),
      question: q ? { prompt: q.prompt, answer: q.answer, ...(image ? { image } : {}) } : null,
      outOfQuestions: d.status !== 'ready' && d.questionIndex === null,
    };
  }

  if (state.phase === 'winner') {
    const owner = state.tiles[0]?.ownerId;
    const champ = player(owner ?? null);
    if (champ) snap.champion = { name: champ.name, color: champ.color };
  }

  return snap;
}

/**
 * Snapshot identity ignoring the ticking clocks, so the TV can send immediately when something
 * meaningful changes and only refresh the clocks about once a second otherwise.
 */
export function snapshotKey(s: RemoteSnapshot): string {
  if (!s.duel) return JSON.stringify(s);
  const strip = (x: RemoteSide) => ({ ...x, remaining: 0 });
  return JSON.stringify({ ...s, duel: { ...s.duel, challenger: strip(s.duel.challenger), defender: strip(s.duel.defender) } });
}
