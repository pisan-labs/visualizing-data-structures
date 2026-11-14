/**
 * Constrained decoding with a DFA (fsm.ts has the parts): compile a regex, build the index of
 * allowed tokens per state, and generate with the toy model's logits masked by it.
 *
 * Operations
 *   compile(regex)  the DFA, ready for a new text
 *   index           σ(q) for every state, built once (each token walked from each state)
 *   next            one token: logits, mask, softmax, the pick, the move in the DFA
 *   generate        tokens until </s>, MAX_TOKENS, or no token can continue
 *
 * Settings
 *   mask     on: the regex constrains the text (the default); off: the plain model, to show
 *            what it would write without the mask
 *   index    'precompute' (Outlines: build σ once, then each step is a lookup) or 'scan' (walk
 *            every token from the current state at every step)
 *   decode   'greedy' (the largest probability) or 'sample' (a seeded u, the tokens laid end to
 *            end in the table's order)
 *
 * Counter: DFA lookups (one per letter a walk reads), split into index and per-step work.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import type { Automaton } from '../_automata/automaton';
import { round3, softmax, two } from '../_lm/numbers';
import {
  BOS,
  buildIndex,
  compile,
  END,
  logitsAfter,
  matches,
  VOCAB,
  walk,
  type Compiled,
  type Index,
} from './fsm';

export const MAX_TOKENS = 8;
export const START_REGEX = 'yes|no';

export interface ConSettings {
  [key: string]: Scalar;
  mask: boolean;
  index: 'precompute' | 'scan';
  decode: 'greedy' | 'sample';
}

export const defaults: ConSettings = { mask: true, index: 'precompute', decode: 'greedy' };

/** A token generated, and where it took the DFA (null: off it, into the dead state). */
export interface Gen {
  tok: number;
  from: string | null;
  to: string | null;
}

/** One choice of the next token, as the picture shows it. */
export interface Choice {
  prev: string;
  from: string | null;
  logits: number[];
  /**
   * The end state of each token from `from`, or null where masked (undefined: not checked yet);
   * null when not masking.
   */
  allowed: (string | null | undefined)[] | null;
  masked: number[];
  p: number[];
  u: number | null;
  pick: number;
}

export interface ConState {
  c: Compiled;
  index: Index | null;
  out: Gen[];
  /** The DFA's state after the text so far (null: the text has left the regex). */
  state: string | null;
  done: 'end' | 'max' | 'stuck' | null;
  lookups: { index: number; steps: number };
  /** Tokens generated, over every text since the regex was compiled. */
  tokens: number;
  last?: Choice;
}

/** Index rows as they fill: undefined for a token not walked yet. */
export type Rows = Map<string, (string | null | undefined)[]>;

const copyRows = (r: Rows): Rows => new Map([...r].map(([q, row]) => [q, [...row]]));

export interface ConWork {
  stage: 'compile' | 'index' | 'logits' | 'mask' | 'pick';
  /** While indexing: the state being filled, the token being walked, the rows so far. */
  q?: string;
  t?: number;
  rows?: Rows;
  choice?: Choice;
  /** The states a token walk passes through. */
  path?: string[];
}

export interface ConExtra {
  work?: ConWork;
}

type S = ConState;
type X = ConExtra;
type Op = OpSpec<S, ConSettings, X>;
type CStep = Step<S, X>;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const tokKey = (k: number) => (k === 0 ? 'eos' : VOCAB[k]!);
export const outId = (i: number) => `out-${i}`;
export const stateMark = (q: string) => `s-${q}`;

export const textOf = (s: S): string =>
  s.out
    .map((g) => VOCAB[g.tok]!)
    .filter((t) => t !== END)
    .join('');
export const prevOf = (s: S): string => {
  const g = s.out.at(-1);
  return g ? VOCAB[g.tok]! : BOS;
};

export function compiledState(c: Compiled): S {
  return {
    c,
    index: null,
    out: [],
    state: c.dfa.start,
    done: null,
    lookups: { index: 0, steps: 0 },
    tokens: 0,
  };
}

