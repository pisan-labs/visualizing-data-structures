import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseWhole } from '../_recursion/kit';
import cppSource from './code/cpp/rsa.hpp?raw';
import javaSource from './code/java/Rsa.java?raw';
import pythonSource from './code/python/rsa.py?raw';
import carmichael from './examples/carmichael-lambda.json';
import eNotCoprime from './examples/e-not-coprime.json';
import makingKeys from './examples/making-keys.json';
import tooBig from './examples/message-too-big.json';
import exponent17 from './examples/public-exponent-17.json';
import roundTrip from './examples/round-trip.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type RsaSettings,
  type RsaState,
} from './model';
import { rsaPractice } from './practice';
import { view } from './view';

const PRIMES = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

export const rsa: VizDef<RsaState, RsaSettings, undefined> = {
  id: 'rsa',
  title: 'RSA',
  family: 'Number theory',
  blurb:
    'Toy-sized keys from two primes, d from extended Euclid, and messages encrypted and decrypted with fast modular powers.',
  settings: [
    {
      kind: 'choice',
      key: 'phi',
      label: 'Find d modulo',
      options: [
        { value: 'euler', label: 'φ(n) = (p − 1)(q − 1), as in CLRS' },
        { value: 'carmichael', label: 'λ(n) = lcm(p − 1, q − 1), as real RSA does' },
      ],
      help: 'Both work: e·d ≡ 1 mod λ(n) is enough for m^(ed) ≡ m. λ(n) divides φ(n), so it gives a smaller d.',
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
      label: 'numbers',
      placeholder: 'p q, e.g. 61 53; or a message below n',
      maxLength: 20,
      sample: '61 53',
      parse: (t) => parseWhole(t, 0, 99999, 'Each number'),
    },
    buttons: [
      { op: 'keys', label: 'Make keys', usesInput: true, primary: true, args: ['p', 'q'] },
      { op: 'encrypt', label: 'Encrypt m', usesInput: true },
      { op: 'decrypt', label: 'Decrypt c', usesInput: true },
      { op: 'useE', label: 'Use this e', usesInput: true, more: true },
    ],
    random: {
      label: 'Random keys and message',
      make: (rng) => {
        const p = PRIMES[rng.int(0, PRIMES.length - 1)]!;
        let q = p;
        while (q === p) q = PRIMES[rng.int(0, PRIMES.length - 1)]!;
        return [
          ['keys', p, q],
          ['encrypt', rng.int(2, 99)],
        ];
      },
    },
    presets: [
      {
        label: 'The usual example: 61 and 53',
        make: () => [
          ['keys', 61, 53],
          ['encrypt', 65],
        ],
      },
      {
        label: 'Tiny primes',
        make: (_rng, size) => [
          ['keys', [5, 7, 11][size % 3]!, [11, 13, 17][size % 3]!],
          ['encrypt', 2],
        ],
      },
      {
        label: 'Biggest allowed primes',
        make: () => [
          ['keys', 97, 89],
          ['encrypt', 1234],
        ],
      },
      {
        label: 'Keys with e = 17',
        make: () => [
          ['keys', 61, 53],
          ['useE', 17],
        ],
      },
    ],
    sizes: [],
  },
  explain,
  complexity: [
    {
      op: 'make keys (β-bit primes)',
      best: {
        cost: 'O(β³)',
        why: 'n and φ are two multiplications; d is one extended Euclid, O(β) divisions of β-bit numbers.',
        example: 'making-keys',
      },
      average: {
        cost: 'O(β⁴)',
        why: 'Real keys must first find two random β-bit primes: about β tries each, and every primality test is a modular power.',
        example: 'round-trip',
      },
      worst: {
        cost: 'O(β⁴)',
        why: 'The prime search dominates; trying small e values costs only a few gcds.',
        example: 'carmichael-lambda',
      },
    },
    {
      op: 'encrypt or decrypt',
      best: {
        cost: 'O(β²)',
        why: 'With a small public exponent like 17 or 65537, encryption is a handful of multiplications of β-bit numbers.',
        example: 'public-exponent-17',
      },
      average: {
        cost: 'O(β³)',
        why: 'Decryption raises to d, which has about β bits: square-and-multiply makes up to 2β multiplications.',
        example: 'round-trip',
      },
      worst: {
        cost: 'O(β³)',
        why: 'Every bit of d set: 2β multiplications, each O(β²) done by hand.',
        example: 'round-trip',
      },
      note: 'Breaking it means factoring n. The best known method, the number field sieve, takes time exponential in about the cube root of β.',
    },
  ],
  practice: rsaPractice(() => rsa),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RsaSettings),
  },
  examples: [
    roundTrip,
    makingKeys,
    exponent17,
    carmichael,
    tooBig,
    eNotCoprime,
  ] as unknown as SavedExample[],
  preview: { example: 'round-trip', level: 1 },
};

/**
 * Driver protocol: "keys p q" and "use-e e" print "n e d"; "encrypt m" and "decrypt c" print the
 * result. The code uses φ(n), so the model runs with it. Refused operations are left out.
 */
function codeScript(calls: OpCall[], settings: RsaSettings) {
  const t = new Timeline(rsa, { ...settings, phi: 'euler' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    if (e.steps.length < 2) continue;
    const end = e.end;
    const k = end.keys!;
    const [op, x, y] = e.call;
    if (op === 'keys') {
      input.push(`keys ${x} ${y}`);
      expected.push(`${k.n} ${k.e} ${k.d}`);
    } else if (op === 'useE') {
      input.push(`use-e ${k.e}`);
      expected.push(`${k.n} ${k.e} ${k.d}`);
    } else if (op === 'encrypt') {
      input.push(`encrypt ${end.m}`);
      expected.push(String(end.c));
    } else if (op === 'decrypt') {
      input.push(`decrypt ${end.c}`);
      expected.push(String(end.back));
    }
  }
  return { input, expected };
}

export default rsa;
