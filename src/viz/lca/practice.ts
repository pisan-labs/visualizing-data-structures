import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { loadCall, randomTree } from '../_graph/presets';
import {
  defaults,
  type LcaExtra,
  type LcaQuery,
  type LcaSettings,
  type LcaState,
  type Tree,
} from './model';

type Def = VizDef<LcaState, LcaSettings, LcaExtra>;

/**
 * Practice for binary lifting. Every answer comes from running the model: table cells from the
 * built table, answers and jump counts from the query's last step.
 */
export function lcaPractice(def: () => Def): PracticeKind[] {
  function setup(rng: Rng) {
    const g = randomTree(rng, rng.int(8, 12));
    const ops: OpCall[] = [loadCall(g), ['build']];
    const t = new Timeline(def(), defaults, 1, ops);
    const tree: Tree = t.entries.at(-1)!.steps.at(-1)!.extra!.tree!;
    return { g, ops, tree };
  }
  function ask(rng: Rng, ops: OpCall[], g: { vertices: string[] }, tree: Tree) {
    for (;;) {
      const a = g.vertices[rng.int(1, g.vertices.length - 1)]!;
      const b = g.vertices[rng.int(1, g.vertices.length - 1)]!;
      if (a === b) continue;
      const call: OpCall = ['query', a, b];
      const t = new Timeline(def(), defaults, 1, [...ops, call]);
      const q: LcaQuery = t.entries.at(-1)!.steps.at(-1)!.extra!.query!;
      if (tree.depth[a]! + tree.depth[b]! < 3) continue;
      return { a, b, q, call };
    }
  }

  return [
    {
      id: 'answer',
      title: 'Find the LCA',
      make(rng) {
        const { g, ops, tree } = setup(rng);
        const { a, b, q, call } = ask(rng, ops, g, tree);
        return {
          prompt: `The tree is rooted at A. What is the lowest common ancestor of ${a} and ${b}?`,
          setup: ops,
          answer: {
            kind: 'choice',
            options: [...g.vertices],
            correct: g.vertices.indexOf(q.answer!),
          },
          explain: `${a} is at depth ${tree.depth[a]} and ${b} at depth ${tree.depth[b]}. Walking both up, the first vertex they share is ${q.answer}.`,
          watch: [call],
        };
      },
    },
    {
      id: 'cell',
      title: 'Read the table',
      make(rng) {
        for (;;) {
          const { g, ops, tree } = setup(rng);
          const k = rng.int(1, tree.log - 1);
          const v = g.vertices[rng.int(1, g.vertices.length - 1)]!;
          const ans = tree.up[k]![v];
          if (ans === null || ans === undefined) continue;
          const mid = tree.up[k - 1]![v]!;
          return {
            prompt: `The tree is rooted at A, and up[k][v] is v's ancestor 2^k steps up. What is up[${k}][${v}]?`,
            setup: [loadCall(g)],
            answer: { kind: 'choice', options: [...g.vertices], correct: g.vertices.indexOf(ans) },
            explain: `up[${k}][${v}] = up[${k - 1}][up[${k - 1}][${v}]] = up[${k - 1}][${mid}] = ${ans}: ${2 ** k} steps above ${v}.`,
            watch: ops.slice(1),
          };
        }
      },
    },
    {
      id: 'jumps',
      title: 'How many jumps?',
      make(rng) {
        const { g, ops, tree } = setup(rng);
        const { a, b, q, call } = ask(rng, ops, g, tree);
        return {
          prompt: `The table for this tree (rooted at A) is built. Querying LCA(${a}, ${b}), how many jumps does binary lifting make in total? Count lifting the deeper vertex (one per 1-bit of the depth difference) and each time both jump together.`,
          setup: ops,
          answer: { kind: 'number', value: q.jumps },
          explain: `The depths differ by ${Math.abs(tree.depth[a]! - tree.depth[b]!)}, and the search ends at ${q.answer} after ${q.jumps} ${q.jumps === 1 ? 'jump' : 'jumps'}.`,
          watch: [call],
        };
      },
    },
    {
      id: 'depth',
      title: 'Lift by how much?',
      make(rng) {
        const { g, ops, tree } = setup(rng);
        const { a, b, call } = ask(rng, ops, g, tree);
        const d = Math.abs(tree.depth[a]! - tree.depth[b]!);
        return {
          prompt: `Querying LCA(${a}, ${b}) on this tree rooted at A: by how many steps is the deeper vertex lifted before both move together?`,
          setup: ops,
          answer: { kind: 'number', value: d },
          explain: `${a} is at depth ${tree.depth[a]} and ${b} at depth ${tree.depth[b]}: the deeper one goes up ${d}${d ? ` (${d.toString(2)} in binary)` : ''}.`,
          watch: [call],
        };
      },
    },
  ];
}
