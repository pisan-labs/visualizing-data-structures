import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { initState, run, runnable } from '../_threads/machine';
import { CAP, parseScheduleText, resolveSchedule } from '../_threads2/page';
import cppSource from './code/cpp/locks.hpp?raw';
import javaSource from './code/java/Locks.java?raw';
import pythonSource from './code/python/locks.py?raw';
import explain from './explain.md?raw';
import behindTheCycle from './examples/behind-the-cycle.json';
import everyGlobal from './examples/every-global.json';
import everyOpposite from './examples/every-opposite.json';
import everyThree from './examples/every-three.json';
import findTheCycle from './examples/find-the-cycle.json';
import oneAtATime from './examples/one-at-a-time.json';
import oppositeOrders from './examples/opposite-orders.json';
import {
  cycleOf,
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  orderOf,
  program,
  pseudocode,
  type DeadlockSettings,
  type DeadlockState,
} from './model';
import { deadlockPractice } from './practice';
import { describe, view } from './view';

export function parseScheduleInput(token: string): Value | Error {
  const s = parseScheduleText(token);
  if (s instanceof Error) return s;
  if (s.split(' ').some((x) => !/^[123]$/.test(x)))
    return new Error('Threads are numbered 1 to 3.');
  return s;
}

function randomSchedule(rng: { int(a: number, b: number): number }, settings: DeadlockSettings) {
  const p = program(settings);
  let s = initState(p);
  const out: number[] = [];
  for (let ready = runnable(s); ready.length; ready = runnable(s)) {
    const t = ready[rng.int(0, ready.length - 1)]!;
    out.push(t);
    s = run(p, [t], s).state;
  }
  return out.map((t) => t + 1).join(' ');
}

/** Every thread takes its first lock, then each tries its second: the deadlock if there is one. */
function firstLocks(settings: DeadlockSettings) {
  const p = program(settings);
  const k = p.threads.length;
  const order = [...Array(k).keys(), ...Array(k).keys()];
  let s = initState(p);
  const out: number[] = [];
  for (const t of order) {
    const r = run(p, [t], s);
    if (r.stopped) continue;
    out.push(t);
    s = r.state;
  }
  // Then let whatever can run finish, lowest first.
  for (let ready = runnable(s); ready.length; ready = runnable(s)) {
    out.push(ready[0]!);
    s = run(p, [ready[0]!], s).state;
  }
  return out.map((t) => t + 1).join(' ');
}

const S = (settings?: Settings) => (settings ?? defaults) as DeadlockSettings;

