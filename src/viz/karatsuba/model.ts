import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { callShapeId } from '../../layouts/calls';
import { L, mark, wholeArg } from '../_recursion/kit';

/** three: Karatsuba's three products. four: plain divide and conquer, four products. */
export type Split = 'three' | 'four';

export interface KaraSettings {
  [key: string]: Scalar;
  split: Split;
}

export const defaults: KaraSettings = { split: 'three' };

export const MAX = 9999;

/** Which product of its parent a call computes. */
export type Part = 'root' | 'ac' | 'bd' | 'sum' | 'ad' | 'bc';

export interface KCall {
  id: number;
  parent: number | null;
  part: Part;
  x: number;
  y: number;
  /** Split point (digits), or 0 for a base case. */
  m: number;
  a: number;
  b: number;
  c: number;
  d: number;
  result: number;
  children: number[];
}

export interface KaraState {
  split: Split;
  /** Every call the run makes, planned up front, in call order. */
  calls: KCall[];
  /** Calls started so far (ids 1..made) and the ones that returned. */
  made: number;
  returned: number[];
  /** The products each call got back from its children, by part. */
  got: Record<number, Partial<Record<Part, number>>>;
  /** The running call, or null. */
  current: number | null;
  /** Digit-by-digit products in the base cases so far. */
  digitMults: number;
  done: boolean;
}

type S = KaraState;
type KStep = Step<S, undefined>;
type Op = OpSpec<S, KaraSettings, undefined>;

export function init(st: KaraSettings): S {
  return {
    split: st.split,
    calls: [],
    made: 0,
    returned: [],
    got: {},
    current: null,
    digitMults: 0,
    done: false,
  };
}

export const digits = (v: number) => String(v).length;
export const isBase = (x: number, y: number) => x < 10 || y < 10;

/** Plan the calls of KARATSUBA(x, y) (or the four-product version), in call order. */
export function plan(x: number, y: number, split: Split): KCall[] {
  const calls: KCall[] = [];
  const go = (x: number, y: number, parent: number | null, part: Part): KCall => {
    const call: KCall = {
      id: calls.length + 1,
      parent,
      part,
      x,
      y,
      m: 0,
      a: 0,
      b: 0,
      c: 0,
      d: 0,
      result: x * y,
      children: [],
    };
    calls.push(call);
    if (isBase(x, y)) return call;
    const m = Math.floor(Math.max(digits(x), digits(y)) / 2);
    const p = 10 ** m;
    Object.assign(call, { m, a: Math.floor(x / p), b: x % p, c: Math.floor(y / p), d: y % p });
    const kids: [number, number, Part][] =
      split === 'three'
        ? [
            [call.a, call.c, 'ac'],
            [call.b, call.d, 'bd'],
            [call.a + call.b, call.c + call.d, 'sum'],
          ]
        : [
            [call.a, call.c, 'ac'],
            [call.a, call.d, 'ad'],
            [call.b, call.c, 'bc'],
            [call.b, call.d, 'bd'],
          ];
    for (const [u, v, part] of kids) call.children.push(go(u, v, call.id, part).id);
    return call;
  };
  go(x, y, null, 'root');
  return calls;
}

/** Digit products the schoolbook method makes: every digit of x times every digit of y. */
export const schoolbook = (x: number, y: number) => digits(x) * digits(y);

export const PART_TEXT: Record<Part, string> = {
  root: 'x·y',
  ac: 'a·c',
  bd: 'b·d',
  sum: '(a+b)(c+d)',
  ad: 'a·d',
  bc: 'b·c',
};

const pow10 = (k: number) => (k === 0 ? '1' : `10${k === 1 ? '' : '^' + k}`);

/** How call c combines its children's products: z1, then the result. */
export function combineText(c: KCall, got: Partial<Record<Part, number>>, split: Split) {
  const z2 = got.ac!;
  const z0 = got.bd!;
  const z1 = split === 'three' ? got.sum! - z2 - z0 : got.ad! + got.bc!;
  const z1Text =
    split === 'three'
      ? `z1 = (a+b)(c+d) − z2 − z0 = ${got.sum} − ${z2} − ${z0} = ${z1}`
      : `z1 = a·d + b·c = ${got.ad} + ${got.bc} = ${z1}`;
  return {
    z1,
    z1Text,
    sum: `${z2}·${pow10(2 * c.m)} + ${z1}·${pow10(c.m)} + ${z0} = ${c.result}`,
  };
}

