/**
 * Embeddings and similarity (SLP3, the chapter on embeddings): words as vectors, here in two
 * dimensions and set by hand so the picture can be read. Similar words point the same way.
 *
 *   dot(a, b) = a.x·b.x + a.y·b.y
 *   |a|       = √(a.x² + a.y²)
 *   cos(a, b) = dot(a, b) / (|a|·|b|)      (the cosine of the angle between them)
 *
 * The nearest k words to a target come from brute force: score every word, and keep the best k
 * seen so far in a min-heap whose root is the weakest of them (src/viz/binary-heap/), so each
 * newcomer needs one comparison to be turned away. Θ(N log k) for N words.
 *
 * Settings
 *   measure    'cosine' (SLP3's default) or 'dot' (the raw dot product, which rewards length)
 *   normalize  scale every vector to length 1 first; then the dot product equals the cosine
 *   k          how many neighbours to keep (1 to 5)
 *
 * Operations: nearest(w), similarity(a, b), analogy(a, b, c): a − b + c, then the nearest k to
 * it, leaving out a, b and c, as the usual analogy test does (Mikolov et al. 2013).
 *
 * Ties: a higher score is better; on equal scores the word earlier in the vocabulary wins. The
 * code tabs order their heaps the same way.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { two } from '../_lm/numbers';

export type Vec2 = readonly [number, number];

export interface Word {
  w: string;
  v: Vec2;
}

/**
 * The words, made by hand: people to the right, animals up and to the left, food below. Young
 * animals are short arrows in the direction of their parents; king and queen are longer arrows
 * than man and woman, and queen − king is about woman − man.
 */
export const WORDS: readonly Word[] = [
  { w: 'man', v: [2.4, 0.6] },
  { w: 'woman', v: [1.6, 1.6] },
  { w: 'king', v: [3.6, 1.2] },
  { w: 'queen', v: [2.5, 2.6] },
  { w: 'cat', v: [-2, 3.2] },
  { w: 'kitten', v: [-1.1, 1.5] },
  { w: 'dog', v: [-1.4, 4] },
  { w: 'puppy', v: [-0.4, 1.9] },
  { w: 'fox', v: [-2.6, 1.6] },
  { w: 'apple', v: [0.8, -2] },
  { w: 'bread', v: [1.6, -1.8] },
  { w: 'cake', v: [0.3, -1.6] },
];

export const MAX_K = 5;

export type Measure = 'cosine' | 'dot';

export interface EmbSettings {
  [key: string]: Scalar;
  measure: Measure;
  normalize: boolean;
  k: number;
}

export const defaults: EmbSettings = { measure: 'cosine', normalize: false, k: 3 };

export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const norm = (a: Vec2): number => Math.sqrt(a[0] * a[0] + a[1] * a[1]);
export const cosine = (a: Vec2, b: Vec2): number => dot(a, b) / (norm(a) * norm(b));
export const unit = (a: Vec2): Vec2 => {
  const n = norm(a);
  return [a[0] / n, a[1] / n];
};
export const sim = (a: Vec2, b: Vec2, m: Measure): number =>
  m === 'cosine' ? cosine(a, b) : dot(a, b);
/** The angle between two vectors, in degrees. */
export const angleBetween = (a: Vec2, b: Vec2): number =>
  (Math.acos(Math.max(-1, Math.min(1, cosine(a, b)))) * 180) / Math.PI;

/** The vectors the operations use: as made, or scaled to length 1. */
export const vectors = (s: EmbState, set: EmbSettings): Vec2[] =>
  s.vocab.map((x) => (set.normalize ? unit(x.v) : x.v));

export interface Kept {
  /** Index into the vocabulary. */
  i: number;
  s: number;
}

/** Whether a is a weaker neighbour than b: a lower score, or the same score and a later word. */
export const weaker = (a: Kept, b: Kept): boolean => a.s < b.s || (a.s === b.s && a.i > b.i);

