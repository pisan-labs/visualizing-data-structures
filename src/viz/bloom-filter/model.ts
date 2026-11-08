import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { familyHash, FAMILY_A, FAMILY_B, FAMILY_P } from '../_hashing/family';
import { MAX_KEY, readNumber } from '../_hashing/hashing';

export interface BloomState {
  m: number;
  k: number;
  /** The bit array B[0 … m − 1]. */
  bits: (0 | 1)[];
  /** The keys inserted so far, in order, each once. A real filter does not keep them; we do,
   * to tell a false positive from a true one. */
  keys: number[];
  /** Queries of keys that were never inserted, and how many of them answered "maybe". */
  absent: number;
  fp: number;
  /** The last measure(): false positives among all keys never inserted. */
  measured: { fp: number; absent: number } | null;
}

export interface BloomSettings {
  [key: string]: Scalar;
  m: number;
  k: number;
}

export interface BloomExtra {
  /** The key being worked on, in a box at the top left. */
  arg?: { text: string; error?: boolean };
  /** The current hash computation, under the key. */
  formula?: string;
  /** Which hashes (1-based) reached each bit in this operation. */
  hits?: Record<number, number[]>;
}

type S = BloomState;
type X = BloomExtra;
type Op = OpSpec<S, BloomSettings, X>;
type BloomStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: BloomSettings = { m: 16, k: 3 };

