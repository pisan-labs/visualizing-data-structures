import type { Rng } from '../../engine/rng';
import type { OpCall, PracticeKind } from '../../engine/types';
import { two } from '../_lm/numbers';
import {
  defaults,
  parseLogits,
  randomLogits,
  runPass,
  soften,
  strategyName,
  WORDS,
  type SampSettings,
} from './model';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;
const and = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

/** Settings for a cut, with the parameters a question names. */
function cutSettings(rng: Rng, kinds: SampSettings['strategy'][]): SampSettings {
  return {
    ...defaults,
    strategy: pick(rng, kinds),
    k: rng.int(2, 4),
    p: pick(rng, ['0.75', '0.9']),
    minP: pick(rng, ['0.1', '0.2', '0.3']),
  };
}

/** Logits for a question: four to six words, at T = 1. */
function logits(rng: Rng): { text: string; xs: number[] } {
  const text = randomLogits(rng, rng.int(4, 6));
  return { text, xs: parseLogits(text) as number[] };
}

/** No cumulative sum or min-p floor within 0.015 of the line, so two decimals decide it. */
function clearCut(xs: number[], s: SampSettings): boolean {
  const { p, order } = soften(xs, 1);
  if (s.strategy === 'top-p') {
    let cum = 0;
    return order.every((i) => Math.abs((cum += p[i]!) - Number(s.p)) > 0.015);
  }
  if (s.strategy === 'min-p') {
    const floor = Number(s.minP) * p[order[0]!]!;
    return order.every((i) => Math.abs(p[i]! - floor) > 0.015);
  }
  return true;
}

/**
 * Practice for sampling. The picture shows the logits and their probabilities at T = 1 (after
 * Load and Softmax); the questions ask about the cut and the draw that Sample would do. Every
 * answer comes from running the model.
 */
