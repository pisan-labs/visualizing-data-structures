import type { Step } from '../../engine/types';
import type { Scene } from '../../render/scene';
import { q, type MatchExtra, type MatchState } from '../_strings/kit';
import { describeMatch, matchShapes } from '../_strings/view';

/**
 * The text with the pointer i over it, and one row per shift: the pattern slides one place at
 * a time, and earlier shifts stay above the current one, faded, with how far each one got.
 */
export function view(step: Step<MatchState<null>, MatchExtra>): Scene {
  const { shapes, bounds } = matchShapes(step, {
    frame: { rows: 5, pointer: true },
    pointerOf: (s) => (s.search?.next ? s.search.next.s : undefined),
  });
  return { shapes, bounds, label: label(step) };
}

function label(step: Step<MatchState<null>, MatchExtra>): string {
  const { state, extra } = step;
  const pair = extra?.pair;
  const now = pair
    ? ` Comparing T[${pair.i}] = ${q(state.text[pair.i]!)} with P[${pair.j}] = ${q(state.pattern[pair.j]!)}.`
    : '';
  return describeMatch(state) + now;
}
