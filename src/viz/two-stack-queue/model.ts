/**
 * A queue built from two stacks, with its amortized cost.
 *
 * - The pattern: enqueue pushes onto `in`. dequeue (and peek) take from `out`; only when out is
 *   empty, every value moves from in to out first, one pop and one push each. Popping in reverses
 *   the order, so the oldest value lands on top of out. A value moves across at most once, so
 *   each value costs at most 4 stack operations (pushed onto in, popped off in, pushed onto out,
 *   popped off out), and any m operations cost at most 3m: O(1) amortized, as on
 *   /amortized-analysis/, even though one dequeue can cost 2n + 1.
 * - The naive design keeps everything on in between operations. Each dequeue or peek moves all n
 *   values across to reach the oldest, then moves the rest back: 4n − 1 or 4n stack operations.
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a push and a pop are each one stack operation.
 * The counters run over the whole session (src/viz/_design1/kit.ts). The state also keeps the
 * pattern's stack sizes when the naive design is shown (and the other way round is just the
 * queue's length), so both totals are known on either side of compare mode.
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
import {
  approachOf,
  NAIVE_TOTAL,
  PATTERN_TOTAL,
  Work,
  workVars,
  type Approach,
} from '../_patterns/kit';
import { addCosts, fmt, list, NO_COSTS, plural, readInt, type Costs } from '../_design1/kit';

export const MAX_SIZE = 8;
export const MIN_VALUE = 0;
export const MAX_VALUE = 99;
/** Any m operations of the pattern cost at most this many stack operations each, on average. */
export const BOUND = 3;

export interface TQSettings {
  [key: string]: Scalar;
  approach: Approach;
}

export const defaults: TQSettings = { approach: 'pattern' };

export interface Item {
  uid: number;
  value: number;
}

export interface TQState {
  /** Bottom to top. New values go on top. */
  inn: Item[];
  /** Bottom to top. The top is the front of the queue. Empty between operations in the naive design. */
  out: Item[];
  nextUid: number;
  /** Pushes and pops so far in the design shown. */
  pushes: number;
  pops: number;
  /** Stack operations so far, each design. */
  cost: Costs;
  /** The pattern's stack sizes, whichever design is shown. */
  shadow: { inn: number; out: number };
  /** The cost of each operation so far, in the design shown. */
  history: number[];
}

export interface TQExtra {
  /** The call and, at the end, its result. */
  label: string;
  /** The cost of this operation so far, drawn as the newest bar while it runs. */
  current?: number;
}

export type TQStep = Step<TQState, TQExtra>;
type Op = OpSpec<TQState, TQSettings, TQExtra>;
type Gen = Generator<TQStep, TQState, void>;

export const init = (): TQState => ({
  inn: [],
  out: [],
  nextUid: 1,
  pushes: 0,
  pops: 0,
  cost: NO_COSTS,
  shadow: { inn: 0, out: 0 },
  history: [],
});

export const vid = (uid: number) => `v${uid}`;
const mark = (id: string, role: MarkRole): Mark => ({ id, role });

/** The queue, front first. */
export const queueOf = (s: TQState): number[] => [
  ...[...s.out].reverse().map((i) => i.value),
  ...s.inn.map((i) => i.value),
];

// ----- Without steps: what each call costs -----

type Kind = 'enqueue' | 'dequeue' | 'peek';

/** Stack operations for one call: the pattern on its stack sizes, the naive design on n values. */
export function callCost(op: Kind, shadow: { inn: number; out: number }): Costs {
  const n = shadow.inn + shadow.out;
  if (op === 'enqueue') return { naive: 1, pattern: 1 };
  if (n === 0) return NO_COSTS;
  const transfer = shadow.out === 0 ? 2 * shadow.inn : 0;
  return op === 'dequeue'
    ? { naive: 4 * n - 1, pattern: transfer + 1 }
    : { naive: 4 * n, pattern: transfer };
}

/** The pattern's stack sizes after one call. */
export function shadowAfter(op: Kind, sh: { inn: number; out: number }) {
  if (op === 'enqueue') return { inn: sh.inn + 1, out: sh.out };
  const moved = sh.out === 0 ? { inn: 0, out: sh.inn } : sh;
  if (op === 'dequeue' && moved.out > 0) return { inn: moved.inn, out: moved.out - 1 };
  return moved;
}

// ----- Steps -----

