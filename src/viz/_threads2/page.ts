/**
 * What the concurrency pages /mutex/, /semaphore/, /producer-consumer/ and /deadlock/ share, on
 * top of the thread machine (src/viz/_threads) and the lanes drawing (src/layouts/lanes.ts): the
 * shape of /race-condition/, made generic. The learner is the scheduler (one operation per
 * thread), runs a typed schedule, or tries every interleaving from where they are and gets a
 * tally of how the runs end.
 *
 * A page gives a `ThreadsSpec`: its program (from the settings), the outcome of a final state
 * (a short text such as "count = 2" or "stuck"), which outcomes are right, its own sentences after
 * the machine's, and its readouts. `threadsOps` makes the operations, `threadsPseudocode` the
 * pseudocode, and `threadsScene` the picture.
 *
 *   threadsOps(spec)                  { t1..tk, run, every, reset }
 *   threadsPseudocode(spec, settings) one block per thread, then run, every and reset
 *   threadsScene(spec, step, settings, stage, extra?)   the lanes, with the tally panel
 *   describeThreads(spec, s, settings) the screen-reader text
 *   parseScheduleText(v) / resolveSchedule(p, text)   the schedule box: thread numbers (1 to 9,
 *                                     in lane order) or names, "1 2 2 1", "1221", "P1 C1 C1"
 *   randomPrefix(rng, p, len)         a schedule of `len` steps by threads that can run
 *   stepCalls(sched) / scheduleText(sched)   the setup that steps threads by hand; the run text
 */
import type { Rng } from '../../engine/rng';
import type {
  Mark,
  MarkRole,
  OpCall,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Settings,
  StageSize,
  Step,
  Value,
} from '../../engine/types';
import {
  drawLanes,
  endId,
  panelId,
  pcId,
  type LanesInput,
  type PanelRow,
} from '../../layouts/lanes';
import type { Scene, Shape } from '../../render/scene';
import {
  countOutcomes,
  finished,
  initState,
  interleavings,
  run,
  runnable,
  step,
  stuck,
  type Instr,
  type MachineState,
  type Program,
  type StepEvent,
} from '../_threads/machine';
import { describeMachine, lanesInput, lineId, plainStep, stepMarks } from '../_threads/page';

/** The tally of the last "every interleaving": outcome -> how many schedules end there. */
export interface Tally {
  rows: { outcome: string; schedules: number }[];
  total: number;
  /** Steps already taken when it ran (0: every interleaving from the start). */
  from: number;
  /** Rows the finished tally has, so the panel keeps room for them while it fills. */
  size: number;
  /** Characters the finished tally's longest line takes. */
  chars: number;
}

export interface ThreadsState {
  m: MachineState;
  tally?: Tally;
}

export interface ThreadsSpec<Set extends Settings, S extends ThreadsState = ThreadsState> {
  program(settings: Set): Program;
  /** A final state's outcome, short: "count = 2", "stuck". It must depend on the state only. */
  outcome(p: Program, s: MachineState, settings: Set): string;
  /** Whether an outcome is what the program is meant to do. */
  good(outcome: string, p: Program, settings: Set): boolean;
  /** The word after a tally line: "ok", "lost" ('' for none). Default ok or wrong. */
  verdict?(outcome: string, p: Program, settings: Set): string;
  /** What a run that ends this way does, after "ends": default `with ${outcome}`. */
  endsWith?(outcome: string): string;
  /** Tally lines in this order (lower first); default the order outcomes first appear. */
  rank?(outcome: string): number;
  /** The page's sentences after the machine's, for a step that ran. */
  narrate?(
    p: Program,
    before: MachineState,
    ev: StepEvent,
    after: MachineState,
    settings: Set,
  ): string[];
  /** Marks for a step that ran (default the kit's stepMarks). */
  marks?(p: Program, ev: StepEvent, after: MachineState, settings: Set): Mark[];
  vars(p: Program, m: MachineState, settings: Set): Record<string, Scalar>;
  /** How many step buttons (t1..tk) the page has: the most threads any setting makes. */
  lanes: number;
  /** Said when a step leaves every thread done or no thread able to run. */
  ending(p: Program, s: MachineState, settings: Set): string;
  /** What starting over puts back, for the narration: "count = 0". */
  startText(p: Program, settings: Set): string;
  /** The pseudocode head of thread t, and plain English for a step (default the kit's). */
  head?(p: Program, t: number, settings: Set): { text: string; plain: string } | undefined;
  plain?(p: Program, t: number, k: number, instr: Instr, settings: Set): string | undefined;
  /** The page state after the machine moves (default: the same, with the new machine state). */
  next?(s: S, m: MachineState): S;
  /** The start state (default { m: initState(p) }). */
  init?(p: Program, settings: Set): S;
}

