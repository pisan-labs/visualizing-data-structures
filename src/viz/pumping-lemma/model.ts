/**
 * The pumping lemma as a game (Sipser, Theorems 1.70 and 2.34), for regular and context-free
 * languages. The adversary says L is regular (or context-free) and picks p; the prover picks a
 * string s in L with |s| ≥ p; the adversary splits it, s = xyz with |xy| ≤ p and |y| ≥ 1 (or
 * s = uvxyz with |vxy| ≤ p and |vy| ≥ 1); the prover picks i, and wins when xyⁱz is not in L.
 *
 * Roles (a setting)
 *   prove   the learner picks s and i; the page is the adversary. It tries every legal split
 *           and picks one that survives every i from 0 to MAX_I if one does, else the one that
 *           survives the most.
 *   defend  the learner is the adversary: p is the setting, and the learner splits the page's
 *           s. The page looks for an i that pumps s out of L.
 *
 * Operations
 *   language L   a new game on a language from the menu (languages.ts)
 *   string s     (prove) the learner's string; the adversary searches and splits it
 *   pump i       (prove) the learner's i, and who wins this game
 *   split x|y|z  (defend) the learner's split; the page picks i
 * An operation the role does not allow says why and changes nothing.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { plural, words } from '../_automata/page';
import {
  MAX_I,
  PART_NAMES,
  PROVER_TRIES,
  adversary,
  firstOut,
  illegal,
  pieces,
  pump,
  readSplit,
  survivesAll,
  type Parts,
  type Tried,
} from './game';
import {
  CLAIM,
  KEYS,
  LEVEL_TEXT,
  MAX_S,
  alphabetText,
  findLanguage,
  inClass,
  lang,
  show,
  sup,
  type LangId,
  type Language,
  type Lemma,
} from './languages';

export type Role = 'prove' | 'defend';
export type Winner = 'you' | 'page';

export interface PumpSettings {
  [key: string]: Scalar;
  lemma: Lemma;
  role: Role;
  p: number;
}

export const defaults: PumpSettings = { lemma: 'regular', role: 'prove', p: 4 };

export interface PumpState {
  lang: LangId;
  p: number;
  /** The string in play, once picked. */
  s: string | null;
  /** The split in play: lengths of x, y, z (or u, v, x, y, z). */
  parts: Parts | null;
  /** The adversary's search over s: legal splits, and how many survive every i. */
  search: { splits: number; survivors: number } | null;
  /** For the split in play and i = 0..MAX_I: in L, out of L, or not tried (null). */
  tried: (boolean | null)[];
  /** The i whose pumped string is on show. */
  i: number | null;
  /** Who won the last game played on this split. */
  winner: Winner | null;
}

export interface PumpExtra {
  /** A split the adversary is trying, with what pumping does to it. */
  look?: Tried;
  /** The split the adversary will pick, so the drawing keeps room for its pumped strings. */
  pick?: Parts;
  /** Splits tried so far, out of how many, and how many of them survive every i. */
  count?: { done: number; total: number; survivors: number };
}

type S = PumpState;
type X = PumpExtra;
type PStep = Step<S, X>;
type Op = OpSpec<S, PumpSettings, X>;

export const ROLE_LABEL: Record<Role, string> = {
  prove: 'You prove: pick s and i',
  defend: 'You defend: pick p and the split',
};

export const verdictId = 'verdict';
export const tryId = (i: number) => `try-${i}`;

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

// ---------------------------------------------------------------------------------------------
// Text

/** s = xyz or s = uvxyz. */
export const SHAPE: Record<Lemma, string> = { regular: 'xyz', cf: 'uvxyz' };
export const COND: Record<Lemma, string> = {
  regular: '|xy| ≤ p and |y| ≥ 1',
  cf: '|vxy| ≤ p and |vy| ≥ 1',
};

/** xy²z, or uv²xy²z; xyz for i = 1. */
export function pumpedName(i: number, lemma: Lemma): string {
  const e = i === 1 ? '' : sup(i);
  return lemma === 'regular' ? `xy${e}z` : `uv${e}xy${e}z`;
}

