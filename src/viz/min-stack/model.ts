/**
 * A min stack: push, pop, top and min, all in O(1).
 *
 * - The pattern keeps a second stack, `mins`, beside the stack. Its top is always the smallest
 *   value in the stack. By default (CLRS has no min stack; this is the usual interview form) a
 *   push goes onto mins too only when it is at most the current minimum, and a pop takes the top
 *   of mins off too only when the popped value equals it. The option "every" pushes the minimum
 *   on every push instead, so the two stacks always have the same height: simpler, more space.
 * - The naive design is the plain stack: push, pop and top are O(1), and min scans the array
 *   under the stack, n − 1 comparisons.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a comparison is one value compared with
 * another. The counters run over the whole session (src/viz/_design1/kit.ts): the pattern pays one
 * comparison on a push (and on a pop, by default) and none on min; the naive design pays nothing
 * on push and pop and n − 1 on every min. So a session with few mins can cost the pattern more.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import { approachOf, Work, workVars, type Approach } from '../_patterns/kit';
import { addCosts, fmt, list, NO_COSTS, plural, readInt, type Costs } from '../_design1/kit';

export const MAX_SIZE = 10;
export const MIN_VALUE = -99;
export const MAX_VALUE = 99;

/** When a push goes onto mins: only when it is at most the minimum, or every time. */
export type Track = 'le' | 'every';

export interface MSSettings {
  [key: string]: Scalar;
  approach: Approach;
  track: Track;
}

export const defaults: MSSettings = { approach: 'pattern', track: 'le' };

export interface Item {
  uid: number;
  value: number;
}

/** An entry of mins: a value, and the uid of the stack item whose push put it there. */
export interface MinEntry extends Item {
  from: number;
}

export interface MSState {
  /** The stack, bottom to top. */
  items: Item[];
  /** The stack of minimums, bottom to top. Empty in the naive design. */
  mins: MinEntry[];
  nextUid: number;
  /** Comparisons so far, each design. */
  cost: Costs;
}

export interface MSExtra {
  /** The call and, at the end, its result, written at the top. */
  label: string;
}

export type MSStep = Step<MSState, MSExtra>;
type Op = OpSpec<MSState, MSSettings, MSExtra>;
type Gen = Generator<MSStep, MSState, void>;

export const init = (): MSState => ({ items: [], mins: [], nextUid: 1, cost: NO_COSTS });

export const vid = (uid: number) => `v${uid}`;
const mark = (id: string, role: MarkRole): Mark => ({ id, role });

const trackOf = (s: MSSettings): Track => (s.track === 'every' ? 'every' : 'le');

// ----- Without steps: what mins holds, and what each call costs -----

/** The stack of minimums for these values (bottom to top), as the pattern keeps it. */
export function minsOf(values: readonly number[], track: Track): number[] {
  const out: number[] = [];
  for (const x of values) {
    const m = out[out.length - 1];
    if (track === 'every') out.push(m === undefined ? x : Math.min(x, m));
    else if (m === undefined || x <= m) out.push(x);
  }
  return out;
}

/** The comparisons each design makes for one call on a stack of n values (a valid call). */
export function callCost(op: string, n: number, track: Track): Costs {
  if (op === 'push') return { naive: 0, pattern: n > 0 ? 1 : 0 };
  if (op === 'pop') return { naive: 0, pattern: n > 0 && track === 'le' ? 1 : 0 };
  if (op === 'min') return { naive: Math.max(0, n - 1), pattern: 0 };
  return NO_COSTS;
}

// ----- Steps -----

interface Ctx {
  approach: Approach;
  track: Track;
  work: Work;
  after: Costs;
}

function context(s: MSState, settings: MSSettings, op: string): Ctx {
  const approach = approachOf(settings);
  const track = trackOf(settings);
  const work = new Work(['comparisons']);
  work.add('comparisons', s.cost[approach]);
  return { approach, track, work, after: addCosts(s.cost, callCost(op, s.items.length, track)) };
}

function varsOf(c: Ctx, s: MSState, own: Record<string, Scalar> = {}): Record<string, Scalar> {
  // The pattern's minimum is the top of mins, as the drawing shows it; the naive design keeps none.
  const m = s.mins[s.mins.length - 1];
  return {
    ...own,
    n: s.items.length,
    ...(c.approach === 'pattern' ? { 'mins size': s.mins.length } : {}),
    ...(m ? { min: m.value } : {}),
    ...workVars(c.work, c.after),
  };
}

