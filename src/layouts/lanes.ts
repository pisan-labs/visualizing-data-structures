/**
 * Threads as lanes: the drawing the concurrency pages share (PLAN.md 21.5 item 4). Each thread is
 * a column of its steps, with its program counter (an arrow at the next step), its status and its
 * registers; shared variables, locks, semaphores, condition variables, the output and any extra
 * panels sit beside the lanes on a wide stage and under them on a tall one; a strip along the
 * bottom shows the schedule so far, one cell per step, named by the thread that took it.
 *
 * The layout knows nothing about the machine: src/viz/_threads/page.ts turns a machine state into
 * this input. Text is monospace (0.6 em a character), so boxes are sized from their labels.
 *
 *   drawLanes(input, options) -> { shapes, bounds, wide }
 *     input.threads   { name, steps, pc, status, note?, regs }[]
 *                     steps   the step texts, top to bottom ("r = count")
 *                     pc      the next step's index; the arrow points at it, or at the end row
 *                             (drawn "end") when pc >= steps.length or status is done
 *                     status  ready | blocked (dashed arrow and frame) | done | fault
 *                     note    a few words under the name, e.g. "waits for m"; default: the status
 *                     regs    { name, value }[], already formatted
 *     input.shared    { name, value }[]
 *     input.locks     { name, holder, waiters }[]   holder: a thread name or null (free)
 *     input.sems      { name, value, waiters }[]
 *     input.conds     { name, waiters }[]
 *     input.output    the printed words so far, oldest first
 *     input.panels    { id, title, rows, room?, chars? }[]: extra boxes of text lines (a tally of
 *                     outcomes, a wait-for cycle); room is how many lines to reserve (default
 *                     rows.length) and chars how many characters a line may take (default the
 *                     longest line): reserve both so the panel keeps its size while lines change
 *     input.schedule  the thread name of every step taken so far
 *     options.roles   the step's marks by shape id (a mark overrides the default look)
 *     options.stage   the stage (src/render/stage.ts): beside on a wide stage, under on a tall one
 *     options.room    schedule cells to reserve (default: every step of every lane once); keep it
 *                     fixed for an operation so the camera stays still
 *     options.outputRoom   printed words to reserve (default output.length)
 *     options.noteChars    characters reserved for a lane's note (default 16)
 *   The geometry depends only on the names, step texts, and rooms, never on values, so the
 *   picture holds still while a run plays; values are reserved a few characters.
 *
 * Shape ids (mark these):
 *   lane-<t>             a lane's frame (t from 0); lane-<t>-name, lane-<t>-note
 *   step-<t>-<k>         step k of lane t; step-<t>-<k>-text
 *   step-<t>-end         the end row; pc-<t> the program counter's arrow
 *   reg-<t>-<name>       a register's text
 *   var-<name>           a shared variable's value box; var-<name>-value, var-<name>-name
 *   lock-<name>          a lock's box; lock-<name>-text (holder), lock-<name>-queue (waiters)
 *   sem-<name>           a semaphore's box; sem-<name>-text, sem-<name>-queue
 *   cond-<name>          a condition variable's box; cond-<name>-queue
 *   out-<k>              the k-th printed word (a box; out-<k>-text)
 *   panel-<id>           an extra panel's frame; panel-<id>-title, panel-<id>-<k> its lines
 *   sched-<k>            the k-th step of the schedule (a box; sched-<k>-text); sched-title
 * Use laneShapeIds(t) and friends below rather than building ids by hand.
 */
import type { MarkRole, StageSize } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';
import { pickLayout, translate as move } from './arrange';

export type LaneStatus = 'ready' | 'blocked' | 'done' | 'fault';

export interface LaneThread {
  name: string;
  steps: string[];
  pc: number;
  status: LaneStatus;
  note?: string;
  regs: { name: string; value: string }[];
}

export interface LanesInput {
  threads: LaneThread[];
  shared: { name: string; value: string }[];
  locks?: { name: string; holder: string | null; waiters: string[] }[];
  sems?: { name: string; value: string; waiters: string[] }[];
  conds?: { name: string; waiters: string[] }[];
  output?: string[];
  panels?: { id: string; title: string; rows: string[]; room?: number; chars?: number }[];
  schedule: string[];
}

