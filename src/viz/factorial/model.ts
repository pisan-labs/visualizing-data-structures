import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { callShapeId, frameShapeId, returnShapeId } from '../../layouts/calls';
import { L, mark, plural, wholeArg } from '../_recursion/kit';

/**
 * plain: n * factorial(n - 1). tail: factorial(n - 1, n * acc), one frame per call, as in
 * Python and Java. tco: the same tail call with its frame reused, as Scheme does.
 */
export type Style = 'plain' | 'tail' | 'tco';
/** zero: n == 0 (CLRS). one: n <= 1. none: the base case is missing (a bug). */
export type Base = 'zero' | 'one' | 'none';

export interface FactSettings {
  [key: string]: Scalar;
  style: Style;
  base: Base;
  /** How many factorial frames fit on the stack. */
  limit: number;
}

export const MIN_N = -9;
export const MAX_N = 9;
/** With the frame reused nothing overflows, so a run with no end is stopped after this many calls. */
export const LOOP_CAP = 12;

export const defaults: FactSettings = { style: 'plain', base: 'zero', limit: 10 };

/** One call. Its id is its place in call order, from 1, and also its frame's id. */
export interface FactCall {
  id: number;
  n: number;
  /** The accumulator, in the tail styles. */
  acc: number | null;
  parent: number | null;
  /** This call found no room on the stack. */
  overflow: boolean;
  /** What it will return (worked out in advance so the drawing can size its box), or null. */
  returns: number | null;
}

/** What a call is doing: shown in its frame and in the tree. */
export type Phase = 'start' | 'check' | 'wait' | 'got' | 'return' | 'done' | 'failed';

/** A frame on the stack and the call it holds (with tail calls optimized, one frame is reused). */
export interface Frame {
  frame: number;
  call: number;
}

export interface FactRun {
  n: number;
  /** Frame slots the drawing keeps for this run, main included, so it does not move. */
  room: number;
  outcome: 'running' | 'done' | 'overflow' | 'loop';
  value: number | null;
  /** The call whose value main got: the first call, or with the frame reused, the last. */
  from: number | null;
}

export interface FactState {
  /** Every call of the current or last run, in call order, made or not yet. */
  calls: FactCall[];
  /** How many of `calls` have started. */
  made: number;
  /** Frames on the stack above main, oldest first. */
  stack: Frame[];
  phase: Record<number, Phase>;
  /** The value each call got back from the call it made. */
  got: Record<number, number>;
  /** The value each call returned. */
  result: Record<number, number>;
  run: FactRun | null;
}

type S = FactState;
type Op = OpSpec<S, FactSettings, undefined>;
type FactStep = Step<S, undefined>;

export function init(): S {
  return { calls: [], made: 0, stack: [], phase: {}, got: {}, result: {}, run: null };
}

export const tailStyle = (s: FactSettings) => s.style !== 'plain';

export function isBase(n: number, base: Base): boolean {
  return base === 'zero' ? n === 0 : base === 'one' ? n <= 1 : false;
}

export const baseTest = (base: Base) => (base === 'one' ? 'n <= 1' : 'n == 0');

/** factorial(4) or factorial(4, 6). */
export function callText(c: Pick<FactCall, 'n' | 'acc'>): string {
  return c.acc === null ? `factorial(${c.n})` : `factorial(${c.n}, ${c.acc})`;
}

/**
 * The calls a run will make, worked out before it starts so the drawing can keep its place.
 * A run ends at the base case, when a call does not fit (overflow), or, with the frame reused,
 * after LOOP_CAP calls that would never end (loop).
 */
export function planCalls(
  n: number,
  s: FactSettings,
): { calls: FactCall[]; outcome: 'done' | 'overflow' | 'loop' } {
  const calls: FactCall[] = [];
  let k = n;
  let acc: number | null = tailStyle(s) ? 1 : null;
  for (;;) {
    const id = calls.length + 1;
    const parent = id > 1 ? id - 1 : null;
    if (s.style === 'tco' && calls.length >= LOOP_CAP) return { calls, outcome: 'loop' };
    if (s.style !== 'tco' && calls.length >= s.limit) {
      calls.push({ id, n: k, acc, parent, overflow: true, returns: null });
      return { calls, outcome: 'overflow' };
    }
    calls.push({ id, n: k, acc, parent, overflow: false, returns: null });
    if (isBase(k, s.base)) break;
    if (acc !== null) acc = k * acc;
    k -= 1;
  }
  // Work the return values out from the base case back up.
  let value = acc ?? 1;
  for (let i = calls.length - 1; i >= 0; i--) {
    const c = calls[i]!;
    if (acc === null && i < calls.length - 1) value = c.n * value;
    calls[i] = { ...c, returns: value };
  }
  return { calls, outcome: 'done' };
}

