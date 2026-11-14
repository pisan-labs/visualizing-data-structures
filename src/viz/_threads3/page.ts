/**
 * What the concurrency pages /dining-philosophers/, /readers-writers/, /barrier/ and
 * /compare-and-swap/ share: the page shape of src/viz/_threads2/page.ts (step a thread, run a
 * schedule, every interleaving with a tally, start over), on rows (macro.ts) instead of single
 * machine steps, with control over what the lanes show.
 *
 * A page gives a `RowsSpec`: its rows (from the settings), what to show (`display`: which shared
 * variables, locks and semaphores, display names and value formats, which registers), the
 * outcome of a final state, which outcomes are right, its own sentences, and its readouts.
 *
 *   rowsOps(spec)                    { t1..tk, run, every, reset }
 *   rowsPseudocode(spec, settings, outcomeLine)   one block per thread, then run, every, reset
 *   rowsScene(spec, step, settings, stage, extra?)  the lanes, with the tally panel
 *   rowsLanes(mac, s, display, panels?)   the input of drawLanes for a state
 *   rowMarks(mac, t, row, events, display)   marks for a row step
 *   describeRows(spec, s, settings)  the screen-reader text
 *   randomRows(rng, mac, len, from?) a random schedule of row steps by threads that can run
 *   roundRobin(mac, from, stop?)     each thread that can step takes one step in turn
 *   finishesFrom(mac, from, outcome) the outcome of every way to finish from a state
 *   lineIds(t, row, rowSpec)         the pseudocode line ids of a row
 *
 * State: { m, sched, tally? }: m is the machine state, sched the threads of the row steps
 * taken so far (the machine keeps its own schedule of machine steps in m.schedule).
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Settings,
  StageSize,
  Step,
} from '../../engine/types';
import {
  drawLanes,
  endId,
  laneId,
  lockId,
  panelId,
  pcId,
  regId,
  semId,
  stepId,
  varId,
  type LanesInput,
  type PanelRow,
} from '../../layouts/lanes';
import type { Scene, Shape } from '../../render/scene';
import type { Rng } from '../../engine/rng';
import {
  finished,
  initState,
  runnable,
  stuck,
  type MachineState,
  type StepEvent,
} from '../_threads/machine';
import { lineId, noteFor, stepMarks } from '../_threads/page';
import { list, resolveSchedule, threadName, word } from '../_threads2/page';
import {
  minterleavings,
  mcount,
  mrun,
  mstep,
  rowNow,
  type Macro,
  type MStep,
  type Row,
} from './macro';

export { list, word, threadName };

export interface Tally {
  rows: { outcome: string; schedules: number }[];
  total: number;
  from: number;
  size: number;
  chars: number;
}

export interface RowsState {
  m: MachineState;
  sched: number[];
  tally?: Tally;
}

/** What the lanes show. Everything is shown unless a list leaves it out. */
export interface Display {
  shared?: string[];
  /** Display names of shared variables (the shape ids keep the program's names). */
  names?: Record<string, string>;
  /** A value as the picture writes it: a register (by thread) or a shared variable. */
  format?: (name: string, v: number, thread?: number) => string;
  locks?: string[];
  sems?: string[];
  conds?: string[];
  /** The registers to show for thread t (default all). */
  regs?: (t: number) => string[];
  /** Show the printed words (default no). */
  output?: boolean;
  /** Schedule cells to reserve (default: every row once, plus one for each row that blocks). */
  room?: number;
  noteChars?: number;
  /** Locks the page draws itself (a table of forks): marks on them stay, though the lanes
   * leave them out. */
  drawnLocks?: string[];
}

