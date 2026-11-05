/**
 * Rabin-Karp: read each window of m characters as a number in radix d, reduced mod q. Compare
 * the window's hash t with the pattern's hash p; only when they agree compare the characters,
 * because different windows can share a remainder (a spurious hit). Moving to the next window
 * rolls the hash in O(1): drop the first character's weight h = d^(m-1) mod q, shift by d, add
 * the new character. The value lane under the text holds each window's hash.
 *
 * CLRS's defaults: d = 10 for a text of digits (each character is its digit) and 256 for other
 * text (each character is its code); q = 13, small enough that spurious hits are easy to see.
 */
import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import {
  foundText,
  initState,
  L,
  loadOp,
  mark,
  plural,
  q as quote,
  Run,
  searchOps,
  textId,
  type Engine,
  type Gen,
  type Hashing,
  type MatchExtra,
  type MatchState,
  type MatchStep,
} from '../_strings/kit';

export type Radix = 'auto' | '10' | '256';

export interface RkSettings {
  [key: string]: Scalar;
  radix: Radix;
  /** The modulus. */
  q: number;
}

export const defaults: RkSettings = { radix: 'auto', q: 13 };

type S = MatchState<null>;
type R = Run<null>;
type Op = OpSpec<S, RkSettings, MatchExtra>;

export const init = (): S => initState<null>();

const isDigits = (s: string) => /^[0-9]+$/.test(s);

/** The radix in use: d = 10 needs digits; automatic picks 10 for digits and 256 otherwise. */
export function radixOf(text: string, pattern: string, settings: RkSettings): 10 | 256 {
  if (settings.radix === '10') return 10;
  if (settings.radix === '256') return 256;
  return isDigits(text + pattern) ? 10 : 256;
}

/** A character's value: its digit with d = 10, its code with d = 256. */
export const valueOf = (c: string, d: number) => (d === 10 ? Number(c) : c.charCodeAt(0));

/** Mathematical mod: never negative. */
export const mod = (x: number, q: number) => ((x % q) + q) % q;

/** d^e mod q, one multiplication at a time. */
export function powMod(d: number, e: number, q: number): number {
  let r = 1 % q;
  for (let k = 0; k < e; k++) r = (r * d) % q;
  return r;
}

/** The hash of a whole string, by its definition (for tests and practice). */
export function hashOf(s: string, d: number, q: number): number {
  let h = 0;
  for (const c of s) h = mod(d * h + valueOf(c, d), q);
  return h;
}

/** "T[3] = 'A' (65)", or "T[3] = 5" for digits. */
function charText(name: string, i: number, c: string, d: number) {
  return d === 10 ? `${name}[${i}] = ${c}` : `${name}[${i}] = ${quote(c)} (${valueOf(c, d)})`;
}

const neg = (x: number) => (x < 0 ? `−${-x}` : String(x));

function vars(run: R, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  const hs = run.search?.hashing;
  return {
    ...more,
    ...(hs ? { p: hs.p } : {}),
    'hash checks': hs?.checks ?? 0,
    ...run.counters(),
    spurious: hs?.spurious.length ?? 0,
  };
}

// ----- Starting a search: h, then p and t0 by Horner's rule -----

