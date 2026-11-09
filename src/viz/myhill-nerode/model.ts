/**
 * The Myhill–Nerode theorem: a language is regular exactly when ≡_L has finitely many classes,
 * and then the classes are the states of the minimal DFA. x ≡_L y when no suffix z tells them
 * apart (xz ∈ L exactly when yz ∈ L).
 *
 * Operations:
 * - Load a language (src/viz/myhill-nerode/language.ts).
 * - Find classes: start with ε as the first class; for each class's word x, in order, and each
 *   symbol c, compare xc with every class's word so far. If some class's word is equivalent, xc
 *   joins that class, and the class of x goes to it on c; if a suffix tells xc apart from every
 *   one, xc starts a new class. When every class has a move on every symbol, the classes are the
 *   states of the minimal DFA. A language with infinitely many classes never closes: the search
 *   stops at MAX_CLASSES.
 * - Words apart: the shortest suffix that tells each pair of the words typed apart. Words that
 *   are pairwise apart need that many states in every DFA.
 * - Infinitely many: for a language with no DFA, the words ε, a, aa, ... and the suffix that
 *   tells aⁱ from aʲ (bⁱ), so no number of states is enough.
 *
 * Each operation works out its whole result first and shows it a step at a time, so the drawing
 * keeps its room through the operation.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { moveId, stateId } from '../../layouts/automaton';
import { makeAutomaton, type Automaton, type Move } from '../_automata/automaton';
import {
  NAMED,
  alphabetOf,
  apart,
  label,
  member,
  parseLanguage,
  wordText,
  type Language,
} from './language';

export interface MnSettings {
  [key: string]: Scalar;
  /** Draw the class of words that can never reach L (Sipser's DFAs are complete), or leave it out. */
  dead: 'show' | 'hide';
}

export const defaults: MnSettings = { dead: 'show' };

export const START_TEXT = '(a|b)*ab';
export const MAX_CLASSES = 8;
/** A language with no DFA stops sooner: its classes only go on. */
export const MAX_NAMED = 6;
export const capOf = (l: Language) => (l.kind === 'named' ? MAX_NAMED : MAX_CLASSES);
export const FAMILY = 6;
export const MAX_WORDS = 6;
export const MAX_WORD = 8;

/** One comparison of a word with a class's word: the suffix that tells them apart, or none. */
export interface Compare {
  word: string;
  /** Index of the class whose word it is compared with. */
  rep: number;
  suffix: string | null;
}

export interface ClassesPanel {
  kind: 'classes';
  /** Each class's word (its shortest member) in the order found, and the words placed in it. */
  reps: string[];
  members: string[][];
  /** The suffix that tells each pair of classes apart, by pairKey(i, j). */
  table: Record<string, string>;
  moves: { from: number; on: string; to: number }[];
  /** The comparison of this step, if any. */
  at?: Compare;
  /** The search ended: every move found, or stopped at MAX_CLASSES. */
  closed: boolean;
  stopped: boolean;
  /** The classes whose words are in L. */
  accepting: number[];
  /** A class no word of which can reach L, if there is one. */
  dead: number | null;
  /** Where the search ends up, so the drawing can keep room for all of it from the start. */
  final: {
    reps: string[];
    moves: { from: number; on: string; to: number }[];
    table: Record<string, string>;
  };
}

export interface ApartPanel {
  kind: 'apart';
  words: string[];
  /** By pairKey(i, j), for the pairs worked out so far; null for equivalent words. */
  table: Record<string, string | null>;
  /** Every pair's suffix, for the drawing's room. */
  all: Record<string, string | null>;
  at?: [number, number];
  done: boolean;
}

export interface FamilyPanel {
  kind: 'family';
  words: string[];
  table: Record<string, string>;
  /** Words added so far. */
  shown: number;
  at?: [number, number];
  done: boolean;
}

export type Panel = ClassesPanel | ApartPanel | FamilyPanel;

export interface MnState {
  lang: Language;
  panel: Panel | null;
}

