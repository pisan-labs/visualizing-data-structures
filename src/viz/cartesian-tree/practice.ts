import type { Rng } from '../../engine/rng';
import { Timeline, runOp } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { call, calls, distinct } from '../_bst/practice-kit';
import { preorderKeys } from '../_bst/tree-kit';
import {
  defaults,
  type CartesianExtra,
  type CartesianSettings,
  type CartesianState,
} from './model';

type Def = VizDef<CartesianState, CartesianSettings, CartesianExtra>;

/**
 * Practice for the Cartesian tree. Every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function cartesianPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const appends = (xs: number[]): OpCall[] => xs.map((x) => ['append', x]);
  const after = (setup: OpCall[], c: OpCall) => {
    const t = run(setup);
    return runOp(def(), t.endState(), c, defaults, 1, t.entries.length);
  };

  return [
    {
      id: 'pops',
      title: 'How many pops?',
      make(rng: Rng) {
        const xs = distinct(rng, rng.int(5, 7), 1, 60);
        const setup = appends(xs.slice(0, -1));
        const x = xs.at(-1)!;
        const before = run(setup).endState();
        const e = after(setup, ['append', x]);
        const pops = e.end.pops - before.pops;
        return {
          prompt: `The array and its Cartesian tree are shown (smallest value on top). Run ${call(['append', x])}. How many nodes does it pop off the stack?`,
          setup,
          answer: { kind: 'number', value: pops },
          explain:
            pops === 0
              ? `The top of the stack is already smaller than ${x}, so nothing is popped: ${x} becomes the right child of the last node on the right spine.`
              : `The stack is the right spine. Every node on it bigger than ${x} is popped, from the bottom of the drawing up: ${pops} of them. The last one popped becomes ${x}'s left child.`,
          watch: [['append', x]],
        };
      },
    },
    {
      id: 'root',
      title: 'Which value is the root?',
      make(rng: Rng) {
        const xs = distinct(rng, rng.int(5, 8), 1, 99);
        const setup = appends(xs.slice(0, 2));
        const ask = appends(xs.slice(2));
        const s = run([...setup, ...ask]).endState();
        const root = s.nodes[s.root!]!;
        return {
          prompt: `Starting from the array shown, run ${calls(ask)}. Which value is at the root of the Cartesian tree?`,
          setup,
          answer: { kind: 'number', value: root.key },
          explain: `The root of a Cartesian tree (smallest on top) is the smallest value in the whole array: ${root.key}. Everything left of it in the array is in its left subtree, everything right of it in its right subtree.`,
          watch: ask,
        };
      },
    },
    {
      id: 'preorder',
      title: 'Preorder of a Cartesian tree',
      make(rng: Rng) {
        const xs = distinct(rng, rng.int(5, 7), 1, 99);
        const setup: OpCall[] = [];
        const ask = appends(xs);
        const order = preorderKeys(run(ask).endState()).map(String);
        return {
          prompt: `Build the Cartesian tree of the array ${xs.join(', ')} (smallest value on top). Type its values in preorder: root, then the left subtree, then the right subtree.`,
          setup,
          answer: { kind: 'sequence', value: order },
          explain: `The smallest value is the root; the part of the array left of it builds the left subtree and the part right of it the right subtree, by the same rule. Preorder: ${order.join(' ')}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'rmq',
      title: 'Range minimum as a common ancestor',
      make(rng: Rng) {
        const xs = distinct(rng, rng.int(6, 8), 1, 99);
        const setup = appends(xs);
        const i = rng.int(0, xs.length - 2);
        const j = rng.int(i + 1, xs.length - 1);
        const e = after(setup, ['rmq', i, j]);
        const v = e.steps.at(-1)!.vars!;
        const visited = Number(v.visited);
        return {
          prompt: `In the Cartesian tree shown, run ${call(['rmq', i, j])}: walk down from the root until a node's index is between ${i} and ${j}. How many nodes does the walk visit, that last node included?`,
          setup,
          answer: { kind: 'number', value: visited },
          explain: `The walk goes right while the node is left of the range and left while it is right of it. It stops at A[${String(v.index)}] = ${String(v.min)}, the common ancestor of A[${i}] and A[${j}] and the smallest value between them, after visiting ${visited} ${visited === 1 ? 'node' : 'nodes'}.`,
          watch: [['rmq', i, j]],
        };
      },
    },
  ];
}