export interface Search {
  kind: 'nearest' | 'analogy';
  /** The words named: one for nearest, three (a, b, c) for an analogy. */
  words: number[];
  target: Vec2;
  /** "kitten" or "king − man + woman". */
  label: string;
  /** Score of each word against the target; null for a word left out or not scored yet. */
  scores: (number | null)[];
  /** The k nearest, best first. */
  top: Kept[];
}

export interface Pair {
  kind: 'similarity';
  a: number;
  b: number;
  dot: number;
  la: number;
  lb: number;
  cos: number;
}

export type Query = Search | Pair;

export interface EmbState {
  vocab: Word[];
  /** The last finished query, drawn until the next. */
  query?: Query;
}

/** What one step of a search shows. */
export interface SearchWork {
  search: Search;
  heap: Kept[];
  /** The word being scored. */
  at?: number;
  /** Analogy arrows drawn so far: 1 = a, 2 = a − b, 3 = a − b + c. */
  path: number;
}

export interface PairWork {
  pair: Pair;
  stage: 'dot' | 'len' | 'cos';
}

export interface EmbExtra {
  search?: SearchWork;
  pair?: PairWork;
}

type S = EmbState;
type X = EmbExtra;
type Op = OpSpec<S, EmbSettings, X>;
type EStep = Step<S, X>;

export function init(): S {
  return { vocab: WORDS.map((x) => ({ w: x.w, v: x.v })) };
}

// ---------------------------------------------------------------------------------------------
// Words in narration

export const vid = (s: S, i: number) => `v-${s.vocab[i]!.w}`;
const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const vecText = (v: Vec2) => `(${two(v[0])}, ${two(v[1])})`;
const signed = (x: number) => (x < 0 ? `(${two(x)})` : two(x));
const measureName = (m: Measure) => (m === 'cosine' ? 'cosine similarity' : 'dot product');
const simName = (m: Measure) => (m === 'cosine' ? 'cos' : 'dot');

export function findWord(s: S, w: unknown): number {
  return s.vocab.findIndex((x) => x.w === String(w).toLowerCase());
}

export const kOf = (set: EmbSettings) => Math.max(1, Math.min(MAX_K, Math.round(set.k)));

function unknownStep(s: S, w: unknown, set: EmbSettings): EStep {
  return {
    state: s,
    marks: [],
    say: `"${String(w)}" is not one of the ${s.vocab.length} words here. Try one of: ${s.vocab.map((x) => x.w).join(', ')}.`,
    lines: [],
    level: 1,
    vars: baseVars(s, set),
  };
}

export function baseVars(s: S, set: EmbSettings): Record<string, Scalar> {
  return { N: s.vocab.length, k: kOf(set) };
}

/** The arithmetic of one score, for narration. */
function scoreText(a: Vec2, b: Vec2, m: Measure): string {
  const d = `${signed(a[0])} × ${signed(b[0])} + ${signed(a[1])} × ${signed(b[1])}`;
  if (m === 'dot') return `${d} = ${two(dot(a, b))}`;
  return `${two(dot(a, b))} / (${two(norm(a))} × ${two(norm(b))}) = ${two(cosine(a, b))}`;
}

// ---------------------------------------------------------------------------------------------
// The search: brute force with a min-heap of the best k

