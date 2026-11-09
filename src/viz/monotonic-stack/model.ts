/**
 * Monotonic stack: a stack of indices whose values stay in order (decreasing or increasing
 * from bottom to top). Scanning left to right, a new value pops everything it breaks the order
 * with, and each pop answers a question about the popped index. Every index is pushed once
 * and popped at most once, so a scan is O(n), where checking every pair is O(n²).
 *
 * - scan, "next greater" (the default): the stack's values decrease. A[i] pops every smaller
 *   value on top, and is the next greater value of each of them. What is left at the end has
 *   none.
 * - scan, "previous smaller" (a setting): the stack's values increase. A[i] pops every value
 *   that is not smaller; the top left over is the nearest smaller value to its left.
 * - histogram: the largest rectangle under the bars. The stack's heights increase. When bar i
 *   is lower than the top, the top's rectangle cannot reach i: its width runs from just after
 *   the bar under it on the stack to i − 1. A height-0 bar after the end empties the stack.
 */
import type { Mark, OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsPointer } from '../../layouts/bars';
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

export type Find = 'next-greater' | 'previous-smaller';

export interface StackSettings {
  [key: string]: Scalar;
  find: Find;
  draw: Draw;
}

export const defaults: StackSettings = { find: 'next-greater', draw: 'bars' };

export const START = [4, 7, 3, 2, 5, 8, 1, 6, 3];

export interface MonoExtra extends ArrayExtra {
  /** Indices on the stack, bottom first. */
  stack?: number[];
  /** What the scan has worked out per index: a value, null for "none", undefined for not yet. */
  answers?: (number | null | undefined)[];
  /** What the answers row is called. */
  answerName?: string;
  /** histogram: the rectangle being measured, over columns from..to at height h. */
  rect?: { from: number; to: number; h: number; best?: boolean };
}

export type MonoStep = ArrayStep & { extra?: MonoExtra };
type Op = OpSpec<ArrayState, StackSettings, MonoExtra>;

export const init = (): ArrayState => makeState(START);

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export const stackId = (uid: number) => `stk-${uid}`;
export const ansId = (i: number) => `ans-${i}`;

const ANSWER: Record<Find, string> = {
  'next-greater': 'next greater',
  'previous-smaller': 'previous smaller',
};

// ----- scan: next greater or previous smaller -----

const scan: Op = {
  label: 'Scan',
  arity: 0,
  *run(s, _args, { settings }) {
    const r = new Run(s, ['pushes', 'pops']);
    const n = r.n;
    const brute = (n * (n - 1)) / 2;
    const next = settings.find === 'next-greater';
    const stack: number[] = [];
    const ans: (number | null | undefined)[] = Array.from({ length: n }, () => undefined);
    const top = () => stack[stack.length - 1]!;
    const vars = (i: number, more: Record<string, Scalar> = {}) => ({
      i,
      ...more,
      'stack size': stack.length,
      'brute force': brute,
    });
    const extra = (i: number): MonoExtra => ({
      pointers: i < n ? [{ name: 'i', at: i }] : [],
      stack: [...stack],
      answers: [...ans],
      answerName: ANSWER[settings.find],
    });
    const stk = (k: number) => stackId(r.a[k]!.uid);

    yield r.step({
      say: next
        ? `Find, for each value, the first bigger value to its right. The stack holds indices still waiting for an answer; their values decrease from bottom to top.`
        : `Find, for each value, the nearest smaller value to its left. The stack holds indices that could still be someone's answer; their values increase from bottom to top.`,
      lines: ['init'],
      level: 2,
      vars: vars(0),
      extra: extra(0),
    });
    for (let i = 0; i < n; i++) {
      const v = r.v(i);
      yield r.step({
        say: stack.length
          ? `i = ${i}: ${at(i, v)}. The top of the stack is ${at(top(), r.v(top()))}.`
          : `i = ${i}: ${at(i, v)}. The stack is empty.`,
        lines: ['loop'],
        level: 3,
        marks: [mark(r.id(i), 'active'), ...(stack.length ? [mark(stk(top()), 'compare')] : [])],
        vars: vars(i),
        extra: extra(i),
      });
      while (stack.length && (next ? r.v(top()) < v : r.v(top()) >= v)) {
        const j = stack.pop()!;
        const w = r.v(j);
        r.count('pops');
        if (next) {
          ans[j] = v;
          yield r.step({
            say: `${w} < ${v}, so ${v} is the first bigger value to the right of ${at(j, w)}: ans[${j}] = ${v}. Pop ${j}.`,
            lines: ['while', 'answer'],
            level: 2,
            marks: [mark(r.id(i), 'active'), mark(r.id(j), 'found'), mark(ansId(j), 'new')],
            vars: vars(i),
            extra: extra(i),
          });
        } else {
          yield r.step({
            say: `${w} ≥ ${v}, so ${at(j, w)} can never be the previous smaller value of anything after i: ${at(i, v)} is closer and no bigger. Pop ${j}.`,
            lines: ['while', 'pop'],
            level: 2,
            marks: [mark(r.id(i), 'active'), mark(r.id(j), 'remove')],
            vars: vars(i),
            extra: extra(i),
          });
        }
      }
      if (!next) {
        ans[i] = stack.length ? r.v(top()) : null;
        yield r.step({
          say: stack.length
            ? `The top, ${at(top(), r.v(top()))}, is smaller than ${v}: it is the nearest smaller value to the left. ans[${i}] = ${r.v(top())}.`
            : `The stack is empty: nothing to the left of ${at(i, v)} is smaller. ans[${i}] = none.`,
          lines: ['answer'],
          level: 2,
          marks: [
            mark(r.id(i), 'active'),
            mark(ansId(i), 'new'),
            ...(stack.length ? [mark(stk(top()), 'found')] : []),
          ],
          vars: vars(i),
          extra: extra(i),
        });
      }
      stack.push(i);
      r.count('pushes');
      yield r.step({
        say: `Push ${i}. ${stack.length > 1 ? `The stack's values still ${next ? 'decrease' : 'increase'}: ${stack.map((k) => r.v(k)).join(', ')}.` : 'It is the only index on the stack.'}`,
        lines: ['push'],
        level: 2,
        marks: [mark(r.id(i), 'active'), mark(stk(i), 'new')],
        vars: vars(i),
        extra: extra(i),
      });
    }
    if (next && stack.length) {
      for (const j of stack) ans[j] = null;
      yield r.step({
        say: `The scan is over. Nothing bigger came after ${stack.map((k) => at(k, r.v(k))).join(', ')}, so their answer is none.`,
        lines: ['rest'],
        level: 2,
        marks: stack.map((k) => mark(ansId(k), 'new')),
        vars: vars(n),
        extra: extra(n),
      });
    }
    const { pushes, pops } = r.counts;
    const result = ans.map((a) => (a === null || a === undefined ? -1 : a)).join(' ');
    yield r.step({
      say: `Done. Each index was pushed once and popped at most once: ${pushes} pushes and ${pops} pops. Checking every pair would take up to ${brute} comparisons.`,
      lines: ['ret'],
      level: 1,
      vars: { ...vars(n), result },
      extra: extra(n),
    });
    return r.state();
  },
};