/** "x = ε, y = a, z = a³b⁴". */
export function splitText(s: string, parts: Parts, lemma: Lemma): string {
  const names = PART_NAMES[lemma];
  return pieces(s, parts)
    .map((w, k) => `${names[k]} = ${show(w)}`)
    .join(', ');
}

/** "|xy| = 3 ≤ 4 and |y| = 1 ≥ 1". */
function condValues(parts: Parts, p: number, lemma: Lemma): string {
  if (lemma === 'regular') {
    const [x, y] = parts as [number, number];
    return `|xy| = ${x + y} ≤ ${p} and |y| = ${y} ≥ 1`;
  }
  const [, v, x, y] = parts as [number, number, number, number];
  return `|vxy| = ${v + x + y} ≤ ${p} and |vy| = ${v + y} ≥ 1`;
}

/** What pumping does to a split, as the end of a sentence. */
function fate(l: Language, s: string, t: Tried, lemma: Lemma): string {
  if (survivesAll(t.results))
    return `every pumped string from i = 0 to ${MAX_I} stays in L, so this split survives`;
  const i = firstOut(t.results);
  const w = pump(s, t.parts, i, lemma);
  return `${pumpedName(i, lemma)} = ${show(w)} is not in L (${l.why(w)}), so it dies at i = ${i}`;
}

function whatPumps(i: number, lemma: Lemma): string {
  const y = lemma === 'regular' ? 'y' : 'v and y';
  if (i === 0) return `Pumping down: drop ${y}.`;
  if (i === 1) return `${pumpedName(1, lemma)} is s itself, so i = 1 changes nothing.`;
  return lemma === 'regular' ? `Repeat y ${i} times.` : `Repeat v and y ${i} times each.`;
}

/** What the input box held, for hints: which button it was meant for. */
export type InputKind = 'language' | 'number' | 'split' | 'word' | 'other';

const PIECE = '(?:eps|ε|[abc()]*)';
const SPLIT = new RegExp(`^${PIECE}(?:\\|${PIECE})+$`);

export function inputKind(t: string): InputKind {
  if (findLanguage(t)) return 'language';
  if (/^\d+$/.test(t)) return 'number';
  if (SPLIT.test(t) || /^\d+([\s,]+\d+)+$/.test(t)) return 'split';
  if (/^(eps|ε|[abc()]+)$/.test(t)) return 'word';
  return 'other';
}

