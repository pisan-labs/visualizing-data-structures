import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/lfu_cache.hpp?raw';
import javaSource from './code/java/LFUCache.java?raw';
import pythonSource from './code/python/lfu_cache.py?raw';
import capacityOne from './examples/capacity-one.json';
import evictLeastUsed from './examples/evict-least-used.json';
import hotKeySurvives from './examples/hot-key-survives.json';
import minFreqMoves from './examples/min-freq-moves.json';
import oldFavourites from './examples/old-favourites.json';
import scanEveryKey from './examples/scan-every-key.json';
import tieGoesToLru from './examples/tie-goes-to-lru.json';
import updateIsAUse from './examples/update-is-a-use.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  lookup,
  MAX_CAPACITY,
  node,
  ops,
  pseudocode,
  readInt,
  type LfuExtra,
  type LfuSettings,
  type LfuState,
} from './model';
import { lfuPractice } from './practice';
import { view } from './view';

function parseNumber(token: string): Value | Error {
  return token.trim() ? readInt(token, 'A key or value') : new Error('Type a key first.');
}

/** n operations on keys 1 to 9: puts while the cache fills, then a mix. */
function randomOps(rng: Rng, n: number): OpCall[] {
  return Array.from({ length: n }, (_, i): OpCall => {
    const k = rng.int(1, 9);
    return i < 2 || rng.int(0, 2) === 0 ? ['put', k, rng.int(10, 99)] : ['get', k];
  });
}

export const lfuCache: VizDef<LfuState, LfuSettings, LfuExtra> = {
  id: 'lfu-cache',
  title: 'LFU cache',
  family: 'Design a data structure',
  blurb:
    'Evict the least frequently used key, the least recently used of them on a tie, in O(1): a map from key to node, a doubly linked list per frequency, and the smallest frequency in use. Against scanning every key for the fewest uses.',
  settings: [
    approachSetting({
      pattern: 'A list per frequency and minFreq, O(1)',
      naive: 'Scan every key to evict, O(n)',
    }),
    { kind: 'number', key: 'capacity', label: 'Capacity (entries)', min: 1, max: MAX_CAPACITY },
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
      label: 'Key (and value)',
      placeholder: 'e.g. 3, or 3 30 for put',
      maxLength: 40,
      sample: '7',
      parse: parseNumber,
    },
    buttons: [
      { op: 'put', label: 'Put', usesInput: true, primary: true, args: ['a key', 'a value'] },
      { op: 'get', label: 'Get', usesInput: true, bulk: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: {
      label: 'Put random',
      make: (rng) => [['put', rng.int(1, 9), rng.int(10, 99)]],
    },
    presets: [
      { label: 'Random keys', make: (rng, n) => randomOps(rng, n) },
      {
        label: 'A hot key, then a scan of new keys',
        make: (rng, n) => {
          const hot = rng.int(1, 9);
          const ops: OpCall[] = [
            ['put', hot, hot * 10],
            ['get', hot],
            ['get', hot],
          ];
          for (let i = 0; ops.length < n; i++) {
            const k = 10 + i;
            ops.push(i % 3 === 2 ? ['get', hot] : ['put', k, k]);
          }
          return ops;
        },
      },
      {
        label: 'Every key used once (ties)',
        make: (rng, n) => {
          const start = rng.int(1, 20);
          return Array.from({ length: n }, (_, i): OpCall => ['put', start + i, 10 * (i + 1)]);
        },
      },
      {
        label: 'Old favourites, then new keys',
        make: (_rng, n) => {
          const ops: OpCall[] = [
            ['put', 1, 10],
            ['get', 1],
            ['get', 1],
            ['put', 2, 20],
            ['get', 2],
          ];
          for (let i = 0; ops.length < n; i++)
            ops.push(i % 2 === 0 ? ['put', 3 + i, 30 + i] : ['get', 2 + i]);
          return ops;
        },
      },
    ],
    sizes: [6, 10, 16],
  },
  explain,
  complexity: [
    {
      op: 'get(k), lists and minFreq',
      best: {
        cost: 'O(1)',
        why: 'A miss: one hash map lookup.',
        example: 'evict-least-used',
      },
      average: {
        cost: 'O(1)',
        why: 'A hit: one lookup, then two splices to move the node up one frequency.',
        example: 'min-freq-moves',
      },
      worst: {
        cost: 'O(1) expected',
        why: 'Only a hash map whose keys all collide is slower; the list work is always two splices.',
      },
    },
    {
      op: 'put(k, v), lists and minFreq',
      best: {
        cost: 'O(1)',
        why: 'A new key with room: a lookup, a map write and an append to the freq-1 list.',
        example: 'tie-goes-to-lru',
      },
      average: {
        cost: 'O(1)',
        why: 'A cached key: a lookup and two splices, as get does.',
        example: 'update-is-a-use',
      },
      worst: {
        cost: 'O(1) expected',
        why: 'A full cache: the key to evict is the head of lists[minFreq]. Unlink it, forget it, add the new key: no search.',
        example: 'evict-least-used',
      },
    },
    {
      op: 'put(k, v) into a full cache, scanning',
      best: {
        cost: 'Θ(n)',
        why: 'Every key is looked at, whatever the counts: the scan cannot stop early.',
        example: 'scan-every-key',
      },
      average: { cost: 'Θ(n)', why: 'n keys looked at, plus three lookups.' },
      worst: {
        cost: 'Θ(n)',
        why: 'With 3 keys that is 6 units against 5 for the lists; with 10,000 keys, 10,003 against 5.',
        example: 'scan-every-key',
      },
      note: 'A min-heap keyed by (count, last use) is the middle way: O(log n) for every get and put.',
    },
    {
      op: 'get(k), scanning design',
      best: { cost: 'O(1)', why: 'One lookup: a miss.', example: 'scan-every-key' },
      average: {
        cost: 'O(1)',
        why: 'One lookup, then add 1 to the count: cheaper than the lists’ two splices.',
        example: 'scan-every-key',
      },
      worst: { cost: 'O(1) expected', why: 'Again only a degraded hash map is slower.' },
    },
    {
      op: 'space',
      best: {
        cost: 'O(capacity)',
        why: 'Scanning: one entry per key, with its count and last use.',
        example: 'scan-every-key',
      },
      average: {
        cost: 'O(capacity)',
        why: 'The lists: one node per key, with two pointers, and one frequency entry per list.',
        example: 'evict-least-used',
      },
      worst: {
        cost: 'O(capacity)',
        why: 'At most one list per key, if every key has a different count.',
        example: 'hot-key-survives',
      },
    },
  ],
  practice: lfuPractice(() => lfuCache),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as LfuSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    evictLeastUsed,
    tieGoesToLru,
    minFreqMoves,
    hotKeySurvives,
    oldFavourites,
    scanEveryKey,
    updateIsAUse,
    capacityOne,
  ] as unknown as SavedExample[],
  opening: 'evict-least-used',
  preview: { example: 'evict-least-used', level: 2, hide: ['m'] },
};

