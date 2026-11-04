/**
 * Partitioning for quicksort and quickselect: pivot rules, Lomuto's scheme (CLRS PARTITION)
 * and Hoare's (CLRS Problem 7-1), as step generators with their pseudocode.
 */
import type { Rng } from '../../engine/rng';
import type { PseudoLine, Scalar, SettingSpec } from '../../engine/types';
import type { BarsCall, BarsPointer, BarsRegion } from '../../layouts/bars';
import { at, mark, span, type ArrayExtra, type ArrayStep, type Run } from './kit';

export type Scheme = 'lomuto' | 'hoare';
export type PivotRule = 'last' | 'first' | 'middle' | 'median3' | 'random';

export interface PartitionSettings {
  partition: Scheme;
  pivot: PivotRule;
}

export const partitionSettings = (randomNote: string): SettingSpec[] => [
  {
    kind: 'choice',
    key: 'partition',
    label: 'Partition scheme',
    options: [
      { value: 'lomuto', label: "Lomuto's (CLRS): one index walks, the pivot ends in place" },
      { value: 'hoare', label: "Hoare's: two indices walk toward each other" },
    ],
    help: "Hoare's makes about three times fewer swaps and splits runs of equal values evenly.",
  },
  {
    kind: 'choice',
    key: 'pivot',
    label: 'Pivot',
    options: [
      { value: 'last', label: 'Last value (CLRS)' },
      { value: 'first', label: 'First value' },
      { value: 'middle', label: 'Middle value' },
      { value: 'median3', label: 'Median of first, middle and last' },
      { value: 'random', label: 'Random value (seeded, so replays match)' },
    ],
    help: `The chosen pivot is swapped to the end (Lomuto) or the front (Hoare) first. ${randomNote}`,
  },
];

/** What the page shows around a partition: the call stack, variables, extra pointers. */
export interface Around {
  calls: () => BarsCall[];
  vars: () => Record<string, Scalar>;
  pointers?: () => BarsPointer[];
  /** Index ranges out of play (quickselect fades the side it no longer needs). */
  faded?: () => { from: number; to: number }[];
  /** Said before the partition's first step (the call it belongs to), with its lines. */
  intro?: { say: string; lines: string[] };
}

const RULE_TEXT: Record<PivotRule, string> = {
  last: 'the last value',
  first: 'the first value',
  middle: 'the middle value',
  median3: 'the median of the first, middle and last values',
  random: 'a random value',
};

/**
 * Pick the pivot's index in A[p..r] by the rule. Median of three looks at A[p], A[mid] and
 * A[r]; on ties it prefers the later position, so sorted runs still split in the middle.
 */
export function choosePivot(run: Run, p: number, r: number, rule: PivotRule, rng: Rng): number {
  const mid = Math.floor((p + r) / 2);
  switch (rule) {
    case 'last':
      return r;
    case 'first':
      return p;
    case 'middle':
      return mid;
    case 'random':
      return rng.int(p, r);
    case 'median3': {
      const c = [p, mid, r].sort((x, y) => run.v(x) - run.v(y) || x - y);
      return c[1]!;
    }
  }
}

/**
 * Partition A[p..r] and return q. Lomuto: the pivot ends in A[q], everything left of it is
 * <= the pivot and everything right of it is bigger. Hoare: A[p..q] <= pivot <= A[q+1..r].
 */
