import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { callShapeId, frameShapeId, returnShapeId } from '../../layouts/calls';
import { L, mark, plural } from '../_recursion/kit';

/**
 * rest: reverse(s) = reverse(s[1..]) + s[0], building a new string on the way back.
 * swap: reverse(A, i, j) swaps the two ends of an array of characters, then the ends inside.
 */
export type Variant = 'rest' | 'swap';

export interface RevSettings {
  [key: string]: Scalar;
  variant: Variant;
}

export const MAX_LENGTH = 8;

export const defaults: RevSettings = { variant: 'rest' };

/** A character keeps its uid wherever a swap moves it, so the drawing can follow it. */
export interface Cell {
  uid: number;
  ch: string;
}

/**
 * One call. In the rest version it works on s = text[i..], and returns that part reversed.
 * In the swap version it works on A[i..j] and returns nothing.
 */
export interface RevCall {
  id: number;
  parent: number | null;
  i: number;
  j: number;
  /** What it will return (rest version), worked out in advance to size the drawing. */
  returns: string | null;
}

export type Phase = 'start' | 'check' | 'swap' | 'wait' | 'got' | 'return' | 'done';

export interface RevRun {
  text: string;
  /** Frame slots the drawing keeps for this run, main included. */
  room: number;
  outcome: 'running' | 'done';
  value: string | null;
}

export interface RevState {
  /** The characters, in array order now. */
  cells: Cell[];
  nextUid: number;
  /** Every call of the current or last run, in call order. */
  calls: RevCall[];
  made: number;
  /** Calls on the stack above main, oldest first. */
  stack: number[];
  phase: Record<number, Phase>;
  got: Record<number, string>;
  result: Record<number, string>;
  /** Calls that have made their swap (swap version). */
  swapped: number[];
  run: RevRun | null;
}

type S = RevState;
type Op = OpSpec<S, RevSettings, undefined>;
type RevStep = Step<S, undefined>;

export function init(): S {
  return {
    cells: [],
    nextUid: 1,
    calls: [],
    made: 0,
    stack: [],
    phase: {},
    got: {},
    result: {},
    swapped: [],
    run: null,
  };
}

/** A string of 1 to 8 letters or digits, or null. */
export function cleanText(v: Value | undefined): string | null {
  if (v === undefined) return null;
  const t = String(v).trim();
  return /^[A-Za-z0-9]{1,8}$/.test(t) ? t : null;
}

export const quote = (s: string) => `"${s}"`;

/** reverse("bc") or reverse(A, 1, 3). */
export function callText(c: Pick<RevCall, 'i' | 'j'>, text: string, v: Variant): string {
  return v === 'rest' ? `reverse(${quote(text.slice(c.i))})` : `reverse(A, ${c.i}, ${c.j})`;
}

/** The calls a run will make, worked out before it starts so the drawing keeps its place. */
export function planCalls(text: string, v: Variant): RevCall[] {
  const n = text.length;
  const calls: RevCall[] = [];
  if (v === 'rest') {
    for (let i = 0; i < Math.max(1, n); i++) {
      calls.push({ id: i + 1, parent: i > 0 ? i : null, i, j: n - 1, returns: null });
      if (n - i <= 1) break;
    }
    return calls.map((c) => ({ ...c, returns: [...text.slice(c.i)].reverse().join('') }));
  }
  for (let i = 0, j = n - 1; ; i++, j--) {
    calls.push({ id: calls.length + 1, parent: calls.length || null, i, j, returns: null });
    if (i >= j) break;
  }
  return calls;
}

function loadCells(s: S, text: string): Pick<S, 'cells' | 'nextUid'> {
  let uid = s.nextUid;
  return { cells: [...text].map((ch) => ({ uid: uid++, ch })), nextUid: uid };
}

const word = (cells: Cell[]) => cells.map((c) => c.ch).join('');

const reject = (s: S, what: string): RevStep => ({
  state: s,
  marks: [],
  say: `${what} needs 1 to ${MAX_LENGTH} letters or digits. Nothing changed.`,
  lines: [],
  vars: { calls: 0, depth: 0 },
  level: 1,
});

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [raw]) {
    const text = cleanText(raw);
    if (text === null) {
      yield reject(s, 'Load');
      return s;
    }
    const next: S = { ...init(), ...loadCells(s, text) };
    yield {
      state: next,
      marks: next.cells.map((c) => mark(`cell-${next.cells.indexOf(c)}`, 'new')),
      say: `The characters of ${quote(text)} go into an array, A[0] to A[${text.length - 1}]. Nothing is reversed yet.`,
      lines: [],
      vars: { n: text.length, calls: 0, depth: 0 },
      level: 1,
    } satisfies RevStep;
    return next;
  },
};

const reverse: Op = {
  label: 'Reverse',
  arity: 1,
  *run(s, [raw], { settings }) {
    const text = cleanText(raw);
    if (text === null) {
      yield reject(s, 'reverse');
      return s;
    }
    return yield* runReverse(s, text, settings.variant);
  },
};

