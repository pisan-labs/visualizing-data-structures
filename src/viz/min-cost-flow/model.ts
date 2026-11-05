/**
 * Min-cost flow by successive shortest paths: start with no flow and, while t can be reached in
 * the residual network, push as much as fits along the cheapest path from s to t, where a
 * residual arc u -> v costs cost(u, v) and its reverse costs -cost(u, v) (sending flow back
 * gives its cost back). With no negative cycle at the start (costs here are at least 0), the
 * flow after each push is the cheapest flow of its value, so the last one is a maximum flow of
 * minimum cost. A target stops it early at a given amount, still at minimum cost.
 *
 * Settings
 *   method   'bellman-ford' (default): reverse arcs have negative costs, and Bellman-Ford
 *            handles them. Passes go over the residual arcs in order (by u, then v, in name
 *            order) and stop after a pass that changes nothing.
 *            'dijkstra': with potentials h (Johnson's reweighting), every reduced cost
 *            c(u, v) + h(u) - h(v) is at least 0, so Dijkstra works. h starts at 0 and gains
 *            each search's distances.
 *   target   how many units to send; 0 means as many as possible
 *   residual draw the residual network (room left and cost per unit) instead of the flow
 *   layout   the drawing only
 *
 * The network may not have arcs both ways between two vertices (CLRS assumes the same), so
 * each residual arc is either a real arc or the reverse of one. The state is just the network.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { vertexId } from '../../layouts/graph';
import { compareNames, keyOf, listWords, plural } from '../_graph/graph';
import { loadNetwork, netVars, residualCost, type FlowTemplate, type NetState } from '../_flow/kit';
import {
  arrow,
  costOf,
  describeNetwork,
  order,
  parseNetwork,
  pathText,
  push,
  residual,
  residualArcs,
  START_TEXT,
  type Flow,
  type Network,
} from '../_flow/network';

export type McState = NetState;

export interface McSettings {
  [key: string]: Scalar;
  method: 'bellman-ford' | 'dijkstra';
  target: number;
  residual: boolean;
  layout: FlowTemplate;
}

export const defaults: McSettings = {
  method: 'bellman-ford',
  target: 0,
  residual: false,
  layout: 'lr',
};

export const PARSE = { costs: true, noAntiparallel: true };

export const startNetwork = (): Network => parseNetwork(START_TEXT, PARSE) as Network;

export const QUIET_AFTER = 30;

export interface McPath {
  p: string[];
  b: number;
  /** Cost per unit. */
  unit: number;
}

export interface McRun {
  s: string;
  t: string;
  flow: Flow;
  value: number;
  cost: number;
  paths: McPath[];
  /** The current search: distances (null is ∞) and parents. */
  d: Record<string, number | null>;
  pi: Record<string, string | null>;
  /** Potentials (Dijkstra only). */
  h?: Record<string, number>;
  /** Dijkstra: vertices finished in this search. */
  done: string[];
  /** Bellman-Ford: the pass being made. */
  pass: number;
  u?: string;
  path?: string[];
  b?: number;
  unit?: number;
  relax: number;
  finished?: 'max' | 'target';
}

export interface McExtra {
  run?: McRun;
}

type S = McState;
type X = McExtra;
type Op = OpSpec<S, McSettings, X>;
type McStep = Step<S, X>;

