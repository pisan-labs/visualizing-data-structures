import type { PracticeKind } from '../../engine/types';
import { ascending } from '../_sorting/kit';
import {
  counter,
  distinct,
  list,
  load,
  ordered,
  stepsOf,
  type ArrayDef,
} from '../_sorting/practice';

/** Practice questions for exponential search. Every answer comes from running the model. */
export function exponentialPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'jumps',
      title: 'Where does it jump?',
      make(rng) {
        const vs = ascending(distinct(rng, rng.int(12, 20)));
        const x = rng.int(0, 3) ? vs[rng.int(0, vs.length - 1)]! : rng.int(1, 99);
        const setup = [load(vs)];
        const steps = stepsOf(def(), {}, [...setup, ['search', x]]);
        const looked = steps
          .filter((s) => s.lines.includes('double'))
          .map((s) => String(s.vars?.bound));
        const stop = steps.find((s) => s.lines.includes('bs'))!;
        const bound = Number(stop.vars?.bound);
        if (bound < vs.length) looked.push(String(bound));
        return {
          prompt: `Phase 1 of \`search(${x})\` looks at A[1], A[2], A[4], ... until a value is not smaller than ${x} or it runs off the end. Type the indices it looks at in phase 1.`,
          setup,
          answer: { kind: 'sequence', value: looked.length ? looked : ['none'] },
          explain:
            bound < vs.length
              ? `It looks at ${list(looked)}. A[${bound}] = ${vs[bound]} is the first that is not smaller than ${x}.`
              : `It looks at ${list(looked)}; then bound = ${bound} is past the end, n = ${vs.length}.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'window',
      title: 'Where does binary search look?',
      make(rng) {
        const vs = ascending(distinct(rng, rng.int(10, 20)));
        const x = vs[rng.int(1, vs.length - 1)]!;
        const setup = [load(vs)];
        const steps = stepsOf(def(), {}, [...setup, ['search', x]]);
        const stop = steps.find((s) => s.lines.includes('bs'))!;
        const lo = Number(stop.vars?.lo);
        const hi = Number(stop.vars?.hi);
        const right = `A[${lo}..${hi}]`;
        const wrong = [
          `A[0..${hi}]`,
          `A[${lo}..${vs.length - 1}]`,
          `A[${hi}..${Math.min(2 * hi, vs.length - 1)}]`,
          `A[${Math.max(0, lo - 1)}..${hi - 1}]`,
        ];
        const options = [...new Set([right, ...wrong])].slice(0, 4).sort();
        return {
          prompt: `After phase 1 of \`search(${x})\`, which part of A does binary search look at?`,
          setup,
          answer: ordered(options, right),
          explain: `The jumps stop at bound = ${Number(stop.vars?.bound)}, so x is between bound / 2 = ${lo} and ${hi}: binary search works on ${right}.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'probes',
      title: 'How many probes?',
      make(rng) {
        const vs = ascending(distinct(rng, rng.int(12, 20)));
        const x = vs[rng.int(0, vs.length - 1)]!;
        const setup = [load(vs)];
        const end = stepsOf(def(), {}, [...setup, ['search', x]]).at(-1)!;
        const probes = counter(end, 'probes');
        return {
          prompt: `How many values does exponential search compare with x in \`search(${x})\`, in both phases together?`,
          setup,
          answer: { kind: 'number', value: probes },
          explain: `${probes}: the jumps of phase 1 and the probes of binary search in phase 2. Binary search on all of A would take ${counter(end, 'binary')}.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'versus',
      title: 'Exponential or binary?',
      make(rng) {
        const vs = ascending(distinct(rng, 20));
        const front = rng.int(0, 1) === 1;
        const x = vs[front ? rng.int(0, 2) : rng.int(10, 19)]!;
        const setup = [load(vs)];
        const end = stepsOf(def(), {}, [...setup, ['search', x]]).at(-1)!;
        const mine = counter(end, 'probes');
        const binary = counter(end, 'binary');
        const options = ['Exponential search', 'Binary search', 'They take the same'];
        const right = mine < binary ? options[0]! : mine > binary ? options[1]! : options[2]!;
        return {
          prompt: `${x} is at index ${vs.indexOf(x)} of 20. Which takes fewer probes to find it?`,
          setup,
          answer: ordered(options, right),
          explain: `Exponential search takes ${mine} and binary search on all of A takes ${binary}. The jumps cost about log₂ i probes for x at index i, so they pay off near the front.`,
          watch: [['search', x]],
        };
      },
    },
  ];
}
