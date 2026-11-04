import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsRegion } from '../../layouts/bars';
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
  type ArrayStep,
  type Draw,
  type Item,
} from '../_sorting/kit';

export interface ShellSettings {
  [key: string]: Scalar;
  /** shell: n/2, n/4, ..., 1. knuth: 1, 4, 13, 40... (3h + 1). ciura: 1, 4, 10, 23, 57... */
  gaps: 'shell' | 'knuth' | 'ciura';
  draw: Draw;
}

export const defaults: ShellSettings = { gaps: 'shell', draw: 'bars' };

const CIURA = [701, 301, 132, 57, 23, 10, 4, 1];

type Op = OpSpec<ArrayState, ShellSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, ArrayState, void>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

/** The gaps used for n values, largest first. */
export function gapsFor(rule: ShellSettings['gaps'], n: number): number[] {
  if (rule === 'shell') {
    const out: number[] = [];
    for (let h = Math.floor(n / 2); h > 0; h = Math.floor(h / 2)) out.push(h);
    return out;
  }
  if (rule === 'knuth') {
    let h = 1;
    while (h < n / 3) h = 3 * h + 1;
    const out: number[] = [];
    for (; h > 0; h = Math.floor(h / 3)) out.push(h);
    return out;
  }
  return CIURA.filter((h) => h < n);
}

const RULE_NAME = { shell: "Shell's halving", knuth: "Knuth's 3h + 1", ciura: "Ciura's" };

/**
 * The list that i belongs to for gap h (i, i - h, i - 2h, ...), shaded slot by slot. With h = 1
 * the list is the whole prefix, which says nothing, so nothing is shaded.
 */
function chain(i: number, h: number): BarsRegion[] {
  const out: BarsRegion[] = [];
  if (h > 1)
    for (let k = i; k >= 0; k -= h) out.push({ id: `list-${k}`, from: k, to: k, tone: 'plain' });
  return out;
}

function* shell(r: Run, rule: ShellSettings['gaps']): Gen {
  const n = r.n;
  const start = [...r.a];
  const gaps = gapsFor(rule, n);
  yield r.step({
    say: `${RULE_NAME[rule]} gaps for n = ${n}: ${gaps.join(', ')}. For each gap h, insertion sort every list of values h apart; the last gap is always 1.`,
    lines: ['init'],
    level: 2,
    vars: { n },
  });
  for (const h of gaps) {
    yield r.step({
      say:
        h === 1
          ? 'h = 1: a plain insertion sort. By now most values are close to their places, so it has little left to do.'
          : `h = ${h}: insertion sort each of the ${Math.min(h, n - h)} lists of values ${h} apart, such as A[0], A[${h}]${2 * h < n ? `, A[${2 * h}]` : ''}.`,
      lines: ['gap'],
      level: 2,
      vars: { h },
    });
    for (let i = h; i < n; i++) {
      const temp: Item = r.a[i]!;
      r.a[i] = { uid: 0, value: temp.value, stale: true };
      let j = i;
      const held = () => ({ uid: temp.uid, value: temp.value, at: j, label: 'temp' });
      const extra = (): ArrayExtra => ({
        pointers: [
          { name: 'j', at: j },
          { name: 'i', at: i },
        ],
        regions: chain(i, h),
        held: held(),
      });
      const vars = () => ({ h, i, temp: temp.value, j });
      yield r.step({
        say: `i = ${i}: temp = ${temp.value}. Insert it into its list, ${listText(i, h)}.`,
        lines: ['outer', 'temp', 'init2'],
        level: 2,
        marks: [mark(`v${temp.uid}`, 'found')],
        vars: vars(),
        extra: extra(),
      });
      // Why the loop stopped, and the value it stopped at; said together with the drop.
      let why = '';
      let stopper: string | null = null;
      for (;;) {
        if (j < h) {
          why = `j = ${j} is less than h = ${h}, so nothing is ${h} places to the left.`;
          break;
        }
        const v = r.v(j - h);
        r.count('comparisons');
        const question = `Is A[j - h] = ${at(j - h, v)} bigger than temp = ${temp.value}?`;
        if (v <= temp.value) {
          // Nothing moves: the question, its answer and the drop are one step.
          why = `${question} No, so stop.`;
          stopper = r.id(j - h);
          break;
        }
        yield r.step({
          say: question,
          lines: ['while'],
          level: 3,
          marks: [mark(r.id(j - h), 'compare'), mark(`v${temp.uid}`, 'found')],
          vars: vars(),
          extra: extra(),
        });
        const moving = r.a[j - h]!;
        r.a[j] = moving;
        r.a[j - h] = { uid: 0, value: moving.value, stale: true };
        r.count('shifts');
        j -= h;
        yield r.step({
          say: `${v} > ${temp.value}, so shift ${v} from A[${j}] to A[${j + h}], ${h} places right. j = ${j}.`,
          lines: ['shift', 'dec'],
          level: 2,
          marks: [mark(`v${moving.uid}`, 'active'), mark(`v${temp.uid}`, 'found')],
          vars: vars(),
          extra: extra(),
        });
      }
      r.a[j] = temp;
      yield r.step({
        say:
          `${why} ` +
          (j === i
            ? `A[${i}] = temp: ${temp.value} was already in order in its list.`
            : `A[${j}] = temp: ${temp.value} drops into the gap.`),
        lines: ['while', 'drop'],
        level: 2,
        marks: [...(stopper ? [mark(stopper, 'compare')] : []), mark(`v${temp.uid}`, 'found')],
        vars: { h, i, temp: temp.value, j },
        extra: {
          pointers: [
            { name: 'j', at: j },
            { name: 'i', at: i },
          ],
          regions: chain(i, h),
        },
      });
    }
    yield r.step({
      say:
        h === 1
          ? `Done with h = 1, so A is sorted.`
          : `Done with h = ${h}: every list of values ${h} apart is sorted, so A is "${h}-sorted": ${r.a.map((x) => x.value).join(', ')}.`,
      lines: rule === 'ciura' ? ['gap'] : ['next'],
      // The last pass ends with the final "Sorted" milestone.
      level: h === 1 ? 2 : 1,
      vars: { h },
    });
  }
  for (let k = 0; k < n; k++) r.done.add(k);
  yield r.step({
    say: `Sorted: ${r.a.map((x) => x.value).join(', ')}. That took ${r.tally()}.${stabilityNote(start, r.a)}`,
    lines: [],
    level: 1,
    vars: { n },
    extra: { regions: doneRegions(r) },
  });
  return r.state();
}

