import type { MarkRole, StageSize, Step } from '../../engine/types';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { pickLayout, translate } from '../_stage/arrange';
import {
  BITS,
  amortized,
  avgText,
  bankOf,
  binary,
  chargeOf,
  describe,
  phiFormula,
  phiOf,
  phiWorked,
  sum,
  valueOf,
  type AmExtra,
  type AmSettings,
  type AmState,
} from './model';

const M = 14;
/** Room above the drawing for the stage's zoom buttons (about 42 px on a phone). */
const TOP = 56;
/** Left of the chart, for its scale labels. */
const GUTTER = 30;
const GAP = 18;
const WIDE = 36;

// The structure: cells or bits, coin stacks over them, the charge waiting above.
const PER_ROW = 16;
const CW = 26;
const CH = 30;
const BW = 46;
const BH = 46;
const HAND = 30;
const STACK = 40;
const ROW = STACK + CH + 8;
const COIN_R = 6;
const COIN_PITCH = 8;
const MAX_STACK = 4;

// The chart: actual cost per operation above, the running readout (average, bank, Φ) below.
const CHART_W = PER_ROW * CW;
const H1 = 110;
const H2 = 78;

interface Block {
  shapes: Shape[];
  w: number;
  h: number;
}

type Roles = ReadonlyMap<string, MarkRole>;

const coin = (uid: number, x: number, y: number, role?: MarkRole): Shape => ({
  kind: 'circle',
  id: `coin-${uid}`,
  x,
  y,
  r: COIN_R,
  cls: 'live',
  role: role ?? 'g5',
});

// ----- The structure -----

interface Place {
  /** Center of position p's top edge, where its coin stack starts. */
  top(p: number): { x: number; y: number };
}

/** Coin stacks, the waiting charge, and the coins being spent, over any row of positions. */
function coinShapes(state: AmState, extra: AmExtra, place: Place, roles: Roles, w: number) {
  const shapes: Shape[] = [];
  state.coins.forEach((pile, p) => {
    const t = place.top(p);
    pile.slice(0, MAX_STACK).forEach((uid, k) => {
      shapes.push(coin(uid, t.x, t.y - 8 - k * COIN_PITCH, roles.get(`coin-${uid}`)));
    });
    if (pile.length > MAX_STACK) {
      shapes.push({
        kind: 'text',
        id: `more-${p}`,
        x: t.x + COIN_R + 3,
        y: t.y - 8 - (MAX_STACK - 1) * COIN_PITCH + 4,
        text: `+${pile.length - MAX_STACK}`,
        size: 11,
        cls: 'label',
        mono: true,
      });
    }
  });
  const hand = extra.hand ?? [];
  if (hand.length && extra.target !== undefined) {
    const cx = place.top(extra.target).x;
    const span = (hand.length - 1) * 15;
    const x0 = Math.max(COIN_R + 2, Math.min(w - COIN_R - 2 - span, cx - span / 2));
    hand.forEach((uid, k) => shapes.push(coin(uid, x0 + k * 15, 14, roles.get(`coin-${uid}`))));
  }
  for (const s of extra.spent ?? []) {
    const t = place.top(s.at);
    shapes.push(coin(s.uid, t.x, t.y - 2, roles.get(`coin-${s.uid}`) ?? 'remove'));
  }
  return shapes;
}

/** The readout under the structure for the method: the average, the bank, or Φ. */
function methodText(state: AmState, settings: AmSettings): string {
  const n = state.costs.length;
  const total = sum(state.costs);
  if (settings.method === 'aggregate')
    return n ? `total = ${total}, ${avgText(total, n)} per operation` : 'total = 0';
  if (settings.method === 'accounting') {
    const bank = bankOf(state);
    return `bank = ${bank}${bank < 0 ? ' (short)' : ''}, charge = ${chargeOf(settings)}`;
  }
  if (state.cur) {
    const word = settings.structure === 'array' ? 'append' : 'increment';
    return `Φ = ${state.phis.at(-1) ?? 0} before this ${word}`;
  }
  return settings.structure === 'counter'
    ? `Φ = number of 1 bits = ${phiOf(state, settings)}`
    : `Φ = ${phiFormula(settings)} = ${phiWorked(state, settings)}`;
}

