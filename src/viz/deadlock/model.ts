/**
 * Deadlock: two threads take locks a and b in opposite orders. Run T1's lock(a) and T2's lock(b)
 * and each then waits for the lock the other holds, for ever. The wait-for graph has an edge
 * T -> U when T waits for a lock U holds, and a deadlock on locks is a cycle in it; "Find the
 * cycle" runs the depth-first search of /dfs/ (CLRS colors: gray while on the search path, black
 * when done; an edge to a gray thread closes a cycle). The fix is one global order: every thread
 * takes a before b, and every interleaving finishes. With three threads, T2 still takes them the
 * other way round, so a cycle can form between T1 and T2 or between T2 and T3, and the third
 * thread waits behind it without being on it.
 */
import type { Mark, Scalar } from '../../engine/types';
import { lockId } from '../../layouts/lanes';
import { findCycle, waitFor, type SearchEvent, type WaitEdge } from '../_threads/deadlock';
import {
  initState,
  stuck,
  type MachineState,
  type Program,
  type StepEvent,
} from '../_threads/machine';
import { lineId } from '../_threads/page';
import { parseProgram } from '../_threads/parse';
import {
  finishes,
  list,
  threadsOps,
  threadsPseudocode,
  type ThreadsSpec,
  type ThreadsState,
} from '../_threads2/page';

export type Order = 'opposite' | 'global';

export interface DeadlockSettings {
  [key: string]: string | number | boolean | null;
  threads: number;
  order: Order;
}

export const defaults: DeadlockSettings = { threads: 2, order: 'opposite' };

export type Color = 'white' | 'gray' | 'black';

/** What "Find the cycle" shows: the search's colors, the edge it is on, and the cycle found. */
export interface SearchView {
  colors: Color[];
  edge?: { from: number; to: number; kind: 'tree' | 'back' | 'done' };
  cycle?: number[];
}

export interface DeadlockState extends ThreadsState {
  search?: SearchView;
}

const clampThreads = (n: number) => (n >= 3 ? 3 : 2);
export const orderOf = (s: DeadlockSettings): Order =>
  s.order === 'global' ? 'global' : 'opposite';

/** The order thread t takes its locks in. */
export function lockOrder(order: Order, t: number): [string, string] {
  return order === 'opposite' && t === 1 ? ['b', 'a'] : ['a', 'b'];
}

export function programText(settings: DeadlockSettings): string {
  const k = clampThreads(settings.threads);
  const order = orderOf(settings);
  return Array.from({ length: k }, (_, t) => {
    const [x, y] = lockOrder(order, t);
    return [`thread T${t + 1}`, `  lock(${x})`, `  lock(${y})`, `  unlock(${y})`, `  unlock(${x})`];
  })
    .flat()
    .join('\n');
}

const programs = new Map<string, Program>();
export function program(settings: DeadlockSettings): Program {
  const key = programText(settings);
  let p = programs.get(key);
  if (!p) {
    const parsed = parseProgram(key);
    if (parsed instanceof Error) throw parsed;
    p = parsed;
    programs.set(key, p);
  }
  return p;
}

const T = (t: number) => `T${t + 1}`;

/** The cycle of the wait-for graph, as thread indices, or null. */
export const cycleOf = (s: MachineState) => findCycle(s.threads.length, waitFor(s).edges).cycle;

/** The cycle written out from its lowest thread: "T1 → T2 → T1". */
export function cycleText(c: number[]): string {
  const i = c.indexOf(Math.min(...c));
  const r = [...c.slice(i), ...c.slice(0, i)];
  return [...r, r[0]!].map(T).join(' → ');
}

export function outcome(_p: Program, s: MachineState): string {
  if (!stuck(s)) return 'all done';
  const c = cycleOf(s);
  return c ? `deadlock, ${list([...c].sort((a, b) => a - b).map(T))}` : 'stuck';
}

export function vars(_p: Program, s: MachineState): Record<string, Scalar> {
  const edges = waitFor(s).edges;
  const c = cycleOf(s);
  return {
    steps: s.schedule.length,
    waiting: s.threads.filter((x) => x.status === 'blocked').length,
    edges: edges.length,
    cycle: c ? cycleText(c) : 'none',
  };
}

const holds = (s: MachineState, t: number) =>
  Object.entries(s.locks)
    .filter(([, l]) => l.holder === t)
    .map(([name]) => name);

/** "T1 waits for b, which T2 holds" for each edge. */
const edgeWords = (edges: WaitEdge[]) =>
  edges.map(([a, b, lock]) => `${T(a)} waits for ${lock}, which ${T(b)} holds`);