type S = MnState;
type Op = OpSpec<S, MnSettings, unknown>;
type MnStep = Step<S, unknown>;

/** Pairs are keyed by their indices, the later one first: "2|0". */
export const pairKey = (i: number, j: number) => (i > j ? `${i}|${j}` : `${j}|${i}`);
export const cellId = (i: number, j: number) => `pt-${i > j ? `${i}-${j}` : `${j}-${i}`}`;
export const classRowId = (i: number) => `cls-${i}`;
export const DFA_PREFIX = 'dfa-';
/** The state of class i in the minimal DFA: named after its word, ε for the empty word. */
export const stateName = (rep: string) => wordText(rep);

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const w = wordText;
const inL = (l: Language, x: string) => (member(l, x) ? '∈ L' : '∉ L');

/** How the k classes compare with the DFA the page works from. */
function spare(l: Language, k: number): string {
  if (l.kind !== 'regular') return '';
  const n = l.dfa.states.length;
  const which =
    l.from === 'regex'
      ? 'The DFA the page built from the expression'
      : l.from === 'nfa'
        ? 'The DFA the page built from the NFA'
        : n > l.given
          ? 'The DFA you loaded, with a dead state for its missing moves,'
          : 'The DFA you loaded';
  if (n > k)
    return `${which} has ${n} states, so ${n - k === 1 ? 'one of them was' : `${n - k} of them were`} not needed.`;
  return 'No DFA for L can have fewer states: the class words are pairwise distinguishable.';
}

/** "abb ∉ L but ab ∈ L": what the suffix z does to x and y. */
function why(l: Language, x: string, y: string, z: string): string {
  return `${w(x + z)} ${inL(l, x + z)} but ${w(y + z)} ${inL(l, y + z)}`;
}

export function init(): S {
  return { lang: parseLanguage(START_TEXT) as Language, panel: null };
}

export function vars(s: S): Record<string, Scalar> {
  const p = s.panel;
  const regular = s.lang.kind === 'regular';
  const base: Record<string, Scalar> = { regular: regular ? 'yes' : 'no' };
  if (regular && s.lang.kind === 'regular') base['DFA states'] = s.lang.dfa.states.length;
  if (!p) return base;
  if (p.kind === 'classes') return { ...base, classes: p.reps.length, moves: p.moves.length };
  if (p.kind === 'apart')
    return { ...base, words: p.words.length, pairs: Object.keys(p.table).length };
  return { ...base, words: p.shown };
}

// ---------------------------------------------------------------------------------------------
// Find classes

interface ClassRun {
  reps: string[];
  members: string[][];
  table: Record<string, string>;
  moves: { from: number; on: string; to: number }[];
  /** Each comparison, in order, with the panel after it. */
  log: { kind: 'compare' | 'join' | 'new'; c: Compare; from: number; on: string }[];
  stopped: boolean;
}

/** Breadth first from ε: every class's word, extended by every symbol, compared in order. */
export function findClasses(l: Language): ClassRun {
  const sigma = alphabetOf(l);
  const run: ClassRun = {
    reps: [''],
    members: [['']],
    table: {},
    moves: [],
    log: [],
    stopped: false,
  };
  for (let i = 0; i < run.reps.length; i++)
    for (const c of sigma) {
      const x = run.reps[i]! + c;
      let joined = -1;
      for (let j = 0; j < run.reps.length; j++) {
        const z = apart(l, x, run.reps[j]!);
        run.log.push({ kind: 'compare', c: { word: x, rep: j, suffix: z }, from: i, on: c });
        if (z === null) {
          joined = j;
          break;
        }
      }
      if (joined >= 0) {
        run.members[joined]!.push(x);
        run.moves.push({ from: i, on: c, to: joined });
        run.log.push({ kind: 'join', c: { word: x, rep: joined, suffix: null }, from: i, on: c });
        continue;
      }
      if (run.reps.length === capOf(l)) {
        run.stopped = true;
        return run;
      }
      const k = run.reps.length;
      for (let j = 0; j < k; j++) run.table[pairKey(k, j)] = apart(l, x, run.reps[j]!)!;
      run.reps.push(x);
      run.members.push([x]);
      run.moves.push({ from: i, on: c, to: k });
      run.log.push({ kind: 'new', c: { word: x, rep: k, suffix: null }, from: i, on: c });
    }
  return run;
}

