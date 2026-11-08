import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, Settings, VizDef } from '../../engine/types';
import { writePoints } from '../../layouts/plane';
import { inCircle, randomPoints } from '../_spatial/kit';
import {
  MAX,
  defaults,
  isReal,
  realTris,
  vertex,
  type DExtra,
  type DSettings,
  type DState,
} from './model';

type Def = VizDef<DState, DSettings, DExtra>;

const setupOf = (rng: Rng, lo: number, hi: number): OpCall[] => [
  ['insert', writePoints(randomPoints(rng, rng.int(lo, hi), 1, MAX - 1))],
];

/** Points joined to p by an edge of a real triangle. */
function neighbours(s: DState, p: number): string[] {
  const out = new Set<string>();
  for (const t of realTris(s))
    if (t.v.includes(p)) for (const v of t.v) if (v !== p) out.add(vertex(s, v).name);
  return [...out].sort();
}

/** Some point lies exactly on a triangle's circle: the triangulation is not unique. */
export function cocircular(s: DState): boolean {
  return realTris(s).some((t) => {
    const [a, b, c] = t.v.map((v) => vertex(s, v));
    return s.points.some((q) => !t.v.includes(q.id) && inCircle(a!, b!, c!, q) === 0);
  });
}

/** Points on the hull: corners of a triangle that touches the super triangle. */
function hullPoints(s: DState): number[] {
  const out = new Set<number>();
  for (const t of s.tris) if (!isReal(t)) for (const v of t.v) if (v > 0) out.add(v);
  return [...out];
}

/**
 * Practice for Delaunay triangulation. Every answer comes from running the model; `def` is a
 * getter to avoid an import cycle.
 */
export function delaunayPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[], settings: DSettings = defaults) =>
    new Timeline(def(), settings, 1, cs);

  return [
    {
      id: 'count',
      title: 'How many triangles?',
      make(rng) {
        let setup = setupOf(rng, 5, 9);
        let end = run(setup).endState();
        // Points all on one line have no triangles: draw again.
        while (realTris(end).length === 0) {
          setup = setupOf(rng, 5, 9);
          end = run(setup).endState();
        }
        const n = end.points.length;
        const h = hullPoints(end).length;
        const k = realTris(end).length;
        return {
          prompt: `These ${n} points have ${h} on the convex hull (counting points on hull edges). How many triangles does their Delaunay triangulation have?`,
          setup,
          answer: { kind: 'number', value: k },
          explain: `Every triangulation of n points with h on the hull has 2n − 2 − h triangles: 2 × ${n} − 2 − ${h} = ${k}.`,
          watch: [['check']],
        };
      },
    },
    {
      id: 'in-circle',
      title: 'Inside the circle?',
      make(rng) {
        let setup = setupOf(rng, 4, 7);
        let before = run(setup).endState();
        while (realTris(before).length === 0) {
          setup = setupOf(rng, 4, 7);
          before = run(setup).endState();
        }
        const tris = realTris(before);
        const t = tris[rng.int(0, tris.length - 1)]!;
        let q = { x: rng.int(0, MAX), y: rng.int(0, MAX) };
        while (before.points.some((p) => p.x === q.x && p.y === q.y))
          q = { x: rng.int(0, MAX), y: rng.int(0, MAX) };
        const [a, b, c] = t.v.map((v) => vertex(before, v));
        const r = inCircle(a!, b!, c!, q);
        const options = ['Inside', 'On the circle', 'Outside'];
        const correct = r > 0 ? 0 : r === 0 ? 1 : 2;
        return {
          prompt: `Is the point (${q.x}, ${q.y}) inside the circumcircle of triangle ${a!.name}${b!.name}${c!.name}?`,
          setup,
          answer: { kind: 'choice', options, correct },
          explain: `The in-circle determinant for ${a!.name}, ${b!.name}, ${c!.name} and (${q.x}, ${q.y}) is ${r > 0 ? 'positive: inside, so inserting the point would remove this triangle' : r === 0 ? 'zero: on the circle, so the four points are cocircular' : 'negative: outside, so the triangle would survive the insert'}.`,
          watch: [['insert', `${q.x},${q.y}`]],
        };
      },
    },
    {
      id: 'neighbours',
      title: 'Who are the neighbours?',
      make(rng) {
        let setup = setupOf(rng, 6, 9);
        let end = run(setup).endState();
        // Four points on one circle allow either diagonal, so the edges would not be unique.
        while (realTris(end).length === 0 || cocircular(end)) {
          setup = setupOf(rng, 6, 9);
          end = run(setup).endState();
        }
        const p = end.points[rng.int(0, end.points.length - 1)]!;
        const names = neighbours(end, p.id);
        return {
          prompt: `In the Delaunay triangulation, which points are joined to ${p.name} by an edge? Type their names in alphabetical order (none if there are none).`,
          setup,
          answer: { kind: 'sequence', value: names.length ? names : ['none'] },
          explain: `${p.name} is joined to ${names.length ? names.join(', ') : 'no point'}. In the Voronoi diagram, those are exactly the cells that share a border with ${p.name}’s cell.`,
          watch: [['check']],
        };
      },
    },
    {
      id: 'voronoi',
      title: 'Unbounded Voronoi cells',
      make(rng) {
        const settings: Settings = { ...defaults, voronoi: true };
        const setup = setupOf(rng, 5, 9);
        const end = run(setup, settings as DSettings).endState();
        const h = hullPoints(end);
        return {
          prompt:
            'How many cells of the Voronoi diagram of these points go on forever (are unbounded)?',
          setup,
          settings,
          answer: { kind: 'number', value: h.length },
          explain: `A cell is unbounded exactly when its point is on the convex hull: ${h
            .map((id) => vertex(end, id).name)
            .sort()
            .join(', ')}. That makes ${h.length}.`,
          watch: [['check']],
        };
      },
    },
  ];
}