/** The page lists interleavings one by one up to this many; past it, it counts them by state. */
export const CAP = 2000;
/** "Every interleaving" draws this many schedules, then counts the rest without drawing them. */
export const LIST = 20;
/** The longest schedule the box takes. */
export const MAX_SCHEDULE = 40;

export const word = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const list = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

export const threadName = (p: Program, t: number) => p.threads[t]?.name ?? `thread ${t + 1}`;

/**
 * The schedule box: thread numbers in lane order (1 to 9; "1221" is four steps) or thread names
 * ("P1 C1"), separated by spaces or commas. Kept as a string of space-separated tokens, digits
 * one per step: "1 2 2 1", "P1 C1 C1".
 */
export function parseScheduleText(v: Value): string | Error {
  const raw = String(v).trim();
  if (!raw) return new Error('Type a schedule: thread numbers in order, e.g. 1 2 1 1 2 2.');
  const tokens = raw.split(/[\s,]+/).filter(Boolean);
  const out: string[] = [];
  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      if (tok.includes('0')) return new Error('Threads are numbered from 1, in lane order.');
      out.push(...tok);
    } else if (/^[A-Za-z]{1,4}\d{0,2}$/.test(tok)) out.push(tok.toUpperCase());
    else return new Error('A schedule is thread numbers or names, e.g. 1 2 1 1 2 2.');
  }
  if (out.length > MAX_SCHEDULE) return new Error(`At most ${MAX_SCHEDULE} steps.`);
  return out.join(' ');
}

/** A schedule's thread indices, or what is wrong with it for this program. */
export function resolveSchedule(p: Program, v: Value): number[] | Error {
  const text = parseScheduleText(v);
  if (text instanceof Error) return text;
  const n = p.threads.length;
  const out: number[] = [];
  for (const tok of text.split(' ')) {
    if (/^\d$/.test(tok)) {
      const t = Number(tok) - 1;
      if (t >= n)
        return new Error(
          `There is no thread ${tok}: the threads are numbered 1 to ${n}, in lane order (${p.threads.map((th) => th.name).join(', ')}).`,
        );
      out.push(t);
    } else {
      const t = p.threads.findIndex((th) => th.name.toUpperCase() === tok);
      if (t < 0)
        return new Error(
          `There is no thread ${tok}: the threads are ${list(p.threads.map((th) => th.name))}.`,
        );
      out.push(t);
    }
  }
  return out;
}

/** The schedule as the box writes it: lane numbers, one per step. */
export const scheduleText = (sched: number[]) => sched.map((t) => t + 1).join(' ');

/** The setup that steps these threads one by one, as a learner would. */
export const stepCalls = (sched: number[]): OpCall[] => sched.map((t) => [`t${t + 1}`] as OpCall);

/** A random schedule of up to `len` steps, each by a thread that can run then. */
export function randomPrefix(rng: Rng, p: Program, len: number, from = initState(p)): number[] {
  let s = from;
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const ready = runnable(s);
    if (!ready.length) break;
    const t = ready[rng.int(0, ready.length - 1)]!;
    out.push(t);
    s = run(p, [t], s).state;
  }
  return out;
}

/** Every thread done, or none able to run: the run is over. */
export const over = (s: MachineState) => runnable(s).length === 0;

/** The outcomes of every way to finish from `from`, schedule by schedule (up to CAP). */
export function finishes(
  p: Program,
  from: MachineState,
  outcome: (s: MachineState) => string,
): string[] {
  return interleavings(p, { from, cap: CAP, outcome }).runs.map((r) => r.outcome);
}

function tallyOf<Set extends Settings>(
  spec: ThreadsSpec<Set, ThreadsState>,
  p: Program,
  settings: Set,
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
  void p;
  void settings;
  return { rows, total, from, size, chars };
}