/** The class that can never reach L: its word and every extension stay out (none for a cap). */
function deadClass(l: Language, run: { reps: string[]; moves: ClassRun['moves'] }): number | null {
  for (let i = 0; i < run.reps.length; i++) {
    if (member(l, run.reps[i]!)) continue;
    const out = run.moves.filter((m) => m.from === i);
    if (out.length === alphabetOf(l).length && out.every((m) => m.to === i)) return i;
  }
  return null;
}

/** The minimal DFA from the classes: a state per class, named after its word. */
export function classDfa(p: ClassesPanel, alphabet: string[], dead: 'show' | 'hide'): Automaton {
  const keep = (i: number) => dead === 'show' || i !== p.dead;
  const names = p.reps.map(stateName);
  const moves: Move[] = p.moves
    .filter((m) => keep(m.from) && keep(m.to))
    .map((m) => ({ from: names[m.from]!, on: m.on, to: names[m.to]! }));
  return makeAutomaton({
    states: names.filter((_, i) => keep(i)),
    alphabet,
    start: names[0]!,
    accept: p.accepting.filter(keep).map((i) => names[i]!),
    moves,
  });
}

const classes: Op = {
  label: 'Find classes',
  arity: 0,
  *run(s) {
    const l = s.lang;
    const run = findClasses(l);
    const panel = (upTo: number, extra: Partial<ClassesPanel> = {}): ClassesPanel => {
      // The state of the search after the first `upTo` entries of the log.
      const seen = run.log.slice(0, upTo);
      const reps = [''];
      const members: string[][] = [['']];
      const moves: ClassesPanel['moves'] = [];
      for (const e of seen) {
        if (e.kind === 'join') {
          members[e.c.rep]!.push(e.c.word);
          moves.push({ from: e.from, on: e.on, to: e.c.rep });
        } else if (e.kind === 'new') {
          reps.push(e.c.word);
          members.push([e.c.word]);
          moves.push({ from: e.from, on: e.on, to: e.c.rep });
        }
      }
      const table = Object.fromEntries(
        Object.entries(run.table).filter(([k]) => Number(k.split('|')[0]) < reps.length),
      );
      const accepting = reps.map((r, i) => (member(l, r) ? i : -1)).filter((i) => i >= 0);
      return {
        kind: 'classes',
        reps,
        members,
        table,
        moves,
        closed: false,
        stopped: false,
        accepting,
        dead: null,
        final: { reps: run.reps, moves: run.moves, table: run.table },
        ...extra,
      };
    };
    const at = (p: ClassesPanel): S => ({ ...s, panel: p });
    const first = at(panel(0));
    yield {
      state: first,
      marks: [mark(classRowId(0), 'new')],
      say: `Start with the empty word: ε is the first class${member(l, '') ? ', and it is in L' : ''}. Now extend each class's word by each symbol and ask: is the new word equivalent to some class's word, or does a suffix tell it apart from all of them?`,
      lines: ['c.start'],
      vars: vars(first),
      level: 2,
    } satisfies MnStep;
    for (let k = 0; k < run.log.length; k++) {
      const e = run.log[k]!;
      const x = e.c.word;
      const p = panel(k + 1, { at: e.c });
      const state = at(p);
      if (e.kind === 'compare') {
        const y = p.reps[e.c.rep]!;
        const z = e.c.suffix;
        yield {
          state,
          marks: [mark(classRowId(e.c.rep), z === null ? 'found' : 'compare')],
          say:
            z === null
              ? `${w(x)} against ${w(y)}: no suffix tells them apart. ${w(x)} ≡ ${w(y)}.`
              : `${w(x)} against ${w(y)}: the suffix ${w(z)} tells them apart, since ${why(l, x, y, z)}.`,
          lines: ['c.each', 'c.compare'],
          vars: vars(state),
          level: 3,
        } satisfies MnStep;
      } else if (e.kind === 'join') {
        const y = p.reps[e.c.rep]!;
        yield {
          state,
          marks: [
            mark(classRowId(e.c.rep), 'found'),
            // Only a regular language gets a DFA drawn.
            ...(l.kind === 'regular'
              ? [mark(moveId(stateName(p.reps[e.from]!), stateName(y), DFA_PREFIX), 'active')]
              : []),
          ],
          say: `${w(x)} joins the class of ${w(y)}. So the class of ${w(p.reps[e.from]!)} goes to the class of ${w(y)} on ${e.on}.`,
          lines: ['c.each', 'c.join'],
          vars: vars(state),
          level: 2,
        } satisfies MnStep;
      } else {
        const others = p.reps.slice(0, e.c.rep);
        yield {
          state,
          marks: [
            mark(classRowId(e.c.rep), 'new'),
            ...others.map((_, j) => mark(cellId(e.c.rep, j), 'new')),
          ],
          say: `A suffix tells ${w(x)} apart from ${others.length === 1 ? w(others[0]!) : `each of ${others.map(w).join(', ')}`}, so ${w(x)} starts a new class: that makes ${plural(p.reps.length, 'class', 'classes')}.`,
          lines: ['c.each', 'c.new'],
          vars: vars(state),
          level: 2,
        } satisfies MnStep;
      }
    }
    const done = panel(run.log.length);
    if (run.stopped) {
      const state = at({ ...done, stopped: true });
      yield {
        state,
        marks: [mark('lang', 'error')],
        say:
          l.kind === 'named'
            ? `${plural(MAX_NAMED, 'class', 'classes')} and still finding new ones: each new word is told apart from every class word before it, and that never stops. ${NAMED[l.name].label} has infinitely many classes, so no DFA accepts it. Press Infinitely many to see why.`
            : `${plural(MAX_CLASSES, 'class', 'classes')} and still finding new ones, so the minimal DFA has more than ${MAX_CLASSES} states. The page stops here.`,
        lines: ['c.each'],
        vars: vars(state),
        level: 1,
      } satisfies MnStep;
      return state;
    }
    const final = at({ ...done, closed: true, dead: deadClass(l, done) });
    const fp = final.panel as ClassesPanel;
    yield {
      state: final,
      marks: fp.accepting.map((i) => mark(stateId(stateName(fp.reps[i]!), DFA_PREFIX), 'found')),
      say: `Every class has a move on every symbol, so the search is closed: ${plural(fp.reps.length, 'class', 'classes')}. They are the states of the minimal DFA, and the accepting ones are the classes of words in L. ${spare(l, fp.reps.length)}`,
      lines: ['c.close'],
      vars: vars(final),
      level: 1,
    } satisfies MnStep;
    return final;
  },
};

