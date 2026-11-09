/**
 * String hashing with a polynomial hash, h(s) = s[0]·b^(m−1) + s[1]·b^(m−2) + … + s[m−1]
 * mod p, with a = 1, b = 2, …, z = 26 (a is not 0, or "b" and "ab" would collide). The
 * highest power comes first (Horner's order, as in CLRS's Rabin-Karp), so:
 *
 * - build: prefix hashes H[k] = hash of s[0..k−1] (H[0] = 0, H[k+1] = H[k]·b + s[k]) and the
 *   powers b^k mod p, in O(n).
 * - hash(l, r): any substring's hash in O(1): H[r+1] − H[l]·b^(r−l+1). H[l] times b^len
 *   lines up with the first l digits of H[r+1], and subtracting leaves the substring.
 * - compare(i, j, len): two substrings are different for sure when their hashes differ; equal
 *   hashes mean equal strings or a collision. A small p makes collisions easy to find.
 * - windows(k): every window of length k by the rolling update (drop the first character's
 *   weight, shift by b, add the next one), grouping windows with equal hashes: real repeats
 *   and collisions.
 *
 * Double hashing (a setting) keeps a second hash mod p₂: a collision now needs both to agree.
 */
import type {
  Mark,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';

export interface HashSettings {
  [key: string]: Scalar;
  b: number;
  p: number;
  hashes: 'single' | 'double';
  p2: number;
}

export const defaults: HashSettings = { b: 31, p: 101, hashes: 'single', p2: 103 };

export const MAX_LEN = 16;
export const START = 'abracadabra';

export interface Windows {
  k: number;
  /** Hash of the window starting at w, per modulus; null until rolled to. */
  h: (number | null)[][];
}

export interface HashState {
  s: string;
  /** Prefix hashes H[0..n] and powers P[0..n] (b^k mod p), per modulus; null until built. */
  H: (number | null)[][];
  P: (number | null)[][];
  built: boolean;
  win: Windows | null;
}

export interface HashExtra {
  /** Substrings being hashed or compared: s[from..to]. */
  spans?: { id: 'span-1' | 'span-2'; from: number; to: number }[];
  /** The line the result box shows. */
  result?: { text: string; role?: Mark['role'] };
}

export type HashStep = Step<HashState, HashExtra>;
type Op = OpSpec<HashState, HashSettings, HashExtra>;
type Gen<R = void> = Generator<HashStep, R, void>;

export const val = (c: string) => c.charCodeAt(0) - 96;
export const mod = (x: number, q: number) => ((x % q) + q) % q;

/** The moduli in use: p, and p₂ with double hashing. */
export const moduli = (st: HashSettings): number[] =>
  st.hashes === 'double' ? [st.p, st.p2] : [st.p];

/** The hash of a whole string, by its definition (Horner's rule). */
export function hashOf(s: string, b: number, q: number): number {
  let h = 0;
  for (const c of s) h = mod(h * b + val(c), q);
  return h;
}

export function powMod(b: number, e: number, q: number): number {
  let r = 1 % q;
  for (let k = 0; k < e; k++) r = (r * b) % q;
  return r;
}

function fresh(s: string, m: number): HashState {
  const none = () => Array.from({ length: s.length + 1 }, () => null);
  return {
    s,
    H: Array.from({ length: m }, none),
    P: Array.from({ length: m }, none),
    built: false,
    win: null,
  };
}

export const init = (settings: HashSettings): HashState => fresh(START, moduli(settings).length);

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const q = (s: string) => `'${s}'`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One number per modulus: "53", or "53 and 12" with double hashing. */
const both = (xs: readonly number[]) => xs.join(' and ');
const pairText = (xs: readonly number[]) => (xs.length > 1 ? `(${xs.join(', ')})` : String(xs[0]));

// ----- Input -----

/** For the input box: a word (letters a to z) for Load, or a whole number for an index. */
export function parseInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a word, such as abracadabra, or a number.');
  if (/^\d+$/.test(t)) {
    const v = Number(t);
    return v > 999 ? new Error(`${t} is too big for an index or a length.`) : v;
  }
  if (!/^[A-Za-z]+$/.test(t))
    return new Error(`"${t}" has something other than letters. Use the letters a to z.`);
  if (t.length > MAX_LEN) return new Error(`Keep the word to ${MAX_LEN} letters.`);
  return t.toLowerCase();
}

