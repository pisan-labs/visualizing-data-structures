import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/huffman.hpp?raw';
import javaSource from './code/java/Huffman.java?raw';
import pythonSource from './code/python/huffman.py?raw';
import abracadabra from './examples/abracadabra.json';
import decodeWalk from './examples/decode-walk.json';
import equalCounts from './examples/equal-counts.json';
import fibonacciCounts from './examples/fibonacci-counts.json';
import oneSymbol from './examples/one-symbol.json';
import sentence from './examples/sentence.json';
import tieRule from './examples/tie-rule.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_BITS,
  ops,
  pseudocode,
  readBits,
  readSource,
  totalBits,
  type HuffExtra,
  type HuffSettings,
  type HuffState,
} from './model';
import { huffmanPractice } from './practice';
import { view } from './view';

/** The input box: a text, symbol:count pairs, or bits for decode. */
export function parseHuffInput(token: string): Value | Error {
  const t = token.trim();
  if (/^[01]+$/.test(t)) {
    const bits = readBits(t);
    return bits instanceof Error && t.length > MAX_BITS ? bits : t;
  }
  const src = readSource(t);
  return src instanceof Error ? src : t;
}

const LETTERS = 'abcdefghijkl';

/** symbol:count pairs for the first n letters. */
export const pairs = (counts: number[]) => counts.map((n, i) => `${LETTERS[i]}:${n}`).join(' ');

export function fibonacci(n: number): number[] {
  const out = [1, 1];
  while (out.length < n) out.push(out[out.length - 1]! + out[out.length - 2]!);
  return out.slice(0, n);
}

const TEXTS = [
  'abracadabra',
  'mississippi',
  'bookkeeper',
  'committee',
  'senselessness',
  'she sells sea shells',
  'banana bandana',
  'peter piper picked a peck',
];

const buildOf = (input: string): OpCall[] => [['build', input]];

function randomCounts(rng: Rng, n: number, lo: number, hi: number): number[] {
  return Array.from({ length: n }, () => rng.int(lo, hi));
}

