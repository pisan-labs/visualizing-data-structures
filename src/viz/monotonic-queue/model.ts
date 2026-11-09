/**
 * Monotonic queue: the maximum (or minimum) of every window of k consecutive values in O(n).
 * A deque holds indices whose values decrease from front to back, so the front is always the
 * window's maximum. A new value pops every value at the back that is not bigger (they are
 * older and no bigger, so they can never be a maximum again), then joins at the back. The
 * front leaves when it falls out of the window. Every index is pushed once and popped at most
 * once, against (n − k + 1)(k − 1) comparisons for scanning every window.
 *
 * The goal setting turns it into the window minimum: the deque's values increase instead.
 */
import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsRegion } from '../../layouts/bars';
import {
  at,
  loadOp,
  makeState,
  mark,
  plural,
  Run,
  span,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
} from '../_sorting/kit';
import { intArg } from '../_techniques/kit';

export type Goal = 'max' | 'min';

export interface QueueSettings {
  [key: string]: Scalar;
  goal: Goal;
  draw: Draw;
}

export const defaults: QueueSettings = { goal: 'max', draw: 'bars' };

export const START = [2, 7, 4, 1, 5, 3, 6, 2, 8, 4];

export interface QueueExtra extends ArrayExtra {
  /** Indices in the deque, front first. */
  deque?: number[];
  /** The answer for the window starting at each index; undefined until it is known. */
  out?: (number | undefined)[];
}

export type QueueStep = ArrayStep & { extra?: QueueExtra };
type Op = OpSpec<ArrayState, QueueSettings, QueueExtra>;

export const init = (): ArrayState => makeState(START);

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export const dequeId = (uid: number) => `dq-${uid}`;
export const outId = (s: number) => `out-${s}`;

const slide: Op = {
  label: 'Slide the window',
  arity: 1,
  *run(s, [arg], { settings }) {
    const n = s.a.length;
    const k = intArg(arg, 1, n, 'k');
    if (typeof k === 'string') {
      yield {
        state: s,
        marks: [],
        say: `Nothing to do. ${k} The window must fit in A, which has ${plural(n, 'value')}.`,
        lines: [],
        level: 1,
        vars: { n },
      };
      return s;
    }
    const max = settings.goal === 'max';
    const word = max ? 'maximum' : 'minimum';
    const r = new Run(s, ['pushes', 'pops']);
    const brute = (n - k + 1) * (k - 1);
    const dq: number[] = [];
    const out: (number | undefined)[] = Array.from({ length: n - k + 1 }, () => undefined);
    const dqId = (j: number) => dequeId(r.a[j]!.uid);
    const window = (i: number): BarsRegion[] =>
      i >= 0
        ? [
            {
              id: 'window',
              from: Math.max(0, i - k + 1),
              to: i,
              tone: 'window',
              label: `window of ${k}`,
            },
          ]
        : [];
    const vars = (i: number, more: Record<string, Scalar> = {}) => ({
      k,
      i,
      ...more,
      'deque size': dq.length,
      'brute force': brute,
    });
    const extra = (i: number): QueueExtra => ({
      pointers: i >= 0 && i < n ? [{ name: 'i', at: i }] : [],
      regions: window(Math.min(i, n - 1)),
      deque: [...dq],
      out: [...out],
    });
    // A value at the back is beaten by A[i] when it is no bigger (max) or no smaller (min).
    const beaten = (j: number, i: number) => (max ? r.v(j) <= r.v(i) : r.v(j) >= r.v(i));

    yield r.step({
      say: `Find the ${word} of every window of k = ${k} values. The deque holds indices whose values ${max ? 'decrease' : 'increase'} from front to back, so its front is always the window's ${word}.`,
      lines: ['init'],
      level: 2,
      vars: vars(-1),
      extra: extra(-1),
    });
    for (let i = 0; i < n; i++) {
      const v = r.v(i);
      const lo = Math.max(0, i - k + 1);
      yield r.step({
        say: `i = ${i}: ${at(i, v)} enters the window, now ${span(lo, i)}.`,
        lines: ['loop'],
        level: 3,
        marks: [mark(r.id(i), 'new')],
        vars: vars(i),
        extra: extra(i),
      });
      if (dq.length && dq[0]! <= i - k) {
        const j = dq.shift()!;
        r.count('pops');
        yield r.step({
          say: `The front, index ${j}, is no longer in the window ${span(lo, i)}: pop it from the front.`,
          lines: ['expire'],
          level: 2,
          marks: [mark(r.id(j), 'remove')],
          vars: vars(i),
          extra: extra(i),
        });
      }
      while (dq.length && beaten(dq[dq.length - 1]!, i)) {
        const j = dq.pop()!;
        r.count('pops');
        yield r.step({
          say: `${at(j, r.v(j))} ${max ? '≤' : '≥'} ${v}: it is older and no ${max ? 'bigger' : 'smaller'}, so it can never be the ${word} again. Pop it from the back.`,
          lines: ['while', 'popback'],
          level: 2,
          marks: [mark(r.id(i), 'active'), mark(r.id(j), 'remove')],
          vars: vars(i),
          extra: extra(i),
        });
      }
      dq.push(i);
      r.count('pushes');
      const order = dq.map((j) => r.v(j)).join(', ');
      if (i >= k - 1) {
        const f = dq[0]!;
        out[i - k + 1] = r.v(f);
        yield r.step({
          say: `Push ${i} at the back: the deque holds ${order}. The window ${span(i - k + 1, i)} is full, and its ${word} is the front, ${at(f, r.v(f))}.`,
          lines: ['push', 'out'],
          level: 2,
          marks: [mark(dqId(i), 'new'), mark(dqId(f), 'found'), mark(outId(i - k + 1), 'new')],
          vars: vars(i, { [word]: r.v(f) }),
          extra: extra(i),
        });
      } else {
        yield r.step({
          say: `Push ${i} at the back: the deque holds ${order}. The window is not full yet.`,
          lines: ['push'],
          level: 2,
          marks: [mark(dqId(i), 'new')],
          vars: vars(i),
          extra: extra(i),
        });
      }
    }
    const { pushes, pops } = r.counts;
    yield r.step({
      say: `Done. The window ${word}s are ${out.join(', ')}. Each index was pushed once and popped at most once: ${pushes} pushes and ${pops} pops. Scanning every window from scratch takes ${brute} comparisons.`,
      lines: ['ret'],
      level: 1,
      vars: { ...vars(n - 1), result: out.join(' ') },
      extra: { ...extra(n - 1), pointers: [] },
    });
    return r.state();
  },
};

