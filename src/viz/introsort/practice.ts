import type { PracticeKind } from '../../engine/types';
import { distinct, load, ordered, stepsOf, type ArrayDef } from '../_sorting/practice';
import { defaults, killer } from './model';

/** Practice questions for introsort. Every answer comes from running the model. */
export function introPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'budget',
      title: 'How big is the budget?',
      make(rng) {
        const n = rng.int(5, 20);
        const once = rng.int(0, 2) === 0;
        const settings = { depth: once ? 'once' : 'twice' };
        const setup = [load(distinct(rng, n))];
        const first = stepsOf(def(), settings, [...setup, ['sort']])[0]!;
        const limit = Number(first.vars?.limit);
        return {
          prompt: `Introsort sorts ${n} values with a depth budget of ${once ? '⌊log₂ n⌋' : '2⌊log₂ n⌋'}. How deep can quicksort go before heap sort takes over?`,
          setup,
          settings,
          answer: { kind: 'number', value: limit },
          explain: `⌊log₂ ${n}⌋ = ${Math.floor(Math.log2(n))}${once ? '' : `, and twice that is ${limit}`}. A call at depth ${limit} with more than a few values goes to heap sort.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'pivot',
      title: 'Which pivot?',
      make(rng) {
        const values = distinct(rng, rng.int(6, 10));
        const setup = [load(values)];
        const steps = stepsOf(def(), {}, [...setup, ['sort']]);
        const first = steps.find((s) => s.lines.includes('pivot'))!;
        const x = Number(first.vars?.x);
        const n = values.length;
        const mid = Math.floor((n - 1) / 2);
        return {
          prompt: `Introsort's first partition uses the median of A[0], A[${mid}] and A[${n - 1}] as its pivot. Which value is that?`,
          setup,
          answer: { kind: 'number', value: x },
          explain: `A[0] = ${values[0]}, A[${mid}] = ${values[mid]} and A[${n - 1}] = ${values[n - 1]}. The one in the middle is ${x}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'lands',
      title: 'Where does the pivot land?',
      make(rng) {
        const values = distinct(rng, rng.int(6, 10));
        const setup = [load(values)];
        const steps = stepsOf(def(), {}, [...setup, ['sort']]);
        const done = steps.find((s) => s.lines.includes('left'))!;
        const q = Number(done.vars?.q);
        const x = Number(steps.find((s) => s.lines.includes('pivot'))!.vars?.x);
        return {
          prompt: `The first partition puts its pivot, ${x}, into its final place. At which index?`,
          setup,
          answer: { kind: 'number', value: q },
          explain: `${q === 1 ? 'One value is' : `${q} values are`} smaller than ${x}, so it lands at index ${q}, where it stays.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'heap',
      title: 'Does heap sort run?',
      make(rng) {
        const n = rng.int(14, 20);
        const bad = rng.int(0, 1) === 1;
        const settings = { depth: 'once' };
        const values = bad ? killer(n, { ...defaults, depth: 'once' }) : distinct(rng, n);
        const setup = [load(values)];
        const end = stepsOf(def(), settings, [...setup, ['sort']]).at(-1)!;
        const heaps = Number(end.vars?.heapsorts);
        const yes = 'Yes, the budget runs out';
        const no = 'No, the calls stay within the budget';
        return {
          prompt: `Introsort sorts these ${n} values with a budget of ⌊log₂ n⌋ = ${Math.floor(Math.log2(n))}. Does heap sort take over anywhere?`,
          setup,
          settings,
          answer: ordered([yes, no], heaps > 0 ? yes : no),
          explain:
            heaps > 0
              ? `Yes. The calls reach depth ${Math.floor(Math.log2(n))} on a part with more than 3 values, so heap sort takes over ${heaps === 1 ? 'once' : `${heaps} times`}.`
              : `No. The calls went ${end.vars?.maxDepth} deep at most and never used up the budget.`,
          watch: [['sort']],
        };
      },
    },
  ];
}