export interface RowsSpec<Set extends Settings, S extends RowsState = RowsState> {
  macro(settings: Set): Macro;
  display?(settings: Set): Display;
  /** A final state's outcome, short. It must depend on the state only. */
  outcome(mac: Macro, s: MachineState, settings: Set): string;
  good(outcome: string, mac: Macro, settings: Set): boolean;
  verdict?(outcome: string, mac: Macro, settings: Set): string;
  endsWith?(outcome: string): string;
  rank?(outcome: string): number;
  /** The sentence for a row step that ran, instead of the machine's sentences. */
  say?(
    mac: Macro,
    before: MachineState,
    events: StepEvent[],
    after: MachineState,
    settings: Set,
    row: number,
  ): string | undefined;
  /** The page's sentences after it. */
  narrate?(
    mac: Macro,
    before: MachineState,
    events: StepEvent[],
    after: MachineState,
    settings: Set,
    row: number,
  ): string[];
  vars(mac: Macro, s: S, settings: Set): Record<string, Scalar>;
  /** How many step buttons (t1..tk): the most threads any setting makes. */
  lanes: number;
  ending(mac: Macro, s: MachineState, settings: Set): string;
  startText(mac: Macro, settings: Set): string;
  head?(mac: Macro, t: number, settings: Set): { text: string; plain: string } | undefined;
  next?(s: S, m: MachineState, sched: number[]): S;
  init?(mac: Macro, settings: Set): S;
  /** Row steps before "every interleaving" cuts a schedule off (default 60). */
  maxSteps?: number;
}

export const CAP = 2000;
export const LIST = 20;

const isBlocking = (k: string) => k === 'lock' || k === 'P' || k === 'wait';

/** The pseudocode line ids of a row: one per code line. */
export function lineIds(t: number, row: number, r: Row): string[] {
  return r.code.map((_, j) => (j === 0 ? lineId(t, row) : `${lineId(t, row)}.${j}`));
}

/** Room the schedule strip keeps: a cell per row, plus one per row that can block. */
function reserveRoom(mac: Macro): number {
  let n = 0;
  mac.rows.forEach((rows, t) =>
    rows.forEach((r) => {
      n++;
      if (mac.p.threads[t]!.code.slice(r.from, r.to).some((i) => isBlocking(i.kind))) n++;
    }),
  );
  return n;
}

const shown = (all: string[], pick?: string[]) => (pick ? all.filter((x) => pick.includes(x)) : all);

/** The lanes drawing's input for a state. */
export function rowsLanes(
  mac: Macro,
  s: { m: MachineState; sched: number[] },
  d: Display = {},
  panels?: LanesInput['panels'],
): LanesInput {
  const p = mac.p;
  const m = s.m;
  const n = (t: number) => p.threads[t]!.name;
  const fmt = (name: string, v: number, t?: number) => d.format?.(name, v, t) ?? String(v);
  const users = (uses: (i: (typeof p.threads)[number]['code'][number]) => boolean) =>
    p.threads.filter((th) => th.code.some(uses)).map((th) => th.name);
  const notes = [
    'ready',
    'done',
    'fault',
    ...p.locks.map((l) => `waits for ${l}`),
    ...p.sems.map((x) => `waits on ${x.name}`),
    ...p.conds.map((c) => `sleeps on ${c}`),
  ];
  const outs = p.threads.flatMap((t) => t.code).filter((i) => i.kind === 'print');
  return {
    threads: p.threads.map((th, t) => {
      const ts = m.threads[t]!;
      const regs = d.regs ? d.regs(t) : th.regs;
      return {
        name: th.name,
        steps: mac.rows[t]!.map((r) => r.text),
        pc: rowNow(mac, m, t),
        status: ts.status,
        note: noteFor(m, t),
        regs: regs.map((r) => ({ name: r, value: fmt(r, ts.regs[r] ?? 0, t) })),
      };
    }),
    shared: shown(
      p.shared.map((v) => v.name),
      d.shared,
    ).map((v) => ({ name: d.names?.[v] ?? v, value: fmt(v, m.mem[v] ?? 0) })),
    locks: shown(p.locks, d.locks).map((l) => {
      const st = m.locks[l]!;
      return {
        name: l,
        holder: st.holder === null ? null : n(st.holder),
        waiters: st.waiters.map(n),
        room: users((i) => (i.kind === 'lock' && i.name === l) || (i.kind === 'wait' && i.lock === l)),
      };
    }),
    sems: shown(
      p.sems.map((x) => x.name),
      d.sems,
    ).map((x) => {
      const st = m.sems[x]!;
      return {
        name: x,
        value: String(st.value),
        waiters: st.waiters.map(n),
        room: users((i) => i.kind === 'P' && i.name === x),
      };
    }),
    conds: shown(p.conds, d.conds).map((c) => ({
      name: c,
      waiters: m.conds[c]!.waiters.map(n),
      room: users((i) => i.kind === 'wait' && i.cond === c),
    })),
    output: d.output ? m.out.map((o) => o.text) : undefined,
    panels,
    schedule: s.sched.map(n),
    reserve: {
      schedule: d.room ?? reserveRoom(mac),
      noteChars: d.noteChars ?? Math.max(...notes.map((x) => x.length)),
      output: outs.length,
      outputChars: Math.max(
        1,
        ...outs.map((i) => (i.kind === 'print' && 'text' in i.what ? i.what.text.length : 3)),
      ),
    },
  };
}

