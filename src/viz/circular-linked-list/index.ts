import { Timeline, type Entry } from '../../engine/timeline';
import type { OpCall, SavedExample, Value, VizDef } from '../../engine/types';
import { parseListValue } from '../linked-list/model';
import cppSource from './code/cpp/circular_list.hpp?raw';
import javaSource from './code/java/CircularLinkedList.java?raw';
import pythonSource from './code/python/circular_list.py?raw';
import explain from './explain.md?raw';
import backIsFront from './examples/back-is-front.json';
import oneNode from './examples/one-node.json';
import queue from './examples/queue.json';
import rotate from './examples/rotate.json';
import search from './examples/search.json';
import traverse from './examples/traverse.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type CExtra,
  type CSettings,
  type CState,
} from './model';
import { circularPractice } from './practice';
import { view } from './view';

const each = (op: string, vs: Value[]): OpCall[] => vs.map((v) => [op, v] as OpCall);

export const circularLinkedList: VizDef<CState, CSettings, CExtra> = {
  id: 'circular-linked-list',
  title: 'Circular linked list',
  family: 'Linked lists',
  blurb: 'The last node points back to the first, and one tail pointer reaches both ends.',
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
      label: 'Value',
      placeholder: 'e.g. 42, or 1 2 3',
      maxLength: 60,
      parse: parseListValue,
    },
    buttons: [
      { op: 'insertBack', label: 'Insert at back', usesInput: true, bulk: true, primary: true },
      { op: 'insertFront', label: 'Insert at front', usesInput: true, bulk: true },
      { op: 'removeFront', label: 'Remove front', usesInput: false },
      { op: 'rotate', label: 'Rotate', usesInput: false },
      { op: 'traverse', label: 'Traverse', usesInput: false },
      { op: 'search', label: 'Search', usesInput: true },
    ],
    random: { label: 'Insert random', make: (rng) => [['insertBack', rng.int(1, 99)]] },
    presets: [
      {
        label: 'Random values',
        make: (rng, size) =>
          each(
            'insertBack',
            Array.from({ length: size }, () => rng.int(1, 99)),
          ),
      },
      {
        label: 'Sorted',
        make: (_rng, size) =>
          each(
            'insertBack',
            Array.from({ length: size }, (_, i) => (i + 1) * 10),
          ),
      },
      {
        label: 'Built at the front (comes out reversed)',
        make: (_rng, size) =>
          each(
            'insertFront',
            Array.from({ length: size }, (_, i) => (i + 1) * 10),
          ),
      },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'insertFront(x) and insertBack(x)',
      best: { cost: 'O(1)', why: 'Two pointer changes next to tail.', example: 'back-is-front' },
      average: { cost: 'O(1)', why: 'insertBack is insertFront plus one more assignment.' },
      worst: { cost: 'O(1)', why: 'No walking, however long the circle.' },
    },
    {
      op: 'removeFront()',
      best: { cost: 'O(1)', why: 'tail.next skips one node.', example: 'queue' },
      average: { cost: 'O(1)', why: 'The front is always tail.next.' },
      worst: { cost: 'O(1)', why: 'The one-node case sets tail to null.', example: 'one-node' },
      note: 'Removing the back would be O(n): tail cannot tell us which node points at it.',
    },
    {
      op: 'rotate()',
      best: { cost: 'O(1)', why: 'tail = tail.next.', example: 'rotate' },
      average: { cost: 'O(1)', why: 'One assignment; no node moves.' },
      worst: { cost: 'O(1)', why: 'The same one assignment.' },
    },
    {
      op: 'traverse()',
      best: { cost: 'O(n)', why: 'Every node is visited once.', example: 'traverse' },
      average: { cost: 'O(n)', why: 'Once around the circle.' },
      worst: { cost: 'O(n)', why: 'It stops when it gets back to the front.' },
    },
    {
      op: 'search(x)',
      best: { cost: 'O(1)', why: 'x is at the front.' },
      average: { cost: 'O(n)', why: 'Compare node by node.', example: 'search' },
      worst: { cost: 'O(n)', why: 'x is missing: all the way around.', example: 'search' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[]) => codeScript(calls),
  },
  practice: circularPractice(() => circularLinkedList),
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [backIsFront, rotate, traverse, oneNode, search, queue] as unknown as SavedExample[],
};

/** The driver's line for one operation, read off the model's last step. */
function result(e: Entry<CState, CExtra>): string {
  const last = e.steps[e.steps.length - 1]!;
  switch (e.call[0]) {
    case 'removeFront':
      return last.lines.includes('removeFront.error') ? 'empty' : String(last.vars?.returned);
    case 'traverse':
      return String(last.vars?.visited ?? '') || 'empty';
    case 'search':
      return String(last.vars?.returned);
    default:
      return 'ok';
  }
}

/**
 * Driver protocol for the code tabs: one operation per line, then a final traverse.
 * Results: inserts and rotate -> ok; removeFront -> the value | empty;
 * traverse -> the values from the front, or "empty"; search -> the index or -1.
 */
function codeScript(calls: OpCall[]) {
  const all: OpCall[] = [...calls, ['traverse']];
  const t = new Timeline(circularLinkedList, defaults, 1, all);
  return { input: all.map((c) => c.join(' ')), expected: t.entries.map(result) };
}

export default circularLinkedList;
