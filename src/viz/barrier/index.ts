import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { initState } from '../_threads/machine';
import { parseScheduleText, resolveSchedule } from '../_threads2/page';
import { mrun } from '../_threads3/macro';
import { CAP, randomRows, roundRobin } from '../_threads3/page';
import cppSource from './code/cpp/barrier.hpp?raw';
import javaSource from './code/java/Barrier.java?raw';
import pythonSource from './code/python/barrier.py?raw';
import explain from './explain.md?raw';
import carEarly from './examples/car-early.json';
import car from './examples/car.json';
import everyBarrier from './examples/every-barrier.json';
import everyCar from './examples/every-car.json';
import everyNaive from './examples/every-naive.json';
import everyReusable from './examples/every-reusable.json';
import lapped from './examples/lapped.json';
import noBarrier from './examples/no-barrier.json';
import threeArrive from './examples/three-arrive.json';
import twoRounds from './examples/two-rounds.json';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  macro,
  ops,
  problemOf,
  pseudocode,
  type BarrierSettings,
  type BarrierState,
} from './model';
import { barrierPractice } from './practice';
import { describe, view } from './view';

export function parseScheduleInput(token: string): Value | Error {
  const s = parseScheduleText(token);
  if (s instanceof Error) return s;
  if (s.split(' ').some((x) => !/^[1-4]$/.test(x) && !/^(T[1-3]|R[1-3]|D)$/.test(x)))
    return new Error('Threads are numbered 1 to 4, in lane order.');
  return s;
}

const digits = (sched: number[]) => sched.map((t) => t + 1).join(' ');

/** Every thread as far as it can go, one after another: the last lane first. */
function lastFirst(settings: BarrierSettings) {
  const mac = macro(settings);
  let s = initState(mac.p);
  const out: number[] = [];
  for (let guard = 0; guard < 200; guard++) {
    let moved = false;
    for (let t = mac.p.threads.length - 1; t >= 0; t--) {
      const r = mrun(mac, [t], s);
      if (r.stopped) continue;
      s = r.state;
      out.push(t);
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return digits(out);
}

const S = (settings?: Settings) => (settings ?? defaults) as BarrierSettings;

export const barrier: VizDef<BarrierState, BarrierSettings> = {
  id: 'barrier',
  title: 'Barriers',
  family: 'Concurrency',
  blurb:
    'Nobody goes on until everyone has arrived: a barrier from a count, a lock and a semaphore, a reusable one, and a car for one driver and two riders.',
  settings: [
    {
      kind: 'choice',
      key: 'problem',
      label: 'Problem',
      options: [
        { value: 'barrier', label: 'A barrier for three threads' },
        { value: 'reusable', label: 'A reusable barrier (two rounds)' },
        { value: 'group', label: 'A car: one driver, two riders' },
      ],
      help: `Every interleaving goes through up to ${CAP.toLocaleString('en-US')} schedules one by one, and counts more by state.`,
    },
    {
      kind: 'boolean',
      key: 'naive',
      label: 'Naive version, to compare',
      help: 'No barrier; for two rounds, the one-shot barrier used twice; for the car, riders who leave as soon as they are in.',
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
      placeholder: 'e.g. 1 1 1 2 2 2 3',
      maxLength: 120,
      sample: '1 1 1 2 2 2 3 3 3',
      parse: parseScheduleInput,
    },
    buttons: [
      { op: 't1', label: 'Step lane 1', usesInput: false },
      { op: 't2', label: 'Step lane 2', usesInput: false },
      { op: 't3', label: 'Step lane 3', usesInput: false },
      { op: 't4', label: 'Step lane 4', usesInput: false },
      { op: 'run', label: 'Run schedule', usesInput: true, primary: true },
      { op: 'every', label: 'Every interleaving', usesInput: false },
      { op: 'reset', label: 'Start over', usesInput: false },
    ],
    presets: [
      {
        label: 'A random schedule',
        make: (rng, _size, settings) => [['run', digits(randomRows(rng, macro(S(settings)), 200))]],
      },
      {
        label: 'Everyone in turn, one step each',
        make: (_rng, _size, settings) => [['run', digits(roundRobin(macro(S(settings))))]],
      },
      {
        label: 'The last lane first, as far as it can',
        make: (_rng, _size, settings) => [['run', lastFirst(S(settings))]],
      },
      { label: 'Every interleaving', make: () => [['every']] },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'one thread through the barrier',
      best: {
        cost: 'no wait',
        why: 'It arrives last: it opens the turnstile and walks through.',
        example: 'three-arrive',
      },
      average: { cost: 'O(1) steps', why: 'Add 1 to count, then P and V on the turnstile.' },
      worst: {
        cost: 'until the last one',
        why: 'The first to arrive waits for the other two, however slow they are.',
        example: 'three-arrive',
      },
    },
    {
      op: 'n threads through the barrier',
      best: { cost: 'O(n) steps', why: 'Each adds 1 to count and passes the turnstile once.' },
      average: {
        cost: 'one at a time',
        why: 'The turnstile lets threads through one after another, not all at once.',
      },
      worst: {
        cost: 'O(n) V calls',
        why: 'With the preloaded turnstile, the last to arrive calls V n times.',
        example: 'two-rounds',
      },
    },
  ],
  practice: barrierPractice(),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BarrierSettings),
  },
  examples: [
    threeArrive,
    everyBarrier,
    noBarrier,
    everyNaive,
    twoRounds,
    lapped,
    everyReusable,
    car,
    everyCar,
    carEarly,
  ] as unknown as SavedExample[],
  preview: { example: 'three-arrive', level: 2, hide: ['sched'] },
};

