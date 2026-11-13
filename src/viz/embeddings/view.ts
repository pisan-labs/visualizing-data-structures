/**
 * Embeddings: the words as arrows from the origin on a plane, a table of their coordinates with
 * each word's score against the target, and the min-heap of the best k (a tree of boxes, root
 * on top), which becomes the ranked answer at the end. A wide laptop stage puts the three side
 * by side; a phone puts the plane and the table over the heap.
 *
 * Shape ids, for marks:
 *   v-<word>      a word's arrow (its label v-<word>-l)
 *   tr-<i>        row i of the table; ts-<i> its score cell
 *   hn-<word>     a word kept in the heap (or in the answer)
 *   p-a, p-b, p-c the arrows of an analogy: a, then − b, then + c; tgt its landing point
 *   wedge         the angle between the two words of a similarity
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { drawGrid, makePlane, text, type Plane } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import { short } from '../_lm/numbers';
import { shadeOf } from '../_matrix/matrix';
import {
  describe,
  kOf,
  vectors,
  type EmbExtra,
  type EmbSettings,
  type EmbState,
  type Kept,
  type Search,
  type Vec2,
} from './model';

type Roles = ReadonlyMap<string, MarkRole>;

interface Block {
  shapes: Shape[];
  bounds: Bounds;
}

const ROW_H = 22;
const TABLE_COLS = [62, 44, 44, 50];
const NODE_W = 56;
const NODE_H = 40;
const SLOT = 70;
const LEVEL_H = 56;
const HEAP_W = 4 * SLOT;

/** The window onto the plane: around the words as made, or around the unit circle. */
function window(normalize: boolean) {
  return normalize
    ? { xmin: -1.6, xmax: 1.6, ymin: -1.6, ymax: 1.6, span: 3.2 }
    : { xmin: -3.2, xmax: 4.4, ymin: -2.6, ymax: 4.6, span: 7.6 };
}

function arc(plane: Plane, from: number, to: number, r: number): { x: number; y: number }[] {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const pts = [plane.at({ x: 0, y: 0 })];
  for (let t = 0; t <= 12; t++) {
    const a = from + (d * t) / 12;
    pts.push(plane.at({ x: r * Math.cos(a), y: r * Math.sin(a) }));
  }
  return pts;
}

const angle = (v: Vec2) => Math.atan2(v[1], v[0]);

