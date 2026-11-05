import type { Step } from '../../engine/types';
import { pitchFor } from '../../layouts/align';
import type { TableFrame } from '../../layouts/table';
import type { Scene } from '../../render/scene';
import { q, type MatchExtra, type MatchState } from '../_strings/kit';
import { colsOf, describeMatch, matchShapes, tableAt, tableSize } from '../_strings/view';
import { names, type KmpPre, type KmpSettings } from './model';

/** The table's columns are as wide as the text's, so π[j] sits under P[j] while it is built. */
const tableFrame = (m: number, cols: number): TableFrame => ({
  rows: 1,
  cols: Math.max(1, m),
  colHeads: 2,
  rowHeads: [48],
  cellW: pitchFor(cols),
  cellH: 36,
});

/**
 * The table on top, its columns lined up with the text's; the text with the pointer i over
 * it; one row per alignment (the first q characters of a new one are dashed: known to match
 * without a comparison). While the table is built, P takes the text's place, right under the
 * table, and a copy of P slides under it.
 */
export function view(step: Step<MatchState<KmpPre>, MatchExtra>, settings: KmpSettings): Scene {
  const { state } = step;
  const m = state.pattern.length;
  const frame = tableFrame(m, colsOf(state));
  const size = tableSize(frame);
  const { sym } = names(settings);
  const pi = state.pre?.pi ?? Array.from({ length: m }, () => null);
  const { shapes, bounds } = matchShapes(step, {
    frame: { rows: 4, pointer: true, above: size.height, aboveWidth: size.width },
    pointerOf: (s) => (s.search?.next ? s.search.next.s + s.search.next.known : undefined),
    above: (g, roles) =>
      tableAt(
        frame,
        {
          values: [pi.map((v) => (v === null ? null : String(v)))],
          colHeads: [Array.from({ length: m }, (_, j) => String(j)), [...state.pattern]],
          rowHeads: [[sym]],
          corner: [['j'], ['P']],
          roles,
        },
        { gridLeft: g.left(0) },
        g.aboveTop,
      ),
  });
  return { shapes, bounds, label: label(step, sym) };
}

function label(step: Step<MatchState<KmpPre>, MatchExtra>, sym: string): string {
  const { state, extra } = step;
  const pi = state.pre?.pi;
  const table = pi
    ? ` ${sym} = ${pi.map((v) => (v === null ? 'not yet' : String(v))).join(', ')}.`
    : ` ${sym} is not built yet.`;
  const pair = extra?.pair;
  const now = pair
    ? ` Comparing T[${pair.i}] = ${q(state.text[pair.i]!)} with P[${pair.j}] = ${q(state.pattern[pair.j]!)}.`
    : '';
  const self = extra?.self?.pair;
  const building = self
    ? ` Building ${sym}: comparing P[${self.i}] = ${q(state.pattern[self.i]!)} with P[${self.j}] = ${q(state.pattern[self.j]!)}.`
    : '';
  return describeMatch(state) + table + now + building;
}
