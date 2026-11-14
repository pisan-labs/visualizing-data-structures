import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { round3, two } from '../_lm/numbers';
import {
  defaults,
  SENTENCES,
  VOCAB,
  vec,
  type PairRec,
  type W2vExtra,
  type W2vSettings,
  type W2vState,
} from './model';

type Def = VizDef<W2vState, W2vSettings, W2vExtra>;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

const DIRECTIONS = [
  'd1 up, d2 up',
  'd1 up, d2 down',
  'd1 down, d2 up',
  'd1 down, d2 down',
] as const;

/** A number as the second operand of × or +: negatives in brackets. */
const par = (x: number) => (x < 0 ? `(${two(x)})` : two(x));
/** Two decimals, or three for a small number. */
const fine = (x: number) => (Math.abs(x) < 0.1 ? round3(x).replace('-', '−') : two(x));

const directionOf = (dx: number, dy: number) => (dx > 0 ? 0 : 2) + (dy > 0 ? 0 : 1);

/**
 * Practice for word2vec. The window questions start from nothing and ask about "Pairs only";
 * the update questions start from the page's first vectors or from new random ones (one
 * decimal each, so every number can be worked out exactly) and ask about one update. Every
 * answer comes from running the model.
 */
export function word2vecPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: W2vSettings) => new Timeline(def(), settings, 1, ops);

  /** A starting point and one update after it, with everything it did. */
  function update(rng: Rng, settings: W2vSettings) {
    const setup: OpCall[] = rng.int(0, 1) ? [['reset']] : [];
    for (let tries = 0; ; tries++) {
      const center = pick(rng, VOCAB);
      const context = pick(
        rng,
        VOCAB.filter((w) => w !== center),
      );
      const watch: OpCall[] = [['pair', `${center} ${context}`]];
      const t = run([...setup, ...watch], settings);
      const before = run(setup, settings).endState();
      const r: PairRec = t.entries.at(-1)!.steps.at(-1)!.extra!.log![0]!;
      const after = t.endState();
      const w = before.w[r.center]!;
      const c = before.c[r.context]!;
      // Skip a pair whose vectors have a 0 in them: its direction would not be clear.
      if (tries < 50 && (w[0] === 0 || w[1] === 0 || c[0] === 0 || c[1] === 0)) continue;
      return { setup, watch, r, before, after, center, context, w, c };
    }
  }

  return [
    {
      id: 'context',
      title: 'The pairs a window makes',
      make(rng) {
        const sentence = pick(rng, SENTENCES);
        const window = rng.int(1, 3);
        const settings: W2vSettings = { ...defaults, window };
        const words = sentence.split(' ');
        const i = rng.int(0, words.length - 1);
        const watch: OpCall[] = [['pairs', sentence]];
        const end = run(watch, settings).entries[0]!.steps.at(-1)!;
        const listed = end.extra!.work!.listed!;
        const ctx = listed.filter(([a]) => a === i).map(([, b]) => words[b]!);
        const nth = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][i]!;
        return {
          prompt: `"Pairs only" slides a window of **${window}** ${window === 1 ? 'word' : 'words'} on each side over **${sentence}**. With the ${nth} word, **${words[i]}**, in the middle, which words is it paired with? List them left to right.`,
          setup: [],
          settings,
          answer: { kind: 'sequence', value: ctx },
          explain: `The window covers positions ${Math.max(1, i + 1 - window)} to ${Math.min(words.length, i + 1 + window)}, all but ${words[i]} itself: ${ctx.join(', ')}. That is ${ctx.length} pairs${ctx.length < 2 * window ? `, fewer than 2 × ${window}, because the sentence ends` : ''}.`,
          watch,
        };
      },
    },
    {
      id: 'sigma',
      title: 'Score a pair',
      make(rng) {
        const settings = { ...defaults };
        const { setup, watch, r, center, context, w, c } = update(rng, settings);
        const d = w[0] * c[0] + w[1] * c[1];
        return {
          prompt: `Next, **${center}** and **${context}** are trained as a pair. w_${center} = ${vec(w)} and c_${context} = ${vec(c)}. What is σ(w_${center} · c_${context}), the model's belief that ${context} is a real neighbour of ${center}? Two decimals.`,
          setup,
          settings,
          answer: { kind: 'number', value: r.sigs[0]!, tolerance: 0.005 },
          explain: `The dot product is ${two(w[0])} × ${par(c[0])} + ${two(w[1])} × ${par(c[1])} = ${two(d)}, and σ(${two(d)}) = 1 / (1 + e^${two(-d)}) = ${two(r.sigs[0]!)}. Training wants it to be 1.`,
          watch,
        };
      },
    },
    {
      id: 'direction',
      title: 'Which way does it move?',
      make(rng) {
        const settings = { ...defaults };
        for (;;) {
          const { setup, watch, r, before, after, center, w } = update(rng, settings);
          const noise = r.negs.length > 0 && rng.int(0, 1) === 1;
          const t = noise ? r.negs[0]! : r.context;
          const dx = after.c[t]![0] - before.c[t]![0];
          const dy = after.c[t]![1] - before.c[t]![1];
          if (Math.abs(dx) < 1e-12 || Math.abs(dy) < 1e-12) continue;
          const word = VOCAB[t]!;
          const negs = r.negs.map((n) => VOCAB[n]).join(' and ');
          return {
            prompt: `Next, **${center}** and **${VOCAB[r.context]}** are trained as a pair, with the noise words ${negs}. w_${center} = ${vec(w)}. Which way does c_${word}, the context vector of **${word}**, move?`,
            setup,
            settings,
            answer: { kind: 'choice', options: [...DIRECTIONS], correct: directionOf(dx, dy) },
            explain: noise
              ? `${word} is a noise word, so it is pushed away: c_${word} moves by −ησ·w_${center}, against w_${center} = ${vec(w)}. That is ${DIRECTIONS[directionOf(dx, dy)]}.`
              : `${word} is the real neighbour, so it is pulled in: c_${word} moves by η(1 − σ)·w_${center}, along w_${center} = ${vec(w)}. That is ${DIRECTIONS[directionOf(dx, dy)]}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'size',
      title: 'How far does it move?',
      make(rng) {
        const settings: W2vSettings = { ...defaults, lr: pick(rng, ['0.25', '0.5']) };
        const { setup, watch, r, before, after, center, context, w, c } = update(rng, settings);
        const dx = after.c[r.context]![0] - before.c[r.context]![0];
        return {
          prompt: `Next, **${center}** and **${context}** are trained as a pair with η = ${settings.lr}. w_${center} = ${vec(w)} and c_${context} = ${vec(c)}. The update pulls c_${context} toward w_${center} by η(1 − σ(w·c))·w_${center}. How much does its first coordinate (d1) change? Two decimals, with a minus sign if it goes down.`,
          setup,
          settings,
          answer: { kind: 'number', value: dx, tolerance: 0.005 },
          explain: `σ(w·c) = ${two(r.sigs[0]!)}, so c_${context} gains η(1 − σ) = ${settings.lr} × ${two(1 - r.sigs[0]!)} = ${two(r.coefs[0]!)} of w_${center}. Along d1 that is ${fine(r.coefs[0]!)} × ${par(w[0])} = ${fine(dx)}.`,
          watch,
        };
      },
    },
  ];
}
