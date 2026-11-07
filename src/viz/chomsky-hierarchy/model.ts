import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { ruleShapeId } from '../_grammar/draw';
import { isVariable, parseRules, type Level, type Production, type Sym } from '../_grammar/grammar';
import {
  LANGUAGE,
  LANGUAGES,
  LANGUAGE_KEYS,
  findLanguage,
  type Claim,
  type LangId,
  type Language,
} from './languages';
import {
  LEVEL_FORM,
  LEVEL_REGION,
  checkLevels,
  grammarWord,
  levelWord,
  productionText,
  regionTitle,
  shownOut,
  shownRegion,
  type GrammarLevel,
  type MapSettings,
  type RegionId,
} from './levels';

export interface ChSettings extends MapSettings {
  [key: string]: Scalar;
  decidable: boolean;
  names: 'names' | 'types';
}

export const defaults: ChSettings = { decidable: true, names: 'names' };

export interface GrammarInfo {
  /** The grammar as typed, trimmed. */
  text: string;
  start: Sym;
  rules: Production[];
  result: GrammarLevel;
  /** The level check the step shows: an index into result.checks. */
  at: number;
  /** Whether that check has reached its verdict. */
  decided: boolean;
}

export type Focus =
  | { kind: 'none' }
  | { kind: 'grammar' }
  | { kind: 'language'; id: LangId; shown: number; done: boolean };

export interface ChState {
  /** Languages on the map, in the order placed. */
  placed: LangId[];
  /** The grammar classified last. Its token, L(G), stays on the map. */
  grammar: GrammarInfo | null;
  /** What the panel beside the map shows. */
  focus: Focus;
}

export interface ChExtra {
  /** At a fine step: the rule being checked, by index. */
  rule?: number;
}

type S = ChState;
type X = ChExtra;
type Op = OpSpec<S, ChSettings, X>;
type ChStep = Step<S, X>;

/** Shape ids the view draws, for marks. */
export const RULES = 'r';
export const GRAMMAR_TOKEN = 'G';
export const tokenId = (key: string) => `tok-${key}`;
export const regionId = (r: RegionId) => `region-${r}`;
export const claimId = (k: number) => `claim-${k}`;
export const checkId = (k: number) => `check-${k}`;

/** A rule as the rules panel draws it: its left side joined into one string. */
export const asRule = (p: Production) => ({ lhs: p.lhs.join(''), rhs: p.rhs });
export const ruleId = (p: Production) => ruleShapeId(RULES, asRule(p));

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

/** Text with an arrow is a grammar; anything else should name a language. */
export const looksLikeGrammar = (t: string) => /->|→/.test(t);

export function init(): S {
  return { placed: [], grammar: null, focus: { kind: 'none' } };
}

export const keyList = () => LANGUAGE_KEYS.join(', ');

function refuse(s: S, say: string, line: string): ChStep {
  return { state: s, marks: [], say, lines: [line], level: 1 };
}

// ---------------------------------------------------------------------------------------------
// Classify

/** Why a rule fits a level's form, for the fine steps. */
function fitText(level: Level, p: Production, start: Sym): string {
  const rule = productionText(p);
  if (level === 'regular') {
    const last = p.rhs.at(-1);
    const shape = last && isVariable(last) ? 'A → wB' : 'A → w';
    return `${rule} fits ${shape}: one variable on the left, and at most one on the right, at the end.`;
  }
  if (level === 'context-free') return `${rule} fits A → γ: one variable on the left.`;
  if (p.rhs.length === 0)
    return `${rule} is allowed: ${start} is the start variable, and it is on no right side.`;
  return `${rule} does not shrink the string: ${p.lhs.length} symbol${p.lhs.length === 1 ? '' : 's'} on the left, ${p.rhs.length} on the right.`;
}

