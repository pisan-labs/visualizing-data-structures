import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import {
  closure,
  EPS,
  setName,
  setText,
  sortStates,
  SYMBOL,
  type Automaton,
  type Move,
} from '../_automata/automaton';
import { plural, words } from '../_automata/page';
import { readRegex, regexSize, type UnionSign } from '../_automata/regex';
import { construct, type Construction, type Frag } from './construct';

export interface RxSettings {
  [key: string]: Scalar;
  construction: Construction;
  union: UnionSign;
}

export const defaults: RxSettings = { construction: 'thompson', union: '|' };

/** The longest word a run takes, so the tape stays readable on a phone. */
export const MAX_WORD = 12;

export interface RunState {
  word: string;
  /** Symbols read so far. */
  read: number;
  /** The active states, in name order. */
  set: string[];
  result: 'accept' | 'reject' | null;
}

export interface RxState {
  /** The expression as shown: "eps" read as ε, spaces removed. */
  text: string;
  sign: UnionSign;
  how: Construction;
  /** Symbols and operators in the expression. */
  m: number;
  nfa: Automaton;
  /** Every fragment, in build order. */
  frags: Frag[];
  /** How many fragments are drawn. */
  built: number;
  run: RunState | null;
}

export interface RxExtra {
  /** The arrows just followed. */
  used?: Move[];
  /** The states those arrows left from. */
  from?: string[];
  /** States a closure just added. */
  added?: string[];
}

type S = RxState;
type X = RxExtra;
type RxStep = Step<S, X>;
type Op = OpSpec<S, RxSettings, X>;

export const DEFAULT_TEXT: Record<UnionSign, string> = { '|': '(a|b)*abb', '+': '(a+b)*abb' };

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export function buildState(text: string, settings: RxSettings): S | Error {
  const p = readRegex(text, { union: settings.union });
  if (p instanceof Error) return p;
  const { nfa, frags } = construct(p, settings.construction);
  return {
    text: p.text,
    sign: settings.union,
    how: settings.construction,
    m: regexSize(p.tree.r),
    nfa,
    frags,
    built: frags.length,
    run: null,
  };
}

export function init(settings: RxSettings): S {
  return buildState(DEFAULT_TEXT[settings.union], settings) as S;
}

const NAMES: Record<Construction, string> = {
  thompson: "Thompson's construction",
  sipser: "Sipser's construction",
};

/** States and moves drawn after the first `built` fragments. */
export function drawn(s: S): { states: string[]; moves: Move[] } {
  const parts = s.frags.slice(0, s.built);
  return {
    states: sortStates(parts.flatMap((f) => f.fresh)),
    moves: parts.flatMap((f) => f.added),
  };
}

function buildVars(s: S): Record<string, Scalar> {
  const { states, moves } = drawn(s);
  return {
    m: s.m,
    part: s.built === s.frags.length ? 'all' : `${s.built} of ${s.frags.length}`,
    states: states.length,
    moves: new Set(moves.map((x) => `${x.from}>${x.on}>${x.to}`)).size,
  };
}

function runVars(s: S): Record<string, Scalar> {
  const r = s.run!;
  return { w: r.word || EPS, read: r.read, S: setName(r.set), '|S|': r.set.length };
}

export function initialSay(s: S, settings: RxSettings): string {
  return `${NAMES[settings.construction]} turned ${s.text} into this NFA: ${plural(s.nfa.states.length, 'state')} for an expression with ${plural(s.m, 'symbol or operator', 'symbols and operators')}. Press Build to watch it built one piece at a time, or type a word and press Run.`;
}

export function initialVars(s: S): Record<string, Scalar> {
  return buildVars(s);
}

/** The pseudocode line for a fragment. */
const lineFor = (f: Frag) => `build.${f.kind}`;

