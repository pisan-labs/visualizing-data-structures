/**
 * Positional encoding: the words with their positions down the left, then the scheme's table
 * (the encodings, the angles or the biases) and the score table. For the sinusoidal encoding
 * and RoPE, four dials show the four pairs as arrows: each pair is a point on a circle that
 * turns as the position grows, pair 0 fastest. In a score step the dials show the query's
 * position and the key's, and the angle between them, which depends only on the distance.
 *
 * Shape ids, for marks: e-<r>-<c> a cell of the scheme's table, s-<m>-<n> a score cell (a-<i>-<j>
 * for ALiBi's attention), w-<r> a row label, dial-<i> the dial of pair i, dq-<i> and dk-<i> its
 * arrows.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { text } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { short } from '../_lm/numbers';
import { drawPanelRows, shadeOf, type CellLook, type Panel } from '../_matrix/matrix';
import {
  alibiAttention,
  angle,
  content,
  describe,
  divisor,
  PAIRS,
  rotate,
  spread,
  type PosExtra,
  type PosSettings,
  type PosState,
  type Scheme,
} from './model';

const NUM_W = 40;
const POS_W = 44;
/** Score cells: RoPE's scores run to ±16 with two decimals. */
const SCORE_W: Record<Scheme, number> = { sinusoidal: 50, rope: 56, alibi: 44 };
const DIAL_R = 38;
const DIAL_W = 110;
const DIAL_H = 148;
/** Arrow labels sit this far out from the center. */
const TIP_R = DIAL_R + 12;
const DIAL_TEXT = 14;

const maxAbs = (m: readonly (readonly number[])[]) =>
  Math.max(0, ...m.flat().filter(Number.isFinite).map(Math.abs));

const HEADS: Record<Scheme, (n: number) => string[]> = {
  sinusoidal: () => Array.from({ length: 2 * PAIRS }, (_, c) => `${c % 2 ? 'c' : 's'}${c >> 1}`),
  rope: () => Array.from({ length: PAIRS }, (_, i) => `p${i}`),
  alibi: (n) => Array.from({ length: n }, (_, j) => String(j)),
};

function encodePanel(
  scheme: Scheme,
  n: number,
  table: number[][] | undefined,
  filled: number,
): Panel {
  const cols = scheme === 'alibi' ? n : scheme === 'rope' ? PAIRS : 2 * PAIRS;
  const top = table ? maxAbs(table) : 0;
  return {
    id: 'e',
    title: scheme === 'sinusoidal' ? 'PE' : scheme === 'rope' ? 'angle (radians)' : 'bias',
    rows: n,
    cols,
    cellW: scheme === 'alibi' ? POS_W : NUM_W,
    colHeads: HEADS[scheme](n),
    cell(r, c): CellLook | null {
      if (!table || r * cols + c >= filled) return null;
      const v = table[r]![c]!;
      if (v === -Infinity) return { text: '−∞', cls: 'ghost', dim: true };
      return { text: short(v), shade: scheme === 'sinusoidal' ? v : shadeOf(v, top) };
    },
  };
}

function scorePanel(
  scheme: Scheme,
  n: number,
  scores: number[][] | undefined,
  scored: number,
): Panel {
  const top = scores ? maxAbs(scores) : 0;
  return {
    id: 's',
    title: scheme === 'sinusoidal' ? 'PE(m) · PE(n)' : 'q_m · k_n, turned',
    rows: n,
    cols: n,
    cellW: SCORE_W[scheme],
    colHeads: Array.from({ length: n }, (_, j) => String(j)),
    cell(r, c): CellLook | null {
      if (!scores || r * n + c >= scored) return null;
      const v = scores[r]![c]!;
      return { text: short(v), shade: shadeOf(v, top) };
    },
  };
}

function alibiPanel(s: PosState, extra: PosExtra): Panel {
  const n = s.words.length;
  const done = !extra.stage && Boolean(s.scores) && !extra.table;
  const stage = extra.stage ?? (done ? 'weight' : undefined);
  const rows = done ? n : (extra.rows ?? 0);
  const r = stage ? alibiAttention(s.x) : undefined;
  const top = r ? maxAbs(stage === 'content' ? r.content : r.s) : 0;
  return {
    id: 'a',
    title: stage === 'content' ? 'q·k / √2' : stage === 'biased' ? 'q·k / √2 + bias' : 'softmax',
    rows: n,
    cols: n,
    cellW: POS_W,
    colHeads: Array.from({ length: n }, (_, j) => String(j)),
    cell(i, j): CellLook | null {
      if (!r || !stage) return null;
      const weight = i < rows;
      if (j > i) return { text: weight ? '0' : '−∞', cls: 'ghost', dim: true };
      if (weight) return { text: short(r.a[i]![j]!), shade: r.a[i]![j]! };
      const v = stage === 'content' ? r.content[i]![j]! : r.s[i]![j]!;
      return { text: short(v), shade: shadeOf(v, top) };
    },
  };
}

