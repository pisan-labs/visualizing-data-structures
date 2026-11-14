/**
 * FlashAttention, drawn as a matrix product: Q down the left (one row per word), Kᵀ and Vᵀ
 * across the top (one column per word), the table of scores S where they meet, and each row's
 * running max m, sum ℓ and output O on the right. Gaps cut Q, S, m, ℓ and O into blocks of B_r
 * rows, and Kᵀ, Vᵀ and S into blocks of B_c columns, so the tiles show.
 *
 * Only the tile on chip shows its scores; a tile already done is blank (its scores were dropped),
 * a tile still to come is dashed, and a masked score reads −∞. Plain attention fills the whole
 * table instead: the scores, then the weights.
 *
 * A laptop draws it all in one row; a phone puts m, ℓ and O (and Q too, if that draws larger)
 * under the table. The frame depends only on the sentence and the block sizes, so the camera
 * stays still while the tiles go by.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_CORNER } from '../../render/stage';
import { short } from '../_lm/numbers';
import { shadeOf } from '../_matrix/matrix';
import {
  bcOf,
  brOf,
  D_K,
  describe,
  score,
  tileOrder,
  type FlashExtra,
  type FlashSettings,
  type FlashState,
} from './model';

const CW = 48;
const SW = 54;
const MW = 54;
const CH = 30;
const GAP = 8;
const PG = 20;
const LABEL_W = 66;
const HEAD = 24;
const TITLE = 26;
const SIZE = 15;
const DIMS = ['anim', 'thing'];

type Roles = ReadonlyMap<string, MarkRole>;
type TextOpts = Partial<Extract<Shape, { kind: 'text' }>>;

const text = (id: string, x: number, y: number, t: string, o: TextOpts = {}): Shape => ({
  kind: 'text',
  id,
  x,
  y,
  text: t,
  size: SIZE,
  mono: true,
  ...o,
});

const maxAbs = (m: readonly (readonly number[])[]) =>
  Math.max(0, ...m.flat().filter(Number.isFinite).map(Math.abs));

interface Cell {
  text?: string;
  shade?: number;
  ghost?: boolean;
  dim?: boolean;
}

function cell(out: Shape[], id: string, x: number, y: number, w: number, c: Cell, roles: Roles) {
  out.push({
    kind: 'rect',
    id,
    x,
    y,
    w,
    h: CH,
    r: 2,
    cls: c.ghost ? 'ghost' : 'live',
    shade: c.shade,
    role: roles.get(id),
  });
  if (c.text)
    out.push(
      text(`${id}-t`, x + w / 2, y + CH / 2 + 5, c.text, {
        anchor: 'middle',
        cls: c.dim ? 'label' : undefined,
      }),
    );
}

/** What every part of the picture shows in this step. */
function contents(step: Step<FlashState, FlashExtra>, settings: FlashSettings) {
  const s = step.state;
  const n = s.words.length;
  const extra = step.extra ?? {};
  const causal = settings.causal;
  const order = tileOrder(n, settings);
  // Which tile (index in the loop order) each cell belongs to; −1 for a skipped tile.
  const tileOf = Array.from({ length: n }, () => Array<number>(n).fill(-1));
  order.forEach((t, k) => {
    for (let i = t.r0; i < t.r1; i++) for (let j = t.c0; j < t.c1; j++) tileOf[i]![j] = k;
  });
  const scores = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => score(s, i, j, causal)),
  );
  const top = maxAbs(scores);
  const sCell = (i: number, j: number): Cell => {
    const masked = causal && j > i;
    if (s.plain) {
      const stage = extra.plain?.stage ?? 'out';
      const rows = extra.plain?.rows ?? n;
      if (i >= rows) return { ghost: true, text: masked ? '−∞' : '', dim: true };
      if (stage === 'scores')
        return masked
          ? { ghost: true, text: '−∞', dim: true }
          : { text: short(s.plain.s[i]![j]!), shade: shadeOf(s.plain.s[i]![j]!, top) };
      return masked
        ? { ghost: true, text: '0', dim: true }
        : { text: short(s.plain.p[i]![j]!), shade: s.plain.p[i]![j]! };
    }
    if (masked) return { ghost: true, text: '−∞', dim: true };
    const k = tileOf[i]![j]!;
    if (extra.tile !== undefined && k === extra.tile)
      return { text: short(scores[i]![j]!), shade: shadeOf(scores[i]![j]!, top) };
    if (s.flash && k < s.flash.done) return {};
    return { ghost: true };
  };

  // m, ℓ and O for row i.
  let stats: ((i: number) => { m: Cell; l: Cell; o: Cell[] }) | null = null;
  if (s.flash) {
    const f = s.flash;
    const oTop = maxAbs(f.o);
    stats = (i) => ({
      m: { text: short(f.m[i]!), dim: f.m[i] === -Infinity },
      l: { text: short(f.l[i]!), dim: f.l[i] === 0 },
      o: f.o[i]!.map((v) => ({ text: short(v), shade: shadeOf(v, oTop) })),
    });
  } else if (s.plain) {
    const p = s.plain;
    const stage = extra.plain?.stage ?? 'out';
    const oTop = maxAbs(p.o);
    stats = (i) => ({
      m: stage === 'scores' ? {} : { text: short(p.m[i]!) },
      l: stage === 'scores' ? {} : { text: short(p.l[i]!) },
      o: p.o[i]!.map((v) =>
        stage === 'out' ? { text: short(v), shade: shadeOf(v, oTop) } : ({} as Cell),
      ),
    });
  }

  let title = 'S = Q·Kᵀ / √2';
  if (s.plain)
    title = (extra.plain?.stage ?? 'out') === 'scores' ? 'S, all in HBM' : 'P = softmax(S), in HBM';
  else if (extra.tile !== undefined) title = `tile ${extra.tile + 1} of ${order.length}, on chip`;
  else if (s.flash) title = `S, one tile at a time`;
  return { sCell, stats, title };
}

