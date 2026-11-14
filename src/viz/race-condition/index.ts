import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { initState, interleavings, run, runnable } from '../_threads/machine';
import cppSource from './code/cpp/race.hpp?raw';
import javaSource from './code/java/Race.java?raw';
import pythonSource from './code/python/race.py?raw';
import explain from './explain.md?raw';
import everyThree from './examples/every-three.json';
import everyTwo from './examples/every-two.json';
import lostUpdate from './examples/lost-update.json';
import lowestCount from './examples/lowest-count.json';
import oneAtATime from './examples/one-at-a-time.json';
import threeLoseTwo from './examples/three-lose-two.json';
import {
  CAP,
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  parseSchedule,
  program,
  pseudocode,
  type RaceSettings,
  type RaceState,
} from './model';
import { racePractice } from './practice';
import { describe, view } from './view';

/** The input box: a schedule of thread numbers. Kept as a string such as "121122". */
export function parseScheduleInput(token: string): Value | Error {
  const s = parseSchedule(token);
  if (s instanceof Error) return s;
  if (s.some((t) => t < 0 || t > 2)) return new Error('Threads are numbered 1 to 3.');
  return s.map((t) => t + 1).join('');
}

/** A schedule that runs every thread to the end, choosing at random which steps next. */
function randomSchedule(rng: { int(a: number, b: number): number }, settings: RaceSettings) {
  const p = program(settings);
  let s = initState(p);
  const out: number[] = [];
  for (let ready = runnable(s); ready.length; ready = runnable(s)) {
    const t = ready[rng.int(0, ready.length - 1)]!;
    out.push(t);
    s = run(p, [t], s).state;
  }
  return out.map((t) => t + 1).join('');
}

/** The schedules of the settings that end lowest and highest: the first found, lowest thread first. */
function extreme(settings: RaceSettings, low: boolean): string {
  const p = program(settings);
  const k = p.threads.length;
  const n = p.threads[0]!.code.length;
  if (low && n === 3) {
    // Every thread loads 0 before any stores: all of them store 1.
    const loads = Array.from({ length: k }, (_, t) => t + 1).join('');
    return loads + Array.from({ length: k }, (_, t) => `${t + 1}${t + 1}`).join('');
  }
  if (low) {
    // The classic: T1 loads 0, the others finish all but T2's last increment, T1 stores 1 over
    // them, T2 loads 1, T1 finishes, and T2's last store writes 2.
    const others = Array.from({ length: k - 2 }, (_, t) => String(t + 3).repeat(n)).join('');
    return `1${'2'.repeat(n - 3)}${others}11` + `2${'1'.repeat(n - 3)}22`;
  }
  return Array.from({ length: k }, (_, t) => String(t + 1).repeat(n)).join('');
}

