/**
 * Shared model code for the string-matching pages (brute-force-search, kmp, boyer-moore,
 * rabin-karp): the state, reading "text / pattern" from the input box, the `load` operation,
 * and a search engine that runs a page's alignments one at a time. Drawing lives in
 * src/layouts/align.ts and ./view.ts. This folder has no index.ts, so the registry does not
 * treat it as a page.
 *
 * Every page has the same operations, so compare mode can run two of them on the same input:
 * - `load "T / P"` (or "T P", or just "P" to keep the text) replaces the text and the pattern;
 * - `search` runs the search to the end, carrying on with one in progress;
 * - `next` runs one alignment.
 *
 * A search is a list of alignments (attempts). Each puts P[0] under T[s] for a shift s,
 * compares characters (or hashes), and decides where the pattern goes next. The state keeps
 * the attempts so far, the one being compared (`live`, only inside an operation) and the one
 * to try next, so a picture of the state shows where the search stands.
 */
import type { Rng } from '../../engine/rng';
import type {
  Level,
  Mark,
  MarkRole,
  OpSpec,
  PseudoLine,
  Scalar,
  Step,
  Value,
} from '../../engine/types';
import type { AlignRow, Cmp } from '../../layouts/align';

export type { Cmp };

export const MAX_TEXT = 24;
export const MAX_PATTERN = 12;

/** What every page starts with: two matches, and something for each algorithm to show. */
export const START_TEXT = 'GABABABACABABACG';
export const START_PATTERN = 'ABABAC';

/** How the pattern got to an alignment from the one before. */
export interface Shift {
  amount: number;
  /** A short reason for the trace: "π[4] = 3". */
  why?: string;
  /** Boyer-Moore: the rule that chose the shift, drawn after it ("+3 gs"); 'tie' when both agree. */
  rule?: 'bc' | 'gs' | 'tie';
}

export interface Attempt {
  /** The shift: P[0] sits under T[s]. */
  s: number;
  /** How each comparison at P[j] came out; null where nothing was compared. */
  cells: (Cmp | null)[];
  /** How it ended. 'miss': the hashes differ, so no character is compared (Rabin-Karp). */
  end?: 'match' | 'mismatch' | 'miss' | 'spurious';
  by?: Shift;
  /** Rabin-Karp: the window's hash. */
  hash?: number;
}

/** The alignment to try next. */
export interface Upcoming {
  s: number;
  /** Characters at the start of P already known to match T (KMP). */
  known: number;
  by?: Shift;
  hash?: number;
}

/** Rabin-Karp's numbers for one search. */
export interface Hashing {
  d: number;
  q: number;
  h: number;
  p: number;
  /** The hash of each window computed so far, by shift. */
  values: (number | null)[];
  checks: number;
  spurious: number[];
}

export interface Search {
  /** 1 for the first search after a load, 2 for the next... */
  serial: number;
  attempts: Attempt[];
  /** The alignment being compared, inside an operation; null between operations. */
  live: Attempt | null;
  /** The next alignment, or null when the search is over. */
  next: Upcoming | null;
  found: number[];
  comparisons: number;
  hashing?: Hashing;
}

export interface MatchState<Pre = unknown> {
  text: string;
  pattern: string;
  /** What the page computes from P alone (π, shift tables); kept while P stays the same. */
  pre: Pre | null;
  search: Search | null;
}

/** View-only data for one step. */
export interface MatchExtra {
  /** The text column and pattern position compared now. */
  pair?: { i: number; j: number };
  /** The text pointer. */
  pointer?: { name: string; at: number };
  /** P against a shifted copy of itself, while a table is built from P alone. */
  self?: { rows: AlignRow[]; pair?: { i: number; row: string; j: number }; pointer?: number };
  /** Rabin-Karp: the arithmetic of a hash, to say it in the drawing. */
  sum?: string;
}

export type MatchStep<Pre> = Step<MatchState<Pre>, MatchExtra>;
export type Gen<Pre, R = void> = Generator<MatchStep<Pre>, R, void>;

export const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

/** 'A', in quotes, for narration. */
export const q = (ch: string): string => `'${ch}'`;

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** "a, b and c". */
export function andList(xs: readonly (string | number)[]): string {
  const s = xs.map(String);
  if (s.length <= 1) return s[0] ?? '';
  return `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`;
}

