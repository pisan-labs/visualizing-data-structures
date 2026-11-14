import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { initState, run, runnable } from '../_threads/machine';
import { CAP, parseScheduleText, resolveSchedule } from '../_threads2/page';
import cppSource from './code/cpp/buffer.hpp?raw';
import javaSource from './code/java/BoundedBuffer.java?raw';
import pythonSource from './code/python/buffer.py?raw';
import explain from './explain.md?raw';
import everyIf from './examples/every-if.json';
import everySem from './examples/every-sem.json';
import everyWhile from './examples/every-while.json';
import ifTakesNothing from './examples/if-takes-nothing.json';
import waitsForRoom from './examples/waits-for-room.json';
import whileChecksAgain from './examples/while-checks-again.json';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  program,
  pseudocode,
  sizeOf,
  startOf,
  syncOf,
  type PcSettings,
  type PcState,
} from './model';
import { pcPractice } from './practice';
import { describe, view } from './view';

/** The input box: lane numbers (1 = P1, 2 = C1, 3 = C2) or names, kept as "1 2 2 P1". */
export function parseScheduleInput(token: string): Value | Error {
  const s = parseScheduleText(token);
  if (s instanceof Error) return s;
  if (s.split(' ').some((x) => !/^([123]|P1|C1|C2)$/.test(x)))
    return new Error('The threads are 1 = P1, 2 = C1 and 3 = C2.');
  return s;
}

function randomSchedule(rng: { int(a: number, b: number): number }, settings: PcSettings) {
  const p = program(settings);
  let s = initState(p);
  const out: number[] = [];
  for (let ready = runnable(s); ready.length && out.length < 40; ready = runnable(s)) {
    const t = ready[rng.int(0, ready.length - 1)]!;
    out.push(t);
    s = run(p, [t], s).state;
  }
  return out.map((t) => t + 1).join(' ');
}

/** Run the threads in this order of preference: each step goes to the first that can run. */
function preferring(settings: PcSettings, order: number[]) {
  const p = program(settings);
  let s = initState(p);
  const out: number[] = [];
  for (let ready = runnable(s); ready.length && out.length < 40; ready = runnable(s)) {
    const t = order.find((x) => ready.includes(x))!;
    out.push(t);
    s = run(p, [t], s).state;
  }
  return out.map((t) => t + 1).join(' ');
}

const S = (settings?: Settings) => (settings ?? defaults) as PcSettings;

