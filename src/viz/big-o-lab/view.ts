import type { MarkRole, Step } from '../../engine/types';
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

export function view(step: Step<LabState, undefined>, settings: LabSettings): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const speed = speedOf(settings);
  const counts = state.shown.map((f) => count(f, state.n));
  const log = settings.scale === 'log';
  // Room for the curves shown (at least four), so a few bars are not lost in a wide chart.
  const cols = Math.max(4, state.shown.length);
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
    size: 12.5,
    cls: 'label',
  });
  shapes.push({
    kind: 'arrow',
    id: 'axis',
    x1: X0 - 14,
    y1: BASE,
    x2: X0 + cols * COL,
    y2: BASE,
    head: 'none',
  });
  shapes.push({
    kind: 'text',
    id: 'axis-steps',
    x: X0 - 22,
    y: BASE + 22,
    text: 'steps',
    size: 12,
    anchor: 'end',
    cls: 'label',
  });
  shapes.push({
    kind: 'text',
    id: 'axis-time',
    x: X0 - 22,
    y: BASE + 42,
    text: 'time',
    size: 12,
    anchor: 'end',
    cls: 'label',
  });
  if (state.prev !== null) {
    shapes.push({
      kind: 'text',
      id: 'axis-ratio',
      x: X0 - 22,
      y: TOP - 24,
      text: 'growth',
      size: 12,
      anchor: 'end',
      cls: 'label',
    });
  }
  if (state.shown.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: X0 + (cols * COL) / 2,
      y: (TOP + BASE) / 2,
      text: 'No curves shown: use More operations to show some.',
      size: 14,
      anchor: 'middle',
      cls: 'label',
    });
  }

  state.shown.forEach((f, k) => {
    const c = counts[k]!;
    const cx = X0 + k * COL + COL / 2;
    const h = height(c.lg);
    const id = `bar-${f}`;
    shapes.push({
      kind: 'rect',
      id,
      x: cx - BAR / 2,
      y: BASE - h,
      w: BAR,
      h,
      r: 3,
      cls: 'cell live',
      role: roles.get(id),
      enterFrom: { x: cx, y: BASE },
    });
    shapes.push({
      kind: 'text',
      id: `${id}-val`,
      x: cx,
      y: Math.min(BASE - h - 8, BASE - 8),
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
      y: BASE + 22,
      text: FN_LABEL[f],
      size: 15,
      anchor: 'middle',
      weight: 'bold',
    });
    shapes.push({
      kind: 'text',
      id: `${id}-time`,
      x: cx,
      y: BASE + 42,
      text: timeText(c, speed),
      size: 12,
      anchor: 'middle',
      cls: 'label',
    });
    if (state.prev !== null) {
      shapes.push({
        kind: 'text',
        id: `${id}-ratio`,
        x: cx,
        y: TOP - 24,
        text: ratioText(f, state.prev, state.n),
        size: 14,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(`${id}-ratio`),
      });
    }
  });

  return {
    shapes,
    bounds: { x: 0, y: 0, w: X0 + cols * COL + 16, h: BASE + 60 },
    label: describe(state, settings),
  };
}
