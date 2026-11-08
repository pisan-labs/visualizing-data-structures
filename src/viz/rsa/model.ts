import type { MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { L, mark, wholeArg } from '../_recursion/kit';
import { extendedRows, gcd, type EuRow } from '../euclid/model';
import { powSteps, type PowState } from '../mod-pow/model';

/** euler: φ(n) = (p − 1)(q − 1), as in CLRS. carmichael: λ(n) = lcm(p − 1, q − 1), as in PKCS #1. */
export type Totient = 'euler' | 'carmichael';

export interface RsaSettings {
  [key: string]: Scalar;
  phi: Totient;
}

export const defaults: RsaSettings = { phi: 'euler' };

export const MAX_PRIME = 97;

export interface RsaKeys {
  p: number;
  q: number;
  n: number;
  /** φ(n) or λ(n), whichever the settings use. */
  phi: number;
  totient: Totient;
  e: number;
  d: number;
}

export interface RsaState {
  /** Keys made so far (null fields are not worked out yet), or null before the first. */
  keys: { [K in keyof RsaKeys]: RsaKeys[K] | null } | null;
  /** The e values tried, with gcd(e, φ) for each. */
  tried: { e: number; g: number }[];
  /** Extended Euclid on (φ, e) to find d: the rows shown so far, and how many there will be. */
  euRows: EuRow[];
  euTotal: number;
  /** The last encryption or decryption: square-and-multiply. */
  work: { kind: 'encrypt' | 'decrypt'; pow: PowState } | null;
  /** The message, its ciphertext, and what decryption gave back. */
  m: number | null;
  c: number | null;
  back: number | null;
  /** The part of the picture the last operation used. */
  focus: 'keys' | 'pow' | null;
}

type S = RsaState;
type RsaStep = Step<S, undefined>;
type Op = OpSpec<S, RsaSettings, undefined>;

export function init(): S {
  return {
    keys: null,
    tried: [],
    euRows: [],
    euTotal: 0,
    work: null,
    m: null,
    c: null,
    back: null,
    focus: null,
  };
}

export const isPrime = (k: number) => {
  if (k < 2) return false;
  for (let d = 2; d * d <= k; d++) if (k % d === 0) return false;
  return true;
};

const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

export const totientOf = (p: number, q: number, t: Totient) =>
  t === 'euler' ? (p - 1) * (q - 1) : lcm(p - 1, q - 1);

export const phiName = (t: Totient) => (t === 'euler' ? 'φ(n)' : 'λ(n)');

/** The smallest e > 1 with gcd(e, φ) = 1, or null. */
export function smallestE(phi: number): number | null {
  for (let e = 2; e < phi; e++) if (gcd(e, phi) === 1) return e;
  return null;
}

/** d = e⁻¹ mod φ, from extended Euclid on (φ, e): φ·x + e·y = 1, so d = y mod φ. */
export function inverseOf(e: number, phi: number): number {
  const rows = extendedRows(phi, e);
  return (((rows[0]!.y! % phi) + phi) % phi) % phi;
}

const snapOf = (s: S): S => ({
  ...s,
  keys: s.keys && { ...s.keys },
  tried: s.tried.map((t) => ({ ...t })),
  euRows: s.euRows.map((r) => ({ ...r })),
});

function makeStep(
  s: S,
  say: string,
  lines: string[],
  level: 1 | 2 | 3,
  ms: [string, MarkRole][] = [],
): RsaStep {
  const k = s.keys;
  const vars: Record<string, Scalar> = {
    n: k?.n ?? null,
    [k ? phiName(k.totient!) : 'φ(n)']: k?.phi ?? null,
    e: k?.e ?? null,
    d: k?.d ?? null,
  };
  if (s.m !== null) vars.m = s.m;
  if (s.c !== null) vars.c = s.c;
  return {
    state: snapOf(s),
    marks: ms.map(([id, role]) => mark(id, role)),
    say,
    lines,
    vars,
    level,
  };
}

const reject = (s: S, say: string): RsaStep => makeStep(s, say, [], 1);

/** Find d for the keys' e: extended Euclid on (φ, e), row by row, then back up. */
function* findD(s: S, keys: NonNullable<S['keys']>): Generator<RsaStep, void, void> {
  const phi = keys.phi!;
  const e = keys.e!;
  const rows = extendedRows(phi, e);
  s.euTotal = rows.length;
  s.euRows = [];
  const name = phiName(keys.totient!);
  s.focus = 'keys';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    s.euRows.push({ ...r, x: null, y: null });
    yield makeStep(
      s,
      i === 0
        ? `d is the inverse of e mod ${name}. Run extended Euclid on (${phi}, ${e}).`
        : r.b === 0
          ? `b is 0: the gcd is ${r.a}${r.a === 1 ? ', so an inverse exists' : ''}.`
          : `(${r.a}, ${r.b}): ${rows[i - 1]!.a} mod ${rows[i - 1]!.b} = ${r.b}.`,
      ['d'],
      3,
      [[`eu-${i}-a`, 'active']],
    );
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    s.euRows[i] = { ...r };
    yield makeStep(
      s,
      `Back-substitute: x = ${r.x}, y = ${r.y}, and ${r.a}·${r.x} + ${r.b}·${r.y} = 1.`,
      ['d'],
      3,
      [
        [`eu-${i}-x`, 'new'],
        [`eu-${i}-y`, 'new'],
      ],
    );
  }
  const y = rows[0]!.y!;
  keys.d = ((y % phi) + phi) % phi;
  yield makeStep(
    s,
    `${phi}·${par(rows[0]!.x!)} + ${e}·${par(y)} = 1, so ${e}·${par(y)} ≡ 1 (mod ${phi}), and d = ${y} mod ${phi} = ${keys.d}. Check: ${e}·${keys.d} = ${e * keys.d} = ${Math.floor((e * keys.d) / phi)}·${phi} + 1.`,
    ['d'],
    2,
    [
      ['key-d', 'new'],
      ['eu-0-y', 'found'],
    ],
  );
}

