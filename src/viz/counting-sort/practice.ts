import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { PracticeKind, VizDef } from '../../engine/types';
import type { ArrayState } from '../_sorting/kit';
import { loadCall, randomIn } from '../_sorting/linear';
import { defaults, type CountExtra, type CountSettings, type CountStep } from './model';

type Def = VizDef<ArrayState, CountSettings, CountExtra>;

/** n values from 0 to hi, with at least one repeat so the counts are interesting. */
function values(rng: Rng, n: number, hi: number): number[] {
  for (;;) {
    const vs = randomIn(rng, n, 0, hi);
    if (new Set(vs).size < vs.length) return vs;
  }
}

/**
 * Practice questions for counting sort. Answers come from running the model with seed 1, the
 * way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function countingPractice(def: () => Def): PracticeKind[] {
  const sortSteps = (vs: number[]): CountStep[] =>
    new Timeline(def(), { ...defaults }, 1, [loadCall(vs), ['sort']]).entries.at(-1)!
      .steps as CountStep[];
  /** The last step of a loop: the count loop, the prefix loop, or the placement loop. */
  const endOf = (steps: CountStep[], line: string) =>
    steps.filter((s) => s.level === 1 && s.lines.includes(line)).at(-1)!;

  return [
    {
      id: 'counts',
      title: 'Count the values',
      make(rng) {
        const vs = values(rng, rng.int(6, 9), rng.int(4, 6));
        const C = endOf(sortSteps(vs), 'count').extra!.counts!.values.map(String);
        return {
          prompt: `Counting sort starts by counting how often each value occurs. Type C after the counting loop, from C[0] to C[${C.length - 1}].`,
          setup: [loadCall(vs)],
          answer: { kind: 'sequence', value: C },
          explain: `C[i] is how many values equal i: ${C.map((c, i) => `${c} × ${i}`).join(', ')}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'prefix',
      title: 'Add up the counts',
      make(rng) {
        const vs = values(rng, rng.int(6, 9), rng.int(4, 6));
        const steps = sortSteps(vs);
        const counts = endOf(steps, 'count').extra!.counts!.values;
        const C = endOf(steps, 'prefix').extra!.counts!.values.map(String);
        return {
          prompt: `The counts for A are C = ${counts.join(', ')}. Type C after the prefix sums, when C[i] = C[i] + C[i − 1] for i from 1 up.`,
          setup: [loadCall(vs)],
          answer: { kind: 'sequence', value: C },
          explain: `Each count adds the one before it, so C[i] becomes how many values are ≤ i: ${C.join(', ')}. The last one is n = ${vs.length}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'place',
      title: 'Where does it land in B?',
      make(rng) {
        const vs = values(rng, rng.int(6, 9), rng.int(3, 5));
        const j = rng.int(0, vs.length - 1);
        const steps = sortSteps(vs);
        const place = steps.find((s) => s.lines.includes('put') && s.vars?.j === j)!;
        const p = Number(place.vars?.['C[A[j]]']);
        const v = vs[j]!;
        const later = vs.slice(j + 1).filter((x) => x === v).length;
        const below = vs.filter((x) => x < v).length;
        return {
          prompt: `Counting sort places the values from the right end of A into B. Which index of B does A[${j}] = ${v} go to?`,
          setup: [loadCall(vs)],
          answer: { kind: 'number', value: p },
          explain: `${below} ${below === 1 ? 'value is' : 'values are'} smaller than ${v}, so the ${v}s take B[${below}] onward. ${later === 0 ? `A[${j}] is the last ${v} in A, so it is placed first, in the last slot for ${v}s` : `${later} ${later === 1 ? 'later 1' : `later ${v}s`} in A ${later === 1 ? 'is' : 'are'} placed before it, from the right`}: B[${p}].`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'stable',
      title: 'Which copy comes first?',
      make(rng) {
        const n = rng.int(5, 7);
        const vs = randomIn(rng, n, 0, 9);
        const i = rng.int(0, n - 2);
        const j = rng.int(i + 1, n - 1);
        vs[j] = vs[i]!;
        const v = vs[i]!;
        // The uids say which copy ended up where.
        const t = new Timeline(def(), { ...defaults }, 1, [loadCall(vs), ['sort']]);
        const loaded = t.entries[0]!.end.a;
        const end = t.endState().a;
        const at = (uid: number) => end.findIndex((x) => x.uid === uid);
        const kept = at(loaded[i]!.uid) < at(loaded[j]!.uid);
        const first = `The ${v} that started in A[${i}]`;
        const second = `The ${v} that started in A[${j}]`;
        const extra = vs.filter((x) => x === v).length > 2 ? ` (A has other ${v}s too)` : '';
        return {
          prompt: `A[${i}] and A[${j}] are both ${v}${extra}. Counting sort sorts A. Which of those two comes first in the result?`,
          setup: [loadCall(vs)],
          answer: { kind: 'choice', options: [first, second], correct: kept ? 0 : 1 },
          explain:
            'Counting sort is stable: placing from the right end of A, the later copy takes the later slot, so equal values keep the order they started in.',
          watch: [['sort']],
        };
      },
    },
  ];
}