interface Ctx {
  approach: Approach;
  work: Work;
  after: Costs;
  /** Stack operations in this call so far. */
  spent: number;
  ops: number;
}

function context(s: TQState, settings: TQSettings, op: Kind): Ctx {
  const approach = approachOf(settings);
  const work = new Work(['pushes', 'pops']);
  work.add('pushes', s.pushes);
  work.add('pops', s.pops);
  return {
    approach,
    work,
    after: addCosts(s.cost, callCost(op, s.shadow)),
    spent: 0,
    ops: s.history.length + 1,
  };
}

const tick = (c: Ctx, unit: 'pushes' | 'pops') => {
  c.work.add(unit);
  c.spent++;
};

function step(
  c: Ctx,
  state: TQState,
  say: string,
  lines: string[],
  level: 1 | 2,
  marks: Mark[],
  label: string,
  own: Record<string, Scalar> = {},
  final = false,
): TQStep {
  return {
    state,
    marks,
    say,
    lines,
    level,
    vars: {
      ...own,
      size: state.inn.length + state.out.length,
      operations: c.ops,
      'this op': c.spent,
      ...workVars(c.work, c.after),
    },
    extra: final ? { label } : { label, current: c.spent },
  };
}

/** The finished state of a counted call. */
function finish(s: TQState, c: Ctx, op: Kind): TQState {
  return {
    ...s,
    pushes: c.work.get('pushes'),
    pops: c.work.get('pops'),
    cost: c.after,
    shadow: shadowAfter(op, s.shadow),
    history: [...s.history, c.spent],
  };
}

/** "Running total: 14 for 9 operations, under 3 × 9 = 27." */
function running(c: Ctx): string {
  const total = c.work.total;
  const cap = BOUND * c.ops;
  return `Running total: ${plural(total, 'stack operation')} for ${plural(c.ops, 'queue operation')}${
    c.approach === 'pattern'
      ? `, within ${BOUND} × ${c.ops} = ${cap}`
      : total > cap
        ? `, past ${BOUND} × ${c.ops} = ${cap}`
        : ''
  }.`;
}

/** Move the top of `from` onto `to`: one pop and one push. */
function moveTop(s: TQState, from: 'inn' | 'out'): { s: TQState; item: Item } {
  const to = from === 'inn' ? 'out' : 'inn';
  const item = s[from][s[from].length - 1]!;
  return { s: { ...s, [from]: s[from].slice(0, -1), [to]: [...s[to], item] }, item };
}

/** A call that does nothing and is not counted: a value it cannot read, or no room. */
function* refuse(s: TQState, call: string, why: string): Gen {
  yield {
    state: s,
    marks: [mark('in-name', 'error')],
    say: `${call}: ${why}`,
    lines: ['enq.sig'],
    level: 1,
    vars: {
      size: s.inn.length + s.out.length,
      operations: s.history.length,
      pushes: s.pushes,
      pops: s.pops,
      [NAIVE_TOTAL]: s.cost.naive,
      [PATTERN_TOTAL]: s.cost.pattern,
    },
    extra: { label: call },
  };
  return s;
}

const enqueue: Op = {
  label: 'Enqueue',
  arity: 1,
  *run(s, [arg], { settings }) {
    const x = readInt(arg, MIN_VALUE, MAX_VALUE);
    if (typeof x === 'string') return yield* refuse(s, 'enqueue', `${x} Nothing is enqueued.`);
    const call = `enqueue(${fmt(x)})`;
    if (s.inn.length + s.out.length >= MAX_SIZE)
      return yield* refuse(
        s,
        call,
        `this page keeps at most ${MAX_SIZE} values, so every one stays readable. Dequeue one first.`,
      );
    const c = context(s, settings, 'enqueue');
    tick(c, 'pushes');
    const uid = s.nextUid;
    const end = finish(
      { ...s, inn: [...s.inn, { uid, value: x }], nextUid: uid + 1 },
      c,
      'enqueue',
    );
    yield step(
      c,
      end,
      `${call}: push ${fmt(x)} onto in. One push, whatever the queue holds. ${running(c)}`,
      ['enq.push'],
      1,
      [mark(vid(uid), 'new')],
      call,
      { x },
      true,
    );
    return end;
  },
};

