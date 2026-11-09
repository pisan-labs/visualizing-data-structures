/**
 * Push-relabel maximum flow, CLRS style (third edition, 26.4 and 26.5). Instead of whole paths,
 * it moves flow one arc at a time. INITIALIZE-PREFLOW fills every arc out of s, so the vertices
 * next to s hold more flow than they pass on (their excess). Each vertex has a height: s starts
 * at |V|, everything else at 0, and flow may only go one level downhill along an arc with room
 * (an admissible arc). PUSH(u, v) sends min(u.e, c_f(u, v)) down such an arc. When an
 * overflowing vertex has none, RELABEL(u) lifts it to one above its lowest residual
 * neighbour. When nothing overflows, the preflow is a maximum flow; excess that cannot reach t
 * climbs above |V| and runs back to s.
 *
 * Settings
 *   rule      which overflowing vertex to work on next, each drained by DISCHARGE (CLRS):
 *             'fifo'     a queue of overflowing vertices (O(V³))
 *             'highest'  the overflowing vertex with the greatest height (O(V²√E))
 *             'front'    RELABEL-TO-FRONT (CLRS 26.5): a list of the other vertices; a vertex
 *                        that rises moves to the front, and the scan starts again after it (O(V³))
 *   residual  draw the residual network G_f instead of the flow on each arc
 *   layout    the drawing only
 *
 * DISCHARGE keeps a current neighbour per vertex (u.current) into its neighbour list: every
 * vertex joined to it by an arc either way, in name order, so every run is reproducible and the
 * code tabs agree with it. Ties in 'highest' go to name order.
 *
 * Counters: pushes (and how many saturate their arc), relabels, and arc checks (each look at a
 * neighbour in DISCHARGE, plus each residual arc RELABEL looks at). At the end the page runs
 * Edmonds-Karp on the same network, counting its arc checks as the max-flow page does, so the
 * two can be compared (and compare mode puts the two pages side by side).
 *
 * A long run (more than QUIET_AFTER pushes and relabels) shows each later discharge in one step.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { vertexId } from '../../layouts/graph';
import { compareNames, keyOf, listWords, plural } from '../_graph/graph';
import { loadNetwork, netVars, type FlowTemplate, type NetState } from '../_flow/kit';
import {
  arrow,
  cutArcs,
  cutCapacity,
  describeNetwork,
  order,
  parseNetwork,
  pathText,
  push,
  residual,
  setText,
  START_TEXT,
  touching,
  type Flow,
  type Network,
} from '../_flow/network';

export type PrState = NetState;

export type Rule = 'fifo' | 'highest' | 'front';

export interface PrSettings {
  [key: string]: Scalar;
  rule: Rule;
  residual: boolean;
  layout: FlowTemplate;
}

export const defaults: PrSettings = { rule: 'fifo', residual: false, layout: 'lr' };

export const startNetwork = (): Network => parseNetwork(START_TEXT) as Network;

export const QUIET_AFTER = 60;

/** What Edmonds-Karp does on the same network, for the comparison at the end. */
export interface EkCount {
  value: number;
  paths: number;
  checks: number;
}

export interface PrRun {
  s: string;
  t: string;
  flow: Flow;
  h: Record<string, number>;
  e: Record<string, number>;
  /** u.current, as an index into u's neighbour list (its length means NIL). */
  cur: Record<string, number>;
  /** fifo: the queue, front first. highest: the overflowing vertices. front: the list L. */
  list: string[];
  /** The vertex being discharged, and (front) its place in L. */
  u?: string;
  at?: number;
  /** The neighbour DISCHARGE is looking at. */
  v?: string;
  /** The arc a push just used, and how much it sent. */
  arc?: [string, string];
  delta?: number;
  /** The residual arcs out of u that go one level down: where u may push. */
  admissible?: string[];
  pushes: number;
  saturating: number;
  relabels: number;
  checks: number;
  /** The s side of the minimum cut, and Edmonds-Karp's counts, at the end. */
  side?: string[];
  ek?: EkCount;
  done?: boolean;
}