function* searchSteps(
  s: S,
  set: EmbSettings,
  base: Omit<Search, 'scores' | 'top'>,
  vars: () => Record<string, Scalar>,
  count: { n: number },
): Generator<EStep, Search, void> {
  const vs = vectors(s, set);
  const k = kOf(set);
  const m = set.measure;
  const n = s.vocab.length;
  const skip = new Set(base.words);
  const scores: (number | null)[] = Array<number | null>(n).fill(null);
  const heap: Kept[] = [];
  const name = (i: number) => s.vocab[i]!.w;
  const label = base.label;
  const tmark = base.kind === 'nearest' ? vid(s, base.words[0]!) : 'tgt';
  const snap = (at?: number): X => ({
    search: {
      search: { ...base, scores: [...scores], top: [] },
      heap: heap.map((e) => ({ ...e })),
      at,
      path: base.kind === 'analogy' ? 3 : 0,
    },
  });
  const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[], at?: number) => ({
    state: s,
    marks,
    say,
    lines,
    level,
    vars: { ...vars(), kept: heap.length },
    extra: snap(at),
  });
  const hmark = (e: Kept, role: Mark['role']) => mark(`hn-${name(e.i)}`, role);

  const others = n - skip.size;
  yield step(
    `Score each of the other ${others} words against ${label} and keep the best ${k} in a min-heap: the weakest of the ${k} sits on top, so one comparison with the top decides whether a newcomer gets in.`,
    ['heap'],
    2,
    [mark(tmark, 'active')],
  );

  const swapUp = function* (p: number): Generator<EStep, void, void> {
    while (p > 0) {
      const parent = (p - 1) >> 1;
      if (!weaker(heap[p]!, heap[parent]!)) return;
      const [c, q] = [heap[p]!, heap[parent]!];
      [heap[p], heap[parent]] = [q, c];
      yield step(
        `${name(c.i)} (${two(c.s)}) is weaker than its parent ${name(q.i)} (${two(q.s)}): swap them, so the weakest stays on top.`,
        ['push'],
        3,
        [hmark(c, 'active'), hmark(q, 'compare')],
      );
      p = parent;
    }
  };
  const swapDown = function* (): Generator<EStep, void, void> {
    let p = 0;
    for (;;) {
      let w = p;
      for (const c of [2 * p + 1, 2 * p + 2])
        if (c < heap.length && weaker(heap[c]!, heap[w]!)) w = c;
      if (w === p) return;
      const [a, b] = [heap[p]!, heap[w]!];
      [heap[p], heap[w]] = [b, a];
      yield step(
        `${name(a.i)} (${two(a.s)}) is stronger than its child ${name(b.i)} (${two(b.s)}): swap them, so the weakest rises to the top.`,
        ['replace'],
        3,
        [hmark(a, 'active'), hmark(b, 'compare')],
      );
      p = w;
    }
  };

  for (let i = 0; i < n; i++) {
    if (skip.has(i)) continue;
    const sc = sim(base.target, vs[i]!, m);
    scores[i] = sc;
    count.n++;
    const e: Kept = { i, s: sc };
    const what = `${simName(m)}(${label}, ${name(i)}) = ${scoreText(base.target, vs[i]!, m)}`;
    const seen = [mark(vid(s, i), 'compare'), mark(`tr-${i}`, 'active'), mark(tmark, 'active')];
    if (heap.length < k) {
      heap.push(e);
      yield step(
        `${what}. The heap has room: push ${name(i)} (${heap.length} of ${k} kept).`,
        ['score', 'room', 'push'],
        2,
        [...seen, hmark(e, 'new')],
        i,
      );
      yield* swapUp(heap.length - 1);
    } else if (weaker(heap[0]!, e)) {
      const out = heap[0]!;
      heap[0] = e;
      yield step(
        `${what}, better than the weakest kept, ${name(out.i)} (${two(out.s)}). ${name(out.i)} leaves; ${name(i)} takes the top and sifts down.`,
        ['score', 'beats', 'replace'],
        2,
        [...seen, hmark(e, 'new')],
        i,
      );
      yield* swapDown();
    } else {
      yield step(
        `${what}, no better than the weakest kept, ${name(heap[0]!.i)} (${two(heap[0]!.s)}). Skip it.`,
        ['score', 'beats'],
        3,
        [...seen, hmark(heap[0]!, 'compare')],
        i,
      );
    }
  }

  const top = [...heap].sort((a, b) => (weaker(a, b) ? 1 : weaker(b, a) ? -1 : 0));
  return { ...base, scores, top };
}

function topText(s: S, top: readonly Kept[]): string {
  return top.map((e) => `${s.vocab[e.i]!.w} ${two(e.s)}`).join(', ');
}