function partSay(s: S, k: number): string {
  const f = s.frags[k]!;
  const [a, b] = f.kids.map((j) => s.frags[j]!);
  const t = f.text;
  const [q, r] = f.fresh;
  if (s.how === 'thompson') {
    const fin = f.accepts[0]!;
    switch (f.kind) {
      case 'sym':
        return `${t}: two new states, ${q} and ${r}, and an arrow ${q} → ${r} labeled ${t}. This piece accepts the word ${t} and nothing else.`;
      case 'eps':
        return `ε: two new states, ${q} and ${r}, joined by an ε-arrow. This piece accepts only the empty word.`;
      case 'empty':
        return `∅: two new states, ${q} and ${r}, and no arrow between them. Nothing reaches ${r}, so this piece accepts nothing.`;
      case 'concat':
        return `${t}: an ε-arrow from ${a!.accepts[0]}, where ${a!.text} ends, to ${b!.start}, where ${b!.text} starts. Read ${a!.text}, then ${b!.text}.`;
      case 'union':
        return `${t}: a new start ${f.start} with ε-arrows into both branches, and a new accept state ${fin} that both branches reach. Either branch will do.`;
      case 'opt':
        return `${t}: new states ${f.start} and ${fin}. From ${f.start}, ε-arrows go into ${a!.text} or skip it, and one leaves the end of ${a!.text} to ${fin}. No arrow goes back, so ${a!.text} is read once or not at all.`;
      case 'star':
        return `${t}: new states ${f.start} and ${fin}. From ${f.start}, ε-arrows go into ${a!.text} or skip it. From the end of ${a!.text}, one goes back to repeat it and one leaves to ${fin}.`;
      case 'plus':
        return `${t}: new states ${f.start} and ${fin}. ε-arrows go into ${a!.text}, back from its end to repeat it, and out to ${fin}. There is no skip, so ${a!.text} is read at least once.`;
    }
  }
  const acc = (x: Frag) => (x.accepts.length ? words(x.accepts) : 'none');
  switch (f.kind) {
    case 'sym':
      return `${t}: two states, ${q} and ${r}, and an arrow labeled ${t}. ${r} accepts.`;
    case 'eps':
      return `ε: one state, ${q}, that accepts. It accepts the empty word and nothing else.`;
    case 'empty':
      return `∅: one state, ${q}, that does not accept. This piece accepts nothing.`;
    case 'union':
      return `${t}: a new start ${q} with ε-arrows to ${a!.start} and ${b!.start}, the starts of ${a!.text} and ${b!.text}. Their accept states (${acc(f)}) still accept.`;
    case 'concat':
      if (!a!.accepts.length)
        return `${t}: ${a!.text} has no accept state, so no arrow goes to ${b!.text}. The accept states are ${b!.text}'s, but nothing reaches them: ${t} accepts nothing.`;
      return `${t}: ε-arrows from the accept ${a!.accepts.length === 1 ? 'state' : 'states'} of ${a!.text} (${acc(a!)}) to ${b!.start}, the start of ${b!.text}. Now only ${b!.text}'s accept states accept: ${acc(f)}.`;
    case 'star': {
      const back = a!.accepts.length
        ? ` and ε-arrows from the accept ${a!.accepts.length === 1 ? 'state' : 'states'} of ${a!.text} (${acc(a!)}) back to ${a!.start}`
        : `; ${a!.text} has no accept state, so no arrow goes back`;
      return `${t}: a new start ${q} that accepts, for the empty word, an ε-arrow from it to ${a!.start}${back}.`;
    }
    case 'plus':
      return a!.accepts.length
        ? `${t}: ε-arrows from the accept ${a!.accepts.length === 1 ? 'state' : 'states'} of ${a!.text} (${acc(a!)}) back to its start ${a!.start}, so ${a!.text} can repeat. No new state: ${a!.text} is read at least once.`
        : `${t}: ${a!.text} has no accept state, so there is nothing to repeat and no arrow is added.`;
    case 'opt':
      return `${t}: a new start ${q} that accepts, for the empty word, with an ε-arrow to ${a!.start}, the start of ${a!.text}.`;
  }
}

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [arg], { settings }) {
    const text = String(arg ?? '');
    const next = buildState(text, settings);
    if (next instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing built. ${next.message} The NFA stays as it was.`,
        lines: ['build.sig'],
        vars: buildVars(s),
        level: 1,
      } satisfies RxStep;
      return s;
    }
    const n = next.frags.length;
    const cells = (span: [number, number] | null, role: MarkRole) =>
      span
        ? Array.from({ length: span[1] - span[0] }, (_, i) => mark(`rx-${span[0] + i}`, role))
        : [];
    const start: S = { ...next, built: 0 };
    yield {
      state: start,
      marks: [],
      say: `build(${next.text}): ${plural(n, 'part')}, built from the inside out, children before parents. Each part becomes a small NFA, a piece, made from the pieces of its parts.`,
      lines: ['build.sig', 'build.each'],
      vars: buildVars(start),
      level: 2,
    } satisfies RxStep;
    for (let k = 0; k < n; k++) {
      const f = next.frags[k]!;
      const st: S = { ...next, built: k + 1 };
      yield {
        state: st,
        marks: [
          ...f.fresh.map((q) => mark(stateId(q), 'new')),
          ...f.added.map((x) => mark(moveId(x.from, x.to), 'new')),
          ...cells(f.span, 'active'),
        ],
        say: partSay(st, k),
        lines: [lineFor(f)],
        vars: buildVars(st),
        level: 2,
      } satisfies RxStep;
    }
    const fin = next.nfa.accept;
    const twoM =
      next.how === 'thompson'
        ? ` That is exactly 2m: 2 states for each symbol and operator.`
        : ` That is at most 2m: at most 2 states for each symbol and operator.`;
    yield {
      state: next,
      marks: [mark('start', 'active'), ...fin.map((q) => mark(stateId(q), 'found'))],
      say: `Done: the NFA for ${next.text} has ${plural(next.nfa.states.length, 'state')} and ${plural(next.nfa.moves.length, 'move')}, with start ${next.nfa.start} and ${fin.length === 1 ? `accept state ${fin[0]}` : fin.length ? `accept states ${words(fin)}` : 'no accept state'}. The expression has m = ${next.m} symbols and operators.${twoM}`,
      lines: ['build.return'],
      vars: buildVars(next),
      level: 1,
    } satisfies RxStep;
    return next;
  },
};

/** A word from the input: letters and digits, or ε (also eps) for the empty word. */
export function readWord(raw: string): string | Error {
  const w = raw.replace(/\s+/g, '');
  if (w === '' || w === EPS || w === 'eps') return '';
  const bad = [...w].find((c) => !SYMBOL.test(c));
  if (bad)
    return new Error(
      /[|*+?()∅]/.test(bad)
        ? `"${w}" looks like an expression. A word is letters and digits; to make an NFA from an expression, press Build.`
        : `"${bad}" is not a symbol. A word is letters and digits, or ε for the empty word.`,
    );
  if (w.length > MAX_WORD) return new Error(`Keep the word to ${MAX_WORD} symbols or fewer.`);
  return w;
}

const epsFrom = (a: Automaton, set: readonly string[]) =>
  a.moves.filter((m) => m.on === EPS && set.includes(m.from));

function closureSay(before: string[], after: string[], first: boolean): string {
  const added = after.filter((q) => !before.includes(q));
  if (!added.length) return `No ε-arrow leads anywhere new, so S stays ${setText(after)}.`;
  const lead = first
    ? `Follow ε-arrows from ${words(before)}: S = ε-closure(S) = ${setText(after)}. Before reading anything, the NFA can be in any of these ${after.length} states.`
    : `Follow ε-arrows: ${words(added)} join, so S = ${setText(after)}.`;
  return lead;
}

const run: Op = {
  label: 'Run',
  arity: 1,
  *run(s, [arg]) {
    const w = readWord(String(arg ?? ''));
    const a = s.nfa;
    const full: S = { ...s, built: s.frags.length };
    if (w instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing run. ${w.message}`,
        lines: ['run.sig'],
        vars: buildVars(s),
        level: 1,
      } satisfies RxStep;
      return s;
    }
    const shown = w || EPS;
    const at = (read: number, set: string[], result: RunState['result'] = null): S => ({
      ...full,
      run: { word: w, read, set, result },
    });
    let st = at(0, [a.start]);
    yield {
      state: st,
      marks: [mark(stateId(a.start), 'active')],
      say: `run(${shown}): start with S = ${setText([a.start])}, the start state.${w ? '' : ' The word is empty, so there is nothing to read.'}`,
      lines: ['run.sig', 'run.start'],
      vars: runVars(st),
      level: 2,
    } satisfies RxStep;
    let set = closure(a, [a.start]);
    st = at(0, set);
    yield {
      state: st,
      marks: set.filter((q) => q !== a.start).map((q) => mark(stateId(q), 'visit')),
      say: closureSay([a.start], set, true),
      lines: ['run.close0'],
      vars: runVars(st),
      level: 2,
      extra: { used: epsFrom(a, set), added: set.filter((q) => q !== a.start) },
    } satisfies RxStep;
    for (let i = 0; i < w.length; i++) {
      const c = w[i]!;
      const used = a.moves.filter((m) => m.on === c && set.includes(m.from));
      const moved = sortStates(used.map((m) => m.to));
      st = at(i, moved);
      const where = `symbol ${i + 1} of ${w.length}`;
      yield {
        state: st,
        marks: [
          mark(`tape-${i}`, 'active'),
          ...set.filter((q) => !moved.includes(q)).map((q) => mark(stateId(q), 'visit')),
        ],
        say: moved.length
          ? `Read ${c}, ${where}: the ${c}-arrows out of S lead to ${setText(moved)}.`
          : `Read ${c}, ${where}: no state in S has a ${c}-arrow, so S is empty.`,
        lines: ['run.loop', 'run.move'],
        vars: { ...runVars(st), c },
        level: 2,
        extra: { used, from: set },
      } satisfies RxStep;
      if (!moved.length) {
        st = at(i + 1, [], 'reject');
        yield {
          state: st,
          marks: [mark('result', 'error')],
          say: `S is empty: every path has died. The NFA rejects ${shown} without reading the rest.`,
          lines: ['run.dead'],
          vars: runVars(st),
          level: 1,
        } satisfies RxStep;
        return st;
      }
      const next = closure(a, moved);
      st = at(i + 1, next);
      yield {
        state: st,
        marks: next.filter((q) => !moved.includes(q)).map((q) => mark(stateId(q), 'visit')),
        say: closureSay(moved, next, false),
        lines: ['run.closure'],
        vars: runVars(st),
        level: 2,
        extra: { used: epsFrom(a, next), added: next.filter((q) => !moved.includes(q)) },
      } satisfies RxStep;
      set = next;
    }
    const good = set.filter((q) => a.accept.includes(q));
    st = at(w.length, set, good.length ? 'accept' : 'reject');
    yield {
      state: st,
      marks: good.length
        ? [mark('result', 'found'), ...good.map((q) => mark(stateId(q), 'found'))]
        : [mark('result', 'error')],
      say: good.length
        ? `${w ? `All of ${shown} is read` : 'Nothing to read'}. S contains ${words(good)}, ${good.length === 1 ? 'an accept state' : 'accept states'}, so the NFA accepts ${shown}.`
        : `${w ? `All of ${shown} is read` : 'Nothing to read'}. No state of S = ${setText(set)} is an accept state, so the NFA rejects ${shown}.`,
      lines: [good.length ? 'run.accept' : 'run.reject'],
      vars: runVars(st),
      level: 1,
    } satisfies RxStep;
    return st;
  },
};

