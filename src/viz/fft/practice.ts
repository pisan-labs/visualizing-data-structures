import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, polyText, type FftSettings, type FftState } from './model';

type Def = VizDef<FftState, FftSettings, undefined>;

/** Practice for the FFT. Every answer comes from running the model. */
export function fftPractice(def: () => Def): PracticeKind[] {
  const steps = (calls: OpCall[]) => {
    const t = new Timeline(def(), defaults, 1, calls);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const end = (calls: OpCall[]): FftState => steps(calls).at(-1)!.state;
  const list = (rng: { int(a: number, b: number): number }, n: number) =>
    Array.from({ length: n }, () => rng.int(-3, 5));

  return [
    {
      id: 'order',
      title: 'Bit-reversed order',
      make(rng) {
        const n = rng.int(0, 1) ? 8 : 4;
        const input = Array.from({ length: n }, (_, i) => i).join(' ');
        const first = end([['fft', input]]).net[0]!.map((z) => String(z![0]));
        return {
          prompt: `The recursion splits a₀ … a${n - 1} into evens and odds until single values remain. Type the indices in the order they appear down the first column (for n = 4 that starts 0 2).`,
          setup: [],
          answer: { kind: 'sequence', value: first },
          explain: `Evens first, then odds, at every level: ${first.join(' ')}. That is each index with its ${Math.log2(n)} bits reversed.`,
          watch: [['fft', input]],
        };
      },
    },
    {
      id: 'butterflies',
      title: 'How many butterflies?',
      make(rng) {
        const n = [2, 4, 8][rng.int(0, 2)]!;
        const final = steps([['fft', list(rng, n).join(' ')]]).at(-1)!;
        return {
          prompt: `How many butterflies (one multiplication by a power of ω and two additions each) does an FFT on ${n} values make?`,
          setup: [],
          answer: { kind: 'number', value: Number(final.vars?.butterflies) },
          explain: `log₂ ${n} = ${Math.log2(n)} levels, with ${n / 2} butterflies on each: ${Number(final.vars?.butterflies)}. That is (n/2)·log₂ n.`,
          watch: [['fft', list(rng, n).join(' ')]],
        };
      },
    },
    {
      id: 'y0',
      title: 'The value at 1',
      make(rng) {
        const a = list(rng, 4);
        const y0 = Math.round(end([['fft', a.join(' ')]]).y![0]![0]);
        return {
          prompt: `The picture shows the FFT of [1, 2, 3, 4]. What is y[0] for a = [${a.join(', ')}]?`,
          setup: [['fft', '1 2 3 4']],
          answer: { kind: 'number', value: y0 },
          explain: `y[0] is the polynomial at ω⁰ = 1, which is the sum of the coefficients: ${a.join(' + ').replace(/\+ -/g, '− ')} = ${y0}.`,
          watch: [['fft', a.join(' ')]],
        };
      },
    },
    {
      id: 'product',
      title: 'Multiply polynomials',
      make(rng) {
        const a = [rng.int(1, 4), rng.int(1, 4)];
        const b = [rng.int(1, 4), rng.int(1, 4)];
        const c = end([['multiply', `${a.join(' ')} | ${b.join(' ')}`]]).c!;
        return {
          prompt: `What is the coefficient of x in (${polyText(a)})(${polyText(b)})?`,
          setup: [['multiply', '1 2 | 3 4']],
          answer: { kind: 'number', value: c[1]! },
          explain: `The product is ${polyText(c)}. The x term comes from ${a[0]}·${b[1]} + ${a[1]}·${b[0]} = ${c[1]}; the FFT finds it by evaluating, multiplying point by point, and interpolating.`,
          watch: [['multiply', `${a.join(' ')} | ${b.join(' ')}`]],
        };
      },
    },
  ];
}
