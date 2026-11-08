import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { defaults, preorder, type PairExtra, type PairSettings, type PairState } from './model';

type Def = VizDef<PairState, PairSettings, PairExtra>;

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 99));
  return [...out];
}

/**
 * Practice for pairing heaps (two-pass). Every answer comes from running the model. `def` is a
 * getter to avoid an import cycle.
 */
export function pairingPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  /** A heap whose root has several children: a few small keys inserted after some large ones. */
  const setupOf = (rng: Rng, lo: number, hi: number): OpCall[] =>
    distinct(rng, rng.int(lo, hi)).map((k) => ['insert', k] as OpCall);
  const rootKids = (s: PairState) =>
    s.roots.length ? s.nodes[s.roots[0]!]!.kids.map((u) => String(s.nodes[u]!.key)) : [];

  return [
    {
      id: 'links-in-delete',
      title: 'How many links does deleteMin make?',
      make(rng) {
        const setup = setupOf(rng, 5, 9);
        const t = run([...setup, ['deleteMin']]);
        const links = Number(t.entries.at(-1)!.steps.at(-1)!.vars?.links);
        const kids = rootKids(t.entries.at(-2)!.end).length;
        return {
          prompt:
            'Run `deleteMin()` with two-pass pairing. How many links (melds of two trees) does it make?',
          setup,
          answer: { kind: 'number', value: links },
          explain: `The root had ${kids} ${kids === 1 ? 'child' : 'children'}. Every link turns two trees into one, so ${kids} trees take ${links} ${links === 1 ? 'link' : 'links'} to become one, whatever the order.`,
          watch: [['deleteMin']],
        };
      },
    },
    {
      id: 'root-degree',
      title: 'How many children does the new root have?',
      make(rng) {
        const setup = setupOf(rng, 6, 10);
        const end = run([...setup, ['deleteMin']]).endState();
        const kids = rootKids(end);
        return {
          prompt:
            'Run `deleteMin()` with two-pass pairing. How many children does the new root have?',
          setup,
          answer: { kind: 'number', value: kids.length },
          explain: `Pass 1 pairs the trees, and pass 2 melds the pairs from the right, each into the result. The new root ends with ${kids.length} ${kids.length === 1 ? 'child' : 'children'}: ${kids.join(', ') || 'none'}.`,
          watch: [['deleteMin']],
        };
      },
    },
    {
      id: 'children-after-delete',
      title: 'What are the new root’s children?',
      make(rng) {
        const setup = setupOf(rng, 5, 8);
        const end = run([...setup, ['deleteMin']]).endState();
        const kids = rootKids(end);
        return {
          prompt:
            'Run `deleteMin()` with two-pass pairing. Type the children of the new root, left to right. Leave it blank if it has none.',
          setup,
          answer: { kind: 'sequence', value: kids },
          explain: kids.length
            ? `Each link puts the loser in front of the winner's children, so the most recent link is leftmost: ${kids.join(', ')}.`
            : 'The new root has no children.',
          watch: [['deleteMin']],
        };
      },
    },
    {
      id: 'decrease-root',
      title: 'Where does the cut subtree go?',
      make(rng) {
        const setup = setupOf(rng, 6, 9);
        const before = run(setup).endState();
        const others = preorder(before.nodes, before.roots).slice(1);
        const x = before.nodes[others[rng.int(0, others.length - 1)]!]!.key;
        const k = x - rng.int(1, 60);
        const end = run([...setup, ['decrease', x, k]]).endState();
        const kids = rootKids(end);
        const root = String(end.nodes[end.roots[0]!]!.key);
        return {
          prompt: `Run \`decreaseKey(${x}, ${k})\`. Type the root and then its children, left to right.`,
          setup,
          answer: { kind: 'sequence', value: [root, ...kids] },
          explain: `${x} becomes ${k}, is cut off with its subtree and melded with the root: the smaller of the two roots wins and the other becomes its first child. The root is ${root}, with children ${kids.join(', ') || 'none'}.`,
          watch: [['decrease', x, k]],
        };
      },
    },
  ];
}