/** dequeue and peek: the same moves, then a pop or a look. */
function take(op: 'dequeue' | 'peek'): Op {
  const d = op === 'dequeue' ? 'deq' : 'peek';
  return {
    label: op === 'dequeue' ? 'Dequeue' : 'Peek',
    arity: 0,
    *run(s0, _args, { settings }): Gen {
      const c = context(s0, settings, op);
      const n = s0.inn.length + s0.out.length;
      if (n === 0) {
        const end = finish(s0, c, op);
        yield step(
          c,
          end,
          `${op}(): both stacks are empty, so the queue is empty. There is nothing to ${op === 'dequeue' ? 'dequeue' : 'look at'}. ${running(c)}`,
          c.approach === 'pattern' ? [`${d}.check`, `${d}.empty`] : [`${d}.empty`],
          1,
          [mark('in-name', 'error'), mark('out-name', 'error')],
          `${op}() → empty`,
          {},
          true,
        );
        return end;
      }
      let s = s0;
      const move = function* (from: 'inn' | 'out', first: string, lines: string[]): Gen {
        const k = s[from].length;
        for (let j = 0; j < k; j++) {
          const r = moveTop(s, from);
          s = r.s;
          tick(c, 'pops');
          tick(c, 'pushes');
          const v = fmt(r.item.value);
          const [a, b] = from === 'inn' ? ['in', 'out'] : ['out', 'in'];
          yield step(
            c,
            s,
            `${j === 0 ? `${first} ` : ''}Move ${v}: pop it off ${a}, push it onto ${b}.`,
            lines,
            2,
            [mark(vid(r.item.uid), 'active')],
            `${op}()`,
          );
        }
        return s;
      };

      if (c.approach === 'pattern') {
        if (s.out.length === 0) {
          yield* move(
            'inn',
            `${op}(): out is empty, so move everything from in to out. Popping in reverses the order, so the oldest value ends on top of out.`,
            [`${d}.check`, `${d}.loop`, `${d}.move`],
          );
        }
        const front = s.out[s.out.length - 1]!;
        const v = fmt(front.value);
        const moved = c.spent > 0;
        if (op === 'dequeue') {
          s = { ...s, out: s.out.slice(0, -1) };
          tick(c, 'pops');
        }
        const end = finish(s, c, op);
        const cost = moved
          ? op === 'dequeue'
            ? `This dequeue cost ${c.spent}: ${c.spent - 1} for the move and 1 for the pop. Those values never move again.`
            : `This peek cost ${c.spent}, all for the move. Those values never move again.`
          : op === 'dequeue'
            ? 'out was not empty, so no moves: one pop.'
            : 'out was not empty, so no moves and no pops.';
        yield step(
          c,
          end,
          op === 'dequeue'
            ? `Pop out's top, ${v}: the oldest value in the queue. ${cost} ${running(c)}`
            : `The front of the queue is out's top, ${v}. It stays there. ${cost} ${running(c)}`,
          moved ? [`${d}.ret`] : [`${d}.check`, `${d}.ret`],
          1,
          op === 'dequeue'
            ? [mark('op-label', 'found')]
            : [mark(vid(front.uid), 'found'), mark('op-label', 'found')],
          `${op}() → ${v}`,
          { returned: front.value },
          true,
        );
        return end;
      }

      // The naive design: move everything across to reach the oldest, then move the rest back.
      yield* move(
        'inn',
        `${op}(): the oldest value is at the bottom of in, so move everything to out to reach it.`,
        [`${d}.loop`, `${d}.move`],
      );
      const front = s.out[s.out.length - 1]!;
      const v = fmt(front.value);
      if (op === 'dequeue') {
        s = { ...s, out: s.out.slice(0, -1) };
        tick(c, 'pops');
      }
      yield step(
        c,
        s,
        op === 'dequeue'
          ? `Pop out's top, ${v}: the oldest value. Now move the rest back, so in holds everything again.`
          : `out's top is ${v}, the oldest value. Now move everything back, so in holds it all again.`,
        [op === 'dequeue' ? `${d}.pop` : `${d}.look`],
        2,
        op === 'dequeue' ? [mark('op-label', 'active')] : [mark(vid(front.uid), 'found')],
        `${op}(): x = ${v}`,
        { x: front.value },
      );
      yield* move('out', '', [`${d}.back`, `${d}.moveback`]);
      const end = finish(s, c, op);
      const pattern = callCost(op, s0.shadow).pattern;
      yield step(
        c,
        end,
        `Return ${v}. This ${op} cost ${c.spent} stack operations, about 4 for every value in the queue. Moving only when out is empty, it would cost ${pattern}. ${running(c)}`,
        [`${d}.ret`],
        1,
        [mark('op-label', 'found')],
        `${op}() → ${v}`,
        { returned: front.value },
        true,
      );
      return end;
    },
  };
}

