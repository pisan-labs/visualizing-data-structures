import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/string_hash.hpp?raw';
import javaSource from './code/java/StringHash.java?raw';
import pythonSource from './code/python/string_hash.py?raw';
import collision from './examples/collision.json';
import differentHashes from './examples/different-hashes.json';
import doubleHashing from './examples/double-hashing.json';
import equalSubstrings from './examples/equal-substrings.json';
import prefixHashes from './examples/prefix-hashes.json';
import rollingWindows from './examples/rolling-windows.json';
import smallModulus from './examples/small-modulus.json';
import substringHash from './examples/substring-hash.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_LEN,
  moduli,
  ops,
  parseInput,
  pseudocode,
  type HashExtra,
  type HashSettings,
  type HashState,
} from './model';
import { hashPractice } from './practice';
import { view } from './view';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** "(53, 12)" or "53" back into numbers. */
const nums = (v: unknown) => String(v).replace(/[()]/g, '').split(', ').map(Number);

/**
 * Driver protocol for the code tabs: "init b p" picks the base and modulus, "load s" hashes the
 * prefixes of s, "prefix" prints H[0..n], "hash l r" a substring's hash, "compare i j len"
 * prints equal, different or collision, and "windows k" every window's rolling hash. With double
 * hashing the script runs once per modulus, each run checked against that modulus's values.
 */