/**
 * Driver protocol for the code tabs:
 *   new capacity
 *   get k     ->  the value | -1
 *   put k v   ->  "added" | "updated" | "evict <key>"
 *   clear     ->  "ok"
 *   print     ->  each frequency's keys, least recent first ("1:4,2 2:1", or "empty"),
 *                 " | min " minFreq, " | " hits and misses
 * Keys or values the model rejects are left out: the model changes nothing.
 */
function codeScript(calls: OpCall[], settings: LfuSettings) {
  const valid = (v: Value | undefined) => v !== undefined && !(readInt(v, 'x') instanceof Error);
  const usable = calls.filter(([op, a, b]) => {
    if (op === 'clear') return true;
    if (op === 'get') return valid(a);
    return op === 'put' && valid(a) && valid(b);
  });
  const t = new Timeline(lfuCache, settings, 1, usable);
  const input = [`new ${t.initial.state.capacity}`];
  const expected: string[] = [];
  let before = t.initial.state;
  for (const e of t.entries) {
    const [op, a, b] = e.call;
    const last = e.steps.at(-1)!;
    if (op === 'clear') {
      input.push('clear');
      expected.push('ok');
    } else if (op === 'get') {
      input.push(`get ${Number(a)}`);
      expected.push(String(last.vars?.returned));
    } else {
      input.push(`put ${Number(a)} ${Number(b)}`);
      const existed = lookup(before, Number(a)) !== null;
      const gone = before.map.find((u) => u !== null && !e.end.map.includes(u));
      expected.push(
        existed
          ? 'updated'
          : gone !== undefined && gone !== null
            ? `evict ${node(before, gone).key}`
            : 'added',
      );
    }
    before = e.end;
  }
  const end = t.endState();
  const lists = end.lists
    .map((l) => `${l.freq}:${l.uids.map((u) => node(end, u).key).join(',')}`)
    .join(' ');
  input.push('print');
  expected.push(`${lists || 'empty'} | min ${end.minFreq} | ${end.hits} ${end.misses}`);
  return { input, expected };
}

export default lfuCache;
