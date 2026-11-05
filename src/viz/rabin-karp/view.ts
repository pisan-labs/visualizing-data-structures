import type { MarkRole, Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { andList, q, type MatchExtra, type MatchState } from '../_strings/kit';
import { describeMatch, matchShapes } from '../_strings/view';
import type { RkSettings } from './model';

/**
 * The text, the value lane under it with each window's hash under the window's first
 * character, and one row per window. The current row carries p, the pattern's hash. A real
 * match's hash turns purple; a spurious hit's gets a dashed outline.
 */
export function view(step: Step<MatchState<null>, MatchExtra>, _settings: RkSettings): Scene {
  const { state } = step;
  const hs = state.search?.hashing;
  const count = Math.max(0, state.text.length - state.pattern.length + 1);
  const value = (s: number) => hs?.values[s] ?? null;
  const items = Array.from({ length: count }, (_, s) => {
    const v = value(s);
    return v === null ? null : String(v);
  });
  const spurious = new Set(hs?.spurious ?? []);
  const found = new Set(state.search?.found ?? []);
  const tones = items.map((_, s): MarkRole | undefined =>
    spurious.has(s) ? 'remove' : found.has(s) ? 'found' : undefined,
  );
  const ready = hs && value(0) !== null;
  const { shapes, bounds } = matchShapes(step, {
    frame: { rows: 3, values: true },
    values: { name: 't', items, tones, dashed: items.map((_, s) => spurious.has(s)) },
    mapRows: (rows) =>
      ready ? rows.map((r, k) => (k === rows.length - 1 ? { ...r, by: `p=${hs.p}` } : r)) : rows,
  });
  return { shapes, bounds, label: label(step) };
}

function label(step: Step<MatchState<null>, MatchExtra>): string {
  const { state, extra } = step;
  const hs = state.search?.hashing;
  const known = (hs?.values ?? []).filter((v): v is number => v !== null);
  const hashes = hs
    ? ` p = ${hs.p}. Window hashes so far: ${known.length ? known.join(', ') : 'none'}.${hs.spurious.length ? ` Spurious hits at ${andList(hs.spurious)}.` : ''}`
    : '';
  const pair = extra?.pair;
  const now = pair
    ? ` Comparing T[${pair.i}] = ${q(state.text[pair.i]!)} with P[${pair.j}] = ${q(state.pattern[pair.j]!)}.`
    : '';
  return describeMatch(state) + hashes + now;
}