/**
 * Driver protocol for the code tabs. The step model is the barrier for three threads (with the
 * barrier, or naive): "new <problem> <naive 0|1>", then one line per call.
 *   step <t>     thread t's next step -> "count=<c> b=<b> waiting=<T1,T2 or -> early=<T1,... or
 *                ->", "waits" (it is blocked on b), "done", or "none" (no such thread)
 *   run <digits> start over, then step those threads -> the same line, or "stopped"
 *   reset        start over -> "count=0"
 *   threads      at the end: real threads at the one-shot barrier, and at the reusable one for
 *                many rounds -> "ok" when nobody went on early
 * For the reusable barrier and the car, only the last line is checked.
 */
function codeScript(calls: OpCall[], settings: BarrierSettings) {
  const problem = problemOf(settings);
  const naive = settings.naive === true;
  const mac = macro(settings);
  const input = [`new ${problem} ${naive ? 1 : 0}`];
  const expected: string[] = [];
  if (problem === 'barrier') {
    let s = initState(mac.p);
    const show = () => {
      const waiting = s.sems.b?.waiters ?? [];
      const early = [0, 1, 2].filter((t) => s.mem[`e${t + 1}`] === 1);
      const names = (ts: number[]) => ts.map((t) => `T${t + 1}`).join(',') || '-';
      return `count=${s.mem.count} b=${s.sems.b?.value ?? 0} waiting=${names(waiting)} early=${names(early)}`;
    };
    for (const [op, arg] of calls) {
      if (/^t\d$/.test(op)) {
        const t = Number(op[1]) - 1;
        input.push(`step ${t + 1}`);
        if (t >= 3) {
          expected.push('none');
          continue;
        }
        const r = mrun(mac, [t], s);
        if (r.stopped) expected.push(r.stopped.reason === 'blocked' ? 'waits' : 'done');
        else {
          s = r.state;
          expected.push(show());
        }
      } else if (op === 'run') {
        const sched = resolveSchedule(mac.p, arg ?? '');
        if (sched instanceof Error) continue;
        input.push(`run ${sched.map((t) => t + 1).join('')}`);
        const r = mrun(mac, sched);
        s = r.state;
        expected.push(r.stopped ? 'stopped' : show());
      } else if (op === 'reset') {
        input.push('reset');
        s = initState(mac.p);
        expected.push('count=0');
      }
    }
  }
  input.push('threads');
  expected.push('ok');
  return { input, expected };
}

export default barrier;
