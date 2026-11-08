/**
 * The menu: pairs of functions whose algebra is worked out here, by hand, so the page can say
 * what happens past the range it checks. Nothing here is decided at run time from samples.
 *
 * For each pair and each side of the definition (upper: 0 ≤ f(n) ≤ c·g(n), lower:
 * 0 ≤ c·g(n) ≤ f(n)) the algebra gives two facts about a constant c:
 *
 * - `eventually(c)`: whether the inequality holds for every large n;
 * - `settles(c)`: an n from which its truth changes at most once (true to false, or false to
 *   true, never back).
 *
 * With those, a finite amount of exact arithmetic settles every n: check up to `settles`, and
 * past it the truth either stays as it is or flips once, at a point a binary search finds. The
 * `why` text is the argument, in words. log n is ⌊log₂ n⌋ throughout.
 */
import { cmpR, divR, fmt, rat, subR, type Rat } from './expr';

export interface SideAlgebra {
  eventually(c: Rat): boolean;
  settles(c: Rat): bigint;
  why(c: Rat): string;
}

export interface MenuPair {
  id: string;
  /** As typed, and the preset's name. */
  f: string;
  g: string;
  label: string;
  upper: SideAlgebra;
  lower: SideAlgebra;
  /** Why f/g goes where it goes. */
  limitWhy: string;
  /** A question to start with, said when the pair is chosen. */
  hint: string;
}

const gt = (c: Rat, k: Rat) => cmpR(c, k) > 0;
const R = (n: number, d = 1) => rat(BigInt(n), BigInt(d));
const always = (v: boolean) => () => v;
/** k/(c − a) or k/(a − c), for the thresholds the algebra names. */
const over = (k: number, d: Rat) => fmt(divR(R(k), d));
const from = (n: number) => () => BigInt(n);

