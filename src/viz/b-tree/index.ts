import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { keysOf, parseKey } from '../_multiway/btree';
import { treePresets } from '../_multiway/presets';
import cppSource from './code/cpp/btree.hpp?raw';
import javaSource from './code/java/BTree.java?raw';
import pythonSource from './code/python/btree.py?raw';
import explain from './explain.md?raw';
import borrowLeft from './examples/borrow-left.json';
import borrowRight from './examples/borrow-right.json';
import deleteLeaf from './examples/delete-leaf.json';
import mergeAround from './examples/merge-around.json';
import mergeDown from './examples/merge-down.json';
import mergeShrinks from './examples/merge-shrinks.json';
import predecessor from './examples/predecessor.json';
import rootSplit from './examples/root-split.json';
import searchPath from './examples/search-path.json';
import splitDown from './examples/split-down.json';
import splitCascade from './examples/split-cascade.json';
import splitEarly from './examples/split-early.json';
import successor from './examples/successor.json';
import ascending from './examples/ascending.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type BExtra,
  type BState,
  type BTreeSettings,
} from './model';
import { bTreePractice } from './practice';
import { view } from './view';

/** Keys are numbers; anything else is refused with a reason. */
export function parseKeyInput(token: string): Value | Error {
  return parseKey(token);
}

export const bTree: VizDef<BState, BTreeSettings, BExtra> = {
  id: 'b-tree',
  title: 'B-tree',
  family: 'Trees',
  blurb:
    'A balanced search tree with many keys per node, built for disks: CLRS insert with splits on the way down, and delete with borrows and merges.',
  settings: [
    {
      kind: 'choice',
      key: 't',
      label: 'Minimum degree t',
      options: [
        { value: '2', label: 't = 2: 1 to 3 keys per node (a 2-3-4 tree)' },
        { value: '3', label: 't = 3: 2 to 5 keys per node' },
        { value: '4', label: 't = 4: 3 to 7 keys per node' },
      ],
      help: 'Every node except the root holds t - 1 to 2t - 1 keys, and an internal node has one more child than it has keys.',
    },
    {
      kind: 'choice',
      key: 'split',
      label: 'When a full node splits',
      options: [
        { value: 'down', label: 'On the way down, before it can overflow (CLRS)' },
        { value: 'up', label: 'On the way back up, after it overflows' },
      ],
      help: 'CLRS splits every full node it passes, so one trip down is enough. The other way finds the leaf first and splits only the nodes that overflow.',
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
      placeholder: 'e.g. 42 or 10 20 30',
      maxLength: 160,
      sample: '50',
      parse: parseKeyInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'delete', label: 'Delete', usesInput: true, bulk: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: treePresets(),
    sizes: [10, 20, 30],
  },
  explain,
  practice: bTreePractice(() => bTree),
  complexity: [
    {
      op: 'search(k)',
      best: {
        cost: 'O(1)',
        why: 'k is in the root: one node read, a few comparisons.',
        example: 'search-path',
      },
      average: {
        cost: 'O(t log_t n)',
        why: 'Every search reads one node per level, O(log_t n) disk reads, and scans up to 2t - 1 keys in each.',
        example: 'search-path',
      },
      worst: {
        cost: 'O(t log_t n)',
        why: 'A miss goes all the way to a leaf. The height is at most log_t((n + 1) / 2), so that is still O(log_t n) disk reads.',
        example: 'search-path',
      },
      note: 'With binary search inside each node the CPU cost drops to O(log n); the disk reads stay O(log_t n).',
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(t log_t n)',
        why: 'Even with no split, insert walks from the root to a leaf: one read per level.',
        example: 'ascending',
      },
      average: {
        cost: 'O(t log_t n)',
        why: 'Splits are rare (about one per t inserts) and each costs O(t), so the walk down dominates.',
        example: 'split-down',
      },
      worst: {
        cost: 'O(t log_t n)',
        why: 'Every node on the path splits and the tree grows a new root: O(t) work and a few disk writes per level.',
        example: 'split-cascade',
      },
    },
    {
      op: 'delete(k)',
      best: {
        cost: 'O(t log_t n)',
        why: 'Case 1 in a leaf with keys to spare still needs the walk down from the root.',
        example: 'delete-leaf',
      },
      average: {
        cost: 'O(t log_t n)',
        why: 'One trip down; a borrow or merge on the way costs O(t) and a few disk writes.',
        example: 'borrow-left',
      },
      worst: {
        cost: 'O(t log_t n)',
        why: 'A merge at every level, ending with the root, lowers the tree by one level: still one trip down.',
        example: 'merge-shrinks',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BTreeSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    rootSplit,
    splitDown,
    splitEarly,
    splitCascade,
    ascending,
    searchPath,
    deleteLeaf,
    predecessor,
    successor,
    mergeAround,
    borrowLeft,
    borrowRight,
    mergeDown,
    mergeShrinks,
  ] as unknown as SavedExample[],
  preview: { example: 'ascending' },
};

/**
 * Driver protocol for the code tabs. The code follows the default settings (t = 3, splits on
 * the way down). Results never depend on the shape of the tree, only on which keys it holds:
 *   insert k  ->  "ok" and the keys in order  |  "duplicate"
 *   delete k  ->  "ok" and the keys in order  |  "missing"
 *   search k  ->  "found" | "missing"
 *   clear     ->  "ok"
 */
function codeScript(calls: OpCall[], settings: BTreeSettings) {
  const same: BTreeSettings = { ...settings, t: '3', split: 'down' };
  const t = new Timeline(bTree, same, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e, i) => {
    const [op, raw] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    let arg = '';
    if (raw !== undefined) {
      const k = parseKey(raw);
      if (k instanceof Error) return; // The model refuses it and changes nothing.
      arg = ` ${k}`;
    }
    input.push(`${op}${arg}`);
    const before = i === 0 ? [] : keysOf(t.entries[i - 1]!.end);
    const after = keysOf(e.end);
    const list = after.length ? `ok ${after.join(' ')}` : 'ok';
    switch (op) {
      case 'insert':
        expected.push(after.length > before.length ? list : 'duplicate');
        break;
      case 'delete':
        expected.push(after.length < before.length ? list : 'missing');
        break;
      case 'search':
        expected.push(last.vars?.found === true ? 'found' : 'missing');
        break;
      default:
        expected.push('ok');
    }
  });
  return { input, expected };
}

export default bTree;