function hint(t: string, role: Role): string {
  switch (inputKind(t)) {
    case 'language':
      return ' To play on that language, press Language.';
    case 'number':
      return role === 'prove'
        ? ` To pump with i = ${t}, press Pump.`
        : ' In this role the page picks i.';
    case 'split':
      return role === 'defend'
        ? ' To split s, press Split.'
        : ' In this role the adversary splits s.';
    case 'word':
      return role === 'prove'
        ? ' To play it as your string, press String.'
        : ' In this role the page picks s.';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------------------------
// State

/** Results for a split just picked: i = 1 gives s back, which is in L. */
function blankTried(withSplit: boolean): (boolean | null)[] {
  return Array.from({ length: MAX_I + 1 }, (_, i) => (withSplit && i === 1 ? true : null));
}

function fresh(id: LangId, settings: PumpSettings): S {
  const l = lang(id);
  return {
    lang: id,
    p: settings.p,
    s: settings.role === 'defend' ? l.prover(settings.p, settings.lemma) : null,
    parts: null,
    search: null,
    tried: blankTried(false),
    i: null,
    winner: null,
  };
}

export function init(settings: PumpSettings): S {
  return fresh('anbn', settings);
}

export function vars(s: S, extra?: X): Record<string, Scalar> {
  const out: Record<string, Scalar> = { p: s.p };
  if (s.s !== null) out['|s|'] = s.s.length;
  const total = extra?.count?.total ?? s.search?.splits;
  if (total !== undefined) out.splits = total;
  const survive = extra?.count?.survivors ?? s.search?.survivors;
  if (survive !== undefined) out['survive every i'] = survive;
  if (s.i !== null) out.i = s.i;
  return out;
}

export function initialSay(s: S, settings: PumpSettings): string {
  const l = lang(s.lang);
  const claim = CLAIM[settings.lemma];
  if (settings.role === 'defend')
    return `The pumping lemma as a game. You are the adversary: you claim L = ${l.set} is ${claim}, with p = ${s.p}. The page picks s = ${show(s.s!)}. Split it as ${PART_NAMES[settings.lemma].join('|')} and press Split; the page then looks for an i that pumps s out of L.`;
  return `The pumping lemma as a game. The adversary claims L = ${l.set} is ${claim} and picks p = ${s.p}. Pick a string s in L with |s| ≥ ${s.p} and press String; the adversary splits it, and then you pick i.`;
}

export const initialVars = (s: S): Record<string, Scalar> => vars(s);

function* refuse(s: S, say: string, lines: string[] = []): Generator<PStep, S, void> {
  yield { state: s, marks: [], say, lines, level: 1, vars: vars(s) };
  return s;
}

const text = (arg: Value | undefined) => String(arg ?? '').trim();

// ---------------------------------------------------------------------------------------------
// Operations

const language: Op = {
  label: 'Language',
  arity: 1,
  *run(st, [arg], { settings }) {
    const t = text(arg);
    const l = findLanguage(t);
    if (!l)
      return yield* refuse(
        st,
        `"${t}" is not a language on this page. Type one of ${words(KEYS)}.${hint(t, settings.role)}`,
      );
    const next = fresh(l.id, settings);
    const claim = CLAIM[settings.lemma];
    const open: S = { ...next, s: null };
    yield {
      state: open,
      marks: [],
      say: `New game on L = ${l.set}: ${l.plain}. L is ${LEVEL_TEXT[l.level]}.`,
      lines: ['lang.pick'],
      level: 2,
      vars: vars(open),
    } satisfies PStep;
    if (settings.role === 'prove') {
      const truth = inClass(l, settings.lemma)
        ? ` L really is ${claim}, so watch what happens to every string you pick.`
        : '';
      yield {
        state: next,
        marks: [],
        say: `The adversary claims L is ${claim} and picks the pumping length p = ${next.p}. Your move: pick a string s in L with |s| ≥ ${next.p}, and press String.${truth}`,
        lines: ['lang.p'],
        level: 1,
        vars: vars(next),
      } satisfies PStep;
      return next;
    }
    yield {
      state: open,
      marks: [],
      say: `You are the adversary: you claim L is ${claim}, with p = ${next.p}. (Set p in Options.)`,
      lines: ['lang.p'],
      level: 2,
      vars: vars(open),
    } satisfies PStep;
    const s = next.s!;
    yield {
      state: next,
      marks: [],
      say: `The page picks s = ${show(s)}: it is in L (${l.why(s)}), and |s| = ${s.length} ≥ ${next.p}. Your move: split it as ${PART_NAMES[settings.lemma].join('|')} with ${COND[settings.lemma]}, and press Split.`,
      lines: ['lang.s'],
      level: 1,
      vars: vars(next),
    } satisfies PStep;
    return next;
  },
};

/** The learner's string, or why it cannot be one. */
function readWord(t: string, l: Language): string | Error {
  if (t === 'eps' || t === 'ε') return '';
  const bad = [...t].find((c) => !l.alphabet.includes(c));
  if (bad !== undefined || !t)
    return new Error(`"${t}" is not a string over ${alphabetText(l)}, the symbols of L.`);
  return t;
}

const string: Op = {
  label: 'String',
  arity: 1,
  *run(st, [arg], { settings }) {
    const t = text(arg);
    const l = lang(st.lang);
    const { lemma } = settings;
    if (settings.role === 'defend')
      return yield* refuse(
        st,
        `In this role the page picks s and you split it. To pick s yourself, choose “${ROLE_LABEL.prove}” in Options.`,
      );
    const w = readWord(t, l);
    if (w instanceof Error) return yield* refuse(st, `${w.message}${hint(t, settings.role)}`);
    if (w.length > MAX_S)
      return yield* refuse(st, `Keep s to ${MAX_S} symbols or fewer, so it fits on the screen.`);
    if (!l.member(w))
      return yield* refuse(
        st,
        `s = ${show(w)} is not in L: ${l.why(w)}. The lemma only speaks about strings in L, so pick one that is.`,
        ['string.check'],
      );
    const p = st.p;
    if (w.length < p)
      return yield* refuse(
        st,
        `s = ${show(w)} is in L, but |s| = ${w.length} is less than p = ${p}. The lemma only promises a split for strings at least p long, so a short string proves nothing. Pick a longer one.`,
        ['string.check'],
      );

    const base: S = {
      ...st,
      s: w,
      parts: null,
      search: null,
      tried: blankTried(false),
      i: null,
      winner: null,
    };
    const r = adversary(l, w, p, lemma);
    const total = r.tried.length;
    const pick = r.tried[r.pick]!;
    yield {
      state: base,
      marks: [],
      say: `You pick s = ${show(w)}. It is in L (${l.why(w)}), and |s| = ${w.length} ≥ p = ${p}: a legal move.`,
      lines: ['string.check'],
      level: 2,
      vars: vars(base),
      extra: { pick: pick.parts },
    } satisfies PStep;

    yield {
      state: base,
      marks: [],
      say: `Now the adversary tries every legal split: ${plural(total, 'way')} to write s = ${SHAPE[lemma]} with ${COND[lemma]}. For each, it pumps with i = 0 to ${MAX_I}.`,
      lines: ['string.each', 'string.try'],
      level: 2,
      vars: vars(base, { count: { done: 0, total, survivors: 0 } }),
      extra: { count: { done: 0, total, survivors: 0 }, pick: pick.parts },
    } satisfies PStep;

    const survivors = r.survivors;
    if (lemma === 'regular') {
      let seen = 0;
      for (const [k, t] of r.tried.entries()) {
        if (survivesAll(t.results)) seen++;
        const count = { done: k + 1, total, survivors: seen };
        yield {
          state: base,
          marks: [],
          say: `The adversary tries ${splitText(w, t.parts, lemma)}: ${fate(l, w, t, lemma)}.`,
          lines: ['string.each', 'string.try'],
          level: 3,
          vars: vars(base, { count }),
          extra: { look: t, count, pick: pick.parts },
        } satisfies PStep;
      }
    } else {
      // Hundreds of splits: one step per place vxy starts, showing that place's best split.
      let done = 0;
      let seen = 0;
      for (let u = 0; u < w.length; u++) {
        const group = r.tried.filter((t) => t.parts[0] === u);
        if (!group.length) continue;
        const alive = group.filter((t) => survivesAll(t.results)).length;
        seen += alive;
        done += group.length;
        let best = group[0]!;
        for (const t of group)
          if (t.results.filter(Boolean).length > best.results.filter(Boolean).length) best = t;
        const count = { done, total, survivors: seen };
        const verdict = alive
          ? `${alive} of them ${alive === 1 ? 'survives' : 'survive'} every i`
          : 'every one dies for some i';
        yield {
          state: base,
          marks: [],
          say: `Splits with vxy starting at symbol ${u + 1}: ${plural(group.length, 'split')}, and ${verdict}. For example ${splitText(w, best.parts, lemma)}: ${fate(l, w, best, lemma)}.`,
          lines: ['string.each', 'string.try'],
          level: 3,
          vars: vars(base, { count }),
          extra: { look: best, count, pick: pick.parts },
        } satisfies PStep;
      }
    }

    const final: S = {
      ...base,
      parts: pick.parts,
      search: { splits: total, survivors },
      tried: blankTried(true),
    };
    const all = `The adversary tried all ${plural(total, 'legal split')}`;
    const say =
      survivors > 0
        ? `${all}, and ${survivors === total ? 'every one of them survives' : survivors === 1 ? 'one survives' : `${survivors} survive`} every i from 0 to ${MAX_I}. It picks ${splitText(w, pick.parts, lemma)}. No i can beat that split: this s gives the adversary room. Pump it to see, or pick another s.`
        : `${all}, and none survives every i from 0 to ${MAX_I}. It picks ${splitText(w, pick.parts, lemma)}, the one that holds out longest. Your move: pick i and press Pump.`;
    yield {
      state: final,
      marks: [],
      say,
      lines: ['string.pick'],
      level: 1,
      vars: vars(final),
    } satisfies PStep;
    return final;
  },
};

/** i as typed: an integer from 0 to MAX_I, or null. */
function readI(arg: Value | undefined): number | null {
  const t = text(arg);
  if (!/^\d+$/.test(t)) return null;
  const i = Number(t);
  return i <= MAX_I ? i : null;
}

const pumpOp: Op = {
  label: 'Pump',
  arity: 1,
  *run(st, [arg], { settings }) {
    const { lemma } = settings;
    if (settings.role === 'defend')
      return yield* refuse(
        st,
        `In this role the page picks i, and you split s: type a split such as ${PART_NAMES[lemma].join('|')} and press Split.`,
      );
    if (!st.parts || st.s === null)
      return yield* refuse(
        st,
        'There is no split to pump yet. Pick a string s and press String: the adversary splits it, and then you pick i.',
      );
    const i = readI(arg);
    const t = text(arg);
    if (i === null)
      return yield* refuse(
        st,
        `Pick i from 0 to ${MAX_I} and press Pump. The lemma allows any i ≥ 0; this page stops at ${MAX_I} so the pumped string fits on the screen.${inputKind(t) === 'number' ? '' : hint(t, settings.role)}`,
        ['pump.build'],
      );
    const l = lang(st.lang);
    const s = st.s;
    const w = pump(s, st.parts, i, lemma);
    const inL = l.member(w);
    const shown: S = { ...st, i, winner: null };
    yield {
      state: shown,
      marks: [],
      say: `You pick i = ${i}. ${whatPumps(i, lemma)} ${pumpedName(i, lemma)} = ${show(w)}.`,
      lines: ['pump.build'],
      level: 2,
      vars: vars(shown),
    } satisfies PStep;

    const tried = [...st.tried];
    tried[i] = inL;
    const final: S = { ...shown, tried, winner: inL ? 'page' : 'you' };
    const name = `${pumpedName(i, lemma)} = ${show(w)}`;
    let say: string;
    if (!inL) {
      const n = st.search?.splits ?? 0;
      const argue = l.argue[lemma];
      say = `${name} is not in L: ${l.why(w)}. You win this game. One game proves nothing by itself; what makes a proof is that every split loses, and the adversary tried all ${n} without finding one that survives.${argue ? ` To finish the proof, argue it for every p. ${argue}` : ''}`;
    } else {
      const parts = st.parts;
      const holds = Array.from({ length: MAX_I + 1 }, (_, k) => l.member(pump(s, parts, k, lemma)));
      const claim = CLAIM[lemma];
      const rest = survivesAll(holds)
        ? ` Its split survives every i from 0 to ${MAX_I}, so no i would have won. ${
            inClass(l, lemma)
              ? `L is ${claim}, so every long enough string pumps like this. That still does not prove L is ${claim}: the lemma only works one way.`
              : 'Pick an s the adversary cannot pump.'
          }`
        : ' Another i beats this split: try again.';
      say = `${name} is in L: ${l.why(w)}. The adversary wins this game.${rest}`;
    }
    yield {
      state: final,
      marks: [mark(verdictId, inL ? 'found' : 'error'), mark(tryId(i), 'active')],
      say,
      lines: inL ? ['pump.test', 'pump.lose'] : ['pump.test', 'pump.win'],
      level: 1,
      vars: vars(final),
    } satisfies PStep;
    return final;
  },
};

const split: Op = {
  label: 'Split',
  arity: 1,
  *run(st, [arg], { settings }) {
    const { lemma } = settings;
    if (settings.role === 'prove')
      return yield* refuse(
        st,
        `In this role the adversary splits s, not you. That is the point of the game: a proof has to beat every split, so you never get to pick a convenient one. To split strings yourself, choose “${ROLE_LABEL.defend}” in Options.`,
        ['string.each'],
      );
    if (st.s === null)
      return yield* refuse(st, 'There is no string to split yet. Press Language to start a game.');
    const s = st.s;
    const t = text(arg);
    const parts = readSplit(t, s, lemma);
    if (typeof parts === 'string')
      return yield* refuse(
        st,
        `That is not a split of s = ${show(s)}: ${parts}.${hint(t, settings.role).replace(' To split s, press Split.', '')}`,
        ['split.check'],
      );
    const bad = illegal(s.length, parts, st.p, lemma);
    if (bad)
      return yield* refuse(st, `${splitText(s, parts, lemma)} is not a legal split: ${bad}.`, [
        'split.check',
      ]);

    const l = lang(st.lang);
    const base: S = { ...st, parts, search: null, tried: blankTried(true), i: null, winner: null };
    yield {
      state: base,
      marks: [],
      say: `You split s as ${splitText(s, parts, lemma)}: ${condValues(parts, st.p, lemma)}, so it is legal. Now the page looks for an i that pumps s out of L.`,
      lines: ['split.check'],
      level: 2,
      vars: vars(base),
    } satisfies PStep;

    let cur = base;
    for (const i of PROVER_TRIES) {
      const w = pump(s, parts, i, lemma);
      const inL = l.member(w);
      const tried = [...cur.tried];
      tried[i] = inL;
      cur = { ...cur, i, tried };
      const name = `${pumpedName(i, lemma)} = ${show(w)}`;
      if (!inL) {
        const final: S = { ...cur, winner: 'page' };
        const others = adversary(l, s, st.p, lemma);
        const lesson =
          others.survivors === 0
            ? ` Every other legal split loses to some i too: that is what makes s = ${show(s)} a winning string for p = ${st.p}.`
            : ` L is ${CLAIM[lemma]}, though, and a better split survives every i. Try another.`;
        yield {
          state: final,
          marks: [mark(verdictId, 'error'), mark(tryId(i), 'active')],
          say: `The page picks i = ${i}: ${name} is not in L, because ${l.why(w)}. The page wins this game.${lesson}`,
          lines: ['split.try', 'split.win'],
          level: 1,
          vars: vars(final),
        } satisfies PStep;
        return final;
      }
      yield {
        state: cur,
        marks: [mark(tryId(i), 'active')],
        say: `The page tries i = ${i}: ${name} is still in L (${l.why(w)}).`,
        lines: ['split.try'],
        level: 3,
        vars: vars(cur),
      } satisfies PStep;
    }
    const final: S = { ...cur, winner: 'you' };
    const claim = CLAIM[lemma];
    yield {
      state: final,
      marks: [mark(verdictId, 'found')],
      say: `No i from 0 to ${MAX_I} pumps s out of L: your split survives, and you win this game.${
        inClass(l, lemma)
          ? ` L is ${claim}, so a split like this exists for every long enough string. Even so, a won game is not a proof that L is ${claim}: the lemma only works one way.`
          : ' So this s does not beat every split.'
      }`,
      lines: ['split.try', 'split.lose'],
      level: 1,
      vars: vars(final),
    } satisfies PStep;
    return final;
  },
};

export const ops: Record<string, Op> = { language, string, pump: pumpOp, split };

// ---------------------------------------------------------------------------------------------
// Pseudocode

export function pseudocode(settings: PumpSettings): PseudoBlock[] {
  const { lemma } = settings;
  const claim = CLAIM[lemma];
  const shape = SHAPE[lemma];
  const cond = COND[lemma];
  const pumped = lemma === 'regular' ? 'xyⁱz' : 'uvⁱxyⁱz';
  const pieces = lemma === 'regular' ? 'x, y and z' : 'u, v, x, y and z';
  const pumpWhat = lemma === 'regular' ? 'y' : 'v and y';
  const L = (id: string, text: string, plain: string, indent = 0) => ({ id, text, plain, indent });
  const pick = L('lang.pick', 'choose L', 'You choose the language to play on.');
  if (settings.role === 'prove')
    return [
      {
        op: 'language',
        lines: [
          pick,
          L(
            'lang.p',
            `adversary: “L is ${claim}”, so it picks p ≥ 1`,
            `The adversary claims L is ${claim}, and picks a pumping length p.`,
          ),
        ],
      },
      {
        op: 'string',
        lines: [
          L(
            'string.check',
            'require s ∈ L and |s| ≥ p',
            'Your string must be in L and at least p symbols long.',
          ),
          L(
            'string.each',
            `for each split s = ${shape} with ${cond}`,
            `The adversary tries every legal way to cut s into ${pieces}.`,
          ),
          L(
            'string.try',
            `test ${pumped} ∈ L for i = 0, 1, …, ${MAX_I}`,
            `For each one, it pumps ${pumpWhat} from 0 to ${MAX_I} times and checks whether the result is still in L.`,
            1,
          ),
          L(
            'string.pick',
            'pick a split that survives every i, else one that survives the most',
            'It keeps a split that stays in L for every i, if there is one; if not, the one that lasts longest.',
          ),
        ],
      },
      {
        op: 'pump',
        lines: [
          L('pump.build', `w ← ${pumped}`, `Repeat ${pumpWhat} i times.`),
          L('pump.test', 'if w ∉ L', 'Is the pumped string outside L?'),
          L('pump.win', 'you win this game', 'Then you win this game.', 1),
          L(
            'pump.lose',
            'else the adversary wins this game',
            'If it is still in L, the adversary wins this one.',
          ),
        ],
      },
    ];
  return [
    {
      op: 'language',
      lines: [
        pick,
        L(
          'lang.p',
          `you (the adversary): “L is ${claim}”, with p`,
          `You claim L is ${claim} and pick p (in Options).`,
        ),
        L(
          'lang.s',
          'page picks s ∈ L with |s| ≥ p',
          'The page picks a string in L at least p symbols long.',
        ),
      ],
    },
    {
      op: 'split',
      lines: [
        L(
          'split.check',
          `require s = ${shape} with ${cond}`,
          `Your pieces must spell s, ${lemma === 'regular' ? 'with x and y in the first p symbols and y not empty' : 'with v, x and y within p symbols and v and y not both empty'}.`,
        ),
        L(
          'split.try',
          `for i = ${PROVER_TRIES.join(', ')}: if ${pumped} ∉ L`,
          `The page tries i = 0, 2, 3, 4 and 5, looking for a pumped string outside L.`,
        ),
        L('split.win', 'the page wins with that i', 'If it finds one, the page wins this game.', 1),
        L(
          'split.lose',
          'else your split survives: you win this game',
          'If every one stays in L, your split survives and you win this one.',
        ),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Screen readers

export function describe(s: S, settings: PumpSettings): string {
  const { lemma } = settings;
  const l = lang(s.lang);
  const out = [
    `Pumping game on L = ${l.set}, with p = ${s.p}, for the ${lemma === 'regular' ? 'regular' : 'context-free'} lemma.`,
  ];
  if (s.s === null) {
    out.push('No string yet.');
    return out.join(' ');
  }
  out.push(`s = ${s.s}.`);
  if (s.parts) out.push(`Split: ${splitText(s.s, s.parts, lemma)}.`);
  if (s.i !== null && s.parts) {
    const w = pump(s.s, s.parts, s.i, lemma);
    out.push(`${pumpedName(s.i, lemma)} = ${show(w)}, ${l.member(w) ? 'in L' : 'not in L'}.`);
  }
  if (s.winner)
    out.push(
      s.winner === 'you'
        ? 'You win this game.'
        : settings.role === 'prove'
          ? 'The adversary wins this game.'
          : 'The page wins this game.',
    );
  return out.join(' ');
}
