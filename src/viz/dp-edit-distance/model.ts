import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step } from '../../engine/types';
import type { Cell } from '../../layouts/table';
import { cellId, mark, plural, wordFromArg } from '../_dp/kit';

export const MAX_LEN = 9;

export interface EditState {
  /** The source word: rows, A[1..m]. */
  a: string;
  /** The target word: columns, B[1..n]. */
  b: string;
  /** D[i][j], the cheapest way to turn A[1..i] into B[1..j]; null where not filled yet. */
  d: (number | null)[][];
}

export interface EditSettings {
  [key: string]: Scalar;
  ins: number;
  del: number;
  sub: number;
}

/** One column of the alignment: M match, S substitute, D delete, I insert. */
export type EditOp = 'M' | 'S' | 'D' | 'I';

export interface AlignColumn {
  op: EditOp;
  /** The source and target characters, '' for a gap. */
  from: string;
  to: string;
  /** The cell this column's move started from. */
  i: number;
  j: number;
}

/** View-only data for one step. */
export interface EditExtra {
  reads?: { from: Cell; to: Cell; win: boolean; op: EditOp }[];
  path?: Cell[];
  /** The alignment columns found so far, with their place in the whole alignment. */
  columns?: { col: AlignColumn; k: number }[];
  /** How many columns the alignment has. */
  width?: number;
}

type S = EditState;
type X = EditExtra;
type Op = OpSpec<S, EditSettings, X>;
type EditStep = Step<S, X>;
type Gen = Generator<EditStep, S, void>;

export const defaults: EditSettings = { ins: 1, del: 1, sub: 1 };

export const START_A = 'kitten';
export const START_B = 'sitting';

export const emptyTable = (m: number, n: number): (number | null)[][] =>
  Array.from({ length: m + 1 }, () => Array<number | null>(n + 1).fill(null));

export function init(): S {
  return { a: START_A, b: START_B, d: emptyTable(START_A.length, START_B.length) };
}

export const aId = (i: number) => `rh-1-${i}`;
export const bId = (j: number) => `ch-1-${j}`;

export function filledRows(s: S): number {
  let r = -1;
  for (let i = 0; i < s.d.length; i++) {
    if (s.d[i]!.every((v) => v !== null)) r = i;
    else break;
  }
  return r;
}

export const isFull = (s: S) => filledRows(s) === s.a.length;

const q = (ch: string) => `'${ch}'`;
const costWord = (n: number) => (n === 1 ? '1' : String(n));

/**
 * The move the walk back makes from D[i][j]: the diagonal first (a match or a substitution),
 * then a delete (up), then an insert (left), taking the first that explains the value.
 */
export function backMove(s: S, i: number, j: number, st: EditSettings): AlignColumn {
  const v = s.d[i]![j]!;
  if (i > 0 && j > 0) {
    const same = s.a[i - 1] === s.b[j - 1];
    if (s.d[i - 1]![j - 1]! + (same ? 0 : st.sub) === v)
      return { op: same ? 'M' : 'S', from: s.a[i - 1]!, to: s.b[j - 1]!, i, j };
  }
  if (i > 0 && s.d[i - 1]![j]! + st.del === v) return { op: 'D', from: s.a[i - 1]!, to: '', i, j };
  return { op: 'I', from: '', to: s.b[j - 1]!, i, j };
}

/** The whole walk back from D[m][n] to D[0][0], in the order it is walked. */
export function walkBack(s: S, st: EditSettings): AlignColumn[] {
  const out: AlignColumn[] = [];
  let i = s.a.length;
  let j = s.b.length;
  while (i > 0 || j > 0) {
    const c = backMove(s, i, j, st);
    out.push(c);
    if (c.op !== 'I') i--;
    if (c.op !== 'D') j--;
  }
  return out;
}

export function describeOp(c: AlignColumn, st: EditSettings): string {
  switch (c.op) {
    case 'M':
      return `${q(c.from)} matches ${q(c.to)}, free`;
    case 'S':
      return `substitute ${q(c.to)} for ${q(c.from)}, cost ${costWord(st.sub)}`;
    case 'D':
      return `delete ${q(c.from)}, cost ${costWord(st.del)}`;
    case 'I':
      return `insert ${q(c.to)}, cost ${costWord(st.ins)}`;
  }
}

