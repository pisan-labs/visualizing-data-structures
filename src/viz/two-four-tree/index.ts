import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { keysOf, parseKey } from '../_multiway/btree';
import { treePresets } from '../_multiway/presets';
import cppSource from './code/cpp/two_four_tree.hpp?raw';
import javaSource from './code/java/TwoFourTree.java?raw';
import pythonSource from './code/python/two_four_tree.py?raw';
import explain from './explain.md?raw';
import fusionCascade from './examples/fusion-cascade.json';
import fusion from './examples/fusion.json';
import overflowSplit from './examples/overflow-split.json';
import searchPath from './examples/search-path.json';
import splitCascade from './examples/split-cascade.json';
import swapPredecessor from './examples/swap-predecessor.json';
import transferLeft from './examples/transfer-left.json';
import transferRight from './examples/transfer-right.json';
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
  type TwoFourSettings,
} from './model';
import { twoFourPractice } from './practice';
import { view } from './view';

/** Keys are numbers; anything else is refused with a reason. */
export function parseKeyInput(token: string): Value | Error {
  return parseKey(token);
}

export const twoFourTree: VizDef<BState, TwoFourSettings, BExtra> = {
  id: 'two-four-tree',
  title: '2-4 tree',
  family: 'Trees',
  blurb:
    'Every node has 2, 3 or 4 children and every leaf is at the same depth: overflows split, underflows transfer or fuse.',
  settings: [
    {
      kind: 'choice',
      key: 'swap',
      label: 'Deleting a key that is not in a leaf',
      options: [
        { value: 'pred', label: 'Swap it with its predecessor (Goodrich and Tamassia)' },
        { value: 'succ', label: 'Swap it with its successor' },
      ],
      help: 'Both neighbors in sorted order sit in leaves, so after the swap the key comes out of a leaf.',
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
  practice: twoFourPractice(() => twoFourTree),
  complexity: [
    {
      op: 'search(k)',
      best: {
        cost: 'O(1)',
        why: 'k is in the root: one node read, at most 3 comparisons.',
        example: 'search-path',
      },
      average: {
        cost: 'O(log n)',
        why: 'One node per level, and a tree with n keys has between about log₄ n and log₂ n levels.',
        example: 'search-path',
      },
      worst: {
        cost: 'O(log n)',
        why: 'A miss reads one node on every level down to a leaf. As a B-tree on disk, that is one disk read per level.',
        example: 'search-path',
      },
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(log n)',
        why: 'Even when the leaf has room, finding it takes one step per level.',
        example: 'overflow-split',
      },
      average: {
        cost: 'O(log n)',
        why: 'The walk down dominates. Splits are rare: over many inserts, there is less than one per insert.',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Every node on the path overflows and the root splits too: O(1) work per level.',
        example: 'split-cascade',
      },
    },
    {
      op: 'delete(k)',
      best: {
        cost: 'O(log n)',
        why: 'The leaf keeps a key, so nothing underflows, but finding k still walks down.',
        example: 'swap-predecessor',
      },
      average: {
        cost: 'O(log n)',
        why: 'Find k, maybe walk to its predecessor, and fix at most a few underflows near the bottom.',
        example: 'transfer-left',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Fusions climb all the way to the root and the tree loses a level: O(1) work per level.',
        example: 'fusion-cascade',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as TwoFourSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    overflowSplit,
    splitCascade,
    searchPath,
    swapPredecessor,
    transferLeft,
    transferRight,
    fusion,
    fusionCascade,
  ] as unknown as SavedExample[],
  preview: { example: 'split-cascade' },
};

/**
 * Driver protocol for the code tabs, the same as the B-tree's. Results depend only on which keys
 * the tree holds, never on its shape:
 *   insert k  ->  "ok" and the keys in order  |  "duplicate"
 *   delete k  ->  "ok" and the keys in order  |  "missing"
 *   search k  ->  "found" | "missing"
 *   clear     ->  "ok"
 */
function codeScript(calls: OpCall[], settings: TwoFourSettings) {
  const t = new Timeline(twoFourTree, { ...settings, swap: 'pred' }, 1, calls);
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
    if (op === 'insert') expected.push(after.length > before.length ? list : 'duplicate');
    else if (op === 'delete') expected.push(after.length < before.length ? list : 'missing');
    else if (op === 'search') expected.push(last.vars?.found === true ? 'found' : 'missing');
    else expected.push('ok');
  });
  return { input, expected };
}

export default twoFourTree;
