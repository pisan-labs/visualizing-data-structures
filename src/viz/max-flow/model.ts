/**
 * Maximum flow and minimum cut, CLRS style: FORD-FULKERSON(G, s, t) starts with no flow and,
 * while the residual network G_f has a path from s to t, pushes the path's bottleneck c_f(p)
 * along it. When no path is left, the vertices s can still reach in G_f are the s side of a
 * minimum cut, and the cut's capacity equals the flow (the max-flow min-cut theorem).
 *
 * Settings
 *   method    'bfs' (Edmonds-Karp, CLRS 26.2: the path with the fewest arcs) or 'dfs' (plain
 *             Ford-Fulkerson with depth-first search: the first path DFS finds)
 *   residual  draw the residual network G_f instead of the flow on each arc
 *   layout    the drawing only
 *
 * Both searches look at a vertex's neighbours in name order (arcs either way: a reverse arc
 * carries the flow that can be cancelled), so every run is reproducible and the code tabs
 * agree with it. The state is just the network; a run's bookkeeping travels in `extra`.
 *
 * A long run (more than QUIET_AFTER augmenting paths, which DFS can need) shows each later
 * search in one step instead of vertex by vertex.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { vertexId } from '../../layouts/graph';
import { compareNames, keyOf, listWords, plural } from '../_graph/graph';
import { loadNetwork, netVars, type FlowTemplate, type NetState } from '../_flow/kit';
import {
  arcId,
  arrow,
  cutArcs,
  cutCapacity,
  describeNetwork,
  parseNetwork,
  pathText,
  order,
  setText,
  START_TEXT,
  push,
  residual,
  touching,
  type Flow,
  type Network,
} from '../_flow/network';

export type MfState = NetState;

export interface MfSettings {
  [key: string]: Scalar;
  method: 'bfs' | 'dfs';
  residual: boolean;
  layout: FlowTemplate;
}

export const defaults: MfSettings = { method: 'bfs', residual: false, layout: 'lr' };

export const startNetwork = (): Network => parseNetwork(START_TEXT) as Network;

export const QUIET_AFTER = 30;

export interface Augment {
  p: string[];
  b: number;
}

export interface MfRun {
  s: string;
  t: string;
  flow: Flow;
  value: number;
  paths: Augment[];
  /** The current search: vertices found so far, in order, and their parents. */
  seen: string[];
  parent: Record<string, string>;
  /** The BFS queue (front first) or the DFS stack (bottom first: the path so far). */
  frontier: string[];
  u?: string;
  path?: string[];
  b?: number;
  /** The s side of the minimum cut, at the end. */
  side?: string[];
  /** Residual arcs looked at, over all searches. */
  scans: number;
  done?: boolean;
}

export interface MfExtra {
  run?: MfRun;
}

type S = MfState;
type X = MfExtra;
type Op = OpSpec<S, MfSettings, X>;
type MfStep = Step<S, X>;

