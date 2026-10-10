import type { GameState } from './types';

export function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false when the write failed (usually quota exceeded). */
export function saveJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const GAME_KEY = 'takeover.game.v1';
export const SETUP_KEY = 'takeover.setup.v1';
export const PACKS_KEY = 'takeover.packs.v1';
export const MUTE_KEY = 'takeover.muted';

/** Loads a saved game. A duel that was running is restored paused. */
export function loadGame(): GameState | null {
  const s = loadJSON<GameState>(GAME_KEY);
  if (!s || s.version !== 1) return null;
  if (s.duel && s.duel.status === 'running') return { ...s, duel: { ...s.duel, status: 'paused' } };
  return s;
}