// ----- histogram: the largest rectangle -----

const histogram: Op = {
  label: 'Largest rectangle',
  arity: 0,
  *run(s) {
    const r = new Run(s, ['pushes', 'pops']);
    const n = r.n;
    const brute = (n * (n + 1)) / 2;
    const stack: number[] = [];
    const area: (number | null | undefined)[] = Array.from({ length: n }, () => undefined);
    let best = 0;
    let bestRect: MonoExtra['rect'] | undefined;
    const top = () => stack[stack.length - 1]!;
    const vars = (i: number, more: Record<string, Scalar> = {}) => ({
      i,
      ...more,
      best,
      'stack size': stack.length,
      'brute force': brute,
    });
    const extra = (i: number, rect?: MonoExtra['rect']): MonoExtra => {
      const pointers: BarsPointer[] = [{ name: 'i', at: i }];
      return {
        pointers,
        stack: [...stack],
        answers: [...area],
        answerName: 'area with this bar as the lowest',
        ...(rect ? { rect } : {}),
      };
    };
    const stk = (k: number) => stackId(r.a[k]!.uid);

    yield r.step({
      say: `Find the largest rectangle under the bars. The stack holds bars whose rectangle could still grow to the right; their heights increase from bottom to top.`,
      lines: ['hinit'],
      level: 2,
      vars: vars(0),
      extra: extra(0),
    });
    for (let i = 0; i <= n; i++) {
      const end = i === n;
      const h = end ? 0 : r.v(i);
      yield r.step({
        say: end
          ? `i = ${n}, past the end: a bar of height 0, lower than everything, so every bar left on the stack gets measured.`
          : stack.length
            ? `i = ${i}: ${at(i, h)}. The top of the stack has height ${r.v(top())}.`
            : `i = ${i}: ${at(i, h)}. The stack is empty.`,
        lines: ['hloop'],
        level: 3,
        marks: [
          ...(end ? [] : [mark(r.id(i), 'active')]),
          ...(stack.length ? [mark(stk(top()), 'compare')] : []),
        ],
        vars: vars(i, { h }),
        extra: extra(i),
      });
      while (stack.length && r.v(top()) >= h) {
        const j = stack.pop()!;
        r.count('pops');
        const hj = r.v(j);
        const left = stack.length ? top() + 1 : 0;
        const width = i - left;
        const a = hj * width;
        area[j] = a;
        const better = a > best;
        const rect = { from: left, to: i - 1, h: hj };
        if (better) {
          best = a;
          bestRect = { ...rect, best: true };
        }
        const leftWhy =
          left > 0 ? `; A[${left - 1}] = ${r.v(left - 1)}, under it on the stack, is lower` : '';
        const rightWhy = end
          ? '; the bars end at i'
          : h < hj
            ? `; A[${i}] = ${h} is lower`
            : `; A[${i}] = ${h} is as high and will measure the wider rectangle itself`;
        yield r.step({
          say: `Pop ${j} (height ${hj}). Every bar in ${span(left, i - 1)} is at least ${hj} high${leftWhy}${rightWhy}. Area ${hj} × ${width} = ${a}.${better ? ' The largest so far.' : ''}`,
          lines: ['hwhile', 'hpop', 'harea'],
          level: 2,
          marks: [mark(r.id(j), 'found'), mark(ansId(j), 'new')],
          vars: vars(i, { h, area: a }),
          extra: extra(i, rect),
        });
      }
      if (!end) {
        stack.push(i);
        r.count('pushes');
        yield r.step({
          say: `Push ${i}. The heights on the stack still increase: ${stack.map((k) => r.v(k)).join(', ')}.`,
          lines: ['hpush'],
          level: 2,
          marks: [mark(r.id(i), 'active'), mark(stk(i), 'new')],
          vars: vars(i, { h }),
          extra: extra(i),
        });
      }
    }
    const { pushes, pops } = r.counts;
    const marks: Mark[] = bestRect
      ? Array.from({ length: bestRect.to - bestRect.from + 1 }, (_, k) =>
          mark(r.id(bestRect!.from + k), 'found'),
        )
      : [];
    yield r.step({
      say: bestRect
        ? `Done. The largest rectangle has area ${best}: height ${bestRect.h} over ${span(bestRect.from, bestRect.to)}. ${pushes} pushes and ${pops} pops; trying every stretch of bars takes ${brute}.`
        : 'Done. Every bar has height 0, so there is no rectangle.',
      lines: ['hret'],
      level: 1,
      marks,
      vars: { ...vars(n), result: best },
      extra: extra(n, bestRect),
    });
    return r.state();
  },
};

