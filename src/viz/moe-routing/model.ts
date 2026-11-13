/**
 * Mixture-of-experts routing (Shazeer et al. 2017; Switch Transformer, Fedus et al. 2022; expert
 * choice, Zhou et al. 2022), on a sentence of at most eight words from the toy vocabulary
 * (src/viz/_lm/vocab.ts). In a mixture-of-experts layer the feed-forward network is replaced by
 * E experts (E = 4 here) and a router that sends each token to a few of them.
 *
 *   logits = x · W_r                (each token's score for each expert)
 *   p = softmax(logits) per token   (the router's probabilities)
 *   capacity C = ⌈CF · k · T / E⌉   (slots per expert: T tokens, k experts each, CF the
 *                                     capacity factor)
 *
 * Token choice (the default): each token picks its k highest logits; softmax over just those k
 * gives their weights. Assignments go into the experts in order, every token's first choice
 * before any second choice; an expert that is full drops the rest. A token whose every choice is
 * dropped passes on by the residual alone.
 * Expert choice (Zhou et al.): each expert picks the C tokens with the highest p for it, with p
 * as the weight. Every expert is exactly full; a token no expert picks is dropped.
 *
 * The load-balance readout is Switch Transformer's auxiliary loss, E · Σ_i f_i · P_i: f_i the
 * share of assignments that go to expert i (before capacity), P_i the mean router probability
 * for i. It is 1 when both are even and grows to E when one expert gets everything.
 *
 * The router is made by hand: expert i likes feature i (animal, thing, action, small) and has a
 * second favourite, so top-2 routing has something to choose. Ties go to the lower index.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { matmul, short, softmax, two } from '../_lm/numbers';
import { embed, known } from '../_lm/vocab';
import { wordName } from '../self-attention/model';

export const E = 4;
export const MAX_TOKENS = 8;
export const START_TEXT = 'the cat sat on the mat';
export const EXPERTS = ['E1', 'E2', 'E3', 'E4'];
export const LIKES = ['animals', 'things', 'actions', 'small words'];

export type KChoice = '1' | '2';
export type CfChoice = '1' | '1.25' | '1.5' | '2';
export type Routing = 'token' | 'expert';

export interface MoeSettings {
  [key: string]: Scalar;
  k: KChoice;
  cf: CfChoice;
  routing: Routing;
}

export const defaults: MoeSettings = { k: '2', cf: '1.25', routing: 'token' };

/** The router, rows the features (animal, thing, action, small), columns the experts. */
export const W_R: readonly (readonly number[])[] = [
  [2, 0, 0.5, 0],
  [0, 2, 0, 0.5],
  [0.5, 0, 2, 0],
  [0.2, 0.5, 0, 2],
];

/** Within this much of the best, an earlier index wins: last-bit noise never decides. */
const TIE = 1e-12;

/** Indices of the `count` largest values, largest first, ties to the lower index. */
export function topIndices(xs: readonly number[], count: number): number[] {
  const left = xs.map((_, i) => i);
  const out: number[] = [];
  while (out.length < count && left.length) {
    const best = Math.max(...left.map((i) => xs[i]!));
    const pick = left.find((i) => xs[i]! >= best - TIE)!;
    out.push(pick);
    left.splice(left.indexOf(pick), 1);
  }
  return out;
}

export const capacity = (tokens: number, set: MoeSettings) =>
  Math.ceil((Number(set.cf) * Number(set.k) * tokens) / E);

export interface Assignment {
  token: number;
  expert: number;
  /** The gate weight: softmax over the chosen logits (token choice) or p (expert choice). */
  weight: number;
  /** 0 for a token's first choice, 1 for its second (token choice); the pick order (expert). */
  rank: number;
  kept: boolean;
  /** Its slot in the expert (0-based), counting dropped ones after the kept ones. */
  slot: number;
}