/** "A[1], A[5]" or "A[2], A[6], A[10] and so on". */
function listText(i: number, h: number): string {
  const idx: number[] = [];
  for (let k = i % h; k <= i; k += h) idx.push(k);
  return idx.map((k) => `A[${k}]`).join(', ');
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const r = new Run(s, ['comparisons', 'shifts']);
    if (r.n < 2) {
      for (let k = 0; k < r.n; k++) r.done.add(k);
      yield r.step({
        say: r.n === 1 ? 'A has one value, so it is already sorted.' : 'A is empty.',
        lines: ['sig'],
        level: 1,
        vars: { n: r.n },
      });
      return r.state();
    }
    return yield* shell(r, settings.gaps);
  },
};

export const ops = {
  load: loadOp<ShellSettings>({ ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: ShellSettings): PseudoBlock[] {
  const sig = L('sig', 0, 'shellSort(A, n)', 'To Shell sort the n values in A:');
  const body = [
    L('outer', 2, 'for i = h to n - 1', 'Take each value that has a neighbor h to its left:'),
    L('temp', 3, 'temp = A[i]', 'lift it out,'),
    L('init2', 3, 'j = i', 'and start where it was.'),
    L('while', 3, 'while j >= h and A[j - h] > temp', 'While the value h to the left is bigger,'),
    L('shift', 4, 'A[j] = A[j - h]', 'shift it h places right,'),
    L('dec', 4, 'j = j - h', 'and jump h places left.'),
    L('drop', 3, 'A[j] = temp', 'Drop temp into the gap.'),
  ];
  if (st.gaps === 'ciura') {
    return [
      {
        op: 'sort',
        lines: [
          sig,
          L(
            'init',
            1,
            'gaps = [701, 301, 132, 57, 23, 10, 4, 1]',
            "Ciura's gaps, found by experiment.",
          ),
          L(
            'gap',
            1,
            'for each h in gaps with h < n',
            'For each gap smaller than n, largest first:',
          ),
          ...body,
        ],
      },
    ];
  }
  const knuth = st.gaps === 'knuth';
  return [
    {
      op: 'sort',
      lines: [
        sig,
        knuth
          ? L(
              'init',
              1,
              'h = 1; while h < n / 3: h = 3h + 1',
              'Find the largest gap in 1, 4, 13, 40, ...',
            )
          : L('init', 1, 'h = floor(n / 2)', 'Start with a gap of half the array.'),
        L('gap', 1, 'while h > 0', 'For each gap, largest first:'),
        ...body,
        knuth
          ? L('next', 2, 'h = floor(h / 3)', 'Step down to the next gap: 13, 4, 1.')
          : L('next', 2, 'h = floor(h / 2)', 'Halve the gap.'),
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