function step(
  c: Ctx,
  state: MSState,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  marks: Mark[],
  label: string,
  own: Record<string, Scalar> = {},
): MSStep {
  return { state, marks, say, lines, level, vars: varsOf(c, state, own), extra: { label } };
}

/** The finished state of a call: the stack as it ends, with this call's costs added. */
const done = (s: MSState, c: Ctx): MSState => ({ ...s, cost: c.after });

function* refuse(s: MSState, settings: MSSettings, call: string, why: string, line: string): Gen {
  const c = context(s, settings, 'none');
  yield step(c, s, `${call}: ${why}`, [line], 1, [mark('stack-name', 'error')], call);
  return s;
}

/** pop, top and min on an empty stack. */
function* empty(s: MSState, settings: MSSettings, op: string): Gen {
  const c = context(s, settings, 'none');
  const what =
    op === 'pop'
      ? 'There is nothing to pop.'
      : op === 'top'
        ? 'There is no top to read.'
        : 'An empty stack has no minimum.';
  yield step(
    c,
    s,
    `${op}(): the stack is empty. ${what}`,
    [`${op}.check`, `${op}.empty`],
    1,
    [mark('stack-name', 'error')],
    `${op}() → empty`,
  );
  return s;
}

const push: Op = {
  label: 'Push',
  arity: 1,
  *run(s, [arg], { settings }) {
    const x = readInt(arg, MIN_VALUE, MAX_VALUE);
    if (typeof x === 'string')
      return yield* refuse(s, settings, 'push', `${x} Nothing is pushed.`, 'push.sig');
    const call = `push(${fmt(x)})`;
    if (s.items.length >= MAX_SIZE)
      return yield* refuse(
        s,
        settings,
        call,
        `this page keeps at most ${MAX_SIZE} values, so every one stays readable. Pop one first.`,
        'push.sig',
      );
    const c = context(s, settings, 'push');
    const uid = s.nextUid;
    const pushed: MSState = { ...s, items: [...s.items, { uid, value: x }], nextUid: uid + 1 };
    const v = fmt(x);

    if (c.approach === 'naive') {
      const end = done(pushed, c);
      yield step(
        c,
        end,
        `${call}: put ${v} on top of the stack. Nothing else to keep up to date, so no comparisons. The price comes later: min has to scan.`,
        ['push.main'],
        1,
        [mark(vid(uid), 'new')],
        call,
        { x },
      );
      return end;
    }

    yield step(
      c,
      pushed,
      `${call}: put ${v} on top of the stack.`,
      ['push.main'],
      2,
      [mark(vid(uid), 'new')],
      call,
      { x },
    );
    const top = s.mins[s.mins.length - 1];
    const entry = (value: number): MSState => ({
      ...pushed,
      mins: [...s.mins, { uid: uid + 1, value, from: uid }],
      nextUid: uid + 2,
    });

    if (!top) {
      const end = done(entry(x), c);
      yield step(
        c,
        end,
        c.track === 'every'
          ? `mins is empty, so ${v} is the smallest value so far: push it onto mins. min = ${v}. mins and the stack always have the same height.`
          : `mins is empty, so ${v} is the smallest value so far: push it onto mins too. min = ${v}.`,
        c.track === 'every' ? ['push.empty', 'push.min'] : ['push.check', 'push.min'],
        1,
        [mark(vid(uid + 1), 'new')],
        call,
        { x },
      );
      return end;
    }

    const m = fmt(top.value);
    c.work.add('comparisons');
    if (c.track === 'every') {
      const small = Math.min(x, top.value);
      yield step(
        c,
        pushed,
        `Compare ${v} with the top of mins, ${m}: the smaller is ${fmt(small)}.`,
        ['push.check'],
        2,
        [mark(vid(uid), 'compare'), mark(vid(top.uid), 'compare')],
        call,
        { x },
      );
      const end = done(entry(small), c);
      yield step(
        c,
        end,
        `Push ${fmt(small)} onto mins, so mins stays as tall as the stack. min = ${fmt(small)}.`,
        ['push.min'],
        1,
        [mark(vid(uid + 1), 'new')],
        call,
        { x },
      );
      return end;
    }

    if (x > top.value) {
      const end = done(pushed, c);
      yield step(
        c,
        end,
        `Compare ${v} with the top of mins, ${m}: ${v} > ${m}, so the minimum is still ${m}. mins stays as it is.`,
        ['push.check'],
        1,
        [mark(vid(uid), 'compare'), mark(vid(top.uid), 'found')],
        call,
        { x },
      );
      return end;
    }
    const tie = x === top.value;
    yield step(
      c,
      pushed,
      tie
        ? `Compare ${v} with the top of mins, ${m}: ${v} ≤ ${m}, a tie. It goes onto mins too.`
        : `Compare ${v} with the top of mins, ${m}: ${v} ≤ ${m}, so ${v} is a new minimum.`,
      ['push.check'],
      2,
      [mark(vid(uid), 'compare'), mark(vid(top.uid), 'compare')],
      call,
      { x },
    );
    const end = done(entry(x), c);
    yield step(
      c,
      end,
      tie
        ? `Push ${v} onto mins. Now mins holds ${v} twice: when one ${v} is popped, the other is still the minimum.`
        : `Push ${v} onto mins. min = ${v}.`,
      ['push.min'],
      1,
      [mark(vid(uid + 1), 'new')],
      call,
      { x },
    );
    return end;
  },
};

