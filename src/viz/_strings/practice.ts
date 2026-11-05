/**
 * Building blocks for the string-matching practice sets. Every answer comes from running the
 * page's own model with seed 1, the way the practice panel replays a question, so it always
 * agrees with what the visualization shows.
 */
import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeAnswer, Settings, VizDef } from '../../engine/types';
import { loadCall, randomWord, type MatchExtra, type MatchState } from './kit';

// Settings and preprocessing differ from page to page; each page's practice.ts knows its own.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MatchDef = VizDef<MatchState<any>, any, MatchExtra>;

/** Run operations from the page's start state, as the practice panel does. */
export function runOps(def: MatchDef, settings: Settings, ops: OpCall[]) {
  return new Timeline(def, { ...def.defaults, ...settings }, 1, ops);
}

/** The state after the operations. */
export function stateAfter(def: MatchDef, settings: Settings, ops: OpCall[]): MatchState {
  return runOps(def, settings, ops).endState();
}

export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** A multiple-choice answer: the right option and up to three distinct wrong ones, shuffled. */
export function choice(rng: Rng, right: string, wrong: readonly string[]): PracticeAnswer {
  const others = [...new Set(wrong.filter((w) => w !== right))].slice(0, 3);
  const options = shuffle(rng, [right, ...others]);
  return { kind: 'choice', options, correct: options.indexOf(right) };
}

/** A multiple-choice answer whose options keep their order. */
export function ordered(options: string[], right: string): PracticeAnswer {
  return { kind: 'choice', options, correct: options.indexOf(right) };
}

/** `next` k times: the setup that leaves the pattern waiting at the k-th alignment. */
export const nexts = (k: number): OpCall[] => Array.from({ length: k }, () => ['next'] as OpCall);

/** A text and a pattern over `letters`, with the pattern planted at least once. */
export function input(
  rng: Rng,
  n: number,
  m: number,
  letters: string,
): { text: string; pattern: string; load: OpCall } {
  const pattern = randomWord(rng, m, letters);
  const chars = [...randomWord(rng, n, letters)];
  const s = rng.int(0, n - m);
  for (let j = 0; j < m; j++) chars[s + j] = pattern[j]!;
  const text = chars.join('');
  return { text, pattern, load: loadCall(text, pattern) };
}

/** `T = ABAB and P = AB`, in code. */
export const pair = (text: string, pattern: string) => `T = \`${text}\` and P = \`${pattern}\``;
