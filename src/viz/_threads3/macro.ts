/**
 * Rows: steps a learner schedules that may be several machine steps, for the concurrency pages
 * /dining-philosophers/, /readers-writers/, /barrier/ and /compare-and-swap/. It sits on the
 * thread machine (src/viz/_threads/machine.ts) and changes none of its rules.
 *
 * Why: the lanes drawing (src/layouts/lanes.ts) reads only while lanes stay short, about 7 steps
 * of 13 characters at most on a phone. Downey's readers-writers or his reusable barrier take 12
 * to 15 machine steps a thread, since a machine step touches shared memory at most once. Most of
 * those steps run while the thread holds a lock that keeps every other thread out, so splitting
 * them changes nothing a learner can see. A row groups them: one row, one scheduling step.
 *
 * A row runs its machine steps one after another, with no other thread in between, until the
 * thread leaves the row (its next step is in another row, or the row jumps back to its own
 * start), blocks, or is done. A thread that blocks in the middle of a row (a P inside a lock)
 * stays on the row; once woken, its next step runs the rest of the row. Rows with one machine
 * step each are the machine itself.
 *
 *   buildMacro(decls, threads)   the machine program (parseProgram) and each thread's rows,
 *                                cached by its text
 *   rowOf(mac, t, pc)            the row holding step pc of thread t (rows.length at the end)
 *   mstep(mac, s, t)             one row step: { ok, state, events, row } or why t cannot run
 *   mrun(mac, sched, from?)      a schedule of row steps
 *   minterleavings(mac, opts)    every schedule of row steps to the end, up to a cap, grouped
 *   mcount(mac, opts)            exact counts by state, for millions of schedules
 *   mfind(mac, goal, opts)       the first schedule whose final state meets goal, or null
 *   mfindPath(mac, goal, opts)   the first schedule that reaches a state meeting goal (it may
 *                                stop early), or null
 */
import {
  CUT_OFF,
  initState,
  runnable,
  stateKey,
  step,
  type MachineState,
  type Program,
  type StepEvent,
} from '../_threads/machine';
import { parseProgram } from '../_threads/parse';

/** A line of pseudocode: the formal text and the same in plain English. */
export interface CodeLine {
  text: string;
  plain: string;
  /** Indent under the row's first line (default 0, or 1 for the lines after the first). */
  indent?: number;
}

export interface RowSpec {
  /** What the lane shows: short, about 13 characters at most. */
  text: string;
  /** Plain English for the pseudocode (one line), or the first line's when `code` is given. */
  plain: string;
  /** The pseudocode lines for this row (default one line: text and plain). */
  code?: CodeLine[];
  /** The machine steps, in the kit's text form (src/viz/_threads/parse.ts). Labels (`top:`)
   * are allowed; a lone label marks the next step. Default [text]. */
  steps?: string[];
}

export interface ThreadRows {
  name: string;
  rows: RowSpec[];
}

export interface Row {
  text: string;
  plain: string;
  code: CodeLine[];
  /** The machine steps from `from` up to (not including) `to`. */
  from: number;
  to: number;
}

export interface Macro {
  p: Program;
  rows: Row[][];
  key: string;
}

const LABEL_ONLY = /^\s*([A-Za-z_][A-Za-z0-9_]*\s*:\s*)+$/;

const cache = new Map<string, Macro>();