export function samplingPractice(_def?: unknown): PracticeKind[] {
  const setupOf = (text: string): OpCall[] => [['load', text], ['softmax']];
  const rule = (s: SampSettings) =>
    s.strategy === 'top-p'
      ? `keeps the most likely words until their probabilities add up to at least ${s.p}`
      : s.strategy === 'min-p'
        ? `keeps every word with at least ${s.minP} times the top word’s probability`
        : `keeps the ${s.k} most likely words`;

  return [
    {
      id: 'survive',
      title: 'Which words survive the cut?',
      make(rng) {
        for (;;) {
          const { text, xs } = logits(rng);
          const settings = cutSettings(rng, ['top-p', 'min-p']);
          if (!clearCut(xs, settings)) continue;
          const pass = runPass(xs, settings, 0.5);
          const kept = pass.order.slice(0, pass.keep).map((i) => WORDS[i]!);
          return {
            prompt: `The bars show the probabilities at T = 1. ${strategyName(settings)[0]!.toUpperCase()}${strategyName(settings).slice(1)} ${rule(settings)}. How many words survive the cut?`,
            setup: setupOf(text),
            settings,
            answer: { kind: 'number', value: pass.keep },
            explain:
              settings.strategy === 'top-p'
                ? `Add up, most likely first: ${pass.order
                    .slice(0, pass.keep)
                    .map((i) => two(pass.p[i]!))
                    .join(
                      ' + ',
                    )} = ${two(pass.mass)}, the first total to reach ${settings.p}. So ${and(kept)} stay.`
                : `The floor is ${settings.minP} × ${two(pass.p[pass.order[0]!]!)} = ${two(Number(settings.minP) * pass.p[pass.order[0]!]!)}. ${and(kept)} ${kept.length === 1 ? 'is' : 'are'} at or above it.`,
            watch: [['sample']],
          };
        }
      },
    },
    {
      id: 'renorm',
      title: 'Renormalize the survivors',
      make(rng) {
        for (;;) {
          const { text, xs } = logits(rng);
          const settings = cutSettings(rng, ['top-k', 'top-p']);
          if (!clearCut(xs, settings)) continue;
          const pass = runPass(xs, settings, 0.5);
          if (pass.keep < 2 || pass.keep === xs.length) continue;
          const kept = pass.order.slice(0, pass.keep);
          const i = pick(rng, kept);
          return {
            prompt: `The bars show the probabilities at T = 1. ${strategyName(settings)[0]!.toUpperCase()}${strategyName(settings).slice(1)} ${rule(settings)}. After renormalizing the survivors, what is **${WORDS[i]}**’s probability p′? Two decimals (within 0.01).`,
            setup: setupOf(text),
            settings,
            answer: { kind: 'number', value: pass.q[i]!, tolerance: 0.01 },
            explain: `The survivors are ${and(kept.map((j) => `${WORDS[j]} (${two(pass.p[j]!)})`))}, ${two(pass.mass)} in all. Divide: ${two(pass.p[i]!)} / ${two(pass.mass)} = ${two(pass.q[i]!)}.`,
            watch: [['sample']],
          };
        }
      },
    },
    {
      id: 'draw',
      title: 'Which word does u pick?',
      make(rng) {
        for (;;) {
          const { text, xs } = logits(rng);
          const settings = cutSettings(rng, ['top-k', 'top-p', 'min-p']);
          if (!clearCut(xs, settings)) continue;
          const u = rng.int(1, 99) / 100;
          const pass = runPass(xs, settings, u);
          if (pass.keep < 2) continue;
          // u well inside a stretch, so two decimals decide it.
          if (pass.to.slice(0, pass.keep).some((t) => Math.abs(t - u) < 0.03)) continue;
          const kept = pass.order.slice(0, pass.keep);
          const words = WORDS.slice(0, xs.length);
          const dropped = pass.order.slice(pass.keep).map((j) => words[j]!);
          const options = [...kept.map((j) => words[j]!), ...dropped.slice(0, 1)];
          const ranges = kept
            .map((j, k) => `${words[j]} ${two(pass.from[k]!)} to ${two(pass.to[k]!)}`)
            .join(', ');
          return {
            prompt: `${strategyName(settings)[0]!.toUpperCase()}${strategyName(settings).slice(1)} ${rule(settings)}, and the survivors are renormalized. The random number is **u = ${two(u)}**. Which word is drawn?`,
            setup: setupOf(text),
            settings,
            answer: { kind: 'choice', options, correct: pass.at },
            explain: `Laid end to end, most likely first, the survivors cover ${ranges}. u = ${two(u)} lands in ${words[kept[pass.at]!]}.${dropped.length ? ` ${dropped[0]} was cut, so no u can pick it.` : ''}`,
            watch: [['draw', u]],
          };
        }
      },
    },
    {
      id: 'temperature',
      title: 'What does temperature do?',
      make(rng) {
        for (;;) {
          const { text, xs } = logits(rng);
          const t = pick(rng, ['0.5', '2']);
          const before = soften(xs, 1);
          const after = soften(xs, Number(t));
          const i = rng.int(0, xs.length - 1);
          const d = after.p[i]! - before.p[i]!;
          if (Math.abs(d) < 0.02) continue;
          const options = ['It goes up', 'It goes down', 'It stays the same'];
          const rank = before.order.indexOf(i);
          return {
            prompt: `At T = 1 these logits give **${WORDS[i]}** probability ${two(before.p[i]!)}. Change the temperature to T = ${t}. What happens to ${WORDS[i]}’s probability?`,
            setup: [['load', text]],
            settings: { ...defaults, temperature: t },
            answer: { kind: 'choice', options, correct: d > 0 ? 0 : 1 },
            explain: `At T = ${t} it is ${two(after.p[i]!)}. ${t === '2' ? 'A higher temperature squeezes the logits together: probability moves from the top word toward the unlikely ones.' : 'A lower temperature spreads the logits apart: the top word gains and the unlikely words lose.'}${rank === 0 || rank === xs.length - 1 ? '' : ' A word in the middle can go either way; here it ' + (d > 0 ? 'gains.' : 'loses.')}`,
            watch: [['softmax']],
          };
        }
      },
    },
  ];
}