const nearestOp: Op = {
  label: 'Nearest',
  arity: 1,
  *run(s, args, { settings }) {
    const a = findWord(s, args[0]);
    if (a < 0) {
      yield unknownStep(s, args[0], settings);
      return s;
    }
    const k = kOf(settings);
    const count = { n: 0 };
    const vars = () => ({ ...baseVars(s, settings), scores: count.n });
    const target = vectors(s, settings)[a]!;
    const search = yield* searchSteps(
      s,
      settings,
      { kind: 'nearest', words: [a], target, label: s.vocab[a]!.w },
      vars,
      count,
    );
    const next: S = { ...s, query: search };
    yield {
      state: next,
      marks: [mark(vid(s, a), 'active'), ...search.top.map((e) => mark(vid(s, e.i), 'found'))],
      say:
        k === 1
          ? `The nearest word to ${s.vocab[a]!.w} by ${measureName(settings.measure)}: ${topText(s, search.top)}. Brute force scored all ${count.n} other words.`
          : `The ${k} nearest to ${s.vocab[a]!.w} by ${measureName(settings.measure)}, best first: ${topText(s, search.top)} (pop the heap, weakest first, and reverse). Brute force scored all ${count.n} other words.`,
      lines: ['ret'],
      level: 1,
      vars: { ...vars(), kept: search.top.length },
    };
    return next;
  },
};

const similarityOp: Op = {
  label: 'Similarity',
  arity: 2,
  *run(s, args, { settings }) {
    const a = findWord(s, args[0]);
    const b = findWord(s, args[1]);
    if (a < 0 || b < 0) {
      yield unknownStep(s, a < 0 ? args[0] : args[1], settings);
      return s;
    }
    const vs = vectors(s, settings);
    const [va, vb] = [vs[a]!, vs[b]!];
    const pair: Pair = {
      kind: 'similarity',
      a,
      b,
      dot: dot(va, vb),
      la: norm(va),
      lb: norm(vb),
      cos: cosine(va, vb),
    };
    const [na, nb] = [s.vocab[a]!.w, s.vocab[b]!.w];
    const marks = [mark(vid(s, a), 'active'), mark(vid(s, b), 'compare')];
    const vars = (extra: Record<string, Scalar> = {}) => ({ ...baseVars(s, settings), ...extra });
    const work = (stage: PairWork['stage']): X => ({ pair: { pair, stage } });
    yield {
      state: s,
      marks,
      say: `The dot product: multiply the matching coordinates and add. ${na} · ${nb} = ${signed(va[0])} × ${signed(vb[0])} + ${signed(va[1])} × ${signed(vb[1])} = ${two(pair.dot)}.`,
      lines: ['dot'],
      level: 2,
      vars: vars({ dot: two(pair.dot) }),
      extra: work('dot'),
    };
    yield {
      state: s,
      marks,
      say: `The lengths: |${na}| = √(${signed(va[0])}² + ${signed(va[1])}²) = ${two(pair.la)}, and |${nb}| = ${two(pair.lb)}.${settings.normalize ? ' Both are 1: the vectors were normalized.' : ''}`,
      lines: ['len'],
      level: 2,
      vars: vars({ dot: two(pair.dot) }),
      extra: work('len'),
    };
    const deg = angleBetween(va, vb);
    yield {
      state: s,
      marks,
      say: `The cosine divides out the lengths: ${two(pair.dot)} / (${two(pair.la)} × ${two(pair.lb)}) = ${two(pair.cos)}. That is the cosine of the angle between the arrows, ${deg.toFixed(0)}°: 1 for the same direction, 0 at right angles, −1 for opposite.`,
      lines: ['cos'],
      level: 2,
      vars: vars({ dot: two(pair.dot), cos: two(pair.cos) }),
      extra: work('cos'),
    };
    const next: S = { ...s, query: pair };
    const which =
      settings.measure === 'cosine'
        ? `their cosine similarity is ${two(pair.cos)}; the dot product, ${two(pair.dot)}, would also count how long the arrows are.`
        : `by the dot product their similarity is ${two(pair.dot)}: direction and length together. The cosine, ${two(pair.cos)}, counts direction only.`;
    yield {
      state: next,
      marks,
      say: `${na} and ${nb}: ${which}`,
      lines: ['ret2'],
      level: 1,
      vars: vars({ dot: two(pair.dot), cos: two(pair.cos) }),
    };
    return next;
  },
};

