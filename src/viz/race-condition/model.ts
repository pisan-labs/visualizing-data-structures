/**
 * Race conditions: `count = count + 1` in several threads is three steps (load, add, store), and
 * a scheduler that switches threads between them can lose an update. The learner is the
 * scheduler (one operation per thread), runs a given schedule, or tries every interleaving from
 * the current state. The machine is src/viz/_threads; this file adds the race's own narration
 * (who is between a load and a store, which store wipes out an increment) and the tally.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { endId, panelId, varId } from '../../layouts/lanes';
import {
  countOutcomes,
  initState,
  interleavings,
  run,
  step,
  type MachineState,
  type Program,
  type StepEvent,
} from '../_threads/machine';
import { lineId, stepMarks, threadBlock } from '../_threads/page';
import { parseProgram } from '../_threads/parse';

export interface RaceSettings {
  [key: string]: Scalar;
  /** 2 or 3 threads. */
  threads: number;
  /** Increments per thread, 1 or 2. */
  times: number;
}

export const defaults: RaceSettings = { threads: 2, times: 1 };

/** The tally of the last "every interleaving": final count -> how many schedules end there. */
export interface Tally {
  rows: { count: number; schedules: number }[];
  total: number;
  /** Steps already taken when it ran (0: every interleaving from the start). */
  from: number;
  /** How many rows the finished tally has, so the panel keeps room for them while it fills. */
  size: number;
}

export interface RaceState {
  m: MachineState;
  tally?: Tally;
}

type S = RaceState;
type Op = OpSpec<S, RaceSettings, unknown>;
type RaceStep = Step<S, unknown>;

/** The page lists interleavings one by one up to this many; past it, it counts them by state. */
export const CAP = 2000;
/** "Every interleaving" draws this many schedules, then counts the rest without drawing them. */
export const LIST = 20;
/** Longest schedule the input takes: 3 threads, 2 increments, 3 steps each. */
export const MAX_SCHEDULE = 18;

const clampThreads = (n: number) => (n >= 3 ? 3 : 2);
const clampTimes = (n: number) => (n >= 2 ? 2 : 1);

/** The program text: each thread runs load, add, store `times` times. */
export function programText(settings: RaceSettings): string {
  const k = clampThreads(settings.threads);
  const n = clampTimes(settings.times);
  const body = Array.from({ length: n }, () => ['r = count', 'r = r + 1', 'count = r']).flat();
  return [
    'shared count = 0',
    ...Array.from({ length: k }, (_, t) => [
      `thread T${t + 1}`,
      ...body.map((b) => `  ${b}`),
    ]).flat(),
  ].join('\n');
}

const programs = new Map<string, Program>();
export function program(settings: RaceSettings): Program {
  const key = `${clampThreads(settings.threads)}x${clampTimes(settings.times)}`;
  let p = programs.get(key);
  if (!p) {
    const parsed = parseProgram(programText(settings));
    if (parsed instanceof Error) throw parsed;
    p = parsed;
    programs.set(key, p);
  }
  return p;
}

/** Every increment finished so far adds one to what count should be. */
export const expected = (p: Program) => p.threads.length * (p.threads[0]!.code.length / 3);
export const totalSteps = (p: Program) => p.threads.reduce((a, t) => a + t.code.length, 0);

/** Increments finished (stores done) in a state. */
export function stores(s: MachineState): number {
  return s.threads.reduce((a, t) => a + Math.floor(t.pc / 3), 0);
}

/** How far count is behind the increments finished: the updates lost so far. */
export const lost = (s: MachineState) => stores(s) - (s.mem.count ?? 0);

export function vars(p: Program, s: MachineState, more: Record<string, Scalar> = {}) {
  return {
    count: s.mem.count ?? 0,
    finished: stores(s),
    lost: lost(s),
    expected: expected(p),
    steps: s.schedule.length,
    ...more,
  };
}

const T = (t: number) => `T${t + 1}`;
const list = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

/** Threads between their load and their store (holding a copy of count) in a state. */
function inFlight(s: MachineState): number[] {
  return s.threads.flatMap((t, i) => (t.status !== 'done' && t.pc % 3 !== 0 ? [i] : []));
}