const par = (v: number) => (v < 0 ? `(${v})` : String(v));

function insecure(k: NonNullable<S['keys']>) {
  return `Toy sizes: anyone can factor n = ${k.n} = ${k.p}·${k.q} in a blink and work out d exactly as we did. Real keys use primes of 1024 bits or more.`;
}

const keysOp: Op = {
  label: 'Make keys from p and q',
  arity: 2,
  *run(s, [rp, rq], { settings }) {
    const p = wholeArg(rp, 0, 9999);
    const q = wholeArg(rq, 0, 9999);
    if (p === null || q === null || !isPrime(p) || !isPrime(q) || p > MAX_PRIME || q > MAX_PRIME) {
      yield reject(
        s,
        `p and q must be primes from 2 to ${MAX_PRIME}${p !== null && p > 1 && !isPrime(p) ? `, and ${p} = ${factorText(p)} is not prime` : q !== null && q > 1 && !isPrime(q) ? `, and ${q} = ${factorText(q)} is not prime` : ''}. No keys were made.`,
      );
      return s;
    }
    if (p === q) {
      yield reject(
        s,
        `p and q must be different: with n = ${p}², anyone takes the square root and has p. No keys were made.`,
      );
      return s;
    }
    const t = settings.phi;
    const phi = totientOf(p, q, t);
    const e = smallestE(phi);
    if (e === null) {
      yield reject(
        s,
        `${phiName(t)} = ${phi} is too small: no e with 1 < e < ${phi} is coprime to it. Pick bigger primes.`,
      );
      return s;
    }
    const n = p * q;
    // The Euclid table for d keeps its room from the start, so the drawing holds still.
    const st: S = { ...init(), focus: 'keys', euTotal: extendedRows(phi, e).length };
    st.keys = { p, q, n: null, phi: null, totient: t, e: null, d: null };
    const k = st.keys;
    yield makeStep(st, `p = ${p} and q = ${q} are prime. Keep them secret.`, ['pq'], 2, [
      ['key-p', 'active'],
      ['key-q', 'active'],
    ]);
    k.n = n;
    yield makeStep(st, `n = p·q = ${p}·${q} = ${n}. n is public: everyone gets it.`, ['n'], 2, [
      ['key-n', 'new'],
    ]);
    k.phi = phi;
    yield makeStep(
      st,
      t === 'euler'
        ? `φ(n) = (p − 1)(q − 1) = ${p - 1}·${q - 1} = ${phi}: how many numbers below n share no factor with it. Only someone who knows p and q can compute it.`
        : `λ(n) = lcm(p − 1, q − 1) = lcm(${p - 1}, ${q - 1}) = ${phi}. It divides φ(n) = ${(p - 1) * (q - 1)}, so d can come out smaller, and it works just as well.`,
      ['phi'],
      2,
      [['key-phi', 'new']],
    );
    for (let c = 2; c <= e; c++) {
      const g = gcd(c, phi);
      st.tried.push({ e: c, g });
      if (c < e)
        yield makeStep(
          st,
          `Try e = ${c}: gcd(${c}, ${phi}) = ${g}, not 1, so ${c} has no inverse mod ${phi}. Next.`,
          ['e'],
          3,
          [[`try-${st.tried.length - 1}`, 'error']],
        );
    }
    k.e = e;
    yield makeStep(
      st,
      `e = ${e}: gcd(${e}, ${phi}) = 1. The public key is (e, n) = (${e}, ${n}).`,
      ['e'],
      2,
      [
        ['key-e', 'new'],
        [`try-${st.tried.length - 1}`, 'found'],
      ],
    );
    yield* findD(st, k);
    yield makeStep(
      st,
      `Keys ready. Public (e, n) = (${e}, ${n}); private (d, n) = (${k.d}, ${n}). ${insecure(k)}`,
      [],
      1,
      [
        ['key-pub', 'found'],
        ['key-priv', 'found'],
      ],
    );
    return snapOf(st);
  },
};