const analogyOp: Op = {
  label: 'Analogy',
  arity: 3,
  *run(s, args, { settings }) {
    const ids = args.map((x) => findWord(s, x));
    const bad = ids.findIndex((i) => i < 0);
    if (bad >= 0) {
      yield unknownStep(s, args[bad], settings);
      return s;
    }
    const [a, b, c] = ids as [number, number, number];
    const vs = vectors(s, settings);
    const [va, vb, vc] = [vs[a]!, vs[b]!, vs[c]!];
    const mid: Vec2 = [va[0] - vb[0], va[1] - vb[1]];
    const t: Vec2 = [mid[0] + vc[0], mid[1] + vc[1]];
    const [na, nb, nc] = [s.vocab[a]!.w, s.vocab[b]!.w, s.vocab[c]!.w];
    const label = `${na} − ${nb} + ${nc}`;
    const count = { n: 0 };
    const vars = () => ({ ...baseVars(s, settings), scores: count.n });
    const base: Omit<Search, 'scores' | 'top'> = {
      kind: 'analogy',
      words: [a, b, c],
      target: t,
      label,
    };
    const n = s.vocab.length;
    const blank = (path: number): X => ({
      search: {
        search: { ...base, scores: Array<number | null>(n).fill(null), top: [] },
        heap: [],
        path,
      },
    });
    yield {
      state: s,
      marks: [mark(vid(s, a), 'active'), mark('p-a', 'active')],
      say: `"${nb} is to ${na} as ${nc} is to what?" Start at ${na}, ${vecText(va)}.`,
      lines: ['start'],
      level: 2,
      vars: vars(),
      extra: blank(1),
    };
    yield {
      state: s,
      marks: [mark(vid(s, b), 'compare'), mark('p-b', 'active')],
      say: `Subtract ${nb}: ${vecText(va)} − ${vecText(vb)} = ${vecText(mid)}. What is left is the step from ${nb} to ${na}.`,
      lines: ['start'],
      level: 2,
      vars: vars(),
      extra: blank(2),
    };
    if (norm(t) === 0) {
      yield {
        state: s,
        marks: [mark('tgt', 'error')],
        say: `Add ${nc}: the sum is (0, 0), the origin. A cosine with the zero vector is undefined, so there is no nearest word.`,
        lines: ['start'],
        level: 1,
        vars: vars(),
        extra: blank(3),
      };
      return s;
    }
    yield {
      state: s,
      marks: [mark(vid(s, c), 'compare'), mark('p-c', 'active'), mark('tgt', 'active')],
      say: `Add ${nc}: ${vecText(mid)} + ${vecText(vc)} = ${vecText(t)}. If the step from ${nb} to ${na} means the same thing everywhere, the answer is the word nearest this point.`,
      lines: ['start'],
      level: 2,
      vars: vars(),
      extra: blank(3),
    };
    const search = yield* searchSteps(s, settings, base, vars, count);
    const next: S = { ...s, query: search };
    const best = search.top[0];
    // What the nearest word would be if a, b and c were allowed, for narration.
    let any = -1;
    for (let i = 0; i < n; i++) {
      const e = { i, s: sim(t, vs[i]!, settings.measure) };
      if (any < 0 || weaker({ i: any, s: sim(t, vs[any]!, settings.measure) }, e)) any = i;
    }
    const input = [a, b, c].includes(any)
      ? ` Without that rule the answer would be ${s.vocab[any]!.w} itself.`
      : '';
    yield {
      state: next,
      marks: [
        mark('tgt', 'active'),
        ...(best ? [mark(vid(s, best.i), 'found')] : []),
        ...search.top.slice(1).map((e) => mark(vid(s, e.i), 'visit')),
      ],
      say: best
        ? `${label} = ${vecText(t)}. Leaving out ${na}, ${nb} and ${nc}, as the usual analogy test does, the nearest is ${s.vocab[best.i]!.w} (${simName(settings.measure)} ${two(best.s)}).${input} The full list: ${topText(s, search.top)}.`
        : `${label} = ${vecText(t)}, and every other word was left out.`,
      lines: ['ret3'],
      level: 1,
      vars: { ...vars(), kept: search.top.length },
    };
    return next;
  },
};