export interface PrExtra {
  run?: PrRun;
}

type S = PrState;
type X = PrExtra;
type Op = OpSpec<S, PrSettings, X>;
type PrStep = Step<S, X>;

export function init(): S {
  return { net: startNetwork() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

function clone(r: PrRun): PrRun {
  return {
    ...r,
    flow: { ...r.flow },
    h: { ...r.h },
    e: { ...r.e },
    cur: { ...r.cur },
    list: [...r.list],
    arc: r.arc && [r.arc[0], r.arc[1]],
    admissible: r.admissible && [...r.admissible],
    side: r.side && [...r.side],
    ek: r.ek && { ...r.ek },
  };
}

export const flowValue = (r: PrRun): number => r.e[r.t] ?? 0;

/** A number with a real minus sign, for what learners read. */
export const minus = (x: number): string => (x < 0 ? `−${-x}` : String(x));

function runVars(net: Network, r: PrRun): Record<string, Scalar> {
  return {
    ...netVars(net),
    '|f|': flowValue(r),
    pushes: r.pushes,
    saturating: r.saturating,
    relabels: r.relabels,
    'arc checks': r.checks,
    ...(r.ek ? { 'EK paths': r.ek.paths, 'EK checks': r.ek.checks } : {}),
  };
}

/** The vertices s reaches in the residual network, in name order (the s side of the cut). */
export function reachable(net: Network, flow: Flow, s: string): string[] {
  const seen = new Set([s]);
  const q = [s];
  for (let i = 0; i < q.length; i++)
    for (const v of touching(net, q[i]!))
      if (!seen.has(v) && residual(net, flow, q[i]!, v) > 0) {
        seen.add(v);
        q.push(v);
      }
  return order(net).filter((v) => seen.has(v));
}

/**
 * Edmonds-Karp on the same network, counting as the max-flow page does: one arc check per
 * neighbour a breadth-first search looks at, and each search stops when it reaches t.
 */
export function edmondsKarp(net: Network): EkCount {
  const s = net.s!;
  const t = net.t!;
  let flow: Flow = {};
  let value = 0;
  let paths = 0;
  let checks = 0;
  for (;;) {
    const parent: Record<string, string> = {};
    const seen = new Set([s]);
    const q = [s];
    let found = false;
    while (q.length && !found) {
      const u = q.shift()!;
      for (const v of touching(net, u)) {
        checks++;
        if (residual(net, flow, u, v) <= 0 || seen.has(v)) continue;
        seen.add(v);
        parent[v] = u;
        q.push(v);
        if (v === t) {
          found = true;
          break;
        }
      }
    }
    if (!found) return { value, paths, checks };
    const p = [t];
    while (p[0] !== s) p.unshift(parent[p[0]!]!);
    const b = Math.min(...p.slice(1).map((v, i) => residual(net, flow, p[i]!, v)));
    flow = push(net, flow, p, b);
    value += b;
    paths++;
  }
}

/** The residual arcs out of u that go exactly one level down. */
function admissibleOf(net: Network, r: PrRun, u: string): string[] {
  return touching(net, u).filter(
    (v) => residual(net, r.flow, u, v) > 0 && r.h[u] === (r.h[v] ?? 0) + 1,
  );
}

const ruleName: Record<Rule, string> = {
  fifo: 'FIFO',
  highest: 'highest-label',
  front: 'relabel-to-front',
};

/** The final answer in the code tabs' words. */
export function runSummary(net: Network, r: PrRun): string {
  const flows = net.graph.edges.map((e) => `${e.u}>${e.v}:${r.flow[keyOf(e)] ?? 0}`).join(' ');
  const side = [...(r.side ?? [])].sort(compareNames).join(' ');
  return `${flowValue(r)} | ${r.pushes} | ${r.relabels} | ${side} | ${flows}`.trimEnd();
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
      } satisfies PrStep;
      return st;
    }
    const rule = settings.rule;
    const s = net.s;
    const t = net.t;
    const n = g.vertices.length;
    const inner = order(net).filter((v) => v !== s && v !== t);
    const nbrs = new Map(g.vertices.map((v) => [v, touching(net, v)]));
    const r: PrRun = {
      s,
      t,
      flow: {},
      h: Object.fromEntries(g.vertices.map((v) => [v, 0])),
      e: Object.fromEntries(g.vertices.map((v) => [v, 0])),
      cur: Object.fromEntries(g.vertices.map((v) => [v, 0])),
      list: [],
      pushes: 0,
      saturating: 0,
      relabels: 0,
      checks: 0,
    };
    r.h[s] = n;
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): PrStep => ({
      state: st,
      marks,
      say,
      lines,
      level,
      vars: runVars(net, r),
      extra: { run: clone(r) },
    });
    const vm = (vs: string[], role: Mark['role']) => vs.map((v) => mark(vertexId(v), role));
    const overflowing = (v: string) => v !== s && v !== t && r.e[v]! > 0;
    const listName = rule === 'fifo' ? 'the queue' : rule === 'highest' ? 'the active set' : 'L';

    yield step(
      `Start with no flow, every excess 0 and every height 0, except s: h(${s}) = |V| = ${n}. Flow only ever runs one level downhill.`,
      ['init', 'hs'],
      2,
      vm([s], 'active'),
    );

    // INITIALIZE-PREFLOW: fill every arc out of s.
    const out = g.edges.filter((e) => e.u === s);
    for (const e of out) {
      r.flow = push(net, r.flow, [s, e.v], e.w);
      r.e[e.v]! += e.w;
      r.e[s]! -= e.w;
      r.arc = [s, e.v];
      r.delta = e.w;
      yield step(
        `Fill ${arrow(s, e.v)} to its capacity, ${e.w}. ${e.v === t ? `That goes straight into the sink.` : `${e.v} now holds ${r.e[e.v]} more than it passes on: its excess.`}`,
        ['fill'],
        3,
        vm([e.v], 'new'),
      );
    }
    r.arc = undefined;
    r.delta = undefined;
    const full = inner.filter(overflowing);
    if (rule === 'front') r.list = [...inner];
    else r.list = out.map((e) => e.v).filter((v) => overflowing(v) && !r.list.includes(v));
    yield step(
      out.length === 0
        ? `${s} has no arcs out, so nothing can flow. Every excess stays 0.`
        : `The preflow: every arc out of ${s} is full, so e(${s}) = ${minus(r.e[s]!)}. ${full.length ? `${listWords(full)} ${full.length === 1 ? 'overflows' : 'overflow'}.` : 'Nothing overflows.'} ${
            rule === 'front'
              ? `L lists the other vertices in name order: ${r.list.length ? listWords(r.list) : 'none'}.`
              : full.length
                ? `${rule === 'fifo' ? 'They join the queue' : 'They make up the active set'}.`
                : ''
          }`.trim(),
      ['fill', 'list'],
      2,
      vm(full, 'visit'),
    );

    let ops = 0;
    const quiet = () => ops >= QUIET_AFTER;
    let warned = false;

    /** DISCHARGE(u): push and relabel until u has no excess. */
    const discharge = function* (u: string): Generator<PrStep, boolean, void> {
      const list = nbrs.get(u)!;
      let rose = false;
      let pushed = 0;
      let lifted = 0;
      while (r.e[u]! > 0) {
        if (quiet() && !warned) {
          warned = true;
          yield step(
            `That is ${QUIET_AFTER} pushes and relabels already. From here on each discharge is shown in one step.`,
            ['dwhile'],
            2,
            vm([u], 'active'),
          );
        }
        const i = r.cur[u]!;
        if (i >= list.length) {
          // RELABEL(u): one above the lowest residual neighbour.
          const res = list.filter((v) => residual(net, r.flow, u, v) > 0);
          r.checks += list.length;
          const low = Math.min(...res.map((v) => r.h[v]!));
          const old = r.h[u]!;
          r.h[u] = low + 1;
          r.cur[u] = 0;
          r.relabels++;
          ops++;
          lifted++;
          rose = true;
          r.v = undefined;
          r.arc = undefined;
          r.admissible = admissibleOf(net, r, u);
          if (!quiet())
            yield step(
              `No admissible arc out of ${u}. Its residual arcs go to ${listWords(res.map((v) => `${v} (h ${r.h[v]})`))}. Relabel ${u} from ${old} to 1 + ${low} = ${r.h[u]}${r.h[u]! > n ? `, above s (${n}): this excess is on its way back to ${s}` : ''}, and start again at its first neighbour.`,
              ['nil', 'relabel', 'rl'],
              2,
              [...vm([u], 'active'), ...vm(r.admissible, 'visit')],
            );
          continue;
        }
        const v = list[i]!;
        r.v = v;
        r.checks++;
        const room = residual(net, r.flow, u, v);
        if (room > 0 && r.h[u] === r.h[v]! + 1) {
          const d = Math.min(r.e[u]!, room);
          const fresh = v !== s && v !== t && r.e[v] === 0;
          r.flow = push(net, r.flow, [u, v], d);
          r.e[u]! -= d;
          r.e[v]! += d;
          r.pushes++;
          ops++;
          pushed++;
          if (d === room) r.saturating++;
          r.arc = [u, v];
          r.delta = d;
          if (fresh && rule !== 'front') r.list.push(v);
          const back = v === s;
          if (!quiet())
            yield step(
              `Push ${d} from ${u} to ${v}: ${u} is one level above ${v} (${r.h[u]} = ${r.h[v]} + 1) and ${arrow(u, v)} has room ${room}. ${
                d === room
                  ? `A saturating push: ${arrow(u, v)} is now full${r.e[u] ? `, and ${u} still holds ${r.e[u]}` : ''}.`
                  : `${u}'s excess is gone, with room to spare.`
              }${back ? ` That flow goes back to the source.` : v === t ? ` It reaches the sink: |f| = ${r.e[t]} so far.` : ''}${fresh && rule !== 'front' ? ` ${v} starts to overflow and joins ${listName}.` : ''}`,
              ['adm', 'push', 'delta', 'move-f', ...(fresh && rule === 'fifo' ? ['enq'] : [])],
              2,
              [...vm([u], 'active'), ...vm([v], 'new')],
            );
          r.arc = undefined;
          r.delta = undefined;
          continue;
        }
        r.cur[u] = i + 1;
        if (!quiet())
          yield step(
            room <= 0
              ? `${arrow(u, v)} has no room left in the residual network. Move on to ${u}'s next neighbour.`
              : `${arrow(u, v)} has room ${room}, but it does not go one level down: h(${u}) = ${r.h[u]} and h(${v}) = ${r.h[v]}. Move on.`,
            ['cur', 'next'],
            3,
            [...vm([u], 'active'), ...vm([v], 'compare')],
          );
      }
      r.v = undefined;
      r.admissible = undefined;
      if (quiet() && (pushed || lifted))
        yield step(
          `Discharge ${u}: ${plural(pushed, 'push', 'pushes')} and ${plural(lifted, 'relabel')}. Now h(${u}) = ${r.h[u]}, |f| = ${r.e[t]} so far.`,
          ['dis'],
          2,
          vm([u], 'active'),
        );
      return rose;
    };

    if (rule === 'front') {
      let i = 0;
      while (i < r.list.length) {
        const u = r.list[i]!;
        r.u = u;
        r.at = i;
        if (r.e[u]! <= 0) {
          if (!quiet())
            yield step(
              `Next in L: ${u}. It has no excess, so DISCHARGE has nothing to do.`,
              ['while', 'pick'],
              3,
              vm([u], 'active'),
            );
          i++;
          continue;
        }
        r.admissible = admissibleOf(net, r, u);
        if (!quiet())
          yield step(
            `Next in L: ${u}, with excess ${r.e[u]} at height ${r.h[u]}. Discharge it.`,
            ['while', 'pick'],
            2,
            [...vm([u], 'active'), ...vm(r.admissible, 'visit')],
          );
        const rose = yield* discharge(u);
        if (rose) {
          r.list = [u, ...r.list.filter((x) => x !== u)];
          r.at = 0;
          if (!quiet())
            yield step(
              `${u} rose, so it moves to the front of L: ${listWords(r.list)}. Carry on with the vertex after it.`,
              ['move'],
              3,
              vm([u], 'active'),
            );
          i = 1;
        } else i++;
      }
    } else {
      while (r.list.length) {
        let u: string;
        if (rule === 'fifo') u = r.list.shift()!;
        else {
          const best = [...r.list].sort((a, b) => r.h[b]! - r.h[a]! || compareNames(a, b))[0]!;
          r.list = r.list.filter((x) => x !== best);
          u = best;
        }
        r.u = u;
        r.admissible = admissibleOf(net, r, u);
        if (!quiet())
          yield step(
            rule === 'fifo'
              ? `Take ${u} from the front of the queue: excess ${r.e[u]}, height ${r.h[u]}. Discharge it until its excess is gone.`
              : `${u} is the highest overflowing vertex (height ${r.h[u]}, excess ${r.e[u]}). Discharge it until its excess is gone.`,
            ['while', 'pick'],
            2,
            [...vm([u], 'active'), ...vm(r.admissible, 'visit')],
          );
        yield* discharge(u);
      }
    }

    r.u = undefined;
    r.at = undefined;
    r.v = undefined;
    r.admissible = undefined;
    r.list = rule === 'front' ? r.list : [];
    const value = flowValue(r);
    yield step(
      `No vertex overflows, so the preflow is a flow: what leaves s reaches t. |f| = e(${t}) = ${value}${r.e[s] !== -value ? `, and the other ${-r.e[s]! - value} that left ${s} came back` : ''}.`,
      ['ret'],
      2,
      vm([t], 'found'),
    );
    const side = reachable(net, r.flow, s);
    r.side = side;
    r.ek = edmondsKarp(net);
    r.done = true;
    const cut = cutArcs(net, side);
    const cap = cutCapacity(net, side);
    const ek = r.ek;
    yield step(
      `Done: the maximum flow is ${value}. In the residual network ${s} reaches only S = ${setText(side)}; the arcs across that cut, ${cut.length ? listWords(cut.map((e) => `${arrow(e.u, e.v)} (${e.w})`)) : 'none'}, add up to ${cap}, the same. ${ruleName[rule]} took ${plural(r.pushes, 'push', 'pushes')} (${r.saturating} saturating), ${plural(r.relabels, 'relabel')} and ${plural(r.checks, 'arc check')}. Edmonds-Karp takes ${plural(ek.paths, 'augmenting path')} and ${plural(ek.checks, 'arc check')} here.`,
      ['ret'],
      1,
      vm(side, 'found'),
    );
    return st;
  },
};

