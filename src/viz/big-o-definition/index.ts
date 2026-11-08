import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/witness.hpp?raw';
import javaSource from './code/java/Witness.java?raw';
import pythonSource from './code/python/witness.py?raw';
import biggerC from './examples/bigger-c.json';
import finiteCheck from './examples/finite-check.json';
import lateN0 from './examples/late-n0.json';
import limitTest from './examples/limit-test.json';
import logStartsAtZero from './examples/log-starts-at-zero.json';
import noCWorks from './examples/no-c-works.json';
import omegaFlips from './examples/omega-flips.json';
import thetaSandwich from './examples/theta-sandwich.json';
import explain from './explain.md?raw';
import { evalAt, exprOf, mulR, rat, type Expr, type Rat, type Term } from './expr';
import {
  boundsOf,
  defaults,
  describe,
  firstFailure,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  rangeOf,
  smallestN0,
  type DefExtra,
  type DefSettings,
  type DefState,
} from './model';
import { PAIRS } from './pairs';
import { definitionPractice } from './practice';
import { view } from './view';

/** What the input box takes: "f ; g" for Compare, numbers for the others. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type c and n₀ (such as 4 11), or two functions: f ; g.');
  if (!/^[0-9nNlLoOgG.+\-*/^!() ;,⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ·×⋅−–₂]*$/.test(t))
    return new Error('Use numbers, n, log n, 2^n, n!, + − * / ^ and a ; between two functions.');
  return t;
}

export const bigODefinition: VizDef<DefState, DefSettings, DefExtra> = {
  id: 'big-o-definition',
  title: 'Big-O, Ω and Θ by definition',
  family: 'Foundations',
  blurb:
    'Move c and n₀ and watch f(n) ≤ c·g(n) hold or break; find witnesses, flip to Ω, sandwich for Θ, and take the limit of f/g.',
  settings: [
    {
      kind: 'choice',
      key: 'relation',
      label: 'Relation',
      options: [
        { value: 'O', label: 'O: 0 ≤ f(n) ≤ c·g(n) for every n ≥ n₀' },
        { value: 'Omega', label: 'Ω: 0 ≤ c·g(n) ≤ f(n) for every n ≥ n₀' },
        { value: 'Theta', label: 'Θ: 0 ≤ c₁·g(n) ≤ f(n) ≤ c₂·g(n) for every n ≥ n₀' },
      ],
      help: 'CLRS writes the 0 ≤ into each definition, so a function that dips below 0 needs a later n₀. Θ takes two constants.',
    },
    {
      kind: 'choice',
      key: 'range',
      label: 'n checked',
      options: [
        { value: '20', label: 'n = 1 to 20' },
        { value: '50', label: 'n = 1 to 50' },
        { value: '100', label: 'n = 1 to 100' },
        { value: '200', label: 'n = 1 to 200' },
      ],
      help: 'The page checks every n in this range exactly. Past it, only algebra can tell, and the page says what the algebra says.',
    },
    {
      kind: 'choice',
      key: 'scale',
      label: 'Height',
      options: [
        { value: 'auto', label: 'Automatic: log when the values span a lot' },
        { value: 'linear', label: 'Linear' },
        { value: 'log', label: 'Logarithmic: each step up is ×10' },
      ],
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'c n₀, or f ; g',
      placeholder: 'e.g. 4 11, or 3n^2 + 10n + 5 ; n^2',
      maxLength: 80,
      sample: '4 11',
      parse: parseInput,
    },
    buttons: [
      { op: 'check', label: 'Try c, n₀', usesInput: true, primary: true },
      { op: 'find', label: 'Find n₀ for c', usesInput: true },
      { op: 'limit', label: 'Limit of f/g', usesInput: false },
      { op: 'compare', label: 'Compare f ; g', usesInput: true },
    ],
    presets: [
      ...PAIRS.map((p) => ({
        label: p.label,
        make: (): OpCall[] => [['compare', `${p.f} ; ${p.g}`]],
      })),
      {
        label: 'A random quadratic against n²',
        make: (rng): OpCall[] => [
          ['compare', `${rng.int(1, 9)}n^2 + ${rng.int(1, 50)}n + ${rng.int(1, 99)} ; n^2`],
        ],
      },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'check(c, n₀) over n = n₀ to N',
      best: {
        cost: 'O(1)',
        why: 'The first n tried breaks it: one counterexample ends the check.',
        example: 'bigger-c',
      },
      average: {
        cost: 'O(N − n₀)',
        why: 'Up to the first n that breaks it, one comparison per n.',
      },
      worst: {
        cost: 'Θ(N − n₀)',
        why: 'A witness that holds is tried at every n in the range, and still proves nothing past N.',
        example: 'finite-check',
      },
    },
    {
      op: 'smallest_n0(c) over n = 1 to N',
      best: {
        cost: 'O(1)',
        why: 'n = N already breaks it: no n₀ in the range works.',
        example: 'no-c-works',
      },
      average: {
        cost: 'Θ(N − n₀)',
        why: 'Walk down from N until the last n that breaks it.',
        example: 'late-n0',
      },
      worst: {
        cost: 'Θ(N)',
        why: 'Nothing breaks it, so the walk goes all the way down to n₀ = 1.',
        example: 'bigger-c',
      },
    },
    {
      op: 'insertion sort (comparisons)',
      best: {
        cost: 'Θ(n)',
        why: 'Sorted input: one comparison per item. "Insertion sort is O(n²)" is still true here, just loose.',
      },
      average: { cost: 'Θ(n²)', why: 'Each item moves past about half of the ones before it.' },
      worst: { cost: 'Θ(n²)', why: 'Reverse order: every item moves past all the ones before it.' },
      note: 'Best, average and worst case are three functions of n, and O, Ω and Θ can describe each. "Worst case" and "O" are different ideas.',
    },
    {
      op: 'linear search',
      best: { cost: 'Θ(1)', why: 'The first item matches.' },
      average: { cost: 'Θ(n)', why: 'About half the items, and n/2 is Θ(n).' },
      worst: { cost: 'Θ(n)', why: 'Every item, when the value is missing.' },
      note: 'Linear search is O(n) in every case, but Ω(n) only in the average and worst cases.',
    },
  ],
  practice: definitionPractice(() => bigODefinition),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      codeScript(calls, { ...defaults, ...settings } as DefSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    biggerC,
    lateN0,
    noCWorks,
    finiteCheck,
    thetaSandwich,
    omegaFlips,
    logStartsAtZero,
    limitTest,
  ] as unknown as SavedExample[],
  preview: { example: 'bigger-c', level: 2, hide: ['r-', 'v-key'] },
  opening: 'bigger-c',
};

