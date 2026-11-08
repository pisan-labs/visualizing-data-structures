import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step } from '../../engine/types';
import type { Cell } from '../../layouts/table';
import { cellId, mark, wordFromArg } from '../_dp/kit';

export const MAX_LEN = 10;

export interface PalState {
  s: string;
  /**
   * L[i][j] (0-based, i <= j): the length of the longest palindromic subsequence of s[i..j].
   * null where not filled yet, and always below the diagonal.
   */
  L: (number | null)[][];
}

export interface PalSettings {
  [key: string]: Scalar;
  tie: 'down' | 'left';
}

export interface PalExtra {
  reads?: { from: Cell; to: Cell; win: boolean; label?: string }[];
  path?: Cell[];
  /** The walk back: the palindrome's length and the characters found, by position in it. */
  length?: number;
  found?: { k: number; ch: string; i: number }[];
}

type S = PalState;
type X = PalExtra;
type Op = OpSpec<S, PalSettings, X>;
type PalStep = Step<S, X>;
type Gen = Generator<PalStep, S, void>;

export const defaults: PalSettings = { tie: 'down' };
export const START = 'BBABCBCAB';

export const emptyTable = (n: number): (number | null)[][] =>
  Array.from({ length: n }, () => Array<number | null>(n).fill(null));

export function init(): S {
  return { s: START, L: emptyTable(START.length) };
}

/** Shape ids of a character in the row and column headers. */
export const rowCh = (i: number) => `rh-1-${i}`;
export const colCh = (j: number) => `ch-1-${j}`;

const q = (t: string) => `'${t}'`;
export const isFull = (st: S) => st.L.every((r, i) => r.every((v, j) => j < i || v !== null));

/** How many diagonals (interval lengths) are filled. */
export function filledLengths(st: S): number {
  const n = st.s.length;
  let len = 0;
  while (len < n && st.L[0]![len] !== null) len++;
  return len;
}

function* fillLengths(st: S, upto: number, settings: PalSettings): Gen {
  const { s } = st;
  const n = s.length;
  const L = st.L.map((r) => [...r]);
  const state = (): S => ({ s, L: L.map((r) => [...r]) });
  for (let len = filledLengths(st) + 1; len <= upto; len++) {
    if (len === 1) {
      for (let i = 0; i < n; i++) L[i]![i] = 1;
      yield {
        state: state(),
        marks: Array.from({ length: n }, (_, i) => mark(cellId(i, i), 'new')),
        say: 'Length 1: every single character is a palindrome, so the diagonal is all 1s.',
        lines: ['p.base'],
        vars: { n, len: 1 },
        level: upto === 1 ? 1 : 2,
      };
      continue;
    }
    for (let i = 0; i + len - 1 < n; i++) {
      const j = i + len - 1;
      const a = s[i]!;
      const b = s[j]!;
      let say: string;
      let reads: X['reads'];
      let lines: string[];
      let marks = [
        mark(cellId(i, j), 'active'),
        mark(rowCh(i), 'compare'),
        mark(colCh(j), 'compare'),
      ];
      if (a === b) {
        const inner = len === 2 ? 0 : L[i + 1]![j - 1]!;
        L[i]![j] = inner + 2;
        say =
          len === 2
            ? `s[${i + 1}] = s[${j + 1}] = ${q(a)}: two equal characters make a palindrome of length 2.`
            : `s[${i + 1}] = s[${j + 1}] = ${q(a)}: wrap them around the best inside, L[${i + 2}][${j}] + 2 = ${inner} + 2 = ${inner + 2}.`;
        reads = len === 2 ? [] : [{ from: [i + 1, j - 1], to: [i, j], win: true }];
        lines = ['p.loop', 'p.match'];
        marks = [mark(cellId(i, j), 'active'), mark(rowCh(i), 'found'), mark(colCh(j), 'found')];
        if (len > 2) marks.push(mark(cellId(i + 1, j - 1), 'compare'));
      } else {
        const down = L[i + 1]![j]!;
        const left = L[i]![j - 1]!;
        const dir = down === left ? settings.tie : down > left ? 'down' : 'left';
        L[i]![j] = Math.max(down, left);
        const which =
          down === left
            ? `a tie, so take the cell ${dir === 'down' ? 'below' : 'to the left'}`
            : dir === 'down'
              ? `from below: drop ${q(a)}`
              : `from the left: drop ${q(b)}`;
        say = `${q(a)} ≠ ${q(b)}: one of them is not in it. L[${i + 1}][${j + 1}] = max(L[${i + 2}][${j + 1}], L[${i + 1}][${j}]) = max(${down}, ${left}) = ${L[i]![j]}, ${which}.`;
        reads = [
          { from: [i + 1, j], to: [i, j], win: dir === 'down' },
          { from: [i, j - 1], to: [i, j], win: dir === 'left' },
        ];
        lines = ['p.loop', 'p.match', 'p.max'];
        marks.push(mark(cellId(i + 1, j), 'compare'), mark(cellId(i, j - 1), 'compare'));
      }
      const last = i + len === n;
      if (last) say += ` Length ${len} is done.`;
      yield {
        state: state(),
        marks,
        say,
        lines,
        vars: { n, len, i: i + 1, j: j + 1, 'L[i][j]': L[i]![j]! },
        level: last ? 1 : 2,
        extra: { reads },
      };
    }
  }
  return state();
}