function arrayBlock(state: AmState, settings: AmSettings, extra: AmExtra, roles: Roles): Block {
  const shapes: Shape[] = [];
  const rows = Math.max(1, Math.ceil(Math.max(state.room, state.capacity) / PER_ROW));
  const cell = (i: number) => ({
    x: (i % PER_ROW) * CW,
    y: HAND + Math.floor(i / PER_ROW) * ROW + STACK,
  });
  const fresh = extra.grownFrom;
  for (let i = 0; i < state.capacity; i++) {
    const c = cell(i);
    const id = `cell-${i}`;
    const isNew = fresh !== undefined && i >= fresh;
    shapes.push({
      kind: 'rect',
      id,
      x: c.x,
      y: c.y,
      w: CW,
      h: CH,
      role: roles.get(id),
      cls: i < state.size ? 'cell live' : isNew ? 'cell ghost' : 'cell',
    });
    if (i < state.size) {
      shapes.push({
        kind: 'text',
        id: `v${i + 1}`,
        x: c.x + CW / 2,
        y: c.y + CH / 2 + 5,
        text: String(i + 1),
        size: 13,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(`v${i + 1}`),
      });
    }
  }
  const place: Place = {
    top: (p) => {
      const c = cell(p);
      return { x: c.x + CW / 2, y: c.y };
    },
  };
  shapes.push(...coinShapes(state, extra, place, roles, CHART_W));
  const y = HAND + rows * ROW + 14;
  shapes.push(
    readout('rd-size', 0, y, `size = ${state.size}`, roles),
    readout('rd-cap', 120, y, `capacity = ${state.capacity}`, roles),
    readout('rd-method', 0, y + 22, methodText(state, settings), roles),
  );
  return { shapes, w: CHART_W, h: y + 30 };
}