/** Slots the stack drawing needs for a run: main, the frames, and a call that did not fit. */
export function roomFor(calls: FactCall[], s: FactSettings): number {
  const frames = s.style === 'tco' ? 1 : calls.length;
  return frames + 1;
}

const why = (n0: number, s: FactSettings): string => {
  if (s.base === 'none') return 'There is no base case, so nothing ever stops the calls.';
  if (s.base === 'zero' && n0 < 0)
    return `n started below 0, so counting down never reaches the base case n == 0.`;
  return `The base case is still ${plural(n0 - (s.base === 'one' ? 1 : 0) - s.limit + 1, 'call')} away: the recursion is too deep for this stack.`;
};

const factorial: Op = {
  label: 'Call factorial',
  arity: 1,
  *run(s, [raw], { settings }) {
    const n = wholeArg(raw, MIN_N, MAX_N);
    if (n === null) {
      yield {
        state: s,
        marks: [],
        say: `factorial needs a whole number n from ${MIN_N} to ${MAX_N}. Nothing was called.`,
        lines: [],
        vars: { calls: 0, depth: 0 },
        level: 1,
      } satisfies FactStep;
      return s;
    }
    return yield* runFactorial(n, settings);
  },
};

function* runFactorial(n0: number, st: FactSettings): Generator<FactStep, S, void> {
  const { calls, outcome } = planCalls(n0, st);
  const tail = tailStyle(st);
  const tco = st.style === 'tco';
  const run: FactRun = {
    n: n0,
    room: roomFor(calls, st),
    outcome: 'running',
    value: null,
    from: null,
  };
  let made = 0;
  const stack: Frame[] = [];
  const phase: Record<number, Phase> = {};
  const got: Record<number, number> = {};
  const result: Record<number, number> = {};
  const snap = (): S => ({
    calls,
    made,
    stack: stack.map((f) => ({ ...f })),
    phase: { ...phase },
    got: { ...got },
    result: { ...result },
    run: { ...run },
  });
  const byId = (id: number) => calls[id - 1]!;
  const top = () => stack[stack.length - 1];
  const vars = (c: FactCall | undefined, more: Record<string, Scalar> = {}) => ({
    ...(c ? { n: c.n, ...(tail ? { acc: c.acc } : {}) } : {}),
    depth: stack.length,
    calls: made,
    ...more,
  });
  const marks = (...ms: [string, MarkRole][]) => ms.map(([id, role]) => mark(id, role));
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    c: FactCall | undefined,
    ms: [string, MarkRole][] = [],
    more: Record<string, Scalar> = {},
  ): FactStep => ({ state: snap(), marks: marks(...ms), say, lines, vars: vars(c, more), level });

  for (let i = 0; i < calls.length; i++) {
    const c = calls[i]!;
    const p = c.parent === null ? undefined : byId(c.parent);

    if (c.overflow) {
      made = c.id;
      phase[c.id] = 'failed';
      if (p) phase[p.id] = 'wait';
      stack.push({ frame: c.id, call: c.id });
      yield step(
        `${callText(p!)} calls ${callText(c)}, but the stack is full: it has room for ${st.limit} frames. Stack overflow! ${why(n0, st)}`,
        ['rec'],
        1,
        c,
        [
          [frameShapeId(String(c.id)), 'error'],
          [callShapeId(String(c.id)), 'error'],
        ],
      );
      // The error unwinds every frame without a return value.
      stack.length = 0;
      for (const x of calls) phase[x.id] = x.overflow ? 'failed' : 'done';
      run.outcome = 'overflow';
      yield step(
        `The error unwinds the stack: all ${st.limit} waiting frames are popped without returning anything. Python raises RecursionError, Java throws StackOverflowError, and in C++ the program usually just crashes.`,
        [],
        1,
        undefined,
        [[frameShapeId('main'), 'error']],
      );
      return snap();
    }

    // The call starts: a new frame, or with tail calls optimized, the same frame reused.
    made = c.id;
    phase[c.id] = 'start';
    if (p) phase[p.id] = tco ? 'done' : 'wait';
    if (tco && p) stack[stack.length - 1] = { frame: top()!.frame, call: c.id };
    else stack.push({ frame: c.id, call: c.id });
    const frame = frameShapeId(String(top()!.frame));
    const node = callShapeId(String(c.id));
    let say: string;
    if (!p) {
      say = `main calls ${callText({ n: c.n, acc: null })}. A frame for it goes on the stack, with n = ${c.n}${tail ? ' and acc = 1' : ''}.`;
    } else if (tco) {
      say = `${callText(p)} ends with a tail call, so its frame is reused for ${callText(c)}: n becomes ${c.n} and acc becomes ${c.acc}. The stack stays one frame deep.`;
    } else if (tail) {
      say = `${callText(p)} calls ${callText(c)} as the very last thing it does: a tail call. Python and Java still give it a new frame and keep this one waiting.`;
    } else {
      say = `${callText(p)} cannot multiply until it knows ${callText(c)}. It waits on line 4, and ${callText(c)} gets a new frame on top, with its own n = ${c.n}.`;
    }
    if (st.base === 'none' && !p) say += ' There is no base case to check.';
    yield step(say, [p ? 'rec' : 'sig'], 2, c, [
      [frame, 'active'],
      [node, 'active'],
    ]);

    if (i === calls.length - 1 && outcome === 'loop') break;

    if (st.base !== 'none') {
      const test = baseTest(st.base);
      if (!isBase(c.n, st.base)) {
        phase[c.id] = 'check';
        yield step(
          `Is ${test}? No: n is ${c.n}, so ${callText(c)} is not the base case.`,
          ['base'],
          3,
          c,
          [[frame, 'active']],
        );
      } else {
        const value = tail ? c.acc! : 1;
        phase[c.id] = 'return';
        result[c.id] = value;
        let base: string;
        if (tail) {
          base = `Is ${test}? Yes: the base case. ${callText(c)} returns acc = ${value}: the multiplying is already done.`;
        } else if (c.n < 0) {
          base = `Is ${test}? Yes, n is ${c.n}, so it returns 1. The calls stop, but (${c.n})! is not defined: the base case hides the bad input.`;
        } else {
          base = `Is ${test}? Yes, n is ${c.n}: the base case. ${callText(c)} returns 1 without calling anything.`;
        }
        yield step(
          base,
          ['base', 'one'],
          1,
          c,
          [
            [frame, 'done'],
            [returnShapeId(String(c.id)), 'found'],
          ],
          { returned: value },
        );
      }
    }
  }

  if (outcome === 'loop') {
    const c = calls[calls.length - 1]!;
    run.outcome = 'loop';
    stack.length = 0;
    for (const x of calls) phase[x.id] = 'done';
    yield step(
      `${callText(c)} would reuse the frame again. With tail calls optimized the stack never fills up, so nothing stops this: it is an infinite loop. It was stopped after ${LOOP_CAP} calls.`,
      [],
      1,
      undefined,
      [[frameShapeId('main'), 'error']],
    );
    return snap();
  }

  // The base case returned. Now each frame gets its callee's value and returns its own.
  const last = calls[calls.length - 1]!;
  let value = result[last.id]!;
  if (tco) {
    stack.length = 0;
    for (const x of calls) {
      phase[x.id] = 'done';
      result[x.id] = value;
    }
    run.outcome = 'done';
    run.value = value;
    run.from = last.id;
    yield step(
      `${callText(last)} returns ${value} straight to main: with the frame reused, no other frame was waiting. ${n0}! = ${value}.`,
      [],
      1,
      undefined,
      [[returnShapeId(String(last.id)), 'found']],
      { returned: value, result: value },
    );
    return snap();
  }

  for (let i = calls.length - 1; i >= 1; i--) {
    const c = calls[i]!;
    const p = calls[i - 1]!;
    stack.pop();
    phase[c.id] = 'done';
    phase[p.id] = 'got';
    got[p.id] = value;
    const pf = frameShapeId(String(p.id));
    yield step(
      tail
        ? `${callText(c)} returns ${value} and its frame is popped. ${callText(p)} was waiting on its tail call, so it has nothing left to do with ${value}.`
        : `${callText(c)} is done, so its frame is popped. ${value} goes back to ${callText(p)}, which was waiting on line 4.`,
      ['rec'],
      tail ? 3 : 2,
      p,
      [
        [pf, 'active'],
        [returnShapeId(String(c.id)), 'found'],
      ],
      { returned: value },
    );
    const mine = tail ? value : p.n * value;
    phase[p.id] = 'return';
    result[p.id] = mine;
    yield step(
      tail
        ? `${callText(p)} passes ${value} straight back.`
        : `${callText(p)} multiplies: ${p.n} × ${value} = ${mine}. It returns ${mine}.`,
      ['rec'],
      2,
      p,
      [
        [pf, 'done'],
        [returnShapeId(String(p.id)), 'found'],
      ],
      { returned: mine },
    );
    value = mine;
  }

  const first = calls[0]!;
  stack.pop();
  phase[first.id] = 'done';
  run.outcome = 'done';
  run.value = value;
  run.from = first.id;
  const meaning =
    n0 < 0
      ? `That 1 is not a factorial: factorial is only defined for n ≥ 0.`
      : `${n0}! = ${value}, and the stack is back to main alone.`;
  yield step(
    `${callText(first)} returns ${value} to main, and its frame is popped. ${meaning}`,
    [],
    1,
    undefined,
    [[returnShapeId(String(first.id)), 'found']],
    { returned: value, result: value },
  );
  return snap();
}

