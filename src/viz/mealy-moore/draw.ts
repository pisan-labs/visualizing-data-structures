/**
 * Drawing machines with output, on top of the shared state diagram (drawAutomaton) and tape
 * (drawTape). Local to this page; see the report for moving it into src/layouts.
 *
 *   drawMachine(m, layout, opts)  a Mealy machine's arrows labeled c/o ("0/1,1/0"); a Moore
 *                                 machine's states with the name over a rule and the output
 *                                 under it, as digital logic draws them
 *   drawOutputTape(out, o)        a captioned row of output cells under the input tape
 *
 * Shape ids are drawAutomaton's, plus `${prefix}s-q-o` (a Moore state's output, see outputId)
 * and `${prefix}s-q-d` (the rule between name and output); output tapes are `out-mealy-<i>`
 * and `out-moore-<i>` with captions `out-mealy-cap` and `out-moore-cap`.
 */
import type { MarkRole } from '../../engine/types';
import {
  STATE_R,
  drawAutomaton,
  stateId,
  type DrawOptions,
  type StateLayout,
} from '../../layouts/automaton';
import { CELL_H, drawTape } from '../../layouts/tape';
import type { Bounds, CircleShape, Shape } from '../../render/scene';
import type { Automaton, Move } from '../_automata/automaton';
import { kindName, writes, type Kind, type Machine } from './machine';
import { outputId } from './model';

/** The automaton drawAutomaton draws: a Mealy move's "symbol" is its label, c/o. */
export function drawnFa(m: Machine): Automaton {
  if (m.kind === 'moore') return m.fa;
  return {
    ...m.fa,
    moves: m.fa.moves.map((mv) => ({ ...mv, on: `${mv.on}/${writes(m, mv.from, mv.on)}` })),
  };
}

const nameSize = (q: string) =>
  q.length <= 2 ? 14 : q.length === 3 ? 13 : q.length === 4 ? 12 : 10;
const OUT_SIZE = 14;

export function drawMachine(
  m: Machine,
  layout: StateLayout,
  o: DrawOptions = {},
): { shapes: Shape[]; bounds: Bounds } {
  const pick = o.show?.move;
  const show = o.show && {
    ...o.show,
    move: pick && ((mv: Move) => pick({ ...mv, on: mv.on.split('/')[0]! })),
  };
  const d = drawAutomaton(drawnFa(m), layout, { ...o, show });
  if (m.kind === 'mealy') return d;
  const pre = o.prefix ?? '';
  const roles = o.roles ?? new Map<string, MarkRole>();
  const circles = new Map<string, CircleShape>();
  for (const s of d.shapes) if (s.kind === 'circle') circles.set(s.id, s);
  const shapes: Shape[] = [];
  for (const s of d.shapes) {
    const q = s.kind === 'text' && s.id.startsWith(pre) ? stateOf(s.id.slice(pre.length)) : null;
    const c = q !== null ? circles.get(stateId(q, pre)) : undefined;
    if (s.kind !== 'text' || q === null || !c || !(q in m.out)) {
      shapes.push(s);
      continue;
    }
    const size = nameSize(q);
    shapes.push({ ...s, y: c.y - 4, size });
    const half = STATE_R - 6;
    shapes.push({
      kind: 'arrow',
      id: `${stateId(q, pre)}-d`,
      x1: c.x - half,
      y1: c.y + 1,
      x2: c.x + half,
      y2: c.y + 1,
      head: 'none',
      z: 2,
      role: c.role,
      opacity: c.opacity,
    });
    const oid = outputId(q, pre);
    shapes.push({
      kind: 'text',
      id: oid,
      x: c.x,
      y: c.y + 16,
      text: m.out[q]!,
      size: OUT_SIZE,
      anchor: 'middle',
      mono: true,
      weight: 'bold',
      role: roles.get(oid) ?? (c.role === 'active' ? 'active' : undefined),
      opacity: c.opacity,
    });
  }
  return { shapes, bounds: d.bounds };
}

/** "s-q0-t" -> "q0": the state whose name this text is. */
function stateOf(id: string): string | null {
  const m = /^s-(.+)-t$/.exec(id);
  return m ? m[1]! : null;
}

export const OUT_CAPTION = 18;

export interface OutputTape {
  kind: Kind;
  x: number;
  y: number;
  /** What the machine has written so far. */
  written: string;
  /** Cells the tape has: what the machine writes on the whole word. */
  length: number;
  /** The window of cells shown, the same as the input tape's. */
  from: number;
  to: number;
  /** The cell just written, highlighted. */
  fresh: number | null;
  roles: ReadonlyMap<string, MarkRole>;
}

/** A caption, then the output cells, aligned with the input tape's cells above. */
export function drawOutputTape(out: Shape[], o: OutputTape): Bounds {
  const id = `out-${o.kind}`;
  out.push({
    kind: 'text',
    id: `${id}-cap`,
    x: o.x,
    y: o.y + 13,
    text: `${kindName(o.kind)} output${o.length === 0 ? ': nothing' : ''}`,
    size: 13,
    cls: 'label',
  });
  const roles = new Map(o.roles);
  if (o.fresh !== null && !roles.has(`${id}-${o.fresh}`)) roles.set(`${id}-${o.fresh}`, 'new');
  const to = Math.min(o.to, o.length);
  const b =
    to > o.from
      ? drawTape(out, {
          id,
          x: o.x,
          y: o.y + OUT_CAPTION,
          cells: [...o.written],
          from: o.from,
          to,
          head: null,
          headRoom: 'none',
          blank: ' ',
          roles,
        })
      : { x: o.x, y: o.y + OUT_CAPTION, w: 0, h: CELL_H };
  return { x: o.x, y: o.y, w: Math.max(b.w, 110), h: OUT_CAPTION + b.h };
}
