import type { MarkRole, Step } from '../../engine/types';
import {
  boxExit,
  CONTROLS_BAND,
  drawLink,
  drawNode,
  NODE,
  pointerId,
  straightLink,
  type Box,
  type Pt,
} from '../../layouts/linked';
import type { Scene, Shape } from '../../render/scene';
import { describe, nid, rho, type FExtra, type FSettings, type FState } from './model';

/**
 * The "rho" drawing: the tail in rows of four (each row turning back, so neighbours stay next
 * to each other), and the cycle as a ring hanging below the end of the tail. A list without a
 * cycle is just the rows, ending in null.
 */
const W = 380;
const COLS = 4;
const PITCH = 72;
const ROW = 80;
const NW = NODE.plain.value;
const NH = NODE.plain.h;
const LABEL = 15;
const CHAR = 0.6;

interface Layout {
  centers: Pt[];
  /** Position of the "null" a list without a cycle ends in. */
  nullAt?: Pt;
  ring?: { cx: number; cy: number; r: number; mu: number; lambda: number };
  height: number;
}

function layout(state: FState): Layout {
  const n = state.nodes.length;
  const r = rho(state);
  const tail = r ? r.mu : n;
  const top = CONTROLS_BAND + 40;
  const x0 = (W - ((COLS - 1) * PITCH + NW)) / 2 + NW / 2;
  const slot = (k: number): Pt => {
    const row = Math.floor(k / COLS);
    const col = k % COLS;
    return { x: x0 + (row % 2 ? COLS - 1 - col : col) * PITCH, y: top + row * ROW };
  };
  const centers: Pt[] = [];
  for (let k = 0; k < tail; k++) centers.push(slot(k));
  if (!r) {
    const end = n ? slot(n) : slot(0);
    const last = n ? centers[n - 1]! : end;
    return { centers, nullAt: end, height: Math.max(last.y, end.y) + 70 };
  }
  const { mu, lambda } = r;
  const radius = lambda === 1 ? 0 : Math.max(38, 74 / (2 * Math.sin(Math.PI / lambda)));
  const margin = radius + NW / 2 + 48;
  const above = mu ? centers[mu - 1]! : { x: W / 2, y: top - 96 };
  const ex = Math.max(margin, Math.min(W - margin, above.x));
  const ey = above.y + 96;
  const cy = ey + radius;
  for (let j = 0; j < lambda; j++) {
    const a = -Math.PI / 2 + (2 * Math.PI * j) / lambda;
    centers.push({ x: ex + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  return {
    centers,
    ring: { cx: ex, cy, r: radius, mu, lambda },
    height: cy + radius + NH / 2 + (lambda === 1 ? 50 : 66),
  };
}

const boxAt = (c: Pt): Box => ({ x: c.x - NW / 2, y: c.y - NH / 2, w: NW, h: NH });

export function view(step: Step<FState, FExtra>, _settings: FSettings): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const g = layout(state);
  const n = state.nodes.length;
  const shapes: Shape[] = [];
  const boxes = g.centers.map(boxAt);

  state.nodes.forEach((nd, i) => {
    shapes.push(
      ...drawNode({ id: nid(nd.uid), text: String(nd.value) }, boxes[i]!, 'plain', roles),
    );
  });

  // Links: along the tail, into the ring, around the ring.
  state.nodes.forEach((nd, i) => {
    const id = `${nid(nd.uid)}.next`;
    const role = roles.get(id);
    const from = boxes[i]!;
    const j = nd.next === null ? -1 : state.nodes.findIndex((m) => m.uid === nd.next);
    if (j < 0) {
      const to = g.nullAt!;
      const a = boxExit(from, to);
      const b = boxExit({ x: to.x - 18, y: to.y - 10, w: 36, h: 20 }, a, 2);
      shapes.push(...drawLink(id, [a, b], { role }));
      return;
    }
    if (j === i) {
      // A one-node cycle: a small loop off the right side, back in from below.
      const b = from;
      const pts: Pt[] = [
        { x: b.x + b.w, y: b.y + b.h / 2 - 6 },
        { x: b.x + b.w + 18, y: b.y + b.h / 2 - 6 },
        { x: b.x + b.w + 18, y: b.y + b.h + 16 },
        { x: b.x + b.w / 2, y: b.y + b.h + 16 },
        { x: b.x + b.w / 2, y: b.y + b.h + 1 },
      ];
      shapes.push(...drawLink(id, pts, { role }));
      return;
    }
    const twoCycle = g.ring?.lambda === 2 && i >= g.ring.mu;
    if (!twoCycle) {
      shapes.push(...straightLink(id, from, boxes[j]!, { role }));
      return;
    }
    // Two nodes pointing at each other: shift each arrow to its own side.
    const a = g.centers[i]!;
    const c = g.centers[j]!;
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const off = { x: ((c.y - a.y) / len) * -8, y: ((c.x - a.x) / len) * 8 };
    const p = boxExit(from, c);
    const q = boxExit(boxes[j]!, a, 1);
    shapes.push(
      ...drawLink(
        id,
        [
          { x: p.x + off.x, y: p.y + off.y },
          { x: q.x + off.x, y: q.y + off.y },
        ],
        { role },
      ),
    );
  });

  // Named pointers.
  const label = (name: string, at: Pt, target: Box | Pt): Shape[] => {
    const role = roles.get(pointerId(name));
    const w = name.length * LABEL * CHAR;
    const labelBox = { x: at.x - w / 2 - 3, y: at.y - 13, w: w + 6, h: 18 };
    const tgt = 'w' in target ? boxExit(target, at, 1) : target;
    const from = boxExit(
      labelBox,
      'w' in target ? { x: target.x + target.w / 2, y: target.y + target.h / 2 } : target,
    );
    return [
      {
        kind: 'text',
        id: pointerId(name),
        x: at.x,
        y: at.y,
        text: name,
        size: LABEL,
        anchor: 'middle',
        mono: true,
        role,
      },
      {
        kind: 'arrow',
        id: `${pointerId(name)}:a`,
        x1: from.x,
        y1: from.y,
        x2: tgt.x,
        y2: tgt.y,
        role,
        z: 1.4,
      },
    ];
  };

  const nullSpot = g.nullAt;
  if (n === 0 || nullSpot) {
    const p = nullSpot!;
    shapes.push({
      kind: 'text',
      id: 'null:end',
      x: p.x,
      y: p.y + 5,
      text: 'null',
      size: 14,
      anchor: 'middle',
      mono: true,
      cls: 'label',
    });
  }
  const nullBox: Box | undefined = nullSpot && {
    x: nullSpot.x - 16,
    y: nullSpot.y - 11,
    w: 32,
    h: 20,
  };

  // head: always above the first node (or the null of an empty list).
  const headBox = n ? boxes[0]! : nullBox!;
  shapes.push(...label('head', { x: headBox.x + headBox.w / 2, y: headBox.y - 20 }, headBox));

  // slow and fast: below tail nodes, outside the ring for ring nodes; stacked when together.
  const where = (name: 'slow' | 'fast') => extra[name];
  const placed = new Map<string, string[]>();
  for (const name of ['slow', 'fast'] as const) {
    const i = where(name);
    if (i === undefined) continue;
    const key = i === null ? 'null' : String(i);
    placed.set(key, [...(placed.get(key) ?? []), name]);
  }
  for (const [key, names] of placed) {
    const i = key === 'null' ? null : Number(key);
    const target = i === null ? nullBox! : boxes[i]!;
    const ring = g.ring;
    const inRing = ring && i !== null && i >= ring.mu;
    if (!inRing) {
      // Side by side under the node; moved aside when the node's link goes straight down.
      const total =
        names.reduce((a, nm) => a + nm.length * LABEL * CHAR, 0) + 8 * (names.length - 1);
      const below = i === null ? undefined : g.centers[i + 1];
      const here = i === null ? undefined : g.centers[i];
      const down = below && here && Math.abs(below.x - here.x) < 1 && below.y > here.y;
      const shift = down ? (here.x + 40 + total < W ? 1 : -1) * (total / 2 + 10) : 0;
      let x = target.x + target.w / 2 - total / 2 + shift;
      for (const nm of names) {
        const w = nm.length * LABEL * CHAR;
        shapes.push(...label(nm, { x: x + w / 2, y: target.y + target.h + 30 }, target));
        x += w + 8;
      }
      continue;
    }
    const j = i! - ring.mu;
    let angle = -Math.PI / 2 + (2 * Math.PI * j) / ring.lambda;
    if (ring.lambda === 1) angle = Math.PI;
    else if (j === 0) angle += ring.mu ? -0.95 : 0.95;
    const dist = ring.r + NW / 2 + 34;
    const c = { x: ring.cx + dist * Math.cos(angle), y: ring.cy + dist * Math.sin(angle) };
    if (ring.lambda === 1) c.y = target.y + target.h / 2;
    names.forEach((nm, k) =>
      shapes.push(...label(nm, { x: c.x, y: c.y + 5 + (k - (names.length - 1) / 2) * 17 }, target)),
    );
  }

  return {
    shapes,
    bounds: { x: 0, y: 0, w: W, h: Math.max(g.height, 300) },
    label: sceneLabel(step),
  };
}

function sceneLabel(step: Step<FState, FExtra>): string {
  const { state, extra = {} } = step;
  const parts = [describe(state)];
  const at = (i: number | null | undefined) =>
    i === null ? 'null' : `index ${i} (${String(state.nodes[i!]!.value)})`;
  if (extra.slow !== undefined) parts.push(`slow → ${at(extra.slow)}.`);
  if (extra.fast !== undefined) parts.push(`fast → ${at(extra.fast)}.`);
  return parts.join(' ');
}
