/**
 * The levels of the hierarchy as regions of the map, their names, machines and grammar forms,
 * and a rule-by-rule check of a grammar against each level's form.
 *
 * The check agrees with classify() in src/viz/_grammar/grammar.ts (the tests compare them on
 * random grammars) but also says, for every rule, whether it fits and why not, so the page can
 * check one rule per step and name the rule that breaks a level. It could replace classify()'s
 * internals in the shared folder; it lives here because that folder is shared with other pages.
 */
import {
  EPS,
  LEVELS,
  isVariable,
  type Level,
  type Production,
  type Sym,
} from '../_grammar/grammar';

/** Regions of the map, from the innermost out. `all` is every language, with or without a machine. */
export type RegionId = 'reg' | 'cf' | 'cs' | 'dec' | 're' | 'all';

export const REGIONS: RegionId[] = ['reg', 'cf', 'cs', 'dec', 're', 'all'];

/** The region a grammar of each level puts its language in (at most). */
export const LEVEL_REGION: Record<Level, RegionId> = {
  regular: 'reg',
  'context-free': 'cf',
  'context-sensitive': 'cs',
  unrestricted: 're',
};

export interface MapSettings {
  /** Draw the decidable languages as a band between context-sensitive and r.e. */
  decidable: boolean;
  /** Name the levels by name, or Type 3 to Type 0. */
  names: 'names' | 'types';
}

/** The regions drawn, innermost first. */
export const visibleRegions = (s: MapSettings): RegionId[] =>
  REGIONS.filter((r) => r !== 'dec' || s.decidable);

/** Where a language of region r is drawn: with the decidable band hidden, in the r.e. ring. */
export const shownRegion = (r: RegionId, s: MapSettings): RegionId =>
  r === 'dec' && !s.decidable ? 're' : r;

/**
 * The region a "not in r" claim marks: r itself, or with the decidable band hidden, the largest
 * region drawn inside it (not decidable means not context-sensitive either).
 */
export const shownOut = (r: RegionId, s: MapSettings): RegionId =>
  r === 'dec' && !s.decidable ? 'cs' : r;

/** Whether region a lies inside region b (or is b). */
export const inside = (a: RegionId, b: RegionId): boolean =>
  REGIONS.indexOf(a) <= REGIONS.indexOf(b);

export const TYPE: Partial<Record<RegionId, number>> = { reg: 3, cf: 2, cs: 1, re: 0 };

export const NAME: Record<RegionId, string> = {
  reg: 'regular',
  cf: 'context-free',
  cs: 'context-sensitive',
  dec: 'decidable',
  re: 'recursively enumerable',
  all: 'all languages',
};

/** The machine that recognizes each level. */
export const MACHINE: Record<RegionId, string> = {
  reg: 'finite automaton',
  cf: 'pushdown automaton',
  cs: 'linear-bounded automaton',
  dec: 'Turing machine that always halts',
  re: 'Turing machine',
  all: 'most have no machine at all',
};

/** The machines by their usual abbreviations, for a narrow map. */
export const SHORT_MACHINE: Record<RegionId, string> = {
  reg: 'DFA or NFA',
  cf: 'PDA',
  cs: 'LBA',
  dec: 'TM that always halts',
  re: 'TM',
  all: 'most have no TM',
};

/** The grammar form of each level, as the map shows it. */
export const FORM: Record<RegionId, string> = {
  reg: 'A → wB | w',
  cf: 'A → γ',
  cs: 'α → β, |α| ≤ |β|',
  dec: '',
  re: 'α → β',
  all: '',
};

/** The level in narration: "context-free", or with Type names "Type 2 (context-free)". */
export function levelWord(r: RegionId, s: MapSettings): string {
  const t = TYPE[r];
  return s.names === 'types' && t !== undefined ? `Type ${t} (${NAME[r]})` : NAME[r];
}

/** The title of a region on the map. */
export function regionTitle(r: RegionId, s: MapSettings): string {
  const t = TYPE[r];
  if (s.names === 'types' && t !== undefined) return `Type ${t}`;
  return NAME[r].charAt(0).toUpperCase() + NAME[r].slice(1);
}

/** The level of a grammar in narration: "context-free", "unrestricted (Type 0)". */
export function grammarWord(level: Level, s: MapSettings): string {
  const t = TYPE[LEVEL_REGION[level]]!;
  return s.names === 'types' ? `Type ${t} (${level})` : level;
}