/** The race's narration for one step: the machine's sentence, then what it means here. */
export function narrate(p: Program, before: MachineState, ev: StepEvent, after: MachineState) {
  const parts = [ev.say];
  const t = ev.thread;
  if (ev.instr.kind === 'load') {
    const others = inFlight(before).filter((o) => o !== t);
    if (others.length)
      parts.push(
        `${list(others.map(T))} ${others.length > 1 ? 'have' : 'has'} loaded count too and not stored it yet, so an increment will be lost.`,
      );
  }
  if (ev.instr.kind === 'store') {
    const v = after.mem.count!;
    const was = ev.before ?? 0;
    const done = stores(after);
    if (v <= was) {
      const wiped = was - v + 1;
      parts.push(
        `count was already ${was}, so this store wipes out ${wiped === 1 ? 'an increment' : `${wiped} increments`}: ${done} ${done === 1 ? 'increment is' : 'increments are'} finished, but count is ${v}.`,
      );
    } else if (lost(after) > 0)
      parts.push(`${done} increments are finished, but count is only ${v}.`);
  }
  if (after.threads.every((x) => x.status === 'done')) {
    const v = after.mem.count!;
    const e = expected(p);
    parts.push(
      v === e
        ? `Every thread is done: count = ${v}, as expected. No update was lost.`
        : `Every thread is done: count = ${v}, not ${e}. ${e - v === 1 ? 'One update was' : `${e - v} updates were`} lost.`,
    );
  }
  return parts.join(' ');
}

/** Marks for a step: the kit's, plus count in error when a store loses an increment. */
function marks(ev: StepEvent, after: MachineState): Mark[] {
  const m = stepMarks(ev);
  if (ev.instr.kind === 'store' && (after.mem.count ?? 0) <= (ev.before ?? 0)) {
    const i = m.findIndex((x) => x.id === varId('count'));
    if (i >= 0) m[i] = { id: varId('count'), role: 'error' };
  }
  return m;
}

/** One step of thread t as a page step, or the reason it cannot run. */
function oneStep(
  p: Program,
  s: S,
  t: number,
  lines: (pc: number) => string[],
  level: 1 | 2,
): { step: RaceStep; next: S | null } {
  if (t < 0 || t >= p.threads.length) {
    return {
      step: {
        state: s,
        marks: [],
        say:
          t === 2
            ? `There is no thread T3: this run has 2 threads. Set Threads to 3 to add one.`
            : `There is no thread ${t + 1}: the threads are numbered 1 to ${p.threads.length}.`,
        lines: [],
        vars: vars(p, s.m),
        level: 1,
      },
      next: null,
    };
  }
  const r = step(p, s.m, t);
  if (!r.ok) {
    const all = s.m.threads.every((x) => x.status === 'done');
    return {
      step: {
        state: s,
        marks: [{ id: endId(t), role: 'error' }],
        say: `${r.message} ${all ? 'Every thread is done: start over, or try every interleaving.' : 'Step another thread.'}`,
        lines: [],
        vars: vars(p, s.m),
        level: 1,
      },
      next: null,
    };
  }
  const next: S = { ...s, m: r.state };
  return {
    step: {
      state: next,
      marks: marks(r.event, r.state),
      say: narrate(p, s.m, r.event, r.state),
      lines: lines(r.event.pc),
      vars: vars(p, r.state),
      level,
    },
    next,
  };
}

const stepThread = (t: number): Op => ({
  label: `Step ${T(t)}`,
  arity: 0,
  *run(s, _args, { settings }) {
    const p = program(settings);
    const { step: st, next } = oneStep(p, s, t, (pc) => [lineId(t, pc)], 1);
    yield st;
    return next ?? s;
  },
});

/** "1 2 2 1", "1221" or "1,2,2,1": thread numbers, 1 to 3. */
export function parseSchedule(v: Value): number[] | Error {
  const text = String(v).replace(/[\s,]+/g, '');
  if (!text) return new Error('Type a schedule: thread numbers in order, e.g. 1 2 1 1 2 2.');
  if (!/^\d+$/.test(text)) return new Error('A schedule is thread numbers, e.g. 1 2 1 1 2 2.');
  if (text.length > MAX_SCHEDULE) return new Error(`At most ${MAX_SCHEDULE} steps.`);
  return [...text].map((c) => Number(c) - 1);
}

