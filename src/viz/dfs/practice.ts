import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { edgeText, type Graph } from '../_graph/graph';
import { loadCall, randomGraph, shuffle } from '../_graph/presets';
import {
  KIND_WORD,
  defaults,
  type DfsExtra,
  type DfsRun,
  type DfsSettings,
  type DfsState,
  type EdgeKind,
} from './model';

type Def = VizDef<DfsState, DfsSettings, DfsExtra>;

const code = (s: string) => `\`${s}\``;
const KINDS: EdgeKind[] = ['tree', 'back', 'forward', 'cross'];
const OPTION: Record<EdgeKind, string> = {
  tree: 'Tree edge',
  back: 'Back edge',
  forward: 'Forward edge',
  cross: 'Cross edge',
};

/** Vertices in the order of a time: discovery (d) or finish (f). */
export function byTime(g: Graph, r: DfsRun, t: 'd' | 'f'): string[] {
  return [...g.vertices].sort((a, b) => r[t][a]! - r[t][b]!);
}

/**
 * Practice for DFS. Every answer comes from running the model: the orders and times are read
 * from the run's last step, and edge kinds from its classification.
 */
export function dfsPractice(def: () => Def): PracticeKind[] {
  function setupRun(rng: Rng, directed: boolean) {
    const g = randomGraph(rng, rng.int(5, 7), {
      density: directed ? 0.2 : 0.25,
      directed,
      connected: rng.int(0, 3) !== 0,
    });
    const s = rng.int(0, 2) === 0 ? g.vertices[rng.int(0, g.vertices.length - 1)]! : 'A';
    const setup = [loadCall(g)];
    const watch: OpCall[] = [['run', s]];
    const t = new Timeline(def(), defaults, 1, [...setup, ...watch]);
    const r = t.entries.at(-1)!.steps.at(-1)!.extra!.run!;
    return { g, s, setup, watch, r };
  }
  const intro = (g: Graph, s: string) =>
    `Run DFS from ${s} on this ${g.directed ? 'directed' : 'undirected'} graph: neighbours in name order, and after ${s} the search goes on from each vertex still white, in name order.`;

  return [
    {
      id: 'discovery',
      title: 'Which comes first?',
      make(rng) {
        const { g, s, setup, watch, r } = setupRun(rng, rng.int(0, 2) === 0);
        const order = byTime(g, r, 'd');
        return {
          prompt: `${intro(g, s)} Type the vertices in the order they are discovered (turn gray).`,
          setup,
          answer: { kind: 'sequence', value: order },
          explain: `DFS takes the first white neighbour and goes deeper before it looks at the next one: ${order.join(', ')}.${r.roots.length > 1 ? ` New trees start at ${r.roots.slice(1).join(' and ')}.` : ''}`,
          watch,
        };
      },
    },
    {
      id: 'finish',
      title: 'Which finishes first?',
      make(rng) {
        const { g, s, setup, watch, r } = setupRun(rng, rng.int(0, 1) === 0);
        const order = byTime(g, r, 'f');
        return {
          prompt: `${intro(g, s)} Type the vertices in the order they finish (turn black).`,
          setup,
          answer: { kind: 'sequence', value: order },
          explain: `A vertex finishes only after everything below it in its tree: ${order.join(', ')}. ${order[0]} has no white neighbours left when it is reached, so it finishes first.`,
          watch,
        };
      },
    },
    {
      id: 'edge-kind',
      title: 'What kind of edge?',
      make(rng) {
        for (;;) {
          const { g, s, setup, watch, r } = setupRun(rng, rng.int(0, 3) !== 0);
          const keys = Object.keys(r.edges);
          const special = keys.filter((k) => r.edges[k] !== 'tree');
          const pool = special.length && rng.int(0, 3) !== 0 ? special : keys;
          if (pool.length === 0) continue;
          const key = pool[rng.int(0, pool.length - 1)]!;
          const kind = r.edges[key]!;
          const [u, v] = key.split('-') as [string, string];
          const options = KINDS.map((k) => OPTION[k]);
          const why: Record<EdgeKind, string> = {
            tree: `the search first reached ${r.pi[v] === u ? v : u} along it, so it is part of the tree`,
            back: `it leads to a vertex that was still gray, an ancestor${g.directed ? '' : ' (not the parent)'}`,
            forward: `${v} was black and discovered after ${u} (${v}.d = ${r.d[v]} > ${u}.d = ${r.d[u]}): a descendant`,
            cross: `${v} was black and discovered before ${u} (${v}.d = ${r.d[v]} < ${u}.d = ${r.d[u]}), in another branch`,
          };
          return {
            prompt: `${intro(g, s)} What kind of edge is ${code(edgeText(g, u, v))}?`,
            setup,
            answer: { kind: 'choice', options, correct: KINDS.indexOf(kind) },
            explain: `A ${KIND_WORD[kind]}: ${why[kind]}.${g.directed ? '' : ' An undirected graph has only tree and back edges.'}`,
            watch,
          };
        }
      },
    },
    {
      id: 'times',
      title: 'Discovery and finish times',
      make(rng) {
        const { g, s, setup, watch, r } = setupRun(rng, rng.int(0, 2) === 0);
        const others = g.vertices.filter((v) => v !== s);
        const v = shuffle(rng, others.length ? others : g.vertices)[0]!;
        const d = r.d[v]!;
        const f = r.f[v]!;
        const inside = byTime(g, r, 'd').filter((x) => r.d[x]! > d && r.f[x]! < f);
        return {
          prompt: `${intro(g, s)} Type ${code(`${v}.d`)} and ${code(`${v}.f`)}, separated by a space.`,
          setup,
          answer: { kind: 'sequence', value: [String(d), String(f)] },
          explain: `${v} is discovered at time ${d} and finishes at ${f}. ${inside.length ? `In between, its descendants ${inside.join(', ')} are discovered and finish: ${inside.length} vertices take ${2 * inside.length} ticks, so f = d + ${2 * inside.length + 1}.` : `Nothing is discovered in between: it has no white neighbours, so f = d + 1.`}`,
          watch,
        };
      },
    },
  ];
}