function* runReverse(s0: S, text: string, v: Variant): Generator<RevStep, S, void> {
  const n = text.length;
  const calls = planCalls(text, v);
  const run: RevRun = { text, room: calls.length + 1, outcome: 'running', value: null };
  const loaded = loadCells(s0, text);
  let cells = loaded.cells;
  let made = 0;
  const stack: number[] = [];
  const phase: Record<number, Phase> = {};
  const got: Record<number, string> = {};
  const result: Record<number, string> = {};
  const swapped: number[] = [];
  const snap = (): S => ({
    cells: cells.map((c) => ({ ...c })),
    nextUid: loaded.nextUid,
    calls,
    made,
    stack: [...stack],
    phase: { ...phase },
    got: { ...got },
    result: { ...result },
    swapped: [...swapped],
    run: { ...run },
  });
  const say = (c: RevCall) => callText(c, text, v);
  const vars = (c: RevCall | undefined, more: Record<string, Scalar> = {}) => ({
    ...(c ? (v === 'rest' ? { s: text.slice(c.i) } : { i: c.i, j: c.j }) : {}),
    depth: stack.length,
    calls: made,
    ...more,
  });
  const step = (
    words: string,
    lines: string[],
    level: 1 | 2 | 3,
    c: RevCall | undefined,
    ms: [string, MarkRole][] = [],
    more: Record<string, Scalar> = {},
  ): RevStep => ({
    state: snap(),
    marks: ms.map(([id, role]) => mark(id, role)),
    say: words,
    lines,
    vars: vars(c, more),
    level,
  });
  const frame = (c: RevCall) => frameShapeId(String(c.id));
  const node = (c: RevCall) => callShapeId(String(c.id));

  for (let k = 0; k < calls.length; k++) {
    const c = calls[k]!;
    const p = c.parent === null ? undefined : calls[c.parent - 1]!;
    made = c.id;
    phase[c.id] = 'start';
    if (p) phase[p.id] = 'wait';
    stack.push(c.id);
    let words: string;
    if (!p) {
      words =
        v === 'rest'
          ? `main calls ${say(c)}. A frame for it goes on the stack, with s = ${quote(text)}.`
          : `The characters of ${quote(text)} are in an array A. main calls ${say(c)} to reverse all of it, from index 0 to ${n - 1}.`;
    } else if (v === 'rest') {
      words = `${say(p)} needs the reverse of the rest of its string, ${quote(text.slice(c.i))}, before it can put ${quote(text[p.i]!)} at the end. It waits, and ${say(c)} gets a new frame on top.`;
    } else {
      words = `${say(p)} calls ${say(c)} for the part inside the ends it swapped. That is a tail call, but Python and Java still keep this frame waiting.`;
    }
    yield step(words, [p ? 'rec' : 'sig'], 2, c, [
      [frame(c), 'active'],
      [node(c), 'active'],
    ]);

    const base = v === 'rest' ? n - c.i <= 1 : c.i >= c.j;
    if (!base) {
      phase[c.id] = 'check';
      yield step(
        v === 'rest'
          ? `Is length(s) <= 1? No: ${quote(text.slice(c.i))} has ${n - c.i} characters.`
          : `Is i >= j? No: ${c.i} < ${c.j}, so there are two ends to swap.`,
        ['base'],
        3,
        c,
        v === 'rest'
          ? [[frame(c), 'active']]
          : [
              [`cell-${c.i}`, 'compare'],
              [`cell-${c.j}`, 'compare'],
            ],
      );
      if (v === 'swap') {
        const a = cells[c.i]!;
        const b = cells[c.j]!;
        cells = cells.map((x, idx) => (idx === c.i ? b : idx === c.j ? a : x));
        phase[c.id] = 'swap';
        swapped.push(c.id);
        yield step(
          `Swap A[${c.i}] and A[${c.j}]: ${quote(a.ch)} and ${quote(b.ch)} trade places. Both ends are now where they belong.`,
          ['swap'],
          2,
          c,
          [
            [`cell-${c.i}`, 'active'],
            [`cell-${c.j}`, 'active'],
            [frame(c), 'active'],
          ],
        );
      }
      continue;
    }

    // The base case.
    phase[c.id] = 'return';
    if (v === 'rest') {
      const value = text.slice(c.i);
      result[c.id] = value;
      yield step(
        `Is length(s) <= 1? Yes: ${quote(value)} is its own reverse, so ${say(c)} returns it without another call.`,
        ['base', 'ret'],
        1,
        c,
        [
          [frame(c), 'done'],
          [returnShapeId(String(c.id)), 'found'],
        ],
        { returned: value },
      );
    } else {
      yield step(
        c.i === c.j
          ? `Is i >= j? Yes: ${c.i} = ${c.j}. One character is left in the middle, and it stays put. ${say(c)} returns.`
          : `Is i >= j? Yes: ${c.i} > ${c.j}, so nothing is left between the swapped ends. ${say(c)} returns.`,
        ['base', 'ret'],
        1,
        c,
        [[frame(c), 'done']],
      );
    }
  }

  // Back up the stack.
  for (let k = calls.length - 1; k >= 1; k--) {
    const c = calls[k]!;
    const p = calls[k - 1]!;
    stack.pop();
    phase[c.id] = 'done';
    if (v === 'rest') {
      const rest = result[c.id]!;
      phase[p.id] = 'got';
      got[p.id] = rest;
      yield step(
        `${say(c)} is done, so its frame is popped. ${quote(rest)} goes back to ${say(p)}, which was waiting for it.`,
        ['rec'],
        2,
        p,
        [
          [frame(p), 'active'],
          [returnShapeId(String(c.id)), 'found'],
        ],
        { returned: rest },
      );
      const mine = rest + text[p.i]!;
      phase[p.id] = 'return';
      result[p.id] = mine;
      yield step(
        `${say(p)} puts its first character at the end: ${quote(rest)} + ${quote(text[p.i]!)} = ${quote(mine)}. It returns ${quote(mine)}.`,
        ['rec'],
        2,
        p,
        [
          [frame(p), 'done'],
          [`cell-${p.i}`, 'active'],
          [returnShapeId(String(p.id)), 'found'],
        ],
        { returned: mine },
      );
    } else {
      phase[p.id] = 'return';
      yield step(
        `${say(c)} is done, and its frame is popped. ${say(p)} has nothing left to do after its call, so it returns too.`,
        ['rec'],
        2,
        p,
        [[frame(p), 'done']],
      );
    }
  }

  const first = calls[0]!;
  stack.pop();
  phase[first.id] = 'done';
  run.outcome = 'done';
  run.value = v === 'rest' ? result[first.id]! : word(cells);
  const frames = plural(calls.length, 'frame');
  yield step(
    v === 'rest'
      ? `${say(first)} returns ${quote(run.value)} to main. The stack went ${frames} deep, one for each character.`
      : `${say(first)} returns to main, and A now reads ${quote(run.value)}. ${plural(swapped.length, 'swap')} reversed it in place, and the stack went ${frames} deep.`,
    [],
    1,
    undefined,
    v === 'rest' ? [[returnShapeId(String(first.id)), 'found']] : [],
    { result: run.value },
  );
  return snap();
}

