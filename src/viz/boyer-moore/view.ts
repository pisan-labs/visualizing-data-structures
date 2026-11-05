import type { MarkRole, Step } from '../../engine/types';
import { pitchFor, type AlignGeometry } from '../../layouts/align';
import type { TableFrame } from '../../layouts/table';
import type { Scene, Shape } from '../../render/scene';
import { q, type MatchExtra, type MatchState } from '../_strings/kit';
import { colsOf, describeMatch, matchShapes, tableAt, tableSize } from '../_strings/view';
import { type BmPre, type BmSettings } from './model';

/** The bad-character table's columns: characters in the order they first appear in P. */
function keysOf(pattern: string, full: boolean): string[] {
  const keys: string[] = [];
  for (const c of full ? pattern : pattern.slice(0, -1)) if (!keys.includes(c)) keys.push(c);
  return keys;
}

const frameOf = (cols: number, lanes: number, pitch: number): TableFrame => ({
  rows: 1,
  cols,
  colHeads: lanes,
  rowHeads: [56],
  cellW: pitch,
  cellH: 36,
});

const GAP = 8;
/** Room between two tables side by side: a gap and the second one's row header. */
const BESIDE = 24 + 56;

/**
 * The shift tables on top, then the text and one row per alignment. Comparisons run from the
 * right end of P; a shift's label says how far P slid and, with both rules, which one chose it
 * (bc: bad character, gs: good suffix). The table entries a slide reads light up.
 */
export function view(step: Step<MatchState<BmPre>, MatchExtra>, settings: BmSettings): Scene {
  const { state } = step;
  const full = settings.rules === 'full';
  const m = state.pattern.length;
  const pitch = pitchFor(colsOf(state));
  const keys = keysOf(state.pattern, full);
  const pre = state.pre;
  const bad = frameOf(keys.length + 1, 1, pitch);
  const gs = frameOf(m + 1, 2, pitch);
  const badSize = tableSize(bad);
  const gsSize = tableSize(gs);
  // With both rules, the two tables go side by side when they fit over the text, else stacked.
  const cols = colsOf(state);
  const beside = full && (keys.length + 1 + m + 1) * pitch + BESIDE <= cols * pitch + 12;
  const above = full
    ? beside
      ? Math.max(badSize.height, gsSize.height)
      : badSize.height + GAP + gsSize.height
    : badSize.height;
  const aboveWidth = beside
    ? badSize.width + BESIDE - 56 + gsSize.width
    : Math.max(badSize.width, full ? gsSize.width : 0);

  const tables = (g: AlignGeometry, roles: ReadonlyMap<string, MarkRole>): Shape[] => {
    const out = tableAt(
      bad,
      {
        values: [
          [...keys.map((_, k) => (pre ? (pre.bad[k] ?? null) : null)), pre ? pre.other : null].map(
            (v) => (v === null ? null : String(v)),
          ),
        ],
        colHeads: [[...keys, '*']],
        colStyles: ['label'],
        rowHeads: [[full ? 'last' : 'shift']],
        corner: [['c']],
        roles,
      },
      { gridLeft: g.left(0) },
      // Side by side, the value rows line up: the bad-character table has one header lane less.
      g.aboveTop + (beside ? gsSize.height - badSize.height : 0),
      'bc-',
    );
    if (full) {
      out.push(
        ...tableAt(
          gs,
          {
            values: [
              [...(pre?.gs ?? Array.from({ length: m }, () => null)), pre?.gsMatch ?? null].map(
                (v) => (v === null || v === undefined ? null : String(v)),
              ),
            ],
            colHeads: [
              [...Array.from({ length: m }, (_, j) => String(j)), 'm'],
              [...state.pattern, 'all'],
            ],
            rowHeads: [['gs']],
            corner: [['j'], ['P']],
            roles,
          },
          { gridLeft: beside ? g.left(keys.length + 1) + BESIDE : g.left(0) },
          beside ? g.aboveTop : g.aboveTop + badSize.height + GAP,
          'gs-',
        ),
      );
    }
    return out;
  };

  const { shapes, bounds } = matchShapes(step, {
    frame: { rows: full ? 3 : 4, above, aboveWidth },
    above: tables,
  });
  return { shapes, bounds, label: label(step, full) };
}

function label(step: Step<MatchState<BmPre>, MatchExtra>, full: boolean): string {
  const { state, extra } = step;
  const pre = state.pre;
  const table = pre
    ? ` ${full ? 'last' : 'shift'}: ${pre.keys.map((c, k) => `${c} ${pre.bad[k] ?? 'not yet'}`).join(', ')}, any other ${pre.other}.${
        full && pre.gs
          ? ` gs: ${pre.gs.map((v) => v ?? 'not yet').join(', ')}; after a match ${pre.gsMatch ?? 'not yet'}.`
          : ''
      }`
    : ' The tables are not built yet.';
  const pair = extra?.pair;
  const now = pair
    ? ` Comparing T[${pair.i}] = ${q(state.text[pair.i]!)} with P[${pair.j}] = ${q(state.pattern[pair.j]!)}.`
    : '';
  return describeMatch(state) + table + now;
}