/** The tally panel's line for an outcome (its shape id). */
export const tallyRowId = (outcome: string) =>
  `${panelId('every')}-o-${outcome.replace(/[^A-Za-z0-9]+/g, '_')}`;

const verdictOf = <Set extends Settings, S extends ThreadsState>(
  spec: ThreadsSpec<Set, S>,
  o: string,
  p: Program,
  settings: Set,
) => spec.verdict?.(o, p, settings) ?? (spec.good(o, p, settings) ? 'ok' : 'wrong');

/** The tally panel's lines: one per outcome (keyed by it), then the total. */
export function tallyRows<Set extends Settings, S extends ThreadsState>(
  spec: ThreadsSpec<Set, S>,
  t: Tally,
  p: Program,
  settings: Set,
): PanelRow[] {
  const n = (x: number) => x.toLocaleString('en-US');
  const width = n(t.total).length;
  const label = Math.max(...t.rows.map((r) => r.outcome.length), 0);
  const rows = t.rows.map((r) => ({
    key: `o-${r.outcome.replace(/[^A-Za-z0-9]+/g, '_')}`,
    text: `${`${r.outcome}:`.padEnd(label + 1)} ${n(r.schedules).padStart(width)}  ${verdictOf(spec, r.outcome, p, settings)}`.trimEnd(),
  }));
  return [...rows, { key: 'total', text: `of ${word(t.total, 'schedule')}` }];
}

/** The line a tally panel needs for its widest row, given every outcome and the total. */
function tallyChars<Set extends Settings, S extends ThreadsState>(
  spec: ThreadsSpec<Set, S>,
  outcomes: string[],
  total: number,
  p: Program,
  settings: Set,
): number {
  const width = total.toLocaleString('en-US').length;
  const label = Math.max(0, ...outcomes.map((o) => o.length));
  const verdict = Math.max(0, ...outcomes.map((o) => verdictOf(spec, o, p, settings).length));
  return Math.max(label + 2 + width + 2 + verdict, `of ${word(total, 'schedule')}`.length);
}

type AnyStep<S> = Step<S, unknown>;

