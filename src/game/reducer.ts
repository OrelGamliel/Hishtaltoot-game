import { boardOwner, conquer, duelCategory, placePlayers } from './grid';
import type { Duel, GameState, HistoryEntry, Player, Reveal, Settings, Side, Snapshot } from './types';

export const DEFAULT_SETTINGS: Settings = {
  rows: 3,
  cols: 3,
  duelSeconds: 45,
  passPenalty: 3,
  prize: '',
};

export function initialState(): GameState {
  return {
    version: 1,
    phase: 'setup',
    settings: DEFAULT_SETTINGS,
    players: [],
    tiles: [],
    turn: { stage: 'randomize', activePlayerId: null },
    duel: null,
    used: {},
    history: [],
    undo: [],
  };
}

/**
 * Actions that draw a question carry `questionCount` (size of the duel's pack) and
 * `rand` (a number in [0,1)) so the reducer itself stays pure and testable.
 */
export type Action =
  | { type: 'START_GAME'; settings: Settings; players: Player[] }
  | { type: 'RANDOM_PICKED'; playerId: string }
  | { type: 'RESPIN' }
  | { type: 'START_DUEL'; defenderId: string }
  | { type: 'CANCEL_DUEL' }
  | { type: 'DUEL_BEGIN'; questionCount: number; rand: number }
  | { type: 'TICK'; elapsed: number }
  | { type: 'CORRECT'; questionCount: number; rand: number }
  | { type: 'PASS'; questionCount: number; rand: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'RECYCLE_QUESTIONS'; questionCount: number; rand: number }
  | { type: 'FORCE_WIN'; side: Side }
  | { type: 'RESOLVE_DUEL' }
  | { type: 'DUEL_AGAIN' }
  | { type: 'TO_RANDOMIZER' }
  | { type: 'UNDO' }
  | { type: 'SWAP_LAST_RESULT' }
  | { type: 'NEW_GAME' }
  | { type: 'LOAD'; state: GameState };

export const otherSide = (s: Side): Side => (s === 'challenger' ? 'defender' : 'challenger');

let idCounter = 0;
const uid = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** Picks an unused question index for a category, or null if the pack is exhausted. */
export function pickQuestion(
  used: Record<string, number[]>,
  categoryId: string,
  count: number,
  rand: number,
): { index: number | null; used: Record<string, number[]> } {
  const taken = new Set(used[categoryId] ?? []);
  const free: number[] = [];
  for (let i = 0; i < count; i++) if (!taken.has(i)) free.push(i);
  if (free.length === 0) return { index: null, used };
  const index = free[Math.min(free.length - 1, Math.floor(rand * free.length))];
  return { index, used: { ...used, [categoryId]: [...(used[categoryId] ?? []), index] } };
}

function withNextQuestion(state: GameState, duel: Duel, count: number, rand: number): GameState {
  const { index, used } = pickQuestion(state.used, duel.categoryId, count, rand);
  return { ...state, used, duel: { ...duel, questionIndex: index } };
}

function endDuel(duel: Duel, loser: Side): Duel {
  return {
    ...duel,
    status: 'over',
    winner: otherSide(loser),
    remaining: { ...duel.remaining, [loser]: 0 },
  };
}

function reveal(d: Duel, kind: Reveal['kind']): Reveal | null {
  if (d.questionIndex === null) return null;
  return { questionIndex: d.questionIndex, kind, seq: (d.reveal?.seq ?? 0) + 1 };
}

/** Applies a duel result to the board: conquest, elimination, history, undo snapshot. */
export function applyResult(
  state: GameState,
  winnerId: string,
  loserId: string,
  categoryId: string,
  kind: HistoryEntry['kind'],
  challengerId: string,
  defenderId: string,
): GameState {
  const snapshot: Snapshot = {
    tiles: state.tiles,
    players: state.players,
    turn: state.turn,
    challengerId,
    defenderId,
    categoryId,
    entryId: '',
  };
  const tilesTaken = state.tiles.filter((t) => t.ownerId === loserId).length;
  const tiles = conquer(state.tiles, winnerId, loserId);
  const players = state.players.map((p) => (p.id === loserId ? { ...p, eliminated: true } : p));
  const entry: HistoryEntry = { id: uid(), at: Date.now(), kind, winnerId, loserId, categoryId, tilesTaken };
  snapshot.entryId = entry.id;
  const owner = boardOwner(tiles);
  return {
    ...state,
    tiles,
    players,
    duel: null,
    undo: [...state.undo, snapshot].slice(-50),
    history: [...state.history, entry],
    phase: owner ? 'winner' : 'board',
    turn: { stage: 'postWin', activePlayerId: winnerId },
  };
}

function markUndone(history: HistoryEntry[], id: string): HistoryEntry[] {
  return history.map((h) => (h.id === id ? { ...h, undone: true } : h));
}

