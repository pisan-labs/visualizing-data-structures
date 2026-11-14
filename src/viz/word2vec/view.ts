/**
 * word2vec: the plane of vectors, the sentence under the window, and the update in numbers.
 *
 * - The plane: each word's vector w as a dot and its context vector c as a square, labeled;
 *   during an update the center word, the real context (pulled) and the noise words (pushed)
 *   are marked, and a dashed trail shows where each moved vector came from.
 * - The strip: the sentence the window is on, the word in the middle and the neighbour paired
 *   with it.
 * - The table (src/viz/_decode/bars.ts): one row per target, the real context (+) and the
 *   noise words (−), with w·c, σ(w·c) as a bar from 0 to 1, and the share of w each context
 *   vector moves by (×w).
 *
 * A laptop puts the plane on the left and the rest on the right; a phone stacks them.
 *
 * Shape ids, for marks:
 *   pw-<word>, pc-<word>    a word vector (dot) and a context vector (square); labels -l
 *   tr-pw-<word>, tr-pc-<word>  trails
 *   s-<p>                   the chip of sentence position p
 *   dot-<row>, sig-<row>, coef-<row>  table cells, rows pos, n0, n1, ...
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import { drawGrid, makePlane, text, type Plane } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import { short } from '../_lm/numbers';
import { drawTable, type Column, type Row } from '../_decode/bars';
import { shadeOf } from '../_matrix/matrix';
import {
  describe,
  MAX_WORDS,
  VOCAB,
  type PairRec,
  type Vec2,
  type W2vExtra,
  type W2vSettings,
  type W2vState,
  type W2vWork,
} from './model';

type Roles = ReadonlyMap<string, MarkRole>;

interface Block {
  shapes: Shape[];
  bounds: Bounds;
}

const PLANE = 340;
const LABEL = 13;
const CHIP_W = 40;
const CHIP_H = 30;
const CHIP_GAP = 4;
const STRIP_W = MAX_WORDS * (CHIP_W + CHIP_GAP) - CHIP_GAP;
const STRIP_H = 58;
const GAP = 26;
const SQUARE = 10;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

interface Spot {
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

/**
 * A place for each label near its point, chosen greedily so that labels miss each other, the
 * points and the plane's edge. Points earlier in the list choose first.
 */
function placeLabels(pts: { x: number; y: number; text: string }[], win: Bounds): Spot[] {
  const placed: Box[] = pts.map((p) => ({ x: p.x - 6, y: p.y - 6, w: 12, h: 12 }));
  return pts.map((p) => {
    const w = p.text.length * LABEL * 0.62 + 2;
    const h = LABEL;
    const spots: Spot[] = [
      { x: p.x + 9, y: p.y + 5, anchor: 'start' },
      { x: p.x - 9, y: p.y + 5, anchor: 'end' },
      { x: p.x, y: p.y - 10, anchor: 'middle' },
      { x: p.x, y: p.y + 20, anchor: 'middle' },
      { x: p.x + 7, y: p.y - 7, anchor: 'start' },
      { x: p.x + 7, y: p.y + 17, anchor: 'start' },
      { x: p.x - 7, y: p.y - 7, anchor: 'end' },
      { x: p.x - 7, y: p.y + 17, anchor: 'end' },
    ];
    let best = spots[0]!;
    let cost = Infinity;
    spots.forEach((s, k) => {
      const x = s.anchor === 'start' ? s.x : s.anchor === 'end' ? s.x - w : s.x - w / 2;
      const box = { x, y: s.y - h + 2, w, h };
      let score = k * 6;
      score +=
        40 *
        (Math.max(0, win.x - box.x) +
          Math.max(0, box.x + box.w - (win.x + win.w)) +
          Math.max(0, win.y - box.y) +
          Math.max(0, box.y + box.h - (win.y + win.h)));
      for (const b of placed) score += overlap(box, b) * 3;
      if (score < cost) {
        cost = score;
        best = s;
      }
    });
    const x = best.anchor === 'start' ? best.x : best.anchor === 'end' ? best.x - w : best.x - w / 2;
    placed.push({ x, y: best.y - h + 2, w, h });
    return best;
  });
}