// ---------------------------------------------------------------------------------------------
// Words apart

export function wordsArg(arg: Value | undefined, l: Language): string[] | Error {
  const tokens = String(arg ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length < 2)
    return new Error('Type at least two words, separated by spaces, such as eps a aa. eps is ε.');
  if (tokens.length > MAX_WORDS) return new Error(`Type at most ${MAX_WORDS} words at a time.`);
  const sigma = alphabetOf(l);
  const out: string[] = [];
  for (const t of tokens) {
    const x = t === 'eps' || t === 'ε' ? '' : t;
    if (x.length > MAX_WORD) return new Error(`Keep each word to ${MAX_WORD} symbols or fewer.`);
    const bad = [...x].find((c) => !sigma.includes(c));
    if (bad !== undefined)
      return new Error(
        `"${bad}" in ${t} is not in the alphabet {${sigma.join(', ')}}. Use eps for the empty word.`,
      );
    if (out.includes(x)) return new Error(`${wordText(x)} is there twice. Type different words.`);
    out.push(x);
  }
  return out;
}

const apartOp: Op = {
  label: 'Words apart',
  arity: 1,
  *run(s, [arg]) {
    const l = s.lang;
    const words = wordsArg(arg, l);
    if (words instanceof Error) {
      yield {
        state: s,
        marks: [mark('lang', 'error')],
        say: `Nothing compared. ${words.message}`,
        lines: ['a.sig'],
        vars: vars(s),
        level: 1,
      } satisfies MnStep;
      return s;
    }
    const table: Record<string, string | null> = {};
    let state: S;
    const pairs: [number, number][] = [];
    for (let i = 1; i < words.length; i++) for (let j = 0; j < i; j++) pairs.push([i, j]);
    const all = Object.fromEntries(
      pairs.map(([i, j]) => [pairKey(i, j), apart(l, words[i]!, words[j]!)]),
    );
    const panel = (done: boolean, at?: [number, number]): ApartPanel => ({
      kind: 'apart',
      words,
      table: { ...table },
      all,
      ...(at ? { at } : {}),
      done,
    });
    state = { ...s, panel: panel(false) };
    yield {
      state,
      marks: [],
      say: `Compare every pair of ${words.map(w).join(', ')}: is there a suffix that puts one in L and the other out?`,
      lines: ['a.sig'],
      vars: vars(state),
      level: 2,
    } satisfies MnStep;
    for (const [i, j] of pairs) {
      const x = words[i]!;
      const y = words[j]!;
      const z = all[pairKey(i, j)]!;
      table[pairKey(i, j)] = z;
      state = { ...s, panel: panel(false, [i, j]) };
      yield {
        state,
        marks: [mark(cellId(i, j), z === null ? 'error' : 'new')],
        say:
          z === null
            ? `${w(x)} and ${w(y)}: no suffix tells them apart, so ${w(x)} ≡ ${w(y)}, and a DFA may send both to the same state.`
            : z === '…'
              ? `${w(x)} and ${w(y)} are in different classes, but every suffix of up to 12 symbols treats them alike.`
              : `${w(x)} and ${w(y)}: the suffix ${w(z)} tells them apart, since ${why(l, x, y, z)}. No DFA for L can send them to the same state.`,
        lines: ['a.pair', z === null ? 'a.same' : 'a.apart'],
        vars: vars(state),
        level: 2,
      } satisfies MnStep;
    }
    const same = pairs.filter(([i, j]) => table[pairKey(i, j)] === null);
    state = { ...s, panel: panel(true) };
    yield {
      state,
      marks: [mark('verdict', same.length ? 'error' : 'found')],
      say: same.length
        ? `Not all apart: ${same.map(([i, j]) => `${w(words[i]!)} ≡ ${w(words[j]!)}`).join(', ')}. These ${plural(words.length, 'word')} prove only that every DFA needs at least ${words.length - same.length > 0 ? distinctCount(words, table) : 1} states.`
        : `All ${plural(pairs.length, 'pair')} are told apart. A DFA that sent two of these words to one state would treat every suffix of both alike, so every DFA for L needs at least ${words.length} states.`,
      lines: ['a.bound'],
      vars: vars(state),
      level: 1,
    } satisfies MnStep;
    return state;
  },
};

