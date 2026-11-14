import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { writePoints, type Vec } from '../../layouts/plane';
import { blobs, d2 } from '../_retrieve/points';
import {
  bruteForce,
  cName,
  defaults,
  hits,
  K,
  num,
  rankLists,
  type IvfExtra,
  type IvfSettings,
  type IvfState,
  type SearchDone,
} from './model';

type Def = VizDef<IvfState, IvfSettings, IvfExtra>;

/**
 * Practice for IVF. The picture shows the trained index (the points, the centres with their
 * coordinates, and the lists); the prompt asks about a search that follows. Every answer comes
 * from running the model.
 */
export function ivfPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: IvfSettings) => new Timeline(def(), settings, 1, ops);

  /** A trained index on points in round groups, and a query that is not one of the points. */
  function setup(rng: Rng, settings: IvfSettings) {
    const pts = blobs(rng, rng.int(9, 12), rng.int(2, 3) + (settings.lists > 3 ? 1 : 0));
    const ops: OpCall[] = [['load', writePoints(pts)], ['train']];
    const s = run(ops, settings).endState();
    let q: Vec;
    do q = { x: rng.int(0, 10), y: rng.int(0, 10) };
    while (s.points.some((p) => p.x === q.x && p.y === q.y));
    const watch: OpCall[] = [['search', `${q.x},${q.y}`]];
    const done = run([...ops, ...watch], settings).endState().last as SearchDone;
    return { ops, s, q, watch, done };
  }

  /** The gaps between the sorted values are all at least `gap` among the first `n + 1`. */
  const clear = (xs: number[], n: number, gap = 0.5) => {
    const ys = [...xs].sort((a, b) => a - b).slice(0, n + 1);
    return ys.every((y, i) => i === 0 || y - ys[i - 1]! >= gap);
  };
  const centreList = (s: IvfState, q: Vec) =>
    s.centres.map((c) => `${cName(c.id)} ${num(d2(q, c))}`).join(', ');

  return [
    {
      id: 'probe',
      title: 'Which lists are searched',
      make(rng) {
        for (;;) {
          const settings: IvfSettings = { lists: rng.int(3, 4), nprobe: 2 };
          const { ops, s, q, watch } = setup(rng, settings);
          if (s.centres.length !== settings.lists) continue;
          const { order, d } = rankLists(q, s.centres);
          if (!clear(d, 2)) continue;
          const names = order.slice(0, 2).map((j) => cName(s.centres[j]!.id));
          return {
            prompt: `Search for q = (${q.x}, ${q.y}) with **nprobe = 2**. Which lists does IVF search? Name them nearest centre first, for example c3 c1.`,
            setup: ops,
            settings,
            answer: { kind: 'sequence', value: names },
            explain: `Squared distances from q to the centres: ${centreList(s, q)}. The two nearest are ${names.join(' and ')}, so the search measures the points in those two lists and no others.`,
            watch,
          };
        }
      },
    },
    {
      id: 'exact',
      title: 'Is the answer exact?',
      make(rng) {
        const wantMiss = rng.int(0, 1) === 1;
        for (;;) {
          const settings: IvfSettings = { lists: 3, nprobe: 1 };
          const { ops, s, q, watch, done } = setup(rng, settings);
          if (s.points.length < K + 1) continue;
          const { d } = rankLists(q, s.centres);
          if (!clear(d, 1)) continue;
          // Clear answers: no tie for the 3rd place, overall or in the list searched.
          const all = s.points.map((p) => d2(q, p)).sort((a, b) => a - b);
          if (all[K - 1] === all[K]) continue;
          const exact = hits(done) === K;
          if (exact === wantMiss) continue;
          const nm = (xs: number[]) => xs.map((i) => s.points[i]!.name).join(', ');
          const probed = cName(s.centres[done.probed[0]!]!.id);
          return {
            prompt: `Search for the ${K} nearest to q = (${q.x}, ${q.y}) with **nprobe = 1**. Is IVF's answer exact: are the ${K} points it returns the true ${K} nearest?`,
            setup: ops,
            settings,
            answer: {
              kind: 'choice',
              options: ['Yes, exact', 'No, it misses at least one'],
              correct: exact ? 0 : 1,
            },
            explain: `The nearest centre is ${probed} (${centreList(s, q)}), so only list ${probed} is searched. It gives ${nm(done.found)}; brute force gives ${nm(bruteForce(s.points, q))}.${exact ? ' The same three: exact.' : ` The missed ${done.truth.length - hits(done) === 1 ? 'one sits' : 'ones sit'} in other lists.`}`,
            watch,
          };
        }
      },
    },
    {
      id: 'work',
      title: 'Distance computations',
      make(rng) {
        for (;;) {
          const settings: IvfSettings = { lists: rng.int(3, 4), nprobe: rng.int(1, 2) };
          const { ops, s, q, watch, done } = setup(rng, settings);
          if (s.centres.length !== settings.lists) continue;
          const { d } = rankLists(q, s.centres);
          if (!clear(d, settings.nprobe)) continue;
          const sizes = done.probed.map((j) => s.lists[j]!.length);
          return {
            prompt: `Search for q = (${q.x}, ${q.y}) with **nprobe = ${settings.nprobe}**. How many distances does IVF compute in all, counting q against every centre?`,
            setup: ops,
            settings,
            answer: { kind: 'number', value: done.dists },
            explain: `First q against the ${s.centres.length} centres: ${s.centres.length} distances. Then every point in the ${settings.nprobe === 1 ? 'nearest list' : `${settings.nprobe} nearest lists`} (${done.probed.map((j, i) => `${cName(s.centres[j]!.id)} has ${sizes[i]}`).join(', ')}): ${s.centres.length} + ${sizes.join(' + ')} = ${done.dists}. Brute force would compute ${s.points.length}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'first',
      title: 'The nearest point IVF returns',
      make(rng) {
        for (;;) {
          const settings: IvfSettings = { ...defaults, lists: 3, nprobe: 1 };
          const { ops, s, q, watch, done } = setup(rng, settings);
          const { d } = rankLists(q, s.centres);
          if (!clear(d, 1)) continue;
          const list = s.lists[done.probed[0]!]!;
          const ds = list.map((i) => d2(q, s.points[i]!)).sort((a, b) => a - b);
          if (ds.length < 2 || ds[0] === ds[1]) continue;
          const first = done.found[0]!;
          const options = s.points.map((p) => p.name);
          const truth = bruteForce(s.points, q)[0]!;
          const probed = cName(s.centres[done.probed[0]!]!.id);
          return {
            prompt: `Search for q = (${q.x}, ${q.y}) with **nprobe = 1**. Which point does IVF return as the nearest?`,
            setup: ops,
            settings,
            answer: { kind: 'choice', options, correct: first },
            explain: `The nearest centre is ${probed}, so the search measures only list ${probed}: ${list.map((i) => `${s.points[i]!.name} ${num(d2(q, s.points[i]!))}`).join(', ')}. The nearest of those is ${s.points[first]!.name}.${truth === first ? ' It is also the true nearest.' : ` The true nearest is ${s.points[truth]!.name} (${num(d2(q, s.points[truth]!))}), in a list that was not searched.`}`,
            watch,
          };
        }
      },
    },
  ];
}