const fill: Op = {
  label: 'Fill the table',
  arity: 0,
  *run(st, _args, { settings }): Gen {
    const n = st.s.length;
    if (isFull(st)) {
      yield {
        state: st,
        marks: [mark(cellId(0, n - 1), 'found')],
        say: `The table is already full: L[1][${n}] = ${st.L[0]![n - 1]}. Press Trace back, or type a new string.`,
        lines: [],
        level: 1,
      };
      return st;
    }
    const end = yield* fillLengths(st, n, settings);
    const len = end.L[0]![n - 1]!;
    const rev = [...st.s].reverse().join('');
    yield {
      state: end,
      marks: [mark(cellId(0, n - 1), 'found')],
      say: `L[1][${n}] = ${len}: the longest palindromic subsequence of ${q(st.s)} has length ${len}. It is also the length of the LCS of ${q(st.s)} and its reverse, ${q(rev)}.${n > 1 ? ' Press Trace back to find one.' : ''}`,
      lines: ['p.ret'],
      vars: { n, length: len },
      level: 1,
    };
    return end;
  },
};

const diagonal: Op = {
  label: 'Fill one length',
  arity: 0,
  *run(st, _args, { settings }): Gen {
    const done = filledLengths(st);
    if (done === st.s.length) {
      yield {
        state: st,
        marks: [],
        say: 'Every length is filled already. Press Trace back, or type a new string.',
        lines: [],
        level: 1,
      };
      return st;
    }
    return yield* fillLengths(st, done + 1, settings);
  },
};

const trace: Op = {
  label: 'Trace back',
  arity: 0,
  *run(st, _args, { settings }): Gen {
    const { s, L } = st;
    const n = s.length;
    if (!isFull(st)) {
      yield {
        state: st,
        marks: [mark(cellId(0, n - 1), 'error')],
        say: `Fill the table first. The walk starts at L[1][${n}], the top-right corner.`,
        lines: [],
        level: 1,
      };
      return st;
    }
    const length = L[0]![n - 1]!;
    const found: NonNullable<X['found']> = [];
    let i = 0;
    let j = n - 1;
    let lo = 0;
    let hi = length - 1;
    const path: Cell[] = [[i, j]];
    const extra = (): X => ({ path: [...path], length, found: [...found] });
    yield {
      state: st,
      marks: [mark(cellId(i, j), 'active')],
      say: `Start at the top-right, L[1][${n}] = ${length}, with a pointer at each end of the string.`,
      lines: ['t.sig'],
      vars: { i: 1, j: n, length },
      level: 2,
      extra: extra(),
    };
    while (i <= j) {
      let say: string;
      let lines: string[];
      const marks = [];
      if (i === j) {
        found.push({ k: lo, ch: s[i]!, i });
        say = `One character left, ${q(s[i]!)}: it sits in the middle of the palindrome.`;
        lines = ['t.loop', 't.mid'];
        marks.push(mark(rowCh(i), 'found'), mark(cellId(i, j), 'found'));
        i++;
      } else if (s[i] === s[j]) {
        found.push({ k: lo, ch: s[i]!, i }, { k: hi, ch: s[j]!, i: j });
        lo++;
        hi--;
        say = `s[${i + 1}] = s[${j + 1}] = ${q(s[i]!)}: they are the two ends. Take both and move both pointers in.`;
        lines = ['t.loop', 't.match'];
        marks.push(mark(rowCh(i), 'found'), mark(colCh(j), 'found'), mark(cellId(i, j), 'found'));
        i++;
        j--;
      } else {
        const down = L[i + 1]![j]!;
        const left = L[i]![j - 1]!;
        const dir = down === left ? settings.tie : down > left ? 'down' : 'left';
        marks.push(mark(cellId(i, j), 'visit'));
        if (dir === 'down') {
          say = `${q(s[i]!)} ≠ ${q(s[j]!)}, and the cell below holds ${down}${down === left ? ', a tie' : ''}: drop s[${i + 1}] and move down.`;
          i++;
        } else {
          say = `${q(s[i]!)} ≠ ${q(s[j]!)}, and the cell to the left holds ${left}${down === left ? ', a tie' : ''}: drop s[${j + 1}] and move left.`;
          j--;
        }
        lines = dir === 'down' ? ['t.loop', 't.down'] : ['t.loop', 't.left'];
      }
      if (i <= j) {
        path.push([i, j]);
        marks.push(mark(cellId(i, j), 'active'));
      }
      yield {
        state: st,
        marks,
        say,
        lines,
        vars: { i: i + 1, j: j + 1, length, found: found.length },
        level: 2,
        extra: extra(),
      };
    }
    const pal = [...found]
      .sort((x, y) => x.k - y.k)
      .map((f) => f.ch)
      .join('');
    yield {
      state: st,
      marks: [mark(cellId(0, n - 1), 'found')],
      say: `The longest palindromic subsequence is ${q(pal)}, ${length} characters. It reads the same both ways.`,
      lines: ['t.ret'],
      vars: { length, palindrome: pal },
      level: 1,
      extra: extra(),
    };
    return st;
  },
};

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(st, [arg]): Gen {
    const w = wordFromArg(arg, MAX_LEN, 'the string');
    if ('error' in w) {
      yield {
        state: st,
        marks: [],
        say: `The string stays ${q(st.s)}. ${w.error}`,
        lines: [],
        level: 1,
      };
      return st;
    }
    const next: S = { s: w.word, L: emptyTable(w.word.length) };
    yield {
      state: next,
      marks: [],
      say: `${q(w.word)}: row i and column j stand for the piece from character i to character j. Press Fill the table.`,
      lines: [],
      vars: { n: w.word.length },
      level: 1,
    };
    return next;
  },
};