export function* partition(
  run: Run,
  p: number,
  r: number,
  st: PartitionSettings,
  rng: Rng,
  around: Around,
): Generator<ArrayStep, number, void> {
  const lomuto = st.partition === 'lomuto';
  const home = lomuto ? r : p;
  const window: BarsRegion = { id: 'window', from: p, to: r, tone: 'window' };
  const base = (): ArrayExtra => ({
    calls: around.calls(),
    faded: around.faded?.(),
    regions: [window],
    pointers: around.pointers?.(),
  });

  // Choose the pivot and move it to A[r] (Lomuto) or A[p] (Hoare).
  // The first step of the partition also announces the call it belongs to.
  let intro = around.intro;
  const first = (say: string, lines: string[]) => {
    const out = intro
      ? { say: `${intro.say} ${say}`, lines: [...intro.lines, ...lines] }
      : { say, lines };
    intro = undefined;
    return out;
  };
  const natural = lomuto ? 'last' : 'first';
  const c = choosePivot(run, p, r, st.pivot, rng);
  if (st.pivot !== natural) {
    const why =
      st.pivot === 'median3'
        ? `The median of ${at(p, run.v(p))}, ${at(Math.floor((p + r) / 2), run.v(Math.floor((p + r) / 2)))} and ${at(r, run.v(r))} is ${run.v(c)}.`
        : st.pivot === 'random'
          ? `The random pick is ${at(c, run.v(c))}.`
          : `The pivot is ${RULE_TEXT[st.pivot]}, ${at(c, run.v(c))}.`;
    const moved = c !== home;
    if (moved) {
      run.swap(c, home);
      run.count('swaps');
    }
    yield run.step({
      ...first(
        moved
          ? `${why} Swap it into A[${home}], where ${lomuto ? 'Lomuto' : 'Hoare'}'s partition expects the pivot.`
          : `${why} It is already in A[${home}], where ${lomuto ? 'Lomuto' : 'Hoare'}'s partition expects the pivot.`,
        ['choose'],
      ),
      level: 2,
      marks: moved
        ? [mark(run.id(home), 'found'), mark(run.id(c), 'active')]
        : [mark(run.id(home), 'found')],
      vars: around.vars(),
      extra: base(),
    });
  }
  const pivot = run.a[home]!;
  const x = pivot.value;
  const px = mark(`v${pivot.uid}`, 'found');

  if (lomuto) {
    let i = p - 1;
    let j = p;
    /** The <= part is A[p..i]; the > part is A[i+1..last], the values already looked at. */
    const regions = (last: number): BarsRegion[] => [
      window,
      ...(i >= p ? [{ id: 'low', from: p, to: i, tone: 'plain' as const, label: `≤ ${x}` }] : []),
      ...(last > i
        ? [{ id: 'high', from: i + 1, to: last, tone: 'plain' as const, label: `> ${x}` }]
        : []),
    ];
    const extra = (last: number): ArrayExtra => ({
      calls: around.calls(),
      faded: around.faded?.(),
      regions: regions(last),
      pointers: [
        { name: 'j', at: j },
        { name: 'i', at: i },
        { name: 'pivot', at: r, role: 'found' },
        ...(around.pointers?.() ?? []),
      ],
    });
    const vars = () => ({ ...around.vars(), x, i, j });
    yield run.step({
      ...first(
        `The pivot is x = A[${r}] = ${x}. i = ${i}: nothing is known to be ≤ ${x} yet. Walk j from ${p} to ${r - 1}.`,
        ['pivot', 'init'],
      ),
      level: 2,
      marks: [px],
      vars: vars(),
      extra: extra(p - 1),
    });
    for (j = p; j <= r - 1; j++) {
      const v = run.v(j);
      run.count('comparisons');
      const question = `Is ${at(j, v)} ≤ x = ${x}?`;
      if (v > x) {
        // Nothing moves, so the question and its answer are one step.
        yield run.step({
          say: `${question} No, so it joins the > ${x} part.`,
          lines: ['loop', 'cmp'],
          level: 2,
          marks: [px, mark(run.id(j), 'compare')],
          vars: vars(),
          extra: extra(j),
        });
        continue;
      }
      const self = i + 1 === j;
      if (!self) {
        // Something is about to move: show the question first.
        yield run.step({
          say: question,
          lines: ['loop', 'cmp'],
          level: 3,
          marks: [px, mark(run.id(j), 'compare')],
          vars: vars(),
          extra: extra(j - 1),
        });
      }
      i++;
      const displaced = run.v(i);
      if (!self) {
        run.swap(i, j);
        run.count('swaps');
      }
      yield run.step({
        say: self
          ? `${question} Yes: i = ${i}. A[i] and A[j] are the same slot, so ${v} stays put and the ≤ ${x} part grows.`
          : `Yes: i = ${i}, and swap A[${i}] = ${displaced} with A[${j}] = ${v}. ${v} joins the ≤ ${x} part.`,
        lines: self ? ['loop', 'cmp', 'inc', 'swap'] : ['inc', 'swap'],
        level: 2,
        marks: self
          ? [px, mark(run.id(i), 'active')]
          : [px, mark(run.id(i), 'active'), mark(run.id(j), 'active')],
        vars: vars(),
        extra: extra(j),
      });
    }
    const q = i + 1;
    if (q !== r) {
      run.swap(q, r);
      run.count('swaps');
    }
    run.done.add(q);
    yield run.step({
      say:
        q === r
          ? `Nothing was bigger than ${x}, so the pivot stays in A[${r}]. That is its final place.`
          : `Swap A[i + 1] = A[${q}] with the pivot in A[${r}]: ${x} lands in A[${q}], its final place.`,
      lines: ['place', 'ret'],
      level: 2,
      marks: [mark(`v${pivot.uid}`, 'done')],
      vars: { ...vars(), q },
      extra: {
        calls: around.calls(),
        faded: around.faded?.(),
        regions: [
          window,
          ...(q - 1 >= p
            ? [{ id: 'low', from: p, to: q - 1, tone: 'plain' as const, label: `≤ ${x}` }]
            : []),
          ...(q + 1 <= r
            ? [{ id: 'high', from: q + 1, to: r, tone: 'plain' as const, label: `> ${x}` }]
            : []),
        ],
        pointers: [{ name: 'q', at: q, role: 'done' }, ...(around.pointers?.() ?? [])],
      },
    });
    return q;
  }

  // Hoare: j walks left past values bigger than x, i walks right past values smaller.
  let i = p - 1;
  let j = r + 1;
  // A[p..lowEnd] is known to be <= x and A[highStart..r] >= x.
  let lowEnd = p - 1;
  let highStart = r + 1;
  const regions = (): BarsRegion[] => [
    window,
    ...(lowEnd >= p
      ? [{ id: 'low', from: p, to: lowEnd, tone: 'plain' as const, label: `≤ ${x}` }]
      : []),
    ...(highStart <= r
      ? [{ id: 'high', from: highStart, to: r, tone: 'plain' as const, label: `≥ ${x}` }]
      : []),
  ];
  const extra = (): ArrayExtra => ({
    calls: around.calls(),
    faded: around.faded?.(),
    regions: regions(),
    pointers: [{ name: 'i', at: i }, { name: 'j', at: j }, ...(around.pointers?.() ?? [])],
  });
  const vars = () => ({ ...around.vars(), x, i, j });
  yield run.step({
    ...first(
      `The pivot is x = A[${p}] = ${x}. Start i just before ${span(p, r)} and j just after it.`,
      ['pivot', 'init'],
    ),
    level: 2,
    marks: [px],
    vars: vars(),
    extra: extra(),
  });
  for (;;) {
    // repeat j = j - 1 until A[j] <= x
    for (;;) {
      j--;
      const v = run.v(j);
      run.count('comparisons');
      const stop = v <= x;
      if (!stop) highStart = j;
      yield run.step({
        say: stop
          ? `j = ${j}: ${at(j, v)} ≤ ${x}, so j stops here.`
          : `j = ${j}: ${at(j, v)} > ${x}, keep moving left.`,
        lines: ['loop', 'down'],
        level: stop ? 2 : 3,
        marks: [px, mark(run.id(j), 'compare')],
        vars: vars(),
        extra: extra(),
      });
      if (stop) break;
    }
    // repeat i = i + 1 until A[i] >= x
    for (;;) {
      i++;
      const v = run.v(i);
      run.count('comparisons');
      const stop = v >= x;
      if (!stop) lowEnd = i;
      yield run.step({
        say: stop
          ? `i = ${i}: ${at(i, v)} ≥ ${x}, so i stops here.`
          : `i = ${i}: ${at(i, v)} < ${x}, keep moving right.`,
        lines: ['up'],
        level: stop ? 2 : 3,
        marks: [px, mark(run.id(i), 'compare')],
        vars: vars(),
        extra: extra(),
      });
      if (stop) break;
    }
    if (i < j) {
      const [a, b] = [run.v(i), run.v(j)];
      run.swap(i, j);
      run.count('swaps');
      lowEnd = i;
      highStart = j;
      yield run.step({
        say: `i = ${i} < j = ${j}: swap A[${i}] = ${a} and A[${j}] = ${b}. Now ${b} is on the left and ${a} on the right.`,
        lines: ['swap'],
        level: 2,
        marks: [mark(run.id(i), 'active'), mark(run.id(j), 'active')],
        vars: vars(),
        extra: extra(),
      });
      continue;
    }
    yield run.step({
      say: `i = ${i} ≥ j = ${j}: the indices met. Return q = ${j}: everything in ${span(p, j)} is ≤ ${x} and everything in ${span(j + 1, r)} is ≥ ${x}.`,
      lines: ['ret'],
      level: 2,
      vars: { ...vars(), q: j },
      extra: {
        calls: around.calls(),
        faded: around.faded?.(),
        regions: [
          window,
          { id: 'low', from: p, to: j, tone: 'plain', label: `≤ ${x}` },
          { id: 'high', from: j + 1, to: r, tone: 'plain', label: `≥ ${x}` },
        ],
        pointers: [{ name: 'q', at: j }, ...(around.pointers?.() ?? [])],
      },
    });
    return j;
  }
}

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