export function threadsOps<Set extends Settings, S extends ThreadsState>(
  spec: ThreadsSpec<Set, S>,
): Record<string, OpSpec<S, Set, unknown>> {
  const nextOf = (s: S, m: MachineState): S => (spec.next ? spec.next(s, m) : { ...s, m });
  const startOf = (p: Program, settings: Set, s: S): S =>
    spec.init ? { ...spec.init(p, settings), tally: s.tally } : nextOf(s, initState(p));

  /** One step of thread t as a page step, or the reason it cannot run. */
  const oneStep = (
    p: Program,
    s: S,
    t: number,
    settings: Set,
    lines: (pc: number) => string[],
    level: 1 | 2,
  ): { step: AnyStep<S>; next: S | null } => {
    const vars = spec.vars(p, s.m, settings);
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
    const r = step(p, s.m, t);
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
    const next = nextOf(s, r.state);
    const parts = [r.event.say, ...(spec.narrate?.(p, s.m, r.event, r.state, settings) ?? [])];
    if (over(r.state)) parts.push(spec.ending(p, r.state, settings));
    return {
      step: {
        state: next,
        marks: spec.marks?.(p, r.event, r.state, settings) ?? stepMarks(r.event),
        say: parts.join(' '),
        lines: lines(r.event.pc),
        vars: spec.vars(p, r.state, settings),
        level,
      },
      next,
    };
  };

  const stepThread = (t: number): OpSpec<S, Set, unknown> => ({
    label: `Step thread ${t + 1}`,
    arity: 0,
    *run(s, _args, { settings }) {
      const p = spec.program(settings);
      const { step: st, next } = oneStep(p, s, t, settings, (pc) => [lineId(t, pc)], 1);
      yield st;
      return next ?? s;
    },
  });

  const runOp: OpSpec<S, Set, unknown> = {
    label: 'Run schedule',
    arity: 1,
    *run(s, [arg], { settings }) {
      const p = spec.program(settings);
      const sched = resolveSchedule(p, arg ?? '');
      if (sched instanceof Error) {
        yield {
          state: s,
          marks: [],
          say: sched.message,
          lines: ['run.sig'],
          vars: spec.vars(p, s.m, settings),
          level: 1,
        };
        return s;
      }
      const start = startOf(p, settings, s);
      yield {
        state: start,
        marks: [],
        say: `Run the schedule ${sched.map((t) => threadName(p, t)).join(' ')} from the start: ${spec.startText(p, settings)}, and every thread is at its first step.`,
        lines: ['run.sig', 'run.reset'],
        vars: spec.vars(p, start.m, settings),
        level: 2,
      };
      let cur = start;
      for (let i = 0; i < sched.length; i++) {
        const { step: st, next } = oneStep(
          p,
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
          vars: spec.vars(p, cur.m, settings),
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
      const p = spec.program(settings);
      const from = s.m;
      const here = from.schedule.length === 0 ? 'from the start' : 'from here';
      const outcome = (m: MachineState) => spec.outcome(p, m, settings);
      const listed = interleavings(p, { from, cap: CAP, outcome });
      let counts: Map<string, number>;
      const byState = !listed.complete;
      if (listed.complete) {
        counts = new Map();
        for (const r of listed.runs) counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
      } else {
        const c = countOutcomes(p, { from, outcome });
        counts = new Map(c.outcomes.map((o) => [o.outcome, o.count]));
      }
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const chars = tallyChars(spec, [...counts.keys()], total, p, settings);
      const final = tallyOf(
        spec as unknown as ThreadsSpec<Set, ThreadsState>,
        p,
        settings,
        counts,
        from.schedule.length,
        total,
        counts.size,
        chars,
      );
      const vars = (m: MachineState) => ({ ...spec.vars(p, m, settings), schedules: total });
      const ends = (o: string) => spec.endsWith?.(o) ?? `with ${o}`;
      yield {
        state: { ...s, tally: { ...final, rows: [] } },
        marks: [],
        say:
          total === 1
            ? `Every interleaving ${here}: ${over(from) ? 'no thread can step, so' : 'only one thread can step at each point, so'} there is one way to finish.`
            : `Every interleaving ${here}: try each order of the steps, lowest thread first, and see how each run ends. There are ${total.toLocaleString('en-US')}. A thread that is blocked takes no steps, so blocking cuts the orders down.${byState ? ` That is more than the ${CAP.toLocaleString('en-US')} the page lists one by one, so past the first ${LIST} it counts them by state: schedules that reach the same state are counted together.` : ''}`,
        lines: ['every.sig'],
        vars: vars(from),
        level: 2,
      };
      const shown = new Map<string, number>();
      const draw = listed.runs.slice(0, LIST);
      for (let k = 0; k < draw.length; k++) {
        const r = draw[k]!;
        const end = run(p, r.schedule, from).state;
        shown.set(r.outcome, (shown.get(r.outcome) ?? 0) + 1);
        const tally = tallyOf(
          spec as unknown as ThreadsSpec<Set, ThreadsState>,
          p,
          settings,
          shown,
          final.from,
          total,
          final.size,
          chars,
        );
        const ok = spec.good(r.outcome, p, settings);
        yield {
          state: { ...nextOf(s, end), tally },
          marks: [{ id: tallyRowId(r.outcome), role: ok ? 'found' : 'compare' }],
          say: `Schedule ${k + 1} of ${total.toLocaleString('en-US')}: ${end.schedule
            .slice(from.schedule.length)
            .map((t) => threadName(p, t))
            .join(' ')} ends ${ends(r.outcome)}.`,
          lines: ['every.done', 'every.record'],
          vars: vars(end),
          level: 2,
        };
      }
      if (total > draw.length) {
        yield {
          state: { ...s, tally: final },
          marks: [{ id: panelId('every'), role: 'active' }],
          say: `The other ${(total - draw.length).toLocaleString('en-US')} schedules are counted without drawing each one.`,
          lines: ['every.for', 'every.rec'],
          vars: vars(from),
          level: 2,
        };
      }
      const good = final.rows
        .filter((r) => spec.good(r.outcome, p, settings))
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
          role: spec.good(r.outcome, p, settings) ? 'found' : 'compare',
        })),
        say:
          total === 1
            ? `It ends ${ends(final.rows[0]!.outcome)}.`
            : final.rows.length === 1
              ? `All ${total.toLocaleString('en-US')} interleavings ${here} end ${ends(final.rows[0]!.outcome)}. ${good === total ? 'There is only one outcome, and it is the right one.' : 'Not one ends as the program means.'}`
              : `Of the ${total.toLocaleString('en-US')} interleavings ${here}, ${list(rows)}. ${bad === 0 ? 'Every one ends as the program means.' : good === 0 ? 'Not one ends as the program means.' : `${bad.toLocaleString('en-US')} go wrong; ${good.toLocaleString('en-US')} ${good === 1 ? 'ends' : 'end'} as the program means.`}`,
        lines: ['every.sig'],
        vars: vars(from),
        level: 1,
      };
      return { ...s, tally: final };
    },
  };

  const resetOp: OpSpec<S, Set, unknown> = {
    label: 'Start over',
    arity: 0,
    *run(s, _args, { settings }) {
      const p = spec.program(settings);
      const next = startOf(p, settings, s);
      yield {
        state: next,
        marks: [],
        say: `Start over: ${spec.startText(p, settings)}, and every thread is back at its first step.`,
        lines: ['reset.do'],
        vars: spec.vars(p, next.m, settings),
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

/** One block per thread (op t1, t2, ...), then run, every and reset. */
export function threadsPseudocode<Set extends Settings, S extends ThreadsState>(
  spec: ThreadsSpec<Set, S>,
  settings: Set,
  outcomeLine: { text: string; plain: string },
): PseudoBlock[] {
  const p = spec.program(settings);
  const blocks: PseudoBlock[] = p.threads.map((th, t) => {
    const head = spec.head?.(p, t, settings);
    const lines: PseudoLine[] = [];
    if (head) lines.push(L(`t${t + 1}.head`, 0, head.text, head.plain));
    th.code.forEach((instr, k) => {
      const labels = Object.entries(th.labels)
        .filter(([, at]) => at === k)
        .map(([l]) => `${l}: `)
        .join('');
      lines.push(
        L(
          lineId(t, k),
          head ? 1 : 0,
          `${labels}${instr.text}`,
          spec.plain?.(p, t, k, instr, settings) ?? plainStep(instr),
        ),
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
  /** More panels after the tally (a wait-for graph, the buffer). */
  panels?: LanesInput['panels'];
  /** Shapes to add once the lanes are laid out (they can read where a panel landed). */
  decorate?(shapes: Shape[]): Shape[];
  /** Room for schedule cells (default the kit's reserve). */
  room?: number;
  label?: string;
}

/** The lanes for a step, with the tally panel once "every interleaving" has run. */
export function threadsScene<Set extends Settings, S extends ThreadsState>(
  spec: ThreadsSpec<Set, S>,
  step: Step<S, unknown>,
  settings: Set,
  stage?: StageSize,
  extra: SceneExtra = {},
): Scene {
  const p = spec.program(settings);
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const panels = [
    ...(s.tally
      ? [
          {
            id: 'every',
            title: s.tally.from ? 'every interleaving from here' : 'every interleaving',
            rows: tallyRows(spec, s.tally, p, settings),
            room: s.tally.size + 1,
            chars: s.tally.chars,
          },
        ]
      : []),
    ...(extra.panels ?? []),
  ];
  const { shapes, bounds } = drawLanes(
    lanesInput(p, s.m, { panels: panels.length ? panels : undefined }),
    { roles, stage, room: extra.room },
  );
  const all = extra.decorate ? extra.decorate(shapes) : shapes;
  return { shapes: all, bounds, label: extra.label ?? describeThreads(spec, s, settings) };
}

export function describeThreads<Set extends Settings, S extends ThreadsState>(
  spec: ThreadsSpec<Set, S>,
  s: S,
  settings: Set,
): string {
  const p = spec.program(settings);
  const base = describeMachine(p, s.m);
  const end = stuck(s.m) ? ' No thread can run: the program is stuck.' : '';
  if (!s.tally || !s.tally.rows.length) return base + end;
  const rows = s.tally.rows.map((r) => `${r.schedules} end with ${r.outcome}`).join(', ');
  return `${base}${end} Every interleaving so far: ${rows}, of ${s.tally.total} schedules.`;
}