/** How many of the words fall in different classes. */
function distinctCount(words: string[], table: Record<string, string | null>): number {
  const rep: number[] = [];
  words.forEach((_, i) => {
    if (!rep.some((j) => table[pairKey(i, j)] === null)) rep.push(i);
  });
  return rep.length;
}

// ---------------------------------------------------------------------------------------------
// Infinitely many

const family: Op = {
  label: 'Infinitely many',
  arity: 0,
  *run(s) {
    const l = s.lang;
    if (l.kind === 'regular') {
      const run = findClasses(l);
      const k = run.reps.length;
      yield {
        state: s,
        marks: [mark('lang', 'active')],
        say: run.stopped
          ? `This language is regular, but it has more than ${MAX_CLASSES} classes. Still finitely many: no set of pairwise distinguishable words is larger than the number of states of its minimal DFA.`
          : `This language is regular: it has ${plural(k, 'class', 'classes')}, so no ${k + 1} words are pairwise distinguishable. Press Find classes to see them. Infinitely many classes would mean no DFA at all: load anbn to see that.`,
        lines: ['f.sig'],
        vars: vars(s),
        level: 1,
      } satisfies MnStep;
      return s;
    }
    const words = Array.from({ length: FAMILY }, (_, i) => 'a'.repeat(i));
    const b = NAMED[l.name].family;
    const table: Record<string, string> = {};
    let state: S;
    const panel = (shown: number, done: boolean, at?: [number, number]): FamilyPanel => ({
      kind: 'family',
      words,
      table: { ...table },
      shown,
      ...(at ? { at } : {}),
      done,
    });
    state = { ...s, panel: panel(1, false) };
    yield {
      state,
      marks: [mark(cellId(1, 0), 'stale')],
      say: `Take the words ε, a, aa, aaa, ...: aⁱ for every i. For i ≠ j, the suffix ${b}ⁱ puts aⁱ${b}ⁱ in L and aʲ${b}ⁱ out of it, so aⁱ and aʲ are never equivalent.`,
      lines: ['f.sig', 'f.words'],
      vars: vars(state),
      level: 2,
    } satisfies MnStep;
    for (let j = 1; j < FAMILY; j++) {
      for (let i = 0; i < j; i++) {
        const z = b.repeat(i);
        table[pairKey(j, i)] = z;
        state = { ...s, panel: panel(j + 1, false, [j, i]) };
        const x = words[i]!;
        const y = words[j]!;
        yield {
          state,
          marks: [mark(cellId(j, i), 'new')],
          say: `${w(y)} against ${w(x)}: the suffix ${w(z)} gives ${w(x + z)} ${inL(l, x + z)} and ${w(y + z)} ${inL(l, y + z)}.`,
          lines: ['f.pair'],
          vars: vars(state),
          level: 3,
        } satisfies MnStep;
      }
      state = { ...s, panel: panel(j + 1, false) };
      yield {
        state,
        marks: [mark(`pt-r-${j}`, 'new')],
        say: `${w(words[j]!)} is apart from all ${plural(j, 'word')} before it: ${j + 1} pairwise distinguishable words, so every DFA for L would need at least ${j + 1} states.`,
        lines: ['f.pair', 'f.bound'],
        vars: vars(state),
        level: 2,
      } satisfies MnStep;
    }
    state = { ...s, panel: panel(FAMILY, true) };
    yield {
      state,
      marks: [mark('verdict', 'error')],
      say: `The pattern never stops: for any k, the words ε, a, ..., aᵏ are pairwise distinguishable. A DFA with k states would send two of them to the same state, but no state can treat aⁱ and aʲ alike. So no DFA accepts ${NAMED[l.name].label}: it is not regular.`,
      lines: ['f.none'],
      vars: vars(state),
      level: 1,
    } satisfies MnStep;
    return state;
  },
};