/** A whole-number argument from lo to hi, or a sentence saying what is wrong. */
function num(arg: Value | undefined, lo: number, hi: number, what: string): number | string {
  if (typeof arg !== 'number' || !Number.isInteger(arg))
    return `Type ${what} as a whole number, not ${q(String(arg ?? ''))}.`;
  if (arg < lo || arg > hi) return `${what} must be from ${lo} to ${hi}, not ${arg}.`;
  return arg;
}

function refuse(s: HashState, why: string): HashStep {
  return {
    state: s,
    marks: [],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: s.s.length },
  };
}

// ----- The working copy -----

class Run {
  st: HashState;
  constructor(
    s: HashState,
    readonly settings: HashSettings,
  ) {
    this.st = structuredClone(s);
  }
  get n() {
    return this.st.s.length;
  }
  get ms() {
    return moduli(this.settings);
  }
  step(
    say: string,
    lines: string[],
    level: 1 | 2 | 3,
    marks: Mark[] = [],
    vars: Record<string, Scalar> = {},
    extra?: HashExtra,
  ): HashStep {
    const { b, p } = this.settings;
    return {
      state: structuredClone(this.st),
      marks,
      say,
      lines,
      level,
      vars: { b, p, ...(this.ms.length > 1 ? { 'p₂': this.ms[1]! } : {}), ...vars },
      ...(extra ? { extra } : {}),
    };
  }
  /** Substring hash from the prefix hashes, per modulus. */
  sub(l: number, r: number): number[] {
    return this.ms.map((m, t) =>
      mod(this.st.H[t]![r + 1]! - this.st.H[t]![l]! * this.st.P[t]![r - l + 1]!, m),
    );
  }
}

// ----- build: prefix hashes and powers -----

function* build(run: Run, again: boolean): Gen {
  const { b } = run.settings;
  const ms = run.ms;
  const n = run.n;
  const s = run.st.s;
  run.st = fresh(s, ms.length);
  ms.forEach((_, t) => {
    run.st.H[t]![0] = 0;
    run.st.P[t]![0] = 1 % ms[t]!;
  });
  yield run.step(
    `${again ? 'Build again. ' : ''}H[k] will be the hash of the first k characters, so H[0] = 0, the empty prefix. b⁰ = 1.`,
    ['binit'],
    2,
    [mark('H-0', 'new'), mark('P-0', 'new')],
    { k: 0 },
  );
  for (let i = 0; i < n; i++) {
    const v = val(s[i]!);
    const parts = ms.map((m, t) => {
      const h = run.st.H[t]![i]!;
      const raw = h * b + v;
      const next = raw % m;
      run.st.H[t]![i + 1] = next;
      run.st.P[t]![i + 1] = (run.st.P[t]![i]! * b) % m;
      return { h, raw, next, m };
    });
    const say =
      `H[${i + 1}] = (H[${i}]·b + ${q(s[i]!)}) mod p = (${parts[0]!.h}·${b} + ${v}) mod ${parts[0]!.m} = ${parts[0]!.next}` +
      (parts[1]
        ? `; mod p₂ = ${parts[1].m}, (${parts[1].h}·${b} + ${v}) mod ${parts[1].m} = ${parts[1].next}`
        : '') +
      `. And b^${i + 1} mod p = ${run.st.P[0]![i + 1]}.`;
    yield run.step(
      say,
      ['bloop', 'bh', 'bp'],
      2,
      [
        mark(`s-${i}`, 'active'),
        mark(`H-${i}`, 'compare'),
        mark(`H-${i + 1}`, 'new'),
        mark(`P-${i + 1}`, 'new'),
      ],
      { k: i + 1, [`H[${i + 1}]`]: pairText(parts.map((x) => x.next)) },
    );
  }
  run.st.built = true;
}

