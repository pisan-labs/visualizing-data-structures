import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { buildCall, minus, randomValues } from '../_range/kit';
import { bin, coverOf, type FenExtra, type FenSettings, type FenState } from './model';

type Def = VizDef<FenState, FenSettings, FenExtra>;
type FenStep = Step<FenState, FenExtra>;

const LINEAR: FenSettings = { build: 'linear' };

/** "A[9..12]", or "A[5]" for one value. */
const range = (i: number) => {
  const [lo, hi] = coverOf(i);
  return lo === hi ? `A[${lo}]` : `A[${lo}..${hi}]`;
};

/**
 * Practice questions for Fenwick trees. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function fenwickPractice(def: () => Def): PracticeKind[] {
  const lastOp = (cs: OpCall[]): FenStep[] => {
    const t = new Timeline(def(), LINEAR, 1, cs);
    return t.entries[t.entries.length - 1]!.steps;
  };
  /** The values of `i` at the steps that use one of these pseudocode lines, in order. */
  const visited = (steps: FenStep[], line: string) =>
    steps.filter((st) => st.lines.includes(line)).map((st) => Number(st.vars?.i));
  const randomTree = (rng: Parameters<PracticeKind['make']>[0], lo: number, hi: number) => {
    const n = rng.int(lo, hi);
    return { n, setup: [buildCall(randomValues(rng, n, 1, 20))] };
  };

  return [
    {
      id: 'low-bit',
      title: 'The lowest set bit',
      make(rng) {
        const { n, setup } = randomTree(rng, 10, 16);
        let i = rng.int(2, n);
        if (i % 2 === 1 && rng.int(0, 2) > 0) i -= 1;
        const first = lastOp([...setup, ['prefix', i]]).find((st) => st.lines.includes('pf.add'))!;
        const l = Number(first.vars?.['i & -i']);
        return {
          prompt: `What is \`i & −i\` for i = ${i}? It is the lowest set bit of i, and it is also how many values T[${i}] covers.`,
          setup,
          settings: LINEAR,
          answer: { kind: 'number', value: l },
          explain: `${i} = ${bin(i)}₂. Its lowest set bit is ${bin(l)}₂ = ${l}, so T[${i}] covers ${l === 1 ? 'one value' : `${l} values`}, ${range(i)}.`,
          watch: [['prefix', i]],
        };
      },
    },
    {
      id: 'update-path',
      title: 'Which entries does an add change?',
      make(rng) {
        const { n, setup } = randomTree(rng, 10, 16);
        const i = rng.int(1, n - 1);
        const d = rng.int(1, 9);
        const path = visited(lastOp([...setup, ['add', i, d]]), 'ad.add');
        return {
          prompt: `\`add(${i}, ${d})\` adds ${d} to A[${i}]. Which entries of T change? Type their indices in the order the walk visits them.`,
          setup,
          settings: LINEAR,
          answer: { kind: 'sequence', value: path.map(String) },
          explain: `Start at i = ${i} and keep adding the lowest set bit while i ≤ ${n}: ${path.map((p) => `${p} = ${bin(p)}₂`).join(', ')}. Each of these ranges contains position ${i}.`,
          watch: [['add', i, d]],
        };
      },
    },
    {
      id: 'query-path',
      title: 'Which entries does a prefix sum read?',
      make(rng) {
        const { n, setup } = randomTree(rng, 10, 16);
        let i = rng.int(3, n);
        if ((i & (i - 1)) === 0) i -= 1;
        const path = visited(lastOp([...setup, ['prefix', i]]), 'pf.add');
        return {
          prompt: `\`prefix(${i})\` adds up A[1] through A[${i}]. Which entries of T does it read? Type their indices in order.`,
          setup,
          settings: LINEAR,
          answer: { kind: 'sequence', value: path.map(String) },
          explain: `Start at i = ${i} and keep clearing the lowest set bit until i is 0: ${path.map((p) => `${p} = ${bin(p)}₂`).join(', ')}. One entry per 1 bit of ${i}, and their ranges, ${path.map(range).join(', ')}, fit together into A[1..${i}].`,
          watch: [['prefix', i]],
        };
      },
    },
    {
      id: 'range-sum',
      title: 'A range sum from two prefix sums',
      make(rng) {
        const { n, setup } = randomTree(rng, 8, 14);
        const l = rng.int(2, n - 2);
        const r = rng.int(l + 1, n);
        const steps = lastOp([...setup, ['sum', l, r]]);
        const end = steps[steps.length - 1]!;
        const right = Number(
          steps.findLast((st) => st.vars?.[`prefix(${r})`] !== undefined)?.vars?.[`prefix(${r})`],
        );
        const left = Number(
          steps.findLast((st) => st.vars?.[`prefix(${l - 1})`] !== undefined)?.vars?.[
            `prefix(${l - 1})`
          ],
        );
        return {
          prompt: `Use T to work out \`sum(${l}, ${r})\`, the sum of A[${l}] through A[${r}]: it is prefix(${r}) − prefix(${l - 1}).`,
          setup,
          settings: LINEAR,
          answer: { kind: 'number', value: Number(end.vars?.sum) },
          explain: `prefix(${r}) = ${right} and prefix(${l - 1}) = ${left}, so sum(${l}, ${r}) = ${minus(right, left)} = ${Number(end.vars?.sum)}.`,
          watch: [['sum', l, r]],
        };
      },
    },
  ];
}