const runOp: Op = {
  label: 'Run schedule',
  arity: 1,
  *run(s, [arg], { settings }) {
    const p = program(settings);
    const sched = parseSchedule(arg ?? '');
    const start: S = { ...s, m: initState(p) };
    if (sched instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: sched.message,
        lines: ['run.sig'],
        vars: vars(p, s.m),
        level: 1,
      };
      return s;
    }
    yield {
      state: start,
      marks: [],
      say: `Run the schedule ${sched.map(T).join(' ')} from the start: count = 0 and every thread is at its first step.`,
      lines: ['run.sig', 'run.reset'],
      vars: vars(p, start.m),
      level: 2,
    };
    let cur = start;
    for (let i = 0; i < sched.length; i++) {
      const t = sched[i]!;
      const { step: st, next } = oneStep(p, cur, t, () => ['run.for', 'run.step'], 2);
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
    if (!cur.m.threads.every((x) => x.status === 'done')) {
      const left = cur.m.threads.flatMap((x, i) => (x.status === 'done' ? [] : [T(i)]));
      yield {
        state: cur,
        marks: [],
        say: `That is the whole schedule. ${list(left)} ${left.length > 1 ? 'have' : 'has'} steps left: step ${left.length > 1 ? 'them' : 'it'} by hand, or try every interleaving from here.`,
        lines: ['run.for'],
        vars: vars(p, cur.m),
        level: 1,
      };
    }
    return cur;
  },
};

/** The tally panel's line for a final count (its shape id). */
export const tallyRowId = (count: number) => `${panelId('every')}-c${count}`;

/** The tally's rows, lowest count first, with the schedule count of each. */
function tallyOf(counts: Map<number, number>, from: number): Tally {
  const rows = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([count, schedules]) => ({ count, schedules }));
  const total = rows.reduce((a, r) => a + r.schedules, 0);
  return { rows, total, from, size: rows.length };
}

const word = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

const everyOp: Op = {
  label: 'Every interleaving',
  arity: 0,
  *run(s, _args, { settings }) {
    const p = program(settings);
    const from = s.m;
    const e = expected(p);
    const fromStart = from.schedule.length === 0;
    const here = fromStart ? 'from the start' : 'from here';
    const outcome = (m: MachineState) => String(m.mem.count);
    const listed = interleavings(p, { from, cap: CAP, outcome });
    let counts: Map<number, number>;
    let byState = false;
    if (listed.complete) {
      counts = new Map();
      for (const r of listed.runs)
        counts.set(Number(r.outcome), (counts.get(Number(r.outcome)) ?? 0) + 1);
    } else {
      byState = true;
      const c = countOutcomes(p, { from, outcome });
      counts = new Map(c.outcomes.map((o) => [Number(o.outcome), o.count]));
    }
    const final = tallyOf(counts, from.schedule.length);
    const total = final.total;
    const left = p.threads.map((_, t) => p.threads[t]!.code.length - from.threads[t]!.pc);
    const busy = left.filter((n) => n > 0);
    const formula =
      busy.length > 1
        ? ` (${busy.reduce((a, b) => a + b, 0)}! / (${busy.map((n) => `${n}!`).join(' × ')}))`
        : '';
    yield {
      state: { ...s, tally: { ...final, rows: [] } },
      marks: [],
      say:
        total === 1
          ? `Every interleaving ${here}: ${busy.length ? `only ${T(left.findIndex((n) => n > 0))} has steps left, so` : 'every thread is done, so'} there is one way to finish.`
          : `Every interleaving ${here}: the ${busy.reduce((a, b) => a + b, 0)} steps left can be ordered in ${total.toLocaleString('en-US')} ways${formula}. Try each schedule, lowest thread first, and count where count ends.${byState ? ` That is more than the ${CAP.toLocaleString('en-US')} the page lists one by one, so past the first ${LIST} it counts them by state: schedules that reach the same state are counted together.` : ''}`,
      lines: ['every.sig'],
      vars: vars(p, from, { schedules: total }),
      level: 2,
    };
    const shown = new Map<number, number>();
    const draw = listed.runs.slice(0, LIST);
    for (let k = 0; k < draw.length; k++) {
      const r = draw[k]!;
      const end = run(p, r.schedule, from).state;
      const c = end.mem.count!;
      shown.set(c, (shown.get(c) ?? 0) + 1);
      const tally = tallyOf(shown, final.from);
      yield {
        state: { m: end, tally: { ...tally, total, size: final.size } },
        marks: [
          { id: varId('count'), role: c === e ? 'found' : 'compare' },
          { id: tallyRowId(c), role: 'active' },
        ],
        say: `Schedule ${k + 1} of ${total.toLocaleString('en-US')}: ${end.schedule.map(T).join(' ')} ends with count = ${c}${c === e ? ', nothing lost' : `: ${e - c === 1 ? 'an update' : `${e - c} updates`} lost`}.`,
        lines: ['every.done', 'every.record'],
        vars: vars(p, end, { schedules: total }),
        level: 2,
      };
    }
    if (total > draw.length) {
      yield {
        state: { ...s, tally: final },
        marks: [{ id: panelId('every'), role: 'active' }],
        say: `The other ${(total - draw.length).toLocaleString('en-US')} schedules are counted without drawing each one.`,
        lines: ['every.for', 'every.rec'],
        vars: vars(p, from, { schedules: total }),
        level: 2,
      };
    }
    const good = counts.get(e) ?? 0;
    const bad = total - good;
    const rows = final.rows.map(
      (r) =>
        `${word(r.schedules, 'schedule')} end${r.schedules === 1 ? 's' : ''} with count = ${r.count}`,
    );
    yield {
      state: { ...s, tally: final },
      marks: final.rows.map((r) => ({
        id: tallyRowId(r.count),
        role: r.count === e ? 'found' : 'compare',
      })),
      say:
        total === 1
          ? `It ends with count = ${final.rows[0]!.count}${final.rows[0]!.count === e ? ': nothing lost' : ''}.`
          : `Of the ${total.toLocaleString('en-US')} interleavings ${here}, ${list(rows)}. ${bad === 0 ? 'None loses an update.' : good === 0 ? 'Every one loses an update.' : `${bad.toLocaleString('en-US')} lose at least one update; only ${good.toLocaleString('en-US')} ${good === 1 ? 'gets' : 'get'} count = ${e}.`}`,
      lines: ['every.sig'],
      vars: vars(p, from, { schedules: total }),
      level: 1,
    };
    return { ...s, tally: final };
  },
};

