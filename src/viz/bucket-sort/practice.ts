import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { PracticeKind, Settings, VizDef } from '../../engine/types';
import type { ArrayState } from '../_sorting/kit';
import { loadCall } from '../_sorting/linear';
import { defaults, type BucketExtra, type BucketSettings, type BucketStep } from './model';

type Def = VizDef<ArrayState, BucketSettings, BucketExtra>;

const FRACTIONS: Settings = { values: 'fraction' };
const INTEGERS: Settings = { values: 'integer' };

/** n fractions with two decimals, written as the input box takes them. */
function fractions(rng: Rng, n: number, clump = false): number[] {
  return Array.from({ length: n }, () => rng.int(1, clump ? 40 : 99) / 100);
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/**
 * Practice questions for bucket sort. Answers come from running the model with seed 1, the
 * way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function bucketPractice(def: () => Def): PracticeKind[] {
  const sortSteps = (settings: Settings, vs: number[]): BucketStep[] =>
    new Timeline(def(), { ...defaults, ...settings } as BucketSettings, 1, [
      loadCall(vs),
      ['sort'],
    ]).entries.at(-1)!.steps as BucketStep[];
  /** The step after the scatter: every value in a bucket. */
  const scattered = (steps: BucketStep[]) =>
    steps.filter((s) => s.lines.includes('scatter')).at(-1)!;

  return [
    {
      id: 'bucket-of',
      title: 'Which bucket?',
      make(rng) {
        const vs = fractions(rng, rng.int(5, 10));
        const n = vs.length;
        const j = rng.int(0, n - 1);
        const step = sortSteps(FRACTIONS, vs).find(
          (s) => s.lines.includes('scatter') && s.vars?.j === j,
        )!;
        const b = Number(step.vars?.bucket);
        return {
          prompt: `Bucket sort puts these ${n} values in [0, 1) into ${n} buckets. Which bucket does A[${j}] = ${vs[j]} go into?`,
          setup: [loadCall(vs)],
          settings: FRACTIONS,
          answer: { kind: 'number', value: b },
          explain: `Bucket floor(n × x): ${n} × ${vs[j]} = ${Number((n * vs[j]!).toFixed(2))}, so bucket ${b}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'bucket-contents',
      title: 'What is in the bucket?',
      make(rng) {
        const vs = fractions(rng, rng.int(6, 9), true);
        const buckets = scattered(sortSteps(FRACTIONS, vs)).extra!.buckets!;
        const full = buckets.map((b, i) => ({ b, i })).filter((x) => x.b.length > 0);
        const crowded = full.filter((x) => x.b.length > 1);
        const { b, i } = pick(rng, crowded.length ? crowded : full);
        const values = b.map((x) => String(x.value));
        return {
          prompt: `Bucket sort puts these ${vs.length} values in [0, 1) into ${vs.length} buckets. After every value is in a bucket, and before any bucket is sorted, what does bucket ${i} hold, from front to back?`,
          setup: [loadCall(vs)],
          settings: FRACTIONS,
          answer: { kind: 'sequence', value: values },
          explain: `Bucket ${i} takes the values from ${i}/${vs.length} up to ${i + 1}/${vs.length}, each at the back, in the order they appear in A: ${values.join(', ')}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const vs = fractions(rng, rng.int(5, 7), true);
        const steps = sortSteps(FRACTIONS, vs);
        const c = Number(steps.at(-1)!.vars?.comparisons);
        const buckets = scattered(steps).extra!.buckets!;
        const sizes = buckets.map((b) => b.length).filter((k) => k > 1);
        return {
          prompt: `Bucket sort puts these ${vs.length} values into ${vs.length} buckets and sorts each bucket with insertion sort. How many comparisons do the insertion sorts make in all?`,
          setup: [loadCall(vs)],
          settings: FRACTIONS,
          answer: { kind: 'number', value: c },
          explain:
            sizes.length === 0
              ? 'Every bucket holds at most one value, so there is nothing to compare.'
              : `The buckets with more than one value hold ${sizes.join(', ')} values. Insertion sort compares each new value with the ones before it until it finds a smaller one: ${c} in all.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'integer-bucket',
      title: 'Which bucket, for whole numbers?',
      make(rng) {
        const n = rng.int(5, 8);
        const vs = Array.from({ length: n }, () => rng.int(0, 99));
        const j = rng.int(0, n - 1);
        const step = sortSteps(INTEGERS, vs).find(
          (s) => s.lines.includes('scatter') && s.vars?.j === j,
        )!;
        const b = Number(step.vars?.bucket);
        const lo = Math.min(...vs);
        const hi = Math.max(...vs) + 1;
        return {
          prompt: `Bucket sort on whole numbers cuts the range from the smallest value up to just past the largest into ${n} equal parts, one bucket each. Which bucket does A[${j}] = ${vs[j]} go into?`,
          setup: [loadCall(vs)],
          settings: INTEGERS,
          answer: { kind: 'number', value: b },
          explain: `The range is ${lo} up to ${hi}, ${hi - lo} wide. Bucket floor(${n} × (${vs[j]} − ${lo}) / ${hi - lo}) = ${b}.`,
          watch: [['sort']],
        };
      },
    },
  ];
}
