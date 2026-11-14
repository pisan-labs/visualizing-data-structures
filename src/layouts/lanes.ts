/**
 * Threads as lanes: the drawing the concurrency pages share (PLAN.md 21.5 item 4). Each thread is
 * a column of its steps, with its program counter (an arrow at the next step), its status and its
 * registers; shared variables, locks, semaphores, condition variables, the output and any extra
 * panels sit beside the lanes on a wide stage and under them on a tall one; a strip shows the
 * schedule so far, one cell per step, named by the thread that took it.
 *
 * It draws whichever arrangement is largest on the stage (pickLayout; with no stage, the first):
 * the panel beside the lanes in one or two columns, with the strip under everything or under the
 * panel; the panel under the lanes in one to three columns; with three or more threads, the lanes
 * in two rows too, and an odd lane out leaves a gap the panel can fill.
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
 *     input.locks     { name, holder, waiters, room? }[]   holder: a thread name or null (free);
 *                     room: the threads that could ever wait (default every thread), whose names
 *                     the waiting list keeps room for
 *     input.sems      { name, value, waiters, room? }[]
 *     input.conds     { name, waiters, room? }[]
 *     input.output    the printed words so far, oldest first
 *     input.panels    { id, title, rows, room?, chars? }[]: extra boxes of text lines (a tally of
 *                     outcomes, a wait-for cycle); room is how many lines to reserve (default
 *                     rows.length) and chars how many characters a line may take (default the
 *                     longest line): reserve both so the panel keeps its size while lines change.
 *                     A row is a string (its shape id ends in its index) or { key, text } (its
 *                     id ends in the key, so a line keeps its identity when lines are added)
 *     input.schedule  the thread name of every step taken so far
 *     input.reserve   { schedule?, output?, outputChars?, noteChars? }: schedule cells, printed
 *                     words, characters per word, and characters of a lane's note to make room
 *                     for (lanesInput in _threads/page.ts works them out from the program)
 *     options.roles   the step's marks by shape id (a mark overrides the default look)
 *     options.stage   the stage (src/render/stage.ts): beside on a wide stage, under on a tall one
 *     options.room    schedule cells to reserve (default reserve.schedule, else every step of every
 *                     lane once); keep it fixed for an operation so the camera stays still
 *     options.outputRoom   printed words to reserve (default reserve.output); no output section
 *                     at all when input.output is left out
 *     options.noteChars    characters reserved for a lane's note (default reserve.noteChars, 16)
 *   The geometry depends only on the names, step texts, and rooms, never on values, so the
 *   picture holds still while a run plays; values are reserved a few characters.
 *
 * Shape ids (mark these):
 *   lane-<t>             a lane's frame (t from 0); lane-<t>-name, lane-<t>-note
 *   step-<t>-<k>         step k of lane t; step-<t>-<k>-text
 *   step-<t>-end         the end row; pc-<t> the program counter's arrow
 *   reg-<t>-<name>       a register's text
 *   var-<name>           a shared variable's value box; var-<name>-value, var-<name>-name
 *   lock-<name>          a lock's box; lock-<name>-label (its name), -text (holder), -queue
 *   sem-<name>           a semaphore's box; sem-<name>-label ("s = 1"), sem-<name>-queue
 *   cond-<name>          a condition variable's box; cond-<name>-label, cond-<name>-queue
 *   out-<k>              the k-th printed word (a box; out-<k>-text)
 *   panel-<id>           an extra panel's frame; panel-<id>-title, panel-<id>-<k or key> its lines
 *   sched-<k>            the k-th step of the schedule (a box; sched-<k>-text); sched-title
 * Build them with laneId, stepId, endId, pcId, regId, varId, lockId, semId, condId, outId,
 * panelId and schedId below rather than by hand.
 *
 * Text is 13 units or more (thread names 14), so it reads at 11 px on a laptop stage and 9 px on
 * a phone while the drawing is scaled by at least 0.85 and 0.7. Measured: four lanes of four
 * short steps draw their smallest text at 14.9 px (laptop) and 11.8 px (phone); two lanes of
 * eight steps with labels ("top: if items != 0 goto go") at 12.6 and 8.7 px, too small. The
 * longest step text (labels count) sets every lane's width: keep steps short.
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
  locks?: { name: string; holder: string | null; waiters: string[]; room?: string[] }[];
  sems?: { name: string; value: string; waiters: string[]; room?: string[] }[];
  conds?: { name: string; waiters: string[]; room?: string[] }[];
  output?: string[];
  panels?: { id: string; title: string; rows: PanelRow[]; room?: number; chars?: number }[];
  schedule: string[];
  /** Room to keep, so the picture holds still as a run fills it (options override these). */
  reserve?: { schedule?: number; output?: number; outputChars?: number; noteChars?: number };
}