// ---------------------------------------------------------------------------------------------
// Load

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const text = String(arg ?? '').trim();
    const l = parseLanguage(text);
    if (l instanceof Error) {
      yield {
        state: s,
        marks: [mark('lang', 'error')],
        say: `Nothing loaded. ${l.message} The language stays as it was.`,
        lines: ['load'],
        vars: vars(s),
        level: 1,
      } satisfies MnStep;
      return s;
    }
    const state: S = { lang: l, panel: null };
    yield {
      state,
      marks: [mark('lang', 'new')],
      say:
        l.kind === 'named'
          ? `Loaded L = ${NAMED[l.name].label}, ${NAMED[l.name].say}. Press Find classes, or Infinitely many.`
          : `Loaded L = ${label(l)}, over {${l.dfa.alphabet.join(', ')}}. Press Find classes to build its minimal DFA from words alone.`,
      lines: ['load'],
      vars: vars(state),
      level: 1,
    } satisfies MnStep;
    return state;
  },
};

export const ops = { load, classes, apart: apartOp, family };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: MnSettings): PseudoBlock[] {
  return [
    {
      op: 'classes',
      lines: [
        L('c.sig', 0, 'CLASSES(L):', 'To find the classes of ≡_L:'),
        L('c.start', 1, 'R = [ε]', 'the empty word is the first class;'),
        L('c.each', 1, 'for each x in R, each c in Σ', 'for each class word x and each symbol c:'),
        L(
          'c.compare',
          2,
          'for each y in R: find z with xc·z ∈ L xor y·z ∈ L',
          'look for a suffix that tells xc from y;',
        ),
        L('c.join', 2, 'if xc ≡ y: δ([x], c) = [y]', 'if none does, xc is in the class of y;'),
        L(
          'c.new',
          2,
          'else: add xc to R; δ([x], c) = [xc]',
          'if every y is told apart, xc starts a class.',
        ),
        L(
          'c.close',
          1,
          settings.dead === 'hide'
            ? 'states = R minus the dead class; F = { [x] : x ∈ L }'
            : 'states = R; F = { [x] : x ∈ L }',
          settings.dead === 'hide'
            ? 'The classes are the states (leave out the one that never reaches L); those in L accept.'
            : 'The classes are the states of the minimal DFA; those in L accept.',
        ),
      ],
    },
    {
      op: 'apart',
      lines: [
        L('a.sig', 0, 'APART(w₁ … wₖ):', 'To tell words apart:'),
        L(
          'a.pair',
          1,
          'for each pair wᵢ, wⱼ: shortest z',
          'for each pair, find the shortest suffix',
        ),
        L('a.apart', 2, 'with wᵢz ∈ L xor wⱼz ∈ L', 'that puts one in L and the other out;'),
        L('a.same', 2, 'none: wᵢ ≡ wⱼ', 'if there is none, the words are equivalent.'),
        L(
          'a.bound',
          1,
          'all apart ⇒ every DFA has ≥ k states',
          'If all are apart, every DFA needs at least k states.',
        ),
      ],
    },
    {
      op: 'family',
      lines: [
        L('f.sig', 0, 'NOT-REGULAR(L):', 'To show no DFA accepts L:'),
        L('f.words', 1, 'take ε, a, aa, … (aⁱ for each i)', 'take the words aⁱ, one for each i;'),
        L('f.pair', 1, 'aⁱbⁱ ∈ L, aʲbⁱ ∉ L for i ≠ j', 'the suffix bⁱ tells aⁱ from aʲ;'),
        L('f.bound', 1, 'k + 1 words apart ⇒ > k states', 'so k states are never enough;'),
        L(
          'f.none',
          1,
          'infinitely many classes ⇒ no DFA',
          'infinitely many classes: L is not regular.',
        ),
      ],
    },
    {
      op: 'load',
      lines: [L('load', 0, 'L = read(text)', 'Read the language.')],
    },
  ];
}

export function initialSay(s: S): string {
  return `L = ${label(s.lang)}: words ending in ab. Two words are equivalent when no suffix tells them apart. Press Find classes to sort words into classes; the classes are the states of the minimal DFA.`;
}

export function initialVars(s: S) {
  return vars(s);
}

export function describe(s: S): string {
  const head = `The language L = ${label(s.lang)}.`;
  const p = s.panel;
  if (!p) return head;
  if (p.kind === 'classes')
    return `${head} ${plural(p.reps.length, 'class', 'classes')} so far: ${p.reps
      .map((r, i) => `[${w(r)}] holds ${p.members[i]!.map(w).join(', ')}`)
      .join('; ')}.`;
  const pairs = Object.entries(p.table).map(([k, z]) => {
    const [i, j] = k.split('|').map(Number) as [number, number];
    return `${w(p.words[i]!)} and ${w(p.words[j]!)}: ${z === null ? 'equivalent' : `told apart by ${w(z)}`}`;
  });
  return `${head} ${pairs.length ? pairs.join('; ') : 'No pairs compared yet'}.`;
}