export function init(settings: BloomSettings): S {
  return {
    m: settings.m,
    k: settings.k,
    bits: Array(settings.m).fill(0),
    keys: [],
    absent: 0,
    fp: 0,
    measured: null,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const bitId = (j: number) => `bit-${j}`;
export const keyId = (x: number) => `key-${x}`;

/** The k bit positions of x, in the order h1, h2, … */
export const positions = (x: number, m: number, k: number): number[] =>
  Array.from({ length: k }, (_, i) => familyHash(i, x, m).value);

export const ones = (s: S) => s.bits.reduce<number>((a, b) => a + b, 0);

/** (1 − e^(−kn/m))^k, the textbook estimate of the false-positive rate. */
export const formulaRate = (n: number, m: number, k: number) => (1 - Math.exp((-k * n) / m)) ** k;

export const pct = (x: number) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;

function readouts(s: S): Record<string, Scalar> {
  const n = s.keys.length;
  const filled = ones(s);
  return {
    n,
    m: s.m,
    k: s.k,
    'bits set': filled,
    'formula p': pct(formulaRate(n, s.m, s.k)),
    'fill^k': pct((filled / s.m) ** s.k),
    measured: s.measured ? pct(s.measured.fp / Math.max(1, s.measured.absent)) : '–',
    'false +': `${s.fp} of ${s.absent}`,
  };
}

export function summary(s: S): string {
  const n = s.keys.length;
  return `n = ${n} ${n === 1 ? 'key' : 'keys'}, ${ones(s)} of ${s.m} bits set.`;
}

/** The other keys whose bits include bit j. */
export const ownersOf = (s: S, j: number, except?: number): number[] =>
  s.keys.filter((y) => y !== except && positions(y, s.m, s.k).includes(j));

const list = (xs: (string | number)[]): string =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

interface Ctx {
  s: S;
  extra: X;
  vars: Record<string, Scalar>;
}

function step(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): BloomStep {
  const extra: X = { ...c.extra };
  if (extra.hits)
    extra.hits = Object.fromEntries(Object.entries(extra.hits).map(([j, is]) => [j, [...is]]));
  return { state: c.s, marks, say, lines, vars: { ...c.vars, ...readouts(c.s) }, level, extra };
}

function* badArg(s: S, name: string, raw: Value, err: Error, line: string) {
  const c: Ctx = { s, extra: { arg: { text: String(raw), error: true } }, vars: {} };
  yield step(c, `${name}(${String(raw)}): ${err.message} The filter is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

// ---------------------------------------------------------------------------------------------
// insert

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s0, [raw]) {
    const x = readNumber(raw!);
    if (x instanceof Error) return yield* badArg(s0, 'insert', raw!, x, 'ins.sig');
    const again = s0.keys.includes(x);
    const hits: Record<number, number[]> = {};
    const c: Ctx = { s: s0, extra: { arg: { text: String(x) }, hits }, vars: { x } };
    yield step(
      c,
      again
        ? `insert(${x}): ${x} was inserted before, so its bits are set already. Setting them again changes nothing.`
        : `insert(${x}): work out the k = ${s0.k} hash values and set those ${s0.k} bits to 1.`,
      ['ins.sig'],
      2,
      [mark('arg-box', 'active')],
    );
    let s = again ? s0 : { ...s0, keys: [...s0.keys, x] };
    for (let i = 0; i < s.k; i++) {
      const h = familyHash(i, x, s.m);
      const j = h.value;
      const before = s.bits[j];
      const repeat = (hits[j] ?? []).length > 0;
      (hits[j] ??= []).push(i + 1);
      if (!before) s = { ...s, bits: s.bits.map((b, q) => (q === j ? 1 : b)) };
      c.s = s;
      c.vars.i = i + 1;
      c.vars.j = j;
      c.extra.formula = h.short;
      const owners = ownersOf(s0, j, x);
      const what = repeat
        ? `Bit ${j} again: an earlier hash of ${x} already set it.`
        : before
          ? `Bit ${j} is already 1${owners.length ? ` (set by ${list(owners)})` : ''}; it stays 1.`
          : `Bit ${j} was 0; set it to 1.`;
      const last = i === s.k - 1;
      yield step(
        c,
        `${h.say}. ${what}${last ? ` ${x} is in the filter. ${summary(s)}` : ''}`,
        ['ins.loop', 'ins.set'],
        last ? 1 : 2,
        [mark(bitId(j), before ? 'compare' : 'new'), ...(last ? [mark(keyId(x), 'new')] : [])],
      );
    }
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// query

const query: Op = {
  label: 'Query',
  arity: 1,
  *run(s0, [raw]) {
    const x = readNumber(raw!);
    if (x instanceof Error) return yield* badArg(s0, 'query', raw!, x, 'q.sig');
    const member = s0.keys.includes(x);
    const hits: Record<number, number[]> = {};
    const c: Ctx = { s: s0, extra: { arg: { text: String(x) }, hits }, vars: { x } };
    yield step(
      c,
      `query(${x}): check the ${s0.k} bits h1(${x}) … h${s0.k}(${x}). A single 0 proves ${x} was never inserted.`,
      ['q.sig'],
      2,
      [mark('arg-box', 'active')],
    );
    const seen: number[] = [];
    for (let i = 0; i < s0.k; i++) {
      const h = familyHash(i, x, s0.m);
      const j = h.value;
      (hits[j] ??= []).push(i + 1);
      seen.push(j);
      c.vars.i = i + 1;
      c.vars.j = j;
      c.extra.formula = h.short;
      if (!s0.bits[j]) {
        const s = { ...s0, absent: s0.absent + 1 };
        c.s = s;
        c.vars.answer = 'no';
        yield step(
          c,
          `${h.say}. Bit ${j} is 0. Every insert sets all of its bits, so ${x} was never inserted: definitely not in the set.`,
          ['q.loop', 'q.test', 'q.no'],
          1,
          [mark(bitId(j), 'error')],
        );
        return s;
      }
      if (i < s0.k - 1) {
        yield step(c, `${h.say}. Bit ${j} is 1, so far so good.`, ['q.loop', 'q.test'], 2, [
          mark(bitId(j), 'compare'),
        ]);
      }
    }
    // Every bit is 1.
    const h = familyHash(s0.k - 1, x, s0.m);
    const bits = [...new Set(seen)];
    c.vars.answer = 'maybe';
    if (member) {
      yield step(
        c,
        `${h.say}. Bit ${h.value} is 1 too. All ${s0.k} bits are 1, so the answer is "probably in the set". It is: ${x} was inserted.`,
        ['q.loop', 'q.test', 'q.yes'],
        1,
        [...bits.map((j) => mark(bitId(j), 'found')), mark(keyId(x), 'found')],
      );
      return s0;
    }
    const s = { ...s0, absent: s0.absent + 1, fp: s0.fp + 1 };
    c.s = s;
    const culprits = [...new Set(bits.flatMap((j) => ownersOf(s0, j)))];
    const who = bits.map((j) => `bit ${j} by ${list(ownersOf(s0, j))}`);
    yield step(
      c,
      `${h.say}. Bit ${h.value} is 1 too, so the answer is "probably in the set". But ${x} was never inserted: a false positive. Other keys set those bits: ${list(who)}.`,
      ['q.loop', 'q.test', 'q.yes'],
      1,
      [
        ...bits.map((j) => mark(bitId(j), 'error')),
        ...culprits.map((y) => mark(keyId(y), 'visit')),
      ],
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// delete: shown, not done

const remove: Op = {
  label: 'Try delete',
  arity: 1,
  *run(s, [raw]) {
    const x = readNumber(raw!);
    if (x instanceof Error) return yield* badArg(s, 'delete', raw!, x, 'del.sig');
    const hits: Record<number, number[]> = {};
    const c: Ctx = { s, extra: { arg: { text: String(x) }, hits }, vars: { x } };
    const member = s.keys.includes(x);
    yield step(
      c,
      `delete(${x}): a Bloom filter has no delete. Look at what clearing the bits of ${x} would do.`,
      ['del.sig'],
      2,
      [mark('arg-box', 'active')],
    );
    const pos = positions(x, s.m, s.k);
    for (let i = 0; i < s.k; i++) {
      const h = familyHash(i, x, s.m);
      const j = h.value;
      (hits[j] ??= []).push(i + 1);
      c.vars.i = i + 1;
      c.vars.j = j;
      c.extra.formula = h.short;
      const owners = ownersOf(s, j, x);
      yield step(
        c,
        `${h.say}. ${
          owners.length
            ? `Bit ${j} is also one of the bits of ${list(owners)}.`
            : s.bits[j]
              ? `No other key uses bit ${j}.`
              : `Bit ${j} is 0 already.`
        }`,
        ['del.loop', 'del.shared'],
        2,
        [mark(bitId(j), owners.length ? 'error' : 'compare')],
      );
    }
    const broken = s.keys.filter(
      (y) => y !== x && positions(y, s.m, s.k).some((j) => pos.includes(j)),
    );
    const head = member ? '' : `${x} was never inserted, so there is nothing to delete. `;
    const effect = broken.length
      ? `Clearing bits ${list([...new Set(pos)])} would make ${list(broken.map((y) => `query(${y})`))} answer "definitely not", although ${broken.length === 1 ? 'it was' : 'they were'} inserted: ${broken.length === 1 ? 'a false negative' : 'false negatives'}.`
      : `Here no other key uses those bits, but the filter cannot know that: it keeps only bits, not keys.`;
    yield step(
      c,
      `${head}${effect} So the filter stays as it is. A counting Bloom filter keeps a small counter in each position instead of a bit, so delete can subtract 1.`,
      ['del.no'],
      1,
      broken.map((y) => mark(keyId(y), 'error')),
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// measure

/** The keys never inserted that pass all k checks. */
export function falsePositives(s: S): { fp: number[]; absent: number } {
  const fp: number[] = [];
  let absent = 0;
  for (let x = 0; x <= MAX_KEY; x++) {
    if (s.keys.includes(x)) continue;
    absent++;
    if (positions(x, s.m, s.k).every((j) => s.bits[j])) fp.push(x);
  }
  return { fp, absent };
}

const measure: Op = {
  label: 'Measure',
  arity: 0,
  *run(s0) {
    const { fp, absent } = falsePositives(s0);
    const s: S = { ...s0, measured: { fp: fp.length, absent } };
    const n = s.keys.length;
    const c: Ctx = {
      s,
      extra: {
        formula: fp.length
          ? `false +: ${fp.slice(0, 4).join(', ')}${fp.length > 4 ? ', …' : ''}`
          : 'no false positives',
      },
      vars: {},
    };
    const rate = pct(fp.length / Math.max(1, absent));
    yield step(
      c,
      `measure(): query every key from 0 to ${MAX_KEY} that was never inserted. ${fp.length} of the ${absent} answer "probably in the set"${fp.length ? ` (${fp.slice(0, 3).join(', ')}${fp.length > 3 ? ', …' : ''})` : ''}: a measured false-positive rate of ${rate}. The formula (1 − e^(−kn/m))^k with n = ${n}, m = ${s.m}, k = ${s.k} predicts ${pct(formulaRate(n, s.m, s.k))}.`,
      ['meas.sig', 'meas.loop', 'meas.test', 'meas.rate'],
      1,
      [],
    );
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s0) {
    const s: S = { ...s0, bits: Array(s0.m).fill(0), keys: [], absent: 0, fp: 0, measured: null };
    yield step(
      { s, extra: {}, vars: {} },
      `clear(): every bit is 0 again, and no key is in the set.`,
      ['clr.sig', 'clr.set'],
      1,
      [],
    );
    return s;
  },
};

export const ops: Record<string, Op> = { insert, query, delete: remove, measure, clear };

// ---------------------------------------------------------------------------------------------
// pseudocode and text

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: BloomSettings): PseudoBlock[] {
  const k = settings.k;
  return [
    {
      op: 'insert',
      lines: [
        L('ins.sig', 0, 'insert(x)', 'To insert x:'),
        L('ins.loop', 1, `for i = 1 to k  // k = ${k}`, `for each of the ${k} hash functions,`),
        L('ins.set', 2, 'B[hᵢ(x)] = 1', 'set the bit it picks to 1.'),
      ],
    },
    {
      op: 'query',
      lines: [
        L('q.sig', 0, 'query(x)', 'To ask whether x is in the set:'),
        L('q.loop', 1, `for i = 1 to k  // k = ${k}`, `for each of the ${k} hash functions,`),
        L('q.test', 2, 'if B[hᵢ(x)] == 0', 'if the bit it picks is 0,'),
        L('q.no', 3, 'return false  // definitely not', 'x was never inserted: answer no.'),
        L('q.yes', 1, 'return true  // probably', 'Every bit is 1: answer "probably".'),
      ],
    },
    {
      op: 'delete',
      lines: [
        L('del.sig', 0, 'delete(x)  // not supported', 'Deleting x is not possible:'),
        L('del.loop', 1, `for i = 1 to k  // k = ${k}`, `look at each of its ${k} bits;`),
        L(
          'del.shared',
          2,
          'B[hᵢ(x)] may belong to other keys',
          'another key may need the same bit.',
        ),
        L('del.no', 1, 'error "cannot delete"', 'Clearing it could lose those keys, so stop.'),
      ],
    },
    {
      op: 'measure',
      lines: [
        L('meas.sig', 0, 'measure()', 'To measure the false-positive rate:'),
        L('meas.loop', 1, `for x = 0 to ${MAX_KEY}, x ∉ S`, 'for every key never inserted,'),
        L('meas.test', 2, 'if query(x): fp = fp + 1', 'count it if the filter says "probably".'),
        L('meas.rate', 1, 'return fp / |U − S|', 'The rate is that count over the number tried.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To empty the filter:'),
        L('clr.set', 1, 'B[0 … m − 1] = 0', 'set every bit to 0.'),
      ],
    },
  ];
}

export function hashList(k: number): string {
  return Array.from({ length: k }, (_, i) => `(${FAMILY_A[i]}, ${FAMILY_B[i]})`).join(', ');
}

export function initialSay(state: S): string {
  return `An empty Bloom filter: ${state.m} bits, all 0, and k = ${state.k} hash functions hᵢ(x) = ((aᵢ·x + bᵢ) mod ${FAMILY_P}) mod ${state.m}, with (aᵢ, bᵢ) = ${hashList(state.k)}.`;
}

export function initialVars(state: S) {
  return readouts(state);
}

export function describe(state: S): string {
  const set = state.bits.map((b, j) => (b ? j : -1)).filter((j) => j >= 0);
  const keys = state.keys.length
    ? ` Keys inserted: ${state.keys.join(', ')}.`
    : ' No keys inserted.';
  return `Bloom filter with ${state.m} bits and ${state.k} hash functions. ${
    set.length ? `Bits set: ${set.join(', ')}.` : 'Every bit is 0.'
  }${keys}`;
}
