import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/chained_hash_table.hpp?raw';
import javaSource from './code/java/ChainedHashTable.java?raw';
import pythonSource from './code/python/chained_hash_table.py?raw';
import anagrams from './examples/anagrams.json';
import collisions from './examples/collisions.json';
import deleteChain from './examples/delete-chain.json';
import highLoad from './examples/high-load.json';
import keyValue from './examples/key-value.json';
import oneBucket from './examples/one-bucket.json';
import patternKeys from './examples/pattern-keys.json';
import tailInsert from './examples/tail-insert.json';
import explain from './explain.md?raw';
import { distinctKeys, parseKeyInput, readKey } from '../_hashing/hashing';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type ChainExtra,
  type ChainSettings,
  type ChainState,
} from './model';
import { chainingPractice } from './practice';
import { view } from './view';

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

export const hashChaining: VizDef<ChainState, ChainSettings, ChainExtra> = {
  id: 'hash-chaining',
  title: 'Separate chaining',
  family: 'Hashing and maps',
  blurb:
    'A hash table whose buckets hold linked lists. Keys that collide share a chain, so insert, search and delete cost one hash plus a walk down one chain.',
  settings: [
    { kind: 'number', key: 'm', label: 'Table size m (number of buckets)', min: 1, max: 16 },
    {
      kind: 'choice',
      key: 'hash',
      label: 'Hash function',
      options: [
        { value: 'division', label: 'Division: k mod m (CLRS)' },
        { value: 'multiplication', label: 'Multiplication: ⌊m · frac(k·A)⌋, A ≈ 0.618' },
        { value: 'sum', label: 'Strings: sum of the character codes, mod m' },
        { value: 'poly', label: 'Strings: polynomial in the character codes (base 31), mod m' },
      ],
      help: 'The number methods take whole numbers. The string hashes take words, such as cat; a number is read as its digits.',
    },
    {
      kind: 'choice',
      key: 'mode',
      label: 'What the table stores',
      options: [
        { value: 'keys', label: 'Keys only (a set)' },
        { value: 'pairs', label: 'Key-value pairs (a map): insert cat=3' },
      ],
      help: 'In a map, inserting a key that is already there replaces its value.',
    },
    {
      kind: 'choice',
      key: 'where',
      label: 'Where a new key goes in its chain',
      options: [
        { value: 'head', label: 'At the front (CLRS)' },
        { value: 'tail', label: 'At the end (Java’s HashMap)' },
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
      label: 'Key',
      placeholder: 'e.g. 42, 15 22 29, or cat=3',
      maxLength: 160,
      sample: '42',
      parse: parseKeyInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'delete', label: 'Delete', usesInput: true, bulk: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      { label: 'All colliding keys', make: (_rng, n) => [['fill', 'collide', n]] },
      {
        label: 'Sequential keys',
        make: (rng, n) => {
          const start = rng.int(1, 60);
          return inserts(Array.from({ length: n }, (_, i) => start + i));
        },
      },
    ],
    sizes: [5, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'search(k)',
      best: {
        cost: 'O(1)',
        why: 'k is the first node of its bucket, or the bucket is empty.',
        example: 'collisions',
      },
      average: {
        cost: 'O(1 + α)',
        why: 'With keys spread evenly, a chain holds α = n/m keys on average.',
        example: 'high-load',
      },
      worst: {
        cost: 'O(n)',
        why: 'Every key hashed to the same bucket, so the chain holds all n keys.',
        example: 'one-bucket',
      },
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(1)',
        why: 'The bucket is empty: one hash, one new node.',
        example: 'collisions',
      },
      average: {
        cost: 'O(1 + α)',
        why: 'It walks the chain first to rule out a duplicate. Without that check (CLRS) it is O(1).',
        example: 'high-load',
      },
      worst: {
        cost: 'O(n)',
        why: 'The duplicate check walks a chain that holds every key.',
        example: 'one-bucket',
      },
    },
    {
      op: 'delete(k)',
      best: { cost: 'O(1)', why: 'k is first in its chain.', example: 'delete-chain' },
      average: {
        cost: 'O(1 + α)',
        why: 'Find k in a chain of about α keys, then change one pointer.',
        example: 'delete-chain',
      },
      worst: {
        cost: 'O(n)',
        why: 'k is last in a chain that holds every key.',
        example: 'one-bucket',
      },
      note: 'Keep m proportional to n and α stays a constant, so all three are O(1) on average. Space: O(n + m).',
    },
  ],
  practice: chainingPractice(() => hashChaining),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as ChainSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    collisions,
    oneBucket,
    deleteChain,
    highLoad,
    patternKeys,
    anagrams,
    keyValue,
    tailInsert,
  ] as unknown as SavedExample[],
  preview: { example: 'collisions', level: 2 },
};

/**
 * Driver protocol for the code tabs. The code follows the default settings (division method,
 * keys only, new keys first), so the model runs with those and the same m:
 *   new m
 *   insert k  ->  "<bucket> added" | "<bucket> present"
 *   search k  ->  "<bucket> found" | "<bucket> missing"
 *   delete k  ->  "<bucket> deleted" | "<bucket> missing"
 *   clear     ->  "ok"
 *   print     ->  each bucket's keys from the front, buckets separated by " | ", "-" if empty
 * Keys the model rejects (words, values out of range) are left out: the model changes nothing.
 */
function codeScript(calls: OpCall[], settings: ChainSettings) {
  const same: ChainSettings = { ...defaults, m: settings.m };
  const usable = calls.filter(([op, raw]) => {
    if (op === 'clear') return true;
    if (op !== 'insert' && op !== 'search' && op !== 'delete') return false;
    return !(readKey(raw!, same.hash) instanceof Error);
  });
  const t = new Timeline(hashChaining, same, 1, usable);
  const input = [`new ${same.m}`];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, raw] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const lines = new Set(last.lines);
    const v = last.vars ?? {};
    if (op === 'clear') {
      input.push('clear');
      expected.push('ok');
      return;
    }
    const a = readKey(raw!, same.hash);
    if (a instanceof Error) return;
    input.push(`${op} ${a.key}`);
    if (op === 'insert') expected.push(`${v.i} ${lines.has('ins.dup') ? 'present' : 'added'}`);
    else if (op === 'search') expected.push(`${v.i} ${v.found ? 'found' : 'missing'}`);
    else expected.push(`${v.i} ${lines.has('del.miss') ? 'missing' : 'deleted'}`);
  });
  input.push('print');
  expected.push(
    t
      .endState()
      .buckets.map((b) => b.map((e) => String(e.key)).join(' ') || '-')
      .join(' | '),
  );
  return { input, expected };
}

export default hashChaining;
