import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { distinctKeys, parseNumberInput, readNumber } from '../_hashing/hashing';
import cppSource from './code/cpp/robin_hood_table.hpp?raw';
import javaSource from './code/java/RobinHoodTable.java?raw';
import pythonSource from './code/python/robin_hood_table.py?raw';
import backwardShift from './examples/backward-shift.json';
import earlyStop from './examples/early-stop.json';
import fullTable from './examples/full-table.json';
import linearCluster from './examples/linear-cluster.json';
import robinCluster from './examples/robin-cluster.json';
import takeFromTheRich from './examples/take-from-the-rich.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type RobinExtra,
  type RobinSettings,
  type RobinState,
} from './model';
import { robinPractice } from './practice';
import { view } from './view';

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

/** n keys whose home slots crowd into the first few slots of a table of m. */
export function crowdedKeys(next: () => number, m: number, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(Math.floor(next() * 3) + m * Math.floor(next() * 7));
  return [...out];
}

export const robinHoodHashing: VizDef<RobinState, RobinSettings, RobinExtra> = {
  id: 'robin-hood-hashing',
  title: 'Robin Hood hashing',
  family: 'Hashing and maps',
  blurb:
    'Linear probing that takes from the rich: a key far from its home slot takes the place of a key close to home. Probe distances even out, searches can stop early, and deletes shift keys back instead of leaving tombstones.',
  settings: [
    { kind: 'number', key: 'm', label: 'Table size m', min: 5, max: 16 },
    {
      kind: 'choice',
      key: 'policy',
      label: 'Probing',
      options: [
        { value: 'robin', label: 'Robin Hood: the key further from home wins the slot' },
        { value: 'linear', label: 'Plain linear probing, for comparison' },
      ],
      help: 'h(k) = k mod m either way. Deletion shifts keys back in both (Knuth’s Algorithm R for plain linear probing).',
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
      placeholder: 'e.g. 42 or 22 33 1 44',
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
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(0, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      {
        label: 'Keys crowding the first slots',
        make: (rng, n, s) => inserts(crowdedKeys(rng.next, Number(s?.m ?? defaults.m), n)),
      },
    ],
    sizes: [5, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'search(k)',
      best: { cost: 'O(1)', why: 'k is at its home slot.', example: 'take-from-the-rich' },
      average: {
        cost: 'O(1/(1 − α))',
        why: 'The same average as linear probing for a hit, but misses stop early and the spread is much smaller.',
        example: 'early-stop',
      },
      worst: {
        cost: 'O(m)',
        why: 'A walk along a long cluster. With random hashing the longest probe distance is O(log n) with high probability, and much shorter than with plain linear probing.',
        example: 'robin-cluster',
      },
    },
    {
      op: 'insert(k)',
      best: { cost: 'O(1)', why: 'The home slot is empty.', example: 'take-from-the-rich' },
      average: {
        cost: 'O(1/(1 − α)²)',
        why: 'Like linear probing: the walk ends at the first empty slot.',
        example: 'robin-cluster',
      },
      worst: {
        cost: 'O(m)',
        why: 'A walk round almost the whole table, swapping as it goes, or a full table.',
        example: 'full-table',
      },
    },
    {
      op: 'delete(k)',
      best: { cost: 'O(1)', why: 'The next slot is empty or holds a key at home: nothing shifts.' },
      average: {
        cost: 'O(1/(1 − α))',
        why: 'Find the key, then shift back the short run behind it.',
        example: 'backward-shift',
      },
      worst: {
        cost: 'O(m)',
        why: 'The whole cluster behind the key shifts back one slot.',
        example: 'backward-shift',
      },
    },
  ],
  practice: robinPractice(() => robinHoodHashing),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RobinSettings),
  },
  examples: [
    takeFromTheRich,
    earlyStop,
    backwardShift,
    robinCluster,
    linearCluster,
    fullTable,
  ] as unknown as SavedExample[],
  opening: 'early-stop',
  preview: { example: 'robin-cluster', level: 1, hide: ['d-'] },
};

/**
 * Driver protocol for the code tabs (Robin Hood, the default): "new m", then insert -> "added
 * <probes> <swaps>" | present | full; search -> "found <slot> <probes>" | "missing <probes>";
 * delete -> "deleted <shifts>" | missing; clear -> ok; and a final "print".
 */
function codeScript(calls: OpCall[], settings: RobinSettings) {
  const same: RobinSettings = { ...defaults, m: settings.m };
  const ok = calls.filter(([op, x]) => op === 'clear' || !(readNumber(x!) instanceof Error));
  const t = new Timeline(robinHoodHashing, same, 1, ok);
  const input = [`new ${same.m}`, ...ok.map((c) => c.join(' ')), 'print'];
  const expected = t.entries.map((e) => {
    const [op] = e.call;
    const last = e.steps.at(-1)!;
    const v = last.vars!;
    if (op === 'insert') {
      if (last.lines.includes('ins.dup')) return 'present';
      if (last.lines.includes('ins.full')) return 'full';
      return `added ${v.probes} ${v.swaps}`;
    }
    if (op === 'search') return v.found ? `found ${v.j} ${v.probes}` : `missing ${v.probes}`;
    if (op === 'delete') return last.lines.includes('del.stop') ? `deleted ${v.shifts}` : 'missing';
    return 'ok';
  });
  expected.push(
    t
      .endState()
      .slots.map((c) => (c ? String(c.key) : '-'))
      .join(' '),
  );
  return { input, expected };
}

export default robinHoodHashing;
