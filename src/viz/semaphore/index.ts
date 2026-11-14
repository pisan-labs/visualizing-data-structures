import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { initState, run, runnable } from '../_threads/machine';
import { CAP, parseScheduleText, resolveSchedule } from '../_threads2/page';
import cppSource from './code/cpp/semaphores.hpp?raw';
import javaSource from './code/java/Semaphores.java?raw';
import pythonSource from './code/python/semaphores.py?raw';
import explain from './explain.md?raw';
import everyLimit from './examples/every-limit.json';
import everyTurns from './examples/every-turns.json';
import fullRoom from './examples/full-room.json';
import noLimit from './examples/no-limit.json';
import noTurns from './examples/no-turns.json';
import signalFirst from './examples/signal-first.json';
import oneAtATime from './examples/one-at-a-time.json';
import signalRemembered from './examples/signal-remembered.json';
import {
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  patternOf,
  program,
  pseudocode,
  roomOf,
  type SemSettings,
  type SemState,
} from './model';
import { semaphorePractice } from './practice';
import { describe, view } from './view';

export function parseScheduleInput(token: string): Value | Error {
  const s = parseScheduleText(token);
  if (s instanceof Error) return s;
  if (s.split(' ').some((x) => !/^[123]$/.test(x)))
    return new Error('Threads are numbered 1 to 3.');
  return s;
}

function randomSchedule(rng: { int(a: number, b: number): number }, settings: SemSettings) {
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

/** Each thread as far as it can go, lowest first: the most pressure on the semaphore. */
function pushHard(settings: SemSettings) {
  const p = program(settings);
  let s = initState(p);
  const out: number[] = [];
  // Round-robin: every thread that can run takes a step in turn.
  for (let ready = runnable(s); ready.length; ready = runnable(s))
    for (const t of ready) {
      const r = run(p, [t], s);
      if (r.stopped) continue;
      out.push(t);
      s = r.state;
    }
  return out.map((t) => t + 1).join(' ');
}

/** The highest thread first, as far as it can go, then the next. */
function lastFirst(settings: SemSettings) {
  const p = program(settings);
  let s = initState(p);
  const out: number[] = [];
  for (let ready = runnable(s); ready.length; ready = runnable(s)) {
    const t = ready.at(-1)!;
    out.push(t);
    s = run(p, [t], s).state;
  }
  return out.map((t) => t + 1).join(' ');
}

const S = (settings?: Settings) => (settings ?? defaults) as SemSettings;

export const semaphore: VizDef<SemState, SemSettings> = {
  id: 'semaphore',
  title: 'Semaphores',
  family: 'Concurrency',
  blurb:
    'P takes one, V gives one back: let at most k threads in at once, or make threads take turns.',
  settings: [
    {
      kind: 'choice',
      key: 'pattern',
      label: 'Pattern',
      options: [
        { value: 'limit', label: 'At most k inside (3 threads)' },
        { value: 'first', label: 'T1 prints first' },
        { value: 'turns', label: 'Take turns: ping, pong' },
      ],
      help: 'Three patterns from The Little Book of Semaphores.',
    },
    {
      kind: 'boolean',
      key: 'sync',
      label: 'Use the semaphores',
      help: 'Off runs the same threads with no P and no V, to compare.',
    },
    {
      kind: 'number',
      key: 'room',
      label: 'How many may be inside (k)',
      min: 1,
      max: 3,
      help: `For "At most k inside": the start value of s. Every interleaving goes through up to ${CAP.toLocaleString('en-US')} schedules one by one, and counts more by state.`,
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
      placeholder: 'e.g. 1 2 3 1 1',
      maxLength: 60,
      sample: '1 2 3 1 1 1',
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
        label: 'Every thread in turn, as far as it can',
        make: (_rng, _size, settings) => [['run', pushHard(S(settings))]],
      },
      {
        label: 'The last thread first',
        make: (_rng, _size, settings) => [['run', lastFirst(S(settings))]],
      },
      { label: 'Every interleaving', make: () => [['every']] },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'P(s), V(s)',
      best: {
        cost: 'O(1)',
        why: 'Add or take one; at most one thread to wake.',
        example: 'one-at-a-time',
      },
      average: {
        cost: 'O(1) steps',
        why: 'A P that waits is still one step; the waiting is time, not work.',
      },
      worst: {
        cost: 'waits until a V',
        why: 'A P on a semaphore at 0 or below waits for some other thread’s V, which may never come.',
        example: 'full-room',
      },
    },
    {
      op: 'k threads through a room of r places',
      best: {
        cost: 'no waiting',
        why: 'They arrive one at a time: each leaves before the next one comes.',
        example: 'one-at-a-time',
      },
      average: {
        cost: 'some waiting',
        why: 'Only the threads that arrive while r are inside wait.',
      },
      worst: {
        cost: 'k − r threads wait',
        why: 'All k arrive at once: r get in, and the other k − r wait for a V each.',
        example: 'full-room',
      },
    },
    {
      op: 'every interleaving of ping and pong',
      best: {
        cost: '1 outcome',
        why: 'With the two semaphores, every order the scheduler can pick prints ping pong ping pong.',
        example: 'every-turns',
      },
      average: {
        cost: '43 schedules',
        why: 'Blocked threads take no steps, so 43 orders are possible.',
      },
      worst: {
        cost: '6 outcomes',
        why: 'Without the semaphores, the 4 prints come out in any of C(4, 2) = 6 orders.',
        example: 'no-turns',
      },
    },
  ],
  practice: semaphorePractice(),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SemSettings),
  },
  examples: [
    oneAtATime,
    fullRoom,
    everyLimit,
    noLimit,
    signalFirst,
    signalRemembered,
    everyTurns,
    noTurns,
  ] as unknown as SavedExample[],
  preview: { example: 'full-room', level: 2 },
};

/**
 * Driver protocol for the code tabs. The step model is the room ("at most k inside", with the
 * semaphore): "new <k>", then one line per call.
 *   step <t>     thread t's next step -> "s=<v> line=<T,T or -> out=<words or ->", "waits"
 *                (it is blocked on s), "done" (no steps left), "none" (no such thread)
 *   run <digits> start over, then step those threads -> the same line, or "stopped"
 *   reset        start over -> "s=<k>"
 *   threads <pattern> <k>   at the end: the pattern on real threads -> "ok" for the room (never
 *                more than k inside), the words printed for the other two
 * For the other patterns, or with the semaphores off, only the last line is checked.
 */
function codeScript(calls: OpCall[], settings: SemSettings) {
  const pattern = patternOf(settings);
  const room = roomOf(settings);
  const p = program(settings);
  const input = [`new ${room}`];
  const expected: string[] = [];
  if (pattern === 'limit' && settings.sync !== false) {
    let s = initState(p);
    const name = (t: number) => `T${t + 1}`;
    const show = () => {
      const sem = s.sems.s!;
      return `s=${sem.value} line=${sem.waiters.length ? sem.waiters.map(name).join(',') : '-'} out=${s.out.length ? s.out.map((o) => o.text).join(',') : '-'}`;
    };
    for (const [op, arg] of calls) {
      if (/^t\d$/.test(op)) {
        const t = Number(op[1]) - 1;
        input.push(`step ${t + 1}`);
        if (t >= p.threads.length) {
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
        expected.push(`s=${room}`);
      }
    }
  }
  input.push(`threads ${pattern} ${room}`);
  expected.push(
    pattern === 'limit' ? 'ok' : pattern === 'first' ? 'one two' : 'ping pong ping pong',
  );
  return { input, expected };
}

export default semaphore;
