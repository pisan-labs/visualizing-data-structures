import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { ivText } from '../_intervals2/kit';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { bldInput, defaults, keyText, type SLExtra, type SLSettings, type SLState } from './model';

type Def = VizDef<SLState, SLSettings, SLExtra>;
type Raw = { s: number; f: number; h: number };

const load = (bs: Raw[]): OpCall => ['load', bs.map((b) => bldInput({ id: 0, ...b })).join(' ')];

function intervals(rng: Rng, n: number, maxLen = 5): Raw[] {
  return Array.from({ length: n }, () => {
    const len = rng.int(1, maxLen);
    const s = rng.int(0, 14 - len);
    return { s, f: s + len, h: rng.int(1, 8) };
  });
}

/**
 * Our own problem statements, for "spot it": three that call for a sweep, and some that look
 * alike and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A gym logs when each member checked in and out. What is the largest number of people who were in the gym at the same time?',
    pattern: 'sweep-line',
    cue: ['checked in and out', 'at the same time', 'largest number'],
    why: 'Check-in is +1 and check-out is −1. Sort them by time and walk once, keeping the highest count.',
    near: ['merge-intervals', 'sliding-window', 'top-k'],
  },
  {
    problem:
      'Each rectangle stands on a common base line, with a left edge, a right edge and a height. Trace the outline you would see from far away.',
    pattern: 'sweep-line',
    cue: ['left edge, a right edge and a height', 'outline'],
    why: 'The outline can change only at an edge. Sweep the edges in order with a max-heap of the heights standing; the top is the outline.',
    near: ['merge-intervals', 'monotonic-stack', 'two-heaps-median'],
  },
  {
    problem:
      'A broadcaster has a list of shows, each with a start and an end time. How many channels does it need so that no two shows on one channel overlap?',
    pattern: 'sweep-line',
    cue: ['how many channels', 'no two shows on one channel overlap'],
    why: 'The channels needed equal the most shows on at once, and a sweep finds that count.',
    near: ['merge-intervals', 'top-k', 'kadane'],
  },
  {
    problem:
      'Meetings are given as start and end times. Merge the overlapping ones and report the busy blocks.',
    pattern: 'merge-intervals',
    cue: ['merge the overlapping ones', 'busy blocks'],
    why: 'The answer is the covered time, not a count: sort by start and merge each into the last block.',
    near: ['sweep-line', 'two-pointers', 'difference-array'],
  },
  {
    problem:
      'Many updates each add v to every cell of an array from index l to index r. Print the array after all of them.',
    pattern: 'difference-array',
    cue: ['add v to every cell', 'from index l to index r', 'after all of them'],
    why: 'The positions are array cells, all of them wanted: +v at l and −v at r + 1, then one running sum, with no sort.',
    near: ['sweep-line', 'prefix-sum-hashmap', 'merge-intervals'],
  },
  {
    problem:
      'A stream of readings, one per second. For each window of the last 60 seconds, report the highest reading.',
    pattern: 'monotonic-queue',
    cue: ['each window of the last 60 seconds', 'highest'],
    why: 'A fixed-width window sliding over the readings: a deque of candidates in decreasing order gives each maximum in O(1).',
    near: ['sweep-line', 'top-k', 'two-heaps-median'],
    alsoFits: ['sliding-window'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function sweepPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: SLSettings) => new Timeline(def(), settings, 1, ops);

  return [
    {
      id: 'most',
      title: 'The most open at once',
      make(rng) {
        const ivs = intervals(rng, rng.int(5, 7));
        const t = run([load(ivs), ['sweep']], defaults);
        const last = t.entries.at(-1)!.steps.at(-1)!;
        const best = last.extra!.best!;
        const open = t.endState().ivs.filter((b) => last.extra!.open.includes(b.id));
        return {
          prompt: `Intervals ${ivs.map(ivText).join(', ')}. An interval that ends at time t is closed when another starts at t. What is the largest number open at the same moment?`,
          setup: [load(ivs)],
          answer: { kind: 'number', value: best.count },
          explain: `Sort the starts (+1) and ends (−1) by time, ends first at equal times, and keep the highest count. It reaches ${best.count} first at time ${best.t}: ${open.map(ivText).join(', ')}.`,
          watch: [['sweep']],
        };
      },
    },
    {
      id: 'skyline-point',
      title: 'A point on the skyline',
      make(rng) {
        const settings: SLSettings = { ...defaults, goal: 'skyline' };
        const bs = intervals(rng, rng.int(3, 5), 6);
        const t = run([load(bs), ['sweep']], settings);
        const keys = t.entries.at(-1)!.steps.at(-1)!.extra!.keys!;
        const edges = [...new Set(bs.flatMap((b) => [b.s, b.f]))].sort((a, b) => a - b);
        const x = edges[rng.int(0, edges.length - 2)]!;
        let h = 0;
        for (const k of keys) if (k.x <= x) h = k.h;
        return {
          prompt: `Buildings, each as left-right:height: ${bs.map((b) => `${b.s}-${b.f}:${b.h}`).join(', ')}. A building covers its left edge but not its right edge. How high is the skyline just after x = ${x}?`,
          setup: [load(bs)],
          settings,
          answer: { kind: 'number', value: h },
          explain: `The skyline is ${keys.map(keyText).join(' ')}: each key point is where the tallest standing height changes. The last one at or before ${x} has height ${h}.`,
          watch: [['sweep']],
        };
      },
    },
    spotItKind({ page: 'sweep-line', rows: SPOT_ROWS, watch: [['sweep']] }),
  ];
}