export interface Routed {
  logits: number[][];
  p: number[][];
  cap: number;
  /** In dispatch order. */
  assignments: Assignment[];
  /** Assignments each expert was asked for, before capacity. */
  wanted: number[];
  f: number[];
  P: number[];
  loss: number;
  dropped: number;
  /** Tokens with no expert. */
  orphans: number[];
}

/** The whole routing in the code tabs' order. */
export function route(x: number[][], set: MoeSettings): Routed {
  const T = x.length;
  const k = Number(set.k);
  const logits = matmul(x, W_R as number[][]);
  const p = logits.map((row) => softmax(row).p);
  const cap = capacity(T, set);
  const load = Array<number>(E).fill(0);
  const wanted = Array<number>(E).fill(0);
  const assignments: Assignment[] = [];
  if (set.routing === 'token') {
    const choices = logits.map((row) => topIndices(row, k));
    const gates = choices.map((c, t) => softmax(c.map((e) => logits[t]![e]!)).p);
    for (const c of choices) for (const e of c) wanted[e]!++;
    for (let r = 0; r < k; r++)
      for (let t = 0; t < T; t++) {
        const e = choices[t]![r]!;
        const kept = load[e]! < cap;
        assignments.push({
          token: t,
          expert: e,
          weight: gates[t]![r]!,
          rank: r,
          kept,
          slot: load[e]!,
        });
        load[e]!++;
      }
  } else {
    for (let e = 0; e < E; e++) {
      const col = p.map((row) => row[e]!);
      topIndices(col, cap).forEach((t, r) => {
        assignments.push({ token: t, expert: e, weight: p[t]![e]!, rank: r, kept: true, slot: r });
        wanted[e]!++;
      });
    }
  }
  let total = 0;
  for (const w of wanted) total += w;
  const f = wanted.map((w) => w / total);
  const P = Array.from({ length: E }, (_, e) => {
    let s = 0;
    for (let t = 0; t < T; t++) s += p[t]![e]!;
    return s / T;
  });
  let dot = 0;
  for (let e = 0; e < E; e++) dot += f[e]! * P[e]!;
  const used = new Set(assignments.filter((a) => a.kept).map((a) => a.token));
  return {
    logits,
    p,
    cap,
    assignments,
    wanted,
    f,
    P,
    loss: E * dot,
    dropped: assignments.filter((a) => !a.kept).length,
    orphans: Array.from({ length: T }, (_, t) => t).filter((t) => !used.has(t)),
  };
}

// ---------------------------------------------------------------------------------------------
// Words