export const ops: Record<string, Op> = {
  load: loadOp<StackSettings>({
    ready: 'Press Scan with the stack, or Largest rectangle to read the values as bar heights.',
  }) as Op,
  scan,
  histogram,
};

export function pseudocode(settings: StackSettings): PseudoBlock[] {
  const scanLines =
    settings.find === 'next-greater'
      ? [
          L(
            'sig',
            0,
            'nextGreater(A)',
            'To find the first bigger value to the right of each value:',
          ),
          L('init', 1, 'ans = [none] · n; S = empty stack', 'No answers yet, and an empty stack.'),
          L('loop', 1, 'for i = 0 to n − 1', 'Look at each value in turn.'),
          L(
            'while',
            2,
            'while S not empty and A[S.top] < A[i]',
            'While the value on top is smaller than this one,',
          ),
          L('answer', 3, 'ans[S.pop()] = A[i]', 'this one is its answer: pop it.'),
          L('push', 2, 'S.push(i)', 'Then wait on the stack for a bigger value.'),
          L(
            'rest',
            1,
            '// indices left on S keep ans = none',
            'Nothing bigger came after the rest.',
          ),
          L('ret', 1, 'return ans', 'Hand back the answers.'),
        ]
      : [
          L(
            'sig',
            0,
            'previousSmaller(A)',
            'To find the nearest smaller value left of each value:',
          ),
          L('init', 1, 'ans = [none] · n; S = empty stack', 'No answers yet, and an empty stack.'),
          L('loop', 1, 'for i = 0 to n − 1', 'Look at each value in turn.'),
          L(
            'while',
            2,
            'while S not empty and A[S.top] ≥ A[i]',
            'While the value on top is not smaller than this one,',
          ),
          L('pop', 3, 'S.pop()', 'it can never be an answer again: pop it.'),
          L(
            'answer',
            2,
            'ans[i] = A[S.top] if S not empty else none',
            'The value now on top is the answer.',
          ),
          L('push', 2, 'S.push(i)', 'Then this value waits on the stack.'),
          L('ret', 1, 'return ans', 'Hand back the answers.'),
        ];
  return [
    { op: 'scan', lines: scanLines },
    {
      op: 'histogram',
      lines: [
        L('hsig', 0, 'largestRectangle(H)', 'To find the largest rectangle under the bars:'),
        L('hinit', 1, 'best = 0; S = empty stack', 'Nothing measured yet.'),
        L('hloop', 1, 'for i = 0 to n   // H[n] = 0', 'Look at each bar, then one of height 0.'),
        L(
          'hwhile',
          2,
          'while S not empty and H[S.top] ≥ H[i]',
          'While the bar on top is at least as high as this one,',
        ),
        L(
          'hpop',
          3,
          'j = S.pop(); left = S.top + 1 if S not empty else 0',
          'pop it: its rectangle starts just after the bar under it',
        ),
        L(
          'harea',
          3,
          'best = max(best, H[j] · (i − left))',
          'and ends just before i. Keep the biggest area.',
        ),
        L('hpush', 2, 'if i < n: S.push(i)', 'Then this bar waits on the stack.'),
        L('hret', 1, 'return best', 'Hand back the largest area.'),
      ],
    },
  ];
}

export function initialSay(state: ArrayState, settings: StackSettings): string {
  return `A holds ${plural(state.a.length, 'value')}. Press Scan with the stack to find each value's ${ANSWER[settings.find]} value, or Largest rectangle. Load your own values to start over.`;
}

export const initialVars = (state: ArrayState) => ({ n: state.a.length });
