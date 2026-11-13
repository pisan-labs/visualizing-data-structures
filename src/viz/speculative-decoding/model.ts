/**
 * Speculative decoding on the toy corpus: a bigram drafts, a trigram checks (spec.ts has the
 * algorithm). The text starts from a prompt of corpus words and grows until </s> or MAX_NEW
 * words.
 *
 * Operations
 *   start(prompt)   a new text
 *   draft           the small model proposes up to k words (one small pass each)
 *   verify          one large pass checks them: accept, reject and resample, or take a bonus word
 *   check(u …)      verify with the u values given (for the tests, then the word drawn)
 *   step            draft and verify: one round
 *   generate        rounds until the text ends
 *
 * Settings
 *   k        drafts per round (1 to 5)
 *   accept   'sample' (Leviathan et al.: accept with probability min(1, p/q)) or 'greedy'
 *            (accept when the draft is the target's top word)
 *
 * Counters: large passes, small passes, words generated, and the large passes saved against
 * plain decoding, which needs one large pass per word.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { round3, two } from '../_lm/numbers';
import { parseWords } from '../ngram-lm/model';
import {
  added,
  chance,
  draftWords,
  EOS,
  verifyDrafts,
  type Dist,
  type Drafted,
  type Round,
} from './spec';

export const MAX_PROMPT = 4;
/** Words generated at most, so the text fits a phone. */
export const MAX_NEW = 10;
export const MAX_U = 6;
export const START = 'the';

export type Accept = 'sample' | 'greedy';

export interface SpecSettings {
  [key: string]: Scalar;
  k: number;
  accept: Accept;
}

export const defaults: SpecSettings = { k: 3, accept: 'sample' };

export interface Token {
  t: string;
  /** An accepted draft, or a word the target drew (a resample or a bonus). */
  from: 'draft' | 'target';
}

export interface Stats {
  large: number;
  small: number;
  drafted: number;
  accepted: number;
}

export interface SpecState {
  prompt: string[];
  out: Token[];
  /** Words each large pass added, in order. */
  rounds: number[];
  /** Drafts proposed and not yet verified. */
  pending?: Drafted;
  /** The last round verified, for the picture. */
  last?: Round;
  stats: Stats;
}

/** What one step shows: the round so far and where its attention is. */
export interface SpecWork {
  round: Partial<Round> & Drafted & Pick<Round, 'prefix'>;
  /** The position in focus (0-based); drafts.length is the position after the last draft. */
  focus: number;
  stage: 'draft' | 'pass' | 'test' | 'leftover' | 'extra' | 'done';
  /** Tests decided so far. */
  tested: number;
}

export interface SpecExtra {
  work?: SpecWork;
}

type S = SpecState;
type X = SpecExtra;
type Op = OpSpec<S, SpecSettings, X>;
type SStep = Step<S, X>;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const tokId = (i: number) => `tok-${i}`;
export const colId = (i: number) => `col-${i}`;
/** The column of the word the large model adds. */
export const EXTRA = 'col-x';
export const keyOf = (w: string) => (w === EOS ? 'eos' : w);

export const words = (s: S): string[] => [...s.prompt, ...s.out.map((t) => t.t)];
export const finished = (s: S): boolean => s.out.at(-1)?.t === EOS || s.out.length >= MAX_NEW;
/** Drafts the next round may make: k, but never past MAX_NEW words. */
export const roomFor = (s: S, k: number): number =>
  Math.max(0, Math.min(Math.round(k), MAX_NEW - s.out.length - 1));

const freshStats = (): Stats => ({ large: 0, small: 0, drafted: 0, accepted: 0 });

export function startState(prompt: string[]): S {
  return { prompt, out: [], rounds: [], stats: freshStats() };
}

export function init(): S {
  return startState([START]);
}

// ---------------------------------------------------------------------------------------------
// Input

/** A prompt of one to MAX_PROMPT corpus words, or an Error a learner can act on. */
export function readPrompt(raw: Value | undefined): string[] | Error {
  const ws = parseWords(String(raw ?? ''), MAX_PROMPT);
  return ws;
}