export const PAIRS: MenuPair[] = [
  {
    id: 'poly',
    f: '3n^2 + 10n + 5',
    g: 'n^2',
    label: '3n² + 10n + 5 against n²',
    upper: {
      eventually: (c) => gt(c, R(3)),
      settles: from(1),
      why: (c) =>
        gt(c, R(3))
          ? 'f(n) ≤ c·n² is the same as (c − 3)·n² ≥ 10n + 5. With c > 3 the left side is a parabola that overtakes the line once and never falls behind again.'
          : 'f(n) ≤ c·n² is the same as (c − 3)·n² ≥ 10n + 5, and with c ≤ 3 the left side is never positive. No n works: c must be bigger than 3.',
    },
    lower: {
      eventually: (c) => !gt(c, R(3)),
      settles: from(1),
      why: (c) =>
        gt(c, R(3))
          ? 'c·n² ≤ f(n) is the same as (c − 3)·n² ≤ 10n + 5. With c > 3 the parabola on the left passes the line once and stays ahead, so it fails for good.'
          : 'c·n² ≤ 3n² ≤ 3n² + 10n + 5 for every n, since c ≤ 3.',
    },
    limitWhy: '(3n² + 10n + 5)/n² = 3 + 10/n + 5/n², and 10/n and 5/n² shrink to 0.',
    hint: 'The 10n + 5 keeps f above 3n² everywhere. Is c = 4 enough, and from which n?',
  },
  {
    id: 'linear-quadratic',
    f: '100n',
    g: 'n^2',
    label: '100n against n²',
    upper: {
      eventually: always(true),
      settles: from(1),
      why: (c) =>
        `100n ≤ c·n² is the same as n ≥ 100/c = ${fmt(divR(R(100), c))}: once n passes it, every bigger n does too.`,
    },
    lower: {
      eventually: always(false),
      settles: from(1),
      why: (c) =>
        `c·n² ≤ 100n is the same as n ≤ 100/c = ${fmt(divR(R(100), c))}. Every n past that breaks it, and some n does for every c: 100n is not Ω(n²).`,
    },
    limitWhy: '100n/n² = 100/n, which shrinks to 0.',
    hint: '100n starts far above n². How late must n₀ be when c = 1?',
  },
  {
    id: 'quadratic-linear',
    f: 'n^2',
    g: 'n',
    label: 'n² against n',
    upper: {
      eventually: always(false),
      settles: from(1),
      why: () =>
        'n² ≤ c·n is the same as n ≤ c. Every n bigger than c breaks it, whatever c is: no c works, so n² is not O(n).',
    },
    lower: {
      eventually: always(true),
      settles: from(1),
      why: () => 'c·n ≤ n² is the same as n ≥ c, true for every n from c on.',
    },
    limitWhy: 'n²/n = n, which grows without bound.',
    hint: 'Pick any c you like. Where does n² pass c·n?',
  },
  {
    id: 'nlogn-linear',
    f: 'n log n',
    g: 'n',
    label: 'n log n against n',
    upper: {
      eventually: always(false),
      settles: from(1),
      why: () =>
        'n log n ≤ c·n is the same as log n ≤ c, and log n passes every c, at n = 2^(⌊c⌋ + 1) at the latest. No c works: n log n is not O(n).',
    },
    lower: {
      eventually: always(true),
      settles: from(1),
      why: () =>
        'c·n ≤ n log n is the same as log n ≥ c, and log n never shrinks, so once it holds it keeps holding.',
    },
    limitWhy: 'n log n / n = log n, which grows without bound, if slowly.',
    hint: 'log n grows so slowly that n log n looks like a straight line. Is it O(n)?',
  },
  {
    id: 'exponential-polynomial',
    f: '2^n',
    g: 'n^10',
    label: '2ⁿ against n¹⁰',
    upper: {
      eventually: always(false),
      settles: from(14),
      why: () =>
        'From n = 14 on, 2ⁿ doubles at each step while n¹⁰ grows by less than 2 (15¹⁰/14¹⁰ ≈ 1.99), so 2ⁿ/n¹⁰ only grows. Whatever c is, 2ⁿ passes c·n¹⁰ and stays ahead.',
    },
    lower: {
      eventually: always(true),
      settles: from(14),
      why: () =>
        'From n = 14 on, 2ⁿ doubles at each step while n¹⁰ grows by less than 2, so 2ⁿ/n¹⁰ only grows: once 2ⁿ ≥ c·n¹⁰, it stays that way.',
    },
    limitWhy:
      'Each step multiplies 2ⁿ/n¹⁰ by 2·(n/(n + 1))¹⁰, which is above 1 from n = 14 on and climbs towards 2.',
    hint: 'n¹⁰ stays far above 2ⁿ for a long time. Does that make 2ⁿ = O(n¹⁰)?',
  },
  {
    id: 'clrs-theta',
    f: 'n^2/2 - 3n',
    g: 'n^2',
    label: 'n²/2 − 3n against n²',
    upper: {
      eventually: (c) => !gt(R(1, 2), c),
      settles: from(6),
      why: (c) =>
        gt(R(1, 2), c)
          ? `f(n) ≤ c·n² is the same as (1/2 − c)·n ≤ 3, and with c < 1/2 that fails for every n past 3/(1/2 − c) = ${over(3, subR(R(1, 2), c))}.`
          : 'f(n) is negative until n = 6, and the definition asks for 0 ≤ f(n). From n = 6 on, n²/2 − 3n ≤ n²/2 ≤ c·n².',
    },
    lower: {
      eventually: (c) => gt(R(1, 2), c),
      settles: from(1),
      why: (c) =>
        gt(R(1, 2), c)
          ? `c·n² ≤ n²/2 − 3n is the same as (1/2 − c)·n ≥ 3, true for every n from 3/(1/2 − c) = ${over(3, subR(R(1, 2), c))} on.`
          : 'c·n² ≤ n²/2 − 3n would need (1/2 − c)·n ≥ 3, impossible with c ≥ 1/2: f(n) is always below n²/2.',
    },
    limitWhy: '(n²/2 − 3n)/n² = 1/2 − 3/n, which settles to 1/2.',
    hint: 'f(n) is negative until n = 6. Can you fit it between c₁·n² and c₂·n²?',
  },
  {
    id: 'nlogn-plus-n',
    f: 'n log n + n',
    g: 'n log n',
    label: 'n log n + n against n log n',
    upper: {
      eventually: (c) => gt(c, R(1)),
      settles: from(1),
      why: (c) =>
        gt(c, R(1))
          ? `f(n) ≤ c·n log n is the same as (c − 1)·log n ≥ 1, which holds once log n ≥ 1/(c − 1) = ${over(1, subR(c, R(1)))}, and log n never shrinks. At n = 1, log n = 0, so n₀ = 1 never works.`
          : 'f(n) ≤ c·n log n would need (c − 1)·log n ≥ 1, impossible with c ≤ 1: the + n always sticks out.',
    },
    lower: {
      eventually: (c) => !gt(c, R(1)),
      settles: from(1),
      why: (c) =>
        gt(c, R(1))
          ? `c·n log n ≤ n log n + n is the same as (c − 1)·log n ≤ 1, which fails for good once log n > 1/(c − 1) = ${over(1, subR(c, R(1)))}.`
          : 'c·n log n ≤ n log n ≤ n log n + n for every n, since c ≤ 1.',
    },
    limitWhy: '(n log n + n)/(n log n) = 1 + 1/log n, which settles to 1, slowly.',
    hint: 'g(1) = 1 · log 1 = 0, and no c fixes that. Where must n₀ start?',
  },
  {
    id: 'exponential-factorial',
    f: '2^n',
    g: 'n!',
    label: '2ⁿ against n!',
    upper: {
      eventually: always(true),
      settles: from(1),
      why: () =>
        '2ⁿ/n! never grows: going from n to n + 1 multiplies it by 2/(n + 1), which is at most 1. So once 2ⁿ ≤ c·n!, it stays that way.',
    },
    lower: {
      eventually: always(false),
      settles: from(1),
      why: () =>
        'c·n! ≤ 2ⁿ needs 2ⁿ/n! ≥ c, but 2ⁿ/n! shrinks towards 0, multiplied by 2/(n + 1) at each step. Whatever c is, it fails for good.',
    },
    limitWhy:
      '2ⁿ/n! = (2/1)(2/2)(2/3)···(2/n): every factor after the second is below 1 and they keep shrinking, so the product goes to 0.',
    hint: 'n! grows faster. Which works: c = 2 from n₀ = 1, or c = 1 from a later n₀?',
  },
];