/** The form each grammar level asks of every rule, in words. */
export const LEVEL_FORM: Record<Level, string> = {
  regular: 'right-linear: A → wB or A → w, with w a string of terminals',
  'context-free': 'context-free: one variable on the left, A → γ',
  'context-sensitive':
    'non-contracting: α → β with β at least as long as α (S → ε only when S is on no right side)',
  unrestricted: 'α → β with a variable in α',
};

// ---------------------------------------------------------------------------------------------
// Checking rules

const sideText = (syms: readonly Sym[]) => (syms.length ? syms.join('') : EPS);
export const productionText = (p: Production) => `${sideText(p.lhs)} → ${sideText(p.rhs)}`;

export interface Miss {
  /** A sentence: why the rule does not fit the level's form. */
  why: string;
  /** A few words, for the panel. */
  short: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Why rule p does not fit a level's form, or null when it fits. `start` is the start variable and
 * `startOnRight` whether it appears on any right side (for S → ε in a context-sensitive grammar).
 */
export function ruleMiss(
  level: Level,
  p: Production,
  start: Sym,
  startOnRight: boolean,
): Miss | null {
  const oneVariable = p.lhs.length === 1 && isVariable(p.lhs[0]!);
  const left = sideText(p.lhs);
  if (level === 'regular' || level === 'context-free') {
    if (!oneVariable) {
      return {
        why: `its left side, ${left}, is ${plural(p.lhs.length, 'symbol')}, and a ${level} rule has one variable there`,
        short: `${plural(p.lhs.length, 'symbol')} on the left`,
      };
    }
    if (level === 'context-free') return null;
    const vars = p.rhs.filter(isVariable);
    if (vars.length > 1) {
      return {
        why: `it has ${vars.length} variables on the right (${vars.join(', ')}), and a right-linear rule has at most one`,
        short: `${vars.length} variables on the right`,
      };
    }
    if (vars.length === 1 && !isVariable(p.rhs.at(-1)!)) {
      const v = vars[0]!;
      const after = p.rhs.slice(p.rhs.indexOf(v) + 1).join('');
      return {
        why: `${after} comes after the variable ${v}, and a right-linear rule ends with its variable`,
        short: `${after} after ${v}`,
      };
    }
    return null;
  }
  if (level === 'context-sensitive') {
    if (p.rhs.length >= p.lhs.length) return null;
    const startEps = p.rhs.length === 0 && p.lhs.length === 1 && p.lhs[0] === start;
    if (startEps && !startOnRight) return null;
    if (startEps) {
      return {
        why: `${start} → ε is allowed only when ${start} is on no right side, and ${start} is on one`,
        short: `${start} → ε with ${start} on a right side`,
      };
    }
    return {
      why: `its right side is shorter than its left (${plural(p.rhs.length, 'symbol')} against ${p.lhs.length}), so it shrinks the string`,
      short: `shrinks ${p.lhs.length} symbols to ${p.rhs.length}`,
    };
  }
  return null;
}

export interface LevelCheck {
  level: Level;
  /** The first rule (an index) that does not fit this level's form, or -1 when all fit. */
  miss: number;
  why: string;
  short: string;
}

export interface GrammarLevel {
  /** The most restrictive level whose form every rule fits. */
  level: Level;
  /** One check per level tried, from regular out; every one but the last has a miss. */
  checks: LevelCheck[];
}

/** Whether the start variable appears on a right side. */
export const startOnRight = (start: Sym, rules: readonly Production[]) =>
  rules.some((p) => p.rhs.includes(start));

/**
 * Check the rules level by level from the most restrictive, and stop at the first level whose
 * form every rule fits. The same answer as classify() from the shared grammar code.
 */
export function checkLevels(start: Sym, rules: readonly Production[]): GrammarLevel {
  const onRight = startOnRight(start, rules);
  const checks: LevelCheck[] = [];
  for (const level of LEVELS) {
    const at = rules.findIndex((p) => ruleMiss(level, p, start, onRight));
    const m = at >= 0 ? ruleMiss(level, rules[at]!, start, onRight)! : null;
    checks.push({ level, miss: at, why: m?.why ?? '', short: m?.short ?? '' });
    if (at < 0) return { level, checks };
  }
  // Unrestricted fits every rule, so the loop always returns.
  return { level: 'unrestricted', checks };
}
