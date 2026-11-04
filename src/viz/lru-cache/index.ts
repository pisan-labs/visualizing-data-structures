import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/lru_cache.hpp?raw';
import javaSource from './code/java/LRUCache.java?raw';
import pythonSource from './code/python/lru_cache.py?raw';
import evictLru from './examples/evict-lru.json';
import hitMovesToFront from './examples/hit-moves-to-front.json';
import loopMisses from './examples/loop-misses.json';
import oneEntry from './examples/one-entry.json';
import updateExisting from './examples/update-existing.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  node,
  order,
  ops,
  pseudocode,
  readInt,
  type LruExtra,
  type LruSettings,
  type LruState,
} from './model';
import { lruPractice } from './practice';
import { view } from './view';

function parseNumber(token: string): Value | Error {
  return token.trim() ? readInt(token, 'A key or value') : new Error('Type a key first.');
}

/** n operations on keys 1 to 9: mostly puts while the cache fills, then a mix. */
function randomOps(rng: Rng, n: number): OpCall[] {
  return Array.from({ length: n }, (_, i): OpCall => {
    const k = rng.int(1, 9);
    return i < 2 || rng.int(0, 2) === 0 ? ['put', k, rng.int(10, 99)] : ['get', k];
  });
}

export const lruCache: VizDef<LruState, LruSettings, LruExtra> = {
  id: 'lru-cache',
  title: 'LRU cache',
  family: 'Hashing and maps',
  blurb:
    'A hash map finds a key’s node in O(1), and a doubly linked list keeps the nodes in order of use, so get, put and evicting the least recently used entry are all O(1).',
  settings: [{ kind: 'number', key: 'capacity', label: 'Capacity (entries)', min: 1, max: 4 }],
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
        label: 'Sequential keys (a scan)',
        make: (rng, n) => {
          const start = rng.int(1, 50);
          return Array.from({ length: n }, (_, i): OpCall => ['put', start + i, 10 * (i + 1)]);
        },
      },
      {
        label: 'A hot set of keys',
        make: (rng, n) => {
          const ops: OpCall[] = [
            ['put', 1, 10],
            ['put', 2, 20],
          ];
          for (let i = 2; i < n; i++) {
            ops.push(i % 3 === 2 ? ['put', rng.int(3, 9), rng.int(30, 99)] : ['get', 1 + (i % 2)]);
          }
          return ops;
        },
      },
      {
        label: 'A loop of 4 keys',
        make: (_rng, n) =>
          Array.from({ length: n }, (_, i): OpCall => {
            const k = (Math.floor(i / 2) % 4) + 1;
            return i % 2 === 0 ? ['get', k] : ['put', k, k];
          }),
      },
    ],
    sizes: [6, 10, 16],
  },
  explain,
  complexity: [
    {
      op: 'get(k)',
      best: {
        cost: 'O(1)',
        why: 'A miss: one hash map lookup.',
        example: 'evict-lru',
      },
      average: {
        cost: 'O(1)',
        why: 'One lookup, then at most six pointer changes to move the node to the front.',
        example: 'hit-moves-to-front',
      },
      worst: {
        cost: 'O(n)',
        why: 'Only if the hash map degrades because every key collides; the list work stays O(1).',
      },
    },
    {
      op: 'put(k, v)',
      best: {
        cost: 'O(1)',
        why: 'k is cached and already at the front: one lookup, one write.',
        example: 'update-existing',
      },
      average: {
        cost: 'O(1)',
        why: 'Lookup, maybe evict the tail (no search: the list knows its last node), link at the front.',
        example: 'evict-lru',
      },
      worst: {
        cost: 'O(n)',
        why: 'Again only a degraded hash map; eviction is always O(1).',
      },
      note: 'Space: O(capacity). The point of the design is that no operation searches the list.',
    },
    {
      op: 'hit rate',
      best: {
        cost: '100%',
        why: 'A small hot set of keys that fits in the cache.',
        example: 'hit-moves-to-front',
      },
      average: {
        cost: 'depends on the workload',
        why: 'LRU bets that what was used recently will be used again soon.',
        example: 'evict-lru',
      },
      worst: {
        cost: '0%',
        why: 'A loop over one key more than the capacity: the key needed next was just evicted.',
        example: 'loop-misses',
      },
    },
  ],
  practice: lruPractice(() => lruCache),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as LruSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    hitMovesToFront,
    evictLru,
    updateExisting,
    loopMisses,
    oneEntry,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs:
 *   new capacity
 *   get k     ->  the value | -1
 *   put k v   ->  "added" | "updated" | "evict <key>"
 *   clear     ->  "ok"
 *   print     ->  key=value pairs from most to least recent ("empty"), " | ", hits and misses
 * Keys or values the model rejects are left out: the model changes nothing.
 */
function codeScript(calls: OpCall[], settings: LruSettings) {
  const valid = (v: Value | undefined) => v !== undefined && !(readInt(v, 'x') instanceof Error);
  const usable = calls.filter(([op, a, b]) => {
    if (op === 'clear') return true;
    if (op === 'get') return valid(a);
    return op === 'put' && valid(a) && valid(b);
  });
  const t = new Timeline(lruCache, settings, 1, usable);
  const input = [`new ${settings.capacity}`];
  const expected: string[] = [];
  let before = t.initial.state;
  t.entries.forEach((e) => {
    const [op, a, b] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    if (op === 'clear') {
      input.push('clear');
      expected.push('ok');
    } else if (op === 'get') {
      input.push(`get ${Number(a)}`);
      expected.push(String(last.vars?.returned));
    } else {
      input.push(`put ${Number(a)} ${Number(b)}`);
      const k = Number(a);
      const existed = before.map.some((u) => u !== null && node(before, u).key === k);
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
  });
  const end = t.endState();
  const entries = order(end).map((u) => `${node(end, u).key}=${node(end, u).value}`);
  input.push('print');
  expected.push(`${entries.join(' ') || 'empty'} | ${end.hits} ${end.misses}`);
  return { input, expected };
}

export default lruCache;