const PRIORITY: MarkRole[] = ['error', 'active', 'compare', 'found', 'new', 'done', 'visit'];
const rank = (r: MarkRole) => {
  const k = PRIORITY.indexOf(r);
  return k < 0 ? PRIORITY.length : k;
};

/** Marks for a row step: the kit's marks of each machine step, on the row, for what is shown. */
export function rowMarks(
  mac: Macro,
  t: number,
  row: number,
  events: StepEvent[],
  d: Display = {},
): Mark[] {
  const p = mac.p;
  const vars = new Set(shown(p.shared.map((v) => v.name), d.shared).map(varId));
  const locks = new Set([...shown(p.locks, d.locks), ...(d.drawnLocks ?? [])].map(lockId));
  const sems = new Set(shown(p.sems.map((x) => x.name), d.sems).map(semId));
  const regs = new Set(
    p.threads.flatMap((th, u) => (d.regs ? d.regs(u) : th.regs).map((r) => regId(u, r))),
  );
  const out = new Map<string, MarkRole>();
  const put = (id: string, role: MarkRole) => {
    const was = out.get(id);
    if (was === undefined || rank(role) < rank(was)) out.set(id, role);
  };
  for (const ev of events)
    for (const mk of stepMarks(ev)) {
      let id = mk.id;
      if (id.startsWith(`step-${t}-`) && id !== endId(t)) id = stepId(t, row);
      if (id.startsWith('var-') && !vars.has(id)) continue;
      if (id.startsWith('lock-') && !locks.has(id)) continue;
      if (id.startsWith('sem-') && !sems.has(id)) continue;
      if (id.startsWith('cond-')) continue;
      if (id.startsWith('reg-') && !regs.has(id)) continue;
      put(id, mk.role);
    }
  return [...out.entries()].map(([id, role]) => ({ id, role }));
}

/** A random schedule of up to `len` row steps, each by a thread that can run then. */
export function randomRows(rng: Rng, mac: Macro, len: number, from = initState(mac.p)): number[] {
  let s = from;
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const ready = runnable(s);
    if (!ready.length) break;
    const t = ready[rng.int(0, ready.length - 1)]!;
    out.push(t);
    s = (mstep(mac, s, t) as Extract<MStep, { ok: true }>).state;
  }
  return out;
}

/** Each thread that can step takes one step in turn, lowest first, until none can (or `stop`). */
export function roundRobin(
  mac: Macro,
  from = initState(mac.p),
  stop?: (s: MachineState) => boolean,
  limit = 200,
): number[] {
  let s = from;
  const out: number[] = [];
  while (out.length < limit && runnable(s).length && !stop?.(s)) {
    for (const t of runnable(s)) {
      const r = mstep(mac, s, t);
      if (!r.ok) continue;
      out.push(t);
      s = r.state;
      if (stop?.(s) || out.length >= limit) break;
    }
  }
  return out;
}

