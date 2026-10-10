export type Lang = 'he' | 'en';

export interface Question {
  prompt: string;
  image?: string;
  answer: string;
}

export interface Pack {
  id: string;
  name: string;
  lang: Lang;
  questions: Question[];
  /** true for packs created/imported in the editor (stored in localStorage) */
  custom?: boolean;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  /** the player's original category (pack id) */
  categoryId: string;
  eliminated: boolean;
}

export interface Tile {
  /** row-major index into the grid */
  index: number;
  ownerId: string;
  /** permanent: the category this tile carries, never changes on conquest */
  categoryId: string;
}

export interface Settings {
  rows: number;
  cols: number;
  duelSeconds: number;
  passPenalty: number;
  prize: string;
}

export type Side = 'challenger' | 'defender';

export interface Reveal {
  /** index of the question whose answer is shown */
  questionIndex: number;
  kind: 'correct' | 'pass';
  /** increments so the UI can re-trigger the flash animation */
  seq: number;
}

export interface Duel {
  challengerId: string;
  defenderId: string;
  categoryId: string;
  /** milliseconds left per side */
  remaining: Record<Side, number>;
  active: Side;
  status: 'ready' | 'running' | 'paused' | 'over';
  /** index into the pack's questions; null when the pack is exhausted */
  questionIndex: number | null;
  reveal: Reveal | null;
  winner: Side | null;
  correct: Record<Side, number>;
  passes: Record<Side, number>;
}

export type TurnStage = 'randomize' | 'choose' | 'postWin';

export interface Turn {
  stage: TurnStage;
  activePlayerId: string | null;
}

export interface HistoryEntry {
  id: string;
  at: number;
  kind: 'duel' | 'swap';
  /** set when the host undid this result */
  undone?: boolean;
  winnerId: string;
  loserId: string;
  categoryId: string;
  tilesTaken: number;
}

/** What we need to restore the board to before a duel was resolved. */
export interface Snapshot {
  tiles: Tile[];
  players: Player[];
  turn: Turn;
  challengerId: string;
  defenderId: string;
  categoryId: string;
  /** history entry created by the result this snapshot precedes */
  entryId: string;
}

export type Phase = 'setup' | 'board' | 'duel' | 'winner';

export interface GameState {
  version: 1;
  phase: Phase;
  settings: Settings;
  players: Player[];
  tiles: Tile[];
  turn: Turn;
  duel: Duel | null;
  /** categoryId -> question indexes already shown this game */
  used: Record<string, number[]>;
  history: HistoryEntry[];
  undo: Snapshot[];
}
