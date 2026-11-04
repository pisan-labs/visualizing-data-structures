import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import {
  defaults,
  formatLevelOrder,
  type BTExtra,
  type BTSettings,
  type BTState,
  type Order,
  type Token,
} from './model';
import { randomTreeList } from './shapes';

type Def = VizDef<BTState, BTSettings, BTExtra>;
type Walk = Order | 'levelorder';

const NAME: Record<Walk, string> = {
  preorder: 'preorder',
  inorder: 'inorder',
  postorder: 'postorder',
  levelorder: 'level order',
};

const HOW: Record<Walk, string> = {
  preorder: 'Preorder writes each node before its subtrees, left subtree first.',
  inorder: 'Inorder writes the left subtree, then the node, then the right subtree.',
  postorder: 'Postorder writes both subtrees, left then right, and the node last.',
  levelorder: 'Level order goes row by row, left to right.',
};

/** "a", "a and b", "a, b and c". */
const and = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Level-order list of the model's tree, optionally mirrored (left and right swapped). */
function listOf(s: BTState, mirror: boolean): string {
  if (s.root === null) return '_';
  const out: Token[] = [];
  const queue: (number | null)[] = [s.root];
  while (queue.length) {
    const u = queue.shift()!;
    if (u === null) {
      out.push(null);
      continue;
    }
    const n = s.nodes[u]!;
    out.push(n.value);
    queue.push(...(mirror ? [n.right, n.left] : [n.left, n.right]));
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return formatLevelOrder(out);
}

/** The array (heap) layout, where even the gaps under a gap get written: a common mix-up. */
function heapList(s: BTState): string {
  const slots: Token[] = [];
  const place = (u: number | null, i: number) => {
    if (u === null) return;
    while (slots.length <= i) slots.push(null);
    const n = s.nodes[u]!;
    slots[i] = n.value;
    place(n.left, 2 * i + 1);
    place(n.right, 2 * i + 2);
  };
  place(s.root, 0);
  return formatLevelOrder(slots);
}

/**
 * Practice questions for binary trees. Every answer comes from running the model, so it always
 * agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function binaryTreePractice(def: () => Def): PracticeKind[] {
  const recursive: BTSettings = { ...defaults, mode: 'recursive' };
  const run = (cs: OpCall[]) => new Timeline(def(), recursive, 1, cs);
  const tree = (rng: Rng, lo: number, hi: number): OpCall[] => [
    ['build', randomTreeList(rng, rng.int(lo, hi))],
  ];
  /** The steps of the last operation. */
  const lastOp = (cs: OpCall[]): Step<BTState, BTExtra>[] => {
    const t = run(cs);
    return t.entries[t.entries.length - 1]!.steps;
  };

  return [
    {
      id: 'traversal',
      title: 'Write down a traversal',
      make(rng) {
        const setup = tree(rng, 5, 7);
        const walk = (['preorder', 'inorder', 'postorder', 'levelorder'] as const)[rng.int(0, 3)]!;
        const steps = lastOp([...setup, [walk]]);
        const out = String(steps[steps.length - 1]!.vars?.output ?? '')
          .split(' ')
          .filter(Boolean);
        return {
          prompt: `Type the ${NAME[walk]} of the tree shown, separated by spaces.`,
          setup,
          settings: recursive,
          answer: { kind: 'sequence', value: out },
          explain: `${HOW[walk]} The ${NAME[walk]} is \`${out.join(' ')}\`.`,
          watch: [[walk]],
        };
      },
    },
    {
      id: 'which-list',
      title: 'Which list builds this tree?',
      make(rng) {
        const setup = tree(rng, 4, 7);
        const s = run(setup).endState();
        const correct = listOf(s, false);
        const wrong = [listOf(s, true), heapList(s), correct.replace(/ _/g, '')].filter(
          (c, i, all) => c !== correct && all.indexOf(c) === i,
        );
        const options = shuffle(rng, [correct, ...wrong]);
        return {
          prompt: 'Which level-order list builds the tree shown? `_` marks a missing child.',
          setup,
          settings: recursive,
          answer: { kind: 'choice', options, correct: options.indexOf(correct) },
          explain: `Read the tree level by level, left to right, and write \`_\` for each missing child of a real node: \`${correct}\`. A gap has no children, so nothing is written under it.`,
          watch: [['build', correct]],
        };
      },
    },
    {
      id: 'stack-depth',
      title: 'How deep does the call stack get?',
      make(rng) {
        const setup = tree(rng, 5, 8);
        const walk = (['preorder', 'inorder', 'postorder'] as const)[rng.int(0, 2)]!;
        const steps = lastOp([...setup, [walk]]);
        const deepest = Math.max(
          ...steps.map((st) => (st.extra?.frames ?? []).filter((f) => f.uid !== null).length),
        );
        const height = Number(steps[0]!.vars?.height);
        return {
          prompt: `A recursive ${walk} walks the tree shown. At its deepest point, how many calls are on the call stack? Count the calls on nodes, not the calls on nil.`,
          setup,
          settings: recursive,
          answer: { kind: 'number', value: deepest },
          explain: `The calls on the stack always form one path down from the root. The tree has height ${height}, so its longest path has ${deepest} nodes, and the stack peaks at ${deepest} calls whatever the order.`,
          watch: [[walk]],
        };
      },
    },
    {
      id: 'queue-peak',
      title: 'How full does the queue get?',
      make(rng) {
        const setup = tree(rng, 6, 9);
        const steps = lastOp([...setup, ['levelorder']]);
        let busiest: number[] = [];
        for (const st of steps) {
          const queue = st.extra?.queue ?? [];
          if (queue.length > busiest.length) busiest = queue;
        }
        const s = steps[0]!.state;
        const names = busiest.map((u) => String(s.nodes[u]!.value));
        const n = busiest.length;
        return {
          prompt:
            'Level order walks the tree shown with a queue. What is the largest number of nodes waiting in the queue at the same time?',
          setup,
          settings: recursive,
          answer: { kind: 'number', value: n },
          explain: `A node's children join the back of the queue as soon as the node is visited. At the busiest moment ${and(names)} ${n === 1 ? 'is' : 'are'} waiting: ${n} ${n === 1 ? 'node' : 'nodes'}.`,
          watch: [['levelorder']],
        };
      },
    },
  ];
}