/** The partition function's pseudocode, following the settings. */
export function partitionLines(st: PartitionSettings): PseudoLine[] {
  const lomuto = st.partition === 'lomuto';
  const home = lomuto ? 'A[r]' : 'A[p]';
  const choose: Record<PivotRule, PseudoLine | null> = {
    last: lomuto
      ? null
      : L(
          'choose',
          1,
          'swap A[p] and A[r]',
          'Use the last value as the pivot: move it to the front.',
        ),
    first: lomuto
      ? L(
          'choose',
          1,
          'swap A[r] and A[p]',
          'Use the first value as the pivot: move it to the end.',
        )
      : null,
    middle: L(
      'choose',
      1,
      `swap ${home} and A[floor((p+r)/2)]`,
      `Use the middle value as the pivot: move it to ${home}.`,
    ),
    median3: L(
      'choose',
      1,
      `swap ${home} and A[median3(p, r)]`,
      `Use the median of the first, middle and last values (A[p], A[mid], A[r]): move it to ${home}.`,
    ),
    random: L(
      'choose',
      1,
      `swap ${home} and A[random(p, r)]`,
      `Use a random value as the pivot: move it to ${home}.`,
    ),
  };
  const pick = choose[st.pivot] ? [choose[st.pivot]!] : [];
  if (lomuto) {
    return [
      L('psig', 0, 'partition(A, p, r)', 'To partition A[p..r] around a pivot:'),
      ...pick,
      L('pivot', 1, 'x = A[r]', 'The pivot is the last value.'),
      L('init', 1, 'i = p - 1', 'Nothing is known to be <= x yet.'),
      L('loop', 1, 'for j = p to r - 1', 'Look at every other value:'),
      L('cmp', 2, 'if A[j] <= x', 'if it is not bigger than the pivot,'),
      L('inc', 3, 'i = i + 1', 'grow the <= x part by one slot'),
      L('swap', 3, 'swap A[i] and A[j]', 'and move the value into it.'),
      L('place', 1, 'swap A[i + 1] and A[r]', 'Put the pivot between the two parts.'),
      L('ret', 1, 'return i + 1', 'Return where the pivot landed.'),
    ];
  }
  return [
    L('psig', 0, 'hoarePartition(A, p, r)', 'To partition A[p..r] around a pivot:'),
    ...pick,
    L('pivot', 1, 'x = A[p]', 'The pivot is the first value.'),
    L('init', 1, 'i = p - 1; j = r + 1', 'Start just outside both ends.'),
    L('loop', 1, 'while true', 'Repeat:'),
    L('down', 2, 'repeat j = j - 1 until A[j] <= x', 'walk j left to a value that is not bigger,'),
    L('up', 2, 'repeat i = i + 1 until A[i] >= x', 'walk i right to a value that is not smaller;'),
    L('swap', 2, 'if i < j: swap A[i] and A[j]', 'if they have not crossed, swap the two,'),
    L('ret', 2, 'else return j', 'otherwise the split is at j.'),
  ];
}
