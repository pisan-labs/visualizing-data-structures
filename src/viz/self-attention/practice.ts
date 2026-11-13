import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { short, two } from '../_lm/numbers';
import { ANIMALS, THINGS } from '../_lm/vocab';
import {
  attention,
  D_K,
  defaults,
  wordName,
  type AttnExtra,
  type AttnResult,
  type AttnSettings,
  type AttnState,
} from './model';

type Def = VizDef<AttnState, AttnSettings, AttnExtra>;

const pick = (rng: Rng, xs: readonly string[]) => xs[rng.int(0, xs.length - 1)]!;

/** Sentences whose rows say something: a verb after an animal, a pronoun, a small word. */
function sentence(rng: Rng): string {
  const a = pick(rng, ANIMALS);
  const t = pick(rng, THINGS);
  return pick(rng, [
    `the ${a} sat on the ${t}`,
    `the ${a} saw the ${t} and it`,
    `a ${a} ate the ${t}`,
    `the ${a} chased a ${t}`,
    `the ${a} ran under the ${t}`,
  ]);
}

/**
 * Practice for self-attention with the hand-made head and the default settings (causal,
 * scaled). The picture shows the sentence after Project (Q, K and V filled); the questions ask
 * about Attend. Every answer comes from running the model.
 */
export function attentionPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng) {
    const text = sentence(rng);
    const ops: OpCall[] = [['load', text], ['project']];
    const t = new Timeline(def(), defaults, 1, ops);
    const s = t.endState();
    const r: AttnResult = attention(s.x, s.head, defaults.causal, defaults.scale);
    const names = s.words.map((_, i) => wordName(s.words, i));
    return { ops, s, r, names, watch: [['attend']] as OpCall[] };
  }

  return [
    {
      id: 'score',
      title: 'Score a pair',
      make(rng) {
        const { ops, s, r, names, watch } = setup(rng);
        const n = s.words.length;
        // A pair the mask allows, with a score that is not zero when one exists.
        const pairs: [number, number][] = [];
        for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) pairs.push([i, j]);
        const live = pairs.filter(([i, j]) => Math.abs(r.raw[i]![j]!) > 0.001);
        const [i, j] = (live.length ? live : pairs)[rng.int(0, (live.length || pairs.length) - 1)]!;
        const terms = r.q[i]!.map((q, k) => `${two(q)} × ${two(r.k[j]![k]!)}`).join(' + ');
        return {
          prompt: `What score does **${names[i]}** give **${names[j]}** before scaling? That is q·k: the dot product of ${names[i]}'s query and ${names[j]}'s key. Two decimals.`,
          setup: ops,
          answer: { kind: 'number', value: r.raw[i]![j]!, tolerance: 0.005 },
          explain: `q_${names[i]} · k_${names[j]} = ${terms} = ${two(r.raw[i]![j]!)}. Multiply the matching entries and add.`,
          watch,
        };
      },
    },
    {
      id: 'scaled',
      title: 'Scale a score',
      make(rng) {
        const { ops, s, r, names, watch } = setup(rng);
        const n = s.words.length;
        let i = rng.int(1, n - 1);
        let j = rng.int(0, i);
        for (let tries = 0; tries < 20 && Math.abs(r.raw[i]![j]!) < 0.001; tries++) {
          i = rng.int(1, n - 1);
          j = rng.int(0, i);
        }
        return {
          prompt: `Attention divides each score by √d_k, and here d_k = ${D_K}. What does **${names[i]}**'s score for **${names[j]}** become? Two decimals.`,
          setup: ops,
          answer: { kind: 'number', value: r.scaled[i]![j]!, tolerance: 0.005 },
          explain: `The raw score is q·k = ${two(r.raw[i]![j]!)}; divided by √${D_K} ≈ ${two(Math.sqrt(D_K))} it is ${two(r.scaled[i]![j]!)}.`,
          watch,
        };
      },
    },
    {
      id: 'top',
      title: 'Who gets the most attention?',
      make(rng) {
        for (;;) {
          const { ops, s, r, names, watch } = setup(rng);
          const n = s.words.length;
          const i = rng.int(1, n - 1);
          const row = r.a[i]!.slice(0, i + 1);
          const sorted = [...row].sort((a, b) => b - a);
          // A clear winner, so the answer does not hang on the third decimal.
          if (sorted.length > 1 && sorted[0]! - sorted[1]! < 0.05) continue;
          const top = row.indexOf(sorted[0]!);
          const options = names.slice(0, i + 1);
          return {
            prompt: `With the causal mask, **${names[i]}** can look at itself and the words before it. Which of them gets the largest attention weight?`,
            setup: ops,
            answer: { kind: 'choice', options, correct: top },
            explain: `${names[i]}'s query matches ${names[top]}'s key best, so after softmax ${names[top]} gets ${short(row[top]!)} of the weight. The row: ${options.map((w, j) => `${w} ${short(row[j]!)}`).join(', ')}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'visible',
      title: 'What does the mask hide?',
      make(rng) {
        const { ops, s, names, watch } = setup(rng);
        const n = s.words.length;
        return {
          prompt: `With the causal mask on, how many of the ${n} × ${n} = ${n * n} scores become −∞?`,
          setup: ops,
          answer: { kind: 'number', value: (n * (n - 1)) / 2 },
          explain: `Word i may see words 1 to i, so row i hides n − i scores: ${Array.from({ length: n }, (_, i) => n - 1 - i).join(' + ')} = ${(n * (n - 1)) / 2}. The last word, ${names[n - 1]}, sees everything.`,
          watch,
        };
      },
    },
  ];
}
