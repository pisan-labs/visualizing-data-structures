import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import {
  drawStacks,
  fmt,
  opLabel,
  stacksGeometry,
  valueAt,
  type Orient,
  type StacksGeometry,
} from '../_design1/kit';
import {
  BOUND,
  describe,
  MAX_SIZE,
  vid,
  type TQExtra,
  type TQSettings,
  type TQState,
} from './model';

/**
 * The two stacks, in and then out, and a bar chart of what each operation cost in stack
 * operations, the newest on the right, with a dashed line at 3: the most the pattern averages over
 * any run of operations. The chart sits beside the stacks on a wide stage and under them on a
 * tall one. Its scale is fixed for each design, so a spike looks as big as it is.
 */

/** Bars shown at once: the latest operations. */
export const BARS = 12;
const PITCH = 26;
const BAR_W = 18;
/** Left of the bars, for the "3" on the dashed line. */
const LEFT = 30;
const CHART_W = LEFT + BARS * PITCH + 8;
const TITLE = 26;
/** Under the axis, for each bar's number. */
const NUMBERS = 22;
const GAP = 16;

/** The tallest bar each design can need: a dequeue or a peek with every value moved. */
const maxCost = (naive: boolean) => (naive ? 4 * MAX_SIZE : 2 * MAX_SIZE + 1);

interface Arrangement {
  g: StacksGeometry;
  /** Where the stacks are moved to. */
  stacks: { dx: number; dy: number };
  /** The chart's top left corner and the height of its bars' room. */
  chart: { x: number; y: number; barH: number };
  bounds: Bounds;
}

function arrange(orient: Orient, beside: boolean): Arrangement {
  const g = stacksGeometry(orient, { count: 2, cap: MAX_SIZE, head: 46, minW: 280 });
  if (beside) {
    const barH = g.bounds.h - 46 - TITLE - NUMBERS;
    return {
      g,
      stacks: { dx: 0, dy: 0 },
      chart: { x: g.bounds.w + GAP, y: 46, barH },
      bounds: { x: 0, y: 0, w: g.bounds.w + GAP + CHART_W + 8, h: g.bounds.h },
    };
  }
  const barH = 110;
  const w = Math.max(g.bounds.w, CHART_W + 16);
  return {
    g,
    stacks: { dx: (w - g.bounds.w) / 2, dy: 0 },
    chart: { x: (w - CHART_W) / 2, y: g.bounds.h + GAP, barH },
    bounds: { x: 0, y: 0, w, h: g.bounds.h + GAP + TITLE + barH + NUMBERS + 8 },
  };
}

const ARRANGEMENTS = [
  arrange('vertical', false),
  arrange('vertical', true),
  arrange('horizontal', false),
];

export function view(
  step: Step<TQState, TQExtra>,
  settings: TQSettings,
  stage?: StageSize,
): Scene {
  const { state, extra } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const a = pickLayout(stage, ARRANGEMENTS);
  const g = a.g;
  const values = (items: TQState['inn'], s: number) =>
    items.map((it, i) => ({
      id: vid(it.uid),
      text: fmt(it.value),
      // A new value drops in from above in.
      ...(s === 0
        ? { enterFrom: { x: valueAt(g.cell(0, i)).x, y: g.orient === 'vertical' ? 4 : 30 } }
        : {}),
    }));
  const shapes: Shape[] = translate(
    drawStacks(
      g,
      [
        { key: 'in', name: 'in', values: values(state.inn, 0) },
        { key: 'out', name: 'out', values: values(state.out, 1) },
      ],
      roles,
    ),
    a.stacks.dx,
    a.stacks.dy,
  );

  const costs = extra?.current === undefined ? state.history : [...state.history, extra.current];
  shapes.push(...chart(a.chart, costs, extra?.current !== undefined, approachOf(settings) === 'naive'));

  if (extra?.label) shapes.push(opLabel(extra.label, roles.get('op-label')));
  return { shapes, bounds: a.bounds, label: label(state, costs) };
}

function chart(
  at: { x: number; y: number; barH: number },
  costs: number[],
  running: boolean,
  naive: boolean,
): Shape[] {
  const shapes: Shape[] = [];
  const x0 = at.x + LEFT;
  const base = at.y + TITLE + at.barH;
  const unit = at.barH / maxCost(naive);
  shapes.push(
    {
      kind: 'text',
      id: 'chart-title',
      x: at.x + 4,
      y: at.y + 14,
      text: 'pushes + pops per operation (dashed: 3)',
      size: 13,
      cls: 'label',
    },
    {
      kind: 'arrow',
      id: 'chart-axis',
      x1: x0 - 4,
      y1: base,
      x2: x0 + BARS * PITCH,
      y2: base,
      head: 'none',
      opacity: 0.7,
    },
  );
  const lineY = base - BOUND * unit;
  shapes.push(
    {
      kind: 'arrow',
      id: 'chart-bound',
      x1: x0 - 4,
      y1: lineY,
      x2: x0 + BARS * PITCH,
      y2: lineY,
      head: 'none',
      dashed: true,
      opacity: 0.8,
    },
    {
      kind: 'text',
      id: 'chart-bound-t',
      x: x0 - 9,
      y: lineY + 4,
      text: String(BOUND),
      size: 12,
      anchor: 'end',
      cls: 'label',
      mono: true,
    },
  );
  const first = Math.max(0, costs.length - BARS);
  costs.slice(first).forEach((cost, j) => {
    const k = first + j;
    const live = running && k === costs.length - 1;
    const h = Math.max(1.5, cost * unit);
    const x = x0 + j * PITCH + (PITCH - BAR_W) / 2;
    // Bars over the line are the spikes the cheap operations pay for.
    const role: MarkRole | undefined = live ? 'active' : cost > BOUND ? 'compare' : undefined;
    shapes.push(
      { kind: 'rect', id: `bar-${k}`, x, y: base - h, w: BAR_W, h, r: 2, cls: 'live', role },
      {
        kind: 'text',
        id: `bar-${k}-t`,
        x: x + BAR_W / 2,
        y: base + 16,
        text: String(cost),
        size: 12,
        anchor: 'middle',
        mono: true,
        role: live ? 'active' : undefined,
      },
    );
  });
  return shapes;
}

function label(state: TQState, costs: number[]): string {
  const recent = costs.slice(-BARS);
  return `${describe(state)}${
    recent.length ? ` Cost of the latest operations: ${recent.join(', ')}.` : ''
  }`;
}