// ----- Ids of the shapes the view draws, for marks -----

export const textId = (i: number) => `t-${i}`;
export const cellId = (row: number | string, j: number) => `r${row}-${j}`;
/** The top row while P is compared with itself. */
export const selfTopId = (i: number) => `u-${i}`;

// ----- Reading the input -----

export interface Parsed {
  /** Undefined when only a pattern was typed: the text stays. */
  text?: string;
  pattern: string;
}

const EXAMPLE = 'ABRACADABRA / ABRA';

/**
 * Read "T / P", "T P" or just "P". Letters and digits only, so every character is one cell and
 * the drivers can read a line with split(). Returns a message for anything else.
 */
export function parseLoad(raw: Value | undefined): Parsed | string {
  const t = String(raw ?? '').trim();
  if (!t) return `Type a text and a pattern, such as ${EXAMPLE}.`;
  let parts: string[];
  if (t.includes('/')) {
    parts = t.split('/').map((p) => p.trim());
    if (parts.length !== 2)
      return `Use one slash, between the text and the pattern, as in ${EXAMPLE}.`;
    if (!parts[0]) return `Type the text before the slash, as in ${EXAMPLE}.`;
    if (!parts[1]) return `Type the pattern after the slash, as in ${EXAMPLE}.`;
  } else {
    parts = t.split(/\s+/);
    if (parts.length > 2)
      return `That is ${parts.length} words. Type the text, a slash and the pattern, as in ${EXAMPLE}. Neither can hold a space.`;
  }
  for (const p of parts) {
    if (/\s/.test(p)) return `"${p}" has a space. The text and the pattern cannot hold spaces.`;
    const bad = /[^A-Za-z0-9]/.exec(p);
    if (bad)
      return `"${p}" has "${bad[0]}" in it. Use letters and digits only, so each character is one cell.`;
  }
  const [a, b] = parts;
  const text = b === undefined ? undefined : a!;
  const pattern = b ?? a!;
  if (text !== undefined && text.length > MAX_TEXT)
    return `The text has ${text.length} characters. Keep it to ${MAX_TEXT}, so every character stays readable.`;
  if (pattern.length > MAX_PATTERN)
    return `The pattern has ${pattern.length} characters. Keep it to ${MAX_PATTERN}.`;
  return text === undefined ? { pattern } : { text, pattern };
}

/** For the input box: the text and the pattern as one value, "T / P", or just "P". */
export function parseInput(token: string): Value | Error {
  const r = parseLoad(token);
  if (typeof r === 'string') return new Error(r);
  return r.text === undefined ? r.pattern : `${r.text} / ${r.pattern}`;
}

export const loadCall = (text: string, pattern: string): ['load', string] => [
  'load',
  `${text} / ${pattern}`,
];

// ----- State -----

export function initState<Pre>(): MatchState<Pre> {
  return { text: START_TEXT, pattern: START_PATTERN, pre: null, search: null };
}

/** The shifts where P really occurs in T: indexOf in a loop, the reference for every page. */
export function occurrences(text: string, pattern: string): number[] {
  const out: number[] = [];
  if (!pattern) return out;
  for (let s = text.indexOf(pattern); s >= 0; s = text.indexOf(pattern, s + 1)) out.push(s);
  return out;
}

export const foundText = (found: readonly number[]): string =>
  found.length ? found.join(', ') : 'none';

/** A search has run to its end (and the state is not in the middle of an alignment). */
export const isOver = (s: MatchState): boolean =>
  s.search !== null && s.search.next === null && s.search.live === null;

/**
 * The working copy of the state during one operation. `step()` snapshots it, so every step is
 * its own immutable picture.
 */
export class Run<Pre> {
  text: string;
  pattern: string;
  pre: Pre | null;
  search: Search | null;
  /** Whether a search finished before this operation began (so the next one starts over). */
  readonly restarted: boolean;

  constructor(s: MatchState<Pre>) {
    const copy = structuredClone(s);
    this.text = copy.text;
    this.pattern = copy.pattern;
    this.pre = copy.pre;
    this.search = copy.search;
    this.restarted = s.search !== null && s.search.next === null;
  }