export function view(
  step: Step<FlashState, FlashExtra>,
  settings: FlashSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const n = s.words.length;
  const br = brOf(settings);
  const bc = bcOf(settings);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const { sCell, stats, title } = contents(step, settings);
  const colX = (j: number) => j * SW + Math.floor(j / bc) * GAP;
  const rowY = (i: number) => i * CH + Math.floor(i / br) * GAP;
  const sW = colX(n - 1) + SW;
  const rowsH = rowY(n - 1) + CH;
  const qTop = maxAbs(s.q);
  const kTop = maxAbs(s.k);
  const vTop = maxAbs(s.v);

  /** Q, S and the stats in groups of rows; `layout` says which part goes where. */
  const draw = (layout: 'one' | 'stats-below' | 'q-below') => {
    const shapes: Shape[] = [];
    const boxes: Bounds[] = [];
    const pad = stage && !stage.strip && layout !== 'one' ? ZOOM_CORNER.h : 0;
    const qInTop = layout !== 'q-below';
    const sx = LABEL_W + (qInTop ? 2 * CW + PG : 0);

    // The top band: the key words, then Kᵀ and Vᵀ.
    const kty = pad + HEAD;
    const vty = kty + 2 * CH + 6;
    s.words.forEach((w, j) =>
      shapes.push(
        text(`kw-${j}`, sx + colX(j) + SW / 2, kty - 7, w, {
          anchor: 'middle',
          cls: 'label',
          role: roles.get(`kw-${j}`),
        }),
      ),
    );
    for (const [id, y0, m, mTop, name] of [
      ['kt', kty, s.k, kTop, 'Kᵀ'],
      ['vt', vty, s.v, vTop, 'Vᵀ'],
    ] as const) {
      shapes.push(
        text(`${id}-title`, sx - 10, y0 + CH + 5, name, { anchor: 'end', weight: 'bold' }),
      );
      for (let c = 0; c < D_K; c++)
        for (let j = 0; j < n; j++)
          cell(
            shapes,
            `${id}-${c}-${j}`,
            sx + colX(j),
            y0 + c * CH,
            SW,
            { text: short(m[j]![c]!), shade: shadeOf(m[j]![c]!, mTop) },
            roles,
          );
    }
    boxes.push({ x: sx - 40, y: pad, w: sW + 40, h: vty + 2 * CH - pad });

    /** Row labels, a title row and a head row, then the rows; returns the rows' top. */
    const group = (g: number, y0: number, heads = true) => {
      const top = y0 + TITLE + (heads ? HEAD : 0);
      s.words.forEach((_, i) =>
        shapes.push(
          text(
            g === 0 ? `w-${i}` : `w-${g}-${i}`,
            LABEL_W - 10,
            top + rowY(i) + CH / 2 + 5,
            s.words[i]!,
            {
              anchor: 'end',
              weight: 'bold',
              role: roles.get(`w-${i}`),
            },
          ),
        ),
      );
      boxes.push({ x: 0, y: y0, w: LABEL_W, h: top - y0 + rowsH });
      return top;
    };
    const panelTitle = (id: string, x: number, y0: number, t: string) =>
      shapes.push(text(id, x, y0 + 17, t, { weight: 'bold', role: roles.get(id) }));
    const heads = (id: string, x: number, top: number) =>
      DIMS.forEach((h, c) =>
        shapes.push(
          text(`${id}-ch-${c}`, x + c * CW + CW / 2, top - 7, h, {
            anchor: 'middle',
            cls: 'label',
          }),
        ),
      );

    const y1 = vty + 2 * CH + 14;
    const top1 = group(0, y1, qInTop);
    let statsX = sx + sW + PG;
    let statsTop = top1;
    let statsY = y1;
    const qx = LABEL_W;
    let qTopY = top1;
    let qY = y1;
    if (layout !== 'one') {
      const y2 = top1 + rowsH + 22;
      const top2 = group(1, y2);
      statsX = LABEL_W + (layout === 'q-below' ? 2 * CW + PG : 0);
      statsTop = top2;
      statsY = y2;
      if (layout === 'q-below') {
        qTopY = top2;
        qY = y2;
      }
    }
    // Q.
    panelTitle('q-title', qx, qY, 'Q');
    heads('q', qx, qTopY);
    for (let i = 0; i < n; i++)
      for (let c = 0; c < D_K; c++)
        cell(
          shapes,
          `q-${i}-${c}`,
          qx + c * CW,
          qTopY + rowY(i),
          CW,
          { text: short(s.q[i]![c]!), shade: shadeOf(s.q[i]![c]!, qTop) },
          roles,
        );
    boxes.push({ x: qx, y: qY, w: 2 * CW, h: qTopY - qY + rowsH });
    // S.
    panelTitle('s-title', sx, y1, title);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        cell(shapes, `s-${i}-${j}`, sx + colX(j), top1 + rowY(i), SW, sCell(i, j), roles);
    boxes.push({ x: sx, y: y1, w: sW, h: top1 - y1 + rowsH });
    // m, ℓ and O.
    const lx = statsX + MW + 10;
    const ox = lx + MW + 10;
    panelTitle('m-title', statsX, statsY, 'm');
    panelTitle('l-title', lx, statsY, 'ℓ');
    panelTitle('o-title', ox, statsY, 'O');
    heads('o', ox, statsTop);
    for (let i = 0; i < n; i++) {
      const st = stats?.(i);
      const y = statsTop + rowY(i);
      cell(shapes, `m-${i}`, statsX, y, MW, st?.m ?? { ghost: true }, roles);
      cell(shapes, `l-${i}`, lx, y, MW, st?.l ?? { ghost: true }, roles);
      for (let c = 0; c < D_K; c++)
        cell(shapes, `o-${i}-${c}`, ox + c * CW, y, CW, st?.o[c] ?? { ghost: true }, roles);
    }
    boxes.push({ x: statsX, y: statsY, w: ox + 2 * CW - statsX, h: statsTop - statsY + rowsH });
    return { shapes, bounds: padBounds(unionBounds(...boxes), 12) };
  };

  const best = pickLayout(stage, [draw('one'), draw('stats-below'), draw('q-below')]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s, settings) };
}