/** A panel line: plain text (its id is its index), or text with a key that names its shape. */
export type PanelRow = string | { key: string; text: string };

const rowText = (r: PanelRow) => (typeof r === 'string' ? r : r.text);
const rowKey = (r: PanelRow, k: number) => (typeof r === 'string' ? String(k) : r.key);

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
const SMALL = 13;
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
  /** Space under this part before the next one in a column (default SECTION_GAP). */
  after?: number;
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

/** One block of the panel, drawn from (0, 0) down: a title, then its rows. */
class Section {
  shapes: Shape[] = [];
  y = 0;
  w = 0;
  title(id: string, text: string) {
    this.shapes.push({ kind: 'text', id, x: 0, y: this.y + 12, text, size: SMALL, cls: 'label' });
    this.w = Math.max(this.w, w(text, SMALL));
    this.y += 20;
  }
  part(): Part {
    return { shapes: this.shapes, w: this.w, h: Math.max(0, this.y - 4) };
  }
}

/**
 * The blocks of shared things: shared memory, locks, semaphores, condition variables, the output
 * and the extra panels, in that order, each drawn at (0, 0). `stack` arranges them.
 */
function sections(
  input: LanesInput,
  names: string[],
  roles: ReadonlyMap<string, MarkRole>,
  outputRoom: number,
): Part[] {
  const parts: Part[] = [];
  // The longest waiting list each can have: the threads that use it, or every thread.
  const queueW = (room?: string[]) => w(queueText(room ?? names), SMALL);

  if (input.shared.length) {
    const sec = new Section();
    sec.title('shared-title', 'shared memory');
    const nameW = Math.max(...input.shared.map((v) => w(v.name, STEP)));
    const boxW = Math.max(44, ...input.shared.map((v) => w(v.value, VALUE) + 16));
    for (const v of input.shared) {
      const id = varId(v.name);
      const y = sec.y;
      sec.shapes.push(
        {
          kind: 'text',
          id: `${id}-name`,
          x: nameW,
          y: y + 16,
          text: v.name,
          size: STEP,
          anchor: 'end',
          mono: true,
        },
        {
          kind: 'rect',
          id,
          x: nameW + 8,
          y,
          w: boxW,
          h: 24,
          r: 4,
          cls: 'live',
          role: roles.get(id),
        },
        {
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
        },
      );
      sec.w = Math.max(sec.w, nameW + 8 + boxW);
      sec.y += 30;
    }
    parts.push(sec.part());
  }

  const holderW =
    w('held by ', SMALL) + Math.max(...names.map((n) => w(n, SMALL)), w('free', SMALL));
  /** A box with a label (reserved `labelW` wide), a text beside it, and a waiting list under. */
  const block = (
    sec: Section,
    id: string,
    label: string,
    labelW: number,
    text: string | null,
    textW: number,
    waiters: string[],
    room?: string[],
  ) => {
    const boxW = labelW + 16;
    const y = sec.y;
    sec.shapes.push(
      { kind: 'rect', id, x: 0, y, w: boxW, h: 24, r: 4, cls: 'live', role: roles.get(id) },
      {
        kind: 'text',
        id: `${id}-label`,
        x: boxW / 2,
        y: y + 16.5,
        text: label,
        size: STEP,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
      },
    );
    if (text !== null)
      sec.shapes.push({
        kind: 'text',
        id: `${id}-text`,
        x: boxW + 8,
        y: y + 16,
        text,
        size: SMALL,
        role: roles.get(`${id}-text`),
      });
    sec.shapes.push({
      kind: 'text',
      id: `${id}-queue`,
      x: 4,
      y: y + 40,
      text: queueText(waiters),
      size: SMALL,
      cls: waiters.length || roles.has(`${id}-queue`) ? undefined : 'label',
      role: roles.get(`${id}-queue`),
    });
    sec.w = Math.max(sec.w, boxW + (text === null ? 0 : 8 + textW), 4 + queueW(room));
    sec.y += 48;
  };

  // Each lock, semaphore or condition variable is a part of its own (the first with the title),
  // so a long list can run on into a second column.
  const blocks = <T>(
    items: T[] | undefined,
    titleId: string,
    title: string,
    draw: (sec: Section, x: T) => void,
  ) =>
    (items ?? []).forEach((x, i) => {
      const sec = new Section();
      if (i === 0) sec.title(titleId, title);
      draw(sec, x);
      parts.push({ ...sec.part(), after: i < items!.length - 1 ? BLOCK_GAP : undefined });
    });
  const lockW = Math.max(0, ...(input.locks ?? []).map((l) => w(l.name, STEP)));
  blocks(input.locks, 'locks-title', 'locks', (sec, l) =>
    block(
      sec,
      lockId(l.name),
      l.name,
      lockW,
      l.holder ? `held by ${l.holder}` : 'free',
      holderW,
      l.waiters,
      l.room,
    ),
  );
  // Values are reserved three characters (-10 to 999), so the box keeps its size.
  const semW = Math.max(0, ...(input.sems ?? []).map((x) => w(`${x.name} = -10`, STEP)));
  blocks(input.sems, 'sems-title', 'semaphores', (sec, x) =>
    block(sec, semId(x.name), `${x.name} = ${x.value}`, semW, null, 0, x.waiters, x.room),
  );
  const condW = Math.max(0, ...(input.conds ?? []).map((c) => w(c.name, STEP)));
  blocks(input.conds, 'conds-title', 'condition variables', (sec, c) =>
    block(sec, condId(c.name), c.name, condW, null, 0, c.waiters, c.room),
  );
  if (outputRoom > 0) {
    const sec = new Section();
    sec.title('out-title', 'printed');
    const out = input.output ?? [];
    const chars = Math.max(input.reserve?.outputChars ?? 0, ...out.map((o) => o.length));
    const cellW = Math.max(28, chars * STEP * CH + 12);
    const perRow = Math.max(1, Math.floor(164 / (cellW + 4)));
    for (let k = 0; k < out.length; k++) {
      const x = (k % perRow) * (cellW + 4);
      const y = sec.y + Math.floor(k / perRow) * 26;
      const id = outId(k);
      sec.shapes.push(
        { kind: 'rect', id, x, y, w: cellW, h: 22, r: 4, cls: 'live', role: roles.get(id) },
        {
          kind: 'text',
          id: `${id}-text`,
          x: x + cellW / 2,
          y: y + 15.5,
          text: out[k]!,
          size: STEP,
          anchor: 'middle',
          mono: true,
        },
      );
    }
    sec.w = Math.max(sec.w, Math.min(outputRoom, perRow) * (cellW + 4));
    sec.y += Math.ceil(outputRoom / perRow) * 26 + 4;
    parts.push(sec.part());
  }
  for (const p of input.panels ?? []) {
    const room = Math.max(p.room ?? p.rows.length, p.rows.length);
    const id = panelId(p.id);
    const width =
      16 +
      Math.max(
        w(p.title, SMALL),
        (p.chars ?? 0) * STEP * CH,
        ...p.rows.map((r) => w(rowText(r), STEP)),
      );
    const h = 26 + room * 20;
    const shapes: Shape[] = [
      { kind: 'rect', id, x: 0, y: 0, w: width, h, r: 8, z: 0, cls: 'ghost', role: roles.get(id) },
      { kind: 'text', id: `${id}-title`, x: 8, y: 16, text: p.title, size: SMALL, cls: 'label' },
    ];
    p.rows.forEach((r, k) => {
      const rid = `${id}-${rowKey(r, k)}`;
      shapes.push({
        kind: 'text',
        id: rid,
        x: 8,
        y: 36 + k * 20,
        text: rowText(r),
        size: STEP,
        mono: true,
        role: roles.get(rid),
      });
    });
    parts.push({ shapes, w: width, h });
  }
  return parts;
}