/** Words in order, lower case, punctuation dropped; an Error says what is wrong. */
export function parseTokens(text: string): string[] | Error {
  const words = text
    .toLowerCase()
    .replace(/[.,!?;:"']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return new Error('Type a sentence first, such as "the cat sat".');
  if (words.length > MAX_TOKENS)
    return new Error(`Keep it to ${MAX_TOKENS} words, so every number stays readable.`);
  const bad = words.find((w) => !/^[a-z]{1,6}$/.test(w));
  if (bad) return new Error(`Use words of letters only, six at most ("${bad}" is not).`);
  return words;
}

// ---------------------------------------------------------------------------------------------
// State

export interface MoeState {
  words: string[];
  x: number[][];
  /** Logits and probabilities, once scored. */
  scored?: { logits: number[][]; p: number[][] };
  result?: Routed;
}

/** What one step of `route` shows. */
export interface MoeWork {
  r: Routed;
  /** Rows of logits, then of p, filled so far. */
  logitRows: number;
  pRows: number;
  /** Rows whose gates are filled (token choice), or experts that have picked (expert choice). */
  gateRows: number;
  pickedBy: number;
  /** Assignments dispatched so far, in `r.assignments` order. */
  placed: number;
  /** f and P under the experts. */
  loss: boolean;
}

export interface MoeExtra {
  work?: MoeWork;
}

type S = MoeState;
type X = MoeExtra;
type Op = OpSpec<S, MoeSettings, X>;
type MStep = Step<S, X>;

export function init(): S {
  const words = parseTokens(START_TEXT) as string[];
  return { words, x: words.map(embed) };
}

// ---------------------------------------------------------------------------------------------
// Steps

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const rowMarks = (m: string, t: number, role: Mark['role']) =>
  Array.from({ length: E }, (_, e) => mark(`${m}-${t}-${e}`, role));
const vec = (v: readonly number[]) => `(${v.map(two).join(', ')})`;
const ex = (e: number) => EXPERTS[e]!;

export function baseVars(s: S, set: MoeSettings): Record<string, Scalar> {
  return {
    tokens: s.words.length,
    experts: E,
    k: Number(set.k),
    'capacity factor': Number(set.cf),
    capacity: capacity(s.words.length, set),
  };
}

function resultVars(s: S, set: MoeSettings, r: Routed): Record<string, Scalar> {
  return {
    ...baseVars(s, set),
    assignments: r.assignments.length,
    dropped: r.dropped,
    'tokens with no expert': r.orphans.length,
    'load-balance loss': Math.round(r.loss * 100) / 100,
  };
}

const loadOp: Op = {
  label: 'Load',
  arity: 1,
  *run(s, args, { settings }) {
    const words = parseTokens(String(args[0]));
    if (words instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: words.message,
        lines: [],
        level: 1,
        vars: baseVars(s, settings),
      };
      return s;
    }
    const next: S = { words, x: words.map(embed) };
    const unknown = [...new Set(words.filter((w) => !known(w)))];
    const odd = unknown.length
      ? ` ${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not in the toy vocabulary, so ${unknown.length === 1 ? 'it gets' : 'they get'} made-up numbers.`
      : '';
    yield {
      state: next,
      marks: words.map((_, t) => mark(`w-${t}`, 'new')),
      say: `${words.length === 1 ? 'One token' : `${words.length} tokens`}: ${words.join(' ')}. Each is its four-number embedding (animal, thing, action, small).${odd} Press Route: the router sends each token to ${settings.routing === 'token' ? `its top ${settings.k} of ${E} experts` : 'the experts that pick it'}, each with room for ${capacity(words.length, settings)}.`,
      lines: ['embed'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

/** Logits and softmax, row by row; shared by Score and Route. */
function* scoreSteps(
  s: S,
  r: Routed,
  names: readonly string[],
  vars: () => Record<string, Scalar>,
  work: (logitRows: number, pRows: number) => X,
): Generator<MStep, void, void> {
  const T = s.words.length;
  for (let t = 0; t < T; t++) {
    const best = r.logits[t]!.indexOf(Math.max(...r.logits[t]!));
    yield {
      state: s,
      marks: [
        ...rowMarks('l', t, 'new'),
        mark(`w-${t}`, 'active'),
        mark(`l-${t}-${best}`, 'found'),
      ],
      say: `${names[t]}: x·W_r = ${vec(s.x[t]!)}·W_r = ${vec(r.logits[t]!)}. The router likes ${ex(best)} (${LIKES[best]}) best.`,
      lines: ['logit'],
      level: 3,
      vars: vars(),
      extra: work(t + 1, 0),
    };
  }
  yield {
    state: s,
    marks: Array.from({ length: T }, (_, t) => rowMarks('l', t, 'new')).flat(),
    say: `The router's logits: one row per token, one score per expert, x·W_r. The hand-made router gives each expert a favourite feature: ${EXPERTS.map((e, i) => `${e} ${LIKES[i]}`).join(', ')}.`,
    lines: ['logit'],
    level: 2,
    vars: vars(),
    extra: work(T, 0),
  };
  const t0 = r.p.findIndex(
    (row) => Math.max(...row) === Math.max(...r.p.map((q) => Math.max(...q))),
  );
  yield {
    state: s,
    marks: Array.from({ length: T }, (_, t) => rowMarks('p', t, 'new')).flat(),
    say: `Softmax of each row gives the router's probabilities, p. ${names[t0]} is the surest: ${short(Math.max(...r.p[t0]!))} for one expert. The load-balance loss uses these.`,
    lines: ['soft'],
    level: 2,
    vars: vars(),
    extra: work(T, T),
  };
}

const scoreOp: Op = {
  label: 'Score',
  arity: 0,
  *run(s, _args, { settings }) {
    const r = route(s.x, settings);
    const names = s.words.map((_, i) => wordName(s.words, i));
    const blank = { r, logitRows: 0, pRows: 0, gateRows: 0, pickedBy: 0, placed: 0, loss: false };
    yield* scoreSteps(
      s,
      r,
      names,
      () => baseVars(s, settings),
      (logitRows, pRows) => ({
        work: { ...blank, logitRows, pRows },
      }),
    );
    const next: S = { ...s, scored: { logits: r.logits, p: r.p }, result: undefined };
    yield {
      state: next,
      marks: [],
      say: 'Every token has its scores and probabilities. Press Route to choose the experts and fill them up to capacity.',
      lines: ['soft'],
      level: 1,
      vars: baseVars(next, settings),
    };
    return next;
  },
};

const routeOp: Op = {
  label: 'Route',
  arity: 0,
  *run(s, _args, { settings: set }) {
    const T = s.words.length;
    const k = Number(set.k);
    const r = route(s.x, set);
    const names = s.words.map((_, i) => wordName(s.words, i));
    const w: MoeWork = {
      r,
      logitRows: s.scored ? T : 0,
      pRows: s.scored ? T : 0,
      gateRows: 0,
      pickedBy: 0,
      placed: 0,
      loss: false,
    };
    const vars = () => baseVars(s, set);
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): MStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: vars(),
      extra: { work: { ...w } },
    });
    if (!s.scored)
      yield* scoreSteps(s, r, names, vars, (logitRows, pRows) => ({
        work: { ...w, logitRows, pRows },
      }));
    w.logitRows = T;
    w.pRows = T;
    const capText = `⌈${set.cf} × ${k} × ${T} / ${E}⌉ = ${r.cap}`;

    if (set.routing === 'token') {
      // Top-k and the gate weights, token by token.
      for (let t = 0; t < T; t++) {
        w.gateRows = t + 1;
        const mine = r.assignments.filter((a) => a.token === t).sort((a, b) => a.rank - b.rank);
        yield step(
          k === 1
            ? `${names[t]} picks its top expert, ${ex(mine[0]!.expert)} (${two(r.logits[t]![mine[0]!.expert]!)}). Softmax over one score is 1.`
            : `${names[t]} picks its top 2: ${mine.map((a) => `${ex(a.expert)} (${two(r.logits[t]![a.expert]!)})`).join(' and ')}. Softmax over just those two: ${mine.map((a) => short(a.weight)).join(' and ')}.`,
          ['top', 'gate'],
          3,
          [...mine.map((a) => mark(`g-${t}-${a.expert}`, 'new')), mark(`w-${t}`, 'active')],
        );
      }
      w.gateRows = T;
      yield step(
        `Each token picks its top ${k === 1 ? 'expert' : `${k} experts`}${k === 2 ? ', and softmax over the chosen scores gives their weights' : ' with weight 1'}. Asked for: ${r.wanted.map((c, e) => `${ex(e)} ${c}`).join(', ')}. Each expert has room for C = ${capText}.`,
        ['top', 'gate', 'cap'],
        2,
        r.wanted.flatMap((c, e) => (c > r.cap ? [mark(`e-${e}`, 'error')] : [])),
      );
      // Dispatch, first choices before second choices.
      for (let rank = 0; rank < k; rank++) {
        const batch = r.assignments.filter((a) => a.rank === rank);
        if (k === 2)
          yield step(
            rank === 0
              ? 'First choices go in first, in sentence order.'
              : 'Then the second choices, into whatever room is left.',
            ['disp'],
            2,
          );
        for (const a of batch) {
          w.placed++;
          const id = `as-${a.token}-${a.expert}`;
          if (a.kept)
            yield step(
              `${names[a.token]} → ${ex(a.expert)}: slot ${a.slot + 1} of ${r.cap}.`,
              ['disp', 'keep'],
              3,
              [mark(id, 'new'), mark(`g-${a.token}-${a.expert}`, 'active')],
            );
          else {
            const other = r.assignments.find((b) => b.token === a.token && b !== a && b.kept);
            yield step(
              `${names[a.token]} → ${ex(a.expert)}: ${ex(a.expert)} is full (${r.cap} of ${r.cap}). The assignment is dropped and its weight (${short(a.weight)}) is lost. ${other ? `${names[a.token]} still has ${ex(other.expert)}.` : `${names[a.token]} has no expert left: it passes on by the residual alone.`}`,
              ['disp', 'drop'],
              2,
              [mark(id, 'error'), mark(`g-${a.token}-${a.expert}`, 'error')],
            );
          }
        }
      }
    } else {
      // Expert choice: each expert takes its top C tokens by p.
      for (let e = 0; e < E; e++) {
        w.pickedBy = e + 1;
        const mine = r.assignments.filter((a) => a.expert === e);
        w.placed += mine.length;
        w.gateRows = T;
        yield step(
          `${ex(e)} picks the ${r.cap} tokens with the highest p in its column: ${mine.map((a) => `${names[a.token]} (${short(a.weight)})`).join(', ')}. Their p is their weight.`,
          ['epick', 'egate'],
          2,
          [
            mark(`e-${e}`, 'active'),
            ...mine.map((a) => mark(`as-${a.token}-${a.expert}`, 'new')),
            ...mine.map((a) => mark(`p-${a.token}-${e}`, 'found')),
          ],
        );
      }
      yield step(
        r.orphans.length === 0
          ? `Every expert is exactly full, ${r.cap} tokens each, and every token got at least one expert.`
          : `Every expert is exactly full, ${r.cap} tokens each. No expert picked ${r.orphans.map((t) => names[t]).join(' or ')}: ${r.orphans.length === 1 ? 'it passes' : 'they pass'} on by the residual alone.`,
        ['edrop'],
        2,
        r.orphans.map((t) => mark(`w-${t}`, 'error')),
      );
    }

    // The load-balance readout.
    w.loss = true;
    yield step(
      `Load balance (Switch Transformer): f = share of assignments ${vec(r.f)}, P = mean router probability ${vec(r.P)}. Loss = ${E} × Σ f·P = ${two(r.loss)}; 1 means perfectly even.${set.routing === 'expert' ? ' Expert choice makes f even by construction.' : ''}`,
      ['loss'],
      2,
      EXPERTS.map((_, e) => mark(`f-${e}`, 'new')),
    );

    const next: S = { ...s, scored: { logits: r.logits, p: r.p }, result: r };
    yield {
      state: next,
      marks: [...r.orphans.map((t) => mark(`w-${t}`, 'error'))],
      say: `${summary(r, names, set)} Each token's output is x plus its experts' outputs, each times its weight.`,
      lines: ['ret'],
      level: 1,
      vars: resultVars(next, set, r),
    };
    return next;
  },
};

function summary(r: Routed, names: readonly string[], set: MoeSettings): string {
  const kept = r.assignments.filter((a) => a.kept).length;
  if (set.routing === 'expert')
    return `Expert choice: ${kept} assignments, ${r.cap} per expert.${r.orphans.length ? ` ${r.orphans.length === 1 ? 'One token gets' : `${r.orphans.length} tokens get`} no expert (${r.orphans.map((t) => names[t]).join(', ')}).` : ' Every token got an expert.'} Load-balance loss ${two(r.loss)}.`;
  return `Routed ${kept} of ${r.assignments.length} assignments; ${r.dropped === 0 ? 'none dropped' : `${r.dropped} dropped`}${r.orphans.length ? `, and ${r.orphans.map((t) => names[t]).join(', ')} got no expert at all` : ''}. Load-balance loss ${two(r.loss)}.`;
}

export const ops = { load: loadOp, score: scoreOp, route: routeOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(set: MoeSettings): PseudoBlock[] {
  const k = Number(set.k);
  const score = [
    L('logit', 1, 'logits = X·W_r', 'Score every token against every expert,'),
    L('soft', 1, 'p = softmax(logits) by rows', 'and turn each row into probabilities.'),
  ];
  const tokenLines = [
    L('cap', 1, `C = ⌈CF · ${k} · T / E⌉`, 'Give every expert the same number of slots.'),
    L(
      'top',
      1,
      `for each token t: S_t = top ${k} experts by logit`,
      `Each token picks its ${k === 1 ? 'best expert' : 'best two experts'},`,
    ),
    L(
      'gate',
      2,
      'g_t = softmax(logits_t[S_t])',
      k === 1 ? 'with weight 1.' : 'weighted by a softmax over just those scores.',
    ),
    L(
      'disp',
      1,
      'for r = 1 to k, for t = 1 to T: e = S_t[r]',
      'Fill the experts, first choices before second choices:',
    ),
    L('keep', 2, 'if load(e) < C: send t to e', 'a token goes in while there is room,'),
    L('drop', 2, 'else drop (t, e)', 'and is dropped when the expert is full.'),
  ];
  const expertLines = [
    L('cap', 1, `C = ⌈CF · ${k} · T / E⌉`, 'Give every expert the same number of slots.'),
    L(
      'epick',
      1,
      'for each expert e: take the C tokens with the largest p[·][e]',
      'Each expert picks the tokens that want it most,',
    ),
    L('egate', 2, 'g[t][e] = p[t][e]', 'weighted by the router probability.'),
    L('edrop', 1, 'a token no expert takes is dropped', 'A token nobody picks gets no expert.'),
  ];
  return [
    {
      op: 'load',
      lines: [
        L('lsig', 0, 'LOAD(words)', 'Start from a sentence:'),
        L('embed', 1, 'x_t = embedding(word_t)', 'each token becomes its four numbers.'),
      ],
    },
    {
      op: 'score',
      lines: [L('ssig', 0, 'SCORE(X)', 'Let the router score the tokens:'), ...score],
    },
    {
      op: 'route',
      lines: [
        L(
          'sig',
          0,
          `ROUTE(X)  (${set.routing === 'token' ? 'token choice' : 'expert choice'})`,
          'Send each token to a few experts:',
        ),
        ...score,
        ...(set.routing === 'token' ? tokenLines : expertLines),
        L('loss', 1, 'loss = E · Σ_i f_i · P_i', 'Measure how evenly the work is spread,'),
        L(
          'ret',
          1,
          'y_t = x_t + Σ g · expert_e(x_t)',
          'and add each expert’s output, by its weight, to the token.',
        ),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S, set: MoeSettings): string {
  return `${s.words.length} tokens: ${s.words.join(' ')}. Press Route: a router scores ${E} experts for each token and sends it to ${set.routing === 'token' ? `its top ${set.k}` : 'the experts that pick it'}, as long as they have room.`;
}

export const initialVars = (s: S, set: MoeSettings) => baseVars(s, set);

export function describe(s: S): string {
  const base = `Tokens: ${s.words.join(' ')}.`;
  if (!s.result) return `${base} Not routed yet.`;
  const r = s.result;
  const names = s.words.map((_, i) => wordName(s.words, i));
  return `${base} ${names
    .map((n, t) => {
      const kept = r.assignments.filter((a) => a.token === t && a.kept);
      return `${n}: ${kept.length ? kept.map((a) => `${ex(a.expert)} ${short(a.weight)}`).join(' and ') : 'no expert'}`;
    })
    .join('; ')}. Load-balance loss ${two(r.loss)}.`;
}
