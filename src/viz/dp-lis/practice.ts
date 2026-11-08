import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { defaults, type LisExtra, type LisSettings, type LisState } from './model';

type Def = VizDef<LisState, LisSettings, LisExtra>;
type LisStep = Step<LisState, LisExtra>;

export function randomSequence(rng: Rng, n: number, max = 30): number[] {
  return Array.from({ length: n }, () => rng.int(1, max));
}

/**
 * Practice questions for the longest increasing subsequence. Answers come from running the
 * model with seed 1, the way the practice panel replays a question. `def` is a getter to avoid
 * an import cycle.
 */
export function lisPractice(def: () => Def): PracticeKind[] {
  const steps = (ops: OpCall[], method: LisSettings['method']): LisStep[] =>
    new Timeline(def(), { ...defaults, method }, 1, ops).entries.at(-1)!.steps;
  const last = (ops: OpCall[], method: LisSettings['method'] = 'quadratic') =>
    steps(ops, method).at(-1)!;

  return [
    {
      id: 'cell',
      title: 'Fill a cell of L',
      make(rng) {
        const a = randomSequence(rng, rng.int(6, 8));
        const i = rng.int(3, a.length);
        const setup: OpCall[] = [['values', a.join(' ')]];
        const end = last([...setup, ['fill']]).state;
        const v = end.L[i - 1]!;
        const p = end.P[i - 1]!;
        return {
          prompt: `Sequence ${a.join(', ')}. L[i] is the length of the longest strictly increasing subsequence that ends at a[i]. What is L[${i}]?`,
          setup,
          answer: { kind: 'number', value: v },
          explain:
            p < 0
              ? `No earlier value is smaller than a[${i}] = ${a[i - 1]}, so L[${i}] = 1.`
              : `The best earlier value to follow is a[${p + 1}] = ${a[p]}, with L[${p + 1}] = ${end.L[p]}, so L[${i}] = ${end.L[p]} + 1 = ${v}.`,
          watch: [['fill']],
        };
      },
    },
    {
      id: 'length',
      title: 'How long is the LIS?',
      make(rng) {
        const a = randomSequence(rng, rng.int(6, 10));
        const setup: OpCall[] = [['values', a.join(' ')]];
        const end = last([...setup, ['fill'], ['trace']]);
        return {
          prompt: `Sequence ${a.join(', ')}. How long is its longest strictly increasing subsequence?`,
          setup,
          answer: { kind: 'number', value: Number(end.vars?.length) },
          explain: `One longest run is ${String(end.vars?.lis).split(' ').join(', ')}. No increasing subsequence is longer.`,
          watch: [['fill'], ['trace']],
        };
      },
    },
    {
      id: 'tails',
      title: 'What is in tails?',
      make(rng) {
        const a = randomSequence(rng, rng.int(6, 9));
        const k = rng.int(4, a.length);
        const setup: OpCall[] = [['values', a.join(' ')]];
        const placed = steps([...setup, ['fill']], 'tails').filter(
          (s) => s.extra?.place !== undefined,
        );
        const st = placed[k - 1]!.state;
        const tails = st.tails.map((i) => String(st.a[i]));
        return {
          prompt: `Sequence ${a.join(', ')}. With binary search over tails, each value replaces the first tail that is not smaller than it, or goes at the end. Type the values in tails after the first ${k} values.`,
          setup,
          settings: { method: 'tails' },
          answer: { kind: 'sequence', value: tails },
          explain: `After ${a.slice(0, k).join(', ')}, tails holds ${tails.join(', ')}: the smallest value that ends an increasing run of each length from 1 to ${tails.length}.`,
          watch: [['fill']],
        };
      },
    },
    {
      id: 'walk',
      title: 'Follow P back',
      make(rng) {
        const a = randomSequence(rng, rng.int(6, 9));
        const setup: OpCall[] = [['values', a.join(' ')], ['fill']];
        const end = last([...setup, ['trace']]);
        const lis = String(end.vars?.lis).split(' ');
        return {
          prompt: `Sequence ${a.join(', ')}. The table is full. Start at the first position with the largest L and follow P back. Type the subsequence it finds, left to right.`,
          setup,
          answer: { kind: 'sequence', value: lis },
          explain: `Following P gives ${[...lis].reverse().join(', ')}; read left to right that is ${lis.join(', ')}.`,
          watch: [['trace']],
        };
      },
    },
  ];
}