export function init(): S {
  return compiledState(compile(START_REGEX) as Compiled);
}

// ---------------------------------------------------------------------------------------------
// Input

export function readRegexInput(raw: Value | undefined): Compiled | Error {
  return compile(String(raw ?? '').trim());
}

export function parseInput(text: string): Value | Error {
  const c = compile(text.trim());
  return c instanceof Error ? c : c.text;
}

// ---------------------------------------------------------------------------------------------
// Steps

export function baseVars(s: S): Record<string, Scalar> {
  return {
    states: s.c.dfa.states.length,
    tokens: VOCAB.length,
    'index lookups': s.lookups.index,
    'step lookups': s.lookups.steps,
    'DFA lookups': s.lookups.index + s.lookups.steps,
    generated: s.tokens,
  };
}

const err = (s: S, message: string): CStep => ({
  state: s,
  marks: [],
  say: message,
  lines: [],
  level: 1,
  vars: baseVars(s),
});

const show = (t: string) => (t === END ? '</s>' : t);
const listOf = (xs: readonly string[]) =>
  xs.length === 0
    ? 'nothing'
    : xs.length === 1
      ? xs[0]!
      : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

/** The index rows, one step per state (level 2) and one per token walk (level 3). */
function* indexSteps(s: S, level: 2 | 3): Generator<CStep, S, void> {
  const { dfa } = s.c;
  let lookups = 0;
  const rows: Rows = new Map();
  const vars = () => ({
    ...baseVars(s),
    'index lookups': s.lookups.index + lookups,
    'DFA lookups': s.lookups.index + lookups + s.lookups.steps,
  });
  for (const [qi, q] of dfa.states.entries()) {
    const row: (string | null | undefined)[] = VOCAB.map(() => undefined);
    rows.set(q, row);
    for (let t = 0; t < VOCAB.length; t++) {
      const w = walk(dfa, q, VOCAB[t]!);
      lookups += w.lookups;
      row[t] = w.to;
      if (t === 0) continue;
      const tok = VOCAB[t]!;
      yield {
        state: s,
        marks: [
          mark(stateMark(q), 'active'),
          mark(`ix${qi}-${tokKey(t)}`, w.to ? 'found' : 'error'),
        ],
        say:
          w.to === null
            ? `From ${q}, ${tok}: ${w.lookups === 1 ? `${tok[0]} has` : `after ${tok.slice(0, w.lookups - 1)}, ${tok[w.lookups - 1]} has`} no move from ${w.path.at(-1)}, so the text would leave the regex. Masked.`
            : `From ${q}, ${tok} reads ${w.lookups} letter${w.lookups === 1 ? '' : 's'} and ends in ${w.to}${w.lookups > 1 ? `, crossing ${w.lookups} moves` : ''}. Allowed.`,
        lines: ['ifor', 'iwalk'],
        level: 3,
        vars: vars(),
        extra: { work: { stage: 'index', q, t, rows: copyRows(rows), path: w.path } },
      };
    }
    const ok = row.flatMap((to, t) => (to === null ? [] : [show(VOCAB[t]!)]));
    yield {
      state: s,
      marks: [mark(stateMark(q), 'active')],
      say: `σ(${q}): ${ok.length} of the ${VOCAB.length} tokens keep the text on the regex from ${q}: ${listOf(ok)}.${dfa.accept.includes(q) ? ` ${q} accepts, so </s> is allowed there.` : ''}`,
      lines: ['ifor', 'iend'],
      level,
      vars: vars(),
      extra: { work: { stage: 'index', q, rows: copyRows(rows) } },
    };
    void qi;
  }
  const built = buildIndex(dfa);
  return {
    ...s,
    index: built.index,
    lookups: { ...s.lookups, index: s.lookups.index + built.lookups },
  };
}