export const ops = { nearest: nearestOp, similarity: similarityOp, analogy: analogyOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: EmbSettings): PseudoBlock[] {
  const norm = settings.normalize
    ? [L('norm', 1, 'v = v / |v| for every word v', 'Scale every arrow to length 1 first.')]
    : [];
  const score =
    settings.measure === 'cosine'
      ? L('score', 2, 's = (t · u) / (|t| · |u|)', 'Score u: how closely it points the way t does.')
      : L('score', 2, 's = t · u', 'Score u: direction and length together.');
  const search = (indent: number) => [
    L('heap', indent, 'H = empty min-heap', 'Keep the best k found so far, the weakest on top.'),
    L('for', indent, 'for each word u (but the ones left out)', 'Look at every word in turn:'),
    { ...score, indent: indent + 1 },
    L('room', indent + 1, 'if |H| < k', 'If fewer than k are kept,'),
    L('push', indent + 2, 'push (s, u) onto H, sift up', 'keep u.'),
    L('beats', indent + 1, 'else if s > top of H', 'Otherwise, if u beats the weakest kept,'),
    L(
      'replace',
      indent + 2,
      'replace the top with (s, u), sift down',
      'swap it in and let it sink to its place.',
    ),
  ];
  return [
    {
      op: 'nearest',
      lines: [
        L('sig', 0, 'NEAREST(t, k)', 'Find the k words most like t:'),
        ...norm,
        ...search(1),
        L('ret', 1, "return H's words, best first", 'Pop the heap and reverse it.'),
      ],
    },
    {
      op: 'similarity',
      lines: [
        L('sig2', 0, 'SIMILARITY(a, b)', 'How alike are two words?'),
        ...norm,
        L('dot', 1, 'd = a.x · b.x + a.y · b.y', 'Multiply the matching numbers and add.'),
        L('len', 1, '|a| = √(a.x² + a.y²), and |b| the same way', 'Measure both arrows.'),
        L('cos', 1, 'c = d / (|a| · |b|)', 'Divide out the lengths: the cosine of the angle.'),
        L(
          'ret2',
          1,
          settings.measure === 'cosine' ? 'return c' : 'return d',
          settings.measure === 'cosine'
            ? 'The cosine is the answer.'
            : 'The dot product is the answer.',
        ),
      ],
    },
    {
      op: 'analogy',
      lines: [
        L('sig3', 0, 'ANALOGY(a, b, c, k)', '"b is to a as c is to what?"'),
        ...norm,
        L('start', 1, 't = a − b + c', 'Take the step from b to a, starting at c.'),
        ...search(1),
        L(
          'ret3',
          1,
          'return NEAREST(t, k) without a, b, c',
          'The nearest other words are the answer.',
        ),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S, settings: EmbSettings): string {
  return `${s.vocab.length} words as arrows in two dimensions, set by hand: people to the right, animals up and to the left, food below. Words that mean similar things point the same way.${settings.normalize ? ' Every arrow is scaled to length 1.' : ''} Try Nearest on kitten, or an analogy: king man woman.`;
}

export const initialVars = (s: S, settings: EmbSettings) => baseVars(s, settings);

export function describe(s: S): string {
  const base = `Words: ${s.vocab.map((x) => `${x.w} (${two(x.v[0])}, ${two(x.v[1])})`).join(', ')}.`;
  const q = s.query;
  if (!q) return base;
  if (q.kind === 'similarity')
    return `${base} ${s.vocab[q.a]!.w} and ${s.vocab[q.b]!.w}: dot product ${two(q.dot)}, cosine ${two(q.cos)}.`;
  return `${base} Nearest to ${q.label}: ${topText(s, q.top)}.`;
}