export const producerConsumer: VizDef<PcState, PcSettings> = {
  id: 'producer-consumer',
  title: 'Producer-consumer (bounded buffer)',
  family: 'Concurrency',
  blurb:
    'A bounded buffer with a lock and two condition variables, or two semaphores, and why the wait sits in a while loop.',
  settings: [
    {
      kind: 'choice',
      key: 'sync',
      label: 'Synchronize with',
      options: [
        { value: 'while', label: 'Lock and 2 condition variables, while' },
        { value: 'if', label: 'Lock and 2 condition variables, if' },
        { value: 'sem', label: 'Two semaphores and a lock' },
      ],
      help: `Every interleaving goes through up to ${CAP.toLocaleString('en-US')} schedules one by one and counts more by state.`,
    },
    {
      kind: 'number',
      key: 'size',
      label: 'Buffer size',
      min: 1,
      max: 2,
      help: 'How many items the buffer holds.',
    },
    {
      kind: 'number',
      key: 'start',
      label: 'Items at the start',
      min: 0,
      max: 1,
      help: 'With 1, two items meet two consumers. With 0, one consumer has to wait at the end.',
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
      placeholder: '1 = P1, 2 = C1, 3 = C2',
      maxLength: 90,
      sample: '1 1 1 1 2 2 2 2 2 2 2',
      parse: parseScheduleInput,
    },
    buttons: [
      { op: 't1', label: 'Step P1', usesInput: false },
      { op: 't2', label: 'Step C1', usesInput: false },
      { op: 't3', label: 'Step C2', usesInput: false },
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
        label: 'Producer first',
        make: (_rng, _size, settings) => [['run', preferring(S(settings), [0, 1, 2])]],
      },
      {
        label: 'Consumers first',
        make: (_rng, _size, settings) => [['run', preferring(S(settings), [1, 2, 0])]],
      },
      { label: 'Every interleaving', make: () => [['every']] },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'put or get',
      best: {
        cost: 'O(1)',
        why: 'There is room (or an item): lock, check, change n, signal, unlock.',
        example: 'every-sem',
      },
      average: { cost: 'O(1) steps', why: 'A wait is one step; the time asleep is not work.' },
      worst: {
        cost: 'sleeps until a signal',
        why: 'The buffer is full (or empty), so the thread sleeps until the other side signals.',
        example: 'waits-for-room',
      },
    },
    {
      op: 'checks per get, with while',
      best: {
        cost: '1',
        why: 'The item is there the first time it looks.',
        example: 'every-while',
      },
      average: { cost: '1 or 2', why: 'A woken thread looks once more.' },
      worst: {
        cost: 'one per wake-up',
        why: 'Each time another thread gets there first, the woken one checks again and sleeps again.',
        example: 'while-checks-again',
      },
    },
    {
      op: 'gets that find no item, with if',
      best: { cost: '0', why: 'One consumer, or no consumer waiting when the item arrives.' },
      average: {
        cost: '52 of 284 schedules',
        why: 'It needs another consumer to get the lock between the signal and the woken one. On a real machine that window is tiny, so it is rare.',
        example: 'every-if',
      },
      worst: {
        cost: '1 per steal',
        why: 'Every time another consumer takes the item first, the woken one takes nothing.',
        example: 'if-takes-nothing',
      },
    },
  ],
  practice: pcPractice(),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PcSettings),
  },
  examples: [
    waitsForRoom,
    everyWhile,
    ifTakesNothing,
    whileChecksAgain,
    everyIf,
    everySem,
  ] as unknown as SavedExample[],
  preview: { example: 'waits-for-room', level: 2 },
};

/**
 * Driver protocol for the code tabs. The step model is the default program (a lock, two
 * condition variables and a while loop): "new <size> <start>", then one line per call.
 *   step <t>     thread t's next step (1 = P1, 2 = C1, 3 = C2) -> "n=<n> holder=<T or ->
 *                line=<..> room=<..> item=<..>" (who waits for m, who sleeps on each), "waits"
 *                (it is blocked), "done" (no steps left)
 *   run <digits> start over, then step those threads -> the same line, or "stopped"
 *   reset        start over -> "n=<start>"
 *   threads <size>  at the end: a real BoundedBuffer, a producer putting 1 to 6 and two
 *                consumers taking 3 each -> "<sum taken> <items left>"
 * With if or semaphores, only the last line is checked.
 */
function codeScript(calls: OpCall[], settings: PcSettings) {
  const size = sizeOf(settings);
  const start = startOf(settings);
  const p = program(settings);
  const input = [`new ${size} ${start}`];
  const expected: string[] = [];
  if (syncOf(settings) === 'while') {
    let s = initState(p);
    const name = (t: number | null) => (t === null ? '-' : p.threads[t]!.name);
    const names = (ts: number[]) => (ts.length ? ts.map(name).join(',') : '-');
    const show = () =>
      `n=${s.mem.n} holder=${name(s.locks.m!.holder)} line=${names(s.locks.m!.waiters)} room=${names(s.conds.room!.waiters)} item=${names(s.conds.item!.waiters)}`;
    for (const [op, arg] of calls) {
      if (/^t\d$/.test(op)) {
        const t = Number(op[1]) - 1;
        input.push(`step ${t + 1}`);
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
        expected.push(`n=${start}`);
      }
    }
  }
  input.push(`threads ${size}`);
  expected.push('21 0');
  return { input, expected };
}

export default producerConsumer;