function counterBlock(state: AmState, settings: AmSettings, extra: AmExtra, roles: Roles): Block {
  const shapes: Shape[] = [];
  const y = HAND + STACK;
  const x = (p: number) => (BITS - 1 - p) * BW;
  for (let p = 0; p < BITS; p++) {
    const id = `bit-${p}`;
    const one = state.bits[p] === 1;
    shapes.push({
      kind: 'rect',
      id,
      x: x(p),
      y,
      w: BW,
      h: BH,
      role: roles.get(id),
      cls: one ? 'cell live' : 'cell',
    });
    shapes.push({
      kind: 'text',
      id: `b-${p}`,
      x: x(p) + BW / 2,
      y: y + BH / 2 + 8,
      text: String(state.bits[p]),
      size: 22,
      anchor: 'middle',
      weight: one ? 'bold' : 'normal',
      mono: true,
      role: roles.get(`b-${p}`) ?? (one ? undefined : 'stale'),
    });
    shapes.push({
      kind: 'text',
      id: `bidx-${p}`,
      x: x(p) + BW / 2,
      y: y + BH + 16,
      text: String(2 ** p),
      size: 12,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
  }
  const place: Place = { top: (p) => ({ x: x(p) + BW / 2, y }) };
  const w = BITS * BW;
  shapes.push(...coinShapes(state, extra, place, roles, w));
  const ry = y + BH + 42;
  shapes.push(
    readout('rd-value', 0, ry, `counter = ${binary(state.bits)} = ${valueOf(state.bits)}`, roles),
    readout('rd-method', 0, ry + 22, methodText(state, settings), roles),
  );
  return { shapes, w, h: ry + 30 };
}

function readout(id: string, x: number, y: number, text: string, roles: Roles): Shape {
  return { kind: 'text', id, x, y, text, size: 15, mono: true, role: roles.get(id) };
}

// ----- The chart -----

/** A round top for a scale: 4, 8, then multiples of 8. */
const nice = (v: number) => (v <= 4 ? 4 : v <= 8 ? 8 : Math.ceil(v / 8) * 8);

/** Running average after each operation. */
const averages = (costs: readonly number[]) => {
  let t = 0;
  return costs.map((c, j) => (t += c) / (j + 1));
};

/** Where the average settles for this structure and rule: the textbook bound. */
function bound(settings: AmSettings): number {
  if (settings.structure === 'counter') return 2;
  return settings.growth === '1.5' ? 4 : 3;
}

function chartBlock(state: AmState, settings: AmSettings, roles: Roles): Block {
  const shapes: Shape[] = [];
  const array = settings.structure === 'array';
  const word = array ? 'append' : 'increment';
  const plan = state.plan;
  const n = state.costs.length;
  const cols = Math.max(plan.costs.length, n + (state.cur ? 1 : 0)) <= 16 ? 16 : 32;
  const pitch = CHART_W / cols;
  const barW = Math.max(4, Math.round(pitch * 0.7));
  const colX = (j: number) => GUTTER + (j - 1) * pitch + pitch / 2;
  const acct = settings.method === 'accounting';
  const pot = settings.method === 'potential';
  const c = chargeOf(settings);

  // Lane 1: the actual cost of each operation.
  const top1 = 22;
  const base1 = top1 + H1;
  const am = pot ? amortized(plan) : [];
  const max1 = nice(Math.max(...plan.costs, acct ? c : 0, ...am, 1));
  const y1 = (v: number) => base1 - (Math.max(0, Math.min(v, max1)) / max1) * H1;
  const title1 = pot ? `actual (bars) and amortized (ticks) per ${word}` : `actual cost of each ${word}`;
  shapes.push(label('l1-title', GUTTER, 12, title1));
  shapes.push(scale('l1-max', top1 + 4, String(max1)), scale('l1-zero', base1 + 4, '0'));
  shapes.push(line('l1-axis', base1, false));
  const costs = state.cur ? [...state.costs, state.cur.cost] : state.costs;
  costs.forEach((v, k) => {
    const j = k + 1;
    const id = `bar-${j}`;
    shapes.push({
      kind: 'rect',
      id,
      x: colX(j) - barW / 2,
      y: y1(v),
      w: barW,
      h: base1 - y1(v),
      r: 2,
      cls: 'live',
      role: roles.get(id),
    });
  });
  if (acct) {
    shapes.push({ ...line('ref-1', y1(c), true), role: 'found' });
    shapes.push({
      kind: 'text',
      id: 'ref-1-label',
      x: GUTTER + CHART_W,
      y: y1(c) - 5,
      text: `charge ${c}`,
      size: 12,
      anchor: 'end',
      cls: 'label',
      mono: true,
    });
  }
  if (pot) {
    amortized(state).forEach((v, k) => {
      const j = k + 1;
      shapes.push({
        kind: 'rect',
        id: `am-${j}`,
        x: colX(j) - barW / 2 - 2,
        y: y1(v) - 2,
        w: barW + 4,
        h: 4,
        r: 1,
        role: v < 0 || state.phis[k]! < 0 ? 'error' : 'found',
      });
    });
  }

  // Lane 2: the running average, the bank, or Φ, after each operation.
  const top2 = base1 + 40;
  const values = acct ? state.banks : pot ? state.phis : averages(state.costs);
  const planned = acct ? plan.banks : pot ? plan.phis : averages(plan.costs);
  const ref = settings.method === 'aggregate' ? bound(settings) : 0;
  const hi = Math.max(4, ref, ...planned.map((v) => Math.ceil(v)));
  const lo = Math.min(0, ...planned.map((v) => Math.floor(v)));
  const unit = H2 / (hi - lo);
  const zero = top2 + hi * unit;
  const y2 = (v: number) => zero - v * unit;
  const title2 =
    settings.method === 'aggregate'
      ? `average cost so far`
      : acct
        ? `bank after each ${word}`
        : `Φ after each ${word}`;
  shapes.push(label('l2-title', GUTTER, top2 - 10, title2));
  shapes.push(scale('l2-max', top2 + 4, String(hi)), scale('l2-zero', zero + 4, '0'));
  if (lo < 0) shapes.push(scale('l2-min', top2 + H2 + 4, String(lo)));
  shapes.push(line('l2-axis', zero, false));
  values.forEach((v, k) => {
    const j = k + 1;
    const id = `l2-${j}`;
    const y = y2(v);
    shapes.push({
      kind: 'rect',
      id,
      x: colX(j) - barW / 2,
      y: Math.min(y, zero),
      w: barW,
      h: Math.abs(zero - y),
      r: 2,
      cls: 'live',
      role: roles.get(id) ?? (v < 0 ? 'error' : undefined),
    });
  });
  if (ref) {
    shapes.push({ ...line('ref-2', y2(ref), true), role: 'found' });
    shapes.push({
      kind: 'text',
      id: 'ref-2-label',
      x: GUTTER + CHART_W,
      y: y2(ref) - 5,
      text: `${ref}`,
      size: 12,
      anchor: 'end',
      cls: 'label',
      mono: true,
    });
  }

  // Operation numbers under the chart.
  const bottom = top2 + H2;
  const every = cols === 16 ? 4 : 8;
  for (const j of [1, ...Array.from({ length: cols / every }, (_, k) => (k + 1) * every)]) {
    shapes.push({
      kind: 'text',
      id: `x-${j}`,
      x: colX(j),
      y: bottom + 16,
      text: String(j),
      size: 11,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
  }
  return { shapes, w: GUTTER + CHART_W, h: bottom + 22 };
}

function label(id: string, x: number, y: number, text: string): Shape {
  return { kind: 'text', id, x, y, text, size: 13, cls: 'label' };
}

function scale(id: string, y: number, text: string): Shape {
  return {
    kind: 'text',
    id,
    x: GUTTER - 6,
    y,
    text,
    size: 11,
    anchor: 'end',
    cls: 'index',
    mono: true,
  };
}

function line(id: string, y: number, dashed: boolean): Shape {
  return {
    kind: 'arrow',
    id,
    x1: GUTTER,
    y1: y,
    x2: GUTTER + CHART_W,
    y2: y,
    head: 'none',
    dashed,
  };
}

// ----- Putting the parts together -----

interface Placed {
  shapes: Shape[];
  bounds: Bounds;
}

/** `under`: the structure on top of the chart (a phone). `beside`: side by side (a laptop). */
function arrange(main: Block, chart: Block, beside: boolean): Placed {
  if (beside) {
    const cx = M + main.w + WIDE;
    return {
      shapes: [...translate(main.shapes, M, TOP), ...translate(chart.shapes, cx, TOP)],
      bounds: { x: 0, y: 0, w: cx + chart.w + M, h: TOP + Math.max(main.h, chart.h) + M },
    };
  }
  const cy = TOP + main.h + GAP;
  return {
    shapes: [...translate(main.shapes, M + GUTTER, TOP), ...translate(chart.shapes, M, cy)],
    bounds: { x: 0, y: 0, w: M + Math.max(GUTTER + main.w, chart.w) + M, h: cy + chart.h + M },
  };
}

/**
 * Draw a step: the array's cells or the counter's bits with their coins, and the cost chart.
 * Every size here holds for a whole run (the array's room and the chart's columns and scales
 * come from the run's plan), so the arrangement picked for the stage holds for the run too.
 */
export function view(
  step: Step<AmState, AmExtra>,
  settings: AmSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const main =
    settings.structure === 'array'
      ? arrayBlock(state, settings, extra, roles)
      : counterBlock(state, settings, extra, roles);
  const chart = chartBlock(state, settings, roles);
  const options = stage ? [arrange(main, chart, false), arrange(main, chart, true)] : [];
  const placed = stage ? pickLayout(stage, options) : arrange(main, chart, false);
  return { ...placed, label: describe(state, settings) };
}