const pop: Op = {
  label: 'Pop',
  arity: 0,
  *run(s, _args, { settings }) {
    const item = s.items[s.items.length - 1];
    if (!item) return yield* empty(s, settings, 'pop');
    const c = context(s, settings, 'pop');
    const x = item.value;
    const v = fmt(x);
    const popped: MSState = { ...s, items: s.items.slice(0, -1) };
    const label = `pop() → ${v}`;
    const left = (st: MSState) =>
      st.items.length
        ? `The minimum is now ${fmt(Math.min(...st.items.map((i) => i.value)))}.`
        : 'The stack is empty again.';

    if (c.approach === 'naive') {
      const end = done(popped, c);
      yield step(
        c,
        end,
        `pop(): take ${v} off the top and return it. No comparisons: nothing else is kept.`,
        ['pop.check', 'pop.main', 'pop.ret'],
        1,
        [mark('op-label', 'found')],
        label,
        { returned: x },
      );
      return end;
    }

    yield step(
      c,
      popped,
      `pop(): take ${v} off the top of the stack.`,
      ['pop.check', 'pop.main'],
      2,
      [mark('op-label', 'active')],
      `pop(): x = ${v}`,
      { x },
    );
    const top = s.mins[s.mins.length - 1]!;
    const unmin: MSState = { ...popped, mins: s.mins.slice(0, -1) };

    if (c.track === 'every') {
      const end = done(unmin, c);
      yield step(
        c,
        end,
        `Pop mins too, without looking: the two stacks always have the same height. ${left(end)} Return ${v}.`,
        ['pop.min', 'pop.ret'],
        1,
        [mark('op-label', 'found'), ...(end.mins.length ? [mark(minTopId(end), 'found')] : [])],
        label,
        { returned: x },
      );
      return end;
    }

    c.work.add('comparisons');
    const m = fmt(top.value);
    if (x !== top.value) {
      const end = done(popped, c);
      yield step(
        c,
        end,
        `Compare ${v} with the top of mins, ${m}: not equal, so ${v} was not the minimum and mins stays. The minimum is still ${m}. Return ${v}.`,
        ['pop.cmp', 'pop.ret'],
        1,
        [mark('op-label', 'found'), mark(vid(top.uid), 'found')],
        label,
        { returned: x },
      );
      return end;
    }
    yield step(
      c,
      popped,
      `Compare ${v} with the top of mins, ${m}: equal, so the minimum is leaving the stack.`,
      ['pop.cmp'],
      2,
      [mark('op-label', 'active'), mark(vid(top.uid), 'remove')],
      `pop(): x = ${v}`,
      { x },
    );
    const end = done(unmin, c);
    yield step(
      c,
      end,
      `Pop mins too. ${left(end)} Return ${v}.`,
      ['pop.min', 'pop.ret'],
      1,
      [mark('op-label', 'found'), ...(end.mins.length ? [mark(minTopId(end), 'found')] : [])],
      label,
      { returned: x },
    );
    return end;
  },
};

const minTopId = (s: MSState) => vid(s.mins[s.mins.length - 1]!.uid);

const top: Op = {
  label: 'Top',
  arity: 0,
  *run(s, _args, { settings }) {
    const item = s.items[s.items.length - 1];
    if (!item) return yield* empty(s, settings, 'top');
    const c = context(s, settings, 'top');
    yield step(
      c,
      done(s, c),
      `top(): the top of the stack is ${fmt(item.value)}. It stays where it is.`,
      ['top.check', 'top.ret'],
      1,
      [mark(vid(item.uid), 'found'), mark('op-label', 'found')],
      `top() → ${fmt(item.value)}`,
      { returned: item.value },
    );
    return done(s, c);
  },
};

