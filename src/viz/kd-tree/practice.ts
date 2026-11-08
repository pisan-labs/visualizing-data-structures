import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { writePoints } from '../../layouts/plane';
import { dist2, randomPoints, shuffled } from '../_spatial/kit';
import { MAX, byId, defaults, type KdExtra, type KdSettings, type KdState } from './model';

type Def = VizDef<KdState, KdSettings, KdExtra>;

const setupOf = (rng: Rng, lo: number, hi: number): OpCall[] => [
  ['insert', writePoints(randomPoints(rng, rng.int(lo, hi), 0, MAX))],
];

/** A query point that is not one of the tree's points. */
function freePoint(rng: Rng, s: KdState) {
  for (;;) {
    const q = { x: rng.int(0, MAX), y: rng.int(0, MAX) };
    if (!s.nodes.some((n) => n.x === q.x && n.y === q.y)) return q;
  }
}

/**
 * Practice for the k-d tree. Every answer comes from running the model; `def` is a getter to
 * avoid an import cycle.
 */
export function kdPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);

  return [
    {
      id: 'insert-path',
      title: 'Where does a new point go?',
      make(rng) {
        const setup = setupOf(rng, 5, 8);
        const before = run(setup).endState();
        const p = freePoint(rng, before);
        const t = run([...setup, ['insert', `${p.x},${p.y}`]]);
        const e = t.entries.at(-1)!;
        const path = e.steps
          .filter((st) => st.lines.includes('ins.cmp'))
          .map((st) => st.vars!.at as string);
        const node = e.end.nodes.at(-1)!;
        return {
          prompt: `Insert (${p.x}, ${p.y}). Type the names of the nodes it is compared with, from the root down.`,
          setup,
          answer: { kind: 'sequence', value: path },
          explain: `Compare on x at even depths and on y at odd ones; smaller goes left. The path is ${path.join(', ')}, and the new point ${node.name} hangs under ${path.at(-1)} at depth ${node.depth}.`,
          watch: [['insert', `${p.x},${p.y}`]],
        };
      },
    },
    {
      id: 'nearest',
      title: 'Nearest neighbour',
      make(rng) {
        const setup = setupOf(rng, 6, 9);
        const before = run(setup).endState();
        const q = freePoint(rng, before);
        const end = run([...setup, ['nearest', `${q.x},${q.y}`]]).endState();
        const best = byId(end, end.best!);
        const others = shuffled(
          rng,
          end.nodes.filter((n) => n.id !== best.id),
        )
          .sort((a, b) => dist2(a, q) - dist2(b, q))
          .slice(0, 3);
        const options = shuffled(rng, [best, ...others]).map((n) => n.name);
        return {
          prompt: `Which point is nearest to q = (${q.x}, ${q.y})?`,
          setup,
          answer: { kind: 'choice', options, correct: options.indexOf(best.name) },
          explain: `${best.name}(${best.x}, ${best.y}) is at distance² ${end.bestD2}. ${others.map((n) => `${n.name} is at ${dist2(n, q)}`).join(', ')}.`,
          watch: [['nearest', `${q.x},${q.y}`]],
        };
      },
    },
    {
      id: 'visits',
      title: 'How much does pruning save?',
      make(rng) {
        const setup = setupOf(rng, 8, 12);
        const before = run(setup).endState();
        const q = freePoint(rng, before);
        const end = run([...setup, ['nearest', `${q.x},${q.y}`]]).endState();
        return {
          prompt: `Search for the point nearest q = (${q.x}, ${q.y}), with pruning. How many nodes does the search visit?`,
          setup,
          answer: { kind: 'number', value: end.visited.length },
          explain: `It visits ${end.visited.map((id) => byId(end, id).name).join(', ')}: ${end.visited.length} of ${end.nodes.length} nodes. ${end.pruned.length ? `It skips ${end.pruned.length} subtree${end.pruned.length === 1 ? '' : 's'}, whose side of the line is farther than the best circle reaches.` : 'Every subtree was within reach of the circle, so nothing was skipped.'}`,
          watch: [['nearest', `${q.x},${q.y}`]],
        };
      },
    },
    {
      id: 'range',
      title: 'Range search',
      make(rng) {
        const setup = setupOf(rng, 7, 10);
        const x1 = rng.int(0, 7);
        const y1 = rng.int(0, 7);
        const box = `${x1},${y1} ${x1 + rng.int(3, 5)},${y1 + rng.int(3, 5)}`;
        const end = run([...setup, ['range', box]]).endState();
        const names = end.found.map((id) => byId(end, id).name).sort();
        const visited = end.visited.length;
        return {
          prompt: `Search the rectangle with corners ${box.replace(' ', ' and ')}. Which points are reported? Type their names in alphabetical order (type none if there are none).`,
          setup,
          answer: { kind: 'sequence', value: names.length ? names : ['none'] },
          explain: `${names.length ? `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} inside.` : 'No point is inside.'} The search visits ${visited} of ${end.nodes.length} nodes, going to a side of a line only when the rectangle reaches it.`,
          watch: [['range', box]],
        };
      },
    },
  ];
}
