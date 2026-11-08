import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { distinctKeys, parseNumberInput, readNumber } from '../_hashing/hashing';
import cppSource from './code/cpp/bucket_hash_table.hpp?raw';
import javaSource from './code/java/BucketHashTable.java?raw';
import pythonSource from './code/python/bucket_hash_table.py?raw';
import deletePullsBack from './examples/delete-pulls-back.json';
import evenSpread from './examples/even-spread.json';
import oneBucket from './examples/one-bucket.json';
import overflowArea from './examples/overflow-area.json';
import reportOverflow from './examples/report-overflow.json';
import explain from './explain.md?raw';
import {
  collidingKeys,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type BucketExtra,
  type BucketSettings,
  type BucketState,
} from './model';
import { bucketPractice } from './practice';
import { view } from './view';

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

export const hashBuckets: VizDef<BucketState, BucketSettings, BucketExtra> = {
  id: 'hash-buckets',
  title: 'Hashing with buckets',
  family: 'Hashing and maps',
  blurb:
    'Each hash value names a bucket of b slots. A key goes in the first free slot of its bucket; when the bucket is full it goes to an overflow area, or the table reports an overflow.',
  settings: [
    { kind: 'number', key: 'B', label: 'Number of buckets', min: 2, max: 12 },
    { kind: 'number', key: 'b', label: 'Slots per bucket (b)', min: 1, max: 4 },
    {
      kind: 'choice',
      key: 'overflow',
      label: 'When a bucket is full',
      options: [
        { value: 'area', label: 'Put the key in a shared overflow area' },
        { value: 'report', label: 'Report an overflow and refuse the key' },
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
      placeholder: 'e.g. 42 or 10 15 20',
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
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      {
        label: 'All colliding keys',
        make: (rng, n, s) => inserts(collidingKeys(rng, Number(s?.B ?? defaults.B), n)),
      },
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
        why: 'k is in the first slot of its bucket.',
        example: 'even-spread',
      },
      average: {
        cost: 'O(b)',
        why: 'Read one bucket of b slots; with keys spread out, few buckets overflow.',
        example: 'even-spread',
      },
      worst: {
        cost: 'O(n)',
        why: 'Its bucket is full and most keys sit in the overflow area, which is read one by one.',
        example: 'one-bucket',
      },
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(b)',
        why: 'Read the bucket to rule out a duplicate, then use a free slot.',
        example: 'overflow-area',
      },
      average: {
        cost: 'O(b)',
        why: 'Most buckets have room, so the overflow area is rarely read.',
        example: 'even-spread',
      },
      worst: {
        cost: 'O(n)',
        why: 'A full bucket sends insert through the whole overflow area to check for k.',
        example: 'one-bucket',
      },
      note: 'b is a constant (often a disk block of records), so O(b) is O(1).',
    },
    {
      op: 'delete(k)',
      best: {
        cost: 'O(1)',
        why: 'k is first in its bucket and nothing waits in the overflow area.',
      },
      average: {
        cost: 'O(b)',
        why: 'Find k in its bucket and free the slot.',
        example: 'delete-pulls-back',
      },
      worst: {
        cost: 'O(n)',
        why: 'k is in the overflow area, or a key has to be pulled back from it.',
        example: 'delete-pulls-back',
      },
    },
  ],
  practice: bucketPractice(() => hashBuckets),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BucketSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    overflowArea,
    reportOverflow,
    deletePullsBack,
    evenSpread,
    oneBucket,
  ] as unknown as SavedExample[],
  preview: { example: 'overflow-area', level: 2 },
};

/**
 * Driver protocol for the code tabs. The code follows the default overflow handling (an
 * overflow area), so the model runs with that and the same B and b:
 *   new B b
 *   insert k  ->  "added <probes>" | "present <probes>"
 *   search k  ->  "found <probes>" | "missing <probes>"
 *   delete k  ->  "deleted <probes>" | "missing <probes>"
 *   clear     ->  "ok"
 *   print     ->  the buckets' slots ("-" if free) separated by " | ", then " || " and the
 *                 overflow area ("-" if empty)
 * Keys the model rejects are left out: the model changes nothing.
 */
function codeScript(calls: OpCall[], settings: BucketSettings) {
  const same: BucketSettings = { ...defaults, B: settings.B, b: settings.b };
  const usable = calls.filter(([op, raw]) => {
    if (op === 'clear') return true;
    if (op !== 'insert' && op !== 'search' && op !== 'delete') return false;
    return !(readNumber(raw!) instanceof Error);
  });
  const t = new Timeline(hashBuckets, same, 1, usable);
  const input = [`new ${same.B} ${same.b}`];
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
    input.push(`${op} ${readNumber(raw!)}`);
    if (op === 'insert') {
      const added = lines.has('ins.store') || lines.has('ins.append');
      expected.push(`${added ? 'added' : 'present'} ${v.probes}`);
    } else if (op === 'search') {
      expected.push(`${v.found ? 'found' : 'missing'} ${v.probes}`);
    } else {
      expected.push(`${lines.has('del.miss') ? 'missing' : 'deleted'} ${v.probes}`);
    }
  });
  const end = t.endState();
  const buckets = end.buckets
    .map((bk) => bk.map((x) => (x ? String(x.key) : '-')).join(' '))
    .join(' | ');
  const overflow = end.overflow.map((x) => String(x.key)).join(' ') || '-';
  input.push('print');
  expected.push(`${buckets} || ${overflow}`);
  return { input, expected };
}

export default hashBuckets;
