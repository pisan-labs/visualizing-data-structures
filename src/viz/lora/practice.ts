import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { two } from '../_lm/numbers';
import {
  adamStep,
  adapterParams,
  defaults,
  delta,
  DIM,
  rankOf,
  scaleOf,
  zeros,
  type Init,
  type LoraSettings,
  type LoraState,
} from './model';

type Def = VizDef<LoraState, LoraSettings, unknown>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const fmt = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');

/**
 * A target of rank k that a learner can read: k outer products of short vectors of small
 * integers, entries at most 3 in size, with the rank checked by the model.
 */
function readableTarget(rng: Rng, k: number): number[][] {
  for (;;) {
    const t = zeros(DIM, DIM);
    for (let m = 0; m < k; m++) {
      const u = Array.from({ length: DIM }, () => pick(rng, [-1, 0, 1, 1, 2]));
      const v = Array.from({ length: DIM }, () => pick(rng, [-1, 0, 0, 1, 1]));
      for (let i = 0; i < DIM; i++) for (let j = 0; j < DIM; j++) t[i]![j]! += u[i]! * v[j]!;
    }
    if (rankOf(t) === k && Math.max(...t.flat().map(Math.abs)) <= 3)
      return t.map((row) => row.map((x) => x + 0));
  }
}

const targetText = (t: number[][]) => t.flat().join(' ');

/**
 * Practice for LoRA. Every answer comes from the model: its parameter count, the ΔW its
 * B and A make, the rank of a target, and what one Adam step moves.
 */
export function loraPractice(def: () => Def): PracticeKind[] {
  const run = (settings: LoraSettings, ops: OpCall[]) =>
    new Timeline(def(), settings, 1, ops).endState();

  return [
    {
      id: 'params',
      title: 'How many numbers does the adapter train?',
      make(rng) {
        const d = pick(rng, [768, 1024, 4096, 12288]);
        const r = pick(rng, [1, 2, 4, 8, 16]);
        const value = adapterParams(d, r);
        const settings: LoraSettings = { ...defaults, rank: pick(rng, [1, 2]) };
        return {
          prompt: `A layer's W is **${fmt(d)} × ${fmt(d)}**, and LoRA gives it an adapter of rank **r = ${r}**. How many numbers does the adapter train? (The picture is the toy: 4 × 4 with r = ${settings.rank}.)`,
          setup: [['target', '2']],
          settings,
          answer: { kind: 'number', value },
          explain: `B is ${fmt(d)} × ${r} and A is ${r} × ${fmt(d)}: 2 × ${fmt(d)} × ${r} = ${fmt(value)}. Full fine-tuning would train ${fmt(d)}² = ${fmt(d * d)}, so the adapter is ${two((100 * value) / (d * d))}% of that.`,
          watch: [['train']],
        };
      },
    },
    {
      id: 'entry',
      title: 'One entry of ΔW',
      make(rng) {
        const r = pick(rng, [1, 2, 2]);
        const alpha = pick(rng, r === 1 ? ['1', '2'] : ['2', '4']) as LoraSettings['alpha'];
        const settings: LoraSettings = { rank: r, alpha, init: 'random' };
        const setup: OpCall[] = [['target', targetText(readableTarget(rng, rng.int(1, 3)))]];
        const s = run(settings, setup);
        const sc = scaleOf(settings);
        const dw = delta(s.b, s.a, sc);
        const i = rng.int(0, DIM - 1);
        const j = rng.int(0, DIM - 1);
        const terms = Array.from(
          { length: r },
          (_, k) => `${two(s.b[i]![k]!)} × ${two(s.a[k]![j]!)}`,
        ).join(' + ');
        return {
          prompt: `Here B and A both start random, with r = ${r} and α = ${alpha}. What is **ΔW in row ${i + 1}, column ${j + 1}**? Multiply row ${i + 1} of B by column ${j + 1} of A, then by α/r. Two decimals.`,
          setup,
          settings,
          answer: { kind: 'number', value: dw[i]![j]!, tolerance: 0.005 },
          explain: `Row ${i + 1} of B times column ${j + 1} of A: ${terms} = ${two(dw[i]![j]! / sc)}. Times α/r = ${alpha}/${r}: ${two(dw[i]![j]!)}.`,
          watch: [['train']],
        };
      },
    },
    {
      id: 'reach',
      title: 'Can rank r express it?',
      make(rng) {
        const r = pick(rng, [1, 1, 2]);
        const k = r === 1 ? pick(rng, [1, 2]) : pick(rng, [1, 2, 3]);
        const target = readableTarget(rng, k);
        const settings: LoraSettings = { ...defaults, rank: r };
        const setup: OpCall[] = [['target', targetText(target)]];
        const s = run(settings, setup);
        const rank = rankOf(s.target);
        const yes = rank <= r;
        return {
          prompt: `The picture's D is the update full fine-tuning would make. Can an adapter of **rank ${r}** make ΔW exactly equal to D?`,
          setup,
          settings,
          answer: {
            kind: 'choice',
            options: [`Yes: D has rank at most ${r}`, `No: D has rank more than ${r}`],
            correct: yes ? 0 : 1,
          },
          explain: yes
            ? `D has rank ${rank}${rank === 1 ? ': every nonzero row is a multiple of one row' : ''}. B·A can have rank up to ${r}, so training can reach D.`
            : `D has rank ${rank}: its rows need ${rank} independent directions, and B·A has at most ${r}. Training stalls at the best rank-${r} approximation.`,
          watch: [['train'], ['train'], ['train']],
        };
      },
    },
    {
      id: 'moves',
      title: 'What moves on the first step?',
      make(rng) {
        const init = pick(rng, ['paper', 'paper', 'random', 'zero'] as Init[]);
        const settings: LoraSettings = { ...defaults, rank: pick(rng, [1, 2]), init };
        const setup: OpCall[] = [['target', targetText(readableTarget(rng, rng.int(1, 2)))]];
        const s = run(settings, setup);
        const n = adamStep(s.b, s.a, s.opt, s.target, scaleOf(settings));
        const changed = (x: number[][], y: number[][]) =>
          x.some((row, i) => row.some((v, j) => v !== y[i]![j]));
        const mb = changed(s.b, n.b);
        const ma = changed(s.a, n.a);
        const options = ['Only B', 'Only A', 'Both B and A', 'Neither'];
        const correct = mb && ma ? 2 : mb ? 0 : ma ? 1 : 3;
        const start: Record<Init, string> = {
          paper: 'A starts random and B starts at zero',
          random: 'both B and A start random',
          zero: 'both B and A start at zero',
        };
        const why = [
          "A's gradient is (α/r)·Bᵀ·2E, and B is all zeros, so A gets no push; B's gradient (α/r)·2E·Aᵀ uses the random A, so B moves.",
          "B's gradient is (α/r)·2E·Aᵀ, and A is all zeros, so B gets no push; A moves.",
          'Each gradient uses the other matrix, and both are nonzero, so both move.',
          "B's gradient needs A and A's needs B, and both are 0: nothing moves, now or ever.",
        ];
        return {
          prompt: `Here ${start[init]}. W is frozen. Which of B and A change on the **first** training step?`,
          setup,
          settings,
          answer: { kind: 'choice', options, correct },
          explain: why[correct]!,
          watch: [['train']],
        };
      },
    },
  ];
}
