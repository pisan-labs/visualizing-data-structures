import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { defaults, type ChainExtra, type ChainSettings, type ChainState } from './model';

type Def = VizDef<ChainState, ChainSettings, ChainExtra>;
type ChainStep = Step<ChainState, ChainExtra>;

export function randomDims(rng: Rng, n: number): number[] {
  return Array.from({ length: n + 1 }, () => rng.int(2, 30));
}

const dimsText = (p: number[]) =>
  p
    .slice(1)
    .map((d, i) => `A${i + 1} is ${p[i]}×${d}`)
    .join(', ');

/**
 * Practice questions for matrix-chain order. Answers come from running the model with seed 1,
 * the way the practice panel replays a question. `def` is a getter to avoid an import cycle.
 */
export function chainPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), { ...defaults }, 1, ops);
  const last = (ops: OpCall[]): ChainStep => run(ops).entries.at(-1)!.steps.at(-1)!;

  return [
    {
      id: 'cell',
      title: 'Fill the next diagonal',
      make(rng) {
        const n = rng.int(3, 5);
        const p = randomDims(rng, n);
        const done = rng.int(1, n - 1);
        const len = done + 1;
        const i = rng.int(1, n - len + 1);
        const j = i + len - 1;
        const setup: OpCall[] = [
          ['dims', p.join(' ')],
          ...Array.from({ length: done }, () => ['diagonal'] as OpCall),
        ];
        const end = run([...setup, ['diagonal']]).endState();
        const v = end.m[i - 1]![j - 1]!;
        const k = end.s[i - 1]![j - 1]!;
        return {
          prompt: `${dimsText(p)}. Chains of length 1 to ${done} are filled. What is m[${i}][${j}], the fewest multiplications for A${i}…A${j}?`,
          setup,
          answer: { kind: 'number', value: v },
          explain: `Try every split k from ${i} to ${j - 1}: m[${i}][k] + m[k + 1][${j}] + p${i - 1}·pk·p${j}. The best is k = ${k}: ${end.m[i - 1]![k - 1]} + ${end.m[k]![j - 1]} + ${p[i - 1]}·${p[k]}·${p[j]} = ${v}.`,
          watch: [['diagonal']],
        };
      },
    },
    {
      id: 'split',
      title: 'Where is the last multiplication?',
      make(rng) {
        const n = rng.int(3, 5);
        const p = randomDims(rng, n);
        const setup: OpCall[] = [['dims', p.join(' ')]];
        const st = run([...setup, ['fill']]).endState();
        const k = st.s[0]![n - 1]!;
        return {
          prompt: `${dimsText(p)}. In the cheapest order, the last multiplication is (A1…Ak) times (Ak+1…A${n}). What is k?`,
          setup,
          answer: { kind: 'number', value: k },
          explain: `s[1][${n}] = ${k}: (A1…A${k}) and (A${k + 1}…A${n}) cost ${st.m[0]![k - 1]} and ${st.m[k]![n - 1]}, and multiplying the two results costs ${p[0]}·${p[k]}·${p[n]}, ${st.m[0]![n - 1]} in all.`,
          watch: [['fill']],
        };
      },
    },
    {
      id: 'order',
      title: 'Bracket the chain',
      make(rng) {
        const n = rng.int(3, 5);
        const p = randomDims(rng, n);
        const setup: OpCall[] = [['dims', p.join(' ')], ['fill']];
        const end = last([...setup, ['paren']]);
        const order = String(end.vars?.order);
        return {
          prompt: `${dimsText(p)}. The tables are full. Type the cheapest order with brackets around every product, outer ones included, such as ((A1A2)A3).`,
          setup,
          answer: { kind: 'sequence', value: [order] },
          explain: `Read s from s[1][${n}] down: ${order}, ${String(end.vars?.cost)} multiplications.`,
          watch: [['paren']],
        };
      },
    },
  ];
}
