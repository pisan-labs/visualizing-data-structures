import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { PracticeKind, Settings, VizDef } from '../../engine/types';
import type { ArrayState } from '../_sorting/kit';
import { loadCall, randomIn } from '../_sorting/linear';
import {
  defaults,
  digitText,
  inBase,
  passesFor,
  type RadixExtra,
  type RadixSettings,
  type RadixStep,
} from './model';

type Def = VizDef<ArrayState, RadixSettings, RadixExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/**
 * Practice questions for radix sort. Answers come from running the model with seed 1, the
 * way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function radixPractice(def: () => Def): PracticeKind[] {
  const sortSteps = (settings: Settings, vs: number[]): RadixStep[] =>
    new Timeline(def(), { ...defaults, ...settings } as RadixSettings, 1, [
      loadCall(vs),
      ['sort'],
    ]).entries.at(-1)!.steps as RadixStep[];
  /** The step that ends pass p: A collected again. */
  const passEnd = (steps: RadixStep[], p: number) =>
    steps.find((s) => s.level === 1 && s.extra?.pass === p)!;
  /** The last step of pass p's distribution, with every value in a bucket. */
  const scattered = (steps: RadixStep[], p: number) =>
    steps.filter((s) => s.extra?.pass === p && s.lines.includes('append')).at(-1)!;

  return [
    {
      id: 'after-pass',
      title: 'A after a pass',
      make(rng) {
        const vs = randomIn(rng, rng.int(5, 7), 10, 999);
        const p = rng.int(1, 2);
        const after = passEnd(sortSteps({ base: 10 }, vs), p).state.a.map((x) => String(x.value));
        const which = p === 1 ? 'the ones digit' : 'the tens digit';
        return {
          prompt: `Radix sort in base 10 starts with the last digit. Type A after pass ${p}, which sorts by ${which}.`,
          setup: [loadCall(vs)],
          settings: { base: 10 },
          answer: { kind: 'sequence', value: after },
          explain: `Each pass takes the values from left to right and drops them into buckets by ${which}, then collects buckets 0 to 9 in order. Values with the same digit keep the order they had: ${after.join(', ')}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'bucket',
      title: 'Which bucket?',
      make(rng) {
        const base = pick(rng, [2, 4, 8, 10]);
        const vs = randomIn(rng, rng.int(4, 6), 1, base === 10 ? 999 : 60);
        const steps = sortSteps({ base }, vs);
        const passes = passesFor(vs, base);
        const p = rng.int(1, passes);
        const j = rng.int(0, vs.length - 1);
        const before = p === 1 ? vs : passEnd(steps, p - 1).state.a.map((x) => x.value);
        const v = before[j]!;
        const step = steps.find(
          (s) => s.extra?.pass === p && s.vars?.j === j && s.lines.includes('append'),
        )!;
        const digit = String(step.vars?.digit);
        const place = base ** (p - 1);
        return {
          prompt: `Radix sort in base ${base}. In pass ${p}, which sorts by the digit worth ${place}s, which bucket does ${v} go into?`,
          setup: [loadCall(vs)],
          settings: { base },
          answer: { kind: 'number', value: Number(digit) },
          explain: `${v} is ${inBase(v, base)} in base ${base}. Its digit worth ${place}s is (${v} / ${place}) mod ${base} = ${digit}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'passes',
      title: 'How many passes?',
      make(rng) {
        const base = pick(rng, [2, 3, 8, 10, 16]);
        const vs = randomIn(rng, rng.int(4, 7), 0, pick(rng, [99, 255, 999]));
        const steps = sortSteps({ base }, vs);
        const passes = Number(steps.at(-1)!.vars?.passes);
        const max = Math.max(...vs);
        return {
          prompt: `Radix sort in base ${base} sorts A one digit at a time. How many passes does it make?`,
          setup: [loadCall(vs)],
          settings: { base },
          answer: { kind: 'number', value: passes },
          explain: `The largest value, ${max}, is ${inBase(max, base)} in base ${base}: ${passes} ${passes === 1 ? 'digit' : 'digits'}, so ${passes} ${passes === 1 ? 'pass' : 'passes'}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'bucket-contents',
      title: 'What is in the bucket?',
      make(rng) {
        const vs = randomIn(rng, rng.int(6, 8), 10, 99);
        const p = rng.int(1, 2);
        const buckets = scattered(sortSteps({ base: 10 }, vs), p).extra!.buckets!;
        const full = buckets.map((b, d) => ({ b, d })).filter((x) => x.b.length > 0);
        const { b, d } = pick(rng, full);
        const values = b.map((x) => String(x.value));
        return {
          prompt: `Radix sort in base 10. In pass ${p}, after every value has gone into a bucket, which values does bucket ${digitText(d)} hold, from front to back?`,
          setup: [loadCall(vs)],
          settings: { base: 10 },
          answer: { kind: 'sequence', value: values },
          explain: `Bucket ${d} gets the values whose ${p === 1 ? 'ones' : 'tens'} digit is ${d}, in the order the pass meets them${p === 2 ? ', which is the order pass 1 left them in' : ''}: ${values.join(', ')}.`,
          watch: [['sort']],
        };
      },
    },
  ];
}
