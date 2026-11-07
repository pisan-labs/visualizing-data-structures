/** Random expressions and words, for the presets and the practice questions. */
import type { Rng } from '../../engine/rng';
import { showRegex, type Regex, type UnionSign } from '../_automata/regex';

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length - 1)]!;

/**
 * An expression with exactly `n` symbols from `alphabet`: concatenations and unions, with a
 * star now and then. `plus` allows R+ (only when + is not union).
 */
export function randomRegex(rng: Rng, n: number, alphabet = ['a', 'b'], plus = false): Regex {
  const grow = (n: number, depth: number): Regex => {
    let r: Regex;
    if (n === 1) r = { kind: 'sym', c: pick(rng, alphabet) };
    else {
      const k = rng.int(1, n - 1);
      const a = grow(k, depth + 1);
      const b = grow(n - k, depth + 1);
      r = { kind: rng.int(0, 2) ? 'concat' : 'union', a, b };
    }
    const roll = rng.int(0, 9);
    if (roll < 2 && depth > 0) r = { kind: 'star', a: r };
    else if (roll === 2 && plus) r = { kind: 'plus', a: r };
    else if (roll === 3 && depth > 1) r = { kind: 'opt', a: r };
    return r;
  };
  return grow(n, 0);
}

/** A random expression's text, written with the union sign, kept to `max` characters. */
export function randomText(rng: Rng, n: number, sign: UnionSign, max = 24): string {
  for (let tries = 0; ; tries++) {
    const text = showRegex(randomRegex(rng, n, ['a', 'b'], sign === '|'), sign);
    if (text.length <= max || tries > 20)
      return text.length <= max ? text : 'a(a|b)*b'.replace('|', sign);
  }
}

export function randomWord(rng: Rng, length: number, alphabet = ['a', 'b']): string {
  return Array.from({ length }, () => pick(rng, alphabet)).join('');
}