export const ops: Record<string, Op> = { enqueue, dequeue: take('dequeue'), peek: take('peek') };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

const enqueueBlock: PseudoBlock = {
  op: 'enqueue',
  lines: [
    L('enq.sig', 0, 'enqueue(x)', 'To add x at the back:'),
    L('enq.push', 1, 'in.push(x)', 'push it onto in.'),
  ],
};

export function pseudocode(settings: TQSettings): PseudoBlock[] {
  if (approachOf(settings) === 'naive') {
    const block = (op: 'dequeue' | 'peek'): PseudoBlock => {
      const d = op === 'dequeue' ? 'deq' : 'peek';
      return {
        op,
        lines: [
          L(
            `${d}.sig`,
            0,
            `${op}()   // move everything, every time`,
            op === 'dequeue' ? 'To take the front value off:' : 'To look at the front value:',
          ),
          L(
            `${d}.empty`,
            1,
            'if in is empty: error "queue is empty"',
            'If there are no values, stop.',
          ),
          L(`${d}.loop`, 1, 'while in is not empty', 'Until in is empty,'),
          L(`${d}.move`, 2, 'out.push(in.pop())', 'move its top onto out.'),
          op === 'dequeue'
            ? L(`${d}.pop`, 1, 'x = out.pop()', 'Take the top of out: the oldest value.')
            : L(`${d}.look`, 1, 'x = out.top()', 'Read the top of out: the oldest value.'),
          L(`${d}.back`, 1, 'while out is not empty', 'Until out is empty again,'),
          L(`${d}.moveback`, 2, 'in.push(out.pop())', 'move its top back onto in.'),
          L(`${d}.ret`, 1, 'return x', 'Hand back the oldest value.'),
        ],
      };
    };
    return [enqueueBlock, block('dequeue'), block('peek')];
  }
  const block = (op: 'dequeue' | 'peek'): PseudoBlock => {
    const d = op === 'dequeue' ? 'deq' : 'peek';
    return {
      op,
      lines: [
        L(
          `${d}.sig`,
          0,
          `${op}()`,
          op === 'dequeue' ? 'To take the front value off:' : 'To look at the front value:',
        ),
        L(`${d}.check`, 1, 'if out is empty', 'Only if out is empty,'),
        L(`${d}.loop`, 2, 'while in is not empty', 'until in is empty,'),
        L(`${d}.move`, 3, 'out.push(in.pop())', 'move its top onto out.'),
        L(
          `${d}.empty`,
          1,
          'if out is empty: error "queue is empty"',
          'If out is still empty, there are no values: stop.',
        ),
        op === 'dequeue'
          ? L(`${d}.ret`, 1, 'return out.pop()', 'Take the top of out off: the oldest value.')
          : L(`${d}.ret`, 1, 'return out.top()', 'Hand back the top of out: the oldest value.'),
      ],
    };
  };
  return [enqueueBlock, block('dequeue'), block('peek')];
}

// ----- Start -----

export function describe(s: TQState): string {
  const q = queueOf(s);
  if (!q.length) return 'The queue is empty: in and out are both empty.';
  const side = (name: string, xs: Item[]) =>
    xs.length ? `${name}, bottom to top: ${list(xs.map((i) => i.value))}` : `${name} is empty`;
  return `The queue, front first: ${list(q)}. ${side('in', s.inn)}; ${side('out', s.out)}.`;
}

export function initialSay(_s: TQState, settings: TQSettings): string {
  return approachOf(settings) === 'naive'
    ? 'Two empty stacks, in and out. Here everything lives on in: each dequeue moves it all to out to reach the oldest value, then moves the rest back. Enqueue some values.'
    : 'Two empty stacks, in and out. Enqueue pushes onto in; dequeue pops off out, and only when out is empty does everything move across. Enqueue some values.';
}

export function initialVars(): Record<string, Scalar> {
  return { size: 0, operations: 0, ...workVars(new Work(['pushes', 'pops']), NO_COSTS) };
}

export function parseInput(token: string): Value | Error {
  const v = readInt(token, MIN_VALUE, MAX_VALUE);
  return typeof v === 'string' ? new Error(v) : v;
}
