import type { PracticeKind } from '../../engine/types';
import {
  counter,
  distinct,
  list,
  load,
  milestones,
  stepsOf,
  twinKind,
  valuesAt,
  type ArrayDef,
} from '../_sorting/practice';

/** Practice questions for comb sort. Every answer comes from running the model. */
export function combPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'gaps',
      title: 'Which gaps?',
      make(rng) {
        const n = rng.int(8, 20);
        const values = distinct(rng, n);
        const setup = [load(values)];
        const steps = stepsOf(def(), {}, [...setup, ['sort']]);
        const gaps: string[] = [];
        for (const s of milestones(steps)) {
          const g = s.vars?.gap;
          if (typeof g !== 'number') continue;
          gaps.push(String(g));
          if (g === 1) break;
        }
        return {
          prompt: `Comb sort runs on these ${n} values with shrink factor 1.3. Type the gaps of its passes, up to and including the first pass with gap 1.`,
          setup,
          answer: { kind: 'sequence', value: gaps },
          explain: `gap starts at n = ${n} and each pass takes floor(gap / 1.3): ${list(gaps)}. After that every pass has gap 1 until one makes no swap.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'first-pass',
      title: 'After the first pass',
      make(rng) {
        const values = distinct(rng, rng.int(5, 8));
        const setup = [load(values)];
        const first = milestones(stepsOf(def(), {}, [...setup, ['sort']]))[0]!;
        const gap = Number(first.vars?.gap);
        const after = valuesAt(first);
        return {
          prompt: `The first pass of comb sort compares each A[i] with A[i + gap], left to right, and swaps pairs that are out of order. Type A after it.`,
          setup,
          answer: { kind: 'sequence', value: after },
          explain: `gap = floor(${values.length} / 1.3) = ${gap}, so the pass compares values ${gap} apart. A becomes ${list(after)}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'passes',
      title: 'How many passes?',
      make(rng) {
        const values = distinct(rng, rng.int(6, 10));
        const shrink = rng.int(0, 1) ? '1.3' : '2';
        const settings = { shrink };
        const setup = [load(values)];
        const end = stepsOf(def(), settings, [...setup, ['sort']]).at(-1)!;
        const passes = counter(end, 'passes');
        return {
          prompt: `Comb sort with shrink factor ${shrink} sorts A. How many passes does it make, counting the last one that finds no swap?`,
          setup,
          settings,
          answer: { kind: 'number', value: passes },
          explain: `${passes}. The gap passes run down to 1, then gap-1 passes repeat until one makes no swap.`,
          watch: [['sort']],
        };
      },
    },
    twinKind(def, {
      name: 'Comb sort',
      why: (kept) =>
        kept
          ? 'This time no long swap carried one copy past the other. Comb sort is still not stable in general: a swap across a gap can jump over an equal value.'
          : 'A swap across a gap jumped one copy over the other. Comb sort is not stable.',
    }),
  ];
}
