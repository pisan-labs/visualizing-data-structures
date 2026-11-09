import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { Mark, OpCall, PracticeKind, Step, VizDef } from '../../engine/types';
import { and, buildCall, choice, minus, randomValues } from '../_range/kit';
import { levels, type RQExtra, type RQSettings, type RQState } from './model';

type Def = VizDef<RQState, RQSettings, RQExtra>;
type RQStep = Step<RQState, RQExtra>;

const PREFIX: RQSettings = { structure: 'prefix' };
const SPARSE: RQSettings = { structure: 'sparse' };

/** [k, i] of a table entry from its shape id ("m3-2", or "a-2" for row 0). */
function entryOf(id: string): [number, number] {
  const m = /^m(\d+)-(\d+)$/.exec(id);
  if (m) return [Number(m[1]), Number(m[2])];
  return [0, Number(id.slice(2))];
}

const isTableId = (id: string) => /^(m\d+|a)-\d+$/.test(id);

/** "M[3][2]". */
const entry = (k: number, i: number) => `M[${k}][${i}]`;

/** A range i..j inside 0..n-1 whose length is at least 3 and not a power of two. */
function oddRange(rng: Rng, n: number): [number, number] {
  for (;;) {
    const i = rng.int(0, n - 3);
    const j = rng.int(i + 2, n - 1);
    const len = j - i + 1;
    if ((len & (len - 1)) !== 0) return [i, j];
  }
}

/**
 * Practice questions for prefix sums and sparse tables. Every answer comes from running the
 * model, so it always agrees with the drawing. `def` is a getter to avoid an import cycle.
 */