export function narrate(
  p: Program,
  before: MachineState,
  ev: StepEvent,
  after: MachineState,
): string[] {
  const parts: string[] = [];
  const t = ev.thread;
  if (ev.blocked) {
    const c = cycleOf(after);
    const h = after.locks[ev.blocked.name]!.holder!;
    parts.push(
      c
        ? `The wait-for graph now has the cycle ${cycleText(c)}: each thread on it waits for a lock the next one holds.`
        : `That is an edge ${T(t)} → ${T(h)} in the wait-for graph: ${T(t)} can go on only after ${T(h)} unlocks ${ev.blocked.name}.`,
    );
  }
  if (ev.instr.kind === 'lock' && !ev.blocked && !over(after)) {
    // Is the program now headed for deadlock whatever happens? (It was not before this step.)
    const doomed = (m: MachineState) =>
      finishes(p, m, (x) => (stuck(x) ? 'stuck' : 'done')).every((o) => o === 'stuck');
    if (doomed(after) && !doomed(before)) {
      const others = after.threads.flatMap((_, u) =>
        u !== t && holds(after, u).length ? [u] : [],
      );
      const o = others[0];
      parts.push(
        o === undefined
          ? 'From here, every schedule ends in deadlock.'
          : `${T(t)} holds ${holds(after, t).join(' and ')} and ${T(o)} holds ${holds(after, o).join(' and ')}, and each needs the other’s next. From here, every schedule ends in deadlock.`,
      );
    }
  }
  return parts;
}

const over = (s: MachineState) => s.threads.every((x) => x.status !== 'ready');

export function ending(_p: Program, s: MachineState): string {
  if (!stuck(s)) return 'Every thread is done: no deadlock this time.';
  const edges = waitFor(s).edges;
  const c = cycleOf(s);
  const off = c
    ? s.threads.flatMap((x, t) => (x.status === 'blocked' && !c.includes(t) ? [t] : []))
    : [];
  return `No thread can run: ${edgeWords(edges).join('; ')}. ${c ? `That is a cycle, ${cycleText(c)}: deadlock.` : ''}${off.length ? ` ${list(off.map(T))} ${off.length > 1 ? 'are' : 'is'} stuck too, waiting behind the cycle without being on it.` : ''} Press Find the cycle to watch the search find it.`;
}

/** Shape ids of the wait-for graph drawn in its panel. */
export const nodeId = (t: number) => `wfg-n-${t}`;
export const edgeId = (a: number, b: number) => `wfg-e-${a}-${b}`;

/** "Find the cycle": the depth-first search on the wait-for graph of the current state. */
function* cycleSearch(s: DeadlockState, p: Program) {
  const n = p.threads.length;
  const edges = waitFor(s.m).edges;
  const v = vars(p, s.m);
  const colors: Color[] = Array(n).fill('white');
  const view = (extra: Partial<SearchView> = {}): DeadlockState => ({
    ...s,
    search: { colors: [...colors], ...extra },
  });
  if (!edges.length) {
    const st = view();
    yield {
      state: st,
      marks: [],
      say: `The wait-for graph has an edge T → U when T waits for a lock that U holds. Right now nobody waits for a lock another thread holds, so there are no edges and no cycle: no deadlock.`,
      lines: ['cycle.sig', 'cycle.build', 'cycle.none'],
      vars: v,
      level: 1 as const,
    };
    return st;
  }
  yield {
    state: view(),
    marks: edges.map(([a, b]) => ({ id: edgeId(a, b), role: 'visit' as const })),
    say: `The wait-for graph has an edge T → U when T waits for a lock that U holds: ${list(edges.map(([a, b, l]) => `${T(a)} → ${T(b)} (${l})`))}. A deadlock is a cycle in it. Search for one depth first, as on the DFS page: a thread turns gray when the search enters it and black when it is done, and an edge to a gray thread closes a cycle.`,
    lines: ['cycle.sig', 'cycle.build'],
    vars: v,
    level: 2 as const,
  };
  const { cycle, trace } = findCycle(n, edges);
  for (const e of trace as SearchEvent[]) {
    if (e.kind === 'enter') {
      colors[e.node] = 'gray';
      yield {
        state: view(),
        marks: [{ id: nodeId(e.node), role: 'active' as const }],
        say: `Enter ${T(e.node)}: color it gray. It is on the search path now.`,
        lines: ['cycle.visit'],
        vars: v,
        level: 2 as const,
      };
    } else if (e.kind === 'edge') {
      const say =
        e.edge === 'back'
          ? `Edge ${T(e.from)} → ${T(e.to)}: ${T(e.to)} is gray, still on the search path, so this edge closes a cycle.`
          : e.edge === 'tree'
            ? `Edge ${T(e.from)} → ${T(e.to)}: ${T(e.to)} is white, not seen yet, so the search goes there.`
            : `Edge ${T(e.from)} → ${T(e.to)}: ${T(e.to)} is black, already done, and no cycle went through it.`;
      yield {
        state: view({ edge: { from: e.from, to: e.to, kind: e.edge } }),
        marks: [
          {
            id: edgeId(e.from, e.to),
            role: e.edge === 'back' ? ('error' as const) : ('active' as const),
          },
        ],
        say,
        lines: [e.edge === 'back' ? 'cycle.back' : e.edge === 'tree' ? 'cycle.tree' : 'cycle.edge'],
        vars: v,
        level: 2 as const,
      };
    } else {
      colors[e.node] = 'black';
      yield {
        state: view(),
        marks: [{ id: nodeId(e.node), role: 'done' as const }],
        say: `Every edge out of ${T(e.node)} is done: color it black. No cycle goes through it.`,
        lines: ['cycle.leave'],
        vars: v,
        level: 2 as const,
      };
    }
  }
  const end = view(cycle ? { cycle } : {});
  const marks: Mark[] = cycle
    ? [
        ...cycle.map((t) => ({ id: nodeId(t), role: 'error' as const })),
        ...cycle.map((t, i) => ({
          id: edgeId(t, cycle[(i + 1) % cycle.length]!),
          role: 'error' as const,
        })),
        ...cycle.map((t) => ({
          id: lockId(edges.find(([a]) => a === t)![2]),
          role: 'error' as const,
        })),
      ]
    : [];
  yield {
    state: end,
    marks,
    say: cycle
      ? `Cycle: ${cycleText(cycle)}. ${list(cycle.map((t, i) => `${T(t)} waits for ${T(cycle[(i + 1) % cycle.length]!)}`))}, so none of them can ever run again: deadlock.${s.m.threads.some((x, t) => x.status === 'blocked' && !cycle.includes(t)) ? ' A thread off the cycle can be stuck behind it, but breaking the cycle frees it too.' : ''}`
      : 'The search is done and found no edge to a gray thread: no cycle, so no deadlock. The threads that wait will get their locks once the holders go on.',
    lines: [cycle ? 'cycle.back' : 'cycle.none'],
    vars: v,
    level: 1 as const,
  };
  return end;
}