export const ops = { factorial };

export function pseudocode(s: FactSettings): PseudoBlock[] {
  const tail = tailStyle(s);
  const test = baseTest(s.base);
  const testPlain = s.base === 'one' ? 'If n is 1 or less,' : 'If n is 0,';
  const lines = [
    tail
      ? L(
          'sig',
          0,
          'factorial(n, acc = 1)',
          'To find n factorial, carrying the product so far in acc:',
        )
      : L('sig', 0, 'factorial(n)', 'To find n factorial:'),
  ];
  if (s.base !== 'none') {
    lines.push(L('base', 1, `if ${test}`, testPlain));
    lines.push(
      tail
        ? L('one', 2, 'return acc', 'the product so far is the answer.')
        : L('one', 2, 'return 1', 'the answer is 1.'),
    );
  }
  lines.push(
    tail
      ? L(
          'rec',
          1,
          'return factorial(n - 1, n * acc)',
          s.style === 'tco'
            ? 'Otherwise multiply acc by n and go on with n - 1, reusing this frame.'
            : 'Otherwise multiply acc by n and go on with n - 1.',
        )
      : L('rec', 1, 'return n * factorial(n - 1)', 'Otherwise multiply n by (n - 1) factorial.'),
  );
  return [{ op: 'factorial', lines }];
}