export function init(): S {
  return { net: startNetwork() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

function clone(r: McRun): McRun {
  return {
    ...r,
    flow: { ...r.flow },
    paths: r.paths.map((a) => ({ ...a, p: [...a.p] })),
    d: { ...r.d },
    pi: { ...r.pi },
    h: r.h && { ...r.h },
    done: [...r.done],
    path: r.path && [...r.path],
  };
}

const num = (n: number) => (n < 0 ? `(${n})` : String(n));
const dist = (d: number | null | undefined) => (d === null || d === undefined ? '∞' : String(d));

function runVars(net: Network, r: McRun): Record<string, Scalar> {
  return {
    ...netVars(net),
    '|f|': r.value,
    cost: r.cost,
    paths: r.paths.length,
    'd[t]': r.unit ?? '–',
    relax: r.relax,
  };
}

/** The final answer in the code tabs' words. */
export function runSummary(net: Network, r: McRun): string {
  const flows = net.graph.edges.map((e) => `${e.u}>${e.v}:${r.flow[keyOf(e)] ?? 0}`).join(' ');
  return `${r.value} ${r.cost} | ${r.paths.length} | ${flows}`;
}

function pathOf(pi: Record<string, string | null>, s: string, t: string): string[] {
  const p = [t];
  while (p[0] !== s) p.unshift(pi[p[0]!]!);
  return p;
}

const run: Op = {
  label: 'Find min-cost flow',
  arity: 0,
  *run(st, _args, { settings }) {
    const net = st.net;
    if (!net.s || !net.t) {
      yield {
        state: st,
        marks: [],
        say: 'There is nothing to do: a flow network needs a source and a sink, so at least two vertices. Load one, such as s>a:3:2, a>t:2:1.',
        lines: ['sig'],
        level: 1,
        vars: netVars(net),
      } satisfies McStep;
      return st;
    }
    const dijkstra = settings.method === 'dijkstra';
    const target = Math.max(0, Math.round(Number(settings.target) || 0));
    const V = net.graph.vertices;
    const blank = () => Object.fromEntries(V.map((v) => [v, null]));
    const r: McRun = {
      s: net.s,
      t: net.t,
      flow: {},
      value: 0,
      cost: 0,
      paths: [],
      d: blank(),
      pi: blank(),
      h: dijkstra ? Object.fromEntries(V.map((v) => [v, 0])) : undefined,
      done: [],
      pass: 0,
      relax: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): McStep => ({
      state: st,
      marks,
      say,
      lines,
      level,
      vars: runVars(net, r),
      extra: { run: clone(r) },
    });
    const vmarks = (vs: string[], role: Mark['role']) => vs.map((v) => mark(vertexId(v), role));
    /** The cost of a residual arc, reduced by the potentials with Dijkstra. */
    const arcCost = (u: string, v: string) =>
      residualCost(net, u, v, r.flow) + (r.h ? r.h[u]! - r.h[v]! : 0);

    yield step(
      `Start with no flow, so |f| = 0 and the cost is 0. Each label reads flow/capacity and the cost per unit. ${target ? `The goal: send ${target} ${target === 1 ? 'unit' : 'units'} from ${r.s} to ${r.t} as cheaply as possible.` : `The goal: send as much as possible from ${r.s} to ${r.t}, as cheaply as possible.`}`,
      ['init'],
      2,
      vmarks([r.s, r.t], 'visit'),
    );

    for (;;) {
      const quiet = r.paths.length >= QUIET_AFTER;
      if (target && r.value >= target) {
        r.finished = 'target';
        r.path = undefined;
        r.b = undefined;
        r.unit = undefined;
        yield step(
          `Done: ${plural(r.value, 'unit')} sent, the target, at a total cost of ${r.cost}. Each push used the cheapest path left, so no flow of ${r.value} costs less.`,
          ['ret'],
          1,
          vmarks([r.s, r.t], 'found'),
        );
        return st;
      }
      r.d = blank();
      r.pi = blank();
      r.d[r.s] = 0;
      r.done = [];
      r.pass = 0;
      r.path = undefined;
      r.b = undefined;
      r.unit = undefined;
      const k = r.paths.length + 1;
      if (!quiet)
        yield step(
          dijkstra
            ? `Search ${k}: Dijkstra from ${r.s} on reduced costs c(u, v) + h(u) - h(v), which are never negative${k === 1 ? ' (h starts at 0, and every cost is at least 0)' : ''}.`
            : `Search ${k}: Bellman-Ford from ${r.s} over the residual network${k === 1 ? '. Reverse arcs will cost minus their arc’s cost, which is why Dijkstra alone is not enough' : ''}.`,
          ['while', 'find'],
          k === 1 ? 2 : 3,
          vmarks([r.s], 'active'),
        );
      else if (k === QUIET_AFTER + 1)
        yield step(
          `That is ${QUIET_AFTER} paths already. From here on each search is shown in one step.`,
          ['while', 'find'],
          2,
        );

      if (!dijkstra) {
        const arcs = residualArcs(net, r.flow);
        for (let pass = 1; pass < V.length; pass++) {
          r.pass = pass;
          const changed: string[] = [];
          for (const a of arcs) {
            const du = r.d[a.u];
            if (du === null || du === undefined) continue;
            const nd = du + arcCost(a.u, a.v);
            const dv = r.d[a.v];
            if (dv === null || dv === undefined || nd < dv) {
              r.d[a.v] = nd;
              r.pi[a.v] = a.u;
              r.relax++;
              changed.push(`${a.v} = ${nd} from ${a.u}`);
            }
          }
          if (!quiet)
            yield step(
              changed.length
                ? `Pass ${pass}: relax every residual arc in order. New distances: ${changed.join(', ')}.`
                : `Pass ${pass} changes nothing, so the distances are final.`,
              ['find'],
              3,
              vmarks(
                changed.map((c) => c.split(' ')[0]!),
                'new',
              ),
            );
          if (changed.length === 0) break;
        }
      } else {
        for (;;) {
          const open = V.filter((v) => !r.done.includes(v) && r.d[v] !== null);
          if (open.length === 0) break;
          const u = open.reduce((best, v) =>
            r.d[v]! < r.d[best]! || (r.d[v] === r.d[best] && compareNames(v, best) < 0) ? v : best,
          );
          r.done.push(u);
          r.u = u;
          const changed: string[] = [];
          for (const a of residualArcs(net, r.flow)) {
            if (a.u !== u || r.done.includes(a.v)) continue;
            const nd = r.d[u]! + arcCost(u, a.v);
            const dv = r.d[a.v];
            if (dv === null || dv === undefined || nd < dv) {
              r.d[a.v] = nd;
              r.pi[a.v] = u;
              r.relax++;
              changed.push(`${a.v} = ${nd}`);
            }
          }
          if (!quiet)
            yield step(
              `Take ${u}, the closest vertex not finished yet (d = ${r.d[u]}). ${changed.length ? `Its residual arcs lower ${changed.join(', ')}.` : 'Its residual arcs lower nothing.'}`,
              ['find'],
              3,
              [
                ...vmarks([u], 'active'),
                ...vmarks(
                  changed.map((c) => c.split(' ')[0]!),
                  'new',
                ),
              ],
            );
        }
        r.u = undefined;
      }

      if (r.d[r.t] === null || r.d[r.t] === undefined) {
        r.finished = 'max';
        const reach = order(net).filter((v) => r.d[v] !== null);
        yield step(
          `${r.t} cannot be reached in the residual network: from ${r.s} only ${listWords(reach)} can be. So the flow is maximum.${target ? ` It is ${r.value}, short of the target of ${target}.` : ''}`,
          ['while'],
          2,
          vmarks(reach, 'found'),
        );
        yield step(
          `Done: a maximum flow of ${r.value} at the least possible cost, ${r.cost}${r.paths.length ? `, after ${plural(r.paths.length, 'cheapest path')}: ${r.paths.map((a) => `${a.b} × ${a.unit}`).join(' + ')} = ${r.cost}` : ''}. Every push used the cheapest path left, so no other maximum flow costs less.`,
          ['ret'],
          1,
          vmarks([r.s, r.t], 'found'),
        );
        return st;
      }

      const p = pathOf(r.pi, r.s, r.t);
      const caps = p.slice(1).map((v, i) => residual(net, r.flow, p[i]!, v));
      const room = Math.min(...caps);
      const b = target ? Math.min(room, target - r.value) : room;
      const unit = p.slice(1).reduce((n, v, i) => n + residualCost(net, p[i]!, v, r.flow), 0);
      r.path = p;
      r.b = b;
      r.unit = unit;
      const parts = p.slice(1).map((v, i) => {
        const c = residualCost(net, p[i]!, v, r.flow);
        return `${arrow(p[i]!, v)} ${num(c)}${c < 0 ? ' (sending back)' : ''}`;
      });
      const back = parts.some((x) => x.includes('back'));
      const reduced = dijkstra
        ? ` (the reduced distance is ${r.d[r.t]}, and ${r.d[r.t]} + h(${r.t}) - h(${r.s}) = ${unit})`
        : '';
      yield step(
        `The cheapest path is ${pathText(p)}, costing ${parts.join(' + ')} = ${unit} per unit${reduced}. It has room for ${room}${b < room ? `, but only ${b} more ${b === 1 ? 'unit is' : 'units are'} needed` : ''}.${back ? ' A negative cost means taking back flow sent earlier, and getting its cost back.' : ''}`,
        ['cf'],
        quiet ? 3 : 2,
        vmarks(p, 'active'),
      );
      r.flow = push(net, r.flow, p, b);
      r.value += b;
      r.cost += b * unit;
      r.paths.push({ p, b, unit });
      if (r.h) {
        const h = r.h;
        for (const v of V) if (r.d[v] !== null) h[v] = h[v]! + r.d[v]!;
      }
      yield step(
        `Push ${b} along it: ${b} × ${unit} = ${b * unit}${back ? ', counting the cost given back' : ''}. Now |f| = ${r.value} and the cost is ${r.cost}.${
          r.h
            ? ` Then add each distance to its potential: h = ${order(net)
                .map((v) => `${v} ${r.h![v]}`)
                .join(', ')}.`
            : ''
        }`,
        r.h ? ['aug', 'pot'] : ['aug'],
        2,
        vmarks(p, 'active'),
      );
    }
  },
};

const load = loadNetwork<McSettings, X>({
  parse: PARSE,
  ready: () => 'Press Find min-cost flow.',
});

export const ops = { load, run };

export function checkCost(net: Network, r: McRun): boolean {
  return costOf(net, r.flow) === r.cost;
}

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: McSettings): PseudoBlock[] {
  const dij = settings.method === 'dijkstra';
  const target = Number(settings.target) > 0;
  const lines = [
    L('sig', 0, 'MIN-COST-FLOW(G, s, t)', 'Cheapest flow from s to t:'),
    L('init', 1, 'f = 0; cost = 0', 'Start with no flow, at no cost.'),
    ...(dij ? [L('h0', 1, 'h(v) = 0 for every v', 'Every potential starts at 0.')] : []),
    L(
      'while',
      1,
      target ? 'while |f| < k and t in reach' : 'while t is reachable in G_f',
      target ? 'Until k units are sent (or t is cut off):' : 'While t can still be reached:',
    ),
    L(
      'find',
      2,
      dij ? 'd = DIJKSTRA(G_f, c + h(u) - h(v))' : 'd = BELLMAN-FORD(G_f, c, s)',
      dij ? 'find distances on reduced costs,' : 'find the cheapest distances,',
    ),
    L('cf', 2, 'p = cheapest path s to t', 'take the cheapest path to t,'),
    L(
      'aug',
      2,
      target ? 'push min(c_f(p), k - |f|)' : 'push c_f(p) along p',
      target ? 'push what fits, up to the goal,' : 'push as much as fits along it,',
    ),
    ...(dij ? [L('pot', 2, 'h(v) = h(v) + d(v)', 'and add the distances to h.')] : []),
    L('ret', 1, 'return f, cost', 'The flow is the cheapest of its size.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  const n = s.net;
  return `A flow network with ${plural(n.graph.vertices.length, 'vertex', 'vertices')} and ${plural(n.graph.edges.length, 'arc')}, each with a capacity and a cost per unit of flow. Press Find min-cost flow to send as much as possible from ${n.s ?? 's'} to ${n.t ?? 't'} at the least total cost.`;
}

export function initialVars(s: S) {
  return netVars(s.net);
}

export function describe(s: S): string {
  return describeNetwork(s.net, true);
}

export function describeRun(net: Network, r: McRun): string {
  const flows = net.graph.edges
    .filter((e) => (r.flow[keyOf(e)] ?? 0) > 0)
    .map((e) => `${arrow(e.u, e.v)} ${r.flow[keyOf(e)]}/${e.w}`);
  const where = r.finished
    ? `Finished: flow ${r.value}, cost ${r.cost}.`
    : r.path
      ? `Cheapest path ${pathText(r.path)}, ${r.unit} per unit.`
      : `Flow ${r.value}, cost ${r.cost}.`;
  const d = order(net)
    .filter((v) => r.d[v] !== null)
    .map((v) => `${v} ${dist(r.d[v])}`);
  return `${where} Distances: ${d.join(', ') || 'none'}. Flow on arcs: ${flows.length ? flows.join(', ') : 'none'}.`;
}
