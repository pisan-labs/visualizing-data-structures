import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { initState } from '../_threads/machine';
import { parseScheduleText, resolveSchedule } from '../_threads2/page';
import { mrun } from '../_threads3/macro';
import { CAP, randomRows, roundRobin } from '../_threads3/page';
import cppSource from './code/cpp/dining.hpp?raw';
import javaSource from './code/java/Dining.java?raw';
import pythonSource from './code/python/dining.py?raw';
import explain from './explain.md?raw';
import everyFour from './examples/every-four.json';
import everyNone from './examples/every-none.json';
import everyOrder from './examples/every-order.json';
import everyWaiter from './examples/every-waiter.json';
import everyoneLeft from './examples/everyone-left.json';
import fourDeadlock from './examples/four-deadlock.json';
import oneAtATime from './examples/one-at-a-time.json';
import rightFirst from './examples/right-first.json';
import waiterSeats from './examples/waiter-seats.json';
import {
  countOf,
  defaults,
  fixOf,
  holders,
  init,
  initialSay,
  initialVars,
  macro,
  ops,
  pseudocode,
  type DiningSettings,
  type DiningState,
} from './model';
import { diningPractice } from './practice';
import { describe, view } from './view';

export function parseScheduleInput(token: string): Value | Error {
  const s = parseScheduleText(token);
  if (s instanceof Error) return s;
  if (s.split(' ').some((x) => !/^[1-4]$/.test(x) && !/^P[1-4]$/.test(x)))
    return new Error('Philosophers are numbered 1 to 4.');
  return s;
}

const digits = (sched: number[]) => sched.map((t) => t + 1).join(' ');

function randomSchedule(rng: { int(a: number, b: number): number }, settings: DiningSettings) {
  const mac = macro(settings);
  return digits(randomRows(rng as never, mac, 200));
}

/** Everyone picks up a first fork, then everyone reaches for the second: the classic. */
function everyoneOnce(settings: DiningSettings) {
  const mac = macro(settings);
  return digits(roundRobin(mac));
}

/** One philosopher eats at a time, P1 first. */
function oneByOne(settings: DiningSettings) {
  const mac = macro(settings);
  return digits(mac.rows.flatMap((rows, t) => rows.map(() => t)));
}

const S = (settings?: Settings) => (settings ?? defaults) as DiningSettings;

export const diningPhilosophers: VizDef<DiningState, DiningSettings> = {
  id: 'dining-philosophers',
  title: 'Dining philosophers',
  family: 'Concurrency',
  blurb:
    'Everyone picks up the left fork: deadlock. Fix it by order (one philosopher reaches right first) or with a waiter.',
  settings: [
    {
      kind: 'number',
      key: 'philosophers',
      label: 'Philosophers',
      min: 3,
      max: 4,
      help: 'Three or four at the table, with a fork between each pair (the classic has five).',
    },
    {
      kind: 'choice',
      key: 'fix',
      label: 'Fix',
      options: [
        { value: 'none', label: 'None: everyone takes the left fork first' },
        { value: 'order', label: 'The last philosopher takes the right fork first' },
        { value: 'waiter', label: 'A waiter seats at most n − 1 (a semaphore)' },
      ],
      help: `Every interleaving goes through up to ${CAP.toLocaleString('en-US')} schedules one by one, and counts more by state.`,
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
      placeholder: 'e.g. 1 2 3 1 2 3',
      maxLength: 60,
      sample: '1 2 3 1 2 3',
      parse: parseScheduleInput,
    },
    buttons: [
      { op: 't1', label: 'Step P1', usesInput: false },
      { op: 't2', label: 'Step P2', usesInput: false },
      { op: 't3', label: 'Step P3', usesInput: false },
      { op: 't4', label: 'Step P4', usesInput: false },
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
        label: 'Everyone in turn, one step each',
        make: (_rng, _size, settings) => [['run', everyoneOnce(S(settings))]],
      },
      {
        label: 'One philosopher at a time',
        make: (_rng, _size, settings) => [['run', oneByOne(S(settings))]],
      },
      { label: 'Every interleaving', make: () => [['every']] },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'pick up a fork (lock)',
      best: { cost: 'O(1)', why: 'The fork is on the table: take it.', example: 'one-at-a-time' },
      average: {
        cost: 'a short wait',
        why: 'A neighbour is eating: wait until it puts the fork down.',
        example: 'right-first',
      },
      worst: {
        cost: 'for ever',
        why: 'Everyone holds a left fork and waits for a right one: a cycle, and nobody puts one down.',
        example: 'everyone-left',
      },
    },
    {
      op: 'every interleaving, 3 philosophers',
      best: {
        cost: '0 deadlocks',
        why: 'One philosopher takes the right fork first: one global order, so no cycle.',
        example: 'every-order',
      },
      average: {
        cost: '0 deadlocks',
        why: 'A waiter seats at most two: one of them always gets both forks.',
        example: 'every-waiter',
      },
      worst: {
        cost: '48 of 3,051',
        why: 'With no fix, the runs where all three pick up a left fork before anyone eats deadlock.',
        example: 'every-none',
      },
    },
  ],
  practice: diningPractice(),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DiningSettings),
  },
  examples: [
    everyoneLeft,
    everyNone,
    oneAtATime,
    rightFirst,
    everyOrder,
    waiterSeats,
    everyWaiter,
    fourDeadlock,
    everyFour,
  ] as unknown as SavedExample[],
  preview: { example: 'everyone-left', level: 2, hide: ['sched', 'panel-table-cap'] },
};

/**
 * Driver protocol for the code tabs: "new <n> <fix>" (fix: none, order or waiter), then one
 * line per call.
 *   step <t>     philosopher t's next step -> "forks=<P1,-,...> waiting=<P2:f2,... or -> ate=<P1,...
 *                or -> [waiter=<v>]", "waits" (it is blocked), "done", or "none" (no such one)
 *   run <digits> start over, then step those philosophers -> the same line, or "stopped"
 *   reset        start over -> "free"
 *   threads      at the end: real threads with the fork order fix and with the waiter, many
 *                meals each, all at once -> "fed"
 */
function codeScript(calls: OpCall[], settings: DiningSettings) {
  const mac = macro(settings);
  const n = countOf(settings);
  const fix = fixOf(settings);
  const input = [`new ${n} ${fix}`];
  const expected: string[] = [];
  let s = initState(mac.p);
  const name = (t: number | null) => (t === null ? '-' : `P${t + 1}`);
  const show = () => {
    const waiting = s.threads.flatMap((x, t) =>
      x.status === 'blocked' ? [`P${t + 1}:${x.on!.name}`] : [],
    );
    const ate = s.out.map((o) => name(o.thread));
    return `forks=${holders(s, n).map(name).join(',')} waiting=${waiting.join(',') || '-'} ate=${ate.join(',') || '-'}${fix === 'waiter' ? ` waiter=${s.sems.waiter!.value}` : ''}`;
  };
  for (const [op, arg] of calls) {
    if (/^t\d$/.test(op)) {
      const t = Number(op[1]) - 1;
      input.push(`step ${t + 1}`);
      if (t >= n) {
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
      expected.push('free');
    }
  }
  input.push('threads');
  expected.push('fed');
  return { input, expected };
}

export default diningPhilosophers;
