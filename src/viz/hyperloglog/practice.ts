import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { binary } from '../_hashing/family';
import { distinctKeys, shuffle } from '../_hashing/hashing';
import {
  defaults,
  estimate,
  HASH_BITS,
  regs,
  split,
  type HllExtra,
  type HllSettings,
  type HllState,
} from './model';

type Def = VizDef<HllState, HllSettings, HllExtra>;

const pick = <X>(rng: Rng, xs: X[]): X => xs[rng.int(0, xs.length - 1)]!;
const adds = (xs: number[]): OpCall[] => xs.map((x) => ['add', x]);

/**
 * Practice for HyperLogLog. Every answer comes from running the model. `def` is a getter to
 * avoid an import cycle.
 */
export function hllPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], s: HllSettings) => new Timeline(def(), s, 1, cs);

  /** A new item x for a sketch built from `setup`, with its hash in binary. */
  function item(rng: Rng, avoid: number[]) {
    let x = rng.int(0, 999);
    while (avoid.includes(x)) x = (x + 1) % 1000;
    return x;
  }

  return [
    {
      id: 'register',
      title: 'Which register?',
      make(rng) {
        const s: HllSettings = { ...defaults, b: pick(rng, [4, 5]) };
        const keys = distinctKeys(rng, rng.int(2, 5));
        const setup = adds(keys);
        const x = item(rng, keys);
        const t = run([...setup, ['add', x]], s);
        const j = Number(t.entries.at(-1)!.steps.at(-1)!.vars!.j);
        const bits = binary(split(x, s.b).h, HASH_BITS);
        return {
          prompt: `The sketch has m = 2^${s.b} = ${regs(s)} registers. h(${x}) = ${bits} in binary. Which register does \`add(${x})\` update?`,
          setup,
          settings: s as Settings,
          answer: { kind: 'number', value: j },
          explain: `The first ${s.b} bits, ${bits.slice(0, s.b)}, are ${j} in binary.`,
          watch: [['add', x]],
        };
      },
    },
    {
      id: 'rho',
      title: 'What is ρ?',
      make(rng) {
        const s: HllSettings = { ...defaults };
        const keys = distinctKeys(rng, rng.int(2, 5));
        const setup = adds(keys);
        // Prefer items with a few leading zeros, so the answer is not always 1.
        const candidates = shuffle(
          rng.next,
          Array.from({ length: 400 }, (_, i) => i),
        ).filter((y) => !keys.includes(y));
        const x = candidates.find((y) => split(y, s.b).rho >= rng.int(1, 4)) ?? candidates[0]!;
        const t = run([...setup, ['add', x]], s);
        const rho = Number(t.entries.at(-1)!.steps.at(-1)!.vars!.ρ);
        const bits = binary(split(x, s.b).h, HASH_BITS);
        return {
          prompt: `m = 16 registers, so the first 4 bits of a hash pick the register. h(${x}) = ${bits}. What is ρ, the position of the first 1 in the remaining ${HASH_BITS - 4} bits?`,
          setup,
          settings: s as Settings,
          answer: { kind: 'number', value: rho },
          explain: `After ${bits.slice(0, 4)} come ${bits.slice(4)}: ${rho - 1} ${rho === 2 ? 'zero' : 'zeros'}, then a 1, so ρ = ${rho}.`,
          watch: [['add', x]],
        };
      },
    },
    {
      id: 'register-after',
      title: 'The register afterwards',
      make(rng) {
        const s: HllSettings = { ...defaults };
        const keys = distinctKeys(rng, rng.int(6, 12));
        const setup = adds(keys);
        const x = item(rng, keys);
        const { j, rho, h } = split(x, s.b);
        const end = run([...setup, ['add', x]], s).endState();
        const bits = binary(h, HASH_BITS);
        return {
          prompt: `h(${x}) = ${bits}, so \`add(${x})\` goes to register ${j} with ρ = ${rho}. What does M[${j}] hold afterwards?`,
          setup,
          settings: s as Settings,
          answer: { kind: 'number', value: end.M[j]! },
          explain: `A register keeps the largest ρ it has seen: max(old value, ${rho}) = ${end.M[j]}.`,
          watch: [['add', x]],
        };
      },
    },
    {
      id: 'linear-counting',
      title: 'Linear counting',
      make(rng) {
        const s: HllSettings = { ...defaults };
        const keys = distinctKeys(rng, rng.int(3, 9));
        const setup = adds(keys);
        const end = run(setup, s).endState();
        const e = estimate(end, true);
        const m = e.m;
        const V = e.V;
        const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
        const got = fmt(m * Math.log(m / V));
        const options = [
          ...new Set([got, fmt(m - V), fmt(V * Math.log(m / V)), fmt(m * Math.log(V)), fmt(e.raw)]),
        ].slice(0, 4);
        const sorted = options.sort((p, q) => Number(p) - Number(q));
        return {
          prompt: `${V} of the ${m} registers are still 0. What does linear counting, m·ln(m/V), estimate?`,
          setup,
          settings: s as Settings,
          answer: { kind: 'choice', options: sorted, correct: sorted.indexOf(got) },
          explain: `m·ln(m/V) = ${m}·ln(${m}/${V}) = ${got}. ${keys.length} distinct items were added. ${
            e.corrected
              ? `The raw formula gives ${fmt(e.raw)}, which is at most 2.5m, so the sketch uses linear counting.`
              : ''
          }`,
          watch: [['estimate']],
        };
      },
    },
  ];
}
