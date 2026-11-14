import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { initState, run, runnable } from '../_threads/machine';
import { CAP, parseScheduleText, resolveSchedule } from '../_threads2/page';
import cppSource from './code/cpp/counter.hpp?raw';
import javaSource from './code/java/Counter.java?raw';
import pythonSource from './code/python/counter.py?raw';
import explain from './explain.md?raw';
import everyForget from './examples/every-forget.json';
import everyLocked from './examples/every-locked.json';
import everyStore from './examples/every-store.json';
import forgotUnlock from './examples/forgot-unlock.json';
import storeOnly from './examples/store-only.json';
import threeInLine from './examples/three-in-line.json';
import waitsItsTurn from './examples/waits-its-turn.json';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  program,
  pseudocode,
  type MutexSettings,
  type MutexState,
} from './model';
import { mutexPractice } from './practice';
import { describe, view } from './view';

/** The input box: a schedule of thread numbers, kept as "1 2 2 1". */
export function parseScheduleInput(token: string): Value | Error {
  const s = parseScheduleText(token);
  if (s instanceof Error) return s;
  if (s.split(' ').some((x) => !/^[123]$/.test(x)))
    return new Error('Threads are numbered 1 to 3.');
  return s;
}

/** A schedule that runs to the end, choosing at random which thread steps next. */
function randomSchedule(rng: { int(a: number, b: number): number }, settings: MutexSettings) {
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

/** Every thread asks for the lock first, then they run in turn: the most waiting. */
function allAtOnce(settings: MutexSettings): string {
  const p = program(settings);
  const k = p.threads.length;
  const firsts = Array.from({ length: k }, (_, t) => t);
  let s = run(p, firsts).state;
  const out = [...firsts];
  // Then always step the thread that holds m (or the lowest that can run).
  for (let ready = runnable(s); ready.length; ready = runnable(s)) {
    const h = s.locks.m?.holder;
    const t = h !== null && h !== undefined && ready.includes(h) ? h : ready[0]!;
    out.push(t);
    s = run(p, [t], s).state;
  }
  return out.map((t) => t + 1).join(' ');
}

const oneAtATime = (settings: MutexSettings) => {
  const p = program(settings);
  return p.threads.flatMap((th, t) => th.code.map(() => t + 1)).join(' ');
};

const S = (settings?: Settings) => (settings ?? defaults) as MutexSettings;

export const mutex: VizDef<MutexState, MutexSettings> = {
  id: 'mutex',
  title: 'Mutex (lock)',
  family: 'Concurrency',
  blurb:
    'A lock around count = count + 1: a second thread waits in line, and no interleaving loses an update.',
  settings: [
    {
      kind: 'number',
      key: 'threads',
      label: 'Threads',
      min: 2,
      max: 3,
      help: 'Each thread adds 1 to count once. With 3 threads, Step T3 runs the third.',
    },
    {
      kind: 'choice',
      key: 'lock',
      label: 'The lock',
      options: [
        { value: 'lock', label: 'Around load, add and store' },
        { value: 'store', label: 'Around the store only' },
        { value: 'forget', label: 'T1 forgets to unlock' },
        { value: 'none', label: 'No lock (the race)' },
      ],
      help: `Every interleaving draws the first 20 schedules and goes through up to ${CAP.toLocaleString('en-US')} one by one.`,
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
      placeholder: 'e.g. 1 2 1 1 1 1 2',
      maxLength: 60,
      sample: '1 2 1 1 1 1 2 2 2 2',
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
        make: (rng, _size, settings) => [['run', randomSchedule(rng, S(settings))]],
      },
      {
        label: 'Everyone wants the lock at once',
        make: (_rng, _size, settings) => [['run', allAtOnce(S(settings))]],
      },
      {
        label: 'One thread at a time',
        make: (_rng, _size, settings) => [['run', oneAtATime(S(settings))]],
      },
      { label: 'Every interleaving', make: () => [['every']] },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'lock(m)',
      best: {
        cost: 'O(1)',
        why: 'm is free: the thread takes it and goes on.',
        example: 'every-locked',
      },
      average: { cost: 'O(1) steps', why: 'Taking m or joining the line is one step.' },
      worst: {
        cost: 'waits O(k) critical sections',
        why: 'With k threads in line, the last one waits while every thread ahead of it runs its critical section.',
        example: 'three-in-line',
      },
    },
    {
      op: 'k threads, one increment each, with the lock',
      best: {
        cost: 'Θ(k) steps, no waiting',
        why: 'One thread at a time: 5 steps each, and nobody finds m held.',
      },
      average: {
        cost: 'Θ(k) steps',
        why: 'Each thread runs exactly 5 steps, waiting or not: a lock call that finds m held is one step, and m arrives later without a step of its own.',
      },
      worst: {
        cost: 'Θ(k²) steps spent waiting',
        why: 'All k ask at once: the i-th in line waits through the 4 steps of each thread ahead of it, 2k(k − 1) steps, plus a few while the others line up: 13 for k = 3.',
        example: 'three-in-line',
      },
    },
    {
      op: 'every interleaving of 2 threads',
      best: {
        cost: '10 schedules, 1 outcome',
        why: 'With the lock, a thread that asks while the other holds m just waits, so only 10 orders remain, all ending at 2.',
        example: 'every-locked',
      },
      average: {
        cost: '20 schedules, 2 outcomes',
        why: 'Without the lock (the race), 20 orders, and 18 of them lose an update.',
      },
      worst: {
        cost: 'stuck',
        why: 'A thread that never unlocks leaves the others waiting for ever: 4 of the 9 orders get stuck.',
        example: 'every-forget',
      },
    },
  ],
  practice: mutexPractice(),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MutexSettings),
  },
  examples: [
    waitsItsTurn,
    everyLocked,
    threeInLine,
    storeOnly,
    everyStore,
    forgotUnlock,
    everyForget,
  ] as unknown as SavedExample[],
  preview: { example: 'three-in-line', level: 2 },
};

/**
 * Driver protocol for the code tabs (the default program: every thread locks around its
 * increment): "new <threads>", then one line per call.
 *   step <t>     thread t's next step -> "count=<c> holder=<T or -> line=<T,T or ->",
 *                "waits" (it is in line), "done" (no steps left), "none" (no such thread)
 *   run <digits> start over, then step those threads -> "count=<c> holder=<..> line=<..>", or
 *                "stopped" if one could not step
 *   reset        start over -> "count=0"
 *   threads      at the end: real threads, all at once -> the final count
 * Other settings print only the last line: the code is the fixed program.
 */
function codeScript(calls: OpCall[], settings: MutexSettings) {
  const p = program(settings);
  const k = p.threads.length;
  const input = [`new ${k}`];
  const expected: string[] = [];
  if (settings.lock === 'lock') {
    let s = initState(p);
    const name = (t: number | null) => (t === null ? '-' : `T${t + 1}`);
    const show = () => {
      const l = s.locks.m!;
      return `count=${s.mem.count} holder=${name(l.holder)} line=${l.waiters.length ? l.waiters.map(name).join(',') : '-'}`;
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
      } else if (op === 'reset') {
        input.push('reset');
        s = initState(p);
        expected.push('count=0');
      }
    }
  }
  input.push('threads');
  expected.push(String(k));
  return { input, expected };
}

export default mutex;