const min: Op = {
  label: 'Min',
  arity: 0,
  *run(s, _args, { settings }) {
    const n = s.items.length;
    if (n === 0) return yield* empty(s, settings, 'min');
    const c = context(s, settings, 'min');
    const end = done(s, c);
    const scan =
      n === 1
        ? 'with one value, a scan would need none either'
        : `scanning the stack would take ${plural(n - 1, 'comparison')}`;

    if (c.approach === 'pattern') {
      const t = s.mins[s.mins.length - 1]!;
      const v = fmt(t.value);
      yield step(
        c,
        end,
        `min(): the top of mins is the minimum: ${v}. One look, no comparisons; ${scan}.`,
        ['min.check', 'min.ret'],
        1,
        [mark(vid(t.uid), 'found'), mark('op-label', 'found')],
        `min() → ${v}`,
        { returned: t.value },
      );
      return end;
    }

    const a = s.items;
    if (n === 1) {
      yield step(
        c,
        end,
        `min(): the stack holds one value, ${fmt(a[0]!.value)}, so that is the minimum. No comparisons.`,
        ['min.check', 'min.init', 'min.ret'],
        1,
        [mark(vid(a[0]!.uid), 'found'), mark('op-label', 'found')],
        `min() → ${fmt(a[0]!.value)}`,
        { returned: a[0]!.value },
      );
      return end;
    }
    let best = 0;
    yield step(
      c,
      s,
      `min(): scan the array under the stack. Start with best = A[0] = ${fmt(a[0]!.value)}, the bottom value.`,
      ['min.check', 'min.init'],
      2,
      [mark(vid(a[0]!.uid), 'found')],
      `min(): best = ${fmt(a[0]!.value)}`,
      { i: 0, best: a[0]!.value },
    );
    for (let i = 1; i < n; i++) {
      c.work.add('comparisons');
      const was = a[best]!.value;
      const y = a[i]!.value;
      const smaller = y < was;
      if (smaller) best = i;
      yield step(
        c,
        s,
        smaller
          ? `Compare A[${i}] = ${fmt(y)} with best = ${fmt(was)}: smaller, so best = ${fmt(y)}.`
          : `Compare A[${i}] = ${fmt(y)} with best = ${fmt(was)}: not smaller, so best stays ${fmt(was)}.`,
        smaller ? ['min.loop', 'min.cmp', 'min.set'] : ['min.loop', 'min.cmp'],
        2,
        [mark(vid(a[i]!.uid), 'compare'), mark(vid(a[best]!.uid), 'found')],
        `min(): best = ${fmt(a[best]!.value)}`,
        { i, best: a[best]!.value },
      );
    }
    const b = a[best]!.value;
    yield step(
      c,
      end,
      `The scan is done: min() = ${fmt(b)}, after ${plural(n - 1, 'comparison')}. A second stack of minimums would answer with one look at its top.`,
      ['min.ret'],
      1,
      [mark(vid(a[best]!.uid), 'found'), mark('op-label', 'found')],
      `min() → ${fmt(b)}`,
      { returned: b },
    );
    return end;
  },
};

export const ops: Record<string, Op> = { push, pop, top, min };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

function reads(op: 'top' | 'min', ret: PseudoLine[]): PseudoBlock {
  return {
    op,
    lines: [
      L(`${op}.sig`, 0, `${op}()`, op === 'top' ? 'To read the top:' : 'To find the minimum:'),
      L(`${op}.check`, 1, 'if stack is empty', 'If the stack is empty,'),
      L(`${op}.empty`, 2, 'error "stack is empty"', 'stop: there is nothing to read.'),
      ...ret,
    ],
  };
}

