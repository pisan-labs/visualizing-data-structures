import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { ascending, distinctKeys, inserts, parseKey } from '../_bst/tree-kit';
import cppSource from './code/cpp/persistent_bst.hpp?raw';
import javaSource from './code/java/PersistentBST.java?raw';
import pythonSource from './code/python/persistent_bst.py?raw';
import branchingVersions from './examples/branching-versions.json';
import deleteShares from './examples/delete-shares.json';
import insertCopiesPath from './examples/insert-copies-path.json';
import oldVersionsAnswer from './examples/old-versions-answer.json';
import sortedCopiesMore from './examples/sorted-copies-more.json';
import explain from './explain.md?raw';
import {
  MAX_VERSIONS,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseVersion,
  pseudocode,
  type PersistentExtra,
  type PersistentSettings,
  type PersistentState,
} from './model';
import { persistentPractice } from './practice';
import { view } from './view';

const updates = MAX_VERSIONS - 1;

export const persistentBst: VizDef<PersistentState, PersistentSettings, PersistentExtra> = {
  id: 'persistent-bst',
  title: 'Persistent BST',
  family: 'Trees',
  blurb:
    'A binary search tree that keeps every old version. An update copies only the path from the root to the change; everything else is shared between versions.',
  settings: [],
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
      placeholder: 'e.g. 42, or a version number to view',
      maxLength: 200,
      sample: '50',
      parse: parseKey,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'delete', label: 'Delete', usesInput: true, bulk: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'view', label: 'View version', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      {
        label: 'Random keys',
        make: (rng, n) => inserts(distinctKeys(rng, Math.min(n, updates))),
      },
      {
        label: 'Sorted keys (long paths to copy)',
        make: (rng, n) => inserts(ascending(distinctKeys(rng, Math.min(n, updates)))),
      },
      {
        label: 'Insert, then delete one',
        make: (rng, n) => {
          const keys = distinctKeys(rng, Math.min(n, updates - 1));
          return [...inserts(keys), ['delete', keys[0]!]];
        },
      },
      {
        label: 'Branch from an old version',
        make: (rng, n) => {
          const keys = distinctKeys(rng, Math.min(n, updates - 1));
          const half = Math.max(1, Math.floor(keys.length / 2));
          return [...inserts(keys.slice(0, -1)), ['view', half], ['insert', keys.at(-1)!]];
        },
      },
    ],
    sizes: [4, 6, 9],
  },
  explain,
  complexity: [
    {
      op: 'insert(k) or delete(k): new nodes',
      best: { cost: 'O(1)', why: 'The change is at the root: one or two new nodes.' },
      average: {
        cost: 'O(log n)',
        why: 'One copy per node on the path; on a balanced or random tree the path is O(log n) long.',
        example: 'insert-copies-path',
      },
      worst: {
        cost: 'O(n)',
        why: 'A plain BST can be a chain, and then the whole chain is copied.',
        example: 'sorted-copies-more',
      },
    },
    {
      op: 'search(k) in any version',
      best: { cost: 'O(1)', why: 'k is at that version’s root.' },
      average: {
        cost: 'O(log n)',
        why: 'An old version is a normal BST: start at its root and walk down.',
        example: 'old-versions-answer',
      },
      worst: { cost: 'O(n)', why: 'That version is a chain.', example: 'sorted-copies-more' },
    },
    {
      op: 'space for m updates',
      best: { cost: 'O(n + m)', why: 'Every change is at the root.' },
      average: {
        cost: 'O(n + m log n)',
        why: 'Each version adds one path; the rest is shared.',
        example: 'branching-versions',
      },
      worst: {
        cost: 'O(n + m·n)',
        why: 'Each update copies a chain. Still far less than a full copy per version when the tree is balanced.',
        example: 'sorted-copies-more',
      },
    },
  ],
  practice: persistentPractice(() => persistentBst),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      codeScript(calls, settings as PersistentSettings),
  },
  examples: [
    insertCopiesPath,
    branchingVersions,
    deleteShares,
    oldVersionsAnswer,
    sortedCopiesMore,
  ] as unknown as SavedExample[],
  preview: { example: 'insert-copies-path', level: 2 },
};

/**
 * Driver protocol for the code tabs. Updates apply to the version being viewed.
 *   insert k | delete k  ->  "v<new> <nodes made> <keys of the new version in preorder>" | "duplicate" | "missing"
 *   search k             ->  "found" | "missing"
 *   view v               ->  "ok <keys of v in preorder>"
 *   clear                ->  "ok"
 */
function codeScript(calls: OpCall[], settings: PersistentSettings) {
  const t = new Timeline(persistentBst, { ...settings, ...defaults }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const preorder = (s: PersistentState, root: number | null) => {
    const out: number[] = [];
    const walk = (u: number | null) => {
      if (u === null) return;
      out.push(s.nodes[u]!.key);
      walk(s.nodes[u]!.left);
      walk(s.nodes[u]!.right);
    };
    walk(root);
    return out;
  };
  t.entries.forEach((e, i) => {
    const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
    const s = e.end;
    const [op, raw] = e.call;
    if (op === 'clear') {
      input.push('clear');
      expected.push('ok');
      return;
    }
    if (op === 'view') {
      const v = parseVersion(raw!, before.versions.length);
      if (v instanceof Error) return;
      input.push(`view ${v}`);
      expected.push(['ok', ...preorder(s, s.versions[v]!.root)].join(' '));
      return;
    }
    const k = parseKey(raw!);
    if (k instanceof Error) return;
    const grew = s.versions.length > before.versions.length;
    if (op !== 'search' && !grew && before.versions.length >= MAX_VERSIONS) return; // refused: full
    input.push(`${op} ${k}`);
    if (op === 'search') {
      expected.push(e.steps.at(-1)!.vars?.found ? 'found' : 'missing');
    } else if (grew) {
      const made = Object.keys(s.nodes).length - Object.keys(before.nodes).length;
      const v = s.versions.length - 1;
      expected.push([`v${v}`, made, ...preorder(s, s.versions[v]!.root)].join(' '));
    } else {
      expected.push(op === 'insert' ? 'duplicate' : 'missing');
    }
  });
  return { input, expected };
}

export default persistentBst;