function drawPlane(
  s: EmbState,
  vs: Vec2[],
  settings: EmbSettings,
  roles: Roles,
  extra: EmbExtra,
  width: number,
): Block {
  const w = window(settings.normalize);
  const unit = width / w.span;
  const plane = makePlane({ ...w, unit, x: 34, y: 10 });
  const shapes: Shape[] = [];
  drawGrid(shapes, plane, {
    id: 'g',
    step: settings.normalize ? 0.5 : 1,
    labelEvery: settings.normalize ? 1 : 2,
    names: ['d1', 'd2'],
    opacity: 0.16,
  });
  const o = plane.at({ x: 0, y: 0 });
  if (settings.normalize)
    shapes.push({
      kind: 'circle',
      id: 'unit',
      x: o.x,
      y: o.y,
      r: unit,
      cls: 'ghost',
      opacity: 0.6,
    });

  // Labels go just past the tips; on the unit circle, crowded ones alternate between two rings.
  const order = vs.map((v, i) => [angle(v), i] as const).sort((a, b) => a[0] - b[0]);
  const ring = new Map<number, number>();
  let last = -Infinity;
  let lastRing = 1;
  for (const [a, i] of order) {
    const near = settings.normalize && a - last < 0.22;
    lastRing = near ? 1 - lastRing : 0;
    ring.set(i, lastRing);
    last = a;
  }
  vs.forEach((v, i) => {
    const word = s.vocab[i]!.w;
    const id = `v-${word}`;
    const tip = plane.at({ x: v[0], y: v[1] });
    const role = roles.get(id);
    shapes.push({ kind: 'arrow', id, x1: o.x, y1: o.y, x2: tip.x, y2: tip.y, role });
    const a = angle(v);
    const off = 16 + (ring.get(i) ?? 0) * 22;
    const lx = tip.x + Math.cos(a) * off;
    const ly = tip.y - Math.sin(a) * off + 5;
    const anchor = Math.cos(a) > 0.35 ? 'start' : Math.cos(a) < -0.35 ? 'end' : 'middle';
    shapes.push(
      text(
        `${id}-l`,
        { x: lx - (anchor === 'start' ? 6 : anchor === 'end' ? -6 : 0), y: ly },
        word,
        {
          size: 13,
          bold: true,
          anchor,
          role: role ?? undefined,
          cls: role ? undefined : '',
        },
      ),
    );
  });

  // A similarity: the angle between the two arrows.
  const pair = extra.pair?.pair ?? (s.query?.kind === 'similarity' ? s.query : undefined);
  if (pair) {
    const [va, vb] = [vs[pair.a]!, vs[pair.b]!];
    const r = settings.normalize ? 0.42 : 0.9;
    const stage = extra.pair?.stage ?? 'cos';
    shapes.push({
      kind: 'polygon',
      id: 'wedge',
      points: arc(plane, angle(va), angle(vb), r),
      role: 'active',
      opacity: stage === 'cos' ? 1 : 0.5,
    });
    const mid = (angle(va) + angle(vb)) / 2;
    const deg = (Math.acos(Math.max(-1, Math.min(1, pair.cos))) * 180) / Math.PI;
    const at = plane.at({ x: (r + 0.35) * Math.cos(mid), y: (r + 0.35) * Math.sin(mid) });
    if (stage === 'cos')
      shapes.push(
        text('wedge-l', { x: at.x, y: at.y + 5 }, `${deg.toFixed(0)}°`, {
          size: 13,
          anchor: 'middle',
          bold: true,
        }),
      );
  }

  // An analogy: a, then − b, then + c, and the point it lands on.
  const search = extra.search?.search ?? (s.query?.kind === 'analogy' ? s.query : undefined);
  const path = extra.search ? extra.search.path : s.query?.kind === 'analogy' ? 3 : 0;
  if (search?.kind === 'analogy' && path > 0) {
    const [a, b] = search.words as [number, number, number];
    const va = vs[a]!;
    const mid: Vec2 = [va[0] - vs[b]![0], va[1] - vs[b]![1]];
    const t = search.target;
    const P = (v: Vec2) => plane.at({ x: v[0], y: v[1] });
    const seg = (id: string, from: Vec2, to: Vec2, dashed: boolean) => {
      const [p, q] = [P(from), P(to)];
      shapes.push({
        kind: 'arrow',
        id,
        x1: p.x,
        y1: p.y,
        x2: q.x,
        y2: q.y,
        dashed,
        role: roles.get(id) ?? 'visit',
        z: 1,
      });
    };
    seg('p-a', [0, 0], va, false);
    if (path >= 2) seg('p-b', va, mid, true);
    if (path >= 3) {
      seg('p-c', mid, t, true);
      const q = P(t);
      shapes.push({
        kind: 'circle',
        id: 'tgt',
        x: q.x,
        y: q.y,
        r: 6,
        role: roles.get('tgt') ?? 'active',
        z: 3,
      });
    }
  }

  const r = plane.rect;
  return { shapes, bounds: { x: 0, y: 0, w: r.x + r.w + 6, h: r.y + r.h + 22 } };
}

function scoreScale(scores: readonly (number | null)[]): number {
  return Math.max(0, ...scores.filter((x): x is number => x !== null).map(Math.abs));
}