function drawVectors(
  s: W2vState,
  work: W2vWork | undefined,
  roles: Roles,
  y0: number,
): Block {
  const R = s.reach;
  const unit = PLANE / (2 * R);
  const plane: Plane = makePlane({ xmin: -R, xmax: R, ymin: -R, ymax: R, unit, x: 30, y: y0 + 8 });
  const shapes: Shape[] = [];
  drawGrid(shapes, plane, {
    id: 'g',
    step: 1,
    labelEvery: R > 3 ? 2 : 1,
    names: ['d1', 'd2'],
    opacity: 0.16,
  });
  const at = (v: Vec2) => plane.at({ x: v[0], y: v[1] });
  const ws = s.w.map(at);
  const cs = s.c.map(at);

  // Trails first, so the points sit on top.
  for (const t of work?.trails ?? []) {
    const p = at(t.from);
    const word = t.id.slice(3);
    const k = VOCAB.indexOf(word);
    const q = t.id.startsWith('pw-') ? ws[k]! : cs[k]!;
    if (Math.hypot(q.x - p.x, q.y - p.y) < 2) continue;
    shapes.push({
      kind: 'arrow',
      id: `tr-${t.id}`,
      x1: p.x,
      y1: p.y,
      x2: q.x,
      y2: q.y,
      dashed: true,
      role: roles.get(t.id),
      opacity: 0.85,
    });
  }

  // The pair in play: a line from the center word to each target.
  const rec = work?.rec;
  if (rec && work?.stage !== 'draw') {
    const from = ws[rec.center]!;
    rec.targets.forEach((t, m) => {
      const to = cs[t]!;
      shapes.push({
        kind: 'arrow',
        id: m === 0 ? 'link-pos' : `link-n${m - 1}`,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        head: 'none',
        dashed: m > 0,
        role: m === 0 ? 'found' : 'remove',
        opacity: 0.5,
      });
    });
  }

  const pts = [
    ...VOCAB.map((w, i) => ({ ...ws[i]!, text: w })),
    ...VOCAB.map((w, i) => ({ ...cs[i]!, text: w })),
  ];
  const spots = placeLabels(pts, plane.rect);
  VOCAB.forEach((word, i) => {
    const id = `pw-${word}`;
    const role = roles.get(id);
    const p = ws[i]!;
    shapes.push({ kind: 'circle', id, x: p.x, y: p.y, r: role ? 7 : 5, cls: 'arrowhead', role, z: 3 });
    const sp = spots[i]!;
    shapes.push(
      text(`${id}-l`, sp, word, {
        size: LABEL,
        bold: true,
        anchor: sp.anchor,
        role,
        cls: role ? undefined : '',
      }),
    );
  });
  VOCAB.forEach((word, i) => {
    const id = `pc-${word}`;
    const role = roles.get(id);
    const p = cs[i]!;
    shapes.push({
      kind: 'rect',
      id,
      x: p.x - SQUARE / 2,
      y: p.y - SQUARE / 2,
      w: SQUARE,
      h: SQUARE,
      cls: 'live',
      role,
      z: 3,
    });
    const sp = spots[VOCAB.length + i]!;
    shapes.push(text(`${id}-l`, sp, word, { size: LABEL, anchor: sp.anchor, role }));
  });
  const r = plane.rect;
  return { shapes, bounds: { x: 0, y: y0, w: r.x + r.w + 8, h: r.h + 30 } };
}

function drawStrip(work: W2vWork | undefined, roles: Roles): Block {
  const shapes: Shape[] = [];
  const words = work?.words ?? [];
  const i = work?.i;
  shapes.push(
    text('s-title', { x: 0, y: 14 }, words.length ? 'the window' : '', {
      size: LABEL,
      bold: true,
    }),
  );
  const top = 22;
  words.forEach((t, p) => {
    const id = `s-${p}`;
    const x = p * (CHIP_W + CHIP_GAP);
    shapes.push({
      kind: 'rect',
      id,
      x,
      y: top,
      w: CHIP_W,
      h: CHIP_H,
      r: 4,
      cls: 'live',
      role: roles.get(id),
    });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + CHIP_W / 2,
      y: top + CHIP_H / 2 + 5,
      text: VOCAB[t]!,
      size: 14,
      anchor: 'middle',
      mono: true,
      weight: i === p ? 'bold' : undefined,
      role: roles.get(id),
    });
  });
  return { shapes, bounds: { x: 0, y: 0, w: STRIP_W, h: STRIP_H } };
}

