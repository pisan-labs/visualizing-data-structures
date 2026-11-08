/**
 * Gnome sort: one index, pos, walks the array like a garden gnome sorting flower pots. If the pot
 * on its left is no bigger, it steps forward; otherwise it swaps the two and steps back. The
 * values left of pos are always sorted, so this is insertion sort done with swaps, with the
 * gnome walking back to where it was after every insertion. The jump option remembers where it
 * was ("far") and jumps straight back, which makes it exactly insertion sort with swaps.
 */
import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsPointer, BarsRegion } from '../../layouts/bars';
import {
  at,
  doneRegions,
  loadOp,
  makeState,
  mark,
  plural,
  Run,
  SORT_START,
  stabilityNote,
  type ArrayExtra,
  type ArrayState,
  type Draw,
} from '../_sorting/kit';

export interface GnomeSettings {
  [key: string]: Scalar;
  /** Jump back to where the gnome left off instead of walking there. */
  jump: boolean;
  draw: Draw;
}

export const defaults: GnomeSettings = { jump: false, draw: 'bars' };

type Op = OpSpec<ArrayState, GnomeSettings, ArrayExtra>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

/** What insertion sort (with swaps) does on vs: comparisons and swaps. */
export function insertionCost(vs: readonly number[]): { comparisons: number; swaps: number } {
  const a = [...vs];
  let comparisons = 0;
  let swaps = 0;
  for (let i = 1; i < a.length; i++) {
    for (let j = i; j > 0; j--) {
      comparisons++;
      if (a[j - 1]! <= a[j]!) break;
      [a[j - 1], a[j]] = [a[j]!, a[j - 1]!];
      swaps++;
    }
  }
  return { comparisons, swaps };
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const r = new Run(s, ['comparisons', 'swaps']);
    const n = r.n;
    const start = [...r.a];
    const jump = settings.jump;
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
    let pos = 0;
    let far = 0;
    /** The farthest slot the gnome has stood on: new ground past it. */
    let reached = 0;
    const vars = (): Record<string, Scalar> => ({ pos, ...(jump ? { far } : {}), n });
    const extra = (): ArrayExtra => {
      const pointers: BarsPointer[] = [{ name: 'pos', at: pos }];
      if (jump && far !== pos && far < n) pointers.push({ name: 'far', at: far });
      const regions: BarsRegion[] =
        pos > 1 ? [{ id: 'left', from: 0, to: pos - 1, tone: 'plain', label: 'sorted' }] : [];
      return { pointers, regions };
    };
    const forward = (from: number): { say: string; level: 1 | 2 } => {
      const fresh = pos > reached;
      reached = Math.max(reached, pos);
      const where =
        pos >= n
          ? 'pos = n: the gnome has walked off the end.'
          : jump && pos !== from + 1
            ? `Jump back to where it left off: pos = far = ${pos}.`
            : `Step forward: pos = ${pos}.`;
      return {
        say:
          fresh && pos < n
            ? `${where} New ground: ${pos === 1 ? 'A[0]' : `A[0..${pos - 1}]`} is sorted.`
            : where,
        level: fresh ? 1 : 2,
      };
    };

    yield r.step({
      say: `The gnome starts at pos = 0.${jump ? ' far remembers the farthest it has been.' : ''}`,
      lines: ['init'],
      level: 2,
      vars: vars(),
      extra: extra(),
    });
    while (pos < n) {
      if (pos === 0) {
        const from = pos;
        if (jump) {
          far++;
          pos = far;
        } else pos++;
        const f = forward(from);
        yield r.step({
          say: `Nothing is left of A[0]. ${f.say}`,
          lines: jump ? ['loop', 'test', 'far', 'fwd'] : ['loop', 'test', 'fwd'],
          level: f.level,
          vars: vars(),
          extra: extra(),
        });
        continue;
      }
      const [x, y] = [r.v(pos - 1), r.v(pos)];
      r.count('comparisons');
      const pair = [mark(r.id(pos - 1), 'compare'), mark(r.id(pos), 'compare')];
      if (y >= x) {
        const from = pos;
        if (jump) {
          far++;
          pos = far;
        } else pos++;
        const f = forward(from);
        yield r.step({
          say: `${at(from - 1, x)} ≤ ${at(from, y)}: in order. ${f.say}`,
          lines: jump ? ['loop', 'test', 'far', 'fwd'] : ['loop', 'test', 'fwd'],
          level: f.level,
          marks: pair,
          vars: vars(),
          extra: extra(),
        });
        continue;
      }
      yield r.step({
        say: `Compare ${at(pos - 1, x)} with ${at(pos, y)}: ${x} > ${y}, out of order.`,
        lines: ['loop', 'test'],
        level: 3,
        marks: pair,
        vars: vars(),
        extra: extra(),
      });
      r.swap(pos - 1, pos);
      r.count('swaps');
      pos--;
      yield r.step({
        say: `Swap them and step back: ${y} moves left to A[${pos}], and pos = ${pos}.`,
        lines: ['swap', 'back'],
        level: 2,
        marks: [mark(r.id(pos), 'active'), mark(r.id(pos + 1), 'active')],
        vars: vars(),
        extra: extra(),
      });
    }
    for (let k = 0; k < n; k++) r.done.add(k);
    const ins = insertionCost(start.map((x) => x.value));
    const c = r.counts.comparisons!;
    yield r.step({
      say:
        `Sorted: ${r.a.map((x) => x.value).join(', ')}. That took ${r.tally()}. ` +
        (jump
          ? `The same comparisons and swaps as insertion sort, ${ins.comparisons} and ${ins.swaps}.`
          : c === ins.comparisons
            ? 'Insertion sort makes the same comparisons and swaps here: the gnome never had to walk back.'
            : `Insertion sort makes the same ${plural(ins.swaps, 'swap')} but only ${plural(ins.comparisons, 'comparison')}: it never walks back over the sorted part.`) +
        stabilityNote(start, r.a),
      lines: [],
      level: 1,
      vars: { n, insertion: ins.comparisons },
      extra: { regions: doneRegions(r) },
    });
    return r.state();
  },
};

export const ops = {
  load: loadOp<GnomeSettings>({ ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: GnomeSettings): PseudoBlock[] {
  const jump = st.jump;
  return [
    {
      op: 'sort',
      lines: [
        L('sig', 0, 'gnomeSort(A, n)', 'To sort A[0..n-1]:'),
        jump
          ? L(
              'init',
              1,
              'pos = 0; far = 0',
              'The gnome starts at the front; far is the farthest it has been.',
            )
          : L('init', 1, 'pos = 0', 'The gnome starts at the front.'),
        L('loop', 1, 'while pos < n', 'Until it walks off the end:'),
        L(
          'test',
          2,
          'if pos == 0 or A[pos - 1] <= A[pos]',
          'if nothing is on its left, or the pot on its left is no bigger,',
        ),
        ...(jump
          ? [
              L('far', 3, 'far = far + 1', 'new ground is one step past far,'),
              L('fwd', 3, 'pos = far', 'so jump there.'),
            ]
          : [L('fwd', 3, 'pos = pos + 1', 'step forward.')]),
        L('swap', 2, 'else swap A[pos - 1] and A[pos]', 'Otherwise swap the two pots'),
        L('back', 3, 'pos = pos - 1', 'and step back.'),
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