export const deadlock: VizDef<DeadlockState, DeadlockSettings> = {
  id: 'deadlock',
  title: 'Deadlock',
  family: 'Concurrency',
  blurb:
    'Two locks taken in opposite orders: each thread waits for the other for ever. Find the cycle, then fix it with one global order.',
  settings: [
    {
      kind: 'number',
      key: 'threads',
      label: 'Threads',
      min: 2,
      max: 3,
      help: 'With 3, T1 and T3 take a first and T2 takes b first.',
    },
    {
      kind: 'choice',
      key: 'order',
      label: 'Lock order',
      options: [
        { value: 'opposite', label: 'T2 takes b first (opposite)' },
        { value: 'global', label: 'Everyone takes a first (one global order)' },
      ],
      help: `Every interleaving goes through up to ${CAP.toLocaleString('en-US')} schedules one by one.`,
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
      placeholder: 'e.g. 1 2 1 2',
      maxLength: 40,
      sample: '1 2 1 2',
      parse: parseScheduleInput,
    },
    buttons: [
      { op: 't1', label: 'Step T1', usesInput: false },
      { op: 't2', label: 'Step T2', usesInput: false },
      { op: 't3', label: 'Step T3', usesInput: false },
      { op: 'run', label: 'Run schedule', usesInput: true, primary: true },
      { op: 'every', label: 'Every interleaving', usesInput: false },
      { op: 'cycle', label: 'Find the cycle', usesInput: false },
      { op: 'reset', label: 'Start over', usesInput: false },
    ],
    presets: [
      {
        label: 'A random schedule',
        make: (rng, _size, settings) => [['run', randomSchedule(rng, S(settings))]],
      },
      {
        label: 'Everyone takes a first lock',
        make: (_rng, _size, settings) => [['run', firstLocks(S(settings))], ['cycle']],
      },
      {
        label: 'One thread at a time',
        make: (_rng, _size, settings) => [
          [
            'run',
            program(S(settings))
              .threads.flatMap((_, t) => [t + 1, t + 1, t + 1, t + 1])
              .join(' '),
          ],
        ],
      },
      { label: 'Every interleaving', make: () => [['every']] },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'find the cycle in the wait-for graph',
      best: {
        cost: 'O(V)',
        why: 'Nobody waits: building the graph looks at each thread once and finds no edges to follow.',
        example: 'one-at-a-time',
      },
      average: {
        cost: 'O(V + E)',
        why: 'Depth-first search visits each thread and each edge once, as on the DFS page.',
        example: 'find-the-cycle',
      },
      worst: {
        cost: 'O(V)',
        why: 'With locks, each thread waits for at most one other, so E ≤ V and the search is linear in the threads.',
        example: 'behind-the-cycle',
      },
    },
    {
      op: 'every interleaving of two threads',
      best: {
        cost: '0 deadlocks',
        why: 'One global order: whoever holds b already holds a, so no cycle can form.',
        example: 'every-global',
      },
      average: {
        cost: '4 of 14 deadlock',
        why: 'Opposite orders: a schedule deadlocks once each thread holds its first lock.',
      },
      worst: {
        cost: 'certain',
        why: 'From the moment T1 holds a and T2 holds b, every way to go on deadlocks.',
        example: 'opposite-orders',
      },
    },
  ],
  practice: deadlockPractice(),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      codeScript(calls, settings as DeadlockSettings),
  },
  examples: [
    oppositeOrders,
    findTheCycle,
    everyOpposite,
    oneAtATime,
    everyGlobal,
    behindTheCycle,
    everyThree,
  ] as unknown as SavedExample[],
  preview: { example: 'find-the-cycle', level: 2 },
};

/**
 * Driver protocol for the code tabs: "new <threads> <order>" (order: opposite or global), then
 * one line per call.
 *   step <t>     thread t's next step -> "a=<T or -> b=<T or -> waiting=<T:lock,... or ->",
 *                "waits" (it is blocked), "done" (no steps left), "none" (no such thread)
 *   run <digits> start over, then step those threads -> the same line, or "stopped"
 *   cycle        the cycle of the wait-for graph, as the search finds it -> "T1 T2" or "none"
 *   reset        start over -> "free"
 *   threads      at the end: real threads taking the locks in one global order, all at once,
 *                many times -> "done"
 */
function codeScript(calls: OpCall[], settings: DeadlockSettings) {
  const p = program(settings);
  const k = p.threads.length;
  const input = [`new ${k} ${orderOf(settings)}`];
  const expected: string[] = [];
  let s = initState(p);
  const name = (t: number | null) => (t === null ? '-' : `T${t + 1}`);
  const show = () => {
    const waiting = s.threads.flatMap((x, t) =>
      x.status === 'blocked' ? [`T${t + 1}:${x.on!.name}`] : [],
    );
    return `a=${name(s.locks.a!.holder)} b=${name(s.locks.b!.holder)} waiting=${waiting.join(',') || '-'}`;
  };
  for (const [op, arg] of calls) {
    if (/^t\d$/.test(op)) {
      const t = Number(op[1]) - 1;
      input.push(`step ${t + 1}`);
      if (t >= k) {
        expected.push('none');
        continue;
      }
      const r = run(p, [t], s);
      if (r.stopped) expected.push(r.stopped.reason === 'blocked' ? 'waits' : 'done');
      else {
        s = r.state;
        expected.push(show());
      }
    } else if (op === 'run') {
      const sched = resolveSchedule(p, arg ?? '');
      if (sched instanceof Error) continue;
      input.push(`run ${sched.map((t) => t + 1).join('')}`);
      const r = run(p, sched);
      s = r.state;
      expected.push(r.stopped ? 'stopped' : show());
    } else if (op === 'cycle') {
      input.push('cycle');
      const c = cycleOf(s);
      expected.push(c ? c.map((t) => `T${t + 1}`).join(' ') : 'none');
    } else if (op === 'reset') {
      input.push('reset');
      s = initState(p);
      expected.push('free');
    }
  }
  input.push('threads');
  expected.push('done');
  return { input, expected };
}

export default deadlock;