/** Build the index into a state, with its steps, unless it is built already. */
function* withIndex(s: S, level: 2 | 3): Generator<CStep, S, void> {
  if (s.index) return s;
  return yield* indexSteps(s, level);
}

/** One token: logits, mask, softmax, pick. Returns the state after it. */
function* tokenSteps(
  s: S,
  settings: ConSettings,
  next: () => number,
  level: 2 | 3,
): Generator<CStep, S, void> {
  const prev = prevOf(s);
  const from = s.state;
  const logits = logitsAfter(prev);
  const { dfa } = s.c;
  let steps = s.lookups.steps;
  let allowed: (string | null | undefined)[] | null = null;
  const vars = () => ({
    ...baseVars(s),
    'step lookups': steps,
    'DFA lookups': s.lookups.index + steps,
  });
  const base: Choice = {
    prev,
    from,
    logits,
    allowed: null,
    masked: logits,
    p: [],
    u: null,
    pick: -1,
  };
  const say0 = `The model reads ${prev === BOS ? 'the prompt' : `"${prev}"`} and scores all ${VOCAB.length} tokens. Its favourite is ${show(VOCAB[logits.indexOf(Math.max(...logits))]!)} (${two(Math.max(...logits))}).`;
  yield {
    state: s,
    marks: VOCAB.map((_, k) => mark(`l-${tokKey(k)}`, 'new')),
    say: say0,
    lines: ['nlog'],
    level,
    vars: vars(),
    extra: { work: { stage: 'logits', choice: base } },
  };
  if (settings.mask && from !== null) {
    if (settings.index === 'scan') {
      const row: (string | null | undefined)[] = VOCAB.map(() => undefined);
      for (let t = 0; t < VOCAB.length; t++) {
        const w = walk(dfa, from, VOCAB[t]!);
        steps += w.lookups;
        row[t] = w.to;
        if (t === 0) continue;
        yield {
          state: s,
          marks: [
            mark(`a-${tokKey(t)}`, w.to ? 'found' : 'error'),
            mark(stateMark(from), 'active'),
          ],
          say: `Check ${VOCAB[t]} from ${from} now: ${w.to ? `it ends in ${w.to}` : 'it falls off the DFA'} (${w.lookups} lookup${w.lookups === 1 ? '' : 's'}).`,
          lines: ['nscan'],
          level: 3,
          vars: vars(),
          extra: { work: { stage: 'mask', choice: { ...base, allowed: [...row] }, path: w.path } },
        };
      }
      allowed = row;
    } else allowed = s.index!.get(from)!;
  }
  const masked = logits.map((l, k) => (allowed && !allowed[k] ? -Infinity : l));
  const fav = logits.indexOf(Math.max(...logits));
  const live = masked.filter((l) => l > -Infinity).length;
  if (allowed) {
    const ok = allowed.flatMap((to, k) => (to ? [show(VOCAB[k]!)] : []));
    yield {
      state: s,
      marks: VOCAB.map((_, k) => mark(`m-${tokKey(k)}`, allowed![k] ? 'found' : 'remove')),
      say: live
        ? `${settings.index === 'scan' ? `Walking every token from ${from} cost ${steps - s.lookups.steps} lookups this step.` : `Look up σ(${from}) in the index: no walking needed.`} Allowed: ${listOf(ok)}. Every other logit becomes −∞${allowed[fav] ? '' : `, the model's favourite ${show(VOCAB[fav]!)} among them`}.`
        : `No token can continue from ${from}: the regex needs a letter no token here spells.`,
      lines: settings.index === 'scan' ? ['nscan', 'nmask'] : ['nlook', 'nmask'],
      level: 2,
      vars: vars(),
      extra: { work: { stage: 'mask', choice: { ...base, allowed, masked } } },
    };
  }
  if (!live) {
    const after: S = { ...s, done: 'stuck', lookups: { ...s.lookups, steps } };
    return after;
  }
  const sm = softmax(masked).p;
  const greedy = settings.decode === 'greedy';
  const u = greedy ? null : next();
  let pick = 0;
  if (u === null) {
    for (let k = 1; k < VOCAB.length; k++) if (sm[k]! > sm[pick]!) pick = k;
  } else {
    let cum = 0;
    pick = -1;
    for (let k = 0; k < VOCAB.length; k++) {
      cum += sm[k]!;
      if (pick < 0 && u < cum) pick = k;
    }
    if (pick < 0) pick = sm.reduce((b, v, k) => (v > 0 ? k : b), 0);
  }
  const choice: Choice = { ...base, allowed, masked, p: sm, u, pick };
  const tok = VOCAB[pick]!;
  const to = from === null ? null : allowed ? (allowed[pick] ?? null) : walk(dfa, from, tok).to;
  const top = [...sm.keys()]
    .filter((k) => sm[k]! > 0)
    .sort((a, b) => sm[b]! - sm[a]!)
    .slice(0, 3);
  yield {
    state: s,
    marks: [mark(`p-${tokKey(pick)}`, 'found'), mark(`w-${tokKey(pick)}`, 'found')],
    say:
      live === 1
        ? `Only ${show(tok)} is left, so it gets all the probability and is taken${u === null ? '' : ` whatever u is (u = ${round3(u)})`}.`
        : `${live === VOCAB.length ? 'Softmax over every token' : `Softmax over the ${live} tokens left`}: ${top.map((k) => `${show(VOCAB[k]!)} ${two(sm[k]!)}`).join(', ')}. ${u === null ? `Greedy takes ${show(tok)}.` : `Draw u = ${round3(u)}, laying the tokens end to end in the table's order: ${show(tok)}.`}`,
    lines: greedy ? ['nsoft', 'ngreedy'] : ['nsoft', 'ndraw'],
    level: 2,
    vars: vars(),
    extra: {
      work: {
        stage: 'pick',
        choice,
        path: from && tok !== END ? walk(dfa, from, tok).path : undefined,
      },
    },
  };
  const out = [...s.out, { tok: pick, from, to }];
  const done = tok === END ? 'end' : out.length >= MAX_TOKENS ? 'max' : null;
  return {
    ...s,
    out,
    state: tok === END ? from : to,
    done,
    lookups: { ...s.lookups, steps },
    tokens: s.tokens + 1,
    last: choice,
  };
}