const buildOp: Op = {
  label: 'Build prefix hashes',
  arity: 0,
  *run(s, _a, { settings }) {
    const run = new Run(s, settings);
    yield* build(run, s.built);
    yield run.step(
      `Built ${plural(run.n + 1, 'prefix hash', 'prefix hashes')} in one pass, O(n). Now the hash of any substring takes O(1): press Hash substring.`,
      ['bret'],
      1,
      [],
      { result: run.st.H.map((h) => h.join(' ')).join(' | ') },
    );
    return run.st;
  },
};

/** Build first if the prefix hashes are missing. */
function* ensureBuilt(run: Run): Gen {
  if (!run.st.built) yield* build(run, false);
}

// ----- hash(l, r) -----

const hashOp: Op = {
  label: 'Hash substring',
  arity: 2,
  *run(s, [a1, a2], { settings }) {
    const n = s.s.length;
    const l = num(a1, 0, n - 1, 'The start');
    if (typeof l === 'string') return yield* refuseGen(s, l);
    const r = num(a2, l, n - 1, 'The end');
    if (typeof r === 'string') return yield* refuseGen(s, r);
    const run = new Run(s, settings);
    yield* ensureBuilt(run);
    const len = r - l + 1;
    const sub = run.st.s.slice(l, r + 1);
    const hs = run.sub(l, r);
    const span = { spans: [{ id: 'span-1' as const, from: l, to: r }] };
    const marks = [
      mark(`H-${r + 1}`, 'compare'),
      mark(`H-${l}`, 'compare'),
      mark(`P-${len}`, 'compare'),
    ];
    const { b } = settings;
    const A = run.st.H[0]![r + 1]!;
    const B = run.st.H[0]![l]!;
    const C = run.st.P[0]![len]!;
    yield run.step(
      `hash(s[${l}..${r}]) = (H[${r + 1}] − H[${l}]·b^${len}) mod p. H[${l}] is the hash of the ${plural(l, 'character')} before ${q(sub)}; times b^${len} its digits line up with the start of H[${r + 1}], so subtracting leaves only ${q(sub)}.`,
      ['hsig', 'hget'],
      2,
      marks,
      { l, r, len },
      span,
    );
    const direct = run.ms.map((m) => hashOf(sub, b, m));
    yield run.step(
      `= (${A} − ${B}·${C}) mod ${settings.p} = ${mod(A - B * C, settings.p)}${hs.length > 1 ? `, and ${hs[1]} mod p₂` : ''}. Hashing ${q(sub)} directly gives ${both(direct)} too, but that takes ${plural(len, 'step')}; this took one.`,
      ['hget'],
      1,
      [...marks, mark('result', 'found')],
      { l, r, len, hash: pairText(hs) },
      { ...span, result: { text: `hash(${q(sub)}) = ${pairText(hs)}`, role: 'found' } },
    );
    return run.st;
  },
};

function* refuseGen(s: HashState, why: string): Gen<HashState> {
  yield refuse(s, why);
  return s;
}

// ----- compare(i, j, len) -----