/** The outcomes of every way to finish from `from`, schedule by schedule (up to CAP). */
export function finishesFrom(
  mac: Macro,
  from: MachineState,
  outcome: (s: MachineState) => string,
  maxSteps?: number,
): string[] {
  return minterleavings(mac, { from, cap: CAP, outcome, maxSteps }).runs.map((r) => r.outcome);
}

const over = (s: MachineState) => runnable(s).length === 0;

const verdictOf = <Set extends Settings, S extends RowsState>(
  spec: RowsSpec<Set, S>,
  o: string,
  mac: Macro,
  settings: Set,
) => spec.verdict?.(o, mac, settings) ?? (spec.good(o, mac, settings) ? 'ok' : 'wrong');

export const tallyRowId = (outcome: string) =>
  `${panelId('every')}-o-${outcome.replace(/[^A-Za-z0-9]+/g, '_')}`;

export function tallyRows<Set extends Settings, S extends RowsState>(
  spec: RowsSpec<Set, S>,
  t: Tally,
  mac: Macro,
  settings: Set,
): PanelRow[] {
  const n = (x: number) => x.toLocaleString('en-US');
  const width = n(t.total).length;
  const label = Math.max(...t.rows.map((r) => r.outcome.length), 0);
  const rows = t.rows.map((r) => ({
    key: `o-${r.outcome.replace(/[^A-Za-z0-9]+/g, '_')}`,
    text: `${`${r.outcome}:`.padEnd(label + 1)} ${n(r.schedules).padStart(width)}  ${verdictOf(spec, r.outcome, mac, settings)}`.trimEnd(),
  }));
  return [...rows, { key: 'total', text: `of ${word(t.total, 'schedule')}` }];
}

function tallyChars<Set extends Settings, S extends RowsState>(
  spec: RowsSpec<Set, S>,
  outcomes: string[],
  total: number,
  mac: Macro,
  settings: Set,
): number {
  const width = total.toLocaleString('en-US').length;
  const label = Math.max(0, ...outcomes.map((o) => o.length));
  const verdict = Math.max(0, ...outcomes.map((o) => verdictOf(spec, o, mac, settings).length));
  return Math.max(label + 2 + width + 2 + verdict, `of ${word(total, 'schedule')}`.length);
}

function tallyOf<Set extends Settings, S extends RowsState>(
  spec: RowsSpec<Set, S>,
  counts: Map<string, number>,
  from: number,
  total: number,
  size: number,
  chars: number,
): Tally {
  const order = [...counts.keys()];
  const rank = spec.rank ?? ((o: string) => order.indexOf(o));
  const rows = [...counts.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([outcome, schedules]) => ({ outcome, schedules }));
  return { rows, total, from, size, chars };
}

type AnyStep<S> = Step<S, unknown>;