/** The four dials: each pair as arrows on a circle. */
function drawDials(
  s: PosState,
  scheme: Scheme,
  focus: [number, number] | undefined,
  pair: boolean,
  roles: ReadonlyMap<string, MarkRole>,
  cols: number,
): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [];
  const [m, n] = focus ?? [0, 0];
  const c = scheme === 'rope' ? content(s.x) : undefined;
  const qm = c ? rotate(spread(c.q[m] ?? [0, 0]), m) : undefined;
  const kn = c ? rotate(spread(c.k[n] ?? [0, 0]), n) : undefined;
  const longest = c
    ? Math.max(
        1e-9,
        ...c.q.map((v) => Math.hypot(v[0]!, v[1]!)),
        ...c.k.map((v) => Math.hypot(v[0]!, v[1]!)),
      )
    : 1;
  for (let i = 0; i < PAIRS; i++) {
    const cx = (i % cols) * DIAL_W + DIAL_W / 2;
    const cy = Math.floor(i / cols) * DIAL_H + DIAL_R + 20;
    const id = `dial-${i}`;
    shapes.push({ kind: 'circle', id, x: cx, y: cy, r: DIAL_R, cls: 'ghost', role: roles.get(id) });
    const arrow = (
      aid: string,
      x: number,
      y: number,
      role: MarkRole,
      label?: string,
      away?: number,
    ) => {
      const len = Math.hypot(x, y);
      shapes.push({
        kind: 'arrow',
        id: aid,
        x1: cx,
        y1: cy,
        x2: cx + x * DIAL_R,
        y2: cy - y * DIAL_R,
        head: len * DIAL_R < 2 ? 'none' : 'end',
        dashed: role === 'compare',
        role,
      });
      if (!label || len * DIAL_R < 4) return;
      // Beside the tip, turned away from the other arrow's label when the two nearly meet.
      const a = Math.atan2(y, x) + (away ?? 0);
      shapes.push(
        text(`${aid}-l`, { x: cx + Math.cos(a) * TIP_R, y: cy - Math.sin(a) * TIP_R + 5 }, label, {
          size: DIAL_TEXT,
          bold: true,
          anchor: 'middle',
          role,
        }),
      );
    };
    /** Draw the query's arrow and the key's, keeping their labels apart. */
    const both = (qx: number, qy: number, kx: number, ky: number, ql: string, kl: string) => {
      const d = Math.atan2(ky, kx) - Math.atan2(qy, qx);
      const gap = Math.atan2(Math.sin(d), Math.cos(d));
      const push = Math.abs(gap) < 0.5 ? (gap >= 0 ? 0.32 : -0.32) : 0;
      arrow(`dk-${i}`, kx, ky, 'compare', kl, push);
      arrow(`dq-${i}`, qx, qy, 'active', ql, -push);
    };
    if (!pair) {
      // Encoding: the pair at one position, a unit arrow at its angle.
      const a = angle(m, i);
      arrow(`dq-${i}`, Math.cos(a), Math.sin(a), 'active');
    } else if (scheme === 'sinusoidal') {
      const [a, b] = [angle(m, i), angle(n, i)];
      both(Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), String(m), String(n));
    } else {
      both(
        qm![2 * i]! / longest,
        qm![2 * i + 1]! / longest,
        kn![2 * i]! / longest,
        kn![2 * i + 1]! / longest,
        'q',
        'k',
      );
    }
    shapes.push(
      text(`${id}-l`, { x: cx, y: cy + DIAL_R + 30 }, `pair ${i}`, {
        size: DIAL_TEXT,
        anchor: 'middle',
        bold: true,
        cls: '',
      }),
    );
    shapes.push(
      text(`${id}-d`, { x: cx, y: cy + DIAL_R + 47 }, `pos ÷ ${divisor(i)}`, {
        size: DIAL_TEXT,
        anchor: 'middle',
        mono: true,
      }),
    );
  }
  const rows = Math.ceil(PAIRS / cols);
  const title = pair
    ? scheme === 'rope'
      ? `q at ${m}, k at ${n}`
      : `PE(${m}) and PE(${n})`
    : `position ${m}`;
  shapes.push(
    text('dial-title', { x: 0, y: -10 }, title, { size: DIAL_TEXT, bold: true, cls: '' }),
  );
  return { shapes, bounds: { x: 0, y: -26, w: cols * DIAL_W, h: rows * DIAL_H + 26 } };
}

export function view(
  step: Step<PosState, PosExtra>,
  settings: PosSettings,
  stage?: StageSize,
): Scene {
  const { state: s, extra = {} } = step;
  const { scheme } = settings;
  const n = s.words.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const labels = s.words.map((w, p) => `${p} ${w}`);
  const table = extra.table ?? s.table;
  const filled = extra.filled ?? (s.table ? Number.POSITIVE_INFINITY : 0);
  const e = encodePanel(scheme, n, table, filled);
  const scores = extra.scores ?? s.scores;
  const scored = extra.scored ?? (s.scores && !extra.table ? Number.POSITIVE_INFINITY : 0);

  if (scheme === 'alibi') {
    const a = alibiPanel(s, extra);
    const options = [[[e, a]], [[e], [a]]].map((g) => drawPanelRows(g, labels, roles, stage));
    const best = pickLayout(stage, options);
    return { shapes: best.shapes, bounds: best.bounds, label: describe(s, settings) };
  }

  const sp = scorePanel(scheme, n, scores, scored);
  const focus = extra.focus ?? s.focus;
  const pair = scored > 0;
  const compose = (groups: Panel[][], cols: number, beside: boolean) => {
    const panels = drawPanelRows(groups, labels, roles, stage);
    const d = drawDials(s, scheme, focus, pair, roles, cols);
    const b = panels.bounds;
    const dx = beside ? b.x + b.w + 8 : b.x + 12;
    const dy = beside ? (stage?.strip ? 0 : 58) + 26 + 26 : b.y + b.h + 30;
    const shapes = [...panels.shapes, ...translate(d.shapes, dx, dy)];
    const right = Math.max(b.x + b.w, dx + d.bounds.w + 12);
    const bottom = Math.max(b.y + b.h, dy + d.bounds.y + d.bounds.h + 12);
    return { shapes, bounds: { x: b.x, y: b.y, w: right - b.x, h: bottom - b.y } };
  };
  const options = [
    compose([[e, sp]], 2, true),
    compose([[e], [sp]], 4, false),
    compose([[e, sp]], 4, false),
  ];
  const best = pickLayout(stage, options);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s, settings) };
}
