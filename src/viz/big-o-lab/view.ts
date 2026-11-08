import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import {
  FN_LABEL,
  count,
  countShort,
  describe,
  ratioText,
  speedOf,
  timeText,
  type LabSettings,
  type LabState,
} from './model';

const X0 = 70;
const COL = 94;
const BAR = 56;
const TOP = 96;
const BASE = 340;
/** From one row of bars to the next, when a narrow stage wraps the chart. */
const ROW_PITCH = BASE + 46 - (TOP - 44);
/** Axis names left of the bars, and the captions under them. */
const AXIS_SIZE = 13;
const CAPTION_SIZE = 12.5;

/**
 * Draw a step: one row of bars, or on a narrow stage (a phone) the same bars wrapped into
 * rows of fewer, when that draws larger. Every row has the same scale, its own axis and its own
 * steps, time and growth captions. The number of curves only changes between operations, so
 * the choice holds for a run.
 */
export function view(
  step: Step<LabState, undefined>,
  settings: LabSettings,
  stage?: StageSize,
): Scene {
  const cols = Math.max(4, step.state.shown.length);
  const options = [cols];
  if (stage) for (let p = cols - 1; p >= 2; p--) options.push(p);
  const perRow = pickLayout(
    stage,
    options.map((p) => ({ p, bounds: chartBounds(cols, p) })),
  ).p;
  return draw(step, settings, perRow);
}

function chartBounds(cols: number, perRow: number) {
  const rows = Math.ceil(cols / perRow);
  return { x: 0, y: 0, w: X0 + perRow * COL + 16, h: BASE + 60 + (rows - 1) * ROW_PITCH };
}

function draw(step: Step<LabState, undefined>, settings: LabSettings, perRow: number): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const speed = speedOf(settings);
  const counts = state.shown.map((f) => count(f, state.n));
  const log = settings.scale === 'log';
  // Room for the curves shown (at least four), so a few bars are not lost in a wide chart.
  const cols = Math.max(4, state.shown.length);
  const rows = Math.ceil(cols / perRow);
  // Ids of a wrapped row's own axis and captions: the first row keeps the usual ones.
  const rowId = (id: string, r: number) => (r === 0 ? id : `${id}-${r}`);
  // Heights from logarithms, so 2ⁿ and n! never overflow.
  const lgMax = Math.max(-Infinity, ...counts.map((c) => c.lg));
  const lgPlus = (lg: number) => (lg === -Infinity ? 0 : lg < 12 ? Math.log10(10 ** lg + 1) : lg);
  const height = (lg: number) => {
    if (lg === -Infinity || lgMax === -Infinity) return 0;
    const f = log ? lgPlus(lg) / Math.max(lgPlus(lgMax), 1e-9) : 10 ** (lg - lgMax);
    return Math.max(2, f * (BASE - TOP));
  };

  shapes.push({
    kind: 'text',
    id: 'n-label',
    x: 16,
    y: 30,
    text: state.prev === null ? `n = ${state.n}` : `n = ${state.n} (was ${state.prev})`,
    size: 18,
    weight: 'bold',
    mono: true,
    role: roles.get('n-label'),
  });
  shapes.push({
    kind: 'text',
    id: 'scale-label',
    x: 16,
    y: 50,
    text: log
      ? 'bar height: log scale (each step up is ×10)'
      : 'bar height: linear, the tallest bar fills the chart',
    size: 13,
    cls: 'label',
  });
  for (let r = 0; r < rows; r++) {
    const dy = r * ROW_PITCH;
    const span = Math.min(perRow, cols - r * perRow);
    shapes.push({
      kind: 'arrow',
      id: rowId('axis', r),
      x1: X0 - 14,
      y1: BASE + dy,
      x2: X0 + (rows > 1 ? span : cols) * COL,
      y2: BASE + dy,
      head: 'none',
    });
    shapes.push({
      kind: 'text',
      id: rowId('axis-steps', r),
      x: X0 - 22,
      y: BASE + dy + 22,
      text: 'steps',
      size: AXIS_SIZE,
      anchor: 'end',
      cls: 'label',
    });
    shapes.push({
      kind: 'text',
      id: rowId('axis-time', r),
      x: X0 - 22,
      y: BASE + dy + 42,
      text: 'time',
      size: AXIS_SIZE,
      anchor: 'end',
      cls: 'label',
    });
    if (state.prev !== null) {
      shapes.push({
        kind: 'text',
        id: rowId('axis-ratio', r),
        x: X0 - 22,
        y: TOP + dy - 24,
        text: 'growth',
        size: AXIS_SIZE,
        anchor: 'end',
        cls: 'label',
      });
    }
  }
  if (state.shown.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: X0 + (Math.min(cols, perRow) * COL) / 2,
      y: (TOP + BASE) / 2,
      text: 'No curves shown: use More operations to show some.',
      size: 14,
      anchor: 'middle',
      cls: 'label',
    });
  }

  state.shown.forEach((f, k) => {
    const c = counts[k]!;
    const cx = X0 + (k % perRow) * COL + COL / 2;
    const base = BASE + Math.floor(k / perRow) * ROW_PITCH;
    const top = TOP + Math.floor(k / perRow) * ROW_PITCH;
    const h = height(c.lg);
    const id = `bar-${f}`;
    shapes.push({
      kind: 'rect',
      id,
      x: cx - BAR / 2,
      y: base - h,
      w: BAR,
      h,
      r: 3,
      cls: 'cell live',
      role: roles.get(id),
      enterFrom: { x: cx, y: base },
    });
    shapes.push({
      kind: 'text',
      id: `${id}-val`,
      x: cx,
      y: Math.min(base - h - 8, base - 8),
      text: countShort(c),
      size: 12.5,
      anchor: 'middle',
      mono: true,
      role: roles.get(id) === 'active' ? 'active' : undefined,
    });
    shapes.push({
      kind: 'text',
      id: `${id}-label`,
      x: cx,
      y: base + 22,
      text: FN_LABEL[f],
      size: 15,
      anchor: 'middle',
      weight: 'bold',
    });
    shapes.push({
      kind: 'text',
      id: `${id}-time`,
      x: cx,
      y: base + 42,
      text: timeText(c, speed),
      size: CAPTION_SIZE,
      anchor: 'middle',
      cls: 'label',
    });
    if (state.prev !== null) {
      shapes.push({
        kind: 'text',
        id: `${id}-ratio`,
        x: cx,
        y: top - 24,
        text: ratioText(f, state.prev, state.n),
        size: 14,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(`${id}-ratio`),
      });
    }
  });

  return { shapes, bounds: chartBounds(cols, perRow), label: describe(state, settings) };
}
