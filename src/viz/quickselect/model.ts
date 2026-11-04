import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsCall, BarsPointer } from '../../layouts/bars';
import {
  loadOp,
  makeState,
  mark,
  numberFromArg,
  plural,
  Run,
  SORT_START,
  span,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
} from '../_sorting/kit';
import { partition, partitionLines, type PivotRule, type Scheme } from '../_sorting/partition';

export interface SelectSettings {
  [key: string]: Scalar;
  partition: Scheme;
  /** CLRS's RANDOMIZED-SELECT picks a random pivot. */
  pivot: PivotRule;
  draw: Draw;
}

export const defaults: SelectSettings = { partition: 'lomuto', pivot: 'random', draw: 'bars' };

type Op = OpSpec<ArrayState, SelectSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, number, void>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

/** 1st, 2nd, 3rd, 4th... */
export const ordinal = (k: number): string => {
  const tens = k % 100;
  if (tens >= 11 && tens <= 13) return `${k}th`;
  return `${k}${['th', 'st', 'nd', 'rd'][k % 10] ?? 'th'}`;
};

/** "smallest" for k = 1, otherwise "3rd smallest". */
export const rank = (k: number): string => (k === 1 ? 'smallest' : `${ordinal(k)} smallest`);

const select: Op = {
  label: 'Select',
  arity: 1,
  *run(s, [arg], { settings, rng }) {
    const n = s.a.length;
    const parsed = numberFromArg(arg, 'k');
    const k = typeof parsed === 'number' ? parsed : NaN;
    if (typeof parsed === 'string' || k < 1 || k > n) {
      yield {
        state: s,
        marks: [mark('row-a', 'error')],
        say:
          typeof parsed === 'string'
            ? `select needs one number k, the rank you want. ${parsed}`
            : `k must be between 1 (the smallest) and ${n} (the largest), so select(${k}) has nothing to find.`,
        lines: ['sig'],
        level: 1,
        vars: { n },
      };
      return s;
    }
    const run = new Run(s, ['comparisons', 'swaps']);
    const t = k - 1;
    const lomuto = settings.partition === 'lomuto';
    const stack: BarsCall[] = [];
    const calls = () => stack.map((c) => ({ ...c }));
    const target = (): BarsPointer[] => [{ name: 'target', at: t, role: 'found' }];

    function* quickselect(p: number, r: number): Gen {
      stack.push({ from: p, to: r });
      const depth = stack.length - 1;
      const vars = () => ({ k, p, r, depth });
      const faded = () => [
        ...(p > 0 ? [{ from: 0, to: p - 1 }] : []),
        ...(r < n - 1 ? [{ from: r + 1, to: n - 1 }] : []),
      ];
      const extra = (more: Partial<ArrayExtra> = {}): ArrayExtra => ({
        calls: calls(),
        faded: faded(),
        regions: [{ id: 'window', from: p, to: r, tone: 'window' }],
        pointers: target(),
        ...more,
      });
      if (p === r) {
        yield run.step({
          say: `quickselect(A, ${p}, ${r}): one value is left, and it is in the target slot A[${t}]. The ${rank(k)} value is ${run.v(p)}.`,
          lines: ['base'],
          level: 1,
          marks: [mark(run.id(p), 'found')],
          vars: { ...vars(), result: run.v(p) },
          extra: extra(),
        });
        return run.v(p);
      }
      const q = yield* partition(run, p, r, settings, rng, {
        calls,
        vars,
        pointers: target,
        faded,
        intro: {
          say: `quickselect(A, ${p}, ${r}): the ${rank(k)} value belongs in A[${t}]. Partition ${span(p, r)} and see which side A[${t}] falls on.`,
          lines: ['base', 'part'],
        },
      });
      if (lomuto && q === t) {
        yield run.step({
          say: `The pivot landed in A[${q}], which is the target slot. The ${rank(k)} value is ${run.v(q)}.`,
          lines: ['hit'],
          level: 1,
          marks: [mark(run.id(q), 'found')],
          vars: { ...vars(), q, result: run.v(q) },
          extra: extra(),
        });
        return run.v(q);
      }
      const left = lomuto ? t < q : t <= q;
      const [np, nr] = left ? [p, lomuto ? q - 1 : q] : [q + 1, r];
      yield run.step({
        say: lomuto
          ? `The pivot landed in A[${q}]. The target A[${t}] is to its ${left ? 'left' : 'right'}, so only ${span(np, nr)} matters now; the other side is never looked at again.`
          : `The split is at q = ${q}. The target A[${t}] is in the ${left ? 'left' : 'right'} part, ${span(np, nr)}, so only that part matters now.`,
        lines: left ? ['left', 'goleft'] : ['right'],
        level: 1,
        vars: { ...vars(), q },
        extra: extra({
          faded: [...faded(), ...(left ? [{ from: nr + 1, to: r }] : [{ from: p, to: np - 1 }])],
          pointers: [{ name: 'q', at: q }, ...target()],
        }),
      });
      const found = yield* quickselect(np, nr);
      stack.pop();
      return found;
    }

    const result = yield* quickselect(0, n - 1);
    yield run.step({
      say: `select(${k}) returns ${result}, the ${rank(k)} of the ${plural(n, 'value')}. That took ${run.tally()}.`,
      lines: [],
      level: 1,
      marks: [mark(run.id(t), 'found')],
      vars: { k, result },
      extra: { pointers: target() },
    });
    return run.state();
  },
};

export const ops = {
  load: loadOp<SelectSettings>({ ready: 'Pick a rank k and select.' }),
  select,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: SelectSettings): PseudoBlock[] {
  const lomuto = st.partition === 'lomuto';
  return [
    {
      op: 'select',
      lines: [
        L(
          'sig',
          0,
          'quickselect(A, p, r, k)',
          'To find the k-th smallest value, which belongs in A[k - 1]:',
        ),
        L('base', 1, 'if p == r: return A[p]', 'One value left: it is the answer.'),
        lomuto
          ? L(
              'part',
              1,
              'q = partition(A, p, r)',
              'Partition; the pivot lands in its final place, q.',
            )
          : L('part', 1, 'q = hoarePartition(A, p, r)', 'Partition at q.'),
        ...(lomuto
          ? [
              L(
                'hit',
                1,
                'if k - 1 == q: return A[q]',
                'If the pivot landed in the target slot, done.',
              ),
            ]
          : []),
        lomuto
          ? L('left', 1, 'if k - 1 < q', 'If the target is left of the pivot,')
          : L('left', 1, 'if k - 1 <= q', 'If the target is in the left part,'),
        lomuto
          ? L('goleft', 2, 'return quickselect(A, p, q - 1, k)', 'look only there;')
          : L('goleft', 2, 'return quickselect(A, p, q, k)', 'look only there;'),
        L('right', 1, 'return quickselect(A, q + 1, r, k)', 'otherwise look only right of it.'),
        ...partitionLines(st),
      ],
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'value')}: ${state.a.map((x) => x.value).join(', ')}. Type a rank k (1 for the smallest) and press Select, or load your own values.`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length };
}
