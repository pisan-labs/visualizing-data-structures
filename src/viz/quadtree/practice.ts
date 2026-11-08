import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { writePoints } from '../../layouts/plane';
import { randomPoints } from '../_spatial/kit';
import {
  MAX,
  defaults,
  node,
  point,
  squareName,
  type QExtra,
  type QSettings,
  type QState,
} from './model';

type Def = VizDef<QState, QSettings, QExtra>;

const setupOf = (rng: Rng, lo: number, hi: number): OpCall[] => [
  ['insert', writePoints(randomPoints(rng, rng.int(lo, hi), 0, MAX))],
];

function freePoint(rng: Rng, s: QState) {
  for (;;) {
    const q = { x: rng.int(0, MAX), y: rng.int(0, MAX) };
    if (!s.points.some((n) => n.x === q.x && n.y === q.y)) return q;
  }
}

/** The leaf that holds point id, and its depth. */
function leafOf(s: QState, pid: number) {
  return s.nodes.find((n) => n.points?.includes(pid))!;
}

/**
 * Practice for the quadtree. Every answer comes from running the model; `def` is a getter to
 * avoid an import cycle.
 */
export function quadPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: QSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);

  return [
    {
      id: 'splits',
      title: 'How many nodes after an insert?',
      make(rng) {
        const setup = setupOf(rng, 3, 6);
        const before = run(setup).endState();
        const p = freePoint(rng, before);
        const after = run([...setup, ['insert', `${p.x},${p.y}`]]).endState();
        const splits = (after.nodes.length - before.nodes.length) / 4;
        return {
          prompt: `The quadtree has ${before.nodes.length} nodes and each leaf holds one point. Insert (${p.x}, ${p.y}). How many nodes does it have afterwards?`,
          setup,
          answer: { kind: 'number', value: after.nodes.length },
          explain: splits
            ? `The new point lands in a leaf that already holds a point, so that leaf splits ${splits === 1 ? 'once' : `${splits} times, until the two points are in different squares`}. Each split adds 4 nodes: ${before.nodes.length} + ${4 * splits} = ${after.nodes.length}.`
            : `The new point lands in an empty leaf, so nothing splits: still ${after.nodes.length} nodes.`,
          watch: [['insert', `${p.x},${p.y}`]],
        };
      },
    },
    {
      id: 'depth',
      title: 'How deep does a point go?',
      make(rng) {
        const capacity = rng.int(1, 2);
        const settings: Settings = { ...defaults, capacity };
        const setup = setupOf(rng, 4, 8);
        const end = run(setup, settings as QSettings).endState();
        const p = end.points[rng.int(0, end.points.length - 1)]!;
        const leaf = leafOf(end, p.id);
        return {
          prompt: `Leaves hold up to ${capacity} point${capacity === 1 ? '' : 's'}. At what depth is the leaf that holds ${p.name}(${p.x}, ${p.y})? The root is at depth 0.`,
          setup,
          settings,
          answer: { kind: 'number', value: leaf.depth },
          explain: `${p.name} is in the leaf for ${squareName(leaf)}, a square of side ${leaf.size}. The side halves at each level from 16, so the depth is ${leaf.depth}. Show me runs a query on that one point, which walks straight down to its leaf.`,
          watch: [['query', `${p.x},${p.y} ${p.x},${p.y}`]],
        };
      },
    },
    {
      id: 'range',
      title: 'Range query',
      make(rng) {
        const setup = setupOf(rng, 6, 10);
        const x1 = rng.int(0, 9);
        const y1 = rng.int(0, 9);
        const box = `${x1},${y1} ${x1 + rng.int(3, 6)},${y1 + rng.int(3, 6)}`;
        const end = run([...setup, ['query', box]]).endState();
        const names = end.found.map((id) => point(end, id).name).sort();
        return {
          prompt: `Query the rectangle with corners ${box.replace(' ', ' and ')}. Which points are reported? Type their names in alphabetical order (type none if there are none).`,
          setup,
          answer: { kind: 'sequence', value: names.length ? names : ['none'] },
          explain: `${names.length ? `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} inside.` : 'No point is inside.'} The query tests only ${end.tests} of the ${end.points.length} points: the others sit in squares that miss the rectangle.`,
          watch: [['query', box]],
        };
      },
    },
    {
      id: 'skipped',
      title: 'Which squares are skipped?',
      make(rng) {
        const setup = setupOf(rng, 6, 10);
        const x1 = rng.int(0, 10);
        const y1 = rng.int(0, 10);
        const box = `${x1},${y1} ${x1 + rng.int(2, 5)},${y1 + rng.int(2, 5)}`;
        const end = run([...setup, ['query', box]]).endState();
        const root = node(end, 0);
        const rootSkips = root.kids ? root.kids.filter((k) => end.pruned.includes(k)).length : 0;
        return {
          prompt: `Query the rectangle with corners ${box.replace(' ', ' and ')}. How many points does the query test against the rectangle?`,
          setup,
          answer: { kind: 'number', value: end.tests },
          explain: `It tests the points in leaves whose squares overlap the rectangle: ${end.tests} of ${end.points.length}. ${rootSkips ? `${rootSkips} of the root’s four quarters miss the rectangle entirely and are skipped at once.` : 'The rectangle reaches every quarter of the root, so skipping starts lower down.'}`,
          watch: [['query', box]],
        };
      },
    },
  ];
}