export interface LanesOptions {
  roles?: ReadonlyMap<string, MarkRole>;
  stage?: StageSize;
  room?: number;
  outputRoom?: number;
  /** Characters reserved for a lane's note (default 16), so a long note never widens a lane. */
  noteChars?: number;
}

export const laneId = (t: number) => `lane-${t}`;
export const stepId = (t: number, k: number) => `step-${t}-${k}`;
export const endId = (t: number) => `step-${t}-end`;
export const pcId = (t: number) => `pc-${t}`;
export const regId = (t: number, name: string) => `reg-${t}-${name}`;
export const varId = (name: string) => `var-${name}`;
export const lockId = (name: string) => `lock-${name}`;
export const semId = (name: string) => `sem-${name}`;
export const condId = (name: string) => `cond-${name}`;
export const outId = (k: number) => `out-${k}`;
export const panelId = (id: string) => `panel-${id}`;
export const schedId = (k: number) => `sched-${k}`;

/** Font sizes, in scene units. The smallest (SMALL) must stay >= 11 px on a laptop. */
const STEP = 13;
const NAME = 14;
const SMALL = 12;
const VALUE = 14;
const CH = 0.6;
const w = (text: string, size: number) => text.length * size * CH;

const PAD = 14;
const GAP = 14;
const PC_ROOM = 22;
const CELL_PAD = 8;
const ROW = 26;
const CELL_H = 22;
const HEAD = 44;
const REG_ROW = 19;
/** Extra drop for the panel beside the lanes, clear of the stage's zoom buttons. */
const DROP = 40;

interface Part {
  shapes: Shape[];
  w: number;
  h: number;
}

/** One lane at (0, 0), `width` wide and `rows` step rows tall (its own steps, then the end). */
function lane(
  t: number,
  th: LaneThread,
  width: number,
  rows: number,
  regRows: number,
  roles: ReadonlyMap<string, MarkRole>,
): Part {
  const shapes: Shape[] = [];
  const h = HEAD + (rows + 1) * ROW + regRows * REG_ROW + 8;
  const finished = th.status === 'done' || th.pc >= th.steps.length;
  const blocked = th.status === 'blocked';
  shapes.push({
    kind: 'rect',
    id: laneId(t),
    x: 0,
    y: 0,
    w: width,
    h,
    r: 10,
    z: 0,
    cls: blocked ? 'ghost' : undefined,
    role: roles.get(laneId(t)),
  });
  shapes.push({
    kind: 'text',
    id: `${laneId(t)}-name`,
    x: width / 2,
    y: 20,
    text: th.name,
    size: NAME,
    anchor: 'middle',
    weight: 'bold',
    mono: true,
    role: roles.get(`${laneId(t)}-name`),
  });
  const note =
    th.note ?? (th.status === 'ready' && !finished ? 'ready' : finished ? 'done' : th.status);
  shapes.push({
    kind: 'text',
    id: `${laneId(t)}-note`,
    x: width / 2,
    y: 36,
    text: note,
    size: SMALL,
    anchor: 'middle',
    cls: roles.has(`${laneId(t)}-note`) ? undefined : 'label',
    role: roles.get(`${laneId(t)}-note`) ?? (th.status === 'fault' ? 'error' : undefined),
  });
  const cellX = PC_ROOM;
  const cellW = width - PC_ROOM - 8;
  const rowY = (k: number) => HEAD + k * ROW;
  th.steps.forEach((text, k) => {
    const id = stepId(t, k);
    shapes.push({
      kind: 'rect',
      id,
      x: cellX,
      y: rowY(k),
      w: cellW,
      h: CELL_H,
      r: 4,
      cls: 'live',
      role: roles.get(id),
    });
    shapes.push({
      kind: 'text',
      id: `${id}-text`,
      x: cellX + CELL_PAD,
      y: rowY(k) + CELL_H / 2 + 4.5,
      text,
      size: STEP,
      mono: true,
      role: roles.get(`${id}-text`),
    });
  });
  const endRow = th.steps.length;
  shapes.push({
    kind: 'rect',
    id: endId(t),
    x: cellX,
    y: rowY(endRow),
    w: cellW,
    h: CELL_H,
    r: 4,
    cls: 'ghost',
    role: roles.get(endId(t)),
  });
  shapes.push({
    kind: 'text',
    id: `${endId(t)}-text`,
    x: cellX + CELL_PAD,
    y: rowY(endRow) + CELL_H / 2 + 4.5,
    text: 'end',
    size: SMALL,
    cls: 'label',
  });
  const at = finished ? endRow : Math.max(0, th.pc);
  const ay = rowY(at) + CELL_H / 2;
  shapes.push({
    kind: 'arrow',
    id: pcId(t),
    x1: 3,
    y1: ay,
    x2: PC_ROOM - 3,
    y2: ay,
    z: 3,
    dashed: blocked,
    role: roles.get(pcId(t)) ?? (th.status === 'fault' ? 'error' : undefined),
  });
  const regTop = rowY(rows + 1) + 4;
  th.regs.forEach((r, k) => {
    const id = regId(t, r.name);
    shapes.push({
      kind: 'text',
      id,
      x: cellX,
      y: regTop + k * REG_ROW + 10,
      text: `${r.name} = ${r.value}`,
      size: STEP,
      mono: true,
      role: roles.get(id),
    });
  });
  return { shapes, w: width, h };
}