export function rowsOps<Set extends Settings, S extends RowsState>(
  spec: RowsSpec<Set, S>,
): Record<string, OpSpec<S, Set, unknown>> {
  const nextOf = (s: S, m: MachineState, sched: number[]): S =>
    spec.next ? spec.next(s, m, sched) : { ...s, m, sched };
  const startOf = (mac: Macro, settings: Set, s: S): S =>
    spec.init
      ? { ...spec.init(mac, settings), tally: s.tally }
      : nextOf(s, initState(mac.p), []);
  const marksOf = (mac: Macro, settings: Set, t: number, row: number, events: StepEvent[]) =>
    rowMarks(mac, t, row, events, spec.display?.(settings));

  const oneStep = (
    mac: Macro,
    s: S,
    t: number,
    settings: Set,
    lines: (row: number) => string[],
    level: 1 | 2,
  ): { step: AnyStep<S>; next: S | null } => {
    const p = mac.p;
    const vars = spec.vars(mac, s, settings);
    if (t < 0 || t >= p.threads.length) {
      return {
        step: {
          state: s,
          marks: [],
          say: `There is no thread ${t + 1} with these settings: the threads are ${list(p.threads.map((th) => th.name))}.`,
          lines: [],
          vars,
          level: 1,
        },
        next: null,
      };
    }
    const r = mstep(mac, s.m, t);
    if (!r.ok) {
      const end = over(s.m);
      return {
        step: {
          state: s,
          marks: [
            {
              id: r.reason === 'blocked' ? pcId(t) : endId(t),
              role: r.reason === 'blocked' ? 'compare' : 'error',
            },
          ],
          say: `${r.message} ${end ? (finished(s.m) ? 'Every thread is done: start over, or try every interleaving.' : 'No thread can run: the program is stuck. Start over, or try every interleaving.') : 'Step another thread.'}`,
          lines: [],
          vars,
          level: 1,
        },
        next: null,
      };
    }
    const next = nextOf(s, r.state, [...s.sched, t]);
    const said =
      spec.say?.(mac, s.m, r.events, r.state, settings, r.row) ??
      r.events.map((e) => e.say).join(' ');
    const parts = [said, ...(spec.narrate?.(mac, s.m, r.events, r.state, settings, r.row) ?? [])];
    if (over(r.state)) parts.push(spec.ending(mac, r.state, settings));
    return {
      step: {
        state: next,
        marks: marksOf(mac, settings, t, r.row, r.events),
        say: parts.filter(Boolean).join(' '),
        lines: lines(r.row),
        vars: spec.vars(mac, next, settings),
        level,
      },
      next,
    };
  };

  const stepThread = (t: number): OpSpec<S, Set, unknown> => ({
    label: `Step thread ${t + 1}`,
    arity: 0,
    *run(s, _args, { settings }) {
      const mac = spec.macro(settings);
      const rowLines = (row: number) => {
        const r = mac.rows[t]?.[row];
        return r ? lineIds(t, row, r) : [];
      };
      const { step: st, next } = oneStep(mac, s, t, settings, rowLines, 1);
      yield st;
      return next ?? s;
    },
  });

  const runOp: OpSpec<S, Set, unknown> = {
    label: 'Run schedule',
    arity: 1,
    *run(s, [arg], { settings }) {
      const mac = spec.macro(settings);
      const p = mac.p;
      const sched = resolveSchedule(p, arg ?? '');
      if (sched instanceof Error) {
        yield {
          state: s,
          marks: [],
          say: sched.message,
          lines: ['run.sig'],
          vars: spec.vars(mac, s, settings),
          level: 1,
        };
        return s;
      }
      const start = startOf(mac, settings, s);
      yield {
        state: start,
        marks: [],
        say: `Run the schedule ${sched.map((t) => threadName(p, t)).join(' ')} from the start: ${spec.startText(mac, settings)}, and every thread is at its first step.`,
        lines: ['run.sig', 'run.reset'],
        vars: spec.vars(mac, start, settings),
        level: 2,
      };
      let cur = start;
      for (let i = 0; i < sched.length; i++) {
        const { step: st, next } = oneStep(
          mac,
          cur,
          sched[i]!,
          settings,
          () => ['run.for', 'run.step'],
          2,
        );
        if (!next) {
          yield {
            ...st,
            say: `Step ${i + 1} of the schedule: ${st.say} The schedule stops here.`,
            lines: ['run.stop'],
          };
          return cur;
        }
        yield { ...st, say: `Step ${i + 1}: ${st.say}` };
        cur = next;
      }
      if (!over(cur.m)) {
        const ready = runnable(cur.m).map((t) => threadName(p, t));
        const blocked = cur.m.threads.flatMap((x, t) =>
          x.status === 'blocked' ? [threadName(p, t)] : [],
        );
        yield {
          state: cur,
          marks: [],
          say: `That is the whole schedule. ${list(ready)} can still step${blocked.length ? ` (${list(blocked)} ${blocked.length > 1 ? 'wait' : 'waits'})` : ''}: step by hand, or try every interleaving from here.`,
          lines: ['run.for'],
          vars: spec.vars(mac, cur, settings),
          level: 1,
        };
      }
      return cur;
    },
  };

  const everyOp: OpSpec<S, Set, unknown> = {
    label: 'Every interleaving',
    arity: 0,
    *run(s, _args, { settings }) {
      const mac = spec.macro(settings);
      const p = mac.p;
      const from = s.m;
      const here = s.sched.length === 0 ? 'from the start' : 'from here';
      const outcome = (m: MachineState) => spec.outcome(mac, m, settings);
      const maxSteps = spec.maxSteps;
      const listed = minterleavings(mac, { from, cap: CAP, outcome, maxSteps });
      let counts: Map<string, number>;
      const byState = !listed.complete;
      if (listed.complete) {
        counts = new Map();
        for (const r of listed.runs) counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
      } else {
        const c = mcount(mac, { from, outcome, maxSteps });
        counts = new Map(c.outcomes.map((o) => [o.outcome, o.count]));
      }
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const chars = tallyChars(spec, [...counts.keys()], total, mac, settings);
      const final = tallyOf(spec, counts, s.sched.length, total, counts.size, chars);
      const vars = (st: S) => ({ ...spec.vars(mac, st, settings), schedules: total });
      const ends = (o: string) => spec.endsWith?.(o) ?? `with ${o}`;
      const blocks = p.threads.some((th) => th.code.some((i) => isBlocking(i.kind)));
      yield {
        state: { ...s, tally: { ...final, rows: [] } },
        marks: [],
        say:
          total === 1
            ? `Every interleaving ${here}: ${over(from) ? 'no thread can step, so' : 'only one thread can step at each point, so'} there is one way to finish.`
            : `Every interleaving ${here}: try each order of the steps, lowest thread first, and see how each run ends. There are ${total.toLocaleString('en-US')}.${blocks ? ' A thread that is blocked takes no steps, so blocking cuts the orders down.' : ''}${byState ? ` That is more than the ${CAP.toLocaleString('en-US')} the page lists one by one, so past the first ${LIST} it counts them by state: schedules that reach the same state are counted together.` : ''}`,
        lines: ['every.sig'],
        vars: vars(s),
        level: 2,
      };
      const seen = new Map<string, number>();
      const draw = listed.runs.slice(0, LIST);
      for (let k = 0; k < draw.length; k++) {
        const r = draw[k]!;
        const end = mrun(mac, r.schedule, from).state;
        seen.set(r.outcome, (seen.get(r.outcome) ?? 0) + 1);
        const tally = tallyOf(spec, seen, final.from, total, final.size, chars);
        const ok = spec.good(r.outcome, mac, settings);
        const st = { ...nextOf(s, end, [...s.sched, ...r.schedule]), tally };
        yield {
          state: st,
          marks: [{ id: tallyRowId(r.outcome), role: ok ? 'found' : 'compare' }],
          say: `Schedule ${k + 1} of ${total.toLocaleString('en-US')}: ${r.schedule.map((t) => threadName(p, t)).join(' ')} ends ${ends(r.outcome)}.`,
          lines: ['every.done', 'every.record'],
          vars: vars(st),
          level: 2,
        };
      }
      if (total > draw.length) {
        yield {
          state: { ...s, tally: final },
          marks: [{ id: panelId('every'), role: 'active' }],
          say: `The other ${(total - draw.length).toLocaleString('en-US')} schedules are counted without drawing each one.`,
          lines: ['every.for', 'every.rec'],
          vars: vars(s),
          level: 2,
        };
      }
      const good = final.rows
        .filter((r) => spec.good(r.outcome, mac, settings))
        .reduce((a, r) => a + r.schedules, 0);
      const bad = total - good;
      const rows = final.rows.map(
        (r) =>
          `${word(r.schedules, 'schedule')} end${r.schedules === 1 ? 's' : ''} ${ends(r.outcome)}`,
      );
      yield {
        state: { ...s, tally: final },
        marks: final.rows.map((r) => ({
          id: tallyRowId(r.outcome),
          role: spec.good(r.outcome, mac, settings) ? 'found' : 'compare',
        })),
        say:
          total === 1
            ? `It ends ${ends(final.rows[0]!.outcome)}.`
            : final.rows.length === 1
              ? `All ${total.toLocaleString('en-US')} interleavings ${here} end ${ends(final.rows[0]!.outcome)}. ${good === total ? 'There is only one outcome, and it is the right one.' : 'Not one ends as the program means.'}`
              : `Of the ${total.toLocaleString('en-US')} interleavings ${here}, ${list(rows)}. ${bad === 0 ? 'Every one ends as the program means.' : good === 0 ? 'Not one ends as the program means.' : `${bad.toLocaleString('en-US')} go wrong; ${good.toLocaleString('en-US')} ${good === 1 ? 'ends' : 'end'} as the program means.`}`,
        lines: ['every.sig'],
        vars: vars(s),
        level: 1,
      };
      return { ...s, tally: final };
    },
  };

  const resetOp: OpSpec<S, Set, unknown> = {
    label: 'Start over',
    arity: 0,
    *run(s, _args, { settings }) {
      const mac = spec.macro(settings);
      const next = startOf(mac, settings, s);
      yield {
        state: next,
        marks: [],
        say: `Start over: ${spec.startText(mac, settings)}, and every thread is back at its first step.`,
        lines: ['reset.do'],
        vars: spec.vars(mac, next, settings),
        level: 1,
      };
      return next;
    },
  };

  const steps = Object.fromEntries(
    Array.from({ length: spec.lanes }, (_, t) => [`t${t + 1}`, stepThread(t)]),
  );
  return { ...steps, run: runOp, every: everyOp, reset: resetOp };
}

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