export function init(): S {
  return { net: startNetwork() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

function clone(r: MfRun): MfRun {
  return {
    ...r,
    flow: { ...r.flow },
    paths: r.paths.map((a) => ({ p: [...a.p], b: a.b })),
    seen: [...r.seen],
    parent: { ...r.parent },
    frontier: [...r.frontier],
    path: r.path && [...r.path],
    side: r.side && [...r.side],
  };
}

function runVars(net: Network, r: MfRun): Record<string, Scalar> {
  return {
    ...netVars(net),
    '|f|': r.value,
    paths: r.paths.length,
    b: r.b ?? '–',
    scans: r.scans,
    ...(r.side ? { cut: cutCapacity(net, r.side) } : {}),
  };
}

/** The path from s to v along the search's parents. */
function pathTo(r: MfRun, v: string): string[] {
  const p = [v];
  while (p[0] !== r.s) p.unshift(r.parent[p[0]!]!);
  return p;
}

const pathArcs = (p: string[]) => p.slice(1).map((v, i) => arcId(p[i]!, v));

/** Words for each arc of a path: forward arcs and the reverse arcs that cancel flow. */
function pathParts(net: Network, flow: Flow, p: string[]): string[] {
  return p.slice(1).map((v, i) => {
    const u = p[i]!;
    const r = residual(net, flow, u, v);
    const back = (flow[arcId(v, u)] ?? 0) > 0;
    return `${arrow(u, v)} ${r}${back ? ` (cancels flow on ${arrow(v, u)})` : ''}`;
  });
}

/** The final answer in the code tabs' words. */
export function runSummary(net: Network, r: MfRun): string {
  const flows = net.graph.edges.map((e) => `${e.u}>${e.v}:${r.flow[keyOf(e)] ?? 0}`).join(' ');
  const side = [...(r.side ?? [])].sort(compareNames).join(' ');
  return `${r.value} | ${r.paths.length} | ${side} | ${flows}`.trimEnd();
}

const run: Op = {
  label: 'Find max flow',
  arity: 0,
  *run(st, _args, { settings }) {
    const net = st.net;
    const g = net.graph;
    if (!net.s || !net.t) {
      yield {
        state: st,
        marks: [],
        say: 'There is nothing to do: a flow network needs a source and a sink, so at least two vertices. Load one, such as s>a:3, a>t:2.',
        lines: ['sig'],
        level: 1,
        vars: netVars(net),
      } satisfies MfStep;
      return st;
    }
    const dfs = settings.method === 'dfs';
    const r: MfRun = {
      s: net.s,
      t: net.t,
      flow: {},
      value: 0,
      paths: [],
      seen: [],
      parent: {},
      frontier: [],
      scans: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): MfStep => ({
      state: st,
      marks,
      say,
      lines,
      level,
      vars: runVars(net, r),
      extra: { run: clone(r) },
    });
    const vmarks = (vs: string[], role: Mark['role']) => vs.map((v) => mark(vertexId(v), role));

    yield step(
      `Start with no flow on any of the ${plural(g.edges.length, 'arc')}, so |f| = 0 and the residual network is the network itself. Each label reads flow/capacity.`,
      ['init'],
      2,
      vmarks([r.s, r.t], 'visit'),
    );

    for (;;) {
      const k = r.paths.length + 1;
      const quiet = r.paths.length >= QUIET_AFTER;
      r.seen = [r.s];
      r.parent = {};
      r.frontier = [r.s];
      r.path = undefined;
      r.b = undefined;
      r.u = undefined;
      const how = dfs
        ? 'depth-first search: go as deep as possible, in name order'
        : 'breadth-first search, so it finds a path with the fewest arcs';
      if (!quiet)
        yield step(
          k === 1
            ? `Look for a path from ${r.s} to ${r.t} in the residual network, with ${how}.`
            : `Search ${k}: look for another path from ${r.s} to ${r.t} in the new residual network.`,
          ['while', 'find'],
          k === 1 ? 2 : 3,
          vmarks([r.s], 'active'),
        );
      else if (k === QUIET_AFTER + 1)
        yield step(
          `That is ${QUIET_AFTER} augmenting paths already. From here on each search is shown in one step.`,
          ['while', 'find'],
          2,
        );

      let found = false;
      if (!dfs) {
        while (r.frontier.length && !found) {
          const u = r.frontier.shift()!;
          r.u = u;
          const fresh: string[] = [];
          const full: string[] = [];
          for (const v of touching(net, u)) {
            r.scans++;
            const c = residual(net, r.flow, u, v);
            if (c <= 0) {
              full.push(v);
              continue;
            }
            if (r.seen.includes(v)) continue;
            r.seen.push(v);
            r.parent[v] = u;
            r.frontier.push(v);
            fresh.push(`${v} (${arrow(u, v)} has ${c} left)`);
            if (v === r.t) {
              found = true;
              break;
            }
          }
          if (!quiet)
            yield step(
              `Take ${u} from the front of the queue. ${
                fresh.length
                  ? `New: ${listWords(fresh)}, each with parent ${u}, to the back of the queue.`
                  : `Nothing new: every neighbour is found already${full.length ? ` or its arc is full (${listWords(full.map((v) => arrow(u, v)))})` : ''}.`
              }${found ? ` That reaches ${r.t}.` : ''}`,
              ['find'],
              3,
              [
                ...vmarks([u], 'active'),
                ...vmarks(
                  fresh.map((f) => f.split(' ')[0]!),
                  'new',
                ),
              ],
            );
        }
      } else {
        // Recursive DFS, unrolled: the stack is the path from s so far.
        const next: Record<string, number> = { [r.s]: 0 };
        while (r.frontier.length && !found) {
          const u = r.frontier.at(-1)!;
          r.u = u;
          const list = touching(net, u);
          let moved = false;
          while (next[u]! < list.length) {
            const v = list[next[u]!]!;
            next[u]!++;
            r.scans++;
            const c = residual(net, r.flow, u, v);
            if (c <= 0 || r.seen.includes(v)) continue;
            r.seen.push(v);
            r.parent[v] = u;
            r.frontier.push(v);
            next[v] = 0;
            moved = true;
            if (v === r.t) found = true;
            if (!quiet)
              yield step(
                `From ${u}, ${arrow(u, v)} has ${c} left and ${v} is new: go there.${found ? ` That is ${r.t}.` : ''}`,
                ['find'],
                3,
                [...vmarks([u], 'active'), ...vmarks([v], 'new')],
              );
            break;
          }
          if (!moved) {
            r.frontier.pop();
            if (!quiet)
              yield step(
                `Every residual arc out of ${u} is full or leads to a vertex found already, so back up${r.frontier.length ? ` to ${r.frontier.at(-1)}` : ''}.`,
                ['find'],
                3,
                vmarks([u], 'compare'),
              );
          }
        }
      }
      r.u = undefined;

      if (!found) {
        r.frontier = [];
        const side = order(net).filter((v) => r.seen.includes(v));
        r.side = side;
        r.done = true;
        const cut = cutArcs(net, side);
        const cap = cutCapacity(net, side);
        const others = g.vertices.filter((v) => !side.includes(v));
        const back = g.edges.filter((e) => !side.includes(e.u) && side.includes(e.v));
        yield step(
          `No path reaches ${r.t}: the search finds only ${listWords(side)}. Call that S, and the rest, ${listWords(others)}, T. Every arc from S to T is full, and every arc from T back to S is empty${back.length ? '' : ' (there are none)'}.`,
          ['while', 'cut'],
          2,
          vmarks(side, 'found'),
        );
        yield step(
          `Done: the maximum flow is ${r.value}, after ${plural(r.paths.length, 'augmenting path')}. The minimum cut (S, T) has S = ${setText(side)}. ${cut.length ? `The arcs across it are ${listWords(cut.map((e) => `${arrow(e.u, e.v)} (${e.w})`))}, ${cut.length > 1 ? `${cut.map((e) => e.w).join(' + ')} = ${cap}` : `capacity ${cap}`}` : 'No arc crosses it, capacity 0'}, the same as the flow. No flow can be larger than a cut, so both are optimal.`,
          ['ret'],
          1,
          vmarks(side, 'found'),
        );
        return st;
      }

      const p = pathTo(r, r.t);
      const caps = p.slice(1).map((v, i) => residual(net, r.flow, p[i]!, v));
      const b = Math.min(...caps);
      r.path = p;
      r.b = b;
      const parts = pathParts(net, r.flow, p);
      const cancels = parts.some((x) => x.includes('cancels'));
      yield step(
        `Found ${pathText(p)}${dfs ? '' : `, ${plural(p.length - 1, 'arc')}`}. Residual capacities: ${parts.join(', ')}. The bottleneck is the smallest, c_f(p) = ${b}.${cancels ? ' Going along a reverse arc means taking back flow sent earlier.' : ''}`,
        ['cf'],
        quiet ? 3 : 2,
        vmarks(p, 'active'),
      );
      r.flow = push(net, r.flow, p, b);
      r.value += b;
      r.paths.push({ p, b });
      const full = pathArcs(p).filter((k) => {
        const [u, v] = k.split('-') as [string, string];
        return residual(net, r.flow, u, v) === 0;
      });
      const fullText = listWords(full.map((x) => arrow(...(x.split('-') as [string, string]))));
      yield step(
        `Push ${b} along it: ${cancels ? 'real arcs carry more and the reverse arc takes flow back' : `every arc on the path carries ${b} more`}. Now |f| = ${r.value}. ${fullText} ${full.length === 1 ? 'has' : 'have'} no room left, so ${full.length === 1 ? 'it leaves' : 'they leave'} the residual network.`,
        ['each', 'fwd', 'back'],
        2,
        vmarks(p, 'active'),
      );
    }
  },
};

const load = loadNetwork<MfSettings, X>({
  parse: {},
  ready: () => 'Press Find max flow.',
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS 26.2. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: MfSettings): PseudoBlock[] {
  const bfs = settings.method !== 'dfs';
  const lines = [
    L(
      'sig',
      0,
      bfs ? 'EDMONDS-KARP(G, s, t)' : 'FORD-FULKERSON(G, s, t)',
      'Maximum flow from s to t:',
    ),
    L('init', 1, 'for each (u, v) in G.E: f = 0', 'Start with no flow anywhere.'),
    L('while', 1, 'while G_f has a path p, s to t', 'While some s-t path has room left,'),
    L(
      'find',
      2,
      bfs ? 'p = BFS(G_f, s, t)' : 'p = DFS(G_f, s, t)',
      bfs ? 'find the one with fewest arcs,' : 'take the first path DFS finds,',
    ),
    L('cf', 2, 'c_f(p) = min c_f(u, v) on p', 'its bottleneck is its tightest arc.'),
    L('each', 2, 'for each (u, v) on p', 'For each arc on the path:'),
    L('fwd', 3, 'if (u, v) in E: (u, v).f += c', 'a real arc carries more,'),
    L('back', 3, 'else (v, u).f -= c', 'a reverse arc takes flow back.'),
    L('cut', 1, 'S = vertices s reaches in G_f', 'What s still reaches is the cut.'),
    L('ret', 1, 'return f', 'The flow is maximum.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  const n = s.net;
  return `${describeNetwork(n).split('. ').slice(0, 2).join('. ')}. Each arc can carry at most its capacity. Press Find max flow to send as much as possible from ${n.s ?? 's'} to ${n.t ?? 't'}.`;
}

export function initialVars(s: S) {
  return netVars(s.net);
}

export function describe(s: S): string {
  return describeNetwork(s.net);
}

/** The scene label: where a run stands. */
export function describeRun(net: Network, r: MfRun): string {
  const flows = net.graph.edges
    .filter((e) => (r.flow[keyOf(e)] ?? 0) > 0)
    .map((e) => `${arrow(e.u, e.v)} ${r.flow[keyOf(e)]}/${e.w}`);
  const where = r.side
    ? `Maximum flow ${r.value}. Minimum cut S = ${setText(r.side)}, capacity ${cutCapacity(net, r.side)}.`
    : r.path
      ? `Augmenting path ${pathText(r.path)}, bottleneck ${r.b}.`
      : `Flow ${r.value} after ${plural(r.paths.length, 'path')}.`;
  return `${where} Flow on arcs: ${flows.length ? flows.join(', ') : 'none'}.`;
}