/** What the form of the grammar's level says about its language. */
function upperBound(level: Level, s: ChSettings): string {
  const w = (r: RegionId) => levelWord(r, s);
  switch (level) {
    case 'regular':
      return `So L(G) is ${w('reg')}: a finite automaton recognizes it. Regular is the innermost level, so this is exact.`;
    case 'context-free':
      return `So L(G) is ${w('cf')}. That is an upper bound, not the last word: a grammar that is not right-linear can still generate a regular language (S → SS | ab | ε generates (ab)*), and no algorithm can tell in general whether a context-free grammar’s language is regular.`;
    case 'context-sensitive':
      return `So L(G) is ${w('cs')}, and so decidable: a linear-bounded automaton can check a word without leaving it. Its language may still be lower.`;
    default:
      return `So L(G) is ${w('re')}: a Turing machine can list its words, but may run forever on a word not in it. That is only an upper bound: an unrestricted grammar can generate a regular language too.`;
  }
}

const classify: Op = {
  label: 'Classify',
  arity: 1,
  *run(s, [arg], { settings }) {
    const text = String(arg ?? '').trim();
    if (!looksLikeGrammar(text)) {
      const lang = findLanguage(text);
      const hint = lang
        ? `${lang.token} is a language: press Place to put it on the map.`
        : `To put a language on the map, type one of ${keyList()} and press Place.`;
      yield refuse(
        s,
        `"${text}" is not a grammar. Classify takes rules such as S -> aSb | eps. ${hint}`,
        'classify.sig',
      );
      return s;
    }
    const parsed = parseRules(text);
    if (parsed instanceof Error) {
      yield refuse(s, `Nothing classified. ${parsed.message}`, 'classify.sig');
      return s;
    }
    const { start, rules } = parsed;
    const result = checkLevels(start, rules);
    const info = (at: number, decided: boolean): GrammarInfo => ({
      text,
      start,
      rules,
      result,
      at,
      decided,
    });
    const focus: Focus = { kind: 'grammar' };
    const n = rules.length;
    /** Readouts: the level being checked (or, at the end, the level found). */
    const vars = (level: Level, ruledOut: number, done = false): Record<string, Scalar> => ({
      rules: n,
      [done ? 'level' : 'checking']: grammarWord(level, settings),
      'levels ruled out': ruledOut,
    });
    let state: S = { ...s, grammar: info(0, false), focus };
    const last = result.checks.length - 1;
    for (let k = 0; k <= last; k++) {
      const check = result.checks[k]!;
      const region = LEVEL_REGION[check.level];
      const where = regionId(region);
      const named = grammarWord(check.level, settings);
      // Unrestricted fits every rule (each left side has a variable), so there is nothing to check.
      const upTo = check.level === 'unrestricted' ? 0 : check.miss >= 0 ? check.miss : n;
      for (let i = 0; i < upTo; i++) {
        state = { ...state, grammar: info(k, false) };
        yield {
          state,
          marks: [
            mark(tokenId(GRAMMAR_TOKEN), 'compare'),
            mark(where, 'active'),
            mark(ruleId(rules[i]!), 'found'),
          ],
          say: `${named}: ${fitText(check.level, rules[i]!, start)}`,
          lines: ['classify.rule'],
          vars: vars(check.level, k),
          level: 3,
          extra: { rule: i },
        } satisfies ChStep;
      }
      state = { ...state, grammar: info(k, true) };
      if (check.miss >= 0) {
        const bad = rules[check.miss]!;
        yield {
          state,
          marks: [
            mark(tokenId(GRAMMAR_TOKEN), 'error'),
            mark(where, 'error'),
            mark(ruleId(bad), 'error'),
            mark(checkId(k), 'error'),
          ],
          say: `Is G ${named}? Every rule must be ${LEVEL_FORM[check.level]}. ${productionText(bad)} is not: ${check.why}. So G is not a ${check.level} grammar. Try the next level out.`,
          lines: ['classify.miss'],
          vars: vars(check.level, k + 1),
          level: 2,
        } satisfies ChStep;
        continue;
      }
      const all = n === 1 ? 'Its one rule is' : n === 2 ? 'Both rules are' : `All ${n} rules are`;
      const ruled = k === 0 ? '' : ` (${k === 1 ? 'one level' : `${k} levels`} ruled out)`;
      const why =
        check.level === 'unrestricted'
          ? `No level inside fits. Every rule has a variable on its left side, which is all an unrestricted grammar asks, so G is ${settings.names === 'types' ? 'Type 0 (unrestricted)' : 'unrestricted'}${ruled}.`
          : `${all} ${LEVEL_FORM[check.level]}. G is a ${named} grammar${ruled}.`;
      yield {
        state,
        marks: [
          mark(tokenId(GRAMMAR_TOKEN), 'found'),
          mark(where, 'found'),
          mark(checkId(k), 'found'),
        ],
        say: `${why} ${upperBound(check.level, settings)}`,
        lines: [check.level === 'unrestricted' ? 'classify.zero' : 'classify.fit', 'classify.note'],
        vars: vars(check.level, k, true),
        level: 1,
      } satisfies ChStep;
    }
    return state;
  },
};