/** The program and its rows. `decls` are `shared ...` and `sem ...` lines. */
export function buildMacro(decls: string[], threads: ThreadRows[]): Macro {
  const key = JSON.stringify([decls, threads]);
  const known = cache.get(key);
  if (known) return known;
  const lines: string[] = [...decls];
  const rows: Row[][] = [];
  for (const th of threads) {
    lines.push(`thread ${th.name}`);
    let pc = 0;
    const out: Row[] = [];
    for (const r of th.rows) {
      const steps = r.steps ?? [r.text];
      const n = steps.filter((x) => !LABEL_ONLY.test(x)).length;
      if (n === 0) throw new Error(`Row "${r.text}" of ${th.name} has no steps.`);
      lines.push(...steps.map((x) => `  ${x}`));
      out.push({
        text: r.text,
        plain: r.plain,
        code: r.code ?? [{ text: r.text, plain: r.plain }],
        from: pc,
        to: pc + n,
      });
      pc += n;
    }
    rows.push(out);
  }
  const p = parseProgram(lines.join('\n'));
  if (p instanceof Error) throw p;
  p.threads.forEach((th, t) => {
    if (th.code.length !== rows[t]!.at(-1)!.to)
      throw new Error(`${th.name}: rows cover ${rows[t]!.at(-1)!.to} steps of ${th.code.length}.`);
  });
  const mac = { p, rows, key };
  cache.set(key, mac);
  return mac;
}

export function rowOf(mac: Macro, t: number, pc: number): number {
  const rows = mac.rows[t]!;
  const k = rows.findIndex((r) => pc >= r.from && pc < r.to);
  return k < 0 ? rows.length : k;
}

/** The row a thread is on (rows.length when it is done). */
export const rowNow = (mac: Macro, s: MachineState, t: number) =>
  s.threads[t]!.status === 'done' ? mac.rows[t]!.length : rowOf(mac, t, s.threads[t]!.pc);

export type MStep =
  | { ok: true; state: MachineState; events: StepEvent[]; row: number }
  | { ok: false; reason: 'no-thread' | 'done' | 'blocked' | 'fault'; message: string };

/** Machine steps a row may take before it gives up (a row never loops inside itself). */
const ROW_LIMIT = 64;

/** One row step of thread t: its machine steps until it leaves the row, blocks, or is done. */
export function mstep(mac: Macro, s: MachineState, t: number): MStep {
  const first = step(mac.p, s, t);
  if (!first.ok) return first;
  const row = rowOf(mac, t, s.threads[t]!.pc);
  const { from, to } = mac.rows[t]![row]!;
  const events = [first.event];
  let cur = first.state;
  for (let i = 0; i < ROW_LIMIT; i++) {
    const th = cur.threads[t]!;
    if (th.status !== 'ready' || th.pc <= from || th.pc >= to) break;
    const r = step(mac.p, cur, t);
    if (!r.ok) break;
    events.push(r.event);
    cur = r.state;
  }
  return { ok: true, state: cur, events, row };
}

export interface MRun {
  state: MachineState;
  /** The machine events of each row step. */
  steps: { thread: number; row: number; events: StepEvent[] }[];
  stopped?: { at: number; reason: string; message: string };
}

export function mrun(mac: Macro, sched: number[], from = initState(mac.p)): MRun {
  let state = from;
  const steps: MRun['steps'] = [];
  for (let i = 0; i < sched.length; i++) {
    const r = mstep(mac, state, sched[i]!);
    if (!r.ok) return { state, steps, stopped: { at: i, reason: r.reason, message: r.message } };
    state = r.state;
    steps.push({ thread: sched[i]!, row: r.row, events: r.events });
  }
  return { state, steps };
}

export interface MOptions {
  cap?: number;
  /** Row steps before a schedule is cut off (default 60). */
  maxSteps?: number;
  outcome?: (s: MachineState) => string;
  from?: MachineState;
}

export const MAX_STEPS = 60;

export interface MInterleavings {
  runs: { schedule: number[]; outcome: string }[];
  outcomes: { outcome: string; count: number; first: number[] }[];
  complete: boolean;
}

