import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { distinctKeys, parseNumberInput, readNumber } from '../_hashing/hashing';
import cppSource from './code/cpp/bloom_filter.hpp?raw';
import javaSource from './code/java/BloomFilter.java?raw';
import pythonSource from './code/python/bloom_filter.py?raw';
import biggerFilter from './examples/bigger-filter.json';
import falsePositive from './examples/false-positive.json';
import fillingUp from './examples/filling-up.json';
import noFalseNegatives from './examples/no-false-negatives.json';
import tooManyHashes from './examples/too-many-hashes.json';
import whyNoDelete from './examples/why-no-delete.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  positions,
  pseudocode,
  type BloomExtra,
  type BloomSettings,
  type BloomState,
} from './model';
import { bloomPractice } from './practice';
import { view } from './view';

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

export const bloomFilter: VizDef<BloomState, BloomSettings, BloomExtra> = {
  id: 'bloom-filter',
  title: 'Bloom filter',
  family: 'Hashing and maps',
  blurb:
    'A set in a few bits: k hash functions set k bits per key. A query that finds a 0 is a sure no; all 1s is only a probably, and the page shows the false positives and measures their rate.',
  settings: [
    { kind: 'number', key: 'm', label: 'Bits m', min: 8, max: 32 },
    {
      kind: 'number',
      key: 'k',
      label: 'Hash functions k',
      min: 1,
      max: 6,
      help: 'hᵢ(x) = ((aᵢ·x + bᵢ) mod 1009) mod m, with fixed (aᵢ, bᵢ) = (71, 5), (113, 17), (157, 29), (211, 43), (263, 61), (307, 83).',
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
      label: 'Key',
      placeholder: 'e.g. 42 or 12 25 31',
      maxLength: 160,
      sample: '42',
      parse: parseNumberInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'query', label: 'Query', usesInput: true, bulk: true },
      { op: 'measure', label: 'Measure', usesInput: false },
      { op: 'delete', label: 'Try delete', usesInput: true, more: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(0, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      {
        label: 'Sequential keys',
        make: (rng, n) => {
          const start = rng.int(1, 60);
          return inserts(Array.from({ length: n }, (_, i) => start + i));
        },
      },
      {
        label: 'Random keys, then measure',
        make: (rng, n) => [...inserts(distinctKeys(rng, n)), ['measure']],
      },
    ],
    sizes: [4, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'insert(x)',
      best: {
        cost: 'O(k)',
        why: 'k hash values and k bit writes, whatever n is.',
        example: 'false-positive',
      },
      average: { cost: 'O(k)', why: 'Every insert does the same k steps.' },
      worst: {
        cost: 'O(k)',
        why: 'No probing and no resizing: the filter never grows.',
        example: 'filling-up',
      },
    },
    {
      op: 'query(x)',
      best: {
        cost: 'O(1)',
        why: 'The first bit checked is 0: a definite no.',
        example: 'no-false-negatives',
      },
      average: { cost: 'O(k)', why: 'At most k bits to check, and n does not matter.' },
      worst: {
        cost: 'O(k)',
        why: 'All k bits are 1: a key in the set, or a false positive.',
        example: 'false-positive',
      },
      note: 'Space: m bits, about 1.44·log₂(1/p) bits per key for false-positive rate p, however large the keys are.',
    },
    {
      op: 'measure()',
      best: {
        cost: 'O(|U|·k)',
        why: 'It queries every key in the universe 0 to 999.',
        example: 'bigger-filter',
      },
      average: { cost: 'O(|U|·k)', why: 'One query per key never inserted.' },
      worst: {
        cost: 'O(|U|·k)',
        why: 'Each query checks at most k bits.',
        example: 'too-many-hashes',
      },
    },
  ],
  practice: bloomPractice(() => bloomFilter),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BloomSettings),
  },
  examples: [
    falsePositive,
    noFalseNegatives,
    fillingUp,
    biggerFilter,
    tooManyHashes,
    whyNoDelete,
  ] as unknown as SavedExample[],
  preview: { example: 'filling-up', level: 2, hide: ['set-', 'key-', 'kt-'] },
};

/**
 * Driver protocol for the code tabs: "new m k", then one operation per line. Results: insert ->
 * its k positions; query -> maybe | no; delete -> unsupported; measure -> "fp absent"; clear -> ok.
 * Calls with keys the page rejects are left out.
 */
function codeScript(calls: OpCall[], settings: BloomSettings) {
  const ok = calls.filter(
    ([op, x]) =>
      x === undefined || !(readNumber(x) instanceof Error) || op === 'measure' || op === 'clear',
  );
  const t = new Timeline(bloomFilter, settings, 1, ok);
  const input = [`new ${settings.m} ${settings.k}`, ...ok.map((c) => c.join(' '))];
  const expected = t.entries.map((e, i) => {
    const [op, x] = ok[i]!;
    const last = e.steps.at(-1)!;
    if (op === 'insert') return positions(Number(x), settings.m, settings.k).join(' ');
    if (op === 'query') return String(last.vars!.answer);
    if (op === 'delete') return 'unsupported';
    if (op === 'measure') return `${e.end.measured!.fp} ${e.end.measured!.absent}`;
    return 'ok';
  });
  return { input, expected };
}

export default bloomFilter;
