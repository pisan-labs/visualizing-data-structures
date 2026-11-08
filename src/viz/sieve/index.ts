import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import cppSource from './code/cpp/sieve.hpp?raw';
import javaSource from './code/java/Sieve.java?raw';
import pythonSource from './code/python/sieve.py?raw';
import firstPrimes from './examples/first-primes.json';
import justTwo from './examples/just-two.json';
import noStopAtRoot from './examples/no-stop-at-root.json';
import primesTo100 from './examples/primes-to-100.json';
import primesTo120 from './examples/primes-to-120.json';
import startAt2p from './examples/start-at-2p.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  MIN_N,
  ops,
  pseudocode,
  type SieveSettings,
  type SieveState,
} from './model';
import { sievePractice } from './practice';
import { view } from './view';

export const sieve: VizDef<SieveState, SieveSettings, undefined> = {
  id: 'sieve',
  title: 'Sieve of Eratosthenes',
  family: 'Number theory',
  blurb:
    'Every prime crosses out its multiples from p², and the loop stops at √n. What survives is prime.',
  settings: [
    {
      kind: 'choice',
      key: 'start',
      label: 'Cross out multiples of p from',
      options: [
        { value: 'square', label: 'p² (the smaller ones are crossed out already)' },
        { value: 'double', label: '2p (simpler, but crosses some numbers out twice more)' },
      ],
    },
    {
      kind: 'choice',
      key: 'stop',
      label: 'Stop',
      options: [
        { value: 'sqrt', label: 'Once p² > n' },
        { value: 'all', label: 'At p = n (tries primes that cross out nothing)' },
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
      label: 'n',
      placeholder: `e.g. 100 (${MIN_N} to ${MAX_N})`,
      maxLength: 10,
      sample: '50',
      parse: (t) => parseWhole(t, MIN_N, MAX_N),
    },
    buttons: [{ op: 'sieve', label: 'Sieve up to n', usesInput: true, primary: true }],
    random: { label: 'Random n', make: (rng) => [['sieve', rng.int(20, MAX_N)]] },
    presets: [
      { label: 'Up to 10 × size', make: (_rng, size) => [['sieve', 10 * size]] },
      {
        label: 'Up to a prime',
        make: (_rng, size) => [['sieve', [11, 23, 47, 61, 97, 113][size % 6]!]],
      },
      {
        label: 'Up to a perfect square',
        make: (_rng, size) => [['sieve', Math.min(size, 10) ** 2]],
      },
      {
        label: 'Just below a square',
        make: (_rng, size) => [['sieve', Math.min(size, 10) ** 2 - 1]],
      },
    ],
    sizes: [3, 6, 10],
  },
  explain,
  complexity: [
    {
      op: 'sieve up to n: cross-outs',
      best: {
        cost: 'O(1)',
        why: 'n = 2 or 3: no prime has its square under n, so nothing is crossed out.',
        example: 'just-two',
      },
      average: {
        cost: 'O(n log log n)',
        why: 'Prime p makes about n/p cross-outs, and the sum of 1/p over the primes up to n grows like log log n.',
        example: 'primes-to-100',
      },
      worst: {
        cost: 'O(n log log n)',
        why: 'Every n pays the same sum; starting at 2p instead of p² changes the constant, not the growth.',
        example: 'start-at-2p',
      },
      note: 'Plus O(n) to write the numbers and read the survivors. The linear sieve crosses each composite out exactly once: O(n).',
    },
    {
      op: 'sieve up to n: memory',
      best: { cost: 'O(n)', why: 'One mark per number from 2 to n.', example: 'first-primes' },
      average: { cost: 'O(n)', why: 'The same array, whatever n is.', example: 'primes-to-100' },
      worst: {
        cost: 'O(n)',
        why: 'n bits. A segmented sieve keeps only a window of about √n at a time.',
        example: 'primes-to-120',
      },
    },
  ],
  practice: sievePractice(() => sieve),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SieveSettings),
  },
  examples: [
    primesTo100,
    firstPrimes,
    startAt2p,
    noStopAtRoot,
    primesTo120,
    justTwo,
  ] as unknown as SavedExample[],
  preview: { example: 'first-primes', level: 3 },
};

/** Driver protocol: "sieve n" prints the primes up to n, separated by spaces. */
function codeScript(calls: OpCall[], settings: SieveSettings) {
  const t = new Timeline(sieve, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const end = e.steps[e.steps.length - 1]!.state;
    if (e.steps.length < 2 || !end.done) continue;
    input.push(`sieve ${end.n}`);
    expected.push(end.status.flatMap((v, k) => (v === 'prime' ? [k] : [])).join(' '));
  }
  return { input, expected };
}

export default sieve;
