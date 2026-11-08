/**
 * Bitonic sort as a sorting network (Batcher, 1968). The values travel left to right along n
 * wires, n a power of two. A comparator joins two wires and sends the smaller value to one and the
 * larger to the other, whatever the values are: the network is fixed in advance, so every
 * comparator in a column can run at the same time. Stage s sorts blocks of 2^s; its phases are
 * columns. The parallel depth is log n (log n + 1) / 2 columns.
 *
 * Two layouts:
 * - flip (CLRS's sorting networks chapter): every comparator puts the smaller value on the upper
 *   wire. The first column of each stage compares mirror pairs in a block (a "flip"), the rest
 *   are half-cleaners.
 * - alternating (Batcher's original): blocks are sorted up and down in turn, so each pair of
 *   blocks forms a bitonic sequence; comparators in descending blocks point the other way.
 */
import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import {
  at,
  loadOp,
  makeState,
  mark,
  plural,
  Run,
  stabilityNote,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
} from '../_sorting/kit';

export type Network = 'flip' | 'alternating';

export interface BitonicSettings {
  [key: string]: Scalar;
  network: Network;
}

export const defaults: BitonicSettings = { network: 'flip' };

/** One comparator: the smaller value ends on wire `min`, the larger on wire `max`. */
export interface Comparator {
  min: number;
  max: number;
}

export interface Column {
  stage: number;
  /** 1 for the first column of a stage. */
  phase: number;
  /** Block size of the stage, 2^stage. */
  block: number;
  /** The distance the column compares across (half-cleaner), or the block (flip). */
  span: number;
  flip: boolean;
  comparators: Comparator[];
}

export interface BitonicExtra extends ArrayExtra {
  /** Columns done so far: values sit just after this many columns. */
  done?: number;
  /** The column being worked on. */
  active?: number;
  /** The comparator being looked at, within the active column. */
  comparator?: number;
}

export const isPowerOfTwo = (n: number): boolean => n >= 1 && (n & (n - 1)) === 0;
export const log2 = (n: number): number => Math.round(Math.log2(n));

/** The network for n wires (n a power of two), column by column. */
export function network(n: number, kind: Network): Column[] {
  const cols: Column[] = [];
  if (!isPowerOfTwo(n) || n < 2) return cols;
  for (let block = 2, stage = 1; block <= n; block *= 2, stage++) {
    let phase = 1;
    for (let j = block / 2; j >= 1; j /= 2, phase++) {
      const comparators: Comparator[] = [];
      const flip = kind === 'flip' && phase === 1;
      for (let i = 0; i < n; i++) {
        const l = flip ? i ^ (block - 1) : i ^ j;
        if (l <= i) continue;
        const up = kind === 'flip' || (i & block) === 0;
        comparators.push(up ? { min: i, max: l } : { min: l, max: i });
      }
      cols.push({ stage, phase, block, span: j, flip, comparators });
    }
  }
  return cols;
}

/** Columns (parallel depth) and comparators for n wires. */
export function size(n: number): { depth: number; comparators: number } {
  const k = isPowerOfTwo(n) ? log2(n) : 0;
  return { depth: (k * (k + 1)) / 2, comparators: (n / 2) * ((k * (k + 1)) / 2) };
}

type Op = OpSpec<ArrayState, BitonicSettings, ArrayExtra>;

export const START = [42, 17, 63, 8, 35, 24, 91, 5];

