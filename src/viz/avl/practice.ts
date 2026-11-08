import type { Rng } from '../../engine/rng';
import { Timeline, runOp } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, type AVLExtra, type AVLSettings, type AVLState } from './model';
import { call, calls, distinct, pick } from '../_bst/practice-kit';
import { inorderKeys, preorderKeys, treeHeight } from '../_bst/tree-kit';

type Def = VizDef<AVLState, AVLSettings, AVLExtra>;

const CASES = [
  ['none', 'No rotation'],
  ['LL', 'LL: one right rotation'],
  ['RR', 'RR: one left rotation'],
  ['LR', 'LR: rotate left, then right'],
  ['RL', 'RL: rotate right, then left'],
] as const;

/**
 * Practice questions for the AVL tree. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function avlPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  /** Run one more operation after `t` without rebuilding it. */
  const then = (t: Timeline<AVLState, AVLSettings, AVLExtra>, c: OpCall) =>
    runOp(def(), t.endState(), c, defaults, 1, t.entries.length);
  const randomTree = (rng: Rng, lo: number, hi: number): OpCall[] =>
    distinct(rng, rng.int(lo, hi)).map((k) => ['insert', k]);

  return [
    {
      id: 'rotation-case',
      title: 'Which rotation does it need?',
      make(rng) {
        const setup = randomTree(rng, 5, 8);
        const t = run(setup);
        const there = new Set(inorderKeys(t.endState()));
        // Sort every key that is not in the tree by the case its insert runs into.
        const byCase = new Map<string, { k: number; say: string }[]>();
        for (let k = 1; k <= 99; k++) {
          if (there.has(k)) continue;
          const steps = then(t, ['insert', k]).steps;
          const named = steps.find((s) => s.vars?.case !== undefined);
          const kind = named ? String(named.vars!.case) : 'none';
          byCase.set(kind, [...(byCase.get(kind) ?? []), { k, say: named?.say ?? '' }]);
        }
        const rotating = [...byCase.keys()].filter((c) => c !== 'none');
        const kind =
          rotating.length && (rng.int(0, 4) > 0 || !byCase.has('none'))
            ? pick(rng, rotating)
            : 'none';
        const { k, say } = pick(rng, byCase.get(kind)!);
        const options = CASES.map(([, label]) => label);
        return {
          prompt: `Insert ${k} into the AVL tree shown. Which rotation does the walk back up need?`,
          setup,
          answer: { kind: 'choice', options, correct: CASES.findIndex(([c]) => c === kind) },
          explain:
            kind === 'none'
              ? `Every node on the way back up from ${k} stays within one level of balance, so no rotation is needed.`
              : say,
          watch: [['insert', k]],
        };
      },
    },
    {
      id: 'height-after',
      title: 'How tall is it now?',
      make(rng) {
        const setup = randomTree(rng, 2, 3);
        const there = new Set(setup.map(([, k]) => Number(k)));
        const fresh = distinct(rng, 9)
          .filter((k) => !there.has(k))
          .slice(0, rng.int(4, 6));
        const sorted = [...fresh].sort((a, b) => a - b);
        const order = rng.int(0, 2);
        const keys = order === 0 ? sorted : order === 1 ? sorted.reverse() : fresh;
        const ask: OpCall[] = keys.map((k) => ['insert', k]);
        const t = run([...setup, ...ask]);
        const end = t.endState();
        const h = treeHeight(end);
        const made = end.rotations - run(setup).endState().rotations;
        return {
          prompt: `Starting from the tree shown, run ${calls(ask)}. What is the height of the tree afterwards? A leaf has height 0.`,
          setup,
          answer: { kind: 'number', value: h },
          explain: `The tree ends up with ${inorderKeys(end).length} keys and height ${h}, with ${end.nodes[end.root!]!.key} at the root. The inserts made ${made} ${made === 1 ? 'rotation' : 'rotations'} on the way.`,
          watch: ask,
        };
      },
    },
    {
      id: 'root-after',
      title: 'Which key ends up at the root?',
      make(rng) {
        const setup = randomTree(rng, 4, 6);
        const there = inorderKeys(run(setup).endState());
        const fresh = distinct(rng, 8).filter((k) => !there.includes(k));
        const ask: OpCall[] = [
          ['insert', fresh[0]!],
          ['delete', pick(rng, there)],
          ['insert', fresh[1]!],
        ];
        const end = run([...setup, ...ask]).endState();
        const root = end.nodes[end.root!]!.key;
        return {
          prompt: `Starting from the tree shown, run ${calls(ask)}. Which key is at the root afterwards? A node with two children is replaced by its successor.`,
          setup,
          answer: { kind: 'number', value: root },
          explain: `${root} ends up at the root. The root only changes when a rotation happens at the root or when the root itself is deleted.`,
          watch: ask,
        };
      },
    },
    {
      id: 'preorder-after-delete',
      title: 'Preorder after a delete',
      make(rng) {
        const setup = randomTree(rng, 6, 9);
        const t = run(setup);
        const keys = inorderKeys(t.endState());
        const rotating = keys.filter((k) => {
          const e = then(t, ['delete', k]);
          return e.end.rotations > t.endState().rotations;
        });
        const k = rotating.length && rng.int(0, 2) > 0 ? pick(rng, rotating) : pick(rng, keys);
        const e = then(t, ['delete', k]);
        const made = e.end.rotations - t.endState().rotations;
        const order = preorderKeys(e.end).map(String);
        return {
          prompt: `Run ${call(['delete', k])} on the tree shown (a node with two children is replaced by its successor). Type the keys in preorder afterwards: root, then the left subtree, then the right subtree.`,
          setup,
          answer: { kind: 'sequence', value: order },
          explain: `After the delete${made ? ` and ${made === 1 ? 'one rotation' : `${made} rotations`}` : ', with no rotation needed,'} the tree in preorder is ${order.join(' ')}.`,
          watch: [['delete', k]],
        };
      },
    },
  ];
}
