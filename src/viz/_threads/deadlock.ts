/**
 * Deadlock: the wait-for graph of a state and a cycle in it, found by depth-first search with
 * CLRS's colors, as on /dfs/: a vertex turns gray when the search enters it and black when it
 * is done, and an edge to a gray vertex (a back edge) closes a cycle.
 *
 * The graph has a vertex per thread and an edge t -> h when t is blocked on a lock that h holds
 * (a thread that locks a lock it already holds has an edge to itself). Semaphores and condition
 * variables have no holder, so a thread blocked on one has no edge: `stuck` in machine.ts covers
 * those cases (nobody can run), and a cycle here is the classic deadlock on locks.
 *
 *   waitFor(s)           { edges: [from, to, lock][] }, in thread order
 *   findCycle(n, edges)  { cycle, trace }: the first cycle the search meets, as thread indices
 *                        in the order the edges run (cycle[i] waits for cycle[i + 1], and the
 *                        last waits for the first), or null; and the search's events in order
 *                        (enter, edge with its kind, leave), for pages that animate the search
 *   deadlockCycle(s)     findCycle on the wait-for graph of s, the cycle only
 */
import type { MachineState } from './machine';

export type WaitEdge = [from: number, to: number, lock: string];

export function waitFor(s: MachineState): { edges: WaitEdge[] } {
  const edges: WaitEdge[] = [];
  s.threads.forEach((t, i) => {
    if (t.status !== 'blocked' || t.on?.kind !== 'lock') return;
    const h = s.locks[t.on.name]?.holder;
    if (h !== null && h !== undefined) edges.push([i, h, t.on.name]);
  });
  return { edges };
}

export type SearchEvent =
  | { kind: 'enter'; node: number }
  | { kind: 'edge'; from: number; to: number; edge: 'tree' | 'back' | 'done' }
  | { kind: 'leave'; node: number };

/**
 * Depth-first search from each white vertex in index order, edges in the order given. Stops at
 * the first back edge: the cycle is the gray path from its head down to its tail.
 */
export function findCycle(
  n: number,
  edges: readonly (readonly [number, number, ...unknown[]])[],
): { cycle: number[] | null; trace: SearchEvent[] } {
  const color: ('white' | 'gray' | 'black')[] = Array(n).fill('white');
  const out: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) out[a]!.push(b);
  const trace: SearchEvent[] = [];
  const path: number[] = [];
  let cycle: number[] | null = null;
  const visit = (u: number): boolean => {
    color[u] = 'gray';
    path.push(u);
    trace.push({ kind: 'enter', node: u });
    for (const v of out[u]!) {
      if (color[v] === 'gray') {
        trace.push({ kind: 'edge', from: u, to: v, edge: 'back' });
        cycle = path.slice(path.indexOf(v));
        return true;
      }
      if (color[v] === 'black') {
        trace.push({ kind: 'edge', from: u, to: v, edge: 'done' });
        continue;
      }
      trace.push({ kind: 'edge', from: u, to: v, edge: 'tree' });
      if (visit(v)) return true;
    }
    color[u] = 'black';
    path.pop();
    trace.push({ kind: 'leave', node: u });
    return false;
  };
  for (let u = 0; u < n; u++) if (color[u] === 'white' && visit(u)) break;
  return { cycle, trace };
}

/** The deadlock cycle of a state, as thread indices, or null. */
export function deadlockCycle(s: MachineState): number[] | null {
  return findCycle(s.threads.length, waitFor(s).edges).cycle;
}
