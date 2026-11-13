/**
 * The KV cache: the tokens down the left, then panels of numbers. x (the embeddings), q (the
 * query of the token being worked on: queries are never kept), K and V (the cache: one row per
 * token, dashed where the window has evicted a row; without a cache, only the rows recomputed
 * in this step), the attention column (the new query's scores, then its weights, one per token
 * it sees), z (the new token's output) and work (the multiply-adds each token cost).
 *
 * The frame is sized for the longest text (MAX_TOKENS rows) whatever the text so far, so the
 * camera stays still while the text grows. A laptop draws the panels in one row; a phone in two.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import { matmul, short } from '../_lm/numbers';
import { CELL_W, drawPanelRows, shadeOf, type CellLook, type Panel } from '../_matrix/matrix';
import {
  D_K,
  DESIGNED,
  describe,
  MAX_TOKENS,
  rowAttention,
  windowOf,
  type KvExtra,
  type KvSettings,
  type KvState,
} from './model';

const A_CELL = 54;
const FEATURE_HEADS = ['anim', 'thing', 'act', 'small'];
const DIMS = FEATURE_HEADS.slice(0, D_K);

const maxAbs = (m: readonly (readonly number[])[]) =>
  Math.max(0, ...m.flat().filter(Number.isFinite).map(Math.abs));

/** A panel of `cols` numbers per token, shown for the token rows in `shown`. */
function numbers(
  id: string,
  title: string,
  rows: number,
  m: number[][],
  shown: ReadonlySet<number>,
  heads: readonly string[],
  ghost: ReadonlySet<number> = new Set(),
): Panel {
  const top = maxAbs(m);
  return {
    id,
    title,
    rows,
    cols: heads.length,
    colHeads: heads,
    cell: (r, c): CellLook | null => {
      if (shown.has(r)) return { text: short(m[r]![c]!), shade: shadeOf(m[r]![c]!, top) };
      return ghost.has(r) ? { text: '', cls: 'ghost' } : null;
    },
  };
}

export function view(step: Step<KvState, KvExtra>, settings: KvSettings, stage?: StageSize): Scene {
  const { state: s, extra = {} } = step;
  const n = s.words.length;
  const w = windowOf(settings);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const q = matmul(s.x, DESIGNED.wq);
  const k = matmul(s.x, DESIGNED.wk);
  const v = matmul(s.x, DESIGNED.wv);

  // K and V: the cache, plus the rows this step computes; rows the window evicted are dashed.
  const cached = new Set(Array.from({ length: s.k.length }, (_, i) => s.from + i));
  const kvShown = new Set([...cached, ...(extra.kv ?? [])]);
  const evicted = new Set(
    Array.from({ length: s.from }, (_, i) => i).filter((r) => !kvShown.has(r)),
  );

  // The query, the attention column and the output: the step's, or the newest token's.
  const last = s.last;
  const qShown = new Set(extra.q ?? (last ? [last.t] : []));
  const att =
    extra.att ?? (last ? { t: last.t, upto: last.t, stage: 'weight' as const } : undefined);
  const zShown = new Set(extra.z ?? (last ? [last.t] : []));
  const r = att ? rowAttention(s.x, att.t, w) : undefined;
  const z = Array.from({ length: n }, (_, t) => (zShown.has(t) ? rowAttention(s.x, t, w).z : []));

  const build = (rows: number) => {
    const x = numbers(
      'x',
      'x',
      rows,
      s.x,
      new Set(Array.from({ length: n }, (_, i) => i)),
      FEATURE_HEADS,
    );
    const qp = numbers('q', 'q', rows, q, qShown, DIMS);
    const kp = numbers('k', settings.cache ? 'K cache' : 'K', rows, k, kvShown, DIMS, evicted);
    const vp = numbers('v', settings.cache ? 'V cache' : 'V', rows, v, kvShown, DIMS, evicted);
    const stageKind = att?.stage ?? 'weight';
    const a: Panel = {
      id: 'a',
      title: stageKind === 'score' ? 'score' : 'weight',
      rows,
      cols: 1,
      cellW: A_CELL,
      cell(j): CellLook | null {
        if (!r || !att || j > att.t) return null;
        // Tokens before the window: the new query does not see them.
        if (j < r.lo) return { text: '', cls: 'ghost' };
        if (j > att.upto) return null;
        const i = j - r.lo;
        if (stageKind === 'score')
          return { text: short(r.s[i]!), shade: shadeOf(r.s[i]!, maxAbs([r.s])) };
        return { text: short(r.a[i]!), shade: shadeOf(r.a[i]!, 1) };
      },
    };
    const zp = numbers('z', 'z', rows, z, zShown, DIMS);
    const most = Math.max(0, ...s.work);
    const work: Panel = {
      id: 'work',
      title: 'work',
      rows,
      cols: 1,
      cellW: A_CELL,
      cell: (t) =>
        t < s.work.length ? { text: String(s.work[t]), shade: shadeOf(s.work[t]!, most) } : null,
    };
    return { x, q: qp, k: kp, v: vp, a, z: zp, work };
  };

  const shown = build(n);
  const frame = build(MAX_TOKENS);
  const blank = Array<string>(MAX_TOKENS).fill('');
  const arrangements = (
    [
      (p: ReturnType<typeof build>) => [[p.x, p.q, p.k, p.v, p.a, p.z, p.work]],
      (p: ReturnType<typeof build>) => [
        [p.x, p.k, p.v],
        [p.q, p.a, p.z, p.work],
      ],
    ] as const
  ).map((groups) => {
    const drawn = drawPanelRows(groups(shown), s.words, roles, stage);
    return {
      shapes: [...drawn.shapes, ...promptLines(drawn.shapes, groups(shown), s.prompt, n)],
      bounds: drawPanelRows(groups(frame), blank, roles, stage).bounds,
    };
  });
  const best = pickLayout(stage, arrangements);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}

/**
 * A dashed line under the prompt in each row of panels, between the tokens prefill read and the
 * ones generated after it. It runs behind the cells, so it shows in the gaps and under the words.
 */
function promptLines(
  shapes: readonly Shape[],
  groups: readonly (readonly Panel[])[],
  prompt: number,
  n: number,
): Shape[] {
  if (prompt <= 0 || prompt >= n) return [];
  const rect = (id: string) => shapes.find((sh) => sh.id === id && sh.kind === 'rect');
  return groups.flatMap((panels, g) => {
    const first = rect(`${panels[0]!.id}-${prompt}-0`);
    const end = panels.at(-1)!;
    const last = rect(`${end.id}-${prompt}-${end.cols - 1}`);
    if (first?.kind !== 'rect' || last?.kind !== 'rect') return [];
    return [
      {
        kind: 'arrow' as const,
        id: `prompt-line-${g}`,
        x1: 8,
        y1: first.y,
        x2: last.x + last.w + 8,
        y2: first.y,
        head: 'none' as const,
        dashed: true,
      },
    ];
  });
}

/** Width of the one-row drawing, for tests. */
export const oneRowWidth = 66 + (4 + 4 * D_K) * CELL_W + 2 * A_CELL + 6 * 24;
