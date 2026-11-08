import type { Rng } from '../../engine/rng';
import type { PracticeKind } from '../../engine/types';
import { ascending } from '../_sorting/kit';
import {
  counter,
  list,
  load,
  ordered,
  shuffle,
  stepsOf,
  type ArrayDef,
} from '../_sorting/practice';

/** Sorted values: evenly spread with a little jitter, or bunched at the low end. */
function values(rng: Rng, n: number, skewed: boolean): number[] {
  if (skewed) {
    const pool = shuffle(
      rng,
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    return [...ascending(pool.slice(0, n - 1)), rng.int(90, 99)];
  }
  const step = Math.floor(90 / n);
  return Array.from({ length: n }, (_, i) => 3 + i * step + rng.int(0, step - 2));
}

/** Usually a value that is there, sometimes one that is not. */
const target = (rng: Rng, vs: number[]): number =>
  rng.int(0, 3) ? vs[rng.int(0, vs.length - 1)]! : rng.int(vs[0]!, vs[vs.length - 1]!);

/** Practice questions for interpolation search. Every answer comes from running the model. */
export function interpolationPractice(def: () => ArrayDef): PracticeKind[] {
  return [
    {
      id: 'guess',
      title: 'Where is the first guess?',
      make(rng) {
        const vs = values(rng, rng.int(8, 12), false);
        const x = vs[rng.int(1, vs.length - 2)]!;
        const setup = [load(vs)];
        const steps = stepsOf(def(), {}, [...setup, ['search', x]]);
        const first = steps.find((s) => s.lines.includes('pos'))!;
        const pos = Number(first.vars?.pos);
        const n = vs.length;
        return {
          prompt: `Interpolation search runs \`search(${x})\` on the array shown, with lo = 0 and hi = ${n - 1}. Which index does it look at first?`,
          setup,
          answer: { kind: 'number', value: pos },
          explain: `pos = 0 + floor((${x} − ${vs[0]}) × ${n - 1} / (${vs[n - 1]} − ${vs[0]})) = ${pos}. The guess assumes the values climb in a straight line from A[0] to A[${n - 1}].`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'probes',
      title: 'Which indices does it look at?',
      make(rng) {
        const skewed = rng.int(0, 2) === 0;
        const vs = values(rng, rng.int(8, 12), skewed);
        const x = target(rng, vs);
        const setup = [load(vs)];
        const steps = stepsOf(def(), {}, [...setup, ['search', x]]);
        const probes = steps.filter((s) => s.lines.includes('pos')).map((s) => String(s.vars?.pos));
        const result = Number(steps.at(-1)!.vars?.result);
        const flat = steps.at(-1)!.lines.includes('flat');
        if (flat) probes.push(String(result));
        return {
          prompt: `Type the indices interpolation search looks at for \`search(${x})\`, in order, or type none if it looks at none.`,
          setup,
          answer: { kind: 'sequence', value: probes.length ? probes : ['none'] },
          explain:
            probes.length === 0
              ? `${x} is outside A[0..${vs.length - 1}] from the start, so it looks at nothing: type none.`
              : `It looks at ${list(probes)}. ${result >= 0 ? `${x} is at index ${result}.` : `${x} is not there.`}`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'count',
      title: 'How many probes?',
      make(rng) {
        const skewed = rng.int(0, 1) === 1;
        const vs = values(rng, rng.int(10, 16), skewed);
        const x = skewed ? vs[vs.length - 2]! : target(rng, vs);
        const setup = [load(vs)];
        const end = stepsOf(def(), {}, [...setup, ['search', x]]).at(-1)!;
        const probes = counter(end, 'probes');
        return {
          prompt: `How many values does interpolation search compare with x in \`search(${x})\`?`,
          setup,
          answer: { kind: 'number', value: probes },
          explain: skewed
            ? `${probes}. The one big value at the end makes the straight line too flat, so each guess lands short of ${x} and the window creeps forward.`
            : `${probes}. The values are spread evenly, so the guesses land close to ${x}.`,
          watch: [['search', x]],
        };
      },
    },
    {
      id: 'versus',
      title: 'Interpolation or binary?',
      make(rng) {
        const skewed = rng.int(0, 1) === 1;
        const vs = values(rng, rng.int(12, 16), skewed);
        const x = skewed ? vs[vs.length - 2]! : vs[rng.int(0, vs.length - 1)]!;
        const setup = [load(vs)];
        const end = stepsOf(def(), {}, [...setup, ['search', x]]).at(-1)!;
        const mine = counter(end, 'probes');
        const binary = counter(end, 'binary');
        const options = ['Interpolation search', 'Binary search', 'They take the same'];
        const right = mine < binary ? options[0]! : mine > binary ? options[1]! : options[2]!;
        return {
          prompt: `Which takes fewer probes to run \`search(${x})\` on this array?`,
          setup,
          answer: ordered(options, right),
          explain: `Interpolation search takes ${mine} and binary search takes ${binary}. ${why(mine, binary, skewed)}`,
          watch: [['search', x]],
        };
      },
    },
  ];
}

/** Why one search won the "versus" question, or why they tie. */
export function why(mine: number, binary: number, skewed: boolean): string {
  if (mine === binary)
    return 'A tie: on this array the straight-line guess does no better than halving.';
  if (mine < binary)
    return skewed
      ? 'Even on skewed values, the guess happens to land close for this x.'
      : 'Evenly spread values make the guess land close.';
  return skewed
    ? 'Skewed values throw off the straight-line guess.'
    : 'The values are spread fairly evenly, but not evenly enough here for the guess to beat halving.';
}