export const ops = { load, fill, diagonal, trace };

const Ln = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: PalSettings): PseudoBlock[] {
  const down = settings.tie === 'down';
  return [
    {
      op: 'fill',
      lines: [
        Ln('p.sig', 0, 'lps(s[1..n])', 'To fill the table for a string of length n:'),
        Ln('p.base', 1, 'L[i][i] = 1 for every i', 'every single character is a palindrome.'),
        Ln(
          'p.loop',
          1,
          'for len = 2 to n, for i = 1 to n - len + 1: j = i + len - 1',
          'For each length, shortest first, and each piece s[i..j] of that length:',
        ),
        Ln(
          'p.match',
          2,
          'if s[i] == s[j]: L[i][j] = L[i + 1][j - 1] + 2',
          'if its ends match, they wrap the best palindrome inside (0 if nothing is inside);',
        ),
        Ln(
          'p.max',
          2,
          'else L[i][j] = max(L[i + 1][j], L[i][j - 1])',
          'otherwise drop one end, whichever leaves the longer palindrome.',
        ),
        Ln('p.ret', 1, 'return L[1][n]', 'The top-right cell covers the whole string.'),
      ],
    },
    {
      op: 'trace',
      lines: [
        Ln('t.sig', 0, 'i = 1; j = n', 'Start with a pointer at each end:'),
        Ln('t.loop', 1, 'while i <= j', 'while they have not crossed,'),
        Ln('t.mid', 2, 'if i == j: s[i] is the middle', 'one character left goes in the middle;'),
        Ln(
          't.match',
          2,
          'else if s[i] == s[j]: take both ends; i++; j--',
          'if the ends match, they are the two ends of the palindrome;',
        ),
        Ln(
          't.down',
          2,
          down
            ? 'else if L[i + 1][j] >= L[i][j - 1]: i++'
            : 'else if L[i + 1][j] > L[i][j - 1]: i++',
          down
            ? 'otherwise drop the left end if that loses nothing (ties too),'
            : 'otherwise drop the left end if that is strictly better,',
        ),
        Ln('t.left', 2, 'else: j--', 'and else drop the right end.'),
        Ln('t.ret', 1, 'return the characters taken', 'They read the same both ways.'),
      ],
    },
  ];
}

export function initialSay(st: S): string {
  return `The string ${q(st.s)}. What is the longest subsequence that reads the same forwards and backwards? Press Fill the table, or type a new string.`;
}

export const initialVars = (st: S) => ({ n: st.s.length });

export function describe(st: S): string {
  const rows = st.L.map(
    (r, i) =>
      `row ${i + 1} (${st.s[i]}): ${r
        .slice(i)
        .map((v) => (v === null ? 'empty' : String(v)))
        .join(' ')}`,
  );
  return `Palindrome table for ${q(st.s)}, upper triangle by rows. ${rows.join('; ')}.`;
}