  get n(): number {
    return this.text.length;
  }

  get m(): number {
    return this.pattern.length;
  }

  /** The search in progress. Only call it once a search has begun. */
  get s(): Search {
    if (!this.search) throw new Error('No search has begun.');
    return this.search;
  }

  snapshot(): MatchState<Pre> {
    return structuredClone({
      text: this.text,
      pattern: this.pattern,
      pre: this.pre,
      search: this.search,
    });
  }

  step(
    say: string,
    lines: string[],
    level: Level,
    marks: Mark[] = [],
    vars: Record<string, Scalar> = {},
    extra?: MatchExtra,
  ): MatchStep<Pre> {
    return {
      state: this.snapshot(),
      marks,
      say,
      lines,
      level,
      vars,
      ...(extra ? { extra } : {}),
    };
  }

  /** Start an empty search whose first alignment is shift 0. */
  begin(hashing?: Hashing): Search {
    this.search = {
      serial: (this.search?.serial ?? 0) + 1,
      attempts: [],
      live: null,
      next: this.m <= this.n ? { s: 0, known: 0 } : null,
      found: [],
      comparisons: 0,
      ...(hashing ? { hashing } : {}),
    };
    return this.search;
  }

  /** Make the next alignment the live one, with its known characters marked. */
  enter(): Attempt {
    const s = this.s;
    const next = s.next!;
    const cells: (Cmp | null)[] = Array.from({ length: this.m }, (_, j) =>
      j < next.known ? 'known' : null,
    );
    const live: Attempt = {
      s: next.s,
      cells,
      ...(next.by ? { by: next.by } : {}),
      ...(next.hash !== undefined ? { hash: next.hash } : {}),
    };
    s.live = live;
    s.next = null;
    return live;
  }

  /** Compare T[s + j] with P[j] in the live alignment: count it and record how it came out. */
  compare(j: number): boolean {
    const live = this.s.live!;
    const same = this.text[live.s + j] === this.pattern[j];
    this.s.comparisons++;
    live.cells[j] = same ? 'match' : 'mismatch';
    return same;
  }

  /** Close the live alignment and set the next one (null: the search is over). */
  close(end: NonNullable<Attempt['end']>, next: Upcoming | null): void {
    const s = this.s;
    const live = s.live!;
    live.end = end;
    if (end === 'match') s.found.push(live.s);
    s.attempts.push(live);
    s.live = null;
    // Past the last shift that fits, the search is over.
    s.next = next && next.s <= this.n - this.m ? next : null;
  }

  /** The common counters, for a step's variables. */
  counters(): Record<string, Scalar> {
    const s = this.search;
    return {
      comparisons: s?.comparisons ?? 0,
      found: foundText(s?.found ?? []),
    };
  }
}

// ----- Operations -----

export interface LoadOptions {
  /** Keep `pre` when only the text changes (it depends on P alone). */
  keepPre?: (pre: unknown) => string;
}

/** `load "T / P"`, `load "T P"` or `load "P"`. */
export function loadOp<Pre, Set>(opts: LoadOptions = {}): OpSpec<MatchState<Pre>, Set, MatchExtra> {
  return {
    label: 'Load',
    arity: 1,
    *run(s, [arg]) {
      const parsed = parseLoad(arg);
      if (typeof parsed === 'string') {
        yield {
          state: s,
          marks: [mark('t-name', 'error')],
          say: `Nothing loaded. ${parsed} The text and the pattern stay as they were.`,
          lines: [],
          level: 1,
          vars: { n: s.text.length, m: s.pattern.length },
        };
        return s;
      }
      const text = parsed.text ?? s.text;
      const pattern = parsed.pattern;
      const keep = opts.keepPre && s.pre !== null && pattern === s.pattern;
      const next: MatchState<Pre> = { text, pattern, pre: keep ? s.pre : null, search: null };
      const n = text.length;
      const m = pattern.length;
      const what =
        parsed.text === undefined
          ? `P = ${q(pattern)}, ${plural(m, 'character')}. The text stays T = ${q(text)}.`
          : `T = ${q(text)}, ${plural(n, 'character')}, and P = ${q(pattern)}, ${plural(m, 'character')}.`;
      const then =
        m > n
          ? ' P is longer than T, so it cannot occur. Search anyway to see what happens.'
          : ` That gives ${plural(n - m + 1, 'shift')} to try, s = 0 to ${n - m}. Press Search.`;
      yield {
        state: next,
        marks: [],
        say: what + then + (keep && opts.keepPre ? ` ${opts.keepPre(s.pre)}` : ''),
        lines: [],
        level: 1,
        vars: { n, m },
      };
      return next;
    },
  };
}

