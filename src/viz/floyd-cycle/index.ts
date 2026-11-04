import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, VizDef } from '../../engine/types';
import cppSource from './code/cpp/floyd.hpp?raw';
import javaSource from './code/java/Floyd.java?raw';
import pythonSource from './code/python/floyd.py?raw';
import explain from './explain.md?raw';
import fullCycle from './examples/full-cycle.json';
import longTail from './examples/long-tail.json';
import noCycle from './examples/no-cycle.json';
import rho from './examples/rho.json';
import selfLoop from './examples/self-loop.json';
import tiny from './examples/tiny.json';
import {
  defaults,
  describe,
  formatSpec,
  init,
  initialSay,
  MAX_NODES,
  ops,
  parseInput,
  parseSpec,
  pseudocode,
  type FExtra,
  type FSettings,
  type FState,
} from './model';
import { floydPractice } from './practice';
import { view } from './view';

/** A build call for values 1..n whose last node links back to index k (or nowhere). */
const list = (n: number, k: number | null): OpCall[] => [
  ['build', formatSpec({ values: Array.from({ length: n }, (_, i) => i + 1), loopAt: k })],
];

export const floydCycle: VizDef<FState, FSettings, FExtra> = {
  id: 'floyd-cycle',
  title: 'Cycle detection (tortoise and hare)',
  family: 'Linked lists',
  blurb:
    "Floyd's algorithm: two pointers at different speeds find a cycle, where it starts and how long it is.",
  settings: [],
  defaults,
  init,
  initialSay,
  ops,
  pseudocode,
  view,
  describe,
  controls: {
    input: {
      label: 'List',
      placeholder: 'e.g. 1 2 3 4 5 6 @2',
      maxLength: 80,
      sample: '1 2 3 4 5 @1',
      parse: parseInput,
    },
    buttons: [
      { op: 'build', label: 'Build', usesInput: true, primary: true },
      { op: 'detect', label: 'Detect cycle', usesInput: false },
    ],
    random: {
      label: 'Random list',
      make: (rng) => {
        const n = rng.int(3, MAX_NODES);
        return list(n, rng.int(0, 3) === 0 ? null : rng.int(0, n - 1));
      },
    },
    presets: [
      { label: 'A tail and a cycle', make: (_rng, size) => list(size, Math.floor(size / 3)) },
      { label: 'The whole list is a cycle', make: (_rng, size) => list(size, 0) },
      { label: 'Long tail, short cycle', make: (_rng, size) => list(size, size - 2) },
      { label: 'A node that points at itself', make: (_rng, size) => list(size, size - 1) },
      { label: 'No cycle', make: (_rng, size) => list(size, null) },
      {
        label: 'Random',
        make: (rng, size) => list(size, rng.int(0, 3) === 0 ? null : rng.int(0, size - 1)),
      },
    ],
    sizes: [4, 7, 10],
  },
  explain,
  complexity: [
    {
      op: 'detect() when there is a cycle',
      best: {
        cost: 'O(1)',
        why: 'One node pointing at itself: they meet after one step.',
        example: 'tiny',
      },
      average: { cost: 'O(n)', why: 'Each phase takes at most about μ + λ steps.', example: 'rho' },
      worst: {
        cost: 'O(n)',
        why: 'A long tail: the tortoise has to walk all of it first.',
        example: 'long-tail',
      },
    },
    {
      op: 'detect() when there is none',
      best: {
        cost: 'O(1)',
        why: 'An empty list or one node: fast stops at once.',
        example: 'tiny',
      },
      average: {
        cost: 'O(n)',
        why: 'The hare reaches null after about n / 2 steps.',
        example: 'no-cycle',
      },
      worst: { cost: 'O(n)', why: 'Still n / 2 steps of two pointers.' },
    },
    {
      op: 'Extra space',
      best: { cost: 'O(1)', why: 'Two pointers and two counters.' },
      average: { cost: 'O(1)', why: 'Nothing grows with the list.' },
      worst: { cost: 'O(1)', why: 'Even for a cycle of any length.', example: 'full-cycle' },
      note: 'Remembering every visited node in a hash set also works, in O(n) time but O(n) space.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[]) => codeScript(calls),
  },
  practice: floydPractice(() => floydCycle),
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [rho, noCycle, fullCycle, selfLoop, tiny, longTail] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "build 1 2 3 4 @1" (values, then @ and the index the
 * last node links back to) prints ok; "detect" prints "mu lambda", or "none" without a cycle.
 * Builds the model rejects never reach the drivers.
 */
function codeScript(calls: OpCall[]) {
  const usable = calls.flatMap((c): OpCall[] => {
    if (c[0] !== 'build') return [c];
    const spec = parseSpec(String(c[1] ?? ''));
    return spec instanceof Error ? [] : [['build', formatSpec(spec)]];
  });
  const t = new Timeline(floydCycle, defaults, 1, usable);
  const expected = t.entries.map((e) => {
    if (e.call[0] === 'build') return 'ok';
    const v = e.steps[e.steps.length - 1]!.vars ?? {};
    return v.cycle ? `${v['μ']} ${v['λ']}` : 'none';
  });
  return { input: usable.map((c) => c.join(' ')), expected };
}

export default floydCycle;