function* run(x: number, y: number, split: Split): Generator<KStep, S, void> {
  const calls = plan(x, y, split);
  const s: S = {
    split,
    calls,
    made: 0,
    returned: [],
    got: {},
    current: null,
    digitMults: 0,
    done: false,
  };
  const snap = (): S => ({
    ...s,
    returned: [...s.returned],
    got: Object.fromEntries(Object.entries(s.got).map(([k, v]) => [k, { ...v }])),
  });
  const vars = (): Record<string, Scalar> => ({
    calls: s.made,
    'digit products': s.digitMults,
    schoolbook: schoolbook(x, y),
  });
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    ms: [string, MarkRole][] = [],
  ): KStep => ({
    state: snap(),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars: vars(),
    level,
  });
  const box = (id: number) => callShapeId(String(id));

  const visit = function* (id: number): Generator<KStep, void, void> {
    const c = calls[id - 1]!;
    s.made = id;
    s.current = id;
    const who = c.parent === null ? '' : `${PART_TEXT[c.part]} = `;
    if (c.m === 0) {
      s.digitMults += schoolbook(c.x, c.y);
      s.returned.push(id);
      if (c.parent !== null) s.got[c.parent] = { ...s.got[c.parent], [c.part]: c.result };
      yield step(
        `${who}${c.x}·${c.y}: ${c.x < 10 && c.y < 10 ? 'two single digits' : 'a single digit'}, the base case. Multiply directly: ${c.result}.`,
        ['base', 'direct'],
        2,
        [[box(id), 'found']],
      );
      return;
    }
    const p = 10 ** c.m;
    yield step(
      `${who}${c.x}·${c.y}: split at m = ${c.m} digits. x = ${c.a}·${p} + ${c.b} and y = ${c.c}·${p} + ${c.d}, so a = ${c.a}, b = ${c.b}, c = ${c.c}, d = ${c.d}.`,
      ['split'],
      2,
      [[box(id), 'active']],
    );
    for (const kid of c.children) {
      const k = calls[kid - 1]!;
      yield* visit(kid);
      s.current = id;
      yield step(
        `Back in ${c.x}·${c.y}: ${PART_TEXT[k.part]} = ${k.x}·${k.y} = ${k.result}.`,
        [lineOf(k.part)],
        3,
        [
          [box(id), 'active'],
          [box(kid), 'found'],
        ],
      );
    }
    const t = combineText(c, s.got[id]!, split);
    s.returned.push(id);
    if (c.parent !== null) s.got[c.parent] = { ...s.got[c.parent], [c.part]: c.result };
    yield step(`${c.x}·${c.y}: ${t.z1Text}. Shift and add: ${t.sum}.`, ['z1', 'ret'], 2, [
      [box(id), 'found'],
    ]);
  };

  yield* visit(1);
  s.current = null;
  s.done = true;
  const products = calls.filter((c) => c.m === 0).length;
  yield step(
    `${x}·${y} = ${x * y}. ${calls.length} ${calls.length === 1 ? 'call' : 'calls'}, ${products} base-case ${products === 1 ? 'product' : 'products'}, ${s.digitMults} digit products; the schoolbook method takes ${schoolbook(x, y)}.`,
    [],
    1,
    [[box(1), 'found']],
  );
  return snap();
}

export const lineOf = (part: Part) =>
  part === 'ac'
    ? 'z2'
    : part === 'bd'
      ? 'z0'
      : part === 'sum'
        ? 'zs'
        : part === 'ad'
          ? 'zad'
          : 'zbc';

const multiply: Op = {
  label: 'Multiply x·y',
  arity: 2,
  *run(s, [rx, ry], { settings }) {
    const x = wholeArg(rx, 0, MAX);
    const y = wholeArg(ry, 0, MAX);
    if (x === null || y === null) {
      yield {
        state: s,
        marks: [],
        say: `Type two whole numbers x and y from 0 to ${MAX}. Nothing was multiplied.`,
        lines: [],
        vars: { calls: 0 },
        level: 1,
      };
      return s;
    }
    return yield* run(x, y, settings.split);
  },
};

export const ops = { multiply };

export function pseudocode(st: KaraSettings): PseudoBlock[] {
  const three = st.split === 'three';
  const lines = [
    L('sig', 0, three ? 'KARATSUBA(x, y)' : 'MULTIPLY(x, y)', 'To multiply x by y:'),
    L('base', 1, 'if x < 10 or y < 10', 'If either one is a single digit,'),
    L('direct', 2, 'return x · y', 'multiply them directly.'),
    L(
      'split',
      1,
      'm = ⌊max(digits)/2⌋;  x = a·10^m + b;  y = c·10^m + d',
      'Otherwise cut both in two at m digits from the right.',
    ),
    L('z2', 1, `z2 = ${three ? 'KARATSUBA' : 'MULTIPLY'}(a, c)`, 'Multiply the high halves,'),
    L('z0', 1, `z0 = ${three ? 'KARATSUBA' : 'MULTIPLY'}(b, d)`, 'and the low halves.'),
  ];
  if (three) {
    lines.push(
      L(
        'zs',
        1,
        'zs = KARATSUBA(a + b, c + d)',
        'Multiply the two sums: one product instead of two,',
      ),
      L('z1', 1, 'z1 = zs − z2 − z0', 'because (a+b)(c+d) − ac − bd is ad + bc.'),
    );
  } else {
    lines.splice(
      5,
      0,
      L('zad', 1, 'p = MULTIPLY(a, d)', 'Multiply each high half by the other low half,'),
      L('zbc', 1, 'q = MULTIPLY(b, c)', 'both ways round.'),
    );
    lines.push(L('z1', 1, 'z1 = p + q', 'Add those two for the middle term.'));
  }
  lines.push(L('ret', 1, 'return z2·10^(2m) + z1·10^m + z0', 'Shift and add the three parts.'));
  return [{ op: 'multiply', lines }];
}

export function initialSay(_s: S, st: KaraSettings): string {
  return st.split === 'three'
    ? 'Type x and y (up to 4 digits) and press Multiply. Each split makes three smaller products instead of four.'
    : 'Type x and y (up to 4 digits) and press Multiply. This version makes four smaller products per split, like the schoolbook method.';
}

export function initialVars(): Record<string, Scalar> {
  return { calls: 0 };
}

export function describe(s: S): string {
  if (!s.calls.length) return 'Nothing multiplied yet.';
  const root = s.calls[0]!;
  const head = `${root.x}·${root.y}`;
  if (!s.done) return `${head}, in progress: ${s.made} of ${s.calls.length} calls made.`;
  return `${head} = ${root.result}, in ${s.calls.length} calls and ${s.digitMults} digit products.`;
}