// ----- Code tabs -----

/** Values the Java and C++ drivers hold in a long: a margin under 2⁶³. */
const LONG_LIMIT = 2n ** 62n;

const babs = (x: bigint) => (x < 0n ? -x : x);
const lcm = (a: bigint, b: bigint) => {
  let [x, y] = [a, b];
  while (y) [x, y] = [y, x % y];
  return (a / x) * b;
};

/** The function times the smallest whole number that clears its fractions. */
function scaled(e: Expr): { terms: Term[]; scale: bigint } {
  const scale = e.terms.reduce((d, t) => lcm(d, t.k.d), 1n);
  return {
    terms: e.terms.map((t) => ({ ...t, k: rat((t.k.n * scale) / t.k.d) })),
    scale,
  };
}

const termCode = (t: Term) => `${t.k.n}:${t.a}:${t.b}:${t.e}:${t.x}`;

/** The largest n ≤ N at which the driver's longs hold every value, or 0. */
function fitsUpTo(f: Term[], g: Term[], c: Rat, N: number): number {
  const fe: Expr = { terms: f, text: '', ascii: '' };
  const ge: Expr = { terms: g, text: '', ascii: '' };
  for (let n = 1; n <= N; n++) {
    const big = BigInt(n);
    for (const [e, k] of [
      [fe, c.d],
      [ge, c.n],
    ] as const) {
      let sum = 0n;
      for (const t of e.terms) {
        const v = babs(evalAt({ terms: [t], text: '', ascii: '' }, big).n);
        sum += v;
        if (v >= LONG_LIMIT || sum >= LONG_LIMIT) return n - 1;
      }
      if (babs(evalAt(e, big).n) * k >= LONG_LIMIT) return n - 1;
    }
  }
  return N;
}

/**
 * Driver protocol for the code tabs, which check the O side, 0 ≤ f(n) ≤ c·g(n):
 * "check p q n0 nmax ; F ; G" prints the first n from n0 to nmax that breaks it, or none;
 * "find p q nmax ; F ; G" prints the smallest n0 with nothing breaking it up to nmax, or none.
 * F and G are f and g times whole numbers that clear their fractions, as terms "k:a:b:e:x"
 * (k · n^a · (log n)^b · (2^n)^e · (n!)^x), and p/q is c adjusted to match. Every operation
 * that sets c (O's c, Θ's c₂) gives a line; nmax stops where the values would overflow a long.
 */
function codeScript(calls: OpCall[], settings: DefSettings) {
  const t = new Timeline(bigODefinition, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const N = rangeOf(settings);
  for (const e of t.entries) {
    const [op] = e.call;
    if (op !== 'check' && op !== 'find') continue;
    if (e.steps.length === 1) continue; // rejected: nothing changed
    const s = e.end;
    if (s.hi === null) continue;
    const f = exprOf(s.f);
    const g = exprOf(s.g);
    const upper = boundsOf({ ...s, lo: null }, 'O')!;
    const F = scaled(f);
    const G = scaled(g);
    // f ≤ c·g  ⇔  F/Sf ≤ c·G/Sg  ⇔  F ≤ (c·Sf/Sg)·G
    const c = mulR(upper[0]!.c, rat(F.scale, G.scale));
    const nmax = fitsUpTo(F.terms, G.terms, c, N);
    const fns = `; ${F.terms.map(termCode).join(' ')} ; ${G.terms.map(termCode).join(' ')}`;
    if (op === 'check') {
      if (s.n0 === null || s.n0 > nmax) continue;
      const n = firstFailure(f, g, upper, s.n0, nmax);
      input.push(`check ${c.n} ${c.d} ${s.n0} ${nmax} ${fns}`);
      expected.push(n === null ? 'none' : String(n));
    } else {
      if (nmax < 1) continue;
      const n0 = smallestN0(f, g, upper, nmax);
      input.push(`find ${c.n} ${c.d} ${nmax} ${fns}`);
      expected.push(n0 === null ? 'none' : String(n0));
    }
  }
  return { input, expected };
}

export default bigODefinition;