/** Every schedule of row steps to the end, lowest thread first, at most `cap` of them. */
export function minterleavings(mac: Macro, opts: MOptions = {}): MInterleavings {
  const cap = opts.cap ?? 2000;
  const maxSteps = opts.maxSteps ?? MAX_STEPS;
  const outcome = opts.outcome ?? (() => 'done');
  const runs: MInterleavings['runs'] = [];
  const groups = new Map<string, MInterleavings['outcomes'][number]>();
  let complete = true;
  const path: number[] = [];
  const leaf = (o: string) => {
    runs.push({ schedule: [...path], outcome: o });
    const g = groups.get(o);
    if (g) g.count++;
    else groups.set(o, { outcome: o, count: 1, first: [...path] });
  };
  const visit = (s: MachineState) => {
    const ready = runnable(s);
    if (ready.length === 0) return leaf(outcome(s));
    if (path.length >= maxSteps) return leaf(CUT_OFF);
    for (const t of ready) {
      if (runs.length >= cap) {
        complete = false;
        return;
      }
      const r = mstep(mac, s, t) as Extract<MStep, { ok: true }>;
      path.push(t);
      visit(r.state);
      path.pop();
    }
  };
  visit(opts.from ?? initState(mac.p));
  return { runs, outcomes: [...groups.values()], complete };
}

/** How many row schedules end in each outcome, counted over states (no cap). */
export function mcount(
  mac: Macro,
  opts: Omit<MOptions, 'cap'> = {},
): { total: number; outcomes: { outcome: string; count: number }[] } {
  const maxSteps = opts.maxSteps ?? MAX_STEPS;
  const outcome = opts.outcome ?? (() => 'done');
  const memo = new Map<string, Map<string, number>>();
  const order: string[] = [];
  const go = (s: MachineState, depth: number): Map<string, number> => {
    const ready = runnable(s);
    if (ready.length === 0 || depth >= maxSteps) {
      const o = ready.length ? CUT_OFF : outcome(s);
      if (!order.includes(o)) order.push(o);
      return new Map([[o, 1]]);
    }
    const key = `${depth}|${stateKey(s)}`;
    const known = memo.get(key);
    if (known) return known;
    const acc = new Map<string, number>();
    for (const t of ready) {
      const r = mstep(mac, s, t) as Extract<MStep, { ok: true }>;
      for (const [o, n] of go(r.state, depth + 1)) acc.set(o, (acc.get(o) ?? 0) + n);
    }
    memo.set(key, acc);
    return acc;
  };
  const counts = go(opts.from ?? initState(mac.p), 0);
  const outcomes = order.map((o) => ({ outcome: o, count: counts.get(o) ?? 0 }));
  return { total: outcomes.reduce((a, o) => a + o.count, 0), outcomes };
}

/** The first row schedule, lowest thread first, that runs to a final state meeting `goal`. */
export function mfind(
  mac: Macro,
  goal: (s: MachineState) => boolean,
  opts: Pick<MOptions, 'maxSteps' | 'from'> = {},
): number[] | null {
  return search(mac, (s, end) => end && goal(s), opts);
}

/** The first row schedule that reaches a state meeting `goal`, stopping there. */
export function mfindPath(
  mac: Macro,
  goal: (s: MachineState) => boolean,
  opts: Pick<MOptions, 'maxSteps' | 'from'> = {},
): number[] | null {
  return search(mac, (s) => goal(s), opts);
}

function search(
  mac: Macro,
  hit: (s: MachineState, end: boolean) => boolean,
  opts: Pick<MOptions, 'maxSteps' | 'from'>,
): number[] | null {
  const maxSteps = opts.maxSteps ?? MAX_STEPS;
  const failed = new Set<string>();
  const path: number[] = [];
  const visit = (s: MachineState): boolean => {
    const ready = runnable(s);
    if (hit(s, ready.length === 0)) return true;
    if (ready.length === 0 || path.length >= maxSteps) return false;
    const key = `${path.length}|${stateKey(s)}`;
    if (failed.has(key)) return false;
    for (const t of ready) {
      const r = mstep(mac, s, t) as Extract<MStep, { ok: true }>;
      path.push(t);
      if (visit(r.state)) return true;
      path.pop();
    }
    failed.add(key);
    return false;
  };
  return visit(opts.from ?? initState(mac.p)) ? [...path] : null;
}