export function rangePractice(def: () => Def): PracticeKind[] {
  /** The steps of the last operation in `cs`. */
  const lastOp = (cs: OpCall[], settings: RQSettings): RQStep[] => {
    const t = new Timeline(def(), settings, 1, cs);
    return t.entries[t.entries.length - 1]!.steps;
  };
  const marked = (st: RQStep, role: Mark['role'], prefix: string) =>
    st.marks.filter((m) => m.role === role && m.id.startsWith(prefix)).map((m) => m.id);

  return [
    {
      id: 'prefix-sum',
      title: 'Answer a sum with P',
      make(rng) {
        const n = rng.int(6, 10);
        const setup = [buildCall(randomValues(rng, n, 1, 20))];
        const i = rng.int(0, n - 2);
        const j = rng.int(i + 1, n - 1);
        const end = lastOp([...setup, ['query', i, j]], PREFIX).at(-1)!;
        const sum = Number(end.vars?.sum);
        const p = end.state.p as number[];
        return {
          prompt: `The picture shows A and its prefix sums P. Use P to work out \`sum(${i}, ${j})\`, the sum of A[${i}] through A[${j}].`,
          setup,
          settings: PREFIX,
          answer: { kind: 'number', value: sum },
          explain: `sum(${i}, ${j}) = P[${j + 1}] − P[${i}] = ${minus(p[j + 1]!, p[i]!)} = ${sum}. One subtraction, instead of adding up ${j - i + 1} values.`,
          watch: [['query', i, j]],
        };
      },
    },
    {
      id: 'which-entries',
      title: 'Which entries of P?',
      make(rng) {
        const n = rng.int(6, 10);
        const setup = [buildCall(randomValues(rng, n, 1, 20))];
        const i = rng.int(1, n - 2);
        const j = rng.int(i + 1, n - 1);
        const end = lastOp([...setup, ['query', i, j]], PREFIX).at(-1)!;
        const hi = Number(marked(end, 'active', 'p-')[0]!.slice(2));
        const lo = Number(marked(end, 'compare', 'p-')[0]!.slice(2));
        const right = `P[${hi}] − P[${lo}]`;
        return {
          prompt: `Which two entries of P give \`sum(${i}, ${j})\`, the sum of A[${i}] through A[${j}] with both ends included?`,
          setup,
          settings: PREFIX,
          answer: choice(rng, right, [
            `P[${j}] − P[${i}]`,
            `P[${j + 1}] − P[${i + 1}]`,
            `P[${j}] − P[${i - 1}]`,
            `P[${j + 1}] − P[${i - 1}]`,
          ]),
          explain: `P[k] is the sum of the first k values, A[0..k − 1]. P[${hi}] covers everything up to A[${j}], and P[${lo}] covers everything before A[${i}], so ${right} leaves exactly A[${i}..${j}].`,
          watch: [['query', i, j]],
        };
      },
    },
    {
      id: 'sparse-windows',
      title: 'Which two windows does min read?',
      make(rng) {
        const n = rng.int(9, 16);
        const setup = [buildCall(randomValues(rng, n, 1, 40))];
        const [i, j] = oddRange(rng, n);
        const end = lastOp([...setup, ['query', i, j]], SPARSE).at(-1)!;
        const read = end.marks
          .filter((m) => m.role === 'active' && isTableId(m.id))
          .map((m) => entryOf(m.id))
          .sort((x, y) => x[1] - y[1]);
        const [[k, a], [, b]] = [read[0]!, read[1]!];
        const right = `${entry(k, a)} and ${entry(k, b)}`;
        const K = levels(n);
        const wrong: string[] = [`${entry(k, i)} and ${entry(k, j)}`];
        if (k >= 1) wrong.push(`${entry(k - 1, i)} and ${entry(k - 1, j - 2 ** (k - 1) + 1)}`);
        if (k + 1 <= K && i + 2 ** (k + 1) <= n && j - 2 ** (k + 1) + 1 >= 0)
          wrong.push(`${entry(k + 1, i)} and ${entry(k + 1, j - 2 ** (k + 1) + 1)}`);
        if (i + 2 ** k <= n - 2 ** k) wrong.push(`${entry(k, i)} and ${entry(k, i + 2 ** k)}`);
        return {
          prompt: `The picture shows A and its sparse table, where M[k][i] is the smallest of the 2^k values that start at A[i]. Which two entries does \`min(${i}, ${j})\` compare?`,
          setup,
          settings: SPARSE,
          answer: choice(rng, right, wrong),
          explain: `The range has ${j - i + 1} values, and the longest power of two that fits is 2^${k} = ${2 ** k}, so k = ${k}. One window starts at i = ${i}; the other ends at j = ${j}, so it starts at ${j} − ${2 ** k} + 1 = ${b}. Together they cover A[${i}..${j}], overlapping in the middle.`,
          watch: [['query', i, j]],
        };
      },
    },
    {
      id: 'update-count',
      title: 'How many entries does an update change?',
      make(rng) {
        const sparse = rng.int(0, 1) === 1;
        const settings = sparse ? SPARSE : PREFIX;
        const n = rng.int(8, sparse ? 16 : 12);
        const values = randomValues(rng, n, 1, 30);
        const setup = [buildCall(values)];
        const i = rng.int(0, n - 1);
        let x = rng.int(1, 30);
        if (x === values[i]) x = x === 30 ? 1 : x + 1;
        const steps = lastOp([...setup, ['update', i, x]], settings);
        const count = Number(steps.at(-1)!.vars?.['update cost']);
        if (!sparse) {
          return {
            prompt: `\`update(${i}, ${x})\` sets A[${i}] to ${x}. How many entries of P have to change?`,
            setup,
            settings,
            answer: { kind: 'number', value: count },
            explain: `P[k] is the sum of A[0..k − 1], so it includes A[${i}] exactly when k > ${i}: ${count === 1 ? `only P[${n}], 1 entry` : `P[${i + 1}] to P[${n}], ${count} entries`}. Changing A[0] would change all ${n}.`,
            watch: [['update', i, x]],
          };
        }
        // Rows of the table, read from the row-summary steps of the update.
        const perRow = steps
          .filter((st) => st.lines.length === 1 && st.lines[0] === 'su.level')
          .map((st) => st.marks.filter((m) => m.role === 'done').length);
        return {
          prompt: `\`update(${i}, ${x})\` sets A[${i}] to ${x}. Not counting row 0 (A itself), how many entries of the sparse table have to be recomputed?`,
          setup,
          settings,
          answer: { kind: 'number', value: count },
          explain: `Row k holds windows of 2^k values. The ones that contain position ${i} start from ${i} − 2^k + 1 up to ${i}, as far as they fit in A. Row by row that is ${and(perRow.map(String))}, so ${count} in all.`,
          watch: [['update', i, x]],
        };
      },
    },
  ];
}