const compareOp: Op = {
  label: 'Compare',
  arity: 3,
  *run(s, [a1, a2, a3], { settings }) {
    const n = s.s.length;
    const i = num(a1, 0, n - 1, 'The first start');
    if (typeof i === 'string') return yield* refuseGen(s, i);
    const j = num(a2, 0, n - 1, 'The second start');
    if (typeof j === 'string') return yield* refuseGen(s, j);
    const len = num(a3, 1, n - Math.max(i, j), 'The length');
    if (typeof len === 'string') return yield* refuseGen(s, len);
    const run = new Run(s, settings);
    yield* ensureBuilt(run);
    const x = run.st.s.slice(i, i + len);
    const y = run.st.s.slice(j, j + len);
    const hx = run.sub(i, i + len - 1);
    const hy = run.sub(j, j + len - 1);
    const spans = {
      spans: [
        { id: 'span-1' as const, from: i, to: i + len - 1 },
        { id: 'span-2' as const, from: j, to: j + len - 1 },
      ],
    };
    const hashMarks = (a: number) => [
      mark(`H-${a + len}`, 'compare'),
      mark(`H-${a}`, 'compare'),
      mark(`P-${len}`, 'compare'),
    ];
    yield run.step(
      `First substring: hash(s[${i}..${i + len - 1}]) = (H[${i + len}] − H[${i}]·b^${len}) mod p = ${pairText(hx)}.`,
      ['csig', 'chash'],
      2,
      [mark('span-1', 'active'), ...hashMarks(i)],
      { i, j, len, 'hash 1': pairText(hx) },
      spans,
    );
    yield run.step(
      `Second substring: hash(s[${j}..${j + len - 1}]) = (H[${j + len}] − H[${j}]·b^${len}) mod p = ${pairText(hy)}.`,
      ['chash'],
      2,
      [mark('span-2', 'visit'), ...hashMarks(j)],
      { i, j, len, 'hash 1': pairText(hx), 'hash 2': pairText(hy) },
      spans,
    );
    const same = hx.every((v, t) => v === hy[t]);
    const vars = { i, j, len, 'hash 1': pairText(hx), 'hash 2': pairText(hy) };
    if (!same) {
      yield run.step(
        `${pairText(hx)} ≠ ${pairText(hy)}: the substrings are different, for certain. Equal strings always have equal hashes, so a hash check never says "different" by mistake.`,
        ['cdiff'],
        1,
        [mark('span-1', 'active'), mark('span-2', 'visit'), mark('result', 'error')],
        { ...vars, result: 'different' },
        {
          ...spans,
          result: { text: `${pairText(hx)} ≠ ${pairText(hy)}: different`, role: 'error' },
        },
      );
      return run.st;
    }
    if (x === y) {
      yield run.step(
        `${pairText(hx)} = ${pairText(hy)}, and the characters agree: ${q(x)} = ${q(y)}. Equal hashes do not prove it; a program that trusts them takes the risk of a collision.`,
        ['csame', 'ccheck'],
        1,
        [mark('span-1', 'found'), mark('span-2', 'found'), mark('result', 'found')],
        { ...vars, result: 'equal' },
        { ...spans, result: { text: `${pairText(hx)} = ${pairText(hy)}: equal`, role: 'found' } },
      );
      return run.st;
    }
    const space = moduli(settings).reduce((a, m) => a * m, 1);
    yield run.step(
      `${pairText(hx)} = ${pairText(hy)}, but ${q(x)} ≠ ${q(y)}: a collision. There are only ${space} possible hash values, so different strings must share some. A bigger p${settings.hashes === 'single' ? ', or a second hash,' : ''} makes it rarer.`,
      ['csame', 'ccheck', 'ccoll'],
      1,
      [mark('span-1', 'error'), mark('span-2', 'error'), mark('result', 'error')],
      { ...vars, result: 'collision' },
      {
        ...spans,
        result: { text: `${pairText(hx)} = ${pairText(hy)}: a collision!`, role: 'error' },
      },
    );
    return run.st;
  },
};

// ----- windows(k): the rolling hash of every window -----

