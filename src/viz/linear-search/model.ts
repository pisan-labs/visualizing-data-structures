import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import {
  at,
  loadOp,
  makeState,
  mark,
  numberFromArg,
  plural,
  Run,
  SORT_START,
  type ArrayExtra,
  type ArrayState,
  type Draw,
  type Item,
} from '../_sorting/kit';

export interface LinearSettings {
  [key: string]: Scalar;
  /** Put x in a spare slot past the end, so the loop needs no index check. */
  sentinel: boolean;
  draw: Draw;
}

export const defaults: LinearSettings = { sentinel: false, draw: 'cells' };

type Op = OpSpec<ArrayState, LinearSettings, ArrayExtra>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

/** The value being looked for, drawn above the slot being checked. */
const target = (x: number, i: number): ArrayExtra['held'] => ({ value: x, at: i, label: 'x' });

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [arg], { settings }) {
    const n = s.a.length;
    const parsed = numberFromArg(arg, 'value to look for');
    if (typeof parsed === 'string') {
      yield {
        state: s,
        marks: [mark('row-a', 'error')],
        say: `search needs one value to look for. ${parsed}`,
        lines: ['sig'],
        level: 1,
        vars: { n },
      };
      return s;
    }
    const x = parsed;
    const run = new Run(s, ['comparisons', 'indexChecks']);
    let i = 0;
    const faded = () => (i > 0 ? [{ from: 0, to: Math.min(i, n) - 1 }] : []);
    const vars = () => ({ x, i, n });

    if (!settings.sentinel) {
      const extra = (more: Partial<ArrayExtra> = {}): ArrayExtra => ({
        held: target(x, Math.min(i, n)),
        pointers: [{ name: 'i', at: i }],
        faded: faded(),
        ...more,
      });
      for (i = 0; ; i++) {
        run.count('indexChecks');
        if (i >= n) {
          yield run.step({
            say:
              n === 0
                ? `A is empty, so ${x} is not there. Return -1.`
                : `i = ${n} is past the end: all ${plural(n, 'value')} were checked and none is ${x}. Return -1.`,
            lines: ['loop', 'miss'],
            level: 1,
            marks: [],
            vars: { ...vars(), result: -1 },
            extra: extra(),
          });
          return run.state();
        }
        const v = run.v(i);
        run.count('comparisons');
        if (v === x) {
          yield run.step({
            say: `Is ${at(i, v)} equal to x = ${x}? Yes: found ${x} at index ${i}. Return ${i}.`,
            lines: ['cmp', 'found'],
            level: 1,
            marks: [mark(run.id(i), 'found')],
            vars: { ...vars(), result: i },
            extra: extra(),
          });
          return run.state();
        }
        yield run.step({
          say: `Is ${at(i, v)} equal to x = ${x}? No, so move on.`,
          lines: ['loop', 'cmp'],
          level: 2,
          marks: [mark(run.id(i), 'compare')],
          vars: vars(),
          extra: extra(),
        });
      }
    }

    // Sentinel: x goes into the spare slot A[n], so the loop is sure to stop.
    const sentinel: Item = { uid: -1, value: x };
    const extra = (more: Partial<ArrayExtra> = {}): ArrayExtra => ({
      held: target(x, i),
      sentinel,
      pointers: [{ name: 'i', at: i }],
      faded: faded(),
      ...more,
    });
    yield run.step({
      say: `Put x = ${x} in A[${n}], the spare slot just past the end. With this sentinel the loop must stop at A[${n}] at the latest, so it never has to check i < n.`,
      lines: ['place', 'init'],
      level: 2,
      marks: [mark('v-1', 'active')],
      vars: vars(),
      extra: extra(),
    });
    for (i = 0; ; i++) {
      const v = i < n ? run.v(i) : x;
      run.count('comparisons');
      if (v === x) {
        run.count('indexChecks');
        const real = i < n;
        yield run.step({
          say: real
            ? `Is ${at(i, v)} different from x = ${x}? No, so the loop stops at i = ${i}. i < ${n}, so it is a real match: return ${i}.`
            : `A[${n}] is the sentinel, so the loop stops at i = ${n}. i is not less than ${n}: ${x} is not in A. Return -1.`,
          lines: ['loop', 'check', real ? 'found' : 'miss'],
          level: 1,
          marks: real ? [mark(run.id(i), 'found')] : [mark('v-1', 'compare')],
          vars: { ...vars(), result: real ? i : -1 },
          extra: extra(),
        });
        return run.state();
      }
      yield run.step({
        say: `Is ${at(i, v)} different from x = ${x}? Yes, so move on to the next slot. No index check needed.`,
        lines: ['loop', 'inc'],
        level: 2,
        marks: [mark(run.id(i), 'compare')],
        vars: vars(),
        extra: extra(),
      });
    }
  },
};

export const ops = {
  load: loadOp<LinearSettings>({ ready: 'Type a value and search for it.' }),
  search,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: LinearSettings): PseudoBlock[] {
  if (st.sentinel) {
    return [
      {
        op: 'search',
        lines: [
          L('sig', 0, 'sentinelSearch(A, n, x)', 'To find x in A[0..n-1] (A has one spare slot):'),
          L('place', 1, 'A[n] = x', 'Put x in the spare slot past the end.'),
          L('init', 1, 'i = 0', 'Start at the front.'),
          L('loop', 1, 'while A[i] != x', 'While this is not x,'),
          L('inc', 2, 'i = i + 1', 'move on (the sentinel stops the loop).'),
          L('check', 1, 'if i < n', 'If the loop stopped inside the array,'),
          L('found', 2, 'return i', 'x is at index i.'),
          L('miss', 1, 'return -1', 'Otherwise it only found the sentinel.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'search',
      lines: [
        L('sig', 0, 'linearSearch(A, n, x)', 'To find x in A[0..n-1]:'),
        L('loop', 1, 'for i = 0 to n - 1', 'Look at each value in turn.'),
        L('cmp', 2, 'if A[i] == x', 'If it is x,'),
        L('found', 3, 'return i', 'return where it is.'),
        L('miss', 1, 'return -1', 'Checked them all: x is not there.'),
      ],
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'value')}: ${state.a.map((x) => x.value).join(', ')}. Type a value and press Search, or load your own values first.`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length };
}