function drawTable(
  s: EmbState,
  vs: Vec2[],
  settings: EmbSettings,
  roles: Roles,
  search: Search | undefined,
): Block {
  const shapes: Shape[] = [];
  const xs = TABLE_COLS.reduce<number[]>((acc, w, i) => [...acc, (acc[i] ?? 0) + w], [0]);
  const width = xs[xs.length - 1]!;
  const heads = ['word', 'x', 'y', settings.measure === 'cosine' ? 'cos' : 'dot'];
  heads.forEach((h, c) =>
    shapes.push(
      text(`th-${c}`, { x: c === 0 ? 4 : xs[c]! + TABLE_COLS[c]! / 2, y: 16 }, h, {
        size: 13,
        bold: true,
        anchor: c === 0 ? 'start' : 'middle',
        mono: c > 0,
      }),
    ),
  );
  const top = 24;
  const scores = search?.scores ?? [];
  const scale = settings.measure === 'cosine' ? 1 : scoreScale(scores);
  s.vocab.forEach((x, i) => {
    const y = top + i * ROW_H;
    const id = `tr-${i}`;
    const role = roles.get(id);
    shapes.push({
      kind: 'rect',
      id,
      x: 0,
      y,
      w: xs[3]!,
      h: ROW_H,
      r: 2,
      cls: role ? 'live' : 'ghost',
      role,
      opacity: role ? 1 : 0,
    });
    const v = vs[i]!;
    const left = search?.words.includes(i);
    shapes.push(
      text(`tw-${i}`, { x: 4, y: y + 16 }, x.w, {
        size: 13,
        bold: true,
        role: roles.get(`v-${x.w}`),
        cls: roles.get(`v-${x.w}`) ? undefined : '',
      }),
    );
    shapes.push(
      text(`tx-${i}`, { x: xs[1]! + TABLE_COLS[1]! - 6, y: y + 16 }, short(v[0]), {
        size: 13,
        anchor: 'end',
        mono: true,
      }),
    );
    shapes.push(
      text(`ty-${i}`, { x: xs[2]! + TABLE_COLS[2]! - 6, y: y + 16 }, short(v[1]), {
        size: 13,
        anchor: 'end',
        mono: true,
      }),
    );
    const sc = scores[i];
    const cell = `ts-${i}`;
    shapes.push({
      kind: 'rect',
      id: cell,
      x: xs[3]! + 2,
      y: y + 1,
      w: TABLE_COLS[3]! - 4,
      h: ROW_H - 2,
      r: 2,
      cls: sc === null || sc === undefined ? 'ghost' : 'live',
      shade: sc === null || sc === undefined ? undefined : shadeOf(sc, scale),
      role: roles.get(cell),
      opacity: sc === null || sc === undefined ? (left ? 0.5 : 0) : 1,
    });
    shapes.push(
      text(
        `${cell}-t`,
        { x: xs[3]! + TABLE_COLS[3]! / 2, y: y + 16 },
        sc === null || sc === undefined ? (left ? '—' : '') : short(sc),
        { size: 13, anchor: 'middle', mono: true, cls: left ? 'label' : '' },
      ),
    );
  });
  return { shapes, bounds: { x: 0, y: 0, w: width, h: top + s.vocab.length * ROW_H + 4 } };
}

/** Center of heap position p in a tree of slots SLOT wide. */
function slot(p: number): { x: number; y: number } {
  const level = Math.floor(Math.log2(p + 1));
  const first = 2 ** level - 1;
  const span = HEAP_W / 2 ** level;
  return { x: (p - first + 0.5) * span, y: level * LEVEL_H };
}

function node(shapes: Shape[], s: EmbState, e: Kept, cx: number, y: number, roles: Roles): void {
  const word = s.vocab[e.i]!.w;
  const id = `hn-${word}`;
  shapes.push({
    kind: 'rect',
    id,
    x: cx - NODE_W / 2,
    y,
    w: NODE_W,
    h: NODE_H,
    r: 4,
    cls: 'live',
    role: roles.get(id),
  });
  shapes.push(
    text(`${id}-w`, { x: cx, y: y + 17 }, word, {
      size: 13,
      bold: true,
      anchor: 'middle',
      cls: '',
    }),
  );
  shapes.push(
    text(`${id}-s`, { x: cx, y: y + 34 }, short(e.s), { size: 13, anchor: 'middle', mono: true }),
  );
}