// ---------------------------------------------------------------------------------------------
// Place

/** Level names as the narration writes them, under these settings. */
export const wordsFor = (s: ChSettings) => (r: RegionId) => levelWord(r, s);

/** The narration of a claim, with a note when the decidable band it names is hidden. */
function claimSay(c: Claim, s: ChSettings): string {
  const text = c.say(wordsFor(s));
  if (c.region !== 'dec' || s.decidable) return text;
  return c.kind === 'in'
    ? `${text} The decidable band is hidden, so it goes in the ${levelWord('re', s)} ring.`
    : `${text} (The decidable band is hidden. Not decidable means not ${levelWord('cs', s)} either.)`;
}

/** The last word on a language: where it sits and what it is not. */
export function verdict(lang: Language, s: ChSettings): string {
  const w = wordsFor(s);
  const out = lang.claims.find((c) => c.kind === 'out');
  const who = lang.noun ?? lang.token;
  if (lang.home === 'reg')
    return `${who} is ${w('reg')}, the innermost level, so there is nothing lower to rule out.`;
  if (lang.home === 'all')
    return `${who} is not ${w(out!.region)}. It lies outside every level: no Turing machine recognizes it and no grammar generates it.`;
  const home = shownRegion(lang.home, s);
  const lower = shownOut(out!.region, s);
  return `${who} is ${w(lang.home)} but not ${w(out!.region)}. It sits in the ${w(home)} ring, outside the ${w(lower)} region.`;
}

const place: Op = {
  label: 'Place',
  arity: 1,
  *run(s, [arg], { settings }) {
    const text = String(arg ?? '').trim();
    if (looksLikeGrammar(text)) {
      yield refuse(
        s,
        `That is a grammar. Press Classify to check its rules. Place takes a language from the list: ${keyList()}.`,
        'place.sig',
      );
      return s;
    }
    const lang = findLanguage(text);
    if (!lang) {
      yield refuse(
        s,
        `"${text}" is not one of the languages on this page. Place takes one of ${keyList()}.`,
        'place.sig',
      );
      return s;
    }
    const placed = [...s.placed.filter((id) => id !== lang.id), lang.id];
    const tok = tokenId(lang.id);
    const m = lang.claims.length;
    const vars = (k: number): Record<string, Scalar> => ({
      claims: `${k} of ${m}`,
      'languages placed': placed.length,
    });
    for (let k = 0; k < m; k++) {
      const c = lang.claims[k]!;
      const state: S = {
        ...s,
        placed,
        focus: { kind: 'language', id: lang.id, shown: k + 1, done: false },
      };
      const marks =
        c.kind === 'in'
          ? [mark(tok, 'new'), mark(regionId(shownRegion(c.region, settings)), 'found')]
          : [mark(tok, 'active'), mark(regionId(shownOut(c.region, settings)), 'error')];
      yield {
        state,
        marks: [...marks, mark(claimId(k), 'active')],
        say: claimSay(c, settings),
        lines: [c.kind === 'in' ? 'place.in' : 'place.out'],
        vars: vars(k + 1),
        level: 2,
      } satisfies ChStep;
    }
    const state: S = {
      ...s,
      placed,
      focus: { kind: 'language', id: lang.id, shown: m, done: true },
    };
    yield {
      state,
      marks: [mark(tok, 'found'), mark(regionId(shownRegion(lang.home, settings)), 'found')],
      say: verdict(lang, settings),
      lines: ['place.home'],
      vars: vars(m),
      level: 1,
    } satisfies ChStep;
    return state;
  },
};