function restore(state: GameState): { state: GameState; snap: Snapshot } | null {
  const snap = state.undo[state.undo.length - 1];
  if (!snap) return null;
  return {
    snap,
    state: {
      ...state,
      tiles: snap.tiles,
      players: snap.players,
      turn: snap.turn,
      duel: null,
      phase: 'board',
      undo: state.undo.slice(0, -1),
    },
  };
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'LOAD':
      return action.state;

    case 'START_GAME':
      return {
        ...initialState(),
        phase: 'board',
        settings: action.settings,
        players: action.players.map((p) => ({ ...p, eliminated: false })),
        tiles: placePlayers(action.players),
      };

    case 'NEW_GAME':
      return { ...initialState(), settings: state.settings };

    case 'RANDOM_PICKED':
      return { ...state, turn: { stage: 'choose', activePlayerId: action.playerId } };

    case 'RESPIN':
    case 'TO_RANDOMIZER':
      return { ...state, turn: { stage: 'randomize', activePlayerId: null } };

    case 'DUEL_AGAIN':
      return { ...state, turn: { ...state.turn, stage: 'choose' } };

    case 'START_DUEL': {
      const challengerId = state.turn.activePlayerId;
      if (!challengerId || state.turn.stage !== 'choose') return state;
      const { rows, cols, duelSeconds } = state.settings;
      const categoryId = duelCategory(state.tiles, state.players, challengerId, action.defenderId, rows, cols);
      if (!categoryId) return state;
      const ms = duelSeconds * 1000;
      const duel: Duel = {
        challengerId,
        defenderId: action.defenderId,
        categoryId,
        remaining: { challenger: ms, defender: ms },
        active: 'challenger',
        status: 'ready',
        questionIndex: null,
        reveal: null,
        winner: null,
        correct: { challenger: 0, defender: 0 },
        passes: { challenger: 0, defender: 0 },
      };
      return { ...state, phase: 'duel', duel };
    }

    case 'CANCEL_DUEL': {
      if (!state.duel || state.duel.status !== 'ready') return state;
      return { ...state, phase: 'board', duel: null };
    }

    case 'DUEL_BEGIN': {
      const d = state.duel;
      if (!d || d.status !== 'ready') return state;
      // The first question is drawn when the clock starts so nobody sees it early.
      return withNextQuestion(state, { ...d, status: 'running' }, action.questionCount, action.rand);
    }

    case 'TICK': {
      const d = state.duel;
      if (!d || d.status !== 'running') return state;
      const left = d.remaining[d.active] - action.elapsed;
      if (left <= 0) return { ...state, duel: endDuel(d, d.active) };
      return { ...state, duel: { ...d, remaining: { ...d.remaining, [d.active]: left } } };
    }

    case 'CORRECT': {
      const d = state.duel;
      if (!d || d.status !== 'running') return state;
      const moved: Duel = {
        ...d,
        active: otherSide(d.active),
        correct: { ...d.correct, [d.active]: d.correct[d.active] + 1 },
        reveal: reveal(d, 'correct'),
      };
      return withNextQuestion(state, moved, action.questionCount, action.rand);
    }

    case 'PASS': {
      const d = state.duel;
      if (!d || d.status !== 'running') return state;
      const left = d.remaining[d.active] - state.settings.passPenalty * 1000;
      const base: Duel = {
        ...d,
        passes: { ...d.passes, [d.active]: d.passes[d.active] + 1 },
        reveal: reveal(d, 'pass'),
      };
      if (left <= 0) return { ...state, duel: endDuel(base, d.active) };
      const moved: Duel = { ...base, remaining: { ...d.remaining, [d.active]: left } };
      return withNextQuestion(state, moved, action.questionCount, action.rand);
    }

    case 'PAUSE': {
      const d = state.duel;
      if (!d || d.status !== 'running') return state;
      return { ...state, duel: { ...d, status: 'paused' } };
    }

    case 'RESUME': {
      const d = state.duel;
      if (!d || d.status !== 'paused') return state;
      return { ...state, duel: { ...d, status: 'running' } };
    }

    case 'RECYCLE_QUESTIONS': {
      const d = state.duel;
      if (!d) return state;
      const cleared = { ...state, used: { ...state.used, [d.categoryId]: [] } };
      return withNextQuestion(cleared, d, action.questionCount, action.rand);
    }

    case 'FORCE_WIN': {
      const d = state.duel;
      if (!d || d.status === 'over') return state;
      return { ...state, duel: endDuel(d, otherSide(action.side)) };
    }

    case 'RESOLVE_DUEL': {
      const d = state.duel;
      if (!d || d.status !== 'over' || !d.winner) return state;
      const winnerId = d.winner === 'challenger' ? d.challengerId : d.defenderId;
      const loserId = d.winner === 'challenger' ? d.defenderId : d.challengerId;
      return applyResult(state, winnerId, loserId, d.categoryId, 'duel', d.challengerId, d.defenderId);
    }

    case 'UNDO': {
      const r = restore(state);
      if (!r) return state;
      return { ...r.state, history: markUndone(state.history, r.snap.entryId) };
    }

    case 'SWAP_LAST_RESULT': {
      const r = restore(state);
      const last = r && state.history.find((h) => h.id === r.snap.entryId);
      if (!r || !last) return state;
      // The previous loser wins the same duel instead.
      return applyResult(
        { ...r.state, history: markUndone(state.history, last.id) },
        last.loserId,
        last.winnerId,
        r.snap.categoryId,
        'swap',
        r.snap.challengerId,
        r.snap.defenderId,
      );
    }

    default:
      return state;
  }
}