function* fillRows(s: S, last: number, st: EditSettings): Gen {
  const { a, b } = s;
  const m = a.length;
  const n = b.length;
  const d = s.d.map((r) => [...r]);
  const state = (): S => ({ a, b, d: d.map((r) => [...r]) });
  let from = filledRows(s) + 1;
  if (from === 0) {
    for (let i = 0; i <= m; i++) d[i]![0] = i * st.del;
    for (let j = 0; j <= n; j++) d[0]![j] = j * st.ins;
    yield {
      state: state(),
      marks: [
        ...Array.from({ length: n + 1 }, (_, j) => mark(cellId(0, j), 'new')),
        ...Array.from({ length: m }, (_, i) => mark(cellId(i + 1, 0), 'new')),
      ],
      say: `Row 0: turning nothing into B[1..j] takes j inserts, so D[0][j] = ${st.ins === 1 ? 'j' : `${st.ins}j`}. Column 0: turning A[1..i] into nothing takes i deletes, so D[i][0] = ${st.del === 1 ? 'i' : `${st.del}i`}.`,
      lines: ['l.base'],
      vars: { m, n, i: 0 },
      level: last === 0 ? 1 : 2,
    };
    from = 1;
  }
  for (let i = from; i <= last; i++) {
    for (let j = 1; j <= n; j++) {
      const ai = a[i - 1]!;
      const bj = b[j - 1]!;
      const same = ai === bj;
      const vars = { m, n, i, j };
      yield {
        state: state(),
        marks: [mark(cellId(i, j), 'active'), mark(aId(i), 'compare'), mark(bId(j), 'compare')],
        say: `D[${i}][${j}]: compare A[${i}] = ${q(ai)} with B[${j}] = ${q(bj)}.`,
        lines: ['l.loop'],
        vars,
        level: 3,
      };
      const diag = d[i - 1]![j - 1]! + (same ? 0 : st.sub);
      const up = d[i - 1]![j]! + st.del;
      const left = d[i]![j - 1]! + st.ins;
      const best = Math.min(diag, up, left);
      const win: EditOp = diag === best ? (same ? 'M' : 'S') : up === best ? 'D' : 'I';
      d[i]![j] = best;
      const how =
        win === 'M'
          ? `a match, free`
          : win === 'S'
            ? `substitute ${q(bj)} for ${q(ai)}`
            : win === 'D'
              ? `delete ${q(ai)}`
              : `insert ${q(bj)}`;
      let say = `D[${i}][${j}] = min(${same ? `D[${i - 1}][${j - 1}]` : `D[${i - 1}][${j - 1}] + ${st.sub}`}, D[${i - 1}][${j}] + ${st.del}, D[${i}][${j - 1}] + ${st.ins}) = min(${diag}, ${up}, ${left}) = ${best}: ${how}.`;
      if (j === n) say += ` Row ${i} is done.`;
      const reads: X['reads'] = [
        { from: [i - 1, j - 1], to: [i, j], win: win === 'M' || win === 'S', op: same ? 'M' : 'S' },
        { from: [i - 1, j], to: [i, j], win: win === 'D', op: 'D' },
        { from: [i, j - 1], to: [i, j], win: win === 'I', op: 'I' },
      ];
      yield {
        state: state(),
        marks: [
          mark(cellId(i, j), 'active'),
          ...reads.map((r) => mark(cellId(r.from[0], r.from[1]), 'compare')),
          ...(same ? [mark(aId(i), 'found'), mark(bId(j), 'found')] : []),
        ],
        say,
        lines: ['l.loop', 'l.cost', 'l.min'],
        vars: { ...vars, 'D[i][j]': best },
        level: j === n ? 1 : 2,
        extra: { reads },
      };
    }
  }
  return state();
}

