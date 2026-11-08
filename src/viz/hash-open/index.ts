import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { distinctKeys, parseNumberInput, readNumber } from '../_hashing/hashing';
import cppSource from './code/cpp/linear_probing.hpp?raw';
import javaSource from './code/java/LinearProbingTable.java?raw';
import pythonSource from './code/python/linear_probing.py?raw';
import doubleHashing from './examples/double-hashing.json';
import fullTable from './examples/full-table.json';
import primaryClustering from './examples/primary-clustering.json';
import quadraticFails from './examples/quadratic-fails.json';
import secondaryClustering from './examples/secondary-clustering.json';
import tombstones from './examples/tombstones.json';
import triangular from './examples/triangular.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type OpenExtra,
  type OpenSettings,
  type OpenState,
} from './model';
import { openPractice } from './practice';
import { view } from './view';

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

export const hashOpen: VizDef<OpenState, OpenSettings, OpenExtra> = {
  id: 'hash-open',
  title: 'Open addressing (linear, quadratic, double)',
  family: 'Hashing and maps',
  blurb:
    'Every key gets a slot of its own in the array. A collision sends the key along a probe sequence until it finds an empty slot; deletes leave tombstones.',
  settings: [
    { kind: 'number', key: 'm', label: 'Table size m (number of slots)', min: 2, max: 31 },
    {
      kind: 'choice',
      key: 'probe',
      label: 'Probing',
      options: [
        { value: 'linear', label: 'Linear: h(k, i) = (h(k) + i) mod m (CLRS)' },
        { value: 'quadratic', label: 'Quadratic: h(k, i) = (h(k) + i²) mod m' },
        {
          value: 'triangular',
          label: 'Quadratic with triangular numbers: h(k, i) = (h(k) + i(i+1)/2) mod m',
        },
        { value: 'double', label: 'Double hashing: h(k, i) = (h(k) + i·h2(k)) mod m' },
      ],
      help: 'h(k) = k mod m in every case. Quadratic probing needs α below 1/2 when m is prime; the triangular version reaches every slot when m is a power of 2.',
    },
    {
      kind: 'choice',
      key: 'h2',
      label: 'Second hash, for double hashing',
      options: [
        { value: 'clrs', label: 'h2(k) = 1 + (k mod (m − 1)) (CLRS)' },
        { value: 'prime', label: 'h2(k) = R − (k mod R), R the largest prime below m' },
      ],
      help: 'Either way h2(k) is never 0. With a prime m every step reaches every slot.',
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
      placeholder: 'e.g. 42 or 22 33 44',
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
      { label: 'All colliding keys', make: (_rng, n) => [['fill', 'collide', n]] },
      {
        label: 'Sequential keys',
        make: (rng, n) => {
          const start = rng.int(1, 60);
          return inserts(Array.from({ length: n }, (_, i) => start + i));
        },
      },
    ],
    sizes: [4, 6, 9],
  },
  explain,
  complexity: [
    {
      op: 'search(k)',
      best: {
        cost: 'O(1)',
        why: 'The first probe finds k, or an empty slot.',
        example: 'double-hashing',
      },
      average: {
        cost: 'O(1/(1 − α))',
        why: 'With uniform hashing, a miss expects at most 1/(1 − α) probes; a hit fewer.',
        example: 'primary-clustering',
      },
      worst: {
        cost: 'O(m)',
        why: 'The probe sequence passes every key and tombstone in the table.',
        example: 'full-table',
      },
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(1)',
        why: 'The home slot h(k) is empty.',
        example: 'double-hashing',
      },
      average: {
        cost: 'O(1/(1 − α))',
        why: 'It probes until an empty slot, like an unsuccessful search.',
        example: 'primary-clustering',
      },
      worst: {
        cost: 'O(m)',
        why: 'All m probes, and then it may still fail: a full table, or quadratic probing that cannot reach the empty slots.',
        example: 'quadratic-fails',
      },
    },
    {
      op: 'delete(k)',
      best: { cost: 'O(1)', why: 'k is in its home slot.', example: 'tombstones' },
      average: {
        cost: 'O(1/(1 − α))',
        why: 'A search, then one write of DEL.',
        example: 'tombstones',
      },
      worst: {
        cost: 'O(m)',
        why: 'The search for k walks the whole table.',
        example: 'full-table',
      },
      note: 'Tombstones take up slots, so a table with many deletes probes as if it were fuller than α says. Rebuilding the table clears them.',
    },
  ],
  practice: openPractice(() => hashOpen),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as OpenSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    primaryClustering,
    tombstones,
    quadraticFails,
    doubleHashing,
    secondaryClustering,
    fullTable,
    triangular,
  ] as unknown as SavedExample[],
  preview: { example: 'primary-clustering', level: 2 },
};

/**
 * Driver protocol for the code tabs. The code follows the default settings (linear probing),
 * so the model runs with that and the same m:
 *   new m
 *   insert k  ->  "added <probes>" | "present <probes>" | "full <probes>"
 *   search k  ->  "found <slot> <probes>" | "missing <probes>"
 *   delete k  ->  "deleted <probes>" | "missing <probes>"
 *   clear     ->  "ok"
 *   print     ->  every slot: its key, DEL, or -
 * Keys the model rejects are left out: the model changes nothing.
 */
function codeScript(calls: OpCall[], settings: OpenSettings) {
  const same: OpenSettings = { ...defaults, m: settings.m };
  const usable = calls.filter(([op, raw]) => {
    if (op === 'clear') return true;
    if (op !== 'insert' && op !== 'search' && op !== 'delete') return false;
    return !(readNumber(raw!) instanceof Error);
  });
  const t = new Timeline(hashOpen, same, 1, usable);
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
    input.push(`${op} ${readNumber(raw!)}`);
    if (op === 'insert') {
      const result = lines.has('ins.dup') ? 'present' : lines.has('ins.full') ? 'full' : 'added';
      expected.push(`${result} ${v.probes}`);
    } else if (op === 'search') {
      expected.push(v.found ? `found ${v.j} ${v.probes}` : `missing ${v.probes}`);
    } else {
      expected.push(`${lines.has('del.mark') ? 'deleted' : 'missing'} ${v.probes}`);
    }
  });
  input.push('print');
  expected.push(
    t
      .endState()
      .slots.map((c) => (c === null ? '-' : c.del ? 'DEL' : String(c.key)))
      .join(' '),
  );
  return { input, expected };
}

export default hashOpen;