const SECTION_GAP = 12;
const BLOCK_GAP = 6;
const COLUMN_GAP = 24;

/**
 * The sections in `cols` columns, in order, top to bottom and then left to right, split where
 * the tallest column is shortest.
 */
function stack(parts: Part[], cols: number): Part {
  const height = (ps: Part[]) =>
    ps.reduce((a, q, i) => a + q.h + (i < ps.length - 1 ? (q.after ?? SECTION_GAP) : 0), 0);
  // The split into at most `cols` runs whose tallest is shortest (a small DP: parts are few).
  const n = parts.length;
  const best: { h: number; cuts: number[] }[][] = [];
  for (let k = 1; k <= Math.max(1, cols); k++) {
    best[k] = [];
    for (let end = 0; end <= n; end++) {
      if (k === 1) {
        best[k]![end] = { h: height(parts.slice(0, end)), cuts: [] };
        continue;
      }
      let pick = best[k - 1]![end]!;
      for (let cut = 1; cut < end; cut++) {
        const h = Math.max(best[k - 1]![cut]!.h, height(parts.slice(cut, end)));
        if (h < pick.h) pick = { h, cuts: [...best[k - 1]![cut]!.cuts, cut] };
      }
      best[k]![end] = pick;
    }
  }
  const cuts = [0, ...best[Math.max(1, cols)]![n]!.cuts, n];
  const groups = cuts.slice(1).map((c, i) => parts.slice(cuts[i], c));
  const shapes: Shape[] = [];
  let x = 0;
  let h = 0;
  for (const g of groups) {
    let y = 0;
    for (const q of g) {
      shapes.push(...move(q.shapes, x, y));
      y += q.h + (q.after ?? SECTION_GAP);
    }
    h = Math.max(h, height(g));
    x += Math.max(0, ...g.map((q) => q.w)) + COLUMN_GAP;
  }
  return { shapes, w: Math.max(0, x - COLUMN_GAP), h };
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
        (opts.noteChars ?? input.reserve?.noteChars ?? 16) * SMALL * CH + 16,
        PC_ROOM + Math.max(0, ...t.regs.map((r) => w(`${r.name} = -00`, STEP))) + 8,
      ),
    ),
  );
  const lanes = input.threads.map((t, i) => lane(i, t, laneW, rows, regRows, roles));
  const laneH = Math.max(...lanes.map((l) => l.h));
  const room =
    opts.room ?? input.reserve?.schedule ?? input.threads.reduce((a, t) => a + t.steps.length, 0);
  const outputRoom = input.output
    ? Math.max(opts.outputRoom ?? input.reserve?.output ?? 0, input.output.length)
    : 0;
  const parts = sections(input, names, roles, outputRoom);

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

  /**
   * Lanes in rows of `perRow`; the panel in `cols` columns beside them (`beside`) or under them;
   * the strip under everything, or (`stripBeside`, with the panel beside) under the panel.
   */
  const build = (
    perRow: number,
    beside: boolean,
    cols: number,
    stripBeside = false,
  ): Arrangement => {
    const L = lanesRow(perRow);
    const panel = stack(parts, cols);
    const shapes: Shape[] = [...move(L.shapes, PAD, PAD)];
    let bottom: number;
    let right: number;
    if (beside) {
      const px = PAD + L.w + 2 * GAP;
      shapes.push(...move(panel.shapes, px, PAD + DROP));
      if (stripBeside) {
        const S = strip(input.schedule, names, room, Math.max(panel.w, 220), roles);
        const sy = PAD + DROP + panel.h + (panel.h > 0 ? GAP + 2 : 0);
        shapes.push(...move(S.shapes, px, sy));
        bottom = Math.max(PAD + L.h, sy + S.h);
        right = px + Math.max(panel.w, S.w);
        return {
          shapes,
          bounds: { x: 0, y: 0, w: right + PAD, h: bottom + PAD },
          wide: true,
        };
      }
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
  const half = Math.ceil(n / 2);
  const options = [
    build(n, true, 1),
    build(n, true, 2),
    build(n, true, 1, true),
    build(n, false, 1),
    build(n, false, 2),
    build(n, false, 3),
  ];
  if (n > 2)
    options.push(
      build(half, true, 1),
      build(half, true, 1, true),
      build(half, false, 1),
      build(half, false, 2),
    );
  // An odd number of lanes in two rows leaves a gap after the last lane: the panel can sit there.
  if (n > 2 && n % half !== 0) {
    const L = lanesRow(half);
    const panel = stack(parts, 1);
    const px = PAD + (n % half) * (laneW + GAP) + GAP;
    const py = PAD + (laneH + GAP) * (Math.ceil(n / half) - 1);
    const right = Math.max(PAD + L.w, px + panel.w);
    const bottom = Math.max(PAD + L.h, py + panel.h);
    const S = strip(input.schedule, names, room, right - PAD, roles);
    options.push({
      shapes: [
        ...move(L.shapes, PAD, PAD),
        ...move(panel.shapes, px, py),
        ...move(S.shapes, PAD, bottom + GAP + 2),
      ],
      bounds: { x: 0, y: 0, w: Math.max(right, PAD + S.w) + PAD, h: bottom + GAP + 2 + S.h + PAD },
      wide: false,
    });
  }
  return pickLayout(opts.stage, options);
}