function* start(run: R, settings: RkSettings): Gen<null, boolean> {
  const { n, m, text, pattern } = run;
  const again = run.restarted ? 'Start a new search. ' : '';
  if (settings.radix === '10' && !isDigits(text + pattern)) {
    const bad = [...(text + pattern)].find((c) => !/[0-9]/.test(c))!;
    yield run.step(
      `With d = 10, each character is a decimal digit, but ${quote(bad)} is not one. Choose d = 256 (character codes) or Automatic in the options, or load digits.`,
      ['sig'],
      1,
      [mark('t-name', 'error')],
      { d: 10, q: settings.q },
    );
    return false;
  }
  const d = radixOf(text, pattern, settings);
  const q = settings.q;
  if (m > n) {
    run.begin();
    yield run.step(
      `${again}P has ${plural(m, 'character')} and T only ${n}: P cannot occur, and there is no first window to hash.`,
      ['guard'],
      2,
      [],
      { d, q },
    );
    return true;
  }
  const h = powMod(d, m - 1, q);
  const hashing: Hashing = {
    d,
    q,
    h,
    p: 0,
    values: Array.from({ length: n - m + 1 }, () => null),
    checks: 0,
    spurious: [],
  };
  run.begin(hashing);
  const why =
    settings.radix === 'auto'
      ? d === 10
        ? 'T and P are all digits, so d = 10: each character is its digit'
        : 'T and P are not all digits, so d = 256: each character is its code'
      : d === 10
        ? 'd = 10: each character is its digit'
        : 'd = 256: each character is its code';
  yield run.step(
    `${again}${why}. The modulus is q = ${q}. h = d^(m − 1) mod q = ${d}^${m - 1} mod ${q} = ${h}: the weight of a window's first character.`,
    ['sig', 'h'],
    2,
    [],
    { d, q, h },
  );
  let p = 0;
  let t = 0;
  for (let i = 0; i < m; i++) {
    const pv = valueOf(pattern[i]!, d);
    const tv = valueOf(text[i]!, d);
    const p2 = mod(d * p + pv, q);
    const t2 = mod(d * t + tv, q);
    yield run.step(
      `i = ${i}: p = (${d} × ${p} + ${charText('P', i, pattern[i]!, d)}) mod ${q} = ${d * p + pv} mod ${q} = ${p2}, and t = (${d} × ${t} + ${charText('T', i, text[i]!, d)}) mod ${q} = ${d * t + tv} mod ${q} = ${t2}.`,
      i === 0 ? ['init', 'pre', 'horner'] : ['pre', 'horner'],
      3,
      [mark(textId(i), 'active'), mark(`r0-${i}`, 'active')],
      { d, q, h, i, p: p2, t: t2 },
    );
    p = p2;
    t = t2;
  }
  hashing.p = p;
  hashing.values[0] = t;
  run.s.next!.hash = t;
  yield run.step(
    `p = ${p} is the hash of P, and t₀ = ${t} is the hash of the first window, T[0..${m - 1}]. Now compare hashes, window by window.`,
    ['pre'],
    2,
    [mark('hv-0', 'new')],
    vars(run, { s: 0, t, d, q, h }),
  );
  return true;
}

// ----- One window -----

/** Roll t from the window at s to the one at s + 1, with the arithmetic in words. */
function roll(run: R, s: number, t: number): { t: number; say: string } {
  const { d, q, h } = run.s.hashing!;
  const { text, m } = run;
  const out = text[s]!;
  const inn = text[s + m]!;
  const a = t - valueOf(out, d) * h;
  const b = d * a + valueOf(inn, d);
  const next = mod(b, q);
  const say = `Roll the hash to the next window: drop ${charText('T', s, out, d)}, bring in ${charText('T', s + m, inn, d)}. t${sub(s + 1)} = (${d} × (${t} − ${valueOf(out, d)} × ${h}) + ${valueOf(inn, d)}) mod ${q} = (${d} × ${neg(a)} + ${valueOf(inn, d)}) mod ${q} = ${neg(b)} mod ${q} = ${next}.`;
  return { t: next, say };
}

/** Subscript digits: t₁₂. */
const sub = (k: number) => String(k).replace(/[0-9]/g, (c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]!);

function* attempt(run: R): Gen<null> {
  const { n, m, text, pattern } = run;
  const hs = run.s.hashing!;
  const live = run.enter();
  const s = live.s;
  const t = live.hash!;
  hs.checks++;
  yield run.step(
    `s = ${s}: compare the window's hash t${sub(s)} = ${t} with p = ${hs.p}.`,
    ['loop', 'hit'],
    3,
    [mark(`hv-${s}`, 'compare')],
    vars(run, { s, t }),
  );
  const last = s >= n - m;
  // The next window's hash is rolled when this one is done, not before.
  let rolled: { t: number; say: string } | null = null;
  const next = () => {
    rolled = last ? null : roll(run, s, t);
    if (rolled) hs.values[s + 1] = rolled.t;
    return rolled ? { s: s + 1, known: 0, by: { amount: 1 }, hash: rolled.t } : null;
  };
  const then = () => (rolled ? ` ${rolled.say}` : ' That was the last window.');
  const rollMarks = () =>
    rolled
      ? [mark(textId(s), 'remove'), mark(textId(s + m), 'new'), mark(`hv-${s + 1}`, 'new')]
      : [];
  const tNow = () => rolled?.t ?? t;

  if (t !== hs.p) {
    run.close('miss', next());
    yield run.step(
      `t${sub(s)} = ${t} ≠ p = ${hs.p}, so P cannot be at shift ${s}, and no character is compared.${then()}`,
      rolled ? ['hit', 'roll'] : ['hit'],
      2,
      rollMarks(),
      vars(run, { s, t: tNow() }),
    );
    return;
  }
  yield run.step(
    `t${sub(s)} = ${t} = p: a hash hit. Equal remainders do not prove equal windows, so compare the characters.`,
    ['hit', 'check'],
    2,
    [mark(`hv-${s}`, 'found')],
    vars(run, { s, t }),
  );
  let j = 0;
  for (; j < m; j++) {
    const i = s + j;
    const same = run.compare(j);
    yield run.step(
      same
        ? `T[${i}] = ${quote(text[i]!)} matches P[${j}].`
        : `T[${i}] = ${quote(text[i]!)} does not match P[${j}] = ${quote(pattern[j]!)}.`,
      ['check'],
      3,
      [mark(textId(i), 'compare')],
      vars(run, { s, t }),
      { pair: { i, j } },
    );
    if (!same) break;
  }
  if (j === m) {
    run.close('match', next());
    yield run.step(
      `All ${m} characters match: P occurs at shift ${s}.${then()}`,
      rolled ? ['add', 'roll'] : ['add'],
      1,
      [mark(`found-${s}`, 'found'), ...rollMarks()],
      vars(run, { s, t: tNow() }),
    );
    return;
  }
  hs.spurious.push(s);
  run.close('spurious', next());
  yield run.step(
    `T[${s + j}] ≠ P[${j}]: a spurious hit. The window and P only share a remainder mod ${hs.q}.${then()}`,
    rolled ? ['check', 'roll'] : ['check'],
    1,
    rollMarks(),
    vars(run, { s, t: tNow() }),
  );
}

