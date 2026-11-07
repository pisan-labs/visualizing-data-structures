/**
 * The DFA: its state diagram, and during a run the input as a tape under it (or beside it,
 * whichever reads better), with the symbols read greyed, the head on the next symbol and the
 * current state over the head, then an accept or reject badge. The current state is blue and
 * the arrow just taken is highlighted. A batch test puts a table of words under the tape.
 * A plain state (no run, as in practice pictures) draws just the machine.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { CELL_W } from '../../layouts/tape';
import type { Scene, Shape } from '../../render/scene';
import {
  RUN_BLOCK_H,
  describeTest,
  drawInputTape,
  drawTestTable,
  drawVerdict,
  faScene,
  stack,
  tapeCells,
} from '../_automata/panels';
import {
  deadState,
  describe,
  describeRun,
  machineFor,
  type DfaExtra,
  type DfaSettings,
  type DfaState,
} from './model';

/** The block the direction of the diagram is chosen for: a tape of 9 cells and the badge. */
const NOMINAL = { w: 9 * CELL_W, h: RUN_BLOCK_H };

export function view(
  step: Step<DfaState, DfaExtra>,
  settings: DfaSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const a = machineFor(state.machine, settings);
  const dead = deadState(state.machine, settings);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const t = extra.test;
  const room = extra.room ?? r?.word.length ?? 0;
  const parts: ((out: Shape[], x: number, y: number) => Scene['bounds'])[] = [];
  if (r) {
    const tapeRoles = new Map(roles);
    if (r.stuck)
      for (const id of [`tape-${r.read}`, 'tape-head', 'tape-head-t']) tapeRoles.set(id, 'error');
    parts.push((out, x, y) =>
      drawInputTape(out, x, y, {
        word: r.word,
        read: r.read,
        head: r.read,
        headLabel: r.q,
        room,
        roles: tapeRoles,
      }),
    );
  } else if (t) {
    // Between words the tape is empty, but its room stays, so the table does not move.
    parts.push((_out, x, y) => ({ x, y, w: tapeCells(room) * CELL_W, h: 46 + 36 }));
  }
  if (t) parts.push((out, x, y) => drawTestTable(out, x, y, t, roles));
  else if (r) parts.push((out, x, y) => drawVerdict(out, x, y, r.verdict, roles));

  const drawn = faScene(
    a,
    {
      roles,
      look: (q) => (r && q === r.q ? 'current' : q === dead ? 'dead' : undefined),
      edge: (p, q) => (r?.last && r.last.from === p && r.last.to === q ? 'used' : undefined),
    },
    stage,
    NOMINAL,
    parts.length ? stack(parts) : undefined,
  );
  const label = [describe(state, settings), t ? describeTest(t) : '', r ? describeRun(r) : '']
    .filter(Boolean)
    .join(' ');
  return { ...drawn, label };
}
