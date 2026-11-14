import type { MarkRole, StageSize, Step } from '../../engine/types';
import { lockId, panelId } from '../../layouts/lanes';
import type { RectShape, Scene, Shape } from '../../render/scene';
import { deadlockCycle } from '../_threads/deadlock';
import { describeRows, rowsScene } from '../_threads3/page';
import {
  countOf,
  eating,
  fork,
  holders,
  spec,
  type DiningSettings,
  type DiningState,
} from './model';

/** Shape ids of the table: a circle per philosopher, the wait arrows. Forks use lockId. */
export const seatId = (t: number) => `seat-${t}`;
export const waitId = (t: number) => `seat-${t}-wait`;

const R = 15;
const RING = 44;
const FORKS = 26;

function caption(s: DiningState, n: number): string {
  const e = eating(s.m, n);
  if (e.length) return `${e.map((t) => `P${t + 1}`).join(' and ')} ${e.length > 1 ? 'eat' : 'eats'}`;
  if (deadlockCycle(s.m)) return 'deadlock';
  if (s.m.threads.every((x) => x.status === 'done')) return 'everyone ate';
  return 'nobody eats';
}

/** The table drawn in its panel's frame: philosophers round it, a fork between each pair. */
function table(
  s: DiningState,
  n: number,
  frame: RectShape,
  roles: ReadonlyMap<string, MarkRole>,
): Shape[] {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + 102;
  const angle = (k: number) => ((-90 + (k * 360) / n) * Math.PI) / 180;
  const seat = (t: number) => ({
    x: cx + RING * Math.cos(angle(t)),
    y: cy + RING * Math.sin(angle(t)),
  });
  // Fork i lies between P(i-1) and Pi: Pi's left fork is fi, its right one f(i+1).
  const spot = (i: number) => ({
    x: cx + FORKS * Math.cos(angle(i - 0.5)),
    y: cy + FORKS * Math.sin(angle(i - 0.5)),
  });
  const h = holders(s.m, n);
  const cycle = deadlockCycle(s.m) ?? [];
  const eats = eating(s.m, n);
  const shapes: Shape[] = [];
  const forkAt = Array.from({ length: n }, (_, i) => {
    const at = spot(i);
    const by = h[i];
    if (by === null || by === undefined) return at;
    const q = seat(by);
    return { x: at.x + (q.x - at.x) * 0.42, y: at.y + (q.y - at.y) * 0.42 };
  });
  for (let t = 0; t < n; t++) {
    const on = s.m.threads[t]!.on;
    if (s.m.threads[t]!.status !== 'blocked' || on?.kind !== 'lock') continue;
    const f = Number(on.name.slice(1)) - 1;
    const p = seat(t);
    const q = forkAt[f]!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    shapes.push({
      kind: 'arrow',
      id: waitId(t),
      x1: p.x + (dx / len) * R,
      y1: p.y + (dy / len) * R,
      x2: q.x - (dx / len) * 11,
      y2: q.y - (dy / len) * 11,
      dashed: true,
      z: 3,
      role: roles.get(waitId(t)) ?? (cycle.includes(t) ? 'error' : 'compare'),
    });
  }
  for (let i = 0; i < n; i++) {
    const at = forkAt[i]!;
    const id = lockId(fork(i));
    shapes.push(
      {
        kind: 'rect',
        id,
        x: at.x - 13,
        y: at.y - 9,
        w: 26,
        h: 18,
        r: 4,
        cls: h[i] === null ? 'ghost' : 'live',
        z: 2,
        role: roles.get(id),
      },
      {
        kind: 'text',
        id: `${id}-text`,
        x: at.x,
        y: at.y + 4.5,
        text: fork(i),
        size: 13,
        anchor: 'middle',
        mono: true,
        z: 4,
      },
    );
  }
  for (let t = 0; t < n; t++) {
    const p = seat(t);
    const th = s.m.threads[t]!;
    const id = seatId(t);
    shapes.push(
      {
        kind: 'circle',
        id,
        x: p.x,
        y: p.y,
        r: R,
        cls: 'live',
        role:
          roles.get(id) ??
          (cycle.includes(t)
            ? 'error'
            : eats.includes(t)
              ? 'found'
              : th.status === 'done'
                ? 'done'
                : undefined),
      },
      {
        kind: 'text',
        id: `${id}-text`,
        x: p.x,
        y: p.y + 4.5,
        text: `P${t + 1}`,
        size: 13,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
      },
    );
  }
  return shapes;
}

export function describe(s: DiningState, settings: DiningSettings): string {
  const n = countOf(settings);
  const h = holders(s.m, n);
  const forks = h
    .map((x, i) => `${fork(i)} ${x === null ? 'on the table' : `held by P${x + 1}`}`)
    .join(', ');
  return `${describeRows(spec, s, settings)} Forks: ${forks}. ${caption(s, n)}.`;
}

export function view(
  step: Step<DiningState>,
  settings: DiningSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const n = countOf(settings);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  return rowsScene(spec, step, settings, stage, {
    panels: [
      {
        id: 'table',
        title: 'the table',
        rows: [{ key: 'cap', text: caption(s, n) }],
        room: 7,
        chars: 17,
      },
    ],
    decorate: (shapes) => {
      const frame = shapes.find((x) => x.id === panelId('table')) as RectShape;
      return [...shapes, ...table(s, n, frame, roles)];
    },
    label: describe(s, settings),
  });
}
