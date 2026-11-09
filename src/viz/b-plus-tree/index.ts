import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { parseKey } from '../_multiway/btree';
import { distinctKeys, inserts, treePresets } from '../_multiway/presets';
import cppSource from './code/cpp/bplus_tree.hpp?raw';
import javaSource from './code/java/BPlusTree.java?raw';
import pythonSource from './code/python/bplus_tree.py?raw';
import explain from './explain.md?raw';
import borrow from './examples/borrow.json';
import deleteLeaf from './examples/delete-leaf.json';
import leafSplit from './examples/leaf-split.json';
import mergeCascade from './examples/merge-cascade.json';
import merge from './examples/merge.json';
import pushUp from './examples/push-up.json';
import rangeWalk from './examples/range-walk.json';
import searchSignpost from './examples/search-signpost.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  keysOf,
  leafKeys,
  ops,
  pseudocode,
  type BPExtra,
  type BPSettings,
  type BState,
} from './model';
import { bPlusPractice } from './practice';
import { view } from './view';

/** Keys are numbers; anything else is refused with a reason. */
export function parseKeyInput(token: string): Value | Error {
  return parseKey(token);
}

export const bPlusTree: VizDef<BState, BPSettings, BPExtra> = {
  id: 'b-plus-tree',
  title: 'B+ tree',
  family: 'Trees',
  blurb:
    'A B-tree that keeps every key in its leaves and links the leaves in order, so a range query walks down once and then along the leaves.',
  settings: [
    {
      kind: 'choice',
      key: 'order',
      label: 'Order m (the most children a node may have)',
      options: [
        { value: '3', label: 'm = 3: up to 2 keys per node' },
        { value: '4', label: 'm = 4: up to 3 keys per node' },
        { value: '5', label: 'm = 5: up to 4 keys per node' },
      ],
      help: 'An internal node other than the root has at least ⌈m/2⌉ children. A leaf other than the root holds at least ⌈(m - 1)/2⌉ keys.',
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
      placeholder: 'e.g. 42, 10 20 30, or 25 65 for a range',
      maxLength: 160,
      sample: '50',
      parse: parseKeyInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'delete', label: 'Delete', usesInput: true, bulk: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'range', label: 'Range', usesInput: true, args: ['a low key', 'a high key'] },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      ...treePresets(),
      {
        label: 'Random, then a range query',
        make: (rng, n) => {
          const keys = distinctKeys(rng, n);
          const sorted = [...keys].sort((a, b) => a - b);
          const lo = sorted[Math.floor(n / 4)]!;
          const hi = sorted[Math.floor((3 * n) / 4)]!;
          return [...inserts(keys), ['range', lo, hi]];
        },
      },
    ],
    sizes: [10, 20, 30],
  },
  explain,
  practice: bPlusPractice(() => bPlusTree),
  complexity: [
    {
      op: 'search(k)',
      best: {
        cost: 'O(log n)',
        why: 'Even when k is a separator in the root, the search goes on down to the leaf that holds it.',
        example: 'search-signpost',
      },
      average: {
        cost: 'O(log_m n)',
        why: 'One node per level, so O(log_m n) disk reads, each with at most m - 1 comparisons.',
        example: 'search-signpost',
      },
      worst: {
        cost: 'O(log_m n)',
        why: 'Every search ends in a leaf, and all leaves are at the same depth.',
      },
    },
    {
      op: 'range(a, b)',
      best: {
        cost: 'O(log_m n)',
        why: 'The walk down to a; if the first key it finds is past b, the answer is empty.',
      },
      average: {
        cost: 'O(log_m n + k)',
        why: 'One walk down, then along the linked leaves: k answers fill about k / (m/2) leaves.',
        example: 'range-walk',
      },
      worst: {
        cost: 'O(n)',
        why: 'A range that covers every key reads every leaf. That is still one disk read per leaf, in order.',
        example: 'range-walk',
      },
      note: 'k is the number of keys the range returns. Without the leaf links, each next key could mean a walk back up the tree.',
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(log_m n)',
        why: 'The walk down to the leaf, which has room.',
        example: 'leaf-split',
      },
      average: {
        cost: 'O(log_m n)',
        why: 'Splits are rare, and a split touches only the node, its new sibling and its parent.',
      },
      worst: {
        cost: 'O(log_m n)',
        why: 'The leaf splits, then every parent up to the root: O(m) work and a few disk writes per level.',
        example: 'push-up',
      },
    },
    {
      op: 'delete(k)',
      best: {
        cost: 'O(log_m n)',
        why: 'The walk down; the leaf keeps enough keys and nothing above changes.',
        example: 'delete-leaf',
      },
      average: {
        cost: 'O(log_m n)',
        why: 'A borrow or a merge near the bottom costs O(m) and a few disk writes.',
        example: 'borrow',
      },
      worst: {
        cost: 'O(log_m n)',
        why: 'Merges climb all the way up and the root goes away: one fix per level.',
        example: 'merge-cascade',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BPSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    leafSplit,
    pushUp,
    searchSignpost,
    rangeWalk,
    deleteLeaf,
    borrow,
    merge,
    mergeCascade,
  ] as unknown as SavedExample[],
  opening: 'push-up',
  preview: { example: 'push-up', level: 2 },
};

/**
 * Driver protocol for the code tabs. The code follows the default order, m = 4. Results depend
 * only on which keys the tree holds, never on its shape:
 *   insert k   ->  "ok" and the keys in order  |  "duplicate"
 *   delete k   ->  "ok" and the keys in order  |  "missing"
 *   search k   ->  "found" | "missing"
 *   range a b  ->  the keys from a to b, in order | "empty"
 *   clear      ->  "ok"
 * The driver lists the keys by walking the leaf links, so a broken link shows up as wrong output.
 */
function codeScript(calls: OpCall[], settings: BPSettings) {
  const t = new Timeline(bPlusTree, { ...settings, order: '4' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e, i) => {
    const [op, ...raw] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const args: number[] = [];
    for (const r of raw) {
      const k = parseKey(r);
      if (k instanceof Error) return; // The model refuses it and changes nothing.
      args.push(k);
    }
    input.push([op, ...args].join(' '));
    const before = i === 0 ? [] : keysOf(t.entries[i - 1]!.end);
    const after = keysOf(e.end);
    const list = after.length ? `ok ${after.join(' ')}` : 'ok';
    if (op === 'insert') expected.push(after.length > before.length ? list : 'duplicate');
    else if (op === 'delete') expected.push(after.length < before.length ? list : 'missing');
    else if (op === 'search') expected.push(last.vars?.found === true ? 'found' : 'missing');
    else if (op === 'range') {
      // What the model's walk along the leaves output, in order.
      const keys = new Map(leafKeys(last.state).map((k) => [k.uid, k.key]));
      const got = (last.extra?.output ?? []).map((uid) => keys.get(uid));
      expected.push(got.length ? got.join(' ') : 'empty');
    } else expected.push('ok');
  });
  return { input, expected };
}

export default bPlusTree;