const windowsOp: Op = {
  label: 'Hash every window',
  arity: 1,
  *run(s, [arg], { settings }) {
    const n = s.s.length;
    const k = num(arg, 1, n, 'The window length');
    if (typeof k === 'string') return yield* refuseGen(s, k);
    const run = new Run(s, settings);
    const { b } = settings;
    const ms = run.ms;
    const str = run.st.s;
    const count = n - k + 1;
    run.st.win = { k, h: ms.map(() => Array.from({ length: count }, () => null)) };
    const win = run.st.win;
    const top = ms.map((m) => powMod(b, k - 1, m));
    const first = ms.map((m) => hashOf(str.slice(0, k), b, m));
    ms.forEach((_, t) => (win.h[t]![0] = first[t]!));
    const w0 = str.slice(0, k);
    yield run.step(
      `Hash every window of ${k} characters. The first, ${q(w0)}, by Horner's rule: ${pairText(first)}. Its first character weighs b^${k - 1} mod p = ${pairText(top)}; keep that for rolling.`,
      ['wsig', 'wtop', 'wfirst'],
      2,
      [mark('w-0', 'new')],
      { k, 'b^(k−1)': pairText(top), hash: pairText(first) },
      { spans: [{ id: 'span-1', from: 0, to: k - 1 }] },
    );
    for (let w = 1; w < count; w++) {
      const out = str[w - 1]!;
      const inn = str[w + k - 1]!;
      const prev = ms.map((_, t) => win.h[t]![w - 1]!);
      const next = ms.map((m, t) => mod((prev[t]! - val(out) * top[t]!) * b + val(inn), m));
      ms.forEach((_, t) => (win.h[t]![w] = next[t]!));
      const m0 = ms[0]!;
      yield run.step(
        `Roll to ${q(str.slice(w, w + k))}: drop ${q(out)} (${val(out)} × ${top[0]}), shift by b, add ${q(inn)} (${val(inn)}). ((${prev[0]} − ${val(out)}·${top[0]})·${b} + ${val(inn)}) mod ${m0} = ${next[0]}${ms.length > 1 ? `, and ${next[1]} mod p₂` : ''}.`,
        ['wroll', 'wupdate'],
        2,
        [mark(`s-${w - 1}`, 'remove'), mark(`s-${w + k - 1}`, 'new'), mark(`w-${w}`, 'new')],
        { k, 'b^(k−1)': pairText(top), w, hash: pairText(next) },
        { spans: [{ id: 'span-1', from: w, to: w + k - 1 }] },
      );
    }
    // Group the windows by hash: real repeats and collisions.
    const key = (w: number) => ms.map((_, t) => win.h[t]![w]).join(',');
    const groups = new Map<string, number[]>();
    for (let w = 0; w < count; w++) groups.set(key(w), [...(groups.get(key(w)) ?? []), w]);
    const shared = [...groups.values()].filter((g) => g.length > 1);
    const repeats = shared.filter((g) =>
      g.some((w) => g.some((v) => v !== w && str.slice(v, v + k) === str.slice(w, w + k))),
    );
    const collisions = shared.filter((g) => new Set(g.map((w) => str.slice(w, w + k))).size > 1);
    const describeGroup = (g: number[]) =>
      `${g.map((w) => `${q(str.slice(w, w + k))} at ${w}`).join(', ')}`;
    const kind = (g: number[]) => {
      const distinct = new Set(g.map((w) => str.slice(w, w + k))).size;
      return distinct === 1
        ? 'a real repeat'
        : distinct < g.length
          ? 'a repeat and a collision'
          : 'a collision';
    };
    const say = shared.length
      ? `Done: ${plural(count, 'window')}, each rolled in O(1). Same hash: ${shared.map((g) => `${describeGroup(g)} (${kind(g)})`).join('; ')}.`
      : `Done: ${plural(count, 'window')}, each rolled in O(1), and no two share a hash, so no substring of length ${k} repeats.`;
    yield run.step(say, ['wret'], 1, [], {
      k,
      windows: count,
      repeats: repeats.length,
      collisions: collisions.length,
      result: ms.map((_, t) => win.h[t]!.join(' ')).join(' | '),
    });
    return run.st;
  },
};

// ----- load -----

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg], { settings }) {
    const word = typeof arg === 'string' ? arg.trim().toLowerCase() : '';
    const bad =
      typeof arg !== 'string'
        ? `Type a word to hash, such as abracadabra, not ${arg}.`
        : !/^[a-z]+$/.test(word)
          ? `"${arg}" has something other than letters. Use the letters a to z.`
          : word.length > MAX_LEN
            ? `Keep the word to ${MAX_LEN} letters.`
            : '';
    if (bad) {
      yield { ...refuse(s, bad), say: `Nothing loaded. ${bad} The string stays ${q(s.s)}.` };
      return s;
    }
    const next = fresh(word, moduli(settings).length);
    yield {
      state: next,
      marks: [],
      say: `s = ${q(word)}, ${plural(word.length, 'character')}. Press Build prefix hashes, or go straight to Hash substring or Compare.`,
      lines: [],
      level: 1,
      vars: { n: word.length, b: settings.b, p: settings.p },
    };
    return next;
  },
};

