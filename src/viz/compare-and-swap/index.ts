import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { initState } from '../_threads/machine';
import { parseScheduleText, resolveSchedule } from '../_threads2/page';
import { mrun } from '../_threads3/macro';
import { CAP, randomRows } from '../_threads3/page';
import cppSource from './code/cpp/cas.hpp?raw';
import javaSource from './code/java/Cas.java?raw';
import pythonSource from './code/python/cas.py?raw';
import explain from './explain.md?raw';
import abaHit from './examples/aba.json';
import abaMissed from './examples/aba-missed.json';
import everyAba from './examples/every-aba.json';
import everyPlain from './examples/every-plain.json';
import everyThree from './examples/every-three.json';
import everyTwo from './examples/every-two.json';
import lostUpdate from './examples/lost-update.json';
import mostRetries from './examples/most-retries.json';
import oneAtATime from './examples/one-at-a-time.json';
import retryOnce from './examples/retry-once.json';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  macro,
  ops,
  programOf,
  pseudocode,
  threadsOf,
  type CasSettings,
  type CasState,
} from './model';
import { casPractice } from './practice';
import { describe, view } from './view';

export function parseScheduleInput(token: string): Value | Error {
  const s = parseScheduleText(token);
  if (s instanceof Error) return s;
  if (s.split(' ').some((x) => !/^[123]$/.test(x) && !/^T[123]$/.test(x)))
    return new Error('Threads are numbered 1 to 3.');
  return s;
}

const digits = (sched: number[]) => sched.map((t) => t + 1).join(' ');

/** Every thread reads before any swaps: the most retries. */
function allReadFirst(settings: CasSettings) {
  const mac = macro(settings);
  const k = mac.p.threads.length;
  if (programOf(settings) === 'aba') return '1 1 2 2 2 1 1';
  const first = [...Array(k).keys()];
  let s = mrun(mac, first).state;
  const out = [...first];
  // Then, lowest first, each thread runs until it is done or has to read again.
  for (let guard = 0; guard < 60 && s.threads.some((x) => x.status !== 'done'); guard++)
    for (let t = 0; t < k; t++) {
      if (s.threads[t]!.status === 'done') continue;
      const r = mrun(mac, [t], s);
      if (r.stopped) continue;
      s = r.state;
      out.push(t);
    }
  return digits(out);
}

const S = (settings?: Settings) => (settings ?? defaults) as CasSettings;

export const compareAndSwap: VizDef<CasState, CasSettings> = {
  id: 'compare-and-swap',
  title: 'Compare-and-swap (lock-free)',
  family: 'Concurrency',
  blurb:
    'Read, compute, swap only if nothing changed, else retry: a counter without a lock. Then the ABA problem.',
  settings: [
    {
      kind: 'choice',
      key: 'program',
      label: 'Program',
      options: [
        { value: 'counter', label: 'A counter with compare-and-swap' },
        { value: 'plain', label: 'A counter with a plain store (the race)' },
        { value: 'aba', label: 'A lock-free stack and the ABA problem' },
      ],
      help: `Every interleaving goes through up to ${CAP.toLocaleString('en-US')} schedules one by one, and counts more by state.`,
    },
    {
      kind: 'number',
      key: 'threads',
      label: 'Threads',
      min: 2,
      max: 3,
      help: 'For the counters: each thread adds 1 to n once. The stack always has two threads.',
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
      placeholder: 'e.g. 1 2 1 1 1 2',
      maxLength: 60,
      sample: '1 2 1 1 1 2 2 2',
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
          ['run', digits(randomRows(rng, macro(S(settings)), 200))],
        ],
      },
      {
        label: 'Every thread reads first',
        make: (_rng, _size, settings) => [['run', allReadFirst(S(settings))]],
      },
      {
        label: 'One thread at a time',
        make: (_rng, _size, settings) => {
          const mac = macro(S(settings));
          return [['run', digits(mac.rows.flatMap((rows, t) => rows.map(() => t)))]];
        },
      },
      { label: 'Every interleaving', make: () => [['every']] },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'cas(x, a, b)',
      best: { cost: 'O(1)', why: 'One atomic step: compare, and write if equal.' },
      average: { cost: 'O(1)', why: 'Still one step, whether it succeeds or fails.' },
      worst: { cost: 'O(1)', why: 'It never waits: a failed cas returns at once.' },
    },
    {
      op: 'one increment, with k threads trying',
      best: {
        cost: '0 retries',
        why: 'Nobody else changes n between the read and the swap.',
        example: 'one-at-a-time',
      },
      average: {
        cost: 'a few retries',
        why: 'A thread retries once for each other thread that swaps in between.',
        example: 'retry-once',
      },
      worst: {
        cost: 'k − 1 retries',
        why: 'Every other thread wins first; with 3 threads the schedules can add up to 3 retries in all.',
        example: 'most-retries',
      },
    },
  ],
  practice: casPractice(),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as CasSettings),
  },
  examples: [
    retryOnce,
    everyTwo,
    oneAtATime,
    lostUpdate,
    everyPlain,
    everyThree,
    mostRetries,
    abaHit,
    abaMissed,
    everyAba,
  ] as unknown as SavedExample[],
  preview: { example: 'retry-once', level: 2, hide: ['sched'] },
};

/**
 * Driver protocol for the code tabs. The step model is the counter (with or without the cas):
 * "new <program> <k>", then one line per call.
 *   step <t>     thread t's next step -> "n=<v> retries=<r1,r2,...>", "done" (no steps left), or
 *                "none" (no such thread)
 *   run <digits> start over, then step those threads -> the same line, or "stopped"
 *   reset        start over -> "n=0"
 *   threads <k>  at the end: k real threads, each adding 1 a thousand times with the cas
 *                loop -> "ok" when n = 1000 k
 * For the stack (aba), only the last line is checked.
 */
function codeScript(calls: OpCall[], settings: CasSettings) {
  const program = programOf(settings);
  const k = threadsOf(settings);
  const mac = macro(settings);
  const input = [`new ${program} ${k}`];
  const expected: string[] = [];
  if (program !== 'aba') {
    let s = initState(mac.p);
    const show = () =>
      `n=${s.mem.n} retries=${s.threads.map((x) => x.regs.retries ?? 0).join(',')}`;
    for (const [op, arg] of calls) {
      if (/^t\d$/.test(op)) {
        const t = Number(op[1]) - 1;
        input.push(`step ${t + 1}`);
        if (t >= k) {
          expected.push('none');
          continue;
        }
        const r = mrun(mac, [t], s);
        if (r.stopped) expected.push('done');
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
        expected.push('n=0');
      }
    }
  }
  input.push(`threads ${k}`);
  expected.push('ok');
  return { input, expected };
}

export default compareAndSwap;