function drawUpdate(rec: PairRec | undefined, work: W2vWork | undefined, k: number, roles: Roles): Block {
  const rows: Row[] = [
    { key: 'pos', label: rec ? `+${VOCAB[rec.context]}` : '+' },
    ...Array.from({ length: k }, (_, m) => ({
      key: `n${m}`,
      label: rec && rec.negs[m] !== undefined ? `−${VOCAB[rec.negs[m]]}` : '−',
    })),
  ];
  const stage = work?.stage ?? 'idle';
  const order = ['draw', 'pair', 'pos', 'neg', 'center', 'done'];
  const reached = order.indexOf(stage);
  const show = rec && reached >= 1;
  const done = stage === 'done';
  const dotTop = rec ? Math.max(0, ...rec.dots.map(Math.abs)) : 0;
  const coefShown = (r: number) => {
    if (!rec || reached < 2) return false;
    if (r === 0) return true;
    if (stage === 'neg') return r - 1 <= (work?.neg ?? -1);
    return reached >= 4;
  };
  const coefTop = rec ? Math.max(0, ...rec.coefs.map(Math.abs)) : 0;
  const cols: Column[] = [
    {
      kind: 'cells',
      id: 'dot',
      title: 'w·c',
      cell: (r) =>
        show && rec.dots[r] !== undefined
          ? { text: short(rec.dots[r]!), shade: shadeOf(rec.dots[r]!, dotTop) }
          : null,
    },
    {
      kind: 'bars',
      id: 'sig',
      title: done ? 'σ after' : 'σ(w·c)',
      track: 96,
      room: 44,
      bar: (r) => {
        if (!show || rec.sigs[r] === undefined) return null;
        const v = done ? rec.after[r]! : rec.sigs[r]!;
        return { value: v, text: short(v) };
      },
    },
    {
      kind: 'cells',
      id: 'coef',
      title: '×w',
      w: 58,
      cell: (r) =>
        coefShown(r) && rec?.coefs[r] !== undefined
          ? { text: short(rec.coefs[r]!), shade: shadeOf(rec.coefs[r]!, coefTop) }
          : null,
    },
  ];
  const t = drawTable([cols], rows, roles, { top: 0, labelW: 58 });
  // drawTable pads its bounds by 12; keep its own box.
  const shapes = [...t.shapes];
  const below = t.bounds.y + t.bounds.h - 4;
  shapes.push(
    text('cap-1', { x: 4, y: below + 6 }, '+ a real neighbour: want σ = 1', { size: LABEL }),
    text('cap-2', { x: 4, y: below + 24 }, '− a noise word: want σ = 0', { size: LABEL }),
  );
  // The legend for the plane.
  const ly = below + 50;
  shapes.push(
    { kind: 'circle', id: 'lg-w', x: 10, y: ly - 4, r: 5, cls: 'arrowhead' },
    text('lg-w-t', { x: 22, y: ly + 1 }, 'w, the word', { size: LABEL }),
    {
      kind: 'rect',
      id: 'lg-c',
      x: 130 - SQUARE / 2,
      y: ly - 4 - SQUARE / 2,
      w: SQUARE,
      h: SQUARE,
      cls: 'live',
    },
    text('lg-c-t', { x: 142, y: ly + 1 }, 'c, as a neighbour', { size: LABEL }),
  );
  const b = unionBounds(t.bounds, { x: 0, y: below, w: 290, h: ly + 8 - below });
  return { shapes, bounds: b };
}

export function view(
  step: Step<W2vState, W2vExtra>,
  settings: W2vSettings,
  stage?: StageSize,
): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const work = step.extra?.work;
  const k = settings.negatives;

  const strip = drawStrip(work, roles);
  const table = drawUpdate(work?.rec, work, k, roles);

  // A laptop: the plane on the left; the strip, the table and the legend on the right, below
  // the zoom buttons.
  const wide = (() => {
    const plane = drawVectors(state, work, roles, 0);
    const x = plane.bounds.w + GAP;
    const drop = stage?.strip ? 0 : ZOOM_DROP;
    const s = translate(strip.shapes, x, drop);
    const ty = drop + STRIP_H + 8 - table.bounds.y;
    const t = translate(table.shapes, x - table.bounds.x, ty);
    const bounds = unionBounds(
      plane.bounds,
      { x, y: drop, w: STRIP_W, h: STRIP_H },
      { x, y: ty + table.bounds.y, w: table.bounds.w, h: table.bounds.h },
    );
    return { shapes: [...plane.shapes, ...s, ...t], bounds: padBounds(bounds, 10) };
  })();

  // A phone: the strip, the plane, then the table.
  const tall = (() => {
    const plane = drawVectors(state, work, roles, STRIP_H);
    const ty = STRIP_H + plane.bounds.h + 10 - table.bounds.y;
    const t = translate(table.shapes, -table.bounds.x, ty);
    const bounds = unionBounds(
      { x: 0, y: 0, w: STRIP_W, h: STRIP_H },
      plane.bounds,
      { x: 0, y: ty + table.bounds.y, w: table.bounds.w, h: table.bounds.h },
    );
    return { shapes: [...strip.shapes, ...plane.shapes, ...t], bounds: padBounds(bounds, 10) };
  })();

  const best = pickLayout(stage, [wide, tall]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(state) };
}
