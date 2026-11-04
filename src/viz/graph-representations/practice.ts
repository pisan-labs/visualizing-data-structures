import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { edgeText, findEdge, listWords, neighbours, plural, type Graph } from '../_graph/graph';
import { loadCall, randomGraph, shuffle } from '../_graph/presets';
import { defaults, type RepExtra, type RepSettings, type RepState } from './model';

type Def = VizDef<RepState, RepSettings, RepExtra>;

const code = (s: string) => `\`${s}\``;

function smallGraph(rng: Rng, directed = false): Graph {
  return randomGraph(rng, rng.int(5, 7), { density: directed ? 0.15 : 0.3, directed });
}

/** A vertex with at least `min` out-neighbours (the graph always has one with 1). */
function busyVertex(rng: Rng, g: Graph, min: number): string {
  const busy = g.vertices.filter((v) => neighbours(g, v).length >= min);
  const pool = busy.length ? busy : g.vertices.filter((v) => neighbours(g, v).length > 0);
  return pool[rng.int(0, pool.length - 1)]!;
}

/**
 * Practice for graph representations. Every answer comes from running the model: the check
 * counts are the ones its operations report, and the lists are read from its final state.
 */
export function repPractice(def: () => Def): PracticeKind[] {
  const run = (cs: OpCall[]) => new Timeline(def(), defaults, 1, cs);
  const lastVars = (cs: OpCall[]) => run(cs).entries.at(-1)!.steps.at(-1)!.vars ?? {};

  /** hasEdge(u, v) on a fresh graph: u has a few neighbours, and v is one of them half the time. */
  function lookupQuestion(rng: Rng) {
    const g = smallGraph(rng, rng.int(0, 2) === 0);
    const u = busyVertex(rng, g, 2);
    const nbrs = neighbours(g, u);
    const others = g.vertices.filter((x) => x !== u && !nbrs.includes(x));
    const v =
      rng.int(0, 1) === 0 || others.length === 0
        ? nbrs[rng.int(0, nbrs.length - 1)]!
        : others[rng.int(0, others.length - 1)]!;
    const setup = [loadCall(g)];
    const watch: OpCall[] = [['hasEdge', g.directed ? `${u}>${v}` : `${u}-${v}`]];
    return { g, u, v, nbrs, setup, watch, vars: lastVars([...setup, ...watch]) };
  }

  return [
    {
      id: 'list-checks',
      title: 'How far down the list?',
      make(rng) {
        const { g, u, v, nbrs, setup, watch, vars } = lookupQuestion(rng);
        const checks = Number(vars.list);
        const where = nbrs.indexOf(v);
        return {
          prompt: `${code(`hasEdge(${u}, ${v})`)} with the adjacency list: how many entries of Adj[${u}] does it check?`,
          setup,
          answer: { kind: 'number', value: checks },
          explain:
            where >= 0
              ? `Adj[${u}] is ${listWords(nbrs)}. ${v} is entry ${where + 1}, so the scan stops after ${plural(checks, 'check')}.`
              : `Adj[${u}] is ${listWords(nbrs)}, with no ${v}${g.directed ? '' : ' in it'}. The scan has to read all ${plural(checks, 'entry', 'entries')} to be sure.`,
          watch,
        };
      },
    },
    {
      id: 'edge-checks',
      title: 'How far down the edge list?',
      make(rng) {
        const { g, u, v, setup, watch, vars } = lookupQuestion(rng);
        const checks = Number(vars['edge list']);
        const there = !!findEdge(g, u, v);
        return {
          prompt: `${code(`hasEdge(${u}, ${v})`)} with the edge list: how many rows does it check? Rows are in the order shown.`,
          setup,
          answer: { kind: 'number', value: checks },
          explain: there
            ? `${edgeText(g, u, v)} is row ${checks}, so the scan reads ${plural(checks, 'row')}.`
            : `${edgeText(g, u, v)} is not there, so the scan reads all ${plural(checks, 'row')}. That is the edge list's worst case: E checks.`,
          watch,
        };
      },
    },
    {
      id: 'list-after-add',
      title: 'Where does the new entry go?',
      make(rng) {
        for (;;) {
          const g = smallGraph(rng);
          const pairs: [string, string][] = [];
          for (const a of g.vertices)
            for (const b of g.vertices) if (a !== b && !findEdge(g, a, b)) pairs.push([a, b]);
          if (pairs.length === 0) continue;
          const [u, v] = shuffle(rng, pairs)[0]!;
          const setup = [loadCall(g)];
          const watch: OpCall[] = [['addEdge', `${u}-${v}`]];
          const after = neighbours(run([...setup, ...watch]).endState().graph, v);
          return {
            prompt: `Run ${code(`addEdge(${u}, ${v})`)} on this undirected graph. Type Adj[${v}] afterwards, in order.`,
            setup,
            answer: { kind: 'sequence', value: after },
            explain: `In an undirected graph the edge goes into both lists, so ${u} joins Adj[${v}]. Lists stay in name order: ${after.join(' ')}.`,
            watch,
          };
        }
      },
    },
    {
      id: 'edges-after-remove',
      title: 'What is left?',
      make(rng) {
        const g = smallGraph(rng, rng.int(0, 2) === 0);
        const x = busyVertex(rng, g, 2);
        const setup = [loadCall(g)];
        const watch: OpCall[] = [['removeVertex', x]];
        const left = run([...setup, ...watch]).endState().graph.edges.length;
        const gone = g.edges.length - left;
        return {
          prompt: `Run ${code(`removeVertex(${x})`)}. How many edges are left?`,
          setup,
          answer: { kind: 'number', value: left },
          explain: `${x} takes its ${plural(gone, 'edge')} with it${g.directed ? ', in and out' : ''}: ${g.edges.length} - ${gone} = ${left}.`,
          watch,
        };
      },
    },
  ];
}
