import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { distinctKeys, readNumber } from '../_hashing/hashing';
import cppSource from './code/cpp/hash_ring.hpp?raw';
import javaSource from './code/java/HashRing.java?raw';
import pythonSource from './code/python/hash_ring.py?raw';
import addAServer from './examples/add-a-server.json';
import lookupWraps from './examples/lookup-wraps.json';
import removeAServer from './examples/remove-a-server.json';
import threeServers from './examples/three-servers.json';
import virtualNodes from './examples/virtual-nodes.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  ownerOf,
  pseudocode,
  readServer,
  type RingExtra,
  type RingSettings,
  type RingState,
} from './model';
import { ringPractice } from './practice';
import { view } from './view';

/** The input box: a key (a number from 0 to 999) or a server (a letter from A to H). */
export function parseRingInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a key such as 42, or a server letter such as D.');
  if (/^\d+$/.test(t)) return readNumber(t);
  const s = readServer(t);
  return s instanceof Error
    ? new Error('Type a key from 0 to 999, or a server letter from A to H.')
    : s;
}

const servers = (xs: string[]): OpCall[] => xs.map((s) => ['addServer', s] as OpCall);
const keys = (xs: number[]): OpCall[] => xs.map((k) => ['addKey', k] as OpCall);

export const consistentHashing: VizDef<RingState, RingSettings, RingExtra> = {
  id: 'consistent-hashing',
  title: 'Consistent hashing',
  family: 'Hashing and maps',
  blurb:
    'Servers and keys hashed onto one ring; each key goes to the first server clockwise. Adding or removing a server moves only the keys next to it, and virtual nodes even out the load.',
  settings: [
    {
      kind: 'number',
      key: 'vnodes',
      label: 'Virtual nodes per server',
      min: 1,
      max: 4,
      help: 'Each server is hashed to this many places on the ring. More nodes, more even loads.',
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
      label: 'Key or server',
      placeholder: 'e.g. 42, or a server letter D',
      maxLength: 160,
      sample: '42',
      parse: parseRingInput,
    },
    buttons: [
      { op: 'addKey', label: 'Add key', usesInput: true, bulk: true, primary: true },
      { op: 'lookup', label: 'Look up', usesInput: true },
      { op: 'addServer', label: 'Add server', usesInput: true, bulk: true },
      { op: 'removeServer', label: 'Remove server', usesInput: true },
      { op: 'clear', label: 'Clear keys', usesInput: false, more: true },
    ],
    random: { label: 'Add random key', make: (rng) => [['addKey', rng.int(0, 199)]] },
    presets: [
      {
        label: 'Three servers and random keys',
        make: (rng, n) => [...servers(['A', 'B', 'C']), ...keys(distinctKeys(rng, n))],
      },
      {
        label: 'Five servers and random keys',
        make: (rng, n) => [...servers(['A', 'B', 'C', 'D', 'E']), ...keys(distinctKeys(rng, n))],
      },
    ],
    sizes: [6, 12, 18],
  },
  explain,
  complexity: [
    {
      op: 'lookup(k)',
      best: {
        cost: 'O(log(Nv))',
        why: 'Binary search for the first node clockwise in the sorted list of N·v nodes.',
        example: 'three-servers',
      },
      average: { cost: 'O(log(Nv))', why: 'The same search for every key.' },
      worst: {
        cost: 'O(log(Nv))',
        why: 'Wrapping past 0 is just the first node in the list.',
        example: 'lookup-wraps',
      },
    },
    {
      op: 'addServer(s)',
      best: {
        cost: 'O(v log(Nv))',
        why: 'Insert v nodes in the sorted list; no key falls in their arcs.',
      },
      average: {
        cost: 'O(v log(Nv) + n/N)',
        why: 'About n/N keys move to the new server, and no others.',
        example: 'add-a-server',
      },
      worst: {
        cost: 'O(v log(Nv) + n)',
        why: 'An unlucky node takes a very long arc.',
        example: 'virtual-nodes',
      },
      note: 'With h(k) mod N, changing N moves about n·(1 − 1/N) of the keys instead.',
    },
    {
      op: 'removeServer(s)',
      best: { cost: 'O(v log(Nv))', why: 'Take its nodes out; it held no keys.' },
      average: {
        cost: 'O(v log(Nv) + n/N)',
        why: 'Only the keys it held move, to the next node clockwise.',
        example: 'remove-a-server',
      },
      worst: {
        cost: 'O(v log(Nv) + n)',
        why: 'It held most keys, because its arcs were long.',
        example: 'remove-a-server',
      },
    },
  ],
  practice: ringPractice(() => consistentHashing),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RingSettings),
  },
  examples: [
    threeServers,
    addAServer,
    removeAServer,
    virtualNodes,
    lookupWraps,
  ] as unknown as SavedExample[],
  opening: 'three-servers',
  preview: { example: 'virtual-nodes', level: 1, hide: ['srv-', 'sl-', 'sn-', 'pk-', 'tick-'] },
};

/**
 * Driver protocol for the code tabs: "new v", then addKey -> the server; lookup -> the server or
 * "none"; addServer/removeServer -> the keys that moved, in insertion order, or "none"; clear ->
 * ok. Calls the page rejects are left out.
 */
function codeScript(calls: OpCall[], settings: RingSettings) {
  const t = new Timeline(consistentHashing, settings, 1, calls);
  const input = [`new ${settings.vnodes}`];
  const expected: string[] = [];
  t.entries.forEach((e, i) => {
    const [op, x] = e.call;
    const last = e.steps.at(-1)!;
    if (last.marks.some((m) => m.id === 'arg-box' && m.role === 'error')) return;
    input.push(e.call.join(' '));
    const before = i ? t.entries[i - 1]!.end : init(settings);
    if (op === 'addKey' || op === 'lookup') expected.push(ownerOf(e.end, Number(x)) ?? 'none');
    else if (op === 'addServer' || op === 'removeServer') {
      const moved = before.keys
        .filter((k) => ownerOf(before, k.key) !== ownerOf(e.end, k.key))
        .map((k) => k.key);
      expected.push(moved.length ? moved.join(' ') : 'none');
    } else expected.push('ok');
  });
  return { input, expected };
}

export default consistentHashing;
