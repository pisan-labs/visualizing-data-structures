import type { MarkRole, StageSize, Step } from '../../engine/types';
import { panelId } from '../../layouts/lanes';
import type { RectShape, Scene, Shape } from '../../render/scene';
import { waitFor } from '../_threads/deadlock';
import { describeThreads, threadsScene } from '../_threads2/page';
import {
  cycleText,
  edgeId,
  nodeId,
  program,
  spec,
  type DeadlockSettings,
  type DeadlockState,
} from './model';

const R = 13;

/** The caption over the graph: the search's result, or how many threads wait. */
function caption(s: DeadlockState): string {
  if (s.search?.cycle) return `cycle ${cycleText(s.search.cycle)}`;
  if (s.search) return 'searching';
  const n = waitFor(s.m).edges.length;
  return n === 0 ? 'no edges' : `${n} ${n === 1 ? 'edge' : 'edges'}`;
}

/** Where each thread's circle goes inside the panel's frame. */
function positions(frame: RectShape, k: number): { x: number; y: number }[] {
  const top = frame.y + 50 + R;
  const bottom = frame.y + frame.h - 8 - R;
  const mid = (top + bottom) / 2;
  if (k === 2)
    return [
      { x: frame.x + frame.w * 0.28, y: mid },
      { x: frame.x + frame.w * 0.72, y: mid },
    ];
  return [
    { x: frame.x + frame.w * 0.5, y: top },
    { x: frame.x + frame.w * 0.22, y: bottom },
    { x: frame.x + frame.w * 0.78, y: bottom },
  ];
}

/** The wait-for graph drawn in the frame of its panel: a circle per thread, an arrow per edge. */
function graph(s: DeadlockState, frame: RectShape, roles: ReadonlyMap<string, MarkRole>): Shape[] {
  const k = s.m.threads.length;
  const at = positions(frame, k);
  const edges = waitFor(s.m).edges;
  const shapes: Shape[] = [];
  const colorRole = (t: number): MarkRole | undefined => {
    if (s.search?.cycle?.includes(t)) return 'error';
    const c = s.search?.colors[t];
    return c === 'gray' ? 'active' : c === 'black' ? 'done' : undefined;
  };
  for (const [a, b, lock] of edges) {
    const p = at[a]!;
    const q = at[b]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Two edges between the same pair bend apart; a single one is straight.
    const both = edges.some(([c, d]) => c === b && d === a);
    const bend = both ? 16 : 0;
    const nx = -uy * bend;
    const ny = ux * bend;
    const id = edgeId(a, b);
    shapes.push({
      kind: 'arrow',
      id,
      x1: p.x + ux * R + nx * 0.4,
      y1: p.y + uy * R + ny * 0.4,
      x2: q.x - ux * R + nx * 0.4,
      y2: q.y - uy * R + ny * 0.4,
      via: both ? { x: (p.x + q.x) / 2 + nx * 1.6, y: (p.y + q.y) / 2 + ny * 1.6 } : undefined,
      role: roles.get(id),
    });
    shapes.push({
      kind: 'text',
      id: `${id}-lock`,
      x: (p.x + q.x) / 2 + (both ? nx * 1.2 : -uy * 11),
      y: (p.y + q.y) / 2 + (both ? ny * 1.2 : ux * 11) + 4.5,
      text: lock,
      size: 13,
      anchor: 'middle',
      mono: true,
      cls: 'label',
    });
  }
  at.forEach((pt, t) => {
    const id = nodeId(t);
    shapes.push({
      kind: 'circle',
      id,
      x: pt.x,
      y: pt.y,
      r: R,
      cls: 'live',
      role: roles.get(id) ?? colorRole(t),
    });
    shapes.push({
      kind: 'text',
      id: `${id}-text`,
      x: pt.x,
      y: pt.y + 4.5,
      text: `T${t + 1}`,
      size: 13,
      anchor: 'middle',
      mono: true,
      weight: 'bold',
    });
  });
  return shapes;
}

export function describe(s: DeadlockState, settings: DeadlockSettings): string {
  const edges = waitFor(s.m).edges;
  const g = edges.length
    ? ` Wait-for graph: ${edges.map(([a, b, l]) => `T${a + 1} waits for T${b + 1} (lock ${l})`).join(', ')}.`
    : ' Wait-for graph: no edges.';
  const c = s.search?.cycle ? ` Cycle found: ${cycleText(s.search.cycle)}.` : '';
  return `${describeThreads(spec, s, settings)}${g}${c}`;
}

export function view(
  step: Step<DeadlockState>,
  settings: DeadlockSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const k = program(settings).threads.length;
  return threadsScene(spec, step, settings, stage, {
    panels: [
      {
        id: 'wfg',
        title: 'wait-for graph',
        rows: [{ key: 'cap', text: caption(s) }],
        room: k === 2 ? 4 : 5,
        chars: k === 2 ? 18 : 20,
      },
    ],
    decorate: (shapes) => {
      const frame = shapes.find((x) => x.id === panelId('wfg')) as RectShape;
      return [...shapes, ...graph(s, frame, roles)];
    },
    label: describe(s, settings),
  });
}