export const huffman: VizDef<HuffState, HuffSettings, HuffExtra> = {
  id: 'huffman',
  title: 'Huffman coding',
  family: 'Strings',
  blurb:
    'Build an optimal prefix code by merging the two lightest trees in a priority queue, then encode a text and decode bits by walking the tree.',
  settings: [
    {
      kind: 'choice',
      key: 'ties',
      label: 'When two trees weigh the same',
      options: [
        { value: 'leaves', label: 'Leaves first (in symbol order), then the oldest merged tree' },
        { value: 'merged', label: 'Merged trees first (oldest first), then leaves' },
      ],
      help: 'Symbol order is character order, so a space comes before letters. Both rules give codes of the same total length; the codes themselves differ.',
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
      label: 'Text or counts',
      placeholder: 'e.g. abracadabra, or a:5 b:2 r:2',
      maxLength: 80,
      sample: 'abracadabra',
      parse: parseHuffInput,
    },
    buttons: [
      { op: 'build', label: 'Build', usesInput: true, primary: true },
      { op: 'encode', label: 'Encode', usesInput: false },
      { op: 'decode', label: 'Decode bits', usesInput: true },
      { op: 'load', label: 'Load only', usesInput: true, more: true },
      { op: 'merge', label: 'Merge two', usesInput: false, more: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    presets: [
      {
        label: 'Random counts',
        make: (rng, n) => buildOf(pairs(randomCounts(rng, n, 1, 20))),
      },
      {
        label: 'Equal counts (a balanced tree)',
        make: (_rng, n) => buildOf(pairs(Array(n).fill(5))),
      },
      {
        label: 'Fibonacci counts (the deepest tree)',
        make: (_rng, n) => buildOf(pairs(fibonacci(n))),
      },
      {
        label: 'Counts of 1 and 2 (many ties)',
        make: (rng, n) => buildOf(pairs(randomCounts(rng, n, 1, 2))),
      },
      {
        label: 'A short text, encoded',
        make: (rng) => [...buildOf(TEXTS[rng.int(0, TEXTS.length - 1)]!), ['encode']],
      },
      {
        label: 'Loaded, not merged yet',
        make: (rng, n) => [['load', pairs(randomCounts(rng, n, 1, 12))]],
      },
    ],
    sizes: [4, 6, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'build (n symbols)',
      best: {
        cost: 'O(n log n)',
        why: 'Even equal counts take n − 1 rounds of two extractMins and an insert, O(log n) each in a binary heap.',
        example: 'equal-counts',
      },
      average: {
        cost: 'O(n log n)',
        why: 'n − 1 rounds, each O(log n), whatever the counts.',
        example: 'abracadabra',
      },
      worst: {
        cost: 'O(n log n)',
        why: 'Fibonacci counts make the deepest tree, but the queue does the same work.',
        example: 'fibonacci-counts',
      },
      note: 'Counting the symbols of a text of length m adds O(m). If the counts arrive sorted, two plain queues (leaves in one, merged trees in the other) build the tree in O(n), because each merged tree weighs at least as much as the one before.',
    },
    {
      op: 'encode (m symbols)',
      best: {
        cost: 'O(m)',
        why: 'Each symbol is one table lookup, and with one symbol every code is a single bit.',
        example: 'one-symbol',
      },
      average: {
        cost: 'O(m + B)',
        why: 'One lookup per symbol, plus writing the B bits of the output.',
        example: 'sentence',
      },
      worst: {
        cost: 'O(m · n)',
        why: 'A code can be n − 1 bits long, as with Fibonacci counts.',
        example: 'fibonacci-counts',
      },
    },
    {
      op: 'decode (B bits)',
      best: {
        cost: 'O(B)',
        why: 'One step down the tree per bit, back to the root at each leaf.',
        example: 'decode-walk',
      },
      average: { cost: 'O(B)', why: 'Every bit is one step, whatever the codes are.' },
      worst: {
        cost: 'O(B)',
        why: 'Still one step per bit; bits that stop inside a code are caught at the end.',
        example: 'decode-walk',
      },
    },
  ],
  practice: huffmanPractice(() => huffman),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as HuffSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    abracadabra,
    tieRule,
    equalCounts,
    fibonacciCounts,
    oneSymbol,
    sentence,
    decodeWalk,
  ] as unknown as SavedExample[],
  opening: 'abracadabra',
  preview: { example: 'abracadabra', level: 2 },
};

/** A symbol in the driver protocol: a space is written as _. */
const wire = (s: string) => s.replace(/ /g, '_');

/**
 * Driver protocol for the code tabs. The code breaks ties the default way (leaves first, then
 * the oldest merged tree), so the model runs with that rule too: codes depend on the tie rule,
 * while the total length does not.
 *   build s:count ...  ->  "<total bits> <symbol>:<code> ..." (a space is written as _)
 *   encode <text>      ->  the bits
 *   decode <bits>      ->  the text, or "invalid" when the bits are not a message
 * A line is written whenever the model finishes a tree, encodes its text, or decodes bits.
 */
function codeScript(calls: OpCall[], settings: HuffSettings) {
  const same: HuffSettings = { ...settings, ties: 'leaves' };
  const t = new Timeline(huffman, same, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const end = e.end;
    const last = e.steps.at(-1)!;
    if (
      end.codes &&
      end !== before &&
      (e.call[0] === 'build' || e.call[0] === 'load' || e.call[0] === 'merge')
    ) {
      input.push(`build ${end.freq.map(([s, n]) => `${wire(s)}:${n}`).join(' ')}`);
      expected.push(
        `${totalBits(end)} ${end.freq.map(([s]) => `${wire(s)}:${end.codes![s]}`).join(' ')}`,
      );
    } else if (e.call[0] === 'encode' && end.codes && end.text !== null) {
      input.push(`encode ${wire(end.text)}`);
      expected.push([...end.text].map((s) => end.codes![s]).join(''));
    } else if (e.call[0] === 'decode' && end.codes) {
      const bits = readBits(e.call[1]);
      if (!(bits instanceof Error)) {
        input.push(`decode ${bits}`);
        const ok = last.lines.includes('d.done');
        expected.push(ok ? wire(String(last.vars?.out ?? '')) : 'invalid');
      }
    }
    before = end;
  }
  return { input, expected };
}

export default huffman;