const queueText = (ws: string[]) => (ws.length ? `waiting: ${ws.join(', ')}` : 'waiting: none');

/** The panel of shared things, one block under another, `width` wide. */
function sidePanel(
  input: LanesInput,
  names: string[],
  roles: ReadonlyMap<string, MarkRole>,
  outputRoom: number,
): Part {
  const shapes: Shape[] = [];
  let y = 0;
  let width = 0;
  const title = (id: string, text: string) => {
    shapes.push({ kind: 'text', id, x: 0, y: y + 12, text, size: SMALL, cls: 'label' });
    width = Math.max(width, w(text, SMALL));
    y += 20;
  };
  // Longest waiting list: every thread's name.
  const queueW = w(queueText(names), SMALL);

  if (input.shared.length) {
    title('shared-title', 'shared memory');
    const nameW = Math.max(...input.shared.map((v) => w(v.name, STEP)));
    const boxW = Math.max(44, ...input.shared.map((v) => w(v.value, VALUE) + 16));
    for (const v of input.shared) {
      const id = varId(v.name);
      shapes.push({
        kind: 'text',
        id: `${id}-name`,
        x: nameW,
        y: y + 16,
        text: v.name,
        size: STEP,
        anchor: 'end',
        mono: true,
      });
      shapes.push({
        kind: 'rect',
        id,
        x: nameW + 8,
        y,
        w: boxW,
        h: 24,
        r: 4,
        cls: 'live',
        role: roles.get(id),
      });
      shapes.push({
        kind: 'text',
        id: `${id}-value`,
        x: nameW + 8 + boxW / 2,
        y: y + 17,
        text: v.value,
        size: VALUE,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(`${id}-value`),
      });
      width = Math.max(width, nameW + 8 + boxW);
      y += 30;
    }
    y += 4;
  }

  const holderW =
    w('held by ', SMALL) + Math.max(...names.map((n) => w(n, SMALL)), w('free', SMALL));
  /** A box with a label (reserved `labelW` wide), a text beside it, and a waiting list under. */
  const block = (
    id: string,
    label: string,
    labelW: number,
    text: string | null,
    textW: number,
    waiters: string[],
  ) => {
    const boxW = labelW + 16;
    shapes.push({
      kind: 'rect',
      id,
      x: 0,
      y,
      w: boxW,
      h: 24,
      r: 4,
      cls: 'live',
      role: roles.get(id),
    });
    shapes.push({
      kind: 'text',
      id: `${id}-label`,
      x: boxW / 2,
      y: y + 16.5,
      text: label,
      size: STEP,
      anchor: 'middle',
      mono: true,
      weight: 'bold',
    });
    if (text !== null) {
      shapes.push({
        kind: 'text',
        id: `${id}-text`,
        x: boxW + 8,
        y: y + 16,
        text,
        size: SMALL,
        role: roles.get(`${id}-text`),
      });
    }
    shapes.push({
      kind: 'text',
      id: `${id}-queue`,
      x: 4,
      y: y + 40,
      text: queueText(waiters),
      size: SMALL,
      cls: waiters.length || roles.has(`${id}-queue`) ? undefined : 'label',
      role: roles.get(`${id}-queue`),
    });
    width = Math.max(width, boxW + (text === null ? 0 : 8 + textW), 4 + queueW);
    y += 50;
  };

  if (input.locks?.length) {
    title('locks-title', 'locks');
    const labelW = Math.max(...input.locks.map((l) => w(l.name, STEP)));
    for (const l of input.locks)
      block(
        lockId(l.name),
        l.name,
        labelW,
        l.holder ? `held by ${l.holder}` : 'free',
        holderW,
        l.waiters,
      );
  }
  if (input.sems?.length) {
    title('sems-title', 'semaphores');
    // Values are reserved three characters (-10 to 999), so the box keeps its size.
    const labelW = Math.max(...input.sems.map((x) => w(`${x.name} = -10`, STEP)));
    for (const x of input.sems)
      block(semId(x.name), `${x.name} = ${x.value}`, labelW, null, 0, x.waiters);
  }
  if (input.conds?.length) {
    title('conds-title', 'condition variables');
    const labelW = Math.max(...input.conds.map((c) => w(c.name, STEP)));
    for (const c of input.conds) block(condId(c.name), c.name, labelW, null, 0, c.waiters);
  }
  if (outputRoom > 0) {
    title('out-title', 'printed');
    const out = input.output ?? [];
    const cellW = Math.max(28, ...out.map((o) => w(o, STEP) + 12));
    const perRow = Math.max(1, Math.floor((Math.max(width, 160) + 4) / (cellW + 4)));
    for (let k = 0; k < out.length; k++) {
      const x = (k % perRow) * (cellW + 4);
      const yy = y + Math.floor(k / perRow) * 26;
      const id = outId(k);
      shapes.push({
        kind: 'rect',
        id,
        x,
        y: yy,
        w: cellW,
        h: 22,
        r: 4,
        cls: 'live',
        role: roles.get(id),
      });
      shapes.push({
        kind: 'text',
        id: `${id}-text`,
        x: x + cellW / 2,
        y: yy + 15.5,
        text: out[k]!,
        size: STEP,
        anchor: 'middle',
        mono: true,
      });
    }
    width = Math.max(width, Math.min(outputRoom, perRow) * (cellW + 4));
    y += Math.ceil(outputRoom / perRow) * 26 + 4;
  }
  for (const p of input.panels ?? []) {
    const room = Math.max(p.room ?? p.rows.length, p.rows.length);
    const id = panelId(p.id);
    const textW = Math.max(
      w(p.title, SMALL),
      (p.chars ?? 0) * STEP * CH,
      ...p.rows.map((r) => w(r, STEP)),
    );
    const top = y;
    shapes.push({
      kind: 'text',
      id: `${id}-title`,
      x: 8,
      y: top + 16,
      text: p.title,
      size: SMALL,
      cls: 'label',
    });
    p.rows.forEach((r, k) => {
      shapes.push({
        kind: 'text',
        id: `${id}-${k}`,
        x: 8,
        y: top + 36 + k * 20,
        text: r,
        size: STEP,
        mono: true,
        role: roles.get(`${id}-${k}`),
      });
    });
    const h = 26 + room * 20;
    width = Math.max(width, textW + 16);
    shapes.unshift({
      kind: 'rect',
      id,
      x: 0,
      y: top,
      w: 0, // set below, once the panel's width is known
      h,
      r: 8,
      z: 0,
      cls: 'ghost',
      role: roles.get(id),
    });
    y += h + 8;
  }
  // Panels' frames span the panel's width.
  const framed = shapes.map((s) =>
    s.kind === 'rect' && s.id.startsWith('panel-') ? { ...s, w: width } : s,
  );
  return { shapes: framed, w: width, h: Math.max(0, y - 4) };
}

