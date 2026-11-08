/**
 * Shared drawing for the string-matching pages: a state and a step become the alignment rows
 * of src/layouts/align.ts. Each page adds what is its own (a table, a hash lane) and a label.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import {
  alignScene,
  fitOn,
  placeTable,
  prefixIds,
  type AlignContent,
  type AlignFrame,
  type AlignGeometry,
  type AlignRow,
} from '../../layouts/align';
import { tableGeometry, tableScene, type TableContent, type TableFrame } from '../../layouts/table';
import type { Bounds, Shape } from '../../render/scene';
import {
  andList,
  foundText,
  plural,
  type Attempt,
  type MatchExtra,
  type MatchState,
  type Shift,
} from './kit';

/** "+3", or "+3 gs" with the Boyer-Moore rule that chose it (a tie needs no name). */
const byText = (by: Shift) => `+${by.amount}${by.rule && by.rule !== 'tie' ? ` ${by.rule}` : ''}`;

const rowOf = (a: Attempt, k: number): AlignRow => ({
  id: k,
  shift: a.s,
  cells: a.cells,
  found: a.end === 'match',
  label: `s=${a.s}`,
  ...(a.by ? { by: byText(a.by) } : {}),
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
      ...(s.next.by ? { by: byText(s.next.by) } : {}),
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
  /** Shapes over the text: a table placed with the geometry. */
  above?: (g: AlignGeometry, roles: ReadonlyMap<string, MarkRole>) => Shape[];
  /** Change the rows before they are drawn (Rabin-Karp shows p where the shift would go). */
  mapRows?: (rows: AlignRow[], state: MatchState) => AlignRow[];
  /** The value lane (Rabin-Karp's window hashes). */
  values?: AlignContent['values'];
}

/** The columns a frame needs: the longer of the text and the pattern. */
export const colsOf = (state: MatchState) => Math.max(state.text.length, state.pattern.length, 1);

/**
 * The step drawn as alignment rows. `optsOf(pitch)` gives the options for a column pitch (a
 * table above the text is as wide as its columns); the pitch is the one that draws the frame
 * largest on `stage` (fitOn), or the usual one with no stage.
 */
export function matchShapes(
  step: Step<MatchState, MatchExtra>,
  optsOf: MatchViewOptions | ((pitch: number) => MatchViewOptions),
  stage?: StageSize,
): { shapes: Shape[]; bounds: Bounds; geometry: AlignGeometry } {
  const { state } = step;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const cols = colsOf(state);
  const at = (p: number) => (typeof optsOf === 'function' ? optsOf(p) : optsOf);
  const fit = fitOn(stage, (p) => ({ ...at(p).frame, cols }));
  const opts = at(fit.pitch);
  const frame: AlignFrame = { ...opts.frame, cols, ...fit };
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
        rows: opts.mapRows ? opts.mapRows(rowsOf(state), state) : rowsOf(state),
        found: state.search?.found ?? [],
        roles,
        ...(opts.values ? { values: opts.values } : {}),
      };
  if (!self) {
    const ptr = extra.pointer?.at ?? opts.pointerOf?.(state);
    if (ptr !== undefined) content.pointer = { name: extra.pointer?.name ?? 'i', at: ptr };
    if (extra.pair) content.pair = { ...extra.pair, row: currentRow(state) };
  }
  const out = alignScene(frame, content);
  if (opts.above) out.shapes.push(...opts.above(out.geometry, roles));
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

/** The size of a table drawn by src/layouts/table.ts: its headers and grid. */
export function tableSize(frame: TableFrame): { width: number; height: number } {
  const g = tableGeometry(frame);
  const heads = (frame.rowHeads ?? [40]).reduce((a, b) => a + b, 0);
  return { width: heads + frame.cols * g.cellW, height: g.gridBottom - (g.headY(0) - 21) };
}

/**
 * A table from src/layouts/table.ts, moved so its top is at `top`. `at` places
 * it: centered on `centerX`, or with its first column's left edge at `gridLeft` (so a table
 * indexed like the pattern lines up with the top row's columns). With a `prefix`, its shape
 * ids (and the marks that point at them) get the prefix, so two tables can share a scene.
 */
export function tableAt(
  frame: TableFrame,
  content: TableContent,
  at: { centerX: number } | { gridLeft: number },
  top: number,
  prefix = '',
): Shape[] {
  const g = tableGeometry(frame);
  const roles = new Map<string, MarkRole>();
  for (const [id, role] of content.roles ?? [])
    if (id.startsWith(prefix)) roles.set(id.slice(prefix.length), role);
  const { shapes } = tableScene(frame, { ...content, roles });
  const heads = (frame.rowHeads ?? [40]).reduce((a, b) => a + b, 0);
  const box = { left: g.gridLeft - heads, right: g.gridRight, top: g.headY(0) - 21 };
  const centerX =
    'centerX' in at ? at.centerX : at.gridLeft - g.gridLeft + (box.left + box.right) / 2;
  const placed = placeTable(shapes, box, centerX, top);
  return prefix ? prefixIds(placed, prefix) : placed;
}
