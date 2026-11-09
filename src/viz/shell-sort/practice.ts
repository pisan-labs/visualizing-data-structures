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

const RULES = {
  shell: "Shell's gaps (n/2, then halve until 1)",
  knuth:
    "Knuth's gaps (1, 4, 13, 40, ..., each 3h + 1, starting from the first one that is at least floor(n / 3))",
  ciura: "Ciura's gaps (1, 4, 10, 23, 57, ...)",
} as const;

/** Practice questions for Shell sort. Every answer comes from running the model. */
export function shellPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'first-gap',
      title: 'The array after the first gap',
      make(rng) {
        const values = distinct(rng, rng.int(6, 8));
        const setup = [load(values)];
        const pass = milestones(stepsOf(def(), {}, [...setup, ['sort']]))[0]!;
        const h = Number(pass.vars?.h);
        const after = valuesAt(pass);
        return {
          prompt: `Shell sort with Shell's gaps starts with h = ${h}: it insertion-sorts each list of values ${h} apart. Type A after the h = ${h} pass.`,
          setup,
          answer: { kind: 'sequence', value: after },
          explain: `Each list A[i], A[i + ${h}], ... is sorted on its own, and the lists do not mix: ${list(after)}. A is now "${h}-sorted".`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'gaps',
      title: 'Which gaps?',
      make(rng) {
        const gaps = (['shell', 'knuth', 'ciura'] as const)[rng.int(0, 2)]!;
        const settings = { gaps };
        const n = rng.int(8, 20);
        const values = distinct(rng, n);
        const setup = [load(values)];
        const seen: string[] = [];
        for (const s of stepsOf(def(), settings, [...setup, ['sort']])) {
          const h = s.vars?.h;
          if (typeof h === 'number' && !seen.includes(String(h))) seen.push(String(h));
        }
        const rule =
          gaps === 'shell'
            ? `They start at floor(${n} / 2) = ${seen[0]} and halve.`
            : gaps === 'knuth'
              ? `It starts with the first one that is at least floor(${n} / 3) = ${Math.floor(n / 3)}, then goes back down.`
              : `It uses every one that is less than n = ${n}.`;
        return {
          prompt: `Shell sort sorts these ${n} values with ${RULES[gaps]}. Type the gaps it uses, largest first.`,
          setup,
          settings,
          answer: { kind: 'sequence', value: seen },
          explain: `${rule} So the gaps are ${list(seen)}. The last gap is always 1, a plain insertion sort.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'shifts',
      title: 'Shifts in the first pass',
      make(rng) {
        const values = distinct(rng, rng.int(6, 8));
        const setup = [load(values)];
        const pass = milestones(stepsOf(def(), {}, [...setup, ['sort']]))[0]!;
        const h = Number(pass.vars?.h);
        const shifts = counter(pass, 'shifts');
        return {
          prompt: `Shell sort with Shell's gaps starts with h = ${h}. How many shifts does the h = ${h} pass make?`,
          setup,
          answer: { kind: 'number', value: shifts },
          explain: `Within each list of values ${h} apart, a value shifts once for every later value in the same list that is smaller. In all, the pass makes ${shifts} ${shifts === 1 ? 'shift' : 'shifts'} and leaves ${list(valuesAt(pass))}.`,
          watch: [['sort']],
        };
      },
    },
    twinKind(def, {
      name: "Shell sort (Shell's gaps)",
      size: [6, 8],
      why: (kept) =>
        kept
          ? 'Here the two copies kept their order, but a shift by a gap can jump a value over its twin. Shell sort is not stable.'
          : 'A shift by a gap jumped one copy over the other. Shell sort is not stable.',
    }),
  ];
}
