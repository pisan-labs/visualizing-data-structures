import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { defaults, type PowSettings, type PowState } from './model';

type Def = VizDef<PowState, PowSettings, undefined>;

/** Practice for square-and-multiply. Every answer comes from running the model. */
export function modPowPractice(def: () => Def): PracticeKind[] {
  const steps = (settings: PowSettings, calls: OpCall[]): Step<PowState, undefined>[] => {
    const t = new Timeline(def(), settings, 1, calls);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const MODS = [7, 11, 13, 17, 19, 23];

  return [
    {
      id: 'value',
      title: 'Compute a power',
      make(rng) {
        const a = rng.int(2, 9);
        const b = rng.int(5, 30);
        const m = MODS[rng.int(0, MODS.length - 1)]!;
        const end = steps(defaults, [['pow', a, b, m]]).at(-1)!.state;
        const cs = end.rows.map((r) => r.c).join(', ');
        return {
          prompt: `The picture shows 7^13 mod 11. What is ${a}^${b} mod ${m}?`,
          setup: [['pow', 7, 13, 11]],
          answer: { kind: 'number', value: end.result! },
          explain: `${b} is ${end.bits.join('')} in binary. Reading it from the left, the exponent so far goes ${cs}, and d ends at ${end.result}.`,
          watch: [['pow', a, b, m]],
        };
      },
    },
    {
      id: 'count',
      title: 'How many multiplications?',
      make(rng) {
        const b = rng.int(9, 1023);
        const end = steps(defaults, [['pow', 3, b, 101]]).at(-1)!.state;
        const ones = end.bits.filter((x) => x === 1).length;
        return {
          prompt: `CLRS's version (bits from the left, squaring every time) computes 3^${b} mod 101. How many multiplications does it make, squarings and multiplies together?`,
          setup: [],
          answer: { kind: 'number', value: end.squarings + end.multiplies },
          explain: `${b} is ${end.bits.join('')} in binary: ${end.bits.length} bits, so ${end.squarings} squarings, and ${ones} ones, so ${end.multiplies} multiplies. ${end.squarings + end.multiplies} in all, against ${b - 1} for the naive loop.`,
          watch: [['pow', 3, b, 101]],
        };
      },
    },
    {
      id: 'pattern',
      title: 'Squares and multiplies',
      make(rng) {
        const b = rng.int(5, 63);
        const run = steps(defaults, [['pow', 2, b, 13]]);
        // Read the order of the operations off the steps: S for each squaring, M for each multiply.
        const seq: string[] = [];
        let sq = 0;
        let mu = 0;
        for (const s of run) {
          if (s.state.squarings > sq) seq.push('S');
          if (s.state.multiplies > mu) seq.push('M');
          sq = s.state.squarings;
          mu = s.state.multiplies;
        }
        return {
          prompt: `Bits from the left: write the operations for the exponent ${b} in order, S for a squaring and M for a multiply (for example S M S S M).`,
          setup: [],
          answer: { kind: 'sequence', value: seq },
          explain: `${b} is ${run.at(-1)!.state.bits.join('')} in binary. Each bit gives an S, and each 1 an M right after it: ${seq.join(' ')}.`,
          watch: [['pow', 2, b, 13]],
        };
      },
    },
  ];
}