/** The schedule strip: `room` cells in rows that fit `width`. */
function strip(
  schedule: string[],
  names: string[],
  room: number,
  width: number,
  roles: ReadonlyMap<string, MarkRole>,
): Part {
  const shapes: Shape[] = [];
  const titleText = 'schedule';
  shapes.push({
    kind: 'text',
    id: 'sched-title',
    x: 0,
    y: 12,
    text: schedule.length ? titleText : `${titleText}: no steps yet`,
    size: SMALL,
    cls: 'label',
  });
  const cellW = Math.max(30, ...names.map((n) => w(n, STEP) + 10));
  const perRow = Math.max(1, Math.floor((width + 3) / (cellW + 3)));
  const top = 20;
  schedule.forEach((name, k) => {
    const x = (k % perRow) * (cellW + 3);
    const y = top + Math.floor(k / perRow) * 26;
    const id = schedId(k);
    shapes.push({
      kind: 'rect',
      id,
      x,
      y,
      w: cellW,
      h: 22,
      r: 4,
      cls: 'live',
      role: roles.get(id),
    });
    shapes.push({
      kind: 'text',
      id: `${id}-text`,
      x: x + cellW / 2,
      y: y + 15.5,
      text: name,
      size: STEP,
      anchor: 'middle',
      mono: true,
      role: roles.get(`${id}-text`),
    });
  });
  const rows = Math.max(1, Math.ceil(Math.max(room, schedule.length) / perRow));
  return { shapes, w: Math.min(width, perRow * (cellW + 3)), h: top + rows * 26 };
}