export const ops: Record<string, Op> = {
  load,
  build: buildOp,
  hash: hashOp,
  compare: compareOp,
  windows: windowsOp,
};

export function pseudocode(settings: HashSettings): PseudoBlock[] {
  const dbl = settings.hashes === 'double';
  const also = (text: string) => (dbl ? `${text}   // and again mod p₂` : text);
  return [
    {
      op: 'build',
      lines: [
        L('bsig', 0, 'build(s, b, p)', 'To hash every prefix of s:'),
        L('binit', 1, also('H[0] = 0; P[0] = 1'), 'The empty prefix hashes to 0; b⁰ = 1.'),
        L('bloop', 1, 'for k = 0 to n − 1', 'For each character in turn,'),
        L(
          'bh',
          2,
          also('H[k + 1] = (H[k]·b + s[k]) mod p'),
          'shift the hash one digit left and add the character,',
        ),
        L('bp', 2, also('P[k + 1] = P[k]·b mod p'), 'and keep the next power of b.'),
        L('bret', 1, 'return H, P', 'Hand back both tables.'),
      ],
    },
    {
      op: 'hash',
      lines: [
        L('hsig', 0, 'hash(l, r)   // s[l..r]', 'To hash the substring from l to r:'),
        L(
          'hget',
          1,
          also('return (H[r + 1] − H[l]·P[r − l + 1]) mod p'),
          'take the prefix through r and subtract the prefix before l, shifted to line up.',
        ),
      ],
    },
    {
      op: 'compare',
      lines: [
        L('csig', 0, 'equal(i, j, len)', 'To compare two substrings of the same length:'),
        L('chash', 1, also('x = hash(i, i + len − 1); y = hash(j, j + len − 1)'), 'hash both.'),
        L('cdiff', 1, 'if x ≠ y: return false', 'Different hashes: certainly different.'),
        L('csame', 1, 'return true', 'Equal hashes: almost certainly equal.'),
        L('ccheck', 1, '// optional: check the characters', 'To be sure, compare the characters.'),
        L(
          'ccoll',
          1,
          '// equal hashes, different strings: a collision',
          'If they differ, it was a collision.',
        ),
      ],
    },
    {
      op: 'windows',
      lines: [
        L('wsig', 0, 'windows(s, k)', 'To hash every window of k characters:'),
        L(
          'wtop',
          1,
          also('top = b^(k − 1) mod p'),
          "top is the weight of a window's first character.",
        ),
        L('wfirst', 1, also('h = hash of s[0..k − 1] by Horner'), 'Hash the first window.'),
        L('wroll', 1, 'for w = 1 to n − k', 'Then roll to each next window:'),
        L(
          'wupdate',
          2,
          also('h = ((h − s[w − 1]·top)·b + s[w + k − 1]) mod p'),
          'drop the first character, shift, and add the new one.',
        ),
        L('wret', 1, 'return every h', 'Windows with equal h are repeats or collisions.'),
      ],
    },
  ];
}

export function initialSay(state: HashState, settings: HashSettings): string {
  return `s = ${q(state.s)}. Each letter is a number (a = 1, …, z = 26), and h(s) reads s as a number in base b = ${settings.b}, mod p = ${settings.p}. Press Build prefix hashes, or Load your own word.`;
}

export const initialVars = (state: HashState, settings: HashSettings) => ({
  n: state.s.length,
  b: settings.b,
  p: settings.p,
});

export function describe(state: HashState): string {
  const head = `s = ${state.s}.`;
  const H = state.built
    ? ` Prefix hashes H: ${state.H[0]!.join(', ')}.`
    : ' Prefix hashes not built.';
  const W = state.win
    ? ` Hashes of the windows of ${state.win.k}: ${state.win.h[0]!.map((x) => x ?? 'not yet').join(', ')}.`
    : '';
  return head + H + W;
}