const fill: Op = {
  label: 'Fill the table',
  arity: 0,
  *run(s, _args, { settings }): Gen {
    const m = s.a.length;
    const n = s.b.length;
    if (isFull(s)) {
      yield {
        state: s,
        marks: [mark(cellId(m, n), 'found')],
        say: `The table is already full: D[${m}][${n}] = ${s.d[m]![n]}. Press Trace back to see the edits, or Load two new words.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const end = yield* fillRows(s, m, settings);
    const dist = end.d[m]![n]!;
    yield {
      state: end,
      marks: [mark(cellId(m, n), 'found')],
      say: `D[${m}][${n}] = ${dist}: turning ${q(s.a)} into ${q(s.b)} costs ${dist}.${dist ? ' Press Trace back to see which edits.' : ' They are the same word.'}`,
      lines: ['l.ret'],
      vars: { m, n, distance: dist },
      level: 1,
    };
    return end;
  },
};

const row: Op = {
  label: 'Fill one row',
  arity: 0,
  *run(s, _args, { settings }): Gen {
    const done = filledRows(s);
    if (done === s.a.length) {
      yield {
        state: s,
        marks: [],
        say: 'Every row is filled already. Press Trace back, or Load two new words.',
        lines: [],
        level: 1,
      };
      return s;
    }
    return yield* fillRows(s, done + 1, settings);
  },
};

const trace: Op = {
  label: 'Trace back',
  arity: 0,
  *run(s, _args, { settings }): Gen {
    const m = s.a.length;
    const n = s.b.length;
    if (!isFull(s)) {
      yield {
        state: s,
        marks: [mark(cellId(m, n), 'error')],
        say: `Fill the table first. The walk back starts at D[${m}][${n}] and reads the cells on its way to D[0][0].`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const walk = walkBack(s, settings);
    const width = walk.length;
    const dist = s.d[m]![n]!;
    let i = m;
    let j = n;
    const path: Cell[] = [[i, j]];
    const columns: { col: AlignColumn; k: number }[] = [];
    const extra = (): X => ({ path: [...path], columns: [...columns], width });
    yield {
      state: s,
      marks: [mark(cellId(i, j), 'active')],
      say: `Start at D[${m}][${n}] = ${dist} and walk back the way each value was made, to D[0][0]. Each step is one column of the alignment, so it fills from the right.`,
      lines: ['p.sig'],
      vars: { i, j, distance: dist },
      level: 2,
      extra: extra(),
    };
    for (const col of walk) {
      const before = `D[${i}][${j}] = ${s.d[i]![j]}`;
      if (col.op !== 'I') i--;
      if (col.op !== 'D') j--;
      columns.push({ col, k: width - columns.length - 1 });
      path.push([i, j]);
      const dir = col.op === 'D' ? 'up' : col.op === 'I' ? 'left' : 'diagonally';
      yield {
        state: s,
        marks: [
          mark(cellId(i, j), 'active'),
          ...(col.op === 'M' || col.op === 'S'
            ? [mark(aId(col.i), 'found'), mark(bId(col.j), 'found')]
            : col.op === 'D'
              ? [mark(aId(col.i), 'found')]
              : [mark(bId(col.j), 'found')]),
        ],
        say: `${before} came from D[${i}][${j}] = ${s.d[i]![j]}, ${dir}: ${describeOp(col, settings)}.`,
        lines:
          col.op === 'M' || col.op === 'S' ? ['p.diag'] : col.op === 'D' ? ['p.del'] : ['p.ins'],
        vars: { i, j, distance: dist },
        level: 2,
        extra: extra(),
      };
    }
    const count = (op: EditOp) => walk.filter((c) => c.op === op).length;
    const parts = [
      count('S') ? plural(count('S'), 'substitution') : '',
      count('D') ? plural(count('D'), 'delete') : '',
      count('I') ? plural(count('I'), 'insert') : '',
    ].filter(Boolean);
    const ops = [...walk]
      .reverse()
      .map((c) => c.op)
      .join('');
    yield {
      state: s,
      marks: [mark(cellId(0, 0), 'visit')],
      say:
        dist === 0
          ? `Back at D[0][0]: every column is a match, so the words are the same and the distance is 0.`
          : `Back at D[0][0]. Read the alignment from left to right: ${parts.join(', ')}, and ${plural(count('M'), 'match', 'matches')}. Total cost ${dist}.`,
      lines: ['p.stop'],
      vars: { distance: dist, ops },
      level: 1,
      extra: extra(),
    };
    return s;
  },
};

const load: Op = {
  label: 'Load',
  arity: 2,
  *run(s, [x, y]): Gen {
    const a = wordFromArg(x, MAX_LEN, 'the source word');
    const b = wordFromArg(y, MAX_LEN, 'the target word');
    if ('error' in a || 'error' in b) {
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${'error' in a ? a.error : ''}${'error' in a && 'error' in b ? ' ' : ''}${'error' in b ? b.error : ''} The table stays as it was.`,
        lines: [],
        level: 1,
      };
      return s;
    }
    const next: S = { a: a.word, b: b.word, d: emptyTable(a.word.length, b.word.length) };
    yield {
      state: next,
      marks: [],
      say: `Turn ${q(a.word)} (the rows) into ${q(b.word)} (the columns). D[i][j] will hold the cheapest way to turn A[1..i] into B[1..j]. Press Fill the table.`,
      lines: [],
      vars: { m: a.word.length, n: b.word.length },
      level: 1,
    };
    return next;
  },
};