export const raceCondition: VizDef<RaceState, RaceSettings> = {
  id: 'race-condition',
  title: 'Race conditions',
  family: 'Concurrency',
  blurb:
    'count = count + 1 is load, add, store: be the scheduler and lose an update, or try every interleaving.',
  settings: [
    {
      kind: 'number',
      key: 'threads',
      label: 'Threads',
      min: 2,
      max: 3,
      help: 'Each thread adds 1 to count. With 3 threads, Step T3 runs the third.',
    },
    {
      kind: 'number',
      key: 'times',
      label: 'Increments per thread',
      min: 1,
      max: 2,
      help: `Each increment is three steps. Every interleaving draws the first 20 schedules, goes through up to ${CAP.toLocaleString('en-US')} one by one, and counts more than that by state.`,
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'Schedule',
      placeholder: 'e.g. 1 2 1 1 2 2',
      maxLength: 40,
      sample: '1 2 1 2 1 2',
      parse: parseScheduleInput,
    },
    buttons: [
      { op: 't1', label: 'Step T1', usesInput: false },
      { op: 't2', label: 'Step T2', usesInput: false },
      { op: 't3', label: 'Step T3', usesInput: false },
      { op: 'run', label: 'Run schedule', usesInput: true, primary: true },
      { op: 'every', label: 'Every interleaving', usesInput: false },
      { op: 'reset', label: 'Start over', usesInput: false },
    ],
    presets: [
      {
        label: 'A random schedule',
        make: (rng, _size, settings) => [
          ['run', randomSchedule(rng, (settings ?? defaults) as RaceSettings)],
        ],
      },
      {
        label: 'One thread at a time (nothing lost)',
        make: (_rng, _size, settings) => [
          ['run', extreme((settings ?? defaults) as RaceSettings, false)],
        ],
      },
      {
        label: 'The lowest count',
        make: (_rng, _size, settings) => [
          ['run', extreme((settings ?? defaults) as RaceSettings, true)],
        ],
      },
      { label: 'Every interleaving', make: () => [['every']] },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'one step of a thread',
      best: {
        cost: 'O(1)',
        why: 'A load, an add or a store touches one value.',
        example: 'lost-update',
      },
      average: { cost: 'O(1)', why: 'Every step is one of the three.' },
      worst: { cost: 'O(1)', why: 'Even a lost update is one store.' },
    },
    {
      op: 'run a schedule of s steps',
      best: { cost: 'O(s)', why: 'One step per entry.', example: 'one-at-a-time' },
      average: { cost: 'O(s)', why: 'One step per entry, whatever the order.' },
      worst: { cost: 'O(s)', why: 'The order changes the result, not the work.' },
    },
    {
      op: 'every interleaving of 2 threads, n steps each',
      best: {
        cost: 'Θ(C(2n, n))',
        why: 'C(2n, n) = (2n)! / (n! n!) schedules: 20 for n = 3.',
        example: 'every-two',
      },
      average: { cost: 'Θ(C(2n, n))', why: 'The same tree of choices whatever the program does.' },
      worst: {
        cost: 'Θ(4ⁿ / √n)',
        why: 'C(2n, n) grows about as fast as 4ⁿ: one more step in each thread multiplies the schedules by nearly 4.',
        example: 'every-three',
      },
      note: 'k threads of n steps have (kn)! / (n!)ᵏ schedules: 1,680 for three threads of 3 steps, 17,153,136 for three threads of 6.',
    },
  ],
  practice: racePractice(),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RaceSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    lostUpdate,
    oneAtATime,
    everyTwo,
    threeLoseTwo,
    lowestCount,
    everyThree,
  ] as unknown as SavedExample[],
  preview: { example: 'lost-update', level: 2 },
};

/**
 * Driver protocol for the code tabs: "new <threads> <times>", then one line per call.
 *   step <t>     thread t's next step -> "count=<c> r=<r>", "done" (no steps left), "none" (no such thread)
 *   run <digits> start over, then step those threads -> "count=<c>", or "stopped" if one could not step
 *   every        every interleaving from here -> "<count>:<schedules> ..." lowest count first
 *   reset        start over -> "count=0"
 *   threads      at the end: real threads, one at a time -> the final count
 * "every" is left out where the page counts by state (more than CAP schedules).
 */
function codeScript(calls: OpCall[], settings: RaceSettings) {
  const p = program(settings);
  const k = p.threads.length;
  const n = p.threads[0]!.code.length / 3;
  const input = [`new ${k} ${n}`];
  const expected: string[] = [];
  let s = initState(p);
  const stepLine = (t: number) => {
    if (t >= k) return 'none';
    const r = run(p, [t], s);
    if (r.stopped) return 'done';
    s = r.state;
    return `count=${s.mem.count} r=${s.threads[t]!.regs.r}`;
  };
  for (const [op, arg] of calls) {
    if (op === 't1' || op === 't2' || op === 't3') {
      const t = Number(op[1]) - 1;
      input.push(`step ${t + 1}`);
      expected.push(stepLine(t));
    } else if (op === 'run') {
      const sched = parseSchedule(arg ?? '');
      if (sched instanceof Error) continue;
      input.push(`run ${sched.map((t) => t + 1).join('')}`);
      s = initState(p);
      let stopped = false;
      for (const t of sched) {
        const r = t < k ? run(p, [t], s) : null;
        if (!r || r.stopped) {
          stopped = true;
          break;
        }
        s = r.state;
      }
      expected.push(stopped ? 'stopped' : `count=${s.mem.count}`);
    } else if (op === 'every') {
      const all = interleavings(p, { from: s, cap: CAP, outcome: (m) => String(m.mem.count) });
      if (!all.complete) continue;
      input.push('every');
      const rows = [...all.outcomes].sort((a, b) => Number(a.outcome) - Number(b.outcome));
      expected.push(rows.map((o) => `${o.outcome}:${o.count}`).join(' '));
    } else if (op === 'reset') {
      input.push('reset');
      s = initState(p);
      expected.push('count=0');
    }
  }
  input.push('threads');
  expected.push(String(k * n));
  return { input, expected };
}

export default raceCondition;
