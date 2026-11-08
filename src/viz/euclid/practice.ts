import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { choice } from '../_recursion/kit';
import { defaults, fib, type EuclidSettings, type EuState } from './model';

type Def = VizDef<EuState, EuclidSettings, undefined>;

/** Practice for Euclid. Every answer comes from running the model. */
export function euclidPractice(def: () => Def): PracticeKind[] {
  const last = (settings: EuclidSettings, calls: OpCall[]): Step<EuState, undefined> => {
    const t = new Timeline(def(), settings, 1, calls);
    return t.entries[t.entries.length - 1]!.steps.at(-1)!;
  };
  const ext: EuclidSettings = { ...defaults, version: 'extended' };

  return [
    {
      id: 'gcd',
      title: 'What is the gcd?',
      make(rng) {
        const d = rng.int(2, 12);
        const a = d * rng.int(5, 40);
        const b = d * rng.int(3, 30);
        const end = last(defaults, [['gcd', a, b]]);
        const chain = end.state.rows.map((r) => `(${r.a}, ${r.b})`).join(' → ');
        return {
          prompt: `What is gcd(${a}, ${b})? Work it out with remainders.`,
          setup: [['gcd', 60, 24]],
          answer: { kind: 'number', value: end.state.d! },
          explain: `The calls go ${chain}. When b reaches 0, a is the gcd: ${end.state.d}.`,
          watch: [['gcd', a, b]],
        };
      },
    },
    {
      id: 'calls',
      title: 'How many recursive calls?',
      make(rng) {
        const fibo = rng.int(0, 2) === 0;
        const k = rng.int(6, 12);
        const a = fibo ? fib(k + 1) : rng.int(100, 900);
        const b = fibo ? fib(k) : rng.int(20, 99);
        const end = last(defaults, [['gcd', a, b]]);
        const calls = end.state.rows.length - 1;
        const chain = end.state.rows.map((r) => `(${r.a}, ${r.b})`).join(' → ');
        return {
          prompt: `The picture shows EUCLID(60, 24). How many recursive calls does EUCLID(${a}, ${b}) make? Count the calls after the first one, the base case included.`,
          setup: [['gcd', 60, 24]],
          answer: { kind: 'number', value: calls },
          explain: `The calls go ${chain}: ${calls} after the first.${fibo ? ` ${a} and ${b} are consecutive Fibonacci numbers, the worst case: every quotient is 1.` : ''}`,
          watch: [['gcd', a, b]],
        };
      },
    },
    {
      id: 'next',
      title: 'Which call comes next?',
      make(rng) {
        const a = rng.int(50, 500);
        const b = rng.int(10, 49);
        const r = a % b;
        const right = `EUCLID(${b}, ${r})`;
        const wrong = [
          `EUCLID(${a}, ${r})`,
          `EUCLID(${b}, ${Math.floor(a / b)})`,
          `EUCLID(${a - b}, ${b})`,
          `EUCLID(${r}, ${b})`,
        ];
        return {
          prompt: `EUCLID(${a}, ${b}) is running and b is not 0. Which call does it make?`,
          setup: [],
          answer: choice(rng, right, wrong),
          explain: `${a} = ${Math.floor(a / b)}·${b} + ${r}, so a mod b = ${r}, and the call is on (b, a mod b): ${right}.`,
          watch: [['gcd', a, b]],
        };
      },
    },
    {
      id: 'inverse',
      title: 'Find a modular inverse',
      make(rng) {
        const m = [11, 13, 17, 19, 23, 26, 29, 31, 40, 41][rng.int(0, 9)]!;
        let a = rng.int(2, m - 1);
        while (last(ext, [['inverse', a, m]]).state.inverse === null) a = rng.int(2, m - 1);
        const end = last(ext, [['inverse', a, m]]);
        const top = end.state.rows[0]!;
        const inv = end.state.inverse!;
        return {
          prompt: `The picture shows extended Euclid on (7, 40). What is the inverse of ${a} mod ${m}, from 0 to ${m - 1}?`,
          setup: [['inverse', 7, 40]],
          settings: ext,
          answer: { kind: 'number', value: inv },
          explain: `Extended Euclid gives ${a}·(${top.x}) + ${m}·(${top.y}) = 1, so ${a}·(${top.x}) ≡ 1 (mod ${m}). ${top.x} mod ${m} = ${inv}, and indeed ${a}·${inv} = ${a * inv} = ${Math.floor((a * inv) / m)}·${m} + 1.`,
          watch: [['inverse', a, m]],
        };
      },
    },
  ];
}
