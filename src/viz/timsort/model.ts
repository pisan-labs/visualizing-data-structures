/**
 * Timsort (Tim Peters, 2002), the core of it:
 *
 * 1. Walk the array finding natural runs: a stretch that never goes down, or one that strictly
 *    goes down (reversed in place; strictly, so equal values never swap and the sort stays
 *    stable).
 * 2. A run shorter than minrun is extended to minrun values with binary insertion sort.
 * 3. Each run is pushed on a stack. With X the top run, then Y, Z and W, the stack keeps
 *    |Z| > |Y| + |X| and |Y| > |X| (the checks of Java's TimSort, with the 2015 fix for W); when
 *    they fail, runs merge. So the lengths grow at least like Fibonacci numbers down the stack,
 *    the stack stays O(log n) deep, and merges are between runs of similar size.
 * 4. Before a merge, galloping (exponential search) trims the values already in place: the
 *    front of the left run that is ≤ the right run's first value, and the back of the right run
 *    that is ≥ the left run's last value. Then the rest of the left run is copied to tmp and
 *    merged back.
 *
 * Simplifications, said on the concept page: minrun is a setting (real Timsort picks 32 to 64,
 * and sorts fewer than 64 values with one binary insertion sort), the left run is always the one
 * copied (real Timsort copies the shorter one), and there is no galloping inside a merge.
 */
import type { Mark, OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsPointer, BarsRegion } from '../../layouts/bars';
import {
  at,
  doneRegions,
  loadOp,
  makeState,
  mark,
  plural,
  Run,
  span,
  stabilityNote,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
  type Item,
} from '../_sorting/kit';

export interface TimSettings {
  [key: string]: Scalar;
  /** Runs shorter than this are extended with binary insertion sort. */
  minrun: number;
  /** Gallop to skip the values already in place before each merge. */
  gallop: boolean;
  draw: Draw;
}

export const defaults: TimSettings = { minrun: 4, gallop: true, draw: 'bars' };

type Op = OpSpec<ArrayState, TimSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, void, void>;

/** Fourteen values with natural runs: up, down, up. */
export const START = [12, 25, 38, 51, 47, 33, 19, 6, 22, 29, 41, 15, 60, 70];

export function init(): ArrayState {
  return makeState(START);
}

interface RunInfo {
  base: number;
  len: number;
}