export const spec: ThreadsSpec<DeadlockSettings, DeadlockState> = {
  program,
  outcome: (p, s) => outcome(p, s),
  good: (o) => o === 'all done',
  verdict: (o) => (o === 'all done' ? 'ok' : 'stuck'),
  endsWith: (o) =>
    o === 'all done'
      ? 'with every thread done'
      : `in ${o.replace('deadlock, ', 'deadlock between ')}`,
  rank: (o) => (o === 'all done' ? 0 : o.length),
  narrate: (p, before, ev, after) => narrate(p, before, ev, after),
  vars: (p, m) => vars(p, m),
  lanes: 3,
  ending: (p, s) => ending(p, s),
  startText: () => 'a and b are free',
  next: (s, m) => ({ m, tally: s.tally }),
  head: (p, t, settings) => {
    const [x, y] = lockOrder(orderOf(settings), t);
    return {
      text: `${p.threads[t]!.name}: take ${x}, then ${y}`,
      plain: `${p.threads[t]!.name} takes ${x} first, then ${y}:`,
    };
  },
};

export const ops = {
  ...threadsOps(spec),
  cycle: {
    label: 'Find the cycle',
    arity: 0,
    *run(s: DeadlockState, _args: unknown, { settings }: { settings: DeadlockSettings }) {
      return yield* cycleSearch(s, program(settings));
    },
  },
};

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export const pseudocode = (settings: DeadlockSettings) => [
  ...threadsPseudocode(spec, settings, {
    text: 'tally[done or deadlock] += 1',
    plain: 'count one more schedule that ends this way.',
  }),
  {
    op: 'cycle',
    lines: [
      L('cycle.sig', 0, 'find-cycle(state)', 'To look for a deadlock:'),
      L(
        'cycle.build',
        1,
        'G = wait-for graph: T → U if T waits for a lock U holds',
        'Draw an arrow from each waiting thread to the holder of its lock.',
      ),
      L(
        'cycle.for',
        1,
        'for each thread u: if u is white, visit(u)',
        'Start a search from each thread not seen yet.',
      ),
      L(
        'cycle.visit',
        1,
        'visit(u): u.color = gray',
        'Entering a thread: it is on the search path.',
      ),
      L('cycle.edge', 2, 'for each edge u → v', 'Follow each arrow out of it.'),
      L(
        'cycle.back',
        3,
        'if v is gray: cycle found',
        'An arrow back to the path closes a cycle: deadlock.',
      ),
      L('cycle.tree', 3, 'if v is white: visit(v)', 'An arrow to a new thread: search from there.'),
      L('cycle.leave', 2, 'u.color = black', 'Every arrow out of it is done.'),
      L('cycle.none', 1, 'no gray v found: no cycle', 'No arrow back to the path: no deadlock.'),
    ],
  },
];

export { lineId };

export function init(settings: DeadlockSettings): DeadlockState {
  return { m: initState(program(settings)) };
}

export function initialSay(_s: DeadlockState, settings: DeadlockSettings): string {
  const k = clampThreads(settings.threads);
  if (orderOf(settings) === 'global')
    return `${k} threads each take lock a, then lock b, then let go of both: one global order. Try to make them wait for each other. You can’t.`;
  return k === 2
    ? 'T1 takes lock a, then b. T2 takes b, then a: the opposite order. Step T1 once and T2 once, and see what happens next.'
    : 'T1 and T3 take lock a, then b; T2 takes b, then a. A cycle can form between T2 and either of the others. Be the scheduler and find one.';
}

export const initialVars = (s: DeadlockState, settings: DeadlockSettings) =>
  vars(program(settings), s.m);
