/**
 * Shared drawing for the string-matching pages: a state and a step become the alignment rows
 * of src/layouts/align.ts. Each page adds what is its own (a table, a hash lane) and a label.
 */
import type { MarkRole, Step } from '../../engine/types';
import {
  alignScene,
  type AlignContent,
  type AlignFrame,
  type AlignGeometry,
  type AlignRow,
} from '../../layouts/align';
import type { Bounds, Shape } from '../../render/scene';
import { andList, foundText, plural, type Attempt, type MatchExtra, type MatchState } from './kit';

const rowOf = (a: Attempt, k: number): AlignRow => ({
  id: k,
  shift: a.s,
  cells: a.cells,
  found: a.end === 'match',
  label: `s=${a.s}`,
  ...(a.by ? { by: `+${a.by.amount}` } : {}),
});

/** The alignments so far, then the live one or the next one. Before a search: P at shift 0. */
export function rowsOf(state: MatchState): AlignRow[] {
  const s = state.search;
  if (!s) return [{ id: 0, shift: 0, label: 's=0' }];
  const rows = s.attempts.map(rowOf);
  const k = s.attempts.length;
  if (s.live) rows.push(rowOf(s.live, k));
  else if (s.next) {
    const known = Array.from({ length: state.pattern.length }, (_, j) =>
      j < s.next!.known ? ('known' as const) : null,
    );
    rows.push({
      id: k,
      shift: s.next.s,
      cells: known,
      label: `s=${s.next.s}`,
      ...(s.next.by ? { by: `+${s.next.by.amount}` } : {}),
    });
  }
  return rows;
}

/** The row id of the alignment on show: the live one, or the next one. */
export function currentRow(state: MatchState): number {
  const s = state.search;
  return s ? s.attempts.length : 0;
}

export interface MatchViewOptions {
  frame: Omit<AlignFrame, 'cols'>;
  /** Where the text pointer is when the step does not say. */
  pointerOf?: (state: MatchState) => number | undefined;
  /** Shapes under the rows: a table placed with the geometry. */
  below?: (g: AlignGeometry, roles: ReadonlyMap<string, MarkRole>) => Shape[];
  /** The value lane (Rabin-Karp's window hashes). */
  values?: AlignContent['values'];
}

/** The columns a frame needs: the longer of the text and the pattern. */
export const colsOf = (state: MatchState) => Math.max(state.text.length, state.pattern.length, 1);

export function matchShapes(
  step: Step<MatchState, MatchExtra>,
  opts: MatchViewOptions,
): { shapes: Shape[]; bounds: Bounds; geometry: AlignGeometry } {
  const { state } = step;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const frame: AlignFrame = { ...opts.frame, cols: colsOf(state) };
  const self = extra.self;
  const content: AlignContent = self
    ? {
        text: state.pattern,
        textName: 'P',
        textId: 'u',
        pattern: state.pattern,
        rows: self.rows,
        ...(self.pointer !== undefined ? { pointer: { name: 'i', at: self.pointer } } : {}),
        ...(self.pair ? { pair: self.pair } : {}),
        roles,
      }
    : {
        text: state.text,
        pattern: state.pattern,
        rows: rowsOf(state),
        found: state.search?.found ?? [],
        roles,
        ...(opts.values ? { values: opts.values } : {}),
      };
  if (!self) {
    const at = extra.pointer?.at ?? opts.pointerOf?.(state);
    if (at !== undefined) content.pointer = { name: extra.pointer?.name ?? 'i', at };
    if (extra.pair) content.pair = { ...extra.pair, row: currentRow(state) };
  }
  const out = alignScene(frame, content);
  if (opts.below) out.shapes.push(...opts.below(out.geometry, roles));
  return out;
}

/** Screen-reader summary of where a search stands. */
export function describeMatch(state: MatchState): string {
  const { text, pattern } = state;
  const head = `Text T = ${text}, ${plural(text.length, 'character')}. Pattern P = ${pattern}, ${plural(pattern.length, 'character')}.`;
  const s = state.search;
  if (!s) return `${head} No search yet.`;
  const found = s.found.length
    ? `Found at ${s.found.length === 1 ? 'shift' : 'shifts'} ${andList(s.found)}.`
    : 'Nothing found so far.';
  const where = s.live
    ? ` Comparing at shift ${s.live.s}.`
    : s.next
      ? ` Next shift: ${s.next.s}${s.next.known ? `, with the first ${plural(s.next.known, 'character')} known to match` : ''}.`
      : ` The search is over after ${plural(s.attempts.length, 'alignment')} and ${plural(s.comparisons, 'comparison')}.`;
  return `${head} ${found}${where}`;
}

export { foundText };
