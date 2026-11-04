import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/linked_list.hpp?raw';
import javaSource from './code/java/SinglyLinkedList.java?raw';
import pythonSource from './code/python/linked_list.py?raw';
import explain from './explain.md?raw';
import boundaries from './examples/boundaries.json';
import emptyAndOne from './examples/empty-and-one.json';
import headOrder from './examples/head-order.json';
import middle from './examples/middle.json';
import noTail from './examples/no-tail.json';
import removeTail from './examples/remove-tail.json';
import reverse from './examples/reverse.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseListValue,
  pseudocode,
  values,
  type ListExtra,
  type ListSettings,
  type ListState,
} from './model';
import { listScript } from './driver';
import { listPractice } from './practice';
import { view } from './view';

const each = (op: string, vs: Value[]): OpCall[] => vs.map((v) => [op, v] as OpCall);

export const linkedList: VizDef<ListState, ListSettings, ListExtra> = {
  id: 'linked-list',
  title: 'Singly linked list',
  family: 'Linked lists',
  blurb:
    'Nodes that point to the next node: insert, remove, search and reverse by moving pointers.',
  settings: [
    {
      kind: 'choice',
      key: 'tail',
      label: 'Pointers into the list',
      options: [
        { value: 'on', label: 'head and tail' },
        { value: 'off', label: 'head only' },
      ],
      help: 'A tail pointer makes insert at the tail O(1). Without one, it walks the whole list.',
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
      { op: 'insertHead', label: 'Insert at head', usesInput: true, bulk: true },
      { op: 'removeHead', label: 'Remove head', usesInput: false },
      { op: 'removeTail', label: 'Remove tail', usesInput: false },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'reverse', label: 'Reverse', usesInput: false },
      {
        op: 'insertAt',
        label: 'Insert at (i, x)',
        usesInput: true,
        args: ['an index', 'a value'],
        more: true,
      },
      { op: 'removeAt', label: 'Remove at (i)', usesInput: true, more: true },
      { op: 'removeValue', label: 'Remove value', usesInput: true, more: true },
      { op: 'get', label: 'Get (i)', usesInput: true, more: true },
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
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'insertHead(x)',
      best: { cost: 'O(1)', why: 'Make a node and change two pointers.', example: 'head-order' },
      average: { cost: 'O(1)', why: 'The front is always one pointer away.' },
      worst: { cost: 'O(1)', why: 'Nothing else in the list is touched, however long it is.' },
    },
    {
      op: 'insertTail(x) with a tail pointer',
      best: { cost: 'O(1)', why: 'tail leads straight to the last node.', example: 'reverse' },
      average: { cost: 'O(1)', why: 'Two pointer changes, whatever the size.' },
      worst: { cost: 'O(1)', why: 'No walking at all.' },
    },
    {
      op: 'insertTail(x) with head only',
      best: { cost: 'O(1)', why: 'An empty list: the new node just becomes head.' },
      average: { cost: 'O(n)', why: 'Walk n - 1 hops to find the last node.', example: 'no-tail' },
      worst: { cost: 'O(n)', why: 'Every insert walks the whole list.', example: 'no-tail' },
    },
    {
      op: 'insertAt(i, x)',
      best: { cost: 'O(1)', why: 'i = 0: same as insertHead.', example: 'boundaries' },
      average: {
        cost: 'O(n)',
        why: 'Walk i - 1 hops to the node before position i.',
        example: 'middle',
      },
      worst: { cost: 'O(n)', why: 'i = n walks to the last node.', example: 'boundaries' },
    },
    {
      op: 'removeHead()',
      best: { cost: 'O(1)', why: 'Move head one node along.', example: 'empty-and-one' },
      average: { cost: 'O(1)', why: 'Only head (and maybe tail) change.' },
      worst: { cost: 'O(1)', why: 'An empty list costs one check.', example: 'empty-and-one' },
    },
    {
      op: 'removeTail()',
      best: {
        cost: 'O(1)',
        why: 'One node: head and tail both become null.',
        example: 'empty-and-one',
      },
      average: { cost: 'O(n)', why: 'Walk to the node before the last.', example: 'remove-tail' },
      worst: {
        cost: 'O(n)',
        why: 'n - 2 hops, even with a tail pointer: nodes only point forward.',
        example: 'remove-tail',
      },
    },
    {
      op: 'removeAt(i) and removeValue(x)',
      best: { cost: 'O(1)', why: 'The node is at the head.' },
      average: { cost: 'O(n)', why: 'Walk prev and cur to the node first.', example: 'middle' },
      worst: { cost: 'O(n)', why: 'The last node, or a value that is not there.' },
      note: 'The unlinking itself is O(1): one pointer change. Finding the node is what costs.',
    },
    {
      op: 'search(x) and get(i)',
      best: { cost: 'O(1)', why: 'x is at the head, or i = 0.', example: 'boundaries' },
      average: { cost: 'O(n)', why: 'Follow next pointers one at a time.' },
      worst: { cost: 'O(n)', why: 'x is missing or last; i = n - 1.', example: 'empty-and-one' },
      note: 'No jumping to the middle: a linked list has no index arithmetic.',
    },
    {
      op: 'reverse()',
      best: { cost: 'O(n)', why: 'Every next pointer has to turn around.', example: 'reverse' },
      average: { cost: 'O(n)', why: 'One pass with three pointers.' },
      worst: { cost: 'O(n)', why: 'One pass; O(1) extra space.' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      listScript(linkedList, calls, settings as ListSettings, values),
  },
  practice: listPractice(() => linkedList),
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    reverse,
    headOrder,
    noTail,
    removeTail,
    emptyAndOne,
    middle,
    boundaries,
  ] as unknown as SavedExample[],
};

export default linkedList;