function finish(run: R): MatchStep<null> {
  const s = run.s;
  const hs = s.hashing;
  const { n, m } = run;
  const where = s.found.length
    ? `P occurs at ${s.found.length === 1 ? 'shift' : 'shifts'} ${foundText(s.found)}`
    : 'P does not occur in T';
  const spur = hs?.spurious.length ?? 0;
  const work =
    m > n || !hs
      ? 'No window fits, so there was nothing to hash.'
      : `${plural(hs.checks, 'hash check')}, ${plural(spur, 'spurious hit')}${spur ? ` (at ${foundText(hs.spurious)})` : ''}, and ${plural(s.comparisons, 'character comparison')}.${spur ? ` A bigger q makes spurious hits rarer.` : ''}`;
  return run.step(
    `Done. ${where}. ${work}`,
    ['ret'],
    1,
    s.found.map((f) => mark(`found-${f}`, 'found')),
    vars(run),
  );
}

const engine: Engine<null, RkSettings> = { start, attempt, finish };

export const ops: Record<string, Op> = {
  load: loadOp<null, RkSettings>(),
  ...searchOps(engine),
};

// ----- Pseudocode -----

export function pseudocode(): PseudoBlock[] {
  const lines: PseudoLine[] = [
    L('sig', 0, 'rabinKarp(T, P, d, q)', 'To find every shift where P occurs in T:'),
    L('guard', 1, 'if m > n: return []', 'A pattern longer than the text cannot occur.'),
    L('h', 1, 'h = d^(m − 1) mod q', "h is the weight of a window's first character."),
    L('init', 1, 'p = 0; t = 0; found = []', 'Start both hashes at 0.'),
    L('pre', 1, 'for i = 0 to m − 1', 'Hash P and the first window, one character at a time:'),
    L(
      'horner',
      2,
      'p = (d·p + P[i]) mod q; t = (d·t + T[i]) mod q',
      'shift left one digit and add the next character, keeping only the remainder.',
    ),
    L('loop', 1, 'for s = 0 to n − m', 'For each shift,'),
    L('hit', 2, 'if p == t', 'if the hashes agree,'),
    L(
      'check',
      3,
      'if P[0..m − 1] == T[s..s + m − 1]',
      'compare the characters, since different windows can share a hash;',
    ),
    L('add', 4, 'append s to found', 'a real match.'),
    L(
      'roll',
      2,
      'if s < n − m: t = (d·(t − T[s]·h) + T[s + m]) mod q',
      'Roll the hash: drop the first character, shift, add the next one.',
    ),
    L('ret', 1, 'return found', 'Hand back every shift found.'),
  ];
  return [{ op: 'search', lines }];
}

export function initialSay(state: S, settings: RkSettings): string {
  const d = radixOf(state.text, state.pattern, settings);
  return `T = ${quote(state.text)} and P = ${quote(state.pattern)}. Rabin-Karp compares each window's hash with P's (d = ${d}, q = ${settings.q}) and checks the characters only on a hit. Press Search, or Load your own text and pattern.`;
}

export function initialVars(state: S, settings: RkSettings) {
  return { n: state.text.length, m: state.pattern.length, q: settings.q };
}