/** One block per thread (op t1, t2, ...), one line per code line of each row; then the rest. */
export function rowsPseudocode<Set extends Settings, S extends RowsState>(
  spec: RowsSpec<Set, S>,
  settings: Set,
  outcomeLine: { text: string; plain: string },
): PseudoBlock[] {
  const mac = spec.macro(settings);
  const blocks: PseudoBlock[] = mac.p.threads.map((_, t) => {
    const head = spec.head?.(mac, t, settings);
    const lines: PseudoLine[] = [];
    if (head) lines.push(L(`t${t + 1}.head`, 0, head.text, head.plain));
    mac.rows[t]!.forEach((r, row) => {
      const ids = lineIds(t, row, r);
      r.code.forEach((c, j) =>
        lines.push(L(ids[j]!, (head ? 1 : 0) + (c.indent ?? (j > 0 ? 1 : 0)), c.text, c.plain)),
      );
    });
    return { op: `t${t + 1}`, lines };
  });
  return [
    ...blocks,
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'run(schedule)', 'To run a schedule:'),
        L('run.reset', 1, 'start over', 'Put everything back as it was at the start.'),
        L('run.for', 1, 'for each thread t in schedule', 'Take the thread numbers in order.'),
        L('run.step', 2, 'run t’s next step', 'That thread does its next step.'),
        L(
          'run.stop',
          2,
          'if t cannot step: stop',
          'A thread that is done or blocked cannot step, so stop.',
        ),
      ],
    },
    {
      op: 'every',
      lines: [
        L('every.sig', 0, 'explore(state)', 'To try every interleaving from a state:'),
        L('every.done', 1, 'if no thread can step', 'If every thread is done or blocked,'),
        L('every.record', 2, outcomeLine.text, outcomeLine.plain),
        L(
          'every.for',
          1,
          'for each thread t that can step',
          'Otherwise, for each thread that can step,',
        ),
        L(
          'every.rec',
          2,
          'explore(state after t’s next step)',
          'let it step and try everything from there.',
        ),
      ],
    },
    { op: 'reset', lines: [L('reset.do', 0, 'start over', 'Put everything back as it was.')] },
  ];
}

