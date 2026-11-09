import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { listScript } from '../_lists/driver';
import { parseListValue } from '../linked-list/model';
import cppSource from './code/cpp/doubly_linked_list.hpp?raw';
import javaSource from './code/java/DoublyLinkedList.java?raw';
import pythonSource from './code/python/doubly_linked_list.py?raw';
import explain from './explain.md?raw';
import emptyAndOne from './examples/empty-and-one.json';
import fourUpdates from './examples/four-updates.json';
import nearerEnd from './examples/nearer-end.json';
import noSentinel from './examples/no-sentinel.json';
import removeEnds from './examples/remove-ends.json';
import reverse from './examples/reverse.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  values,
  type DExtra,
  type DSettings,
  type DState,
} from './model';
import { doublyPractice } from './practice';
import { view } from './view';

const each = (op: string, vs: Value[]): OpCall[] => vs.map((v) => [op, v] as OpCall);

export const doublyLinkedList: VizDef<DState, DSettings, DExtra> = {
  id: 'doubly-linked-list',
  title: 'Doubly linked list',
  family: 'Linked lists',
  blurb: 'Nodes that point both ways: remove from either end in O(1), with or without a sentinel.',
  settings: [
    {
      kind: 'choice',
      key: 'sentinel',
      label: 'Ends of the list',
      options: [
        { value: 'on', label: 'A sentinel node, nil (CLRS)' },
        { value: 'off', label: 'head and tail pointers' },
      ],
      help: 'A sentinel sits at both ends, so inserting and removing need no special cases for an empty list or the first and last nodes.',
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
      label: 'Value or index',
      placeholder: 'e.g. 42, or 1 2 3',
      maxLength: 60,
      parse: parseListValue,
    },
    buttons: [
      { op: 'insertTail', label: 'Insert at tail', usesInput: true, bulk: true, primary: true },
      { op: 'insertHead', label: 'Insert at head', usesInput: true, bulk: true, more: true },
      {
        op: 'insertAt',
        label: 'Insert at (i, x)',
        usesInput: true,
        args: ['an index', 'a value'],
        more: true,
      },
      { op: 'removeHead', label: 'Remove head', usesInput: false },
      { op: 'removeTail', label: 'Remove tail', usesInput: false },
      { op: 'get', label: 'Get (i)', usesInput: true, more: true },
      { op: 'search', label: 'Search', usesInput: true, more: true },
      { op: 'removeAt', label: 'Remove at (i)', usesInput: true, more: true },
      { op: 'removeValue', label: 'Remove value', usesInput: true, more: true },
      { op: 'reverse', label: 'Reverse', usesInput: false, more: true },
    ],
    random: { label: 'Insert random', make: (rng) => [['insertTail', rng.int(1, 99)]] },
    presets: [
      {
        label: 'Random values',
        make: (rng, size) =>
          each(
            'insertTail',
            Array.from({ length: size }, () => rng.int(1, 99)),
          ),
      },
      {
        label: 'Sorted',
        make: (_rng, size) =>
          each(
            'insertTail',
            Array.from({ length: size }, (_, i) => (i + 1) * 10),
          ),
      },
      {
        label: 'Built at the head (comes out reversed)',
        make: (_rng, size) =>
          each(
            'insertHead',
            Array.from({ length: size }, (_, i) => (i + 1) * 10),
          ),
      },
      {
        label: 'Duplicates',
        make: (rng, size) =>
          each(
            'insertTail',
            Array.from({ length: size }, () => rng.int(1, 3)),
          ),
      },
    ],
    sizes: [3, 5, 7],
  },
  explain,
  complexity: [
    {
      op: 'insertHead(x) and insertTail(x)',
      best: { cost: 'O(1)', why: 'Four pointer updates at one end.', example: 'empty-and-one' },
      average: { cost: 'O(1)', why: 'Both ends are one pointer away.' },
      worst: { cost: 'O(1)', why: 'No walking, however long the list.' },
    },
    {
      op: 'insertAt(i, x)',
      best: { cost: 'O(1)', why: 'i = 0 or i = n: an end.', example: 'four-updates' },
      average: { cost: 'O(n)', why: 'Walk to index i from the nearer end.' },
      worst: { cost: 'O(n)', why: 'The middle: about n / 2 hops.' },
    },
    {
      op: 'removeHead() and removeTail()',
      best: {
        cost: 'O(1)',
        why: 'The node next to the end is one prev or next away.',
        example: 'remove-ends',
      },
      average: { cost: 'O(1)', why: 'Four pointer updates.' },
      worst: { cost: 'O(1)', why: 'An empty list costs one check.', example: 'empty-and-one' },
      note: 'A singly linked list needs O(n) for removeTail. The prev pointer is what fixes it.',
    },
    {
      op: 'removeAt(i)',
      best: { cost: 'O(1)', why: 'i = 0 or i = n - 1.' },
      average: { cost: 'O(n)', why: 'Walk from the nearer end, then O(1) to unlink.' },
      worst: { cost: 'O(n)', why: 'The middle node: about n / 2 hops.' },
    },
    {
      op: 'removeValue(x) and search(x)',
      best: { cost: 'O(1)', why: 'x is the first node.' },
      average: { cost: 'O(n)', why: 'Compare values front to back.' },
      worst: { cost: 'O(n)', why: 'x is last or missing.' },
    },
    {
      op: 'get(i)',
      best: { cost: 'O(1)', why: 'i is at either end.', example: 'nearer-end' },
      average: {
        cost: 'O(n)',
        why: 'Up to n / 2 hops from the nearer end.',
        example: 'nearer-end',
      },
      worst: { cost: 'O(n)', why: 'The middle index.' },
      note: 'Walking from the nearer end halves the walk but does not change the Big-O.',
    },
    {
      op: 'reverse()',
      best: { cost: 'O(n)', why: 'Every node swaps its two pointers.', example: 'reverse' },
      average: { cost: 'O(n)', why: 'One pass.' },
      worst: { cost: 'O(n)', why: 'One pass; O(1) extra space.' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      listScript(doublyLinkedList, calls, settings as DSettings, values),
  },
  practice: doublyPractice(() => doublyLinkedList),
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fourUpdates,
    removeEnds,
    noSentinel,
    emptyAndOne,
    nearerEnd,
    reverse,
  ] as unknown as SavedExample[],
  preview: { example: 'reverse', level: 2 },
};

export default doublyLinkedList;