export function initialSay(_state: S, s: FactSettings): string {
  const base =
    s.base === 'none' ? 'no base case (a bug to watch)' : `the base case ${baseTest(s.base)}`;
  return `Type n and press Call factorial. The stack has room for ${s.limit} frames, and factorial uses ${base}.`;
}

export function initialVars(): Record<string, Scalar> {
  return { depth: 0, calls: 0 };
}

/** Screen-reader summary of a state. */
export function describe(state: S): string {
  const run = state.run;
  if (!run) return 'The call stack holds only main. No call has been made yet.';
  const made = state.calls.slice(0, state.made);
  if (run.outcome === 'running') {
    const frames = state.stack.map((f) => callText(state.calls[f.call - 1]!));
    return `Call stack, bottom to top: main, ${frames.join(', ')}. ${plural(made.length, 'call')} so far.`;
  }
  const first = state.calls[0]!;
  const deepest = Math.max(...made.map((c) => c.id)) - (run.outcome === 'overflow' ? 1 : 0);
  if (run.outcome === 'overflow')
    return `${callText({ n: first.n, acc: null })} overflowed the stack after ${plural(deepest, 'frame')}. The stack holds only main.`;
  if (run.outcome === 'loop')
    return `${callText({ n: first.n, acc: null })} was stopped after ${plural(made.length, 'call')}: it would never end.`;
  return `${callText({ n: first.n, acc: null })} returned ${run.value} after ${plural(made.length, 'call')}. The stack holds only main.`;
}
