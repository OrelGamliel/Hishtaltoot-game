import { useEffect, useMemo, type CSSProperties } from 'react';
import { distance } from '../game/grid';
import { textOn } from '../game/colors';
import { usePacks } from '../game/packs';
import { loadJSON, saveJSON } from '../game/storage';
import type { Player, Tile } from '../game/types';

/**
 * Owners seen on the last rendered board. Module-level so the takeover animation
 * still plays when the board remounts after returning from the duel screen.
 */
const OWNERS_KEY = 'takeover.lastOwners';
let lastOwners: string[] | null = loadJSON<string[]>(OWNERS_KEY);
let flipSeq = 0;
const flips = new Map<number, { seq: number; delay: number }>();

export interface BoardProps {
  tiles: Tile[];
  players: Player[];
  rows: number;
  cols: number;
  activeId?: string | null;
  targetIds?: string[];
  spotlightId?: string | null;
  dimOthers?: boolean;
  onTileClick?: (tile: Tile) => void;
}

export default function Board({
  tiles,
  players,
  rows,
  cols,
  activeId,
  targetIds = [],
  spotlightId,
  dimOthers,
  onTileClick,
}: BoardProps) {
  const { get } = usePacks();
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  // Work out which tiles changed owner since the last render, synchronously, so the
  // colour transition delay is applied in the same render as the colour change.
  const owners = tiles.map((t) => t.ownerId);
  const ownersKey = owners.join('|');
  useMemo(() => {
    const prev = lastOwners;
    if (!prev || prev.length !== owners.length) return;
    const changed = owners.map((o, i) => o !== prev[i]);
    if (!changed.some(Boolean)) return;
    flipSeq++;
    flips.clear();
    owners.forEach((o, i) => {
      if (!changed[i]) return;
      // stagger outward from the territory the new owner already held
      let d = Infinity;
      owners.forEach((o2, j) => {
        if (o2 === o && !changed[j]) d = Math.min(d, distance(i, j, cols));
      });
      if (!isFinite(d)) d = 1;
      flips.set(i, { seq: flipSeq, delay: 350 + (d - 1) * 140 });
    });
  }, [ownersKey, cols]);

  useEffect(() => {
    lastOwners = ownersKey.split('|');
    saveJSON(OWNERS_KEY, lastOwners);
    // forget finished flips so they don't replay when the board remounts
    const seq = flipSeq;
    window.setTimeout(() => seq === flipSeq && flips.clear(), 4000);
  }, [ownersKey]);

  const ownerAt = (i: number) => tiles[i]?.ownerId;
  const fontBase = `min(calc(100cqw / ${cols}), calc(100cqh / ${rows}))`;

  return (
    <div className="board relative h-full w-full" dir="ltr">
      <div
        className="grid h-full w-full"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0,1fr))` }}
      >
        {tiles.map((tile) => {
          const owner = byId.get(tile.ownerId);
          const color = owner?.color ?? '#333';
          const i = tile.index;
          const r = Math.floor(i / cols);
          const c = i % cols;
          const same = (n: number | null) => n !== null && ownerAt(n) === tile.ownerId;
          const up = same(r > 0 ? i - cols : null);
          const down = same(r < rows - 1 ? i + cols : null);
          const left = same(c > 0 ? i - 1 : null);
          const right = same(c < cols - 1 ? i + 1 : null);
          const gap = 'clamp(2px, 0.45cqmin, 6px)';
          const radius = 'clamp(6px, 1.4cqmin, 18px)';
          const isTarget = targetIds.includes(tile.ownerId);
          const isActive = activeId === tile.ownerId;
          const isSpot = spotlightId === tile.ownerId;
          const dim = dimOthers && !isTarget && !isActive && !isSpot;
          const flip = flips.get(i);
          const category = get(tile.categoryId)?.name ?? '—';
          const isHome = owner?.categoryId === tile.categoryId;

          return (
            <div
              key={i}
              style={{
                paddingTop: up ? 0 : gap,
                paddingBottom: down ? 0 : gap,
                paddingLeft: left ? 0 : gap,
                paddingRight: right ? 0 : gap,
              }}
            >
              <div
                role={onTileClick ? 'button' : undefined}
                onClick={() => onTileClick?.(tile)}
                className={[
                  'tile h-full w-full',
                  flip ? (flip.seq % 2 ? 'tile-flip-a' : 'tile-flip-b') : '',
                  isTarget ? 'tile-target' : '',
                  isActive ? 'tile-active' : '',
                  isSpot ? 'tile-spotlight' : '',
                  dim ? 'tile-dim' : '',
                ].join(' ')}
                style={
                  {
                    background: color,
                    color: textOn(color),
                    borderTopLeftRadius: !up && !left ? radius : 0,
                    borderTopRightRadius: !up && !right ? radius : 0,
                    borderBottomLeftRadius: !down && !left ? radius : 0,
                    borderBottomRightRadius: !down && !right ? radius : 0,
                    '--flip-delay': `${flip?.delay ?? 0}ms`,
                    '--color-delay': `${(flip?.delay ?? 0) + 350}ms`,
                    padding: '4%',
                  } as CSSProperties
                }
              >
                <span
                  dir="auto"
                  className="block w-full truncate font-black leading-tight"
                  style={{ fontSize: `calc(${fontBase} * 0.15)` }}
                >
                  {owner?.name}
                </span>
                <span
                  dir="auto"
                  className="mt-[3%] block max-w-full truncate rounded-full px-[6%] py-[1%] font-medium"
                  style={{
                    fontSize: `calc(${fontBase} * 0.075)`,
                    background: 'rgb(0 0 0 / 0.18)',
                    opacity: isHome ? 0.95 : 0.8,
                    fontStyle: isHome ? 'normal' : 'italic',
                  }}
                >
                  {category}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
