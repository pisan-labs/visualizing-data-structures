import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { treePresets } from '../_multiway/presets';
import cppSource from './code/cpp/skip_list.hpp?raw';
import javaSource from './code/java/SkipList.java?raw';
import pythonSource from './code/python/skip_list.py?raw';
import explain from './explain.md?raw';
import build from './examples/build.json';
import deleteTallest from './examples/delete-tallest.json';
import flatList from './examples/flat-list.json';
import quarter from './examples/quarter.json';
import searchPath from './examples/search-path.json';
import tallTower from './examples/tall-tower.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  keysOf,
  MAX_LEVEL,
  ops,
  parseKey,
  pseudocode,
  type SkipExtra,
  type SkipSettings,
  type SLState,
} from './model';
import { skipPractice } from './practice';
import { view } from './view';

/** Keys are numbers; anything else is refused with a reason. */
export function parseKeyInput(token: string): Value | Error {
  return parseKey(token);
}

export const skipList: VizDef<SLState, SkipSettings, SkipExtra> = {
  id: 'skip-list',
  title: 'Skip list',
  family: 'Trees',
  blurb:
    'A sorted linked list with express lanes: coin flips decide how tall each node is, and a search runs right on a high lane, then drops down.',
  settings: [
    {
      kind: 'choice',
      key: 'p',
      label: 'Chance that a coin flip adds a level',
      options: [
        { value: '1/2', label: 'p = 1/2 (a fair coin)' },
        { value: '1/4', label: 'p = 1/4 (shorter towers, fewer pointers)' },
      ],
    },
    { kind: 'number', key: 'maxLevel', label: 'Maximum level', min: 2, max: MAX_LEVEL },
    {
      kind: 'choice',
      key: 'draw',
      label: 'Draw the list',
      options: [
        { value: 'across', label: 'Across: keys left to right' },
        { value: 'down', label: 'Down: keys top to bottom (fits a phone)' },
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
    sizes: [6, 10, 14],
  },
  explain,
  practice: skipPractice(() => skipList),
  complexity: [
    {
      op: 'search(k)',
      best: {
        cost: 'O(1)',
        why: 'k is the first key on the top level: one comparison and a short way down.',
        example: 'search-path',
      },
      average: {
        cost: 'O(log n)',
        why: 'Expected: about log₂ n levels with p = 1/2, and on each level about 1/p moves right before dropping down.',
        example: 'search-path',
      },
      worst: {
        cost: 'O(n)',
        why: 'If every coin comes up tails, every node is 1 level tall and search walks the whole list. It is possible, just very unlikely.',
        example: 'flat-list',
      },
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(1)',
        why: 'The list is empty or k goes first, and the first flip is tails.',
        example: 'build',
      },
      average: {
        cost: 'O(log n)',
        why: 'A search to find the spot, about 1 / (1 - p) flips, and one pointer change per level of the new node.',
        example: 'build',
      },
      worst: {
        cost: 'O(n)',
        why: 'The search that finds the spot can walk the whole list when the towers are flat.',
        example: 'flat-list',
      },
    },
    {
      op: 'delete(k)',
      best: {
        cost: 'O(1)',
        why: 'k is first in the list: a short search and a pointer change per level.',
      },
      average: {
        cost: 'O(log n)',
        why: 'Expected: the same search as insert, then one pointer change per level of k.',
        example: 'delete-tallest',
      },
      worst: {
        cost: 'O(n)',
        why: 'The search can walk the whole list when the towers are flat.',
        example: 'flat-list',
      },
      note: 'Space: n / (1 - p) pointers on average, so 2n with p = 1/2 and about 1.33n with p = 1/4.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SkipSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    build,
    searchPath,
    deleteTallest,
    tallTower,
    quarter,
    flatList,
  ] as unknown as SavedExample[],
  preview: { example: 'build', level: 2, hide: ['arg-box', 'cell-arg'] },
};

/**
 * Driver protocol for the code tabs. The heights come from each language's own random numbers,
 * so the results depend only on which keys the list holds:
 *   insert k  ->  "ok" and the keys in order  |  "duplicate"
 *   delete k  ->  "ok" and the keys in order  |  "missing"
 *   search k  ->  "found" | "missing"
 *   clear     ->  "ok"
 */
function codeScript(calls: OpCall[], settings: SkipSettings) {
  const t = new Timeline(skipList, settings, 1, calls);
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

export default skipList;