interface Arrangement {
  shapes: Shape[];
  bounds: Bounds;
  wide: boolean;
}

export function drawLanes(input: LanesInput, opts: LanesOptions = {}): Arrangement {
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const names = input.threads.map((t) => t.name);
  const rows = Math.max(1, ...input.threads.map((t) => t.steps.length));
  const regRows = Math.max(0, ...input.threads.map((t) => t.regs.length));
  const laneW = Math.max(
    96,
    ...input.threads.map((t) =>
      Math.max(
        PC_ROOM + 8 + 2 * CELL_PAD + Math.max(0, ...t.steps.map((s) => w(s, STEP))),
        w(t.name, NAME) + 16,
        (opts.noteChars ?? 16) * SMALL * CH + 16,
        PC_ROOM + Math.max(0, ...t.regs.map((r) => w(`${r.name} = -00`, STEP))) + 8,
      ),
    ),
  );
  const lanes = input.threads.map((t, i) => lane(i, t, laneW, rows, regRows, roles));
  const laneH = Math.max(...lanes.map((l) => l.h));
  const room = opts.room ?? input.threads.reduce((a, t) => a + t.steps.length, 0);
  const panel = sidePanel(input, names, roles, opts.outputRoom ?? input.output?.length ?? 0);

  const lanesRow = (perRow: number) => {
    const shapes: Shape[] = [];
    lanes.forEach((l, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      shapes.push(...move(l.shapes, col * (laneW + GAP), row * (laneH + GAP)));
    });
    const n = Math.min(perRow, lanes.length);
    const lr = Math.ceil(lanes.length / perRow);
    return { shapes, w: n * laneW + (n - 1) * GAP, h: lr * laneH + (lr - 1) * GAP };
  };

  const build = (perRow: number, beside: boolean): Arrangement => {
    const L = lanesRow(perRow);
    const shapes: Shape[] = [...move(L.shapes, PAD, PAD)];
    let bottom: number;
    let right: number;
    if (beside && panel.h > 0) {
      shapes.push(...move(panel.shapes, PAD + L.w + 2 * GAP, PAD + DROP));
      bottom = PAD + Math.max(L.h, DROP + panel.h);
      right = PAD + L.w + 2 * GAP + panel.w;
    } else {
      const py = PAD + L.h + (panel.h > 0 ? GAP + 4 : 0);
      shapes.push(...move(panel.shapes, PAD, py));
      bottom = py + panel.h;
      right = PAD + Math.max(L.w, panel.w);
    }
    const S = strip(input.schedule, names, room, right - PAD, roles);
    shapes.push(...move(S.shapes, PAD, bottom + GAP + 2));
    bottom += GAP + 2 + S.h;
    return {
      shapes,
      bounds: { x: 0, y: 0, w: Math.max(right, PAD + S.w) + PAD, h: bottom + PAD },
      wide: beside,
    };
  };

  const n = input.threads.length;
  const options = [build(n, true), build(n, false)];
  if (n > 2) options.push(build(Math.ceil(n / 2), false));
  return pickLayout(opts.stage, options);
}