const resetOp: Op = {
  label: 'Start over',
  arity: 0,
  *run(s, _args, { settings }) {
    const p = program(settings);
    const next: S = { ...s, m: initState(p) };
    yield {
      state: next,
      marks: [],
      say: 'Start over: count = 0, and every thread is back at its first step.',
      lines: ['reset.do'],
      vars: vars(p, next.m),
      level: 1,
    };
    return next;
  },
};

export const ops = {
  t1: stepThread(0),
  t2: stepThread(1),
  t3: stepThread(2),
  run: runOp,
  every: everyOp,
  reset: resetOp,
};

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RaceSettings): PseudoBlock[] {
  const p = program(settings);
  const twice = clampTimes(settings.times) === 2;
  const blocks = p.threads.map((th, t) =>
    threadBlock(p, t, `t${t + 1}`, {
      text: `${th.name}: count = count + 1${twice ? ', twice' : ''}`,
      plain: `${th.name} adds 1 to count${twice ? ' twice' : ''}, three steps each time:`,
    }),
  );
  return [
    ...blocks,
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'run(schedule)', 'To run a schedule:'),
        L('run.reset', 1, 'count = 0; every thread at step 1', 'Start over.'),
        L('run.for', 1, 'for each thread t in schedule', 'Take the thread numbers in order.'),
        L(
          'run.step',
          2,
          'run t’s next step',
          'That thread does its next step: load, add or store.',
        ),
        L(
          'run.stop',
          2,
          'if t has no steps left: stop',
          'A thread that is done cannot step, so stop.',
        ),
      ],
    },
    {
      op: 'every',
      lines: [
        L('every.sig', 0, 'explore(state)', 'To try every interleaving from a state:'),
        L('every.done', 1, 'if no thread has steps left', 'If every thread is done,'),
        L(
          'every.record',
          2,
          'tally[state.count] += 1',
          'count one more schedule that ends with this count.',
        ),
        L(
          'every.for',
          1,
          'for each thread t with steps left',
          'Otherwise, for each thread that can still step,',
        ),
        L(
          'every.rec',
          2,
          'explore(state after t’s next step)',
          'let it step and try everything from there.',
        ),
      ],
    },
    {
      op: 'reset',
      lines: [L('reset.do', 0, 'count = 0; every thread at step 1', 'Start over.')],
    },
  ];
}

export function init(settings: RaceSettings): S {
  return { m: initState(program(settings)) };
}

export function initialSay(_s: S, settings: RaceSettings): string {
  const p = program(settings);
  const k = p.threads.length;
  const twice = clampTimes(settings.times) === 2;
  return `${k} threads each run count = count + 1${twice ? ' twice' : ''}. For the processor that is three steps: load count into a register, add 1, store it back. You are the scheduler: pick which thread takes the next step, and try to make count end below ${expected(p)}.`;
}

export function initialVars(s: S, settings: RaceSettings) {
  return vars(program(settings), s.m);
}
