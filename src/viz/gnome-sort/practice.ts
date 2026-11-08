import type { PracticeKind } from '../../engine/types';
import {
  counter,
  distinct,
  list,
  load,
  runOps,
  stepsOf,
  twinKind,
  type ArrayDef,
} from '../_sorting/practice';

/** Pairs that are out of order: each costs the gnome exactly one swap. */
function inversions(vs: number[]): number {
  let k = 0;
  for (let i = 0; i < vs.length; i++)
    for (let j = i + 1; j < vs.length; j++) if (vs[i]! > vs[j]!) k++;
  return k;
}

/** Practice questions for gnome sort. Every answer comes from running the model. */
export function gnomePractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'swaps',
      title: 'How many swaps?',
      make(rng) {
        const values = distinct(rng, rng.int(5, 7));
        const setup = [load(values)];
        const end = stepsOf(def(), {}, [...setup, ['sort']]).at(-1)!;
        const swaps = counter(end, 'swaps');
        return {
          prompt: 'How many swaps does gnome sort make to sort A?',
          setup,
          answer: { kind: 'number', value: swaps },
          explain: `Each swap of neighbors fixes one pair of values that is out of order, and A has ${inversions(values)} such pairs. So ${swaps}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng) {
        const values = distinct(rng, rng.int(4, 6));
        const jump = rng.int(0, 1) === 1;
        const settings = { jump };
        const setup = [load(values)];
        const end = stepsOf(def(), settings, [...setup, ['sort']]).at(-1)!;
        const c = counter(end, 'comparisons');
        const swaps = counter(end, 'swaps');
        return {
          prompt: `Gnome sort ${jump ? 'with jumping back' : 'without jumping back'} sorts A. How many times does it compare A[pos - 1] with A[pos]?`,
          setup,
          settings,
          answer: { kind: 'number', value: c },
          explain: jump
            ? `${c}: one for each of the ${swaps} swaps, and one for each new value that turns out to be in order. That is insertion sort's count.`
            : `${c}: one for each of the ${swaps} swaps, and one for every pair it finds in order, including the pairs it walks over again after carrying a value back.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'after',
      title: 'Where is the gnome?',
      make(rng) {
        const values = distinct(rng, rng.int(5, 7));
        const setup = [load(values)];
        const steps = runOps(def(), {}, [...setup, ['sort']]).entries.at(-1)!.steps;
        const swapsAt = steps.filter((s) => s.lines.includes('back'));
        const k = rng.int(1, Math.max(1, swapsAt.length));
        const step = swapsAt[k - 1];
        const pos = Number(step?.vars?.pos ?? values.length);
        const shown = step ? step.state.a.map((x) => x.value) : values;
        return {
          prompt: step
            ? `Gnome sort sorts A. Right after its swap number ${k}, A is ${list(shown)}. What is pos?`
            : 'Gnome sort sorts A, which is already sorted. What is pos when it stops?',
          setup,
          answer: { kind: 'number', value: pos },
          explain: step
            ? `After a swap the gnome steps back, so pos is the slot the smaller value just moved into: ${pos}.`
            : `It walks off the end: pos = n = ${pos}.`,
          watch: [['sort']],
        };
      },
    },
    twinKind(def, {
      name: 'Gnome sort',
      why: (kept) =>
        kept
          ? 'The gnome swaps only when the left value is strictly bigger, so equal values never pass each other. It is stable.'
          : 'A swap moved one copy past the other.',
    }),
  ];
}