function codeScript(calls: OpCall[], settings: HashSettings) {
  const t = new Timeline(stringHashing, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  moduli(settings).forEach((m, k) => {
    input.push(`init ${settings.b} ${m}`, `load ${t.initial.state.s}`);
    let s = t.initial.state.s;
    for (const e of t.entries) {
      const last = e.steps[e.steps.length - 1]!;
      const v = last.vars ?? {};
      const [op, ...args] = e.call;
      if (op === 'load') {
        if (!last.say.startsWith('Nothing loaded')) input.push(`load ${e.end.s}`);
        s = e.end.s;
        continue;
      }
      if (v.result === undefined && v.hash === undefined) continue;
      if (op === 'build') {
        input.push('prefix');
        expected.push(e.end.H[k]!.join(' '));
      } else if (op === 'hash') {
        input.push(`hash ${args.join(' ')}`);
        expected.push(String(nums(v.hash)[k]));
      } else if (op === 'compare') {
        const [i, j, len] = args.map(Number) as [number, number, number];
        const same = nums(v['hash 1'])[k] === nums(v['hash 2'])[k];
        input.push(`compare ${i} ${j} ${len}`);
        expected.push(
          !same ? 'different' : s.slice(i, i + len) === s.slice(j, j + len) ? 'equal' : 'collision',
        );
      } else if (op === 'windows') {
        input.push(`windows ${args[0]}`);
        expected.push(e.end.win!.h[k]!.join(' '));
      }
    }
  });
  return { input, expected };
}

export const stringHashing: VizDef<HashState, HashSettings, HashExtra> = {
  id: 'string-hashing',
  title: 'String hashing (polynomial rolling hash)',
  family: 'Strings',
  blurb:
    'Read a string as a number in base b, mod p. Prefix hashes give any substring’s hash in O(1), a window rolls in O(1), and a small p shows collisions you can see.',
  settings: [
    {
      kind: 'number',
      key: 'b',
      label: 'Base b',
      min: 2,
      max: 999,
      help: 'Pick b of at least 26, the number of letter values, so no two strings collide before the mod.',
    },
    {
      kind: 'number',
      key: 'p',
      label: 'Modulus p',
      min: 2,
      max: 9999,
      help: 'Hashes are remainders mod p. A small p such as 13 or 101 makes collisions easy to see; real code uses a prime near 10⁹.',
    },
    {
      kind: 'choice',
      key: 'hashes',
      label: 'Hashes',
      options: [
        { value: 'single', label: 'One hash, mod p' },
        { value: 'double', label: 'Double hashing: also mod p₂' },
      ],
      help: 'With two moduli, a collision needs both hashes to agree.',
    },
    { kind: 'number', key: 'p2', label: 'Second modulus p₂', min: 2, max: 9999 },
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
      label: 'A word, or numbers',
      placeholder: 'e.g. abracadabra, or 0 7 4',
      maxLength: 40,
      sample: '2',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true },
      { op: 'build', label: 'Build prefix hashes', usesInput: false, primary: true },
      { op: 'hash', label: 'Hash substring', usesInput: true, args: ['a start', 'an end'] },
      {
        op: 'compare',
        label: 'Compare',
        usesInput: true,
        args: ['a first start', 'a second start', 'a length'],
      },
      { op: 'windows', label: 'Hash every window', usesInput: true, more: true },
    ],
    random: {
      label: 'Random word',
      make: (rng) => {
        const n = rng.int(8, 12);
        const s = Array.from({ length: n }, () => LETTERS[rng.int(0, 3)]).join('');
        return [['load', s], ['build']];
      },
    },
    presets: [
      {
        label: 'Random letters a to d',
        make: (rng, n) => {
          const s = Array.from({ length: Math.min(n, MAX_LEN) }, () => LETTERS[rng.int(0, 3)]).join(
            '',
          );
          return [['load', s], ['build']];
        },
      },
      {
        label: 'Random letters, every window of 3',
        make: (rng, n) => {
          const s = Array.from(
            { length: Math.min(n, MAX_LEN) },
            () => LETTERS[rng.int(0, 25)],
          ).join('');
          return [
            ['load', s],
            ['windows', 3],
          ];
        },
      },
      {
        label: 'A repeated word (real repeats)',
        make: (_rng, n) => [
          ['load', 'abc'.repeat(6).slice(0, Math.min(n, MAX_LEN))],
          ['windows', 3],
        ],
      },
      {
        label: 'Compare the two halves',
        make: (rng, n) => {
          const half = Math.max(1, Math.floor(Math.min(n, MAX_LEN) / 2));
          const a = Array.from({ length: half }, () => LETTERS[rng.int(0, 2)]).join('');
          const b = rng.int(0, 1)
            ? a
            : Array.from({ length: half }, () => LETTERS[rng.int(0, 2)]).join('');
          return [['load', a + b], ['build'], ['compare', 0, half, half]];
        },
      },
    ],
    sizes: [8, 12, 16],
  },
  explain,
  complexity: [
    {
      op: 'build(s): every prefix hash',
      best: { cost: 'O(n)', why: 'One multiply, add and mod per character.' },
      average: {
        cost: 'O(n)',
        why: 'The same n steps for every string.',
        example: 'prefix-hashes',
      },
      worst: { cost: 'O(n)', why: 'n steps, plus n more for the powers of b.' },
      note: 'Space: O(n) for H and P (twice that with double hashing).',
    },
    {
      op: 'hash(l, r): a substring’s hash',
      best: {
        cost: 'O(1)',
        why: 'Two lookups in H, one in P, a multiply and a subtract.',
        example: 'substring-hash',
      },
      average: { cost: 'O(1)', why: 'The same, however long the substring.' },
      worst: { cost: 'O(1)', why: 'Hashing the substring from scratch would be O(len).' },
    },
    {
      op: 'compare(i, j, len)',
      best: {
        cost: 'O(1)',
        why: 'Different hashes: certainly different, no characters read.',
        example: 'different-hashes',
      },
      average: {
        cost: 'O(1)',
        why: 'Equal hashes: almost certainly equal, if p is big. Trusting the hash is O(1).',
        example: 'equal-substrings',
      },
      worst: {
        cost: 'O(len)',
        why: 'To be sure after equal hashes, compare the characters: a collision shows up only then.',
        example: 'collision',
      },
      note: 'With n substrings of the same length, expect about n²/(2p) colliding pairs. Double hashing makes it about n²/(2·p·p₂).',
    },
    {
      op: 'windows(k): every window’s hash',
      best: { cost: 'O(n)', why: 'The first window takes k steps, each roll after it O(1).' },
      average: { cost: 'O(n)', why: 'n − k rolls of O(1) each.', example: 'rolling-windows' },
      worst: {
        cost: 'O(n)',
        why: 'Hashing each window from scratch would be O(nk).',
        example: 'small-modulus',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as HashSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    prefixHashes,
    substringHash,
    equalSubstrings,
    differentHashes,
    collision,
    doubleHashing,
    rollingWindows,
    smallModulus,
  ] as unknown as SavedExample[],
  practice: hashPractice(() => stringHashing),
  preview: { example: 'rolling-windows', level: 2 },
};

export default stringHashing;