/** The page's part of a search. Each generator works on `run` and yields its steps. */
export interface Engine<Pre, Set> {
  /** Build what the search needs from P alone, when `run.pre` is null (π, shift tables). */
  prepare?: (run: Run<Pre>, settings: Set) => Gen<Pre>;
  /** Start a search: `run.begin()` and any steps before the first alignment. */
  start: (run: Run<Pre>, settings: Set) => Gen<Pre>;
  /** One alignment, from `run.s.next`: compare, close it, and say where the pattern goes. */
  attempt: (run: Run<Pre>, settings: Set) => Gen<Pre>;
  /** The step that ends a search. */
  finish: (run: Run<Pre>, settings: Set) => MatchStep<Pre>;
}

function* opening<Pre, Set>(engine: Engine<Pre, Set>, run: Run<Pre>, settings: Set): Gen<Pre> {
  if (run.search?.next) return;
  if (engine.prepare && run.pre === null) yield* engine.prepare(run, settings);
  yield* engine.start(run, settings);
}

/** `search` and `next`, the same on every page. */
export function searchOps<Pre, Set>(
  engine: Engine<Pre, Set>,
): Record<'search' | 'next', OpSpec<MatchState<Pre>, Set, MatchExtra>> {
  return {
    search: {
      label: 'Search',
      arity: 0,
      *run(s, _args, { settings }) {
        const run = new Run(s);
        yield* opening(engine, run, settings);
        while (run.search?.next) yield* engine.attempt(run, settings);
        yield engine.finish(run, settings);
        return run.snapshot();
      },
    },
    next: {
      label: 'Next alignment',
      arity: 0,
      *run(s, _args, { settings }) {
        const run = new Run(s);
        yield* opening(engine, run, settings);
        if (run.search?.next) yield* engine.attempt(run, settings);
        if (!run.search?.next) yield engine.finish(run, settings);
        return run.snapshot();
      },
    },
  };
}

// ----- Random inputs for presets and practice -----

export function randomWord(rng: Rng, length: number, letters: string): string {
  return Array.from({ length }, () => letters[rng.int(0, letters.length - 1)]).join('');
}

/** A text over `letters` with the pattern planted in it a few times. */
export function plantedText(rng: Rng, n: number, pattern: string, letters: string): string {
  const t = [...randomWord(rng, n, letters)];
  const m = pattern.length;
  if (m > n) return t.join('');
  const copies = rng.int(1, Math.max(1, Math.floor(n / (2 * m))));
  for (let k = 0; k < copies; k++) {
    const s = rng.int(0, n - m);
    for (let j = 0; j < m; j++) t[s + j] = pattern[j]!;
  }
  return t.join('');
}

// ----- Code tabs -----

/**
 * Driver protocol for the code tabs: one line "search T P" per search the model finished,
 * and the driver prints the shifts where P occurs, separated by spaces, or "none". Searches
 * finish through Search or the last Next alignment; a search left half done prints nothing.
 */
export function driverScript<Pre>(
  entries: readonly { call: unknown; end: MatchState<Pre> }[],
  initial: MatchState<Pre>,
): { input: string[]; expected: string[] } {
  const input: string[] = [];
  const expected: string[] = [];
  let before = initial;
  for (const e of entries) {
    const s = e.end.search;
    const was = isOver(before) ? before.search!.serial : 0;
    if (s && isOver(e.end) && s.serial !== was) {
      input.push(`search ${e.end.text} ${e.end.pattern}`);
      expected.push(s.found.length ? s.found.join(' ') : 'none');
    }
    before = e.end;
  }
  return { input, expected };
}
