import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/scheduler.hpp?raw';
import javaSource from './code/java/Scheduler.java?raw';
import pythonSource from './code/python/scheduler.py?raw';
import burst from './examples/burst.json';
import equalLengths from './examples/equal-lengths.json';
import lateArrival from './examples/late-arrival.json';
import longAndShort from './examples/long-and-short.json';
import oneLong from './examples/one-long.json';
import staticWaits from './examples/static-waits.json';
import steady from './examples/steady.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  fitting,
  init,
  initialSay,
  initialVars,
  MAX_OUT,
  MAX_PROMPT,
  NAMES,
  ops,
  pseudocode,
  type CbSettings,
  type CbState,
  type Spec,
} from './model';
import { batchingPractice } from './practice';
import { view } from './view';

const calls = (specs: Spec[]): OpCall[] => [
  ...fitting(specs).map((x): OpCall => ['add', ...x]),
  ['run'],
];

const preset = (label: string, make: (rng: Rng, size: number) => Spec[]): Preset => ({
  label,
  make: (rng, size) => calls(make(rng, size)),
});

export const continuousBatching: VizDef<CbState, CbSettings, unknown> = {
  id: 'continuous-batching',
  title: 'Continuous batching',
  family: 'Serving LLMs',
  blurb:
    'Requests of different lengths share the model’s batch. Static batching waits for the longest in each batch; continuous batching fills a free slot at the very next iteration.',
  settings: [
    {
      kind: 'number',
      key: 'slots',
      label: 'Batch slots',
      min: 2,
      max: 4,
      help: 'How many requests the model runs at once. A real server is limited by GPU memory, mostly the KV cache.',
    },
    {
      kind: 'choice',
      key: 'policy',
      label: 'Scheduling',
      options: [
        { value: 'continuous', label: 'Continuous: fill a free slot every iteration (Orca)' },
        { value: 'static', label: 'Static: a batch runs until its longest request is done' },
      ],
      help: 'Static batching schedules whole requests; continuous batching (iteration-level scheduling) decides again at every iteration.',
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
      label: 'Request',
      placeholder: 'arrives, prompt, length: 0 5 3',
      maxLength: 20,
      sample: '2',
      parse: (token) =>
        /^\d+$/.test(token.trim())
          ? Number(token.trim())
          : new Error(
              `Type three whole numbers: when it arrives, its prompt (1 to ${MAX_PROMPT}) and how many tokens it writes (1 to ${MAX_OUT}).`,
            ),
    },
    buttons: [
      {
        op: 'add',
        label: 'Add',
        usesInput: true,
        primary: true,
        args: ['an arrival time', 'a prompt length', 'an output length'],
      },
      { op: 'tick', label: 'Next iteration', usesInput: false },
      { op: 'run', label: 'Run to the end', usesInput: false },
    ],
    random: {
      label: 'Random requests',
      make: (rng) =>
        calls(
          Array.from({ length: rng.int(3, 6) }, (): Spec => [
            rng.int(0, 5),
            rng.int(1, MAX_PROMPT),
            rng.int(1, 6),
          ]).sort((a, b) => a[0] - b[0]),
        ),
    },
    presets: [
      preset('Random arrivals and lengths', (rng, size) =>
        Array.from({ length: size }, (): Spec => [rng.int(0, 5), rng.int(1, 9), rng.int(1, 6)]).sort(
          (a, b) => a[0] - b[0],
        ),
      ),
      preset('All at once, different lengths', (rng, size) =>
        Array.from({ length: size }, (): Spec => [0, rng.int(2, 9), rng.int(1, 6)]),
      ),
      preset('One long request among short ones', (rng, size) => [
        [0, rng.int(3, 9), 7],
        ...Array.from({ length: size - 1 }, (_, i): Spec => [i, rng.int(1, 5), rng.int(1, 2)]),
      ]),
      preset('A steady stream', (rng, size) =>
        Array.from({ length: size }, (_, i): Spec => [2 * i, rng.int(2, 8), rng.int(2, 4)]),
      ),
      preset('All the same length', (rng, size) => {
        const n = rng.int(2, 4);
        return Array.from({ length: size }, (_, i): Spec => [Math.floor(i / 2), rng.int(2, 9), n]);
      }),
    ],
    sizes: [3, 4, 6],
  },
  explain,
  complexity: [
    {
      op: 'Schedule one iteration (S slots)',
      best: {
        cost: 'Θ(S)',
        why: 'Look at each slot: still busy, or free for the next in line.',
        example: 'steady',
      },
      average: {
        cost: 'Θ(S)',
        why: 'The waiting line is a FIFO queue: taking the next is O(1).',
        example: 'burst',
      },
      worst: {
        cost: 'Θ(S)',
        why: 'Static batching does even less: it decides only when a batch ends.',
        example: 'static-waits',
      },
    },
    {
      op: 'Time to finish n requests, static batching',
      best: {
        cost: '⌈n / S⌉ · L',
        why: 'Every request has the same length L: no slot ever idles.',
        example: 'equal-lengths',
      },
      average: {
        cost: 'Σ over batches of the longest',
        why: 'Each batch takes as long as its longest request.',
        example: 'static-waits',
      },
      worst: {
        cost: '⌈n / S⌉ · max L',
        why: 'A long request in every batch holds every other slot idle.',
        example: 'one-long',
      },
    },
    {
      op: 'Time to finish n requests, continuous batching',
      best: {
        cost: '⌈Σ L / S⌉',
        why: 'The slots stay full until the line is empty.',
        example: 'burst',
      },
      average: {
        cost: 'about Σ L / S',
        why: 'Only the last few iterations, as the line runs dry, leave slots idle.',
        example: 'long-and-short',
      },
      worst: {
        cost: 'max L',
        why: 'One request longer than all the rest together sets the end.',
        example: 'one-long',
      },
    },
    {
      op: 'Wait for a request that arrives at a busy server',
      best: {
        cost: '0',
        why: 'A slot is free when it arrives.',
        example: 'steady',
      },
      average: {
        cost: 'until the next slot frees',
        why: 'Continuous: the shortest request in the batch sets it.',
        example: 'late-arrival',
      },
      worst: {
        cost: 'until the whole batch ends',
        why: 'Static: the longest request in the batch sets it.',
        example: 'late-arrival',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (c: OpCall[], settings: Settings) => codeScript(c, settings as CbSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    staticWaits,
    longAndShort,
    burst,
    lateArrival,
    oneLong,
    steady,
    equalLengths,
  ] as unknown as SavedExample[],
  practice: batchingPractice(() => continuousBatching),
  preview: { example: 'long-and-short', level: 2, hide: ['table', 'th-', 'tr-', 'td-', 'read', 'queue'] },
  opening: 'long-and-short',
};

/** The code tabs' line for iteration t: who was in each slot ("-" when idle), then who returned. */
export function iterationLine(s: CbState, t: number): string {
  const slots = s.chart[t]!.map((c) => c.req ?? '-').join(' ');
  const back = s.reqs
    .filter((r) => r.done === t + 1)
    .map((r) => r.name)
    .sort();
  return `${t}: ${slots} | ${back.length ? back.join(' ') : '-'}`;
}

/**
 * Driver protocol for the code tabs. "settings <slots> <continuous|static>" starts an empty
 * server and "add <name> <arrival> <prompt> <length>" adds a request; neither prints. "step"
 * runs one iteration and prints `iterationLine`; "run" runs to the end and prints the lines of
 * every iteration it ran, joined by " / ". A refused operation is not sent.
 */
function codeScript(c: OpCall[], settings: CbSettings) {
  const t = new Timeline(continuousBatching, settings, 1, c);
  const input = [`settings ${settings.slots} ${settings.policy}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const s = e.end;
    if (s !== before) {
      const op = e.call[0];
      if (op === 'add') {
        const r = s.reqs.at(-1)!;
        input.push(`add ${r.name} ${r.arrive} ${r.prompt} ${r.out}`);
      } else {
        input.push(op === 'tick' ? 'step' : 'run');
        const lines: string[] = [];
        for (let k = before.clock; k < s.clock; k++) lines.push(iterationLine(s, k));
        expected.push(lines.join(' / '));
      }
    }
    before = s;
  }
  return { input, expected };
}

export default continuousBatching;