/** One to MAX_U numbers u in [0, 1), or an Error. */
export function readUs(raw: Value | undefined): number[] | Error {
  const parts = String(raw ?? '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!parts.length || parts.length > MAX_U || parts.some((p) => !/^(0?\.\d+|0)$/.test(p)))
    return new Error(
      `Type one to ${MAX_U} numbers u from 0 up to (not including) 1, such as 0.3 0.9 0.5.`,
    );
  return parts.map(Number);
}

export function parseInput(text: string): Value | Error {
  const t = text.trim();
  if (/^[\d.,\s]+$/.test(t)) {
    const us = readUs(t);
    return us instanceof Error ? us : us.join(' ');
  }
  const ws = readPrompt(t);
  return ws instanceof Error ? ws : ws.join(' ');
}

// ---------------------------------------------------------------------------------------------
// Steps

export function baseVars(s: S): Record<string, Scalar> {
  const out: Record<string, Scalar> = {
    words: s.out.length,
    'large passes': s.stats.large,
    'small passes': s.stats.small,
    saved: s.out.length - s.stats.large,
  };
  if (s.stats.drafted) out.accepted = `${s.stats.accepted} of ${s.stats.drafted}`;
  return out;
}

const err = (s: S, message: string): SStep => ({
  state: s,
  marks: [],
  say: message,
  lines: [],
  level: 1,
  vars: baseVars(s),
});

const quote = (ws: readonly string[]) => `"${ws.join(' ')}"`;
const top3 = (d: Dist) =>
  d.words
    .slice(0, 3)
    .map((w) => `${w} ${two(d.p.get(w)!)}`)
    .join(', ') + (d.words.length > 3 ? ` and ${d.words.length - 3} more` : '');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The draft steps: one small pass per word. */
function* draftSteps(
  s: S,
  pending: Drafted,
  vars: (i: number) => Record<string, Scalar>,
  level: 2 | 3,
): Generator<SStep, void, void> {
  const prefix = words(s);
  for (let i = 0; i < pending.drafts.length; i++) {
    const x = pending.drafts[i]!;
    const q = pending.qs[i]!;
    const u = pending.qu[i]!;
    const ctx = [...prefix, ...pending.drafts.slice(0, i)];
    yield {
      state: s,
      marks: [mark(colId(i), 'new'), mark(`q-${keyOf(x)}`, 'active')],
      say: `Draft ${i + 1}: the small model reads "${ctx.at(-1)}" and gives q: ${top3(q)}. ${u === null ? `Greedy: take its top word, ${x}.` : `Draw u = ${round3(u)}: it lands in ${x} (q = ${two(chance(q, x))}).`}${x === EOS ? ' That ends the text, so drafting stops here.' : ''}`,
      lines: ['dfor', 'ddraw'],
      level,
      vars: vars(i + 1),
      extra: {
        work: {
          round: { ...pending, prefix, drafts: pending.drafts.slice(0, i + 1) },
          focus: i,
          stage: 'draft',
          tested: 0,
        },
      },
    };
  }
}

/** The verify steps: the pass, each test, and the word the target adds. */
function* verifySteps(
  s: S,
  r: Round,
  vars: () => Record<string, Scalar>,
  level: 2 | 3,
): Generator<SStep, void, void> {
  const n = r.drafts.length;
  const work = (focus: number, stage: SpecWork['stage'], tested: number): X => ({
    work: { round: r, focus, stage, tested },
  });
  const ps = r.ps;
  const listed = r.drafts.map((x, i) => `p(${x}) = ${two(chance(ps[i]!, x))}`).join(', ');
  yield {
    state: s,
    marks: r.drafts.map((_, i) => mark(colId(i), 'active')),
    say: `One pass of the large model reads the prompt and ${n === 1 ? 'the draft' : `all ${n} drafts`} at once, so it gives p at every position together: ${listed}${ps.length > n ? `, and the distribution after the last draft` : ''}. That is 1 large pass, however many drafts there are.`,
    lines: ['pass'],
    level,
    vars: vars(),
    extra: work(0, 'pass', 0),
  };
  for (let i = 0; i < Math.min(n, r.accepted + 1); i++) {
    const x = r.drafts[i]!;
    const p = chance(ps[i]!, x);
    const q = chance(r.qs[i]!, x);
    const ok = i < r.accepted;
    let say: string;
    if (r.greedy) {
      const t = ps[i]!.words[0]!;
      say = ok
        ? `Draft ${i + 1}, ${x}: it is also the large model's top word. Accept.`
        : `Draft ${i + 1}, ${x}: the large model's top word is ${t}. Reject ${x}, and everything drafted after it.`;
    } else {
      const u = r.au[i]!;
      const ratio = p / q;
      say =
        ratio >= 1
          ? `Draft ${i + 1}, ${x}: p/q = ${two(p)}/${two(q)} = ${two(ratio)}, at least 1, so it is accepted whatever u is (u = ${round3(u)}).`
          : ok
            ? `Draft ${i + 1}, ${x}: p/q = ${two(p)}/${two(q)} = ${two(ratio)}. u = ${round3(u)} is below it: accept.`
            : `Draft ${i + 1}, ${x}: p/q = ${two(p)}/${two(q)} = ${two(ratio)}. u = ${round3(u)} is not below it: reject ${x}${i + 1 < n ? ', and everything drafted after it' : ''}.`;
    }
    yield {
      state: s,
      marks: [
        mark(colId(i), ok ? 'found' : 'error'),
        mark(`q-${keyOf(x)}`, 'active'),
        mark(`p-${keyOf(x)}`, 'active'),
      ],
      say,
      lines: r.greedy ? ['tfor', 'gtest'] : ['tfor', 'test'],
      level,
      vars: vars(),
      extra: work(i, 'test', i + 1),
    };
  }
  const at = r.accepted;
  const tested = Math.min(n, at + 1);
  if (r.kind === 'resample' && !r.greedy) {
    const d = r.extraDist!;
    yield {
      state: s,
      marks: d.words.map((w) => mark(`r-${keyOf(w)}`, 'new')),
      say: `Instead of ${r.drafts[at]}, draw from what the large model wanted more than the small one gave: max(0, p − q), scaled to add up to 1. ${top3(d)}.`,
      lines: ['left'],
      level,
      vars: vars(),
      extra: work(at, 'leftover', tested),
    };
  }
  if (r.extra !== null) {
    const u = r.eu === null ? '' : `u = ${round3(r.eu)} lands in ${r.extra}`;
    const say =
      r.kind === 'bonus'
        ? `Every draft was accepted, and the pass already has p after the last one: a bonus word, free. ${u ? `${u}.` : `Its top word is ${r.extra}.`}`
        : r.greedy
          ? `Take the large model's top word instead: ${r.extra}.`
          : `Draw from the leftover: ${u}.`;
    yield {
      state: s,
      marks: [mark(EXTRA, 'new')],
      say,
      lines: r.kind === 'bonus' ? ['bonus'] : r.greedy ? ['gfix'] : ['left'],
      level,
      vars: vars(),
      extra: work(r.kind === 'bonus' ? n : at, 'extra', tested),
    };
  }
}

function applyRound(s: S, r: Round): S {
  const out: Token[] = [
    ...s.out,
    ...r.drafts.slice(0, r.accepted).map((t) => ({ t, from: 'draft' as const })),
    ...(r.extra === null ? [] : [{ t: r.extra, from: 'target' as const }]),
  ];
  return {
    ...s,
    out,
    rounds: [...s.rounds, added(r).length],
    pending: undefined,
    last: r,
    stats: {
      large: s.stats.large + 1,
      small: s.stats.small,
      drafted: s.stats.drafted + r.drafts.length,
      accepted: s.stats.accepted + r.accepted,
    },
  };
}

function roundSay(r: Round, s: S): string {
  const add = added(r);
  const n = r.drafts.length;
  return `This round: ${r.accepted} of ${plural(n, 'draft')} accepted${r.extra === null ? '' : `, plus "${r.extra}" from the large model`}, so ${plural(add.length, 'word')} for 1 large pass. ${plural(s.out.length, 'word')} so far in ${plural(s.stats.large, 'large pass', 'large passes')}: ${s.out.length - s.stats.large} saved.`;
}

/** A state ready for a round: the same prompt again if the text has ended. */
function* ready(s: S, level: 2 | 3): Generator<SStep, S, void> {
  if (!finished(s)) return s;
  const next = startState(s.prompt);
  yield {
    state: next,
    marks: [],
    say: `The text had ended. Start again from ${quote(s.prompt)}.`,
    lines: [],
    level,
    vars: baseVars(next),
  };
  return next;
}

/** Draft into a state, with its steps; returns the state holding the drafts. */
function* doDraft(
  s: S,
  settings: SpecSettings,
  next: () => number,
  level: 2 | 3,
): Generator<SStep, S, void> {
  const k = roomFor(s, settings.k);
  const greedy = settings.accept === 'greedy';
  const pending =
    k === 0 ? { k: 0, drafts: [], qs: [], qu: [] } : draftWords(words(s), k, greedy, next);
  const small = s.stats.small + pending.drafts.length;
  const after: S = { ...s, pending, stats: { ...s.stats, small } };
  yield* draftSteps(
    s,
    pending,
    (i) => ({ ...baseVars(s), 'small passes': s.stats.small + i }),
    level,
  );
  return after;
}

const startOp: Op = {
  label: 'Start',
  arity: 1,
  *run(s, args) {
    const prompt = readPrompt(args[0]);
    if (prompt instanceof Error) {
      yield err(s, prompt.message);
      return s;
    }
    const next = startState(prompt);
    yield {
      state: next,
      marks: prompt.map((_, i) => mark(tokId(i), 'new')),
      say: `The prompt: ${quote(prompt)}. The small model guesses the next words cheaply; the large model checks them in one pass. Press One round, or Generate.`,
      lines: [],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

const draftOp: Op = {
  label: 'Draft',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    if (s.pending) {
      yield err(s, 'The drafts are waiting for the large model: press Verify.');
      return s;
    }
    const st = yield* ready(s, 2);
    const after = yield* doDraft(st, settings, () => rng.next(), 2);
    const d = after.pending!;
    yield {
      state: after,
      marks: d.drafts.map((_, i) => mark(colId(i), 'new')),
      say: d.drafts.length
        ? `The small model drafted ${d.drafts.join(' ')}: ${d.drafts.length} small pass${d.drafts.length === 1 ? '' : 'es'}. Press Verify to check ${d.drafts.length === 1 ? 'it' : 'them'} with the large model.`
        : `No room for drafts: the text is one word from its limit of ${MAX_NEW}. Press Verify for one plain large pass.`,
      lines: ['dret'],
      level: 1,
      vars: baseVars(after),
    };
    return after;
  },
};

function verifyOp(given: boolean): Op {
  return {
    label: given ? 'Verify with u' : 'Verify',
    arity: given ? 1 : 0,
    *run(s, args, { settings, rng }) {
      let us: number[] = [];
      if (given) {
        const v = readUs(args[0]);
        if (v instanceof Error) {
          yield err(s, v.message);
          return s;
        }
        us = v;
      }
      let st = s;
      if (!st.pending) {
        st = yield* ready(st, 2);
        st = yield* doDraft(st, settings, () => rng.next(), 2);
      }
      const pending = st.pending!;
      const greedy = settings.accept === 'greedy';
      let k = 0;
      const next = () => (k < us.length ? us[k++]! : rng.next());
      const r = verifyDrafts(words(st), pending, greedy, next);
      const after = applyRound(st, r);
      yield* verifySteps(st, r, () => baseVars(st), 2);
      yield {
        state: after,
        marks: added(r).map((_, i) => mark(tokId(words(st).length + i), 'found')),
        say: roundSay(r, after),
        lines: ['ret'],
        level: 1,
        vars: baseVars(after),
      };
      return after;
    },
  };
}

const stepOp: Op = {
  label: 'One round',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    let st = s.pending ? s : yield* ready(s, 2);
    if (!st.pending) st = yield* doDraft(st, settings, () => rng.next(), 2);
    const r = verifyDrafts(words(st), st.pending!, settings.accept === 'greedy', () => rng.next());
    const after = applyRound(st, r);
    yield* verifySteps(st, r, () => baseVars(st), 2);
    yield {
      state: after,
      marks: added(r).map((_, i) => mark(tokId(words(st).length + i), 'found')),
      say: roundSay(r, after),
      lines: ['ret'],
      level: 1,
      vars: baseVars(after),
    };
    return after;
  },
};

const generateOp: Op = {
  label: 'Generate',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    let st = yield* ready(s, 2);
    const next = () => rng.next();
    const greedy = settings.accept === 'greedy';
    while (!finished(st)) {
      if (!st.pending) st = yield* doDraft(st, settings, next, 3);
      const r = verifyDrafts(words(st), st.pending!, greedy, next);
      yield* verifySteps(st, r, () => baseVars(st), 3);
      st = applyRound(st, r);
      yield {
        state: st,
        marks: added(r).map((_, i) => mark(tokId(words(st).length - added(r).length + i), 'found')),
        say: roundSay(r, st),
        lines: ['ret'],
        level: 2,
        vars: baseVars(st),
      };
    }
    const plain = st.out.length;
    yield {
      state: st,
      marks: st.out.map((_, i) => mark(tokId(st.prompt.length + i), 'found')),
      say: `${quote(words(st))}: ${plural(plain, 'word')} in ${plural(st.stats.large, 'large pass', 'large passes')}, where one pass per word would take ${plain}. Saved ${plain - st.stats.large}; the small model ran ${st.stats.small} times, and ${st.stats.accepted} of its ${st.stats.drafted} drafts were accepted.`,
      lines: ['ret'],
      level: 1,
      vars: baseVars(st),
    };
    return st;
  },
};

export const ops = {
  start: startOp,
  draft: draftOp,
  verify: verifyOp(false),
  check: verifyOp(true),
  step: stepOp,
  generate: generateOp,
};

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: SpecSettings): PseudoBlock[] {
  const greedy = settings.accept === 'greedy';
  const k = settings.k;
  const draft = [
    L('dfor', 1, `for i = 1 to ${k}`, `Up to ${k} times:`),
    L(
      'ddraw',
      2,
      greedy
        ? 'x_i = argmax q_i, q_i = small(prefix + x_1 … x_(i−1))'
        : 'x_i ~ q_i = small(prefix + x_1 … x_(i−1))',
      greedy
        ? 'the small model takes its top word (stop after the end of the text);'
        : 'the small model draws a word (stop after the end of the text);',
    ),
  ];
  const verify = [
    L(
      'pass',
      1,
      'p_1 … p_(n+1) = large(prefix, x_1 … x_n), one pass',
      'The large model reads all the drafts at once and scores every position.',
    ),
    L('tfor', 1, 'for i = 1 to n', 'Check the drafts in order:'),
    greedy
      ? L(
          'gtest',
          2,
          'if x_i ≠ argmax p_i: reject x_i and stop',
          'a draft stays if it is also the large model’s top word;',
        )
      : L(
          'test',
          2,
          'u ~ U(0, 1); if u ≥ p_i(x_i) / q_i(x_i): reject x_i and stop',
          'keep a draft with chance p/q (always, if p ≥ q); stop at the first one dropped.',
        ),
    greedy
      ? L(
          'gfix',
          1,
          'on a rejection at i: add argmax p_i',
          'In its place, take the large model’s top word.',
        )
      : L(
          'left',
          1,
          'on a rejection at i: add t ~ norm(max(0, p_i − q_i))',
          'In its place, draw from what the large model wanted more than the small one gave.',
        ),
    L(
      'bonus',
      1,
      greedy ? 'if all n accepted: add argmax p_(n+1)' : 'if all n accepted: add t ~ p_(n+1)',
      'If every draft stayed, the pass already has the next position: one more word, free.',
    ),
    L(
      'ret',
      1,
      'return the accepted drafts and the added word',
      'The text grows by the drafts kept plus one word, for one large pass.',
    ),
  ];
  return [
    { op: 'start', lines: [L('ssig', 0, 'START(prompt)', 'Begin a new text from a prompt.')] },
    {
      op: 'draft',
      lines: [
        L('sig-d', 0, `DRAFT(prefix, k = ${k})`, 'The small model guesses ahead:'),
        ...draft,
        L('dret', 1, 'return x_1 … x_n', 'Those are the drafts.'),
      ],
    },
    ...(['verify', 'check'] as const).map((op) => ({
      op,
      lines: [L(`sig-${op}`, 0, 'VERIFY(prefix, x_1 … x_n)', 'The large model checks:'), ...verify],
    })),
    ...(['step', 'generate'] as const).map((op) => ({
      op,
      lines: [
        L(
          `sig-${op}`,
          0,
          op === 'step' ? `SPECULATIVE-STEP(prefix, k = ${k})` : 'GENERATE(prompt)',
          op === 'step' ? 'One round:' : 'Repeat rounds until the text ends; each round:',
        ),
        ...draft,
        ...verify,
      ],
    })),
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S): string {
  return `The prompt is ${quote(s.prompt)}. A small model (a bigram from the toy corpus) drafts the next words; a large one (a trigram) checks them all in one pass. Press One round to watch one round, or Generate.`;
}

export const initialVars = (s: S) => baseVars(s);

export function describe(s: S): string {
  const text = `Text: ${words(s).join(' ')}.`;
  const pend = s.pending ? ` Drafts waiting: ${s.pending.drafts.join(' ')}.` : '';
  const last = s.last
    ? ` Last round: ${s.last.drafts.join(' ')} drafted, ${s.last.accepted} accepted${s.last.extra === null ? '' : `, ${s.last.extra} added by the large model`}.`
    : '';
  return `${text}${pend}${last} ${s.stats.large} large passes for ${s.out.length} words.`;
}
