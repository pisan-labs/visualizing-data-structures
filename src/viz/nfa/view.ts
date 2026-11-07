/**
 * The NFA: its state diagram with every active state blue, the moves just followed highlighted,
 * states added by ε-moves green and branches that die dashed. During a run, the input tape and
 * a trace of the set after each symbol go under the diagram (or beside it, whichever reads
 * better), then an accept or reject badge. A batch test puts a table of words under the tape.
 * A plain state (no run, as in practice pictures) draws just the machine.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { stateId } from '../../layouts/automaton';
import { textWidth } from '../../layouts/graph';
import { CELL_W } from '../../layouts/tape';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  describeTest,
  drawInputTape,
  drawTestTable,
  drawVerdict,
  faScene,
  setShort,
  stack,
  tapeCells,
} from '../dfa/kit';
import {
  describe,
  describeRun,
  type NfaExtra,
  type NfaRun,
  type NfaSettings,
  type NfaState,
} from './model';

const TAPE_H = 26 + 36;
const ROW_H = 22;
const ROW_GAP = 3;
/** Rows of the trace per column at most; a longer run wraps into columns of equal length. */
const PER_COL = 8;
const TEXT = 14;

/** The block the direction of the diagram is chosen for: a tape, a trace of 7 rows, the badge. */
const NOMINAL = { w: 9 * CELL_W, h: TAPE_H + 14 + 20 + 7 * (ROW_H + ROW_GAP) + 14 + 30 };

/** Rows per column for a trace of n rows: at most PER_COL, and the columns about even. */
const perCol = (n: number) => Math.ceil(n / Math.ceil(n / PER_COL));

export const traceId = (k: number): string => `trace-${k}`;

/**
 * The set after each symbol: "start" and E({q0}), then each symbol read and the set after it.
 * Rows past the current one are empty but keep their room, so nothing moves during a run.
 */
function drawTrace(
  out: Shape[],
  x: number,
  y: number,
  r: NfaRun,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const n = r.word.length + 1;
  const per = perCol(n);
  const cols = Math.ceil(n / per);
  const labelW = textWidth('start', 13) + 10;
  const setW =
    Math.max(
      textWidth('{q0,q1}', TEXT, true),
      ...r.rows.map((s) => textWidth(setShort(s), TEXT, true)),
    ) + 14;
  const colW = labelW + setW + 14;
  out.push({
    kind: 'text',
    id: 'trace-h',
    x,
    y: y + 13,
    text: 'set after each symbol',
    size: 13,
    cls: 'label',
  });
  const top = y + 20;
  for (let k = 0; k < n; k++) {
    const cx = x + Math.floor(k / per) * colW;
    const cy = top + (k % per) * (ROW_H + ROW_GAP);
    const shown = k <= r.read;
    // The current row shows the set as it is now (in the middle of a symbol, before its
    // ε-closure); earlier rows show the set each symbol ended with.
    const set = k === r.read ? r.set : r.rows[k];
    const id = traceId(k);
    const now = k === r.read;
    const role = roles.get(id) ?? (now ? (r.dead ? 'error' : 'active') : undefined);
    out.push({
      kind: 'text',
      id: `${id}-c`,
      x: cx + labelW - 8,
      y: cy + ROW_H / 2 + 5,
      text: k === 0 ? 'start' : r.word[k - 1]!,
      size: k === 0 ? 13 : TEXT,
      anchor: 'end',
      mono: k > 0,
      cls: 'label',
      opacity: k <= r.read ? undefined : 0.5,
    });
    out.push({
      kind: 'rect',
      id,
      x: cx + labelW,
      y: cy,
      w: setW,
      h: ROW_H,
      r: 4,
      cls: shown ? 'live' : undefined,
      role: shown ? role : undefined,
    });
    if (shown && set)
      out.push({
        kind: 'text',
        id: `${id}-t`,
        x: cx + labelW + 7,
        y: cy + ROW_H / 2 + 5,
        text: setShort(set),
        size: TEXT,
        mono: true,
        role: role === 'active' || role === 'error' ? role : undefined,
      });
  }
  return { x, y, w: cols * colW - 14, h: 20 + per * (ROW_H + ROW_GAP) - ROW_GAP };
}

export function view(
  step: Step<NfaState, NfaExtra>,
  _settings: NfaSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const a = state.machine;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const t = extra.test;
  const room = extra.room ?? r?.word.length ?? 0;
  const parts: ((out: Shape[], x: number, y: number) => Bounds)[] = [];
  if (r) {
    const tapeRoles = new Map(roles);
    // When every branch dies, the symbol that killed the last of them is marked.
    if (r.dead) for (const id of [`tape-${r.read - 1}`, 'tape-head']) tapeRoles.set(id, 'error');
    parts.push((out, x, y) =>
      drawInputTape(out, x, y, {
        word: r.word,
        read: r.read,
        head: r.read,
        room,
        roles: tapeRoles,
      }),
    );
  } else if (t) {
    parts.push((_out, x, y) => ({ x, y, w: tapeCells(room) * CELL_W, h: TAPE_H }));
  }
  if (t) parts.push((out, x, y) => drawTestTable(out, x, y, t, roles));
  else if (r) {
    // The badge goes last: its room, kept until the verdict, stays out of the way at the end.
    parts.push((out, x, y) => drawTrace(out, x, y, r, roles));
    parts.push((out, x, y) => drawVerdict(out, x, y, r.verdict, roles));
  }

  const drawn = faScene(
    a,
    {
      roles,
      look: (q) =>
        r?.set.includes(q) ? 'current' : roles.get(stateId(q)) === 'remove' ? 'dead' : undefined,
    },
    stage,
    NOMINAL,
    parts.length ? stack(parts) : undefined,
  );
  const label = [describe(state), t ? describeTest(t) : '', r ? describeRun(r) : '']
    .filter(Boolean)
    .join(' ');
  return { ...drawn, label };
}