function drawHeap(s: EmbState, settings: EmbSettings, roles: Roles, extra: EmbExtra): Block {
  const shapes: Shape[] = [];
  const work = extra.search;
  const q = s.query;
  const k = kOf(settings);
  const top = 26;
  const title = (t: string) =>
    shapes.push(text('h-title', { x: 0, y: 16 }, t, { size: 13, bold: true, cls: '' }));
  if (work) {
    title(`best ${k} so far (min-heap)`);
    work.heap.forEach((e, p) => {
      const c = slot(p);
      if (p > 0) {
        const pc = slot((p - 1) >> 1);
        shapes.push({
          kind: 'arrow',
          id: `he-${p}`,
          x1: pc.x,
          y1: top + pc.y + NODE_H,
          x2: c.x,
          y2: top + c.y,
          head: 'none',
          opacity: 0.6,
        });
      }
      node(shapes, s, e, c.x, top + c.y, roles);
    });
    if (work.heap.length === 0)
      shapes.push(text('h-empty', { x: 0, y: top + 24 }, 'empty', { size: 13 }));
  } else if (q && q.kind !== 'similarity') {
    title(`nearest ${q.top.length}, best first`);
    q.top.forEach((e, r) => {
      const cx = NODE_W / 2 + r * (NODE_W + 2);
      shapes.push(
        text(`rk-${r}`, { x: cx, y: top + NODE_H + 18 }, String(r + 1), {
          size: 13,
          anchor: 'middle',
        }),
      );
      node(shapes, s, e, cx, top, roles);
    });
  } else {
    const pair = extra.pair?.pair ?? (q?.kind === 'similarity' ? q : undefined);
    if (pair) {
      const stage = extra.pair?.stage ?? 'cos';
      const [na, nb] = [s.vocab[pair.a]!.w, s.vocab[pair.b]!.w];
      title(`${na} and ${nb}`);
      const lines: [string, string][] = [['dot', `a · b = ${short(pair.dot)}`]];
      if (stage !== 'dot') lines.push(['len', `|a| = ${short(pair.la)}, |b| = ${short(pair.lb)}`]);
      if (stage === 'cos') lines.push(['cos', `cos = ${short(pair.cos)}`]);
      lines.forEach(([id, t], r) =>
        shapes.push(
          text(`sr-${id}`, { x: 0, y: top + 20 + r * 24 }, t, { size: 13, mono: true, cls: '' }),
        ),
      );
    }
  }
  return { shapes, bounds: { x: 0, y: 0, w: HEAP_W, h: top + 3 * LEVEL_H } };
}

export function view(
  step: Step<EmbState, EmbExtra>,
  settings: EmbSettings,
  stage?: StageSize,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const vs = vectors(s, settings);
  const search =
    extra.search?.search ?? (s.query && s.query.kind !== 'similarity' ? s.query : undefined);
  const table = drawTable(s, vs, settings, roles, search);
  const heap = drawHeap(s, settings, roles, extra);
  const drop = stage?.strip ? 0 : ZOOM_DROP + 8;

  const compose = (parts: [Block, number, number][]): Block => {
    const shapes = parts.flatMap(([b, dx, dy]) => translate(b.shapes, dx, dy));
    const x2 = Math.max(...parts.map(([b, dx]) => dx + b.bounds.w));
    const y2 = Math.max(...parts.map(([b, , dy]) => dy + b.bounds.h));
    return { shapes, bounds: { x: -12, y: -12, w: x2 + 24, h: y2 + 24 } };
  };
  const wide = (() => {
    const p = drawPlane(s, vs, settings, roles, extra, 330);
    const tx = p.bounds.w + 20;
    return compose([
      [p, 0, 0],
      [table, tx, 4],
      [heap, tx + table.bounds.w + 24, drop],
    ]);
  })();
  const tall = (() => {
    const p = drawPlane(s, vs, settings, roles, extra, 206);
    const tx = p.bounds.w + 12;
    const below = Math.max(p.bounds.h, table.bounds.h + 4) + 14;
    return compose([
      [p, 0, 0],
      [table, tx, 4],
      [heap, 0, below],
    ]);
  })();
  const best = pickLayout(stage, [wide, tall]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}
