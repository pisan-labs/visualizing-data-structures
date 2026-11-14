import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { and } from '../_heaps2/say';
import { defaults, type MedianExtra, type MedianSettings, type MedianState } from './model';

type Def = VizDef<MedianState, MedianSettings, MedianExtra>;

const adds = (vs: number[]): OpCall[] => vs.map((v): OpCall => ['add', v]);

/** n values from 1 to 40, possibly repeated. */
const values = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.int(1, 40));

/**
 * Our own problem statements, for "spot it": some that call for two heaps, and some that look
 * alike and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A ride-sharing app records each trip’s fare as the trip ends. After every trip, show the median fare so far.',
    pattern: 'two-heaps-median',
    cue: ['after every trip', 'the median fare so far'],
    why: 'The middle of a growing list: a max-heap of the cheaper half and a min-heap of the dearer half keep it at their tops, O(log n) per fare.',
    near: ['top-k', 'k-way-merge', 'sliding-window'],
  },
  {
    problem:
      'Players join a game one at a time, each with a rating. After each join, split the players into a weaker half and a stronger half, sizes differing by at most one, and report the best of the weaker half.',
    pattern: 'two-heaps-median',
    cue: ['one at a time', 'a weaker half and a stronger half', 'sizes differing by at most one'],
    why: 'Two halves that stay balanced as values arrive are exactly the two heaps; the best of the weaker half is the max-heap’s top.',
    near: ['top-k', 'binary-search'],
  },
  {
    problem:
      'Numbers arrive one by one. At any moment, answer: what value has as many numbers below it as above it?',
    pattern: 'two-heaps-median',
    cue: ['arrive one by one', 'as many below it as above it'],
    why: 'That value is the median. Keep the lower half in a max-heap and the upper half in a min-heap.',
    near: ['top-k', 'frequency-counting'],
  },
  {
    problem: 'A list of a million house prices, all known up front. Report the 100 most expensive.',
    pattern: 'top-k',
    cue: ['the 100 most expensive'],
    why: 'A fixed number from one end, not the middle: a min-heap of the best 100 so far.',
    near: ['two-heaps-median', 'k-way-merge'],
  },
  {
    problem:
      'Twenty branches each send their sales sorted by amount. Produce one list of all sales sorted by amount.',
    pattern: 'k-way-merge',
    cue: ['each send', 'sorted', 'one list of all'],
    why: 'Many sorted lists into one: a min-heap of the twenty heads.',
    near: ['two-heaps-median', 'top-k'],
    alsoFits: ['merge-sorted-lists'],
  },
  {
    problem:
      'Daily temperatures for a year. For every run of 7 consecutive days, report the highest temperature in that run.',
    pattern: 'monotonic-queue',
    cue: ['every run of 7 consecutive days', 'the highest'],
    why: 'A window of fixed size sliding by one: a deque of candidates gives each window’s largest in O(1) amortized.',
    near: ['two-heaps-median', 'top-k'],
    alsoFits: ['sliding-window'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function medianPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: MedianSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);

  return [
    {
      id: 'median-after',
      title: 'The median after each value',
      make(rng) {
        const first = values(rng, rng.int(3, 5));
        const more = values(rng, 3);
        const t = run(adds([...first, ...more]));
        const medians = t.entries
          .slice(first.length)
          .map((e) => String(e.steps.at(-1)!.vars?.median));
        const last = t.entries.at(-1)!.steps.at(-1)!.extra!;
        return {
          prompt: `The heaps hold ${first.length} values, as drawn. Then ${and(more)} arrive, in that order. Type the median after each of them (the mean of the two middle values for an even count, such as 6.5).`,
          setup: adds(first),
          answer: { kind: 'sequence', value: medians },
          explain: `After ${more.join(', ')} the medians are ${medians.join(', ')}. At the end the low half holds ${last.low
            .map((x) => x.key)
            .sort((a, b) => b - a)
            .join(' ')} and the high half ${last.high
            .map((x) => x.key)
            .sort((a, b) => a - b)
            .join(
              ' ',
            )}: the median is the low half’s top when it holds one more, or else the mean of the two tops.`,
          watch: adds(more),
        };
      },
    },
    {
      id: 'which-heap',
      title: 'Which heap gets the next value?',
      make(rng) {
        const first = values(rng, rng.int(3, 6));
        const x = rng.int(1, 40);
        const t = run(adds([...first, x]));
        const steps = t.entries.at(-1)!.steps;
        const intoLow = steps[0]!.lines.includes('low');
        const up = steps.some((s) => s.lines.includes('moveUp'));
        const down = steps.some((s) => s.lines.includes('moveDown'));
        const options = [
          'The low half, and nothing moves',
          'The low half, then the low half’s top moves to the high half',
          'The high half, and nothing moves',
          'The high half, then the high half’s top moves to the low half',
        ];
        const correct = intoLow ? (up ? 1 : 0) : down ? 3 : 2;
        const before = t.entries.at(-2)!.steps.at(-1)!.extra!;
        const top = before.low[0]!.key;
        return {
          prompt: `The heaps hold ${first.length} values, as drawn. ${x} arrives next. Where does it go, and does a top move to rebalance?`,
          setup: adds(first),
          answer: { kind: 'choice', options, correct },
          explain: `${x} ${x <= top ? '≤' : '>'} ${top}, the low half’s top, so it goes into the ${intoLow ? 'low' : 'high'} half. Then the sizes are ${before.low.length + (intoLow ? 1 : 0)} and ${before.high.length + (intoLow ? 0 : 1)}: ${
            up
              ? 'the low half has two more, so its top moves to the high half.'
              : down
                ? 'the high half has more, so its top moves to the low half.'
                : 'low has as many as high or one more, so nothing moves.'
          }`,
          watch: adds([x]),
        };
      },
    },
    spotItKind({ page: 'two-heaps-median', rows: SPOT_ROWS, watch: adds([7]) }),
  ];
}