function factorText(k: number): string {
  for (let d = 2; d * d <= k; d++) if (k % d === 0) return `${d}·${k / d}`;
  return String(k);
}

const useE: Op = {
  label: 'Use this e',
  arity: 1,
  *run(s, [re]) {
    const k = s.keys;
    if (!k || k.d === null) {
      yield reject(s, 'Make keys first: type p and q and press Make keys.');
      return s;
    }
    const e = wholeArg(re, 0, 99999);
    const phi = k.phi!;
    const name = phiName(k.totient!);
    if (e === null || e <= 1 || e >= phi) {
      yield reject(
        s,
        `e must be a whole number with 1 < e < ${name} = ${phi}. The keys stay as they were.`,
      );
      return s;
    }
    const g = gcd(e, phi);
    if (g !== 1) {
      yield reject(
        s,
        `gcd(${e}, ${phi}) = ${g}, not 1: e must be coprime to ${name}, or it has no inverse and nobody could decrypt. The keys stay as they were.`,
      );
      return s;
    }
    const st: S = snapOf(s);
    st.keys = { ...k, e, d: null };
    st.tried = [{ e, g: 1 }];
    st.euRows = [];
    st.euTotal = extendedRows(phi, e).length;
    st.focus = 'keys';
    st.work = null;
    st.m = st.c = st.back = null;
    yield makeStep(
      st,
      `e = ${e}: gcd(${e}, ${phi}) = 1, so e has an inverse. Find the new d.`,
      ['e'],
      2,
      [['key-e', 'new']],
    );
    yield* findD(st, st.keys);
    yield makeStep(st, `New keys: public (${e}, ${k.n}), private (${st.keys.d}, ${k.n}).`, [], 1, [
      ['key-pub', 'found'],
      ['key-priv', 'found'],
    ]);
    return snapOf(st);
  },
};

function cryptOp(kind: 'encrypt' | 'decrypt'): Op {
  return {
    label: kind === 'encrypt' ? 'Encrypt m' : 'Decrypt c',
    arity: 1,
    *run(s, [raw]) {
      const k = s.keys;
      if (!k || k.d === null) {
        yield reject(s, 'Make keys first: type p and q and press Make keys.');
        return s;
      }
      const n = k.n!;
      const x = wholeArg(raw, 0, 99999);
      const what = kind === 'encrypt' ? 'The message m' : 'The ciphertext c';
      if (x === null || x >= n) {
        yield reject(
          s,
          `${what} must be a whole number from 0 to ${n - 1}, less than n = ${n}: the arithmetic is mod n, so ${x !== null && x >= n ? `${x} would come back as ${x % n}` : 'anything bigger wraps around'}. Nothing was done.`,
        );
        return s;
      }
      const exp = kind === 'encrypt' ? k.e! : k.d!;
      const st: S = snapOf(s);
      st.focus = 'pow';
      if (kind === 'encrypt') {
        st.m = x;
        st.c = null;
        st.back = null;
      } else {
        st.c = x;
        st.back = null;
      }
      const name = kind === 'encrypt' ? 'm' : 'c';
      const gen = powSteps(x, exp, n, 'ltr');
      const intro =
        kind === 'encrypt'
          ? `Encrypt m = ${x} with the public key: c = m^e mod n = ${x}^${exp} mod ${n}, by square-and-multiply.`
          : `Decrypt c = ${x} with the private key: m = c^d mod n = ${x}^${exp} mod ${n}. Only the holder of d can do this.`;
      let first = true;
      let r = gen.next();
      let last: PowState | null = null;
      while (!r.done) {
        const ps = r.value;
        st.work = { kind, pow: ps.state };
        last = ps.state;
        if (!ps.state.done) {
          yield {
            ...makeStep(st, first ? intro : ps.say, ['pow'], first ? 2 : 3, []),
            marks: ps.marks,
          };
          first = false;
        }
        r = gen.next();
      }
      const out = last!.result!;
      if (kind === 'encrypt') st.c = out;
      else st.back = out;
      yield makeStep(
        st,
        kind === 'encrypt'
          ? `c = ${x}^${exp} mod ${n} = ${out}. Anyone may send ${out}; without d it says nothing about ${x}. (Unpadded textbook RSA, though: the same m always gives the same c.)`
          : st.m !== null && out === st.m
            ? `m = ${x}^${exp} mod ${n} = ${out}: the message is back. It works because e·d ≡ 1 (mod ${phiName(k.totient!)}), so m^(ed) ≡ m (mod n).`
            : `m = ${x}^${exp} mod ${n} = ${out}.`,
        [name === 'm' ? 'enc' : 'dec'],
        1,
        [[kind === 'encrypt' ? 'msg-c' : 'msg-back', 'found']],
      );
      return snapOf(st);
    },
  };
}

