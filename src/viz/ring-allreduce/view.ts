/**
 * Ring all-reduce: the workers on an ellipse, worker 1 at the top (left and right for two),
 * each with its chunks in a row, and a curved arrow from every worker to the next. A chunk in
 * flight is a cell on its arrow, outlined in its chunk's color and printed with its value; when
 * it lands it slides into its cell and fades. A cell is shaded by how many workers' gradients
 * it adds up, and outlined in purple once it holds the whole sum. The ring's middle says which
 * stage and step this is. Purple outlines mark the whole sums; green, chunks just received.
 *
 * A laptop gets a wide ellipse; a phone a rounder one.
 */
import { groupRole, type MarkRole, type StageSize, type Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { CELL_H, drawGrid, headRoom, VALUE_SIZE, type Grid } from '../_dist/cells';
import {
  bitCount,
  chunkName,
  describe,
  workerName,
  type Packet,
  type RingExtra,
  type RingSettings,
  type RingState,
} from './model';

/** Cell widths: roomy on a wide ellipse, narrower on a round one (a phone). */
const WIDE_CELL = 44;
const ROUND_CELL = 36;
const GAP = 18;
/** The stage label in the ring's middle ("reduce-scatter", "step 2 of 3"), which no worker may cover. */
const LABEL: Bounds = { x: -66, y: -20, w: 132, h: 42 };
const LABEL_GAP = 8;

interface Box {
  /** Top left of the cells. */
  x: number;
  y: number;
  w: number;
  /** The whole worker, title included. */
  box: Bounds;
}

const num = (x: number) => (x < 0 ? `−${-x}` : String(x));

function grid(s: RingState, i: number, cw: number): Grid {
  const n = s.n;
  return {
    id: `v${i}`,
    title: workerName(i),
    rows: 1,
    cols: n,
    cellW: cw,
    colHeads: Array.from({ length: n }, (_, c) => chunkName(c)),
    cell: (_r, c) => ({
      text: num(s.v[i]![c]!),
      shade: bitCount(s.has[i]![c]!) / n,
    }),
    cellRole: (_r, c) => (bitCount(s.has[i]![c]!) === n ? 'found' : undefined),
  };
}

/** Where each worker sits on an ellipse with radii rx, ry around (0, 0). */
function places(n: number, rx: number, ry: number): { cx: number; cy: number; angle: number }[] {
  const start = n === 2 ? Math.PI : -Math.PI / 2;
  return Array.from({ length: n }, (_, i) => {
    const angle = start + (2 * Math.PI * i) / n;
    return { cx: rx * Math.cos(angle), cy: ry * Math.sin(angle), angle };
  });
}

const overlap = (a: Bounds, b: Bounds, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** The boxes on an ellipse of this shape, grown until no two workers touch. */
function ring(n: number, aspect: number, cw: number): Box[] {
  const w = n * cw;
  const top = headRoom({ id: '', rows: 1, cols: n, cell: () => null, title: 't', colHeads: ['a'] });
  const h = top + CELL_H;
  for (let ry = 40; ; ry += 4) {
    const boxes = places(n, ry * aspect, ry).map(({ cx, cy }) => {
      const box = { x: cx - w / 2, y: cy - h / 2, w, h };
      return { x: box.x, y: box.y + top, w, box };
    });
    const clear = boxes.every(
      (a, i) =>
        !overlap(a.box, LABEL, LABEL_GAP) &&
        boxes.every((b, j) => j <= i || !overlap(a.box, b.box, GAP)),
    );
    // Arrows long enough to see past the chunk riding on them.
    if (clear && ry >= 80 + 10 * n) return boxes;
  }
}

/** Where the ray from the box's centre towards (tx, ty) leaves the box, plus a margin. */
function edge(b: Bounds, tx: number, ty: number, margin = 6) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const sx = dx === 0 ? Infinity : (b.w / 2 + margin) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (b.h / 2 + margin) / Math.abs(dy);
  const k = Math.min(sx, sy);
  return { x: cx + dx * k, y: cy + dy * k };
}

interface Link {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  via: { x: number; y: number };
  /** The curve's middle, where a chunk in flight sits. */
  mid: { x: number; y: number };
}

function links(boxes: Box[], cw: number): Link[] {
  const n = boxes.length;
  const centre = (b: Box) => ({ x: b.box.x + b.box.w / 2, y: b.box.y + b.box.h / 2 });
  return boxes.map((a, i) => {
    const b = boxes[(i + 1) % n]!;
    const p = centre(a);
    const q = centre(b);
    // Bow the curve away from the ring's middle (for two workers, one above and one below),
    // just far enough that a chunk riding on its middle clears every worker.
    const cx = (p.x + q.x) / 2;
    const cy = (p.y + q.y) / 2;
    const ox = n === 2 ? 0 : cx;
    const oy = n === 2 ? (i === 0 ? -1 : 1) : cy;
    const len = Math.hypot(ox, oy) || 1;
    let link: Link | undefined;
    for (let bow = n === 2 ? 70 : 40; bow <= 400; bow += 10) {
      const via = { x: cx + (ox / len) * bow, y: cy + (oy / len) * bow };
      const s = edge(a.box, via.x, via.y);
      const e = edge(b.box, via.x, via.y);
      const mid = {
        x: 0.25 * s.x + 0.5 * via.x + 0.25 * e.x,
        y: 0.25 * s.y + 0.5 * via.y + 0.25 * e.y,
      };
      link = { x1: s.x, y1: s.y, x2: e.x, y2: e.y, via, mid };
      const chunk = { x: mid.x - cw / 2, y: mid.y - CELL_H / 2, w: cw, h: CELL_H };
      if (boxes.every((c) => !overlap(chunk, c.box, 6))) break;
    }
    return link!;
  });
}

function packet(
  id: string,
  p: Packet,
  x: number,
  y: number,
  from: { x: number; y: number },
  cw: number,
  opacity = 1,
): Shape[] {
  return [
    {
      kind: 'rect',
      id,
      x: x - cw / 2,
      y: y - CELL_H / 2,
      w: cw,
      h: CELL_H,
      r: 6,
      cls: 'live',
      role: groupRole(p.chunk + 1),
      opacity,
      z: 3,
      enterFrom: { x: from.x, y: from.y },
    },
    {
      kind: 'text',
      id: `${id}-t`,
      x,
      y: y + 5,
      text: num(p.value),
      size: VALUE_SIZE,
      anchor: 'middle',
      mono: true,
      weight: 'bold',
      opacity,
      z: 4,
      enterFrom: { x: from.x + cw / 2, y: from.y + CELL_H / 2 + 5 },
    },
  ];
}

function drawRing(step: Step<RingState, RingExtra>, aspect: number, cw: number) {
  const s = step.state;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const boxes = ring(s.n, aspect, cw);
  const shapes: Shape[] = [];
  const bounds: Bounds[] = [];
  boxes.forEach((b, i) => bounds.push(drawGrid(shapes, grid(s, i, cw), b.x, b.y, roles)));
  const ls = links(boxes, cw);
  ls.forEach((l, i) => {
    shapes.push({
      kind: 'arrow',
      id: `link-${i}`,
      x1: l.x1,
      y1: l.y1,
      x2: l.x2,
      y2: l.y2,
      via: l.via,
      role: roles.get(`link-${i}`),
    });
    // Room for a chunk on every arrow, in flight or not, so the camera keeps still.
    bounds.push({ x: l.mid.x - cw / 2, y: l.mid.y - CELL_H / 2, w: cw, h: CELL_H });
  });
  const cellAt = (i: number, c: number) => ({ x: boxes[i]!.x + c * cw, y: boxes[i]!.y });
  const key = `${extra.stage ?? ''}-${extra.step ?? 0}`;
  for (const p of extra.packets ?? []) {
    const l = ls[p.from]!;
    shapes.push(...packet(`pk-${key}-${p.from}`, p, l.mid.x, l.mid.y, cellAt(p.from, p.chunk), cw));
  }
  // The chunks just received slide from their arrows into their cells and fade.
  if (extra.landed) {
    const before = `${extra.stage}-${(extra.step ?? 1) - 1}`;
    for (const p of extra.landed) {
      const dest = cellAt(p.to, p.chunk);
      shapes.push(
        ...packet(`pk-${before}-${p.from}`, p, dest.x + cw / 2, dest.y + CELL_H / 2, dest, cw, 0),
      );
    }
  }
  const lines =
    extra.stage === undefined
      ? [
          s.phase === 'done'
            ? 'all-reduced'
            : s.phase === 'scattered'
              ? 'reduce-scattered'
              : `ring of ${s.n}`,
        ]
      : [
          extra.stage === 'rs' ? 'reduce-scatter' : 'all-gather',
          `step ${extra.packets ? (extra.step ?? 0) + 1 : (extra.step ?? 0)} of ${s.n - 1}`,
        ];
  lines.forEach((text, k) =>
    shapes.push({
      kind: 'text',
      id: k === 0 ? 'stage' : 'stage-step',
      x: 0,
      y: lines.length === 1 ? 5 : k === 0 ? -4 : 16,
      text,
      size: VALUE_SIZE,
      anchor: 'middle',
      cls: 'label',
    }),
  );
  return { shapes, bounds: padBounds(unionBounds(...bounds), 14) };
}

export function view(
  step: Step<RingState, RingExtra>,
  _settings: RingSettings,
  stage?: StageSize,
): Scene {
  const best = pickLayout(stage, [drawRing(step, 2.4, WIDE_CELL), drawRing(step, 1.1, ROUND_CELL)]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(step.state) };
}