export const ops = { load, fill, row, trace };

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: EditSettings): PseudoBlock[] {
  return [
    {
      op: 'fill',
      lines: [
        L('l.sig', 0, 'editDistance(A, B)', 'To fill the table for A[1..m] and B[1..n]:'),
        L(
          'l.base',
          1,
          `D[i][0] = ${st.del === 1 ? '' : `${st.del}·`}i; D[0][j] = ${st.ins === 1 ? '' : `${st.ins}·`}j`,
          'Building from nothing takes inserts; going to nothing takes deletes.',
        ),
        L('l.loop', 1, 'for i = 1 to m, for j = 1 to n', 'Row by row, left to right:'),
        L(
          'l.cost',
          2,
          `cost = 0 if A[i] == B[j] else ${st.sub}`,
          'a match is free, a substitution is not;',
        ),
        L(
          'l.min',
          2,
          `D[i][j] = min(D[i-1][j-1] + cost, D[i-1][j] + ${st.del}, D[i][j-1] + ${st.ins})`,
          'take the cheapest of substitute (or match), delete and insert.',
        ),
        L('l.ret', 1, 'return D[m][n]', 'The bottom-right cell is the edit distance.'),
      ],
    },
    {
      op: 'trace',
      lines: [
        L('p.sig', 0, 'traceBack(i = m, j = n)', 'To list the edits, start at the bottom-right:'),
        L(
          'p.diag',
          1,
          'if D[i][j] == D[i-1][j-1] + cost: match or substitute; i--, j--',
          'if the diagonal explains the value, it was a match or a substitution;',
        ),
        L(
          'p.del',
          1,
          `else if D[i][j] == D[i-1][j] + ${st.del}: delete A[i]; i--`,
          'else if the cell above does, A[i] was deleted;',
        ),
        L('p.ins', 1, 'else: insert B[j]; j--', 'otherwise B[j] was inserted.'),
        L('p.stop', 1, 'until i == 0 and j == 0', 'Stop at the top-left corner.'),
      ],
    },
  ];
}

export function initialSay(state: S, st: EditSettings): string {
  const costs =
    st.ins === 1 && st.del === 1 && st.sub === 1
      ? 'Every insert, delete and substitution costs 1.'
      : `An insert costs ${st.ins}, a delete ${st.del} and a substitution ${st.sub}.`;
  return `Turn ${q(state.a)} into ${q(state.b)}. ${costs} Press Fill the table, or Load two words of your own (up to ${MAX_LEN} letters or digits each).`;
}

export function initialVars(state: S) {
  return { m: state.a.length, n: state.b.length };
}

export function describe(state: S): string {
  const rows = state.d.map(
    (r, i) =>
      `row ${i}${i ? ` (${state.a[i - 1]})` : ''}: ${r.map((v) => (v === null ? 'empty' : String(v))).join(' ')}`,
  );
  return `Edit distance table from ${state.a} to ${state.b}. ${rows.join('; ')}.`;
}