export function init(): ArrayState {
  return makeState(START);
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const r = new Run(s, ['comparisons', 'swaps']);
    const n = r.n;
    if (!isPowerOfTwo(n)) {
      const lower = n < 2 ? 1 : 2 ** Math.floor(Math.log2(n));
      yield {
        state: s,
        marks: [],
        say:
          n === 0
            ? 'A is empty, so there is nothing to sort.'
            : `A bitonic network needs n to be a power of two, and A has ${n} values. Load ${lower} or ${lower * 2} values, or pad A with big values that sink to the end.`,
        lines: ['sig'],
        level: 1,
        vars: { n },
      };
      return s;
    }
    const start = [...r.a];
    const cols = network(n, settings.network);
    const { depth, comparators: total } = size(n);
    if (n === 1) {
      r.done.add(0);
      yield r.step({
        say: 'One value: the network has no comparators, and A is sorted.',
        lines: ['sig'],
        level: 1,
        vars: { n, depth: 0, sorted: true },
        extra: { done: 0 } as BitonicExtra,
      });
      return r.state();
    }
    const extra = (e: BitonicExtra): ArrayExtra => e;
    yield r.step({
      say: `${n} wires, log₂ ${n} = ${log2(n)} stages, ${depth} columns and ${total} comparators. Comparators in one column touch different wires, so a column runs all at once: ${plural(depth, 'parallel step')} in all.`,
      lines: ['sig'],
      level: 2,
      vars: { n, depth, total },
      extra: extra({ done: 0 }),
    });
    let stage = 0;
    for (let c = 0; c < cols.length; c++) {
      const col = cols[c]!;
      const vars = (): Record<string, Scalar> => ({
        n,
        stage: col.stage,
        phase: col.phase,
        column: c + 1,
        depth,
      });
      if (col.stage !== stage) {
        stage = col.stage;
        yield r.step({
          say:
            settings.network === 'flip'
              ? `Stage ${stage}: sort each block of ${col.block}. ${stage === 1 ? 'Each pair of neighbors is compared once.' : `Its two halves are already sorted, so a flip and then ${plural(log2(col.block) - 1, 'half-cleaner')} merge them.`}`
              : `Stage ${stage}: blocks of ${col.block}. Each is a bitonic sequence (its halves sorted in opposite directions); sort it ${stage === log2(n) ? 'upward' : 'up or down in turn'}.`,
          lines: ['stage'],
          level: 2,
          vars: vars(),
          extra: extra({ done: c }),
        });
      }
      let swapsHere = 0;
      for (let k = 0; k < col.comparators.length; k++) {
        const cmp = col.comparators[k]!;
        const [lo, hi] = [r.v(cmp.min), r.v(cmp.max)];
        r.count('comparisons');
        const out = lo > hi;
        const ends = [mark(r.id(cmp.min), 'compare'), mark(r.id(cmp.max), 'compare')];
        if (out) {
          r.swap(cmp.min, cmp.max);
          r.count('swaps');
          swapsHere++;
        }
        yield r.step({
          say: out
            ? `Comparator on wires ${cmp.min} and ${cmp.max}: ${at(cmp.min, lo)} > ${at(cmp.max, hi)}, so they swap; the smaller goes to wire ${cmp.min}.`
            : `Comparator on wires ${cmp.min} and ${cmp.max}: ${lo} and ${hi} are already the right way round.`,
          lines: col.flip ? ['flip'] : ['clean'],
          level: 3,
          marks: out
            ? [
                mark(r.id(cmp.min), 'active'),
                mark(r.id(cmp.max), 'active'),
                mark(`cmp-${c}-${k}`, 'active'),
              ]
            : [...ends, mark(`cmp-${c}-${k}`, 'compare')],
          vars: vars(),
          extra: extra({ done: c, active: c, comparator: k }),
        });
      }
      const lastOfStage = c + 1 === cols.length || cols[c + 1]!.stage !== col.stage;
      const kind = col.flip
        ? `flip: each value in the first half of a block of ${col.block} meets its mirror in the second half`
        : `half-cleaner: wires ${col.span} apart`;
      yield r.step({
        say:
          `Column ${c + 1} of ${depth} (${kind}): ${plural(col.comparators.length, 'comparator')} at once, ${plural(swapsHere, 'swap')}.` +
          (lastOfStage
            ? col.stage === log2(n)
              ? ' That was the last column.'
              : settings.network === 'flip'
                ? ` Every block of ${col.block} is now sorted.`
                : ` Every block of ${col.block} is now sorted, up and down in turn, so pairs of blocks are bitonic.`
            : ''),
        lines: col.flip ? ['flip'] : ['clean'],
        level: lastOfStage ? 1 : 2,
        vars: vars(),
        extra: extra({ done: c + 1, active: c }),
      });
    }
    for (let k = 0; k < n; k++) r.done.add(k);
    yield r.step({
      say: `Sorted: ${r.a.map((x) => x.value).join(', ')}. ${plural(total, 'comparator')} in ${plural(depth, 'column')}, the same for any input of ${n} values: ${r.tally()}.${stabilityNote(start, r.a)}`,
      lines: [],
      level: 1,
      vars: { n, depth, total, sorted: true },
      extra: extra({ done: cols.length }),
    });
    return r.state();
  },
};

export const ops = {
  load: loadOp<BitonicSettings>({
    ready: 'Ready to sort.',
    warn: (s) =>
      isPowerOfTwo(s.a.length)
        ? null
        : {
            say: `A bitonic network needs n to be a power of two (2, 4, 8 or 16 here), and this is ${s.a.length}.`,
            marks: [],
          },
  }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: BitonicSettings): PseudoBlock[] {
  const flip = st.network === 'flip';
  return [
    {
      op: 'sort',
      lines: flip
        ? [
            L('sig', 0, 'bitonicSort(A, n)    // n = 2^k', 'To sort A[0..n-1], n a power of two:'),
            L('stage', 1, 'for size = 2, 4, ..., n', 'for blocks of 2, then 4, up to n:'),
            L(
              'flip',
              2,
              'compare i with its mirror (i xor (size - 1)) in each block',
              'flip: the first half of each block meets the second half, end to end;',
            ),
            L(
              'clean',
              2,
              'for d = size/4, ..., 1: compare i with i + d (half-cleaner)',
              'then compare values half as far apart, and half again, down to neighbors.',
            ),
          ]
        : [
            L('sig', 0, 'bitonicSort(A, n)    // n = 2^k', 'To sort A[0..n-1], n a power of two:'),
            L('stage', 1, 'for size = 2, 4, ..., n', 'for blocks of 2, then 4, up to n:'),
            L(
              'flip',
              2,
              'd = size/2: compare i with i + d, up if (i and size) == 0, else down',
              'compare values half a block apart, sorting blocks up and down in turn,',
            ),
            L(
              'clean',
              2,
              'for d = size/4, ..., 1: the same, d apart',
              'then half as far apart, and so on down to neighbors.',
            ),
          ],
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'value')}: ${state.a.map((x) => x.value).join(', ')}. Press Sort to send them through the network, or load 2, 4, 8 or 16 values of your own.`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length, ...size(state.a.length) };
}

export type { ArrayStep };
