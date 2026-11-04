import type { Rng } from '../../engine/rng';
import { Timeline, runOp } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { call, calls, distinct } from '../avl/practice';
import { preorderKeys } from '../avl/tree-kit';
import { defaults, type TreapExtra, type TreapSettings, type TreapState } from './model';

type Def = VizDef<TreapState, TreapSettings, TreapExtra>;

/**
 * Practice questions for the treap. They use typed priorities (key:priority), so the answer does
 * not depend on any random draw, and every answer comes from running the model.
 * `def` is a getter to avoid an import cycle.
 */
export function treapPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  /** n keys, each with its own priority. */
  const pairs = (rng: Rng, n: number): [number, number][] => {
    const keys = distinct(rng, n);
    const prios = distinct(rng, n, 1, 60);
    return keys.map((k, i) => [k, prios[i]!]);
  };
  const ins = (ps: [number, number][]): OpCall[] => ps.map(([k, p]) => ['insert', `${k}:${p}`]);
  const rootOf = (s: TreapState) => s.nodes[s.root!]!;

  return [
    {
      id: 'root-after',
      title: 'Which key ends up at the root?',
      make(rng) {
        const ps = pairs(rng, rng.int(4, 6));
        const setup = ins(ps.slice(0, 2));
        const ask = ins(ps.slice(2));
        const root = rootOf(run([...setup, ...ask]).endState());
        return {
          prompt: `Starting from the treap shown, run ${calls(ask)} (each insert gives a key and its priority). Which key is at the root afterwards?`,
          setup,
          answer: { kind: 'number', value: root.key },
          explain: `Smaller priorities sit higher, so the root holds the smallest priority of all: ${root.key}, with priority ${root.priority}. The insertion order does not matter.`,
          watch: ask,
        };
      },
    },
    {
      id: 'rotations',
      title: 'How many rotations?',
      make(rng) {
        const ps = pairs(rng, rng.int(5, 7));
        const setup = ins(ps.slice(0, -1));
        const t = run(setup);
        const [k, p] = ps.at(-1)!;
        const e = runOp(
          def(),
          t.endState(),
          ['insert', `${k}:${p}`],
          defaults,
          1,
          t.entries.length,
        );
        const made = e.end.rotations - t.endState().rotations;
        return {
          prompt: `Insert ${k} with priority ${p}, ${call(['insert', `${k}:${p}`])}, into the treap shown. How many rotations does it take to restore the heap order?`,
          setup,
          answer: { kind: 'number', value: made },
          explain:
            made === 0
              ? `${k} lands as a leaf under a parent whose priority is already smaller than ${p}, so nothing rotates.`
              : `${k} lands as a leaf and rotates up past every ancestor with a larger priority than ${p}: ${made} ${made === 1 ? 'rotation' : 'rotations'}.`,
          watch: [['insert', `${k}:${p}`]],
        };
      },
    },
    {
      id: 'preorder',
      title: 'Preorder of a treap',
      make(rng) {
        const ps = pairs(rng, rng.int(5, 7));
        const setup = ins(ps.slice(0, 2));
        const ask = ins(ps.slice(2));
        const order = preorderKeys(run([...setup, ...ask]).endState()).map(String);
        return {
          prompt: `Starting from the treap shown, run ${calls(ask)}. Type the keys in preorder afterwards: root, then the left subtree, then the right subtree.`,
          setup,
          answer: { kind: 'sequence', value: order },
          explain: `The keys and priorities decide the shape on their own: the smallest priority is the root, the keys smaller than it go left, the bigger ones right, and so on down. Preorder: ${order.join(' ')}.`,
          watch: ask,
        };
      },
    },
    {
      id: 'root-after-delete',
      title: 'Who replaces the root?',
      make(rng) {
        const ps = pairs(rng, rng.int(5, 7));
        const setup = ins(ps);
        const t = run(setup);
        const old = rootOf(t.endState());
        const e = runOp(def(), t.endState(), ['delete', old.key], defaults, 1, t.entries.length);
        const root = rootOf(e.end);
        return {
          prompt: `Run ${call(['delete', old.key])} on the treap shown, which removes its root. Which key is the root afterwards?`,
          setup,
          answer: { kind: 'number', value: root.key },
          explain: `${old.key} rotates down, and each time the child with the smaller priority moves up. The new root is ${root.key}, which has the smallest priority left, ${root.priority}.`,
          watch: [['delete', old.key]],
        };
      },
    },
  ];
}
