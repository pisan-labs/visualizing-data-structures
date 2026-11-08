/**
 * The levels of the hierarchy as regions of the map, their names, machines and grammar forms,
 * and the form each level asks of a grammar's rules.
 *
 * The rule-by-rule check itself (ruleMiss, checkLevels) is classify() in
 * src/viz/_grammar/grammar.ts.
 */
import type { Level } from '../_grammar/grammar';

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
