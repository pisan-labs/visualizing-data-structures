import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { choice } from '../_recursion/kit';
import {
  BLOCK_NAMES,
  combineText,
  defaults,
  matrixText,
  num,
  schemeOf,
  type Mat,
  type StSettings,
  type StState,
} from './model';

type Def = VizDef<StState, StSettings, undefined>;

/** Each block of C as the plain block product writes it. */
const PLAIN = ['A11·B11 + A12·B21', 'A11·B12 + A12·B22', 'A21·B11 + A22·B21', 'A21·B12 + A22·B22'];

/** Practice for Strassen. Every answer comes from running the model or reading its scheme. */
export function strassenPractice(def: () => Def): PracticeKind[] {
  const end = (settings: StSettings, calls: OpCall[]): StState => {
    const t = new Timeline(def(), settings, 1, calls);
    return t.entries.at(-1)!.end;
  };
  const random = (rng: Rng, n: number, hi = 5): Mat =>
    Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(0, hi)));
  const call = (A: Mat, B: Mat): OpCall => ['multiply', `${matrixText(A)} * ${matrixText(B)}`];
  const show = (m: Mat) => `[${m.map((r) => r.join(' ')).join('; ')}]`;

  return [
    {
      id: 'product',
      title: 'One of the seven',
      make(rng) {
        const A = random(rng, 2);
        const B = random(rng, 2);
        const s = end(defaults, [call(A, B)]);
        const scheme = schemeOf(defaults);
        const k = rng.int(0, 6);
        const p = scheme.products[k]!;
        const kid = s.calls[s.calls[0]!.children[k]! - 1]!;
        return {
          prompt: `A = ${show(A)} and B = ${show(B)}, both 2 × 2, so each block is one number. With CLRS's sums, what is ${p.name} = ${p.leftText}·${p.rightText}?`,
          setup: [],
          answer: { kind: 'number', value: kid.C[0]![0]! },
          explain: `${p.leftText} = ${num(kid.A[0]![0]!)} and ${p.rightText} = ${num(kid.B[0]![0]!)}, so ${p.name} = ${num(kid.A[0]![0]!)} · ${num(kid.B[0]![0]!)} = ${num(kid.C[0]![0]!)}.`,
          watch: [call(A, B)],
        };
      },
    },
    {
      id: 'combine',
      title: 'Putting C together',
      make(rng) {
        const scheme = schemeOf(defaults);
        const b = rng.int(0, 3);
        const right = combineText(scheme, b);
        const wrong = [0, 1, 2, 3].filter((x) => x !== b).map((x) => combineText(scheme, x));
        const A = random(rng, 2);
        const B = random(rng, 2);
        return {
          prompt: `With CLRS's names P1 to P7, which products give ${BLOCK_NAMES[b]}?`,
          setup: [],
          answer: choice(rng, right, wrong),
          explain: `${BLOCK_NAMES[b]} = ${right}. Write out the products and everything cancels except ${BLOCK_NAMES[b]} = ${PLAIN[b]}, the block product's own formula.`,
          watch: [call(A, B)],
        };
      },
    },
    {
      id: 'count',
      title: 'How many multiplications?',
      make(rng) {
        const n = [2, 3, 4][rng.int(0, 2)]!;
        const A = random(rng, n, 3);
        const B = random(rng, n, 3);
        const s = end(defaults, [call(A, B)]);
        const N = s.calls[0]!.n;
        return {
          prompt: `How many scalar multiplications does Strassen's algorithm make for two ${n} × ${n} matrices, padding with zeros where it must?`,
          setup: [],
          answer: { kind: 'number', value: s.mults },
          explain: `${n === N ? '' : `${n} is not a power of 2, so it pads to ${N} × ${N}. `}Each split makes 7 half-size products, down to 1 × 1: 7^${Math.log2(N)} = ${s.mults}. The schoolbook method makes ${n ** 3}.`,
          watch: [call(A, B)],
        };
      },
    },
    {
      id: 'block',
      title: 'Eight products instead',
      make(rng) {
        const n = [2, 4][rng.int(0, 1)]!;
        const A = random(rng, n, 3);
        const B = random(rng, n, 3);
        const settings: StSettings = { ...defaults, method: 'block' };
        const s = end(settings, [call(A, B)]);
        const strassen = end(defaults, [call(A, B)]);
        return {
          prompt: `Plain block multiplication splits the same way but makes all eight half-size products. How many scalar multiplications does it make for ${n} × ${n}?`,
          setup: [],
          settings,
          answer: { kind: 'number', value: s.mults },
          explain: `8 products per split, down to 1 × 1: 8^${Math.log2(n)} = ${s.mults} = ${n}³, exactly the schoolbook count. Strassen makes ${strassen.mults}.`,
          watch: [call(A, B)],
        };
      },
    },
  ];
}
