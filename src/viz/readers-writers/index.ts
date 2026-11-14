import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { initState } from '../_threads/machine';
import { parseScheduleText, resolveSchedule } from '../_threads2/page';
import { mrun } from '../_threads3/macro';
import { CAP, randomRows, roundRobin } from '../_threads3/page';
import cppSource from './code/cpp/rwlock.hpp?raw';
import javaSource from './code/java/RwLock.java?raw';
import pythonSource from './code/python/rwlock.py?raw';
import explain from './explain.md?raw';
import everyMutex from './examples/every-mutex.json';
import everyReaders from './examples/every-readers.json';
import everyTurnstile from './examples/every-turnstile.json';
import oneLock from './examples/one-lock.json';
import readersShare from './examples/readers-share.json';
import starved from './examples/starved.json';
import streamOfThree from './examples/stream-of-three.json';
import turnstileHolds from './examples/turnstile-holds.json';
import writerFirst from './examples/writer-first.json';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  macro,
  ops,
  pseudocode,
  readersOf,
  variantOf,
  type RwSettings,
  type RwState,
} from './model';
import { rwPractice } from './practice';
import { describe, view } from './view';

export function parseScheduleInput(token: string): Value | Error {
  const s = parseScheduleText(token);
  if (s instanceof Error) return s;
  if (s.split(' ').some((x) => !/^[1-4]$/.test(x) && !/^(R[1-3]|W)$/.test(x)))
    return new Error('Name the threads W, R1, R2, R3, or number them 1 to 4 in lane order.');
  return s;
}

const digits = (sched: number[]) => sched.map((t) => t + 1).join(' ');

/** A reader goes in, then the writer comes, then the other readers, one after another. */
function stream(settings: RwSettings) {
  const mac = macro(settings);
  const k = readersOf(settings);
  const w = 0;
  // R1 goes in and reads; the writer starts; then each next reader goes in before the one before
  // it leaves.
  const out: number[] = [];
  let s = initState(mac.p);
  const go = (t: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const r = mrun(mac, [t], s);
      if (r.stopped) return;
      s = r.state;
      out.push(t);
    }
  };
  const enter = variantOf(settings) === 'turnstile' ? 3 : variantOf(settings) === 'mutex' ? 1 : 2;
  go(1, enter);
  go(w, 2);
  for (let t = 2; t <= k; t++) {
    go(t, enter);
    go(t - 1, 9);
  }
  out.push(...roundRobin(mac, s));
  return digits(out);
}

const S = (settings?: Settings) => (settings ?? defaults) as RwSettings;

export const readersWriters: VizDef<RwState, RwSettings> = {
  id: 'readers-writers',
  title: 'Readers and writers',
  family: 'Concurrency',
  blurb:
    'Many readers at once or one writer alone: a read-write lock from a lock, a count and a semaphore, and the writer it can starve.',
  settings: [
    {
      kind: 'choice',
      key: 'variant',
      label: 'Lock',
      options: [
        { value: 'readers', label: 'Read-write lock, readers first' },
        { value: 'turnstile', label: 'Read-write lock with a turnstile (no starving)' },
        { value: 'mutex', label: 'One lock for everyone (no sharing)' },
      ],
      help: `Every interleaving goes through up to ${CAP.toLocaleString('en-US')} schedules one by one, and counts more by state.`,
    },
    {
      kind: 'number',
      key: 'readers',
      label: 'Readers',
      min: 2,
      max: 3,
      help: 'Each reader reads once; the writer writes once. The writer is the first lane.',
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
      placeholder: 'e.g. R1 R1 R1 W R2',
      maxLength: 80,
      sample: 'R1 R1 R1 W R2 R2 R2',
      parse: parseScheduleInput,
    },
    buttons: [
      { op: 't1', label: 'Step W', usesInput: false },
      { op: 't2', label: 'Step R1', usesInput: false },
      { op: 't3', label: 'Step R2', usesInput: false },
      { op: 't4', label: 'Step R3', usesInput: false },
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
        label: 'A stream of readers',
        make: (_rng, _size, settings) => [['run', stream(S(settings))]],
      },
      {
        label: 'Everyone in turn, one step each',
        make: (_rng, _size, settings) => [['run', digits(roundRobin(macro(S(settings))))]],
      },
      { label: 'Every interleaving', make: () => [['every']] },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'a reader gets in',
      best: {
        cost: 'O(1)',
        why: 'Readers are already inside: add 1 to n and go in, no waiting.',
        example: 'readers-share',
      },
      average: {
        cost: 'waits for m',
        why: 'Another reader holds m for a moment while it updates n.',
      },
      worst: {
        cost: 'waits for the writer',
        why: 'The first reader in waits on room while the writer is inside, and holds m, so the rest wait behind it.',
        example: 'writer-first',
      },
    },
    {
      op: 'the writer gets in',
      best: { cost: 'O(1)', why: 'The room is empty: P(room) and go in.', example: 'writer-first' },
      average: {
        cost: 'after the readers inside',
        why: 'With the turnstile, readers who come later wait behind the writer.',
        example: 'turnstile-holds',
      },
      worst: {
        cost: 'never, perhaps',
        why: 'Readers first: while readers keep overlapping, n never gets back to 0 and room never comes back.',
        example: 'stream-of-three',
      },
    },
  ],
  practice: rwPractice(),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RwSettings),
  },
  examples: [
    readersShare,
    writerFirst,
    starved,
    streamOfThree,
    everyReaders,
    turnstileHolds,
    everyTurnstile,
    oneLock,
    everyMutex,
  ] as unknown as SavedExample[],
  preview: { example: 'starved', level: 2, hide: ['sched'] },
};

/**
 * Driver protocol for the code tabs. The step model is the read-write lock, readers first:
 * "new <variant> <k>", then one line per call.
 *   step <t>     lane t's next step -> "n=<n> room=<v> m=<holder or -> waiting=<R1:m,W:room,...
 *                or ->", "waits" (it is blocked), "done", or "none" (no such lane)
 *   run <digits> start over, then step those lanes -> the same line, or "stopped"
 *   reset        start over -> "n=0"
 *   threads      at the end: real readers and a writer on the lock, many times -> "ok" when no
 *                reader ever saw the writer inside and the writer never saw a reader
 * For the other two variants, only the last line is checked.
 */
function codeScript(calls: OpCall[], settings: RwSettings) {
  const variant = variantOf(settings);
  const k = readersOf(settings);
  const mac = macro(settings);
  const input = [`new ${variant} ${k}`];
  const expected: string[] = [];
  if (variant === 'readers') {
    let s = initState(mac.p);
    const name = (t: number) => mac.p.threads[t]!.name;
    const show = () => {
      const h = s.locks.m!.holder;
      const waiting = s.threads.flatMap((x, t) =>
        x.status === 'blocked' ? [`${name(t)}:${x.on!.name}`] : [],
      );
      return `n=${s.mem.n} room=${s.sems.room!.value} m=${h === null ? '-' : name(h)} waiting=${waiting.join(',') || '-'}`;
    };
    for (const [op, arg] of calls) {
      if (/^t\d$/.test(op)) {
        const t = Number(op[1]) - 1;
        input.push(`step ${t + 1}`);
        if (t > k) {
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
        expected.push('n=0');
      }
    }
  }
  input.push('threads');
  expected.push('ok');
  return { input, expected };
}

export default readersWriters;