export const ops = { keys: keysOp, useE, encrypt: cryptOp('encrypt'), decrypt: cryptOp('decrypt') };

export function pseudocode(st: RsaSettings): PseudoBlock[] {
  const euler = st.phi === 'euler';
  return [
    {
      op: 'keys',
      lines: [
        L(
          'pq',
          0,
          'pick distinct primes p, q',
          'Pick two different primes p and q, and keep them secret.',
        ),
        L('n', 0, 'n = p · q', 'Multiply them: n is public.'),
        euler
          ? L(
              'phi',
              0,
              'φ = (p − 1)(q − 1)',
              'Work out φ(n), the count of numbers below n coprime to n.',
            )
          : L(
              'phi',
              0,
              'λ = lcm(p − 1, q − 1)',
              'Work out λ(n), the least common multiple of p − 1 and q − 1.',
            ),
        L(
          'e',
          0,
          `pick e with gcd(e, ${euler ? 'φ' : 'λ'}) = 1`,
          'Pick a small e that shares no factor with it.',
        ),
        L(
          'd',
          0,
          `d = e⁻¹ mod ${euler ? 'φ' : 'λ'}  (extended Euclid)`,
          'Find d with e·d = 1 mod it, by extended Euclid.',
        ),
      ],
    },
    {
      op: 'useE',
      lines: [
        L(
          'e',
          0,
          `require gcd(e, ${euler ? 'φ' : 'λ'}) = 1`,
          'Check that the new e shares no factor with it.',
        ),
        L(
          'd',
          0,
          `d = e⁻¹ mod ${euler ? 'φ' : 'λ'}  (extended Euclid)`,
          'Find the new d by extended Euclid.',
        ),
      ],
    },
    {
      op: 'encrypt',
      lines: [
        L('pow', 0, 'require 0 ≤ m < n', 'The message must be a number below n.'),
        L(
          'enc',
          0,
          'c = m^e mod n  (square-and-multiply)',
          'Raise it to e, mod n: anyone can do this with the public key.',
        ),
      ],
    },
    {
      op: 'decrypt',
      lines: [
        L('pow', 0, 'require 0 ≤ c < n', 'The ciphertext is a number below n.'),
        L(
          'dec',
          0,
          'm = c^d mod n  (square-and-multiply)',
          'Raise it to d, mod n: only the holder of d can.',
        ),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'Type two small primes p and q (for example 61 53) and press Make keys. Then encrypt a number below n, and decrypt it.';
}

export function initialVars(): Record<string, Scalar> {
  return { n: null, e: null, d: null };
}

export function describe(s: S): string {
  const k = s.keys;
  if (!k) return 'No keys yet.';
  const parts = [
    `p = ${k.p}, q = ${k.q}${k.n !== null ? `, n = ${k.n}` : ''}${k.phi !== null ? `, ${phiName(k.totient!)} = ${k.phi}` : ''}${k.e !== null ? `, e = ${k.e}` : ''}${k.d !== null ? `, d = ${k.d}` : ''}.`,
  ];
  if (s.m !== null) parts.push(`Message ${s.m}.`);
  if (s.c !== null) parts.push(`Ciphertext ${s.c}.`);
  if (s.back !== null) parts.push(`Decrypted ${s.back}.`);
  return parts.join(' ');
}