export const ops = { classify, place };

// ---------------------------------------------------------------------------------------------
// Pseudocode, narration, description

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: ChSettings): PseudoBlock[] {
  const types = settings.names === 'types';
  const t3 = regionTitle('reg', settings);
  const order = types
    ? 'for level = 3, 2, 1'
    : 'for level in [regular, context-free, context-sensitive]';
  const zero = types ? 'return Type 0' : 'return unrestricted';
  const dec = settings.decidable ? ', decidable' : '';
  return [
    {
      op: 'classify',
      lines: [
        L('classify.sig', 0, 'classify(G)', 'To classify a grammar G by the form of its rules:'),
        L('classify.loop', 1, order, `Try the levels from the most restrictive (${t3}) out:`),
        L('classify.rule', 2, 'for each rule α → β in G', 'look at every rule in turn;'),
        L(
          'classify.miss',
          3,
          "if α → β does not fit the level's form: next level",
          'the first rule that does not fit the form rules this level out.',
        ),
        L('classify.fit', 2, 'return level', 'If every rule fits, that is the level.'),
        L(
          'classify.zero',
          1,
          zero,
          `If none fits, the grammar is unrestricted${types ? ' (Type 0)' : ''}: every rule has a variable on the left.`,
        ),
        L(
          'classify.note',
          1,
          '// L(G) is at most that level',
          'The form bounds the language from above; the language may be lower.',
        ),
      ],
    },
    {
      op: 'place',
      lines: [
        L('place.sig', 0, 'place(L)', 'To place a language L on the map:'),
        L(
          'place.in',
          1,
          'find a machine or grammar for L: L ∈ that level',
          'Find a machine or a grammar for L. That shows L is in its level.',
        ),
        L(
          'place.out',
          1,
          `prove L ∉ the level inside: pumping lemma, diagonalization${dec ? ' or a reduction' : ''}`,
          'Show L is not in the level just inside, with a pumping lemma or a diagonal argument.',
        ),
        L(
          'place.home',
          1,
          'put L in the smallest region it is in',
          'L goes in the innermost region it belongs to.',
        ),
      ],
    },
  ];
}

export function initialSay(_s: S, settings: ChSettings): string {
  const w = wordsFor(settings);
  return `Each level sits inside the next: ${w('reg')} inside ${w('cf')} inside ${w('cs')} inside ${w('re')}. Each one has a machine and a grammar form. Type a grammar and press Classify, or type a language (${keyList()}) and press Place.`;
}

/** Screen-reader summary. */
export function describe(state: S, settings: ChSettings): string {
  const w = wordsFor(settings);
  const regions = (
    settings.decidable ? ['reg', 'cf', 'cs', 'dec', 're'] : ['reg', 'cf', 'cs', 're']
  )
    .map((r) => w(r as RegionId))
    .join(' inside ');
  const parts = [`Nested regions: ${regions}, inside all languages.`];
  if (state.placed.length) {
    const list = state.placed
      .map((id) => {
        const l = LANGUAGE.get(id)!;
        return `${l.token} in ${w(shownRegion(l.home, settings))}`;
      })
      .join('; ');
    parts.push(`Placed: ${list}.`);
  }
  const g = state.grammar;
  if (g) {
    const check = g.result.checks[g.at]!;
    const done = g.decided && g.at === g.result.checks.length - 1;
    parts.push(
      done
        ? `A grammar with ${g.rules.length} rules is ${grammarWord(g.result.level, settings)}; L(G) is in ${w(LEVEL_REGION[g.result.level])}.`
        : `Checking whether a grammar with ${g.rules.length} rules is ${grammarWord(check.level, settings)}.`,
    );
  }
  return parts.join(' ');
}

/** For tests and practice: every language the page can place. */
export const LANGUAGE_LIST = LANGUAGES;