/** Stack labels, top first: X, Y, Z, W. */
const NAMES = ['X', 'Y', 'Z', 'W'];

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const r = new Run(s, ['comparisons', 'writes']);
    const n = r.n;
    const start = [...r.a];
    const minrun = Math.max(2, Math.round(settings.minrun));
    if (n < 2) {
      for (let k = 0; k < n; k++) r.done.add(k);
      yield r.step({
        say: n === 1 ? 'A has one value, so it is already sorted.' : 'A is empty.',
        lines: ['sig'],
        level: 1,
        vars: { n },
      });
      return r.state();
    }
    const stack: RunInfo[] = [];
    let merges = 0;
    let aux: (Item | null)[] = Array(n).fill(null);
    let auxFrom = 0;
    let auxTo = -1;

    const stackText = () => stack.map((x) => x.len).join(', ');
    const runRegions = (extra: BarsRegion[] = []): BarsRegion[] => [
      ...stack.map((x, k) => {
        const fromTop = stack.length - 1 - k;
        const name = NAMES[fromTop];
        return {
          id: `run-${x.base}`,
          from: x.base,
          to: x.base + x.len - 1,
          tone: 'plain' as const,
          label: name ? `${name} = ${x.len}` : String(x.len),
        };
      }),
      ...extra,
    ];
    const vars = (more: Record<string, Scalar> = {}): Record<string, Scalar> => ({
      n,
      minrun,
      stack: stackText() || 'empty',
      ...more,
    });
    // From the first merge on, the frame keeps the tmp row's room (see view.ts).
    const extraFor = (regions: BarsRegion[], pointers: BarsPointer[] = []): ArrayExtra => ({
      regions,
      pointers,
      ...(merges > 0 ? { auxRoom: true } : {}),
      ...(auxTo >= auxFrom
        ? {
            aux: {
              items: [...aux],
              from: auxFrom,
              to: auxTo,
              label: (i: number) => String(i - auxFrom),
            },
          }
        : {}),
    });

    yield r.step({
      say: `minrun = ${minrun}: runs shorter than that are extended with binary insertion sort. Find the first run at A[0].`,
      lines: ['sig', 'init'],
      level: 2,
      vars: vars(),
    });

    // ----- Binary insertion sort: extend A[lo..lo+sorted-1] to A[lo..hi] -----
    function* binaryInsertion(lo: number, sorted: number, hi: number): Gen {
      const current = (): BarsRegion[] =>
        runRegions([{ id: 'new', from: lo, to: hi, tone: 'window', label: 'new run' }]);
      for (let i = lo + sorted; i <= hi; i++) {
        const key = r.a[i]!;
        let left = lo;
        let right = i;
        while (left < right) {
          const mid = Math.floor((left + right) / 2);
          r.count('comparisons');
          const goRight = r.v(mid) <= key.value;
          yield r.step({
            say: `Binary search for where ${key.value} goes in ${span(lo, i - 1)}: ${at(mid, r.v(mid))} ${goRight ? `≤ ${key.value}, so it goes right of it` : `> ${key.value}, so it goes left of it`}.`,
            lines: ['extend'],
            level: 3,
            marks: [mark(r.id(mid), 'compare'), mark(`v${key.uid}`, 'active')],
            vars: vars({ i }),
            extra: extraFor(current(), [{ name: 'i', at: i }]),
          });
          if (goRight) left = mid + 1;
          else right = mid;
        }
        if (left === i) {
          yield r.step({
            say: `${key.value} is not smaller than anything before it, so it stays in A[${i}].`,
            lines: ['extend'],
            level: 2,
            marks: [mark(`v${key.uid}`, 'active')],
            vars: vars({ i }),
            extra: extraFor(current(), [{ name: 'i', at: i }]),
          });
          continue;
        }
        r.a.splice(i, 1);
        r.a.splice(left, 0, key);
        r.count('writes', i - left + 1);
        yield r.step({
          say: `Insert ${key.value} at A[${left}], moving ${plural(i - left, 'value')} one slot right.`,
          lines: ['extend'],
          level: 2,
          marks: [mark(`v${key.uid}`, 'active')],
          vars: vars({ i }),
          extra: extraFor(current(), [{ name: 'i', at: i }]),
        });
      }
    }

    // ----- Galloping: exponential search, then binary search -----
    /** The number of values in A[base..base+len-1] that are ≤ key (strict: < key), from the left. */
    function* gallopFromLeft(
      key: number,
      base: number,
      len: number,
      strict: boolean,
      why: string,
      lines: string[],
    ) {
      const before = (v: number) => (strict ? v < key : v <= key);
      const probe = function* (i: number, ok: boolean) {
        r.count('comparisons');
        yield r.step({
          say: `${why}: ${at(base + i, r.v(base + i))} ${ok ? (strict ? '<' : '≤') : strict ? '≥' : '>'} ${key}.`,
          lines,
          level: 3,
          marks: [mark(r.id(base + i), 'compare')],
          vars: vars(),
          extra: extraFor(runRegions(), [{ name: 'g', at: base + i }]),
        });
      };
      let ok = before(r.v(base));
      yield* probe(0, ok);
      if (!ok) return 0;
      let last = 0;
      let ofs = 1;
      while (ofs < len) {
        ok = before(r.v(base + ofs));
        yield* probe(ofs, ok);
        if (!ok) break;
        last = ofs;
        ofs = 2 * ofs + 1;
      }
      let lo = last + 1;
      let hi = Math.min(ofs, len);
      while (lo < hi) {
        const m = Math.floor((lo + hi) / 2);
        ok = before(r.v(base + m));
        yield* probe(m, ok);
        if (ok) lo = m + 1;
        else hi = m;
      }
      return lo;
    }

    /** The number of values in A[base..base+len-1] that are < key, galloping from the right. */
    function* gallopFromRight(
      key: number,
      base: number,
      len: number,
      why: string,
      lines: string[],
    ) {
      const probe = function* (i: number, below: boolean) {
        r.count('comparisons');
        yield r.step({
          say: `${why}: ${at(base + i, r.v(base + i))} ${below ? '<' : '≥'} ${key}.`,
          lines,
          level: 3,
          marks: [mark(r.id(base + i), 'compare')],
          vars: vars(),
          extra: extraFor(runRegions(), [{ name: 'g', at: base + i }]),
        });
      };
      let below = r.v(base + len - 1) < key;
      yield* probe(len - 1, below);
      if (below) return len;
      let last = len - 1;
      let ofs = 1;
      while (ofs < len) {
        const i = len - 1 - ofs;
        below = r.v(base + i) < key;
        yield* probe(i, below);
        if (below) break;
        last = i;
        ofs = 2 * ofs + 1;
      }
      let lo = Math.max(len - 1 - ofs, -1) + 1;
      let hi = last;
      while (lo < hi) {
        const m = Math.floor((lo + hi) / 2);
        below = r.v(base + m) < key;
        yield* probe(m, below);
        if (below) lo = m + 1;
        else hi = m;
      }
      return lo;
    }

    // ----- Merging runs i and i + 1 of the stack -----
    function* mergeAt(i: number, why: string, lines: string[]): Gen {
      const a = stack[i]!;
      const b = stack[i + 1]!;
      const lo = a.base;
      const hi = b.base + b.len - 1;
      merges++;
      yield r.step({
        say: `${why} Merge ${span(a.base, a.base + a.len - 1)} (${a.len}) with ${span(b.base, hi)} (${b.len}).`,
        lines,
        level: 2,
        vars: vars(),
        extra: extraFor(runRegions([{ id: 'merge', from: lo, to: hi, tone: 'window' }])),
      });
      let baseA = a.base;
      let lenA = a.len;
      const baseB = b.base;
      let lenB = b.len;
      // The merged run replaces both on the stack.
      stack.splice(i, 2, { base: lo, len: a.len + b.len });
      const finish = function* (say: string): Gen {
        yield r.step({
          say: `${say} ${span(lo, hi)} is one sorted run of ${hi - lo + 1}. Stack: ${stackText()}.`,
          lines: ['merged'],
          level: 1,
          vars: vars(),
          extra: extraFor(runRegions()),
        });
      };
      if (settings.gallop) {
        const k = yield* gallopFromLeft(
          r.v(baseB),
          baseA,
          lenA,
          false,
          `Gallop: where does B[0] = ${r.v(baseB)} go in the left run`,
          ['gr'],
        );
        if (k > 0) {
          yield r.step({
            say:
              k === lenA
                ? `Every value in the left run is ≤ ${r.v(baseB)}, so the whole run is already in place.`
                : `${plural(k, 'value')} at the front of the left run ${k === 1 ? 'is' : 'are'} ≤ ${r.v(baseB)}, so ${k === 1 ? 'it is' : 'they are'} already in place. Skip ${k === 1 ? 'it' : 'them'}.`,
            lines: ['gr'],
            level: 2,
            marks: Array.from({ length: k }, (_, t) => mark(r.id(baseA + t), 'visit')),
            vars: vars(),
            extra: extraFor(runRegions([{ id: 'merge', from: lo, to: hi, tone: 'window' }])),
          });
        }
        baseA += k;
        lenA -= k;
        if (lenA === 0) {
          yield* finish('Nothing to merge: the two runs were already in order.');
          return;
        }
        const lastA = r.v(baseA + lenA - 1);
        const keep = yield* gallopFromRight(
          lastA,
          baseB,
          lenB,
          `Gallop: where does the left run's last value, ${lastA}, go in the right run`,
          ['gl'],
        );
        if (keep < lenB) {
          const skip = lenB - keep;
          yield r.step({
            say: `${plural(skip, 'value')} at the back of the right run ${skip === 1 ? 'is' : 'are'} ≥ ${lastA}, so ${skip === 1 ? 'it is' : 'they are'} already in place. Skip ${skip === 1 ? 'it' : 'them'}.`,
            lines: ['gl'],
            level: 2,
            marks: Array.from({ length: skip }, (_, t) => mark(r.id(baseB + keep + t), 'visit')),
            vars: vars(),
            extra: extraFor(runRegions([{ id: 'merge', from: lo, to: hi, tone: 'window' }])),
          });
        }
        lenB = keep;
      }
      // merge_lo: copy the left part to tmp, then merge left to right into A.
      aux = Array(n).fill(null);
      auxFrom = baseA;
      auxTo = baseA + lenA - 1;
      for (let k = baseA; k <= auxTo; k++) {
        aux[k] = r.a[k]!;
        r.a[k] = { uid: 0, value: aux[k]!.value, stale: true };
      }
      r.count('writes', lenA);
      let ia = baseA;
      let jb = baseB;
      let k = baseA;
      const endB = baseB + lenB;
      const window = (): BarsRegion[] =>
        runRegions([
          { id: 'merge', from: lo, to: hi, tone: 'window' },
          { id: 'tmp', row: 'aux', from: auxFrom, to: auxTo, tone: 'plain', label: 'tmp' },
        ]);
      const ptrs = (): BarsPointer[] => [
        { name: 'k', at: k },
        ...(ia <= auxTo ? [{ name: 'i', at: ia, row: 'aux' }] : []),
        ...(jb < endB ? [{ name: 'j', at: jb }] : []),
      ];
      yield r.step({
        say: `Copy ${span(baseA, auxTo)} to tmp. Then fill A from k = ${baseA}, taking the smaller front value of tmp and the right run each time.`,
        lines: ['copy'],
        level: 2,
        vars: vars({ k }),
        extra: extraFor(window(), ptrs()),
      });
      while (ia <= auxTo && jb < endB) {
        const x = aux[ia]!;
        const y = r.a[jb]!;
        r.count('comparisons');
        const pair: Mark[] = [mark(`v${x.uid}`, 'compare'), mark(`v${y.uid}`, 'compare')];
        yield r.step({
          say: `Compare tmp's front, ${x.value}, with the right run's front, ${at(jb, y)}.`,
          lines: ['take'],
          level: 3,
          marks: pair,
          vars: vars({ k }),
          extra: extraFor(window(), ptrs()),
        });
        let say: string;
        let moved: Item;
        if (x.value <= y.value) {
          r.a[k] = x;
          aux[ia] = { uid: 0, value: x.value, stale: true };
          ia++;
          moved = x;
          say = `${x.value} ≤ ${y.value}: take ${x.value} from tmp${x.value === y.value ? ' (tmp wins ties, which keeps the sort stable)' : ''} into A[${k}].`;
        } else {
          // The old slot is left as a faded copy until k writes over it.
          r.a[jb] = { uid: 0, value: y.value, stale: true };
          r.a[k] = y;
          jb++;
          moved = y;
          say = `${y.value} < ${x.value}: take ${y.value} from the right run into A[${k}].`;
        }
        r.count('writes');
        k++;
        yield r.step({
          say,
          lines: ['take'],
          level: 2,
          marks: [mark(`v${moved.uid}`, 'active')],
          vars: vars({ k }),
          extra: extraFor(window(), ptrs()),
        });
      }
      if (ia <= auxTo) {
        const moved: Item[] = [];
        const k0 = k;
        while (ia <= auxTo) {
          const x = aux[ia]!;
          r.a[k] = x;
          aux[ia] = { uid: 0, value: x.value, stale: true };
          moved.push(x);
          ia++;
          k++;
        }
        r.count('writes', moved.length);
        yield r.step({
          say: `The right run is used up: copy the rest of tmp into ${span(k0, k - 1)}: ${moved.map((x) => x.value).join(', ')}.`,
          lines: ['rest'],
          level: 2,
          marks: moved.map((x) => mark(`v${x.uid}`, 'active')),
          vars: vars({ k }),
          extra: extraFor(window(), ptrs()),
        });
      }
      auxTo = -1;
      aux = Array(n).fill(null);
      yield* finish(`Merged.`);
    }

    // ----- The stack invariants -----
    function* collapse(): Gen {
      while (stack.length > 1) {
        let m = stack.length - 2;
        const len = (k: number) => stack[k]!.len;
        const zBad = m > 0 && len(m - 1) <= len(m) + len(m + 1);
        const wBad = m > 1 && len(m - 2) <= len(m - 1) + len(m);
        if (zBad || wBad) {
          const why = zBad
            ? `|Z| = ${len(m - 1)} ≤ |Y| + |X| = ${len(m)} + ${len(m + 1)}.`
            : `|W| = ${len(m - 2)} ≤ |Z| + |Y| = ${len(m - 1)} + ${len(m)}.`;
          let which: string;
          if (len(m - 1) < len(m + 1)) {
            m--;
            which = ' Z is shorter than X, so merge Z and Y.';
          } else which = ' Merge Y and X.';
          yield* mergeAt(m, `${why}${which}`, ['inv1', 'mergeYZ']);
          continue;
        }
        if (len(m) <= len(m + 1)) {
          yield* mergeAt(m, `|Y| = ${len(m)} ≤ |X| = ${len(m + 1)}.`, ['inv1', 'inv2', 'mergeXY']);
          continue;
        }
        yield r.step({
          say:
            stack.length === 2
              ? `|Y| = ${len(0)} > |X| = ${len(1)}: the stack is in order. Stack: ${stackText()}.`
              : `|Z| > |Y| + |X| and |Y| > |X|: the stack is in order. Stack: ${stackText()}.`,
          lines: ['inv1', 'inv2', 'cstop'],
          level: 2,
          vars: vars(),
          extra: extraFor(runRegions()),
        });
        return;
      }
    }

    let lo = 0;
    while (lo < n) {
      // Find the natural run at A[lo].
      let end = lo + 1;
      let descending = false;
      if (end < n) {
        r.count('comparisons');
        if (r.v(end) < r.v(lo)) {
          descending = true;
          while (end + 1 < n) {
            r.count('comparisons');
            if (!(r.v(end + 1) < r.v(end))) break;
            end++;
          }
        } else {
          while (end + 1 < n) {
            r.count('comparisons');
            if (r.v(end + 1) < r.v(end)) break;
            end++;
          }
        }
        end++;
      }
      let len = end - lo;
      const found = { id: 'new', from: lo, to: end - 1, tone: 'window' as const, label: 'new run' };
      yield r.step({
        say:
          len === 1
            ? `The run at A[${lo}] is just ${at(lo, r.v(lo))}, the last value.`
            : `The run at A[${lo}] ${descending ? 'strictly goes down' : 'never goes down'}: ${span(lo, end - 1)}, ${plural(len, 'value')}.`,
        lines: ['loop', 'count'],
        level: 2,
        marks: Array.from({ length: len }, (_, t) => mark(r.id(lo + t), 'visit')),
        vars: vars({ lo }),
        extra: extraFor(runRegions([found])),
      });
      if (descending) {
        const part = r.a.slice(lo, end).reverse();
        r.a.splice(lo, len, ...part);
        r.count('writes', len);
        yield r.step({
          say: `Reverse it in place: ${part.map((x) => x.value).join(', ')}. (Only strictly falling runs are reversed, so equal values never trade places.)`,
          lines: ['rev'],
          level: 2,
          marks: part.map((x) => mark(`v${x.uid}`, 'active')),
          vars: vars({ lo }),
          extra: extraFor(runRegions([found])),
        });
      }
      if (len < minrun && end < n) {
        const target = Math.min(minrun, n - lo);
        yield r.step({
          say: `A run of ${len} is shorter than minrun = ${minrun}: extend the run to ${span(lo, lo + target - 1)} with binary insertion sort.`,
          lines: ['short', 'extend'],
          level: 2,
          vars: vars({ lo }),
          extra: extraFor(runRegions([{ ...found, to: lo + target - 1 }])),
        });
        yield* binaryInsertion(lo, len, lo + target - 1);
        len = target;
      }
      stack.push({ base: lo, len });
      yield r.step({
        say: `Push the run ${span(lo, lo + len - 1)} (${len}) on the stack. Stack: ${stackText()}.`,
        lines: ['push'],
        level: 1,
        vars: vars({ lo }),
        extra: extraFor(runRegions()),
      });
      lo += len;
      yield* collapse();
    }
    // Merge what is left, top first (Z with Y first if Z is shorter than X).
    while (stack.length > 1) {
      let m = stack.length - 2;
      if (m > 0 && stack[m - 1]!.len < stack[m + 1]!.len) m--;
      yield* mergeAt(m, 'No values left: merge the runs on the stack.', ['force']);
    }
    for (let k = 0; k < n; k++) r.done.add(k);
    yield r.step({
      say: `Sorted: ${r.a.map((x) => x.value).join(', ')}. That took ${r.tally()}, with ${plural(merges, 'merge')}.${stabilityNote(start, r.a)}`,
      lines: [],
      level: 1,
      vars: { n, merges },
      extra: { regions: doneRegions(r), ...(merges > 0 ? { auxRoom: true } : {}) },
    });
    return r.state();
  },
};

