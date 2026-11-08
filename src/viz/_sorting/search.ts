/**
 * Shared pieces for the searching pages that need sorted input (interpolation, exponential and
 * ternary search): the "is A sorted?" check, a Sort A operation, a load operation that warns
 * about unsorted values, the driver query for "search x", and plain counts of what binary
 * search would do on the same input, for comparisons in the narration.
 */
import type { Mark, OpCall, OpSpec } from '../../engine/types';
import {
  at,
  firstDescent,
  loadOp,
  mark,
  valuesOf,
  vid,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
} from './kit';

/** The first two values out of order, or null when A is sorted. */
export function outOfOrder(s: ArrayState): { say: string; marks: Mark[] } | null {
  const d = firstDescent(valuesOf(s));
  if (d < 0) return null;
  const p = s.a[d]!;
  const q = s.a[d + 1]!;
  return {
    say: `A is not sorted: ${at(d, p)} comes before ${at(d + 1, q)}, which is smaller.`,
    marks: [mark(vid(p), 'error'), mark(vid(q), 'error')],
  };
}

/** Load values, with a warning when they are not sorted. */
export function sortedLoadOp<Set>(name: string): OpSpec<ArrayState, Set, ArrayExtra> {
  return loadOp<Set>({
    ready: `A is sorted, so ${name} can use it. Type a value and press Search.`,
    warn: (s) => {
      const bad = outOfOrder(s);
      return (
        bad && {
          say: `${bad.say} ${name.charAt(0).toUpperCase() + name.slice(1)} needs sorted values, so press Sort A before you search.`,
          marks: bad.marks,
        }
      );
    },
  });
}

/** Sorting is a separate, visible step: a search never sorts behind your back. */
export function sortAOp<Set>(name: string): OpSpec<ArrayState, Set, ArrayExtra> {
  return {
    label: 'Sort A',
    arity: 0,
    *run(s) {
      const n = s.a.length;
      if (!outOfOrder(s)) {
        yield {
          state: s,
          marks: [],
          say: 'A is already sorted, so there is nothing to do.',
          lines: [],
          level: 1,
          vars: { n },
        };
        return s;
      }
      const a = [...s.a].sort((p, q) => p.value - q.value);
      const next: ArrayState = { a, nextUid: s.nextUid };
      yield {
        state: next,
        marks: a.filter((x, i) => s.a[i] !== x).map((x) => mark(vid(x), 'active')),
        say: `Sorted A with a library sort: ${valuesOf(next).join(', ')}. Now ${name} can use it.`,
        lines: [],
        level: 1,
        vars: { n },
      };
      return next;
    },
  };
}

/** Driver protocol: "<command> x" prints what the model returned. Refused calls are left out. */
export const searchQuery =
  (op = 'search', command = 'search') =>
  (call: OpCall, _before: ArrayState, steps: ArrayStep[]) => {
    const vars = steps[steps.length - 1]!.vars;
    if (call[0] !== op || typeof vars?.result !== 'number') return null;
    return {
      line: vars.x === undefined ? command : `${command} ${vars.x}`,
      out: String(vars.result),
    };
  };

/**
 * What a plain binary search (exact match, a loop) does on sorted `vs`: its probes (values it
 * looks at) and its comparisons with x (one for ==, one more for > when that fails).
 */
export function binaryCost(
  vs: readonly number[],
  x: number,
): { probes: number; comparisons: number } {
  let lo = 0;
  let hi = vs.length - 1;
  let probes = 0;
  let comparisons = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    probes++;
    comparisons++;
    if (vs[mid] === x) break;
    comparisons++;
    if (vs[mid]! > x) hi = mid - 1;
    else lo = mid + 1;
  }
  return { probes, comparisons };
}

/** Index ranges outside the window A[lo..hi], to fade. */
export function outside(n: number, lo: number, hi: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  if (lo > 0) out.push({ from: 0, to: Math.min(lo, n) - 1 });
  if (hi < n - 1) out.push({ from: Math.max(hi + 1, 0), to: n - 1 });
  return out;
}
