import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { distinctKeys, parseNumberInput, readNumber } from '../_hashing/hashing';
import cppSource from './code/cpp/cuckoo_table.hpp?raw';
import javaSource from './code/java/CuckooTable.java?raw';
import pythonSource from './code/python/cuckoo_table.py?raw';
import cycleRehash from './examples/cycle-rehash.json';
import deleteNoTombstone from './examples/delete-no-tombstone.json';
import halfFull from './examples/half-full.json';
import kickChain from './examples/kick-chain.json';
import twoProbes from './examples/two-probes.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type CuckooExtra,
  type CuckooSettings,
  type CuckooState,
} from './model';
import { cuckooPractice } from './practice';
import { view } from './view';

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

/** n keys that share both nests in tables of m slots: k = a + m·b + m²·c. */
export function nestMates(m: number, n: number, a: number, b: number): number[] {
  const out: number[] = [];
  for (let c = 0; out.length < n && a + m * b + m * m * c <= 999; c++)
    out.push(a + m * b + m * m * c);
  return out;
}

export const cuckooHashing: VizDef<CuckooState, CuckooSettings, CuckooExtra> = {
  id: 'cuckoo-hashing',
  title: 'Cuckoo hashing',
  family: 'Hashing and maps',
  blurb:
    'Two tables, two hash functions, and every key in one of its two nests. An insert kicks the old key out to its other nest, and so on; a lookup never needs more than two probes.',
  settings: [
    {
      kind: 'number',
      key: 'm',
      label: 'Slots per table m',
      min: 5,
      max: 13,
      help: 'h1(k) = k mod m and h2(k) = ⌊k/m⌋ mod m. A rehash grows m to the next prime.',
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
      placeholder: 'e.g. 42 or 20 50 53',
      maxLength: 160,
      sample: '42',
      parse: parseNumberInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'delete', label: 'Delete', usesInput: true, bulk: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(0, 200)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      {
        label: 'Keys that share both nests (forces a rehash)',
        make: (rng, n, s) => {
          const m = Number(s?.m ?? defaults.m);
          const mates = nestMates(m, 3, rng.int(0, m - 1), rng.int(0, m - 1));
          return inserts([...distinctKeys(rng, Math.max(0, n - 3)), ...mates]);
        },
      },
    ],
    sizes: [4, 6, 9],
  },
  explain,
  complexity: [
    {
      op: 'search(k)',
      best: { cost: 'O(1)', why: 'k is in its T1 nest: one probe.', example: 'two-probes' },
      average: { cost: 'O(1)', why: 'At most two probes, always.', example: 'two-probes' },
      worst: {
        cost: 'O(1)',
        why: 'Still two probes: a key is in one of two places or nowhere.',
        example: 'two-probes',
      },
    },
    {
      op: 'insert(k)',
      best: { cost: 'O(1)', why: 'Its T1 nest is empty.', example: 'kick-chain' },
      average: {
        cost: 'O(1) expected',
        why: 'With load below 1/2 and random hash functions, kick chains are short on average.',
        example: 'half-full',
      },
      worst: {
        cost: 'O(n)',
        why: 'A cycle means a rehash that puts every key back in.',
        example: 'cycle-rehash',
      },
      note: 'The load n/2m must stay below about 1/2; real tables rehash before then.',
    },
    {
      op: 'delete(k)',
      best: { cost: 'O(1)', why: 'Empty one of two slots.', example: 'delete-no-tombstone' },
      average: { cost: 'O(1)', why: 'No tombstones and no shifting.' },
      worst: { cost: 'O(1)', why: 'Two probes at most.', example: 'delete-no-tombstone' },
    },
  ],
  practice: cuckooPractice(() => cuckooHashing),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as CuckooSettings),
  },
  examples: [
    kickChain,
    cycleRehash,
    twoProbes,
    deleteNoTombstone,
    halfFull,
  ] as unknown as SavedExample[],
  preview: { example: 'half-full', level: 1, hide: ['alt-', 'title-', 'queue-'] },
};

/**
 * Driver protocol for the code tabs: "new m", then insert -> "added <kicks>" (plus
 * " rehash <m>" when the tables grew) | present; search -> found 1 | found 2 | missing; delete ->
 * deleted | missing; clear -> ok; and a final "print" of both tables.
 */
function codeScript(calls: OpCall[], settings: CuckooSettings) {
  const ok = calls.filter(([op, x]) => op === 'clear' || !(readNumber(x!) instanceof Error));
  const t = new Timeline(cuckooHashing, settings, 1, ok);
  const input = [`new ${settings.m}`, ...ok.map((c) => c.join(' ')), 'print'];
  const expected = t.entries.map((e, i) => {
    const [op] = e.call;
    const last = e.steps.at(-1)!;
    const before = i ? t.entries[i - 1]!.end : init(settings);
    if (op === 'insert') {
      if (last.lines.includes('ins.look')) return 'present';
      const firstKicks = e.steps.filter(
        (s) => s.lines.includes('ins.kick') && s.level === 2,
      ).length;
      const grew = e.end.rehashes !== before.rehashes;
      return `added ${firstKicks}${grew ? ` rehash ${e.end.m}` : ''}`;
    }
    if (op === 'search') return last.vars!.found ? `found ${last.vars!.probes}` : 'missing';
    if (op === 'delete') return last.lines.includes('del.clear') ? 'deleted' : 'missing';
    return 'ok';
  });
  const end = t.endState();
  const row = (side: 0 | 1) => end.t[side].map((c) => (c ? String(c.key) : '-')).join(' ');
  expected.push(`${row(0)} | ${row(1)}`);
  return { input, expected };
}

export default cuckooHashing;