export const ops = {
  load: loadOp<TimSettings>({ ready: 'Ready to sort.' }),
  sort,
};

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: TimSettings): PseudoBlock[] {
  const minrun = Math.max(2, Math.round(st.minrun));
  return [
    {
      op: 'sort',
      lines: [
        L('sig', 0, 'timsort(A, n)', 'To sort A[0..n-1]:'),
        L(
          'init',
          1,
          `stack = empty; lo = 0; minrun = ${minrun}`,
          'Start with no runs at the front.',
        ),
        L('loop', 1, 'while lo < n', 'While values are left,'),
        L(
          'count',
          2,
          'len = length of the natural run at A[lo]',
          'find the run that starts at A[lo];',
        ),
        L('rev', 2, 'if it strictly goes down: reverse it', 'if it goes down, turn it around.'),
        L('short', 2, 'if len < minrun', 'If it is short,'),
        L(
          'extend',
          3,
          'binary insertion sort it to min(minrun, n - lo) values',
          'grow it to minrun values with binary insertion sort.',
        ),
        L('push', 2, 'push (lo, len); lo = lo + len', 'Push it on the stack and move on.'),
        L(
          'inv1',
          2,
          'while |Z| <= |Y| + |X| or |W| <= |Z| + |Y|',
          'While a run is not longer than the two above it,',
        ),
        L(
          'mergeYZ',
          3,
          'merge Y with the shorter of X and Z',
          'merge Y with its shorter neighbor.',
        ),
        L('inv2', 2, 'or |Y| <= |X|', 'Also while Y is not longer than X,'),
        L('mergeXY', 3, 'merge Y and X', 'merge the top two.'),
        L('cstop', 2, 'otherwise the stack is in order', 'Then the stack is in order.'),
        L('force', 1, 'merge what is left on the stack', 'At the end, merge all the runs.'),
        L('msig', 0, 'merge(L, R)', 'To merge two neighboring runs L and R:'),
        ...(st.gallop
          ? [
              L(
                'gr',
                1,
                'gallop: skip the front of L that is <= R[0]',
                'skip what is already in place at the front,',
              ),
              L('gl', 1, 'gallop: skip the back of R that is >= the last of L', 'and at the back.'),
            ]
          : []),
        L('copy', 1, 'copy (what is left of) L to tmp', 'Copy the left run to tmp,'),
        L(
          'take',
          1,
          'repeat: move the smaller front of tmp and R to A[k] (tmp on ties)',
          'then keep taking the smaller front value.',
        ),
        L('rest', 1, 'copy the rest of tmp', 'When R runs out, copy what is left of tmp.'),
        L('merged', 1, 'L and R are now one run', 'Now they are one run.'),
      ],
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'value')}: ${state.a.map((x) => x.value).join(', ')}. Sort them, or load your own (up to 20 whole numbers from 0 to 99).`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length };
}
