import { deriveSeed, makeRng } from './rng';
import type { AnyVizDef, PracticeAnswer, PracticeKind, PracticeQuestion } from './types';

export interface PracticeItem {
  kind: PracticeKind;
  question: PracticeQuestion;
}

/**
 * The same seed always gives the same set, so an instructor can hand out a link and every
 * student gets the same questions. Kinds are taken in turn, so a set covers all of them.
 */
export function practiceSet(def: AnyVizDef, seed: number, count: number): PracticeItem[] {
  const kinds = def.practice ?? [];
  if (kinds.length === 0) return [];
  const order = makeRng(seed);
  const offset = order.int(0, kinds.length - 1);
  return Array.from({ length: count }, (_, i) => {
    const kind = kinds[(offset + i) % kinds.length]!;
    return { kind, question: kind.make(makeRng(deriveSeed(seed, i + 1))) };
  });
}

const tokens = (s: string) =>
  s
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());

/** Check a learner's response. Choice answers take the option index as a string. */
export function isCorrect(answer: PracticeAnswer, response: string): boolean {
  switch (answer.kind) {
    case 'choice':
      // No choice made is never right (Number('') would be 0, the first option).
      return response.trim() !== '' && Number(response) === answer.correct;
    case 'number': {
      if (response.trim() === '') return false;
      // A typed minus sign (−) counts as a hyphen.
      const n = Number(response.trim().replace(/^\u2212/, '-'));
      return answer.tolerance === undefined
        ? n === answer.value
        : Math.abs(n - answer.value) <= answer.tolerance + 1e-9;
    }
    case 'sequence': {
      const got = tokens(response);
      const want = answer.value.map((v) => v.toLowerCase());
      return got.length === want.length && got.every((t, i) => t === want[i]);
    }
  }
}

/** Describe the right answer in words, for after a wrong attempt. */
export function answerText(answer: PracticeAnswer): string {
  switch (answer.kind) {
    case 'choice':
      return answer.options[answer.correct]!;
    case 'number': {
      if (answer.tolerance === undefined) return String(answer.value);
      // To the precision asked for: a tolerance of 0.005 means two decimals.
      const places = Math.max(0, Math.ceil(-Math.log10(2 * answer.tolerance) - 1e-9));
      return answer.value.toFixed(places);
    }
    case 'sequence':
      return answer.value.length ? answer.value.join(' ') : '(nothing)';
  }
}