export const ops = { reverse, load };

export function pseudocode(s: RevSettings): PseudoBlock[] {
  const blocks: PseudoBlock[] =
    s.variant === 'rest'
      ? [
          {
            op: 'reverse',
            lines: [
              L('sig', 0, 'reverse(s)', 'To reverse a string s:'),
              L('base', 1, 'if length(s) <= 1', 'If it has at most one character,'),
              L('ret', 2, 'return s', 'it is its own reverse.'),
              L(
                'rec',
                1,
                'return reverse(s[1..]) + s[0]',
                'Otherwise reverse everything after the first character, then put the first character at the end.',
              ),
            ],
          },
        ]
      : [
          {
            op: 'reverse',
            lines: [
              L('sig', 0, 'reverse(A, i, j)', 'To reverse A from index i to index j:'),
              L('base', 1, 'if i >= j', 'If there is at most one character between them,'),
              L('ret', 2, 'return', 'there is nothing to do.'),
              L('swap', 1, 'swap A[i] and A[j]', 'Swap the two ends.'),
              L('rec', 1, 'reverse(A, i + 1, j - 1)', 'Then reverse the part inside them.'),
            ],
          },
        ];
  blocks.push({
    op: 'load',
    lines: [L('load', 0, 'A = the characters of s', 'Put the characters of s in an array.')],
  });
  return blocks;
}

export function initialSay(_state: S, s: RevSettings): string {
  return s.variant === 'rest'
    ? 'Type a word and press Reverse. Each call reverses the rest of the string, then puts its first character at the end.'
    : 'Type a word and press Reverse. Each call swaps the two ends of the array, then reverses the part inside them.';
}

export function initialVars(): Record<string, Scalar> {
  return { depth: 0, calls: 0 };
}

export function describe(state: S, s: RevSettings): string {
  const run = state.run;
  if (!run) {
    return state.cells.length
      ? `The array holds ${quote(word(state.cells))}. No call has been made yet.`
      : 'Nothing loaded yet. The call stack holds only main.';
  }
  if (run.outcome === 'running') {
    const frames = state.stack.map((id) => callText(state.calls[id - 1]!, run.text, s.variant));
    return `A holds ${quote(word(state.cells))}. Call stack, bottom to top: main, ${frames.join(', ')}.`;
  }
  return `${callText(state.calls[0]!, run.text, s.variant)} gave ${quote(run.value!)} after ${plural(state.made, 'call')}. The stack holds only main.`;
}