export const ops: Record<string, Op> = {
  load: loadOp<QueueSettings>({ ready: 'Type a window size k and press Slide the window.' }) as Op,
  slide,
};

export function pseudocode(settings: QueueSettings): PseudoBlock[] {
  const max = settings.goal === 'max';
  return [
    {
      op: 'slide',
      lines: [
        L(
          'sig',
          0,
          max ? 'windowMax(A, k)' : 'windowMin(A, k)',
          `To find the ${max ? 'maximum' : 'minimum'} of every window of k values:`,
        ),
        L(
          'init',
          1,
          'D = empty deque',
          `D holds indices; their values ${max ? 'decrease' : 'increase'} front to back.`,
        ),
        L('loop', 1, 'for i = 0 to n − 1', 'Let each value enter in turn.'),
        L(
          'expire',
          2,
          'if D.front == i − k: D.popFront()',
          'Drop the front if it has left the window.',
        ),
        L(
          'while',
          2,
          max ? 'while D not empty and A[D.back] ≤ A[i]' : 'while D not empty and A[D.back] ≥ A[i]',
          `While the value at the back is no ${max ? 'bigger' : 'smaller'} than the new one,`,
        ),
        L('popback', 3, 'D.popBack()', 'it can never win again: drop it.'),
        L('push', 2, 'D.pushBack(i)', 'The new value joins at the back.'),
        L(
          'out',
          2,
          'if i ≥ k − 1: out[i − k + 1] = A[D.front]',
          `Once the window is full, its ${max ? 'maximum' : 'minimum'} is at the front.`,
        ),
        L('ret', 1, 'return out', 'Hand back one answer per window.'),
      ],
    },
  ];
}

export function initialSay(state: ArrayState, settings: QueueSettings): string {
  return `A holds ${plural(state.a.length, 'value')}. Type a window size k, such as 3, and press Slide the window to find the ${settings.goal === 'max' ? 'maximum' : 'minimum'} of every window of k values in a row.`;
}

export const initialVars = (state: ArrayState) => ({ n: state.a.length });