export function pseudocode(settings: MSSettings): PseudoBlock[] {
  const top = reads('top', [
    L('top.ret', 1, 'return stack.top()', 'Hand back the top value and leave it there.'),
  ]);
  const popHead = [
    L('pop.sig', 0, 'pop()', 'To pop:'),
    L('pop.check', 1, 'if stack is empty', 'If the stack is empty,'),
    L('pop.empty', 2, 'error "stack is empty"', 'stop: there is nothing to pop.'),
    L('pop.main', 1, 'x = stack.pop()', 'Take the top value off the stack.'),
  ];
  if (approachOf(settings) === 'naive') {
    return [
      {
        op: 'push',
        lines: [
          L('push.sig', 0, 'push(x)', 'To push x:'),
          L('push.main', 1, 'stack.push(x)', 'Put x on top. Nothing else is kept.'),
        ],
      },
      { op: 'pop', lines: [...popHead, L('pop.ret', 1, 'return x', 'Hand it back.')] },
      top,
      reads('min', [
        L(
          'min.init',
          1,
          'best = A[0]   // A: the array under the stack',
          'Start with the bottom value as the best so far.',
        ),
        L('min.loop', 1, 'for i = 1 to n − 1', 'Go up through every other value:'),
        L('min.cmp', 2, 'if A[i] < best', 'if it is smaller than the best so far,'),
        L('min.set', 3, 'best = A[i]', 'it is the new best.'),
        L('min.ret', 1, 'return best', 'Hand back the smallest value.'),
      ]),
    ];
  }
  if (trackOf(settings) === 'every') {
    return [
      {
        op: 'push',
        lines: [
          L('push.sig', 0, 'push(x)', 'To push x:'),
          L('push.main', 1, 'stack.push(x)', 'Put x on top of the stack.'),
          L('push.empty', 1, 'if mins is empty: m = x', 'If mins is empty, x is the minimum;'),
          L(
            'push.check',
            1,
            'else: m = min(x, mins.top())',
            'otherwise the minimum is the smaller of x and the old minimum.',
          ),
          L('push.min', 1, 'mins.push(m)', 'Push that minimum onto mins, every time.'),
        ],
      },
      {
        op: 'pop',
        lines: [
          ...popHead,
          L('pop.min', 1, 'mins.pop()', 'Pop mins too: the two stacks have the same height.'),
          L('pop.ret', 1, 'return x', 'Hand back the value.'),
        ],
      },
      top,
      reads('min', [
        L('min.ret', 1, 'return mins.top()', 'Hand back the top of mins: the minimum.'),
      ]),
    ];
  }
  return [
    {
      op: 'push',
      lines: [
        L('push.sig', 0, 'push(x)', 'To push x:'),
        L('push.main', 1, 'stack.push(x)', 'Put x on top of the stack.'),
        L(
          'push.check',
          1,
          'if mins is empty or x ≤ mins.top()',
          'If x is at most the minimum so far (or the first value),',
        ),
        L('push.min', 2, 'mins.push(x)', 'push it onto mins too: it is the new minimum.'),
      ],
    },
    {
      op: 'pop',
      lines: [
        ...popHead,
        L('pop.cmp', 1, 'if x == mins.top()', 'If it was the minimum,'),
        L('pop.min', 2, 'mins.pop()', 'take it off mins too.'),
        L('pop.ret', 1, 'return x', 'Hand back the value.'),
      ],
    },
    top,
    reads('min', [L('min.ret', 1, 'return mins.top()', 'Hand back the top of mins: the minimum.')]),
  ];
}

// ----- Start -----

export function describe(s: MSState): string {
  const vs = s.items.map((i) => i.value);
  if (!vs.length) return 'The stack is empty.';
  const mins = s.mins.length
    ? ` mins, bottom to top: ${list(s.mins.map((m) => m.value))}.`
    : '';
  return `The stack, bottom to top: ${list(vs)}.${mins}`;
}

export function initialSay(_s: MSState, settings: MSSettings): string {
  if (approachOf(settings) === 'naive')
    return 'An empty stack, and nothing else. Push, pop and top cost no comparisons; min scans the whole stack. Push some values, then press Min.';
  return trackOf(settings) === 'every'
    ? 'An empty stack, and beside it mins, a second stack that gets the minimum so far on every push, so its top is always the smallest value in the stack. Push some values, then press Min.'
    : 'An empty stack, and beside it mins, a second stack whose top is always the smallest value in the stack. A push goes onto mins only when it is at most the minimum. Push some values, then press Min.';
}

export function initialVars(_s: MSState, settings: MSSettings): Record<string, Scalar> {
  return {
    n: 0,
    ...(approachOf(settings) === 'pattern' ? { 'mins size': 0 } : {}),
    ...workVars(new Work(['comparisons']), NO_COSTS),
  };
}

/** Values for the input box: one whole number. */
export function parseInput(token: string): Value | Error {
  const v = readInt(token, MIN_VALUE, MAX_VALUE);
  return typeof v === 'string' ? new Error(v) : v;
}