function verdict(s: S): string {
  const text = textOf(s);
  const ok = s.state !== null && matches(s.c.dfa, text) && s.done === 'end';
  const shown = text ? `"${text}"` : 'the empty text';
  if (s.done === 'stuck')
    return `Stuck at ${s.state}: no token of the vocabulary can continue, so ${shown} is not a match.`;
  if (s.done === 'max')
    return `Stopped after ${MAX_TOKENS} tokens: ${shown}${matches(s.c.dfa, text) ? ' matches so far' : ' is not a match yet'}.`;
  return ok
    ? `The text is ${shown}, and it matches ${s.c.text}.`
    : `The text is ${shown}, which does not match ${s.c.text}.`;
}

/** A state ready for a new token: a new text if the last one is finished. */
function* fresh(s: S, level: 2 | 3): Generator<CStep, S, void> {
  if (!s.done) return s;
  const next: S = { ...s, out: [], state: s.c.dfa.start, done: null, last: undefined };
  yield {
    state: next,
    marks: [],
    say: `Start a new text from ${s.c.dfa.start}.${s.index ? ' The index is already built, so it is used again as it is.' : ''}`,
    lines: [],
    level,
    vars: baseVars(next),
  };
  return next;
}

const compileOp: Op = {
  label: 'Compile',
  arity: 1,
  *run(s, args) {
    const c = readRegexInput(args[0]);
    if (c instanceof Error) {
      yield err(s, c.message);
      return s;
    }
    const next = compiledState(c);
    yield {
      state: next,
      marks: [],
      say: `Thompson's construction turns ${c.text} into an NFA with ${c.nfaStates} states (see Regex to NFA). The subset construction makes it a DFA with ${c.subsetStates}.`,
      lines: ['cnfa', 'cdfa'],
      level: 2,
      vars: baseVars(next),
      extra: { work: { stage: 'compile' } },
    };
    yield {
      state: next,
      marks: c.dfa.states.map((q) => mark(stateMark(q), 'new')),
      say: `Minimized, it has ${c.minStates} state${c.minStates === 1 ? '' : 's'}${c.dead ? `; drop the dead state, the one no match can leave, and ${c.dfa.states.length} are left` : ''}. Every state left can still reach an accepting state, so a token that stays on the DFA keeps a match possible. Press Index, or Generate.`,
      lines: ['cmin'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

const indexOp: Op = {
  label: 'Index',
  arity: 0,
  *run(s) {
    if (s.index) {
      yield {
        ...err(s, `The index for ${s.c.text} is already built: it is built once per regex.`),
        extra: { work: { stage: 'index', rows: s.index } },
      };
      return s;
    }
    const next = yield* withIndex(s, 2);
    const pairs = [...next.index!.values()].reduce(
      (t, row) => t + row.filter((x) => x !== null).length,
      0,
    );
    yield {
      state: next,
      marks: next.c.dfa.states.map((q) => mark(stateMark(q), 'found')),
      say: `The index is built: ${pairs} allowed (state, token) pairs, for ${next.lookups.index} lookups in all. From now on each step reads one row of it.`,
      lines: ['iret'],
      level: 1,
      vars: baseVars(next),
    };
    return next;
  },
};

function* oneToken(
  s: S,
  settings: ConSettings,
  next: () => number,
  level: 2 | 3,
): Generator<CStep, S, void> {
  let st = yield* fresh(s, level);
  if (settings.mask && settings.index === 'precompute') st = yield* withIndex(st, 3);
  return yield* tokenSteps(st, settings, next, level);
}

const nextOp: Op = {
  label: 'Next token',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    const after = yield* oneToken(s, settings, () => rng.next(), 2);
    const g = after.out.at(-1);
    const said =
      after.done === 'stuck'
        ? verdict(after)
        : `${show(VOCAB[g!.tok]!)}: ${g!.to === null && g!.tok !== 0 ? 'the text has left the regex' : `the DFA is now in ${after.state}`}. ${after.done ? verdict(after) : `Text so far: "${textOf(after)}".`}`;
    yield {
      state: after,
      marks: after.out.length ? [mark(outId(after.out.length - 1), 'found')] : [],
      say: said,
      lines: after.done ? ['nstop'] : ['nmove'],
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
    let st = yield* fresh(s, 2);
    const next = () => rng.next();
    if (settings.mask && settings.index === 'precompute') st = yield* withIndex(st, 3);
    while (!st.done) {
      st = yield* tokenSteps(st, settings, next, 3);
      const g = st.done === 'stuck' ? undefined : st.out.at(-1);
      if (g)
        yield {
          state: st,
          marks: [mark(outId(st.out.length - 1), 'found')],
          say: `${show(VOCAB[g.tok]!)}${g.tok !== 0 ? (g.to === null ? ': off the regex' : ` → ${g.to}`) : ''}. Text so far: "${textOf(st)}".`,
          lines: ['nmove'],
          level: 3,
          vars: baseVars(st),
        };
    }
    yield {
      state: st,
      marks: st.out.map((_, i) => mark(outId(i), st.state === null ? 'error' : 'found')),
      say: `${verdict(st)} ${st.out.length} token${st.out.length === 1 ? '' : 's'}; ${st.lookups.index + st.lookups.steps} DFA lookups so far (${st.lookups.index} building the index, ${st.lookups.steps} during steps).`,
      lines: ['nstop'],
      level: 1,
      vars: baseVars(st),
    };
    return st;
  },
};

export const ops = { compile: compileOp, index: indexOp, next: nextOp, generate: generateOp };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: ConSettings): PseudoBlock[] {
  const scan = settings.index === 'scan';
  const greedy = settings.decode === 'greedy';
  const mask = settings.mask;
  const step = (d: number) => [
    L(
      'nlog',
      d,
      'z = model(prev token)',
      'The model scores every token, knowing nothing of the regex.',
    ),
    ...(mask
      ? scan
        ? [
            L(
              'nscan',
              d,
              'for each token t: walk t from q',
              'Walk every token from the current state, now.',
            ),
            L('nmask', d, 'z_t = −∞ for every t that falls off', 'Give the ones that fall off −∞.'),
          ]
        : [
            L('nlook', d, 'allowed = σ(q)', 'Read the allowed tokens from the index.'),
            L('nmask', d, 'z_t = −∞ for every t not in σ(q)', 'Give every other token −∞.'),
          ]
      : []),
    L('nsoft', d, 'p = softmax(z)', 'Turn the scores into probabilities.'),
    greedy
      ? L('ngreedy', d, 't = argmax p', 'Take the most likely token.')
      : L('ndraw', d, 't = the token whose stretch of [0, 1) holds u', 'Draw one at random.'),
    L(
      'nmove',
      d,
      mask ? 'q = σ(q)[t]' : 'q = δ*(q, t) (it may fall off)',
      mask ? 'Move the DFA to where the token ends.' : 'Move the DFA, if the token lets it.',
    ),
    L('nstop', d, 'stop at </s>', 'Stop at the end token.'),
  ];
  return [
    {
      op: 'compile',
      lines: [
        L('csig', 0, 'COMPILE(regex)', 'Turn the regex into a machine:'),
        L('cnfa', 1, 'N = THOMPSON(regex)', 'build an NFA,'),
        L('cdfa', 1, 'D = SUBSET-CONSTRUCTION(N)', 'make it deterministic,'),
        L('cmin', 1, 'D = MINIMIZE(D) minus its dead state', 'and make it as small as it goes.'),
      ],
    },
    {
      op: 'index',
      lines: [
        L('isig', 0, 'BUILD-INDEX(D, V)', 'Once per regex:'),
        L('ifor', 1, 'for each state q, for each token t', 'for every state and every token,'),
        L(
          'iwalk',
          2,
          'walk t letter by letter from q',
          'read the token’s letters one move at a time;',
        ),
        L(
          'iend',
          2,
          'if it never falls off: σ(q)[t] = the state reached',
          'if it stays on the DFA, the token is allowed there.',
        ),
        L('iret', 1, 'return σ', 'That table is the index.'),
      ],
    },
    {
      op: 'next',
      lines: [L('xsig', 0, 'NEXT-TOKEN(q, prev)', 'Choose one token:'), ...step(1)],
    },
    {
      op: 'generate',
      lines: [
        L('gsig', 0, 'GENERATE(D)', 'Write a text the regex accepts:'),
        ...(mask && !scan
          ? [L('gidx', 1, 'σ = BUILD-INDEX(D, V), if not built', 'Build the index once.')]
          : []),
        L('gloop', 1, 'q = start; repeat:', 'From the start state, again and again:'),
        ...step(2),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Words for screen readers and narration

export function initialSay(s: S): string {
  return `The regex is ${s.c.text}, compiled to a DFA with ${s.c.dfa.states.length} states. The model has been asked a yes-or-no question, but it would rather say yeah. Press Generate to decode with the mask, or turn the mask off in Options to see what it writes without one.`;
}

export const initialVars = (s: S) => baseVars(s);

export function describe(s: S): string {
  const a: Automaton = s.c.dfa;
  const moves = a.moves.map((m) => `${m.from} ${m.on} ${m.to}`).join(', ');
  return `Regex ${s.c.text}: a DFA with states ${a.states.join(', ')}, start ${a.start}, accepting ${a.accept.join(', ')}; moves ${moves}. Text so far: "${textOf(s)}"${s.state ? `, in state ${s.state}` : ', off the regex'}.`;
}