const load = loadNetwork<PrSettings, X>({
  parse: {},
  ready: () => 'Press Find max flow.',
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS 26.4 and 26.5. Lines stay short for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PrSettings): PseudoBlock[] {
  const rule = settings.rule;
  const head = [
    L(
      'sig',
      0,
      rule === 'front' ? 'RELABEL-TO-FRONT(G, s, t)' : 'PUSH-RELABEL(G, s, t)',
      'Maximum flow from s to t:',
    ),
    L('init', 1, 'u.h = u.e = 0; f = 0', 'Every height, excess and flow starts at 0,'),
    L('hs', 1, 's.h = |V|', 'except the source, |V| levels up.'),
    L('fill', 1, 'for v in s.Adj: push c(s,v)', 'Fill every arc out of s.'),
  ];
  const loop =
    rule === 'fifo'
      ? [
          L('list', 1, 'Q = overflowing vertices', 'Queue the vertices that overflow.'),
          L('while', 1, 'while Q is not empty', 'While one is waiting,'),
          L('pick', 2, 'u = DEQUEUE(Q)', 'take the one at the front'),
          L('dis', 2, 'DISCHARGE(u)', 'and drain it.'),
        ]
      : rule === 'highest'
        ? [
            L('list', 1, 'A = overflowing vertices', 'Collect the vertices that overflow.'),
            L('while', 1, 'while A is not empty', 'While there are any,'),
            L('pick', 2, 'u = highest vertex in A', 'take the one standing highest'),
            L('dis', 2, 'DISCHARGE(u)', 'and drain it.'),
          ]
        : [
            L('list', 1, 'L = V − {s, t}', 'List the other vertices.'),
            L('while', 1, 'for u in L, from the head', 'Go down the list:'),
            L('pick', 2, 'old = u.h; DISCHARGE(u)', 'drain each one,'),
            L('move', 2, 'if u.h > old: u to front', 'and if it rose, move it to the front.'),
          ];
  const dis = [
    L('ret', 1, 'return f', 'Nothing overflows: f is maximum.'),
    L('dsig', 0, 'DISCHARGE(u)', 'To drain u:'),
    L('dwhile', 1, 'while u.e > 0', 'while u still has excess,'),
    L('cur', 2, 'v = u.current', 'look at its current neighbour.'),
    L('nil', 2, 'if v == NIL', 'Out of neighbours?'),
    L('relabel', 3, 'RELABEL(u); restart', 'Lift u, start again at the first.'),
    L('adm', 2, 'elif c_f(u,v)>0, u.h=v.h+1', 'Room, and one level down?'),
    L('push', 3, 'PUSH(u, v)', 'Push as much as fits.'),
    ...(rule === 'fifo'
      ? [L('enq', 3, 'if v.e was 0: ENQUEUE(v)', 'A new overflow joins Q.')]
      : []),
    L('next', 2, 'else u.current = next', 'Otherwise try the next one.'),
    L('psig', 0, 'PUSH(u, v)', 'A push:'),
    L('delta', 1, 'Δ = min(u.e, c_f(u, v))', 'the excess or the room, the smaller,'),
    L('move-f', 1, 'f += Δ on (u,v); u.e −= Δ', 'moves from u to v.'),
    L('rsig', 0, 'RELABEL(u)', 'A relabel:'),
    L('rl', 1, 'u.h = 1 + min v.h, c_f(u,v)>0', 'one above u’s lowest exit.'),
  ];
  return [{ op: 'run', lines: [...head, ...loop, ...dis] }];
}

export function initialSay(s: S): string {
  const n = s.net;
  return `${describeNetwork(n).split('. ').slice(0, 2).join('. ')}. Push-relabel fills the arcs out of ${n.s ?? 's'} first and then lets the extra run downhill, one arc at a time. Press Find max flow.`;
}

export function initialVars(s: S) {
  return netVars(s.net);
}

export function describe(s: S): string {
  return describeNetwork(s.net);
}

/** The scene label: where a run stands. */
export function describeRun(net: Network, r: PrRun): string {
  const heights = order(net)
    .map((v) => `${v} h ${r.h[v]} e ${r.e[v]}`)
    .join(', ');
  const where = r.side
    ? `Maximum flow ${flowValue(r)}. Minimum cut S = ${setText(r.side)}, capacity ${cutCapacity(net, r.side)}.`
    : r.u
      ? `Discharging ${r.u}.${r.arc ? ` Pushed ${r.delta} along ${pathText(r.arc)}.` : ''}`
      : `Flow into t so far ${flowValue(r)}.`;
  return `${where} Heights and excesses: ${heights}.`;
}