export const ops = { build, run };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: RxSettings): PseudoBlock[] {
  const u = settings.union;
  const thompson = settings.construction === 'thompson';
  const plus = u === '|';
  const buildLines = thompson
    ? [
        L('build.sig', 0, 'build(R)', 'To build an NFA for R:'),
        L(
          'build.each',
          1,
          'for each part P of R, inner parts first',
          'Take the parts of R from the inside out. Each becomes a piece with a start s and one accept state f.',
        ),
        L(
          'build.sym',
          2,
          'P = a: new s, f; s a→ f',
          'A symbol: two new states and an arrow labeled with it.',
        ),
        L('build.eps', 2, 'P = ε: new s, f; s ε→ f', 'ε: two new states and an ε-arrow.'),
        L('build.empty', 2, 'P = ∅: new s, f', '∅: two new states and no arrow.'),
        L(
          'build.union',
          2,
          `P = R1${u}R2: new s, f; s ε→ s1, s2; f1, f2 ε→ f`,
          'Union: a new start that goes into either piece, and a new accept state that both reach.',
        ),
        L(
          'build.concat',
          2,
          'P = R1R2: f1 ε→ s2',
          'Concatenation: an ε-arrow from the end of the first piece to the start of the second.',
        ),
        L(
          'build.star',
          2,
          'P = R1*: new s, f; s ε→ s1, f; f1 ε→ s1, f',
          'Star: new start and accept states, an arrow that skips the piece and one that repeats it.',
        ),
        ...(plus
          ? [
              L(
                'build.plus',
                2,
                'P = R1+: new s, f; s ε→ s1; f1 ε→ s1, f',
                'One or more: the star without the arrow that skips.',
              ),
            ]
          : []),
        L(
          'build.opt',
          2,
          `P = R1?: build R1${u}ε`,
          'Optional: R1 or nothing, built as a union with ε.',
        ),
        L('build.return', 1, 'return the piece for R', 'The last piece built is the whole NFA.'),
      ]
    : [
        L('build.sig', 0, 'build(R)', 'To build an NFA for R:'),
        L(
          'build.each',
          1,
          'for each part P of R, inner parts first',
          'Take the parts of R from the inside out. Each becomes a piece with a start q and a set F of accept states.',
        ),
        L(
          'build.sym',
          2,
          'P = a: new q, f; q a→ f; F = {f}',
          'A symbol: two states and an arrow labeled with it. The second accepts.',
        ),
        L('build.eps', 2, 'P = ε: new q; F = {q}', 'ε: one state, which accepts.'),
        L('build.empty', 2, 'P = ∅: new q; F = ∅', '∅: one state, which does not accept.'),
        L(
          'build.union',
          2,
          `P = R1${u}R2: new q; q ε→ q1, q2; F = F1 ∪ F2`,
          "Union: a new start with ε-arrows to both starts. Both pieces' accept states still accept.",
        ),
        L(
          'build.concat',
          2,
          'P = R1R2: f ε→ q2 for each f in F1; F = F2',
          "Concatenation: ε-arrows from the first piece's accept states to the second's start. Only the second's accept states still accept.",
        ),
        L(
          'build.star',
          2,
          'P = R1*: new q; q ε→ q1; f ε→ q1 for each f in F1; F = F1 ∪ {q}',
          'Star: a new start that accepts, an ε-arrow from it to the old start, and ε-arrows from the accept states back to the old start.',
        ),
        ...(plus
          ? [
              L(
                'build.plus',
                2,
                'P = R1+: f ε→ q1 for each f in F1',
                'One or more (not in Sipser): the arrows back to the start, without the new start.',
              ),
            ]
          : []),
        L(
          'build.opt',
          2,
          'P = R1?: new q; q ε→ q1; F = F1 ∪ {q}',
          'Optional (not in Sipser): a new start that accepts, with an ε-arrow to the old start.',
        ),
        L('build.return', 1, 'return the piece for R', 'The last piece built is the whole NFA.'),
      ];
  return [
    { op: 'build', lines: buildLines },
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'run(w)', 'To run the NFA on a word w:'),
        L('run.start', 1, 'S = {q0}', 'Start in the start state.'),
        L('run.close0', 1, 'S = ε-closure(S)', 'Add every state the ε-arrows reach from there.'),
        L('run.loop', 1, 'for each symbol c of w', 'Read w one symbol at a time.'),
        L('run.move', 2, 'S = move(S, c)', 'Follow every c-arrow out of S, all at once.'),
        L('run.dead', 2, 'if S = ∅: reject', 'If no state is left, no path can accept: reject.'),
        L('run.closure', 2, 'S = ε-closure(S)', 'Add every state the ε-arrows reach.'),
        L('run.accept', 1, 'if S ∩ F ≠ ∅: accept', 'Accept if some state in S is an accept state.'),
        L('run.reject', 1, 'else reject', 'Otherwise reject.'),
      ],
    },
  ];
}

export function describe(s: S): string {
  const a = s.nfa;
  const fin = a.accept.length ? `accept ${words(a.accept)}` : 'no accept state';
  const head =
    s.built === s.frags.length
      ? `An NFA for ${s.text}, made by ${NAMES[s.how]}: ${plural(a.states.length, 'state')} and ${plural(a.moves.length, 'move')}, start ${a.start}, ${fin}.`
      : `Building an NFA for ${s.text} by ${NAMES[s.how]}: ${s.built} of ${plural(s.frags.length, 'part')} built, ${plural(drawn(s).states.length, 'state')} so far.`;
  const r = s.run;
  if (!r) return head;
  const word = r.word || EPS;
  const set = r.set.length ? `active states ${words(r.set)}` : 'no active state';
  const end = r.result ? ` The NFA ${r.result}s ${word}.` : '';
  return `${head} Running on ${word}: ${r.read} of ${plural(r.word.length, 'symbol')} read, ${set}.${end}`;
}