export interface SceneExtra {
  panels?: LanesInput['panels'];
  decorate?(shapes: Shape[]): Shape[];
  label?: string;
}

export function rowsScene<Set extends Settings, S extends RowsState>(
  spec: RowsSpec<Set, S>,
  step: Step<S, unknown>,
  settings: Set,
  stage?: StageSize,
  extra: SceneExtra = {},
): Scene {
  const mac = spec.macro(settings);
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const d = spec.display?.(settings) ?? {};
  const panels = [
    ...(s.tally
      ? [
          {
            id: 'every',
            title: s.tally.from ? 'every interleaving from here' : 'every interleaving',
            rows: tallyRows(spec, s.tally, mac, settings),
            room: s.tally.size + 1,
            chars: s.tally.chars,
          },
        ]
      : []),
    ...(extra.panels ?? []),
  ];
  const { shapes, bounds } = drawLanes(rowsLanes(mac, s, d, panels.length ? panels : undefined), {
    roles,
    stage,
  });
  const all = extra.decorate ? extra.decorate(shapes) : shapes;
  return { shapes: all, bounds, label: extra.label ?? describeRows(spec, s, settings) };
}

/** One paragraph for screen readers. */
export function describeRows<Set extends Settings, S extends RowsState>(
  spec: RowsSpec<Set, S>,
  s: S,
  settings: Set,
): string {
  const mac = spec.macro(settings);
  const p = mac.p;
  const d = spec.display?.(settings) ?? {};
  const fmt = (name: string, v: number, t?: number) => d.format?.(name, v, t) ?? String(v);
  const threads = p.threads.map((th, t) => {
    const ts = s.m.threads[t]!;
    const row = rowNow(mac, s.m, t);
    const regs = (d.regs ? d.regs(t) : th.regs)
      .map((r) => `${r} = ${fmt(r, ts.regs[r] ?? 0, t)}`)
      .join(', ');
    const where =
      ts.status === 'done'
        ? 'done'
        : `next step ${row + 1}, ${mac.rows[t]![row]?.text ?? 'end'}${ts.status === 'ready' ? '' : ` (${noteFor(s.m, t)})`}`;
    return `${th.name}: ${where}${regs ? `; ${regs}` : ''}.`;
  });
  const mem = shown(
    p.shared.map((v) => v.name),
    d.shared,
  )
    .map((v) => `${d.names?.[v] ?? v} = ${fmt(v, s.m.mem[v] ?? 0)}`)
    .join(', ');
  const locks = shown(p.locks, d.locks).map((l) => {
    const h = s.m.locks[l]!.holder;
    return `lock ${l} ${h === null ? 'free' : `held by ${p.threads[h]!.name}`}`;
  });
  const sems = shown(
    p.sems.map((x) => x.name),
    d.sems,
  ).map((x) => `semaphore ${x} = ${s.m.sems[x]!.value}`);
  const shared = [mem, ...locks, ...sems].filter(Boolean).join('; ');
  const steps = s.sched.length
    ? `${s.sched.length} steps so far: ${s.sched.map((t) => p.threads[t]!.name).join(' ')}.`
    : 'No steps yet.';
  const end = stuck(s.m) ? ' No thread can run: the program is stuck.' : '';
  const base = `${threads.join(' ')} ${shared ? `Shared: ${shared}.` : ''} ${steps}${end}`
    .replace(/\s+/g, ' ')
    .trim();
  if (!s.tally || !s.tally.rows.length) return base;
  const rows = s.tally.rows.map((r) => `${r.schedules} end with ${r.outcome}`).join(', ');
  return `${base} Every interleaving so far: ${rows}, of ${s.tally.total} schedules.`;
}

/** The lane frame of thread t (for marks that light a whole lane). */
export { laneId };
