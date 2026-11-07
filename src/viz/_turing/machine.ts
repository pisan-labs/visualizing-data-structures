/**
 * The Turing machine model, shared by the Turing machine pages (one tape here; a multi-tape page
 * can reuse the tape, the configurations and the text format's pieces).
 *
 * Conventions follow Sipser: a deterministic machine whose halting states are `accept` and
 * `reject`; a missing rule rejects; the input starts at cell 0 with the head on its first
 * symbol; `_` is the blank. Two settings pick where textbooks differ:
 * - the tape is infinite to the right only (Sipser: a move left at cell 0 leaves the head
 *   where it is) or infinite both ways (Hopcroft–Ullman, Linz);
 * - the moves are L and R, or L, R and S (stay).
 *
 * Text: one line, items separated by `;` (or new lines).
 *
 *   q0 1 -> q1 0 R     in q0 reading 1: write 0, move right, go to q1
 *   q1 0,y -> q1 R     reading 0 or y: leave the symbol as it is (Sipser's "0,y→R"), move right
 *   start q0           the start state (default: the first rule's state)
 *
 * - The arrow may be typed as -> or →. A move is L, R or (when allowed) S, in either case.
 * - States are 1 to 6 letters, digits or _. `accept` and `reject` halt and have no rules.
 * - Tape symbols are single letters or digits, or one of # $ * + =; `_` is the blank.
 * - At most one rule per state and symbol.
 *
 * A machine is plain data, so it can sit in a step's state and compare with toEqual. Its
 * states (without accept and reject) are in name order with the start first; its symbols are
 * every symbol a rule reads or writes, plus the blank: digits, letters, others, blank last.
 * Rules are sorted the same way, by state and then by symbol.
 *
 * A configuration holds the state, the tape's non-blank span (`cells` from cell `first` on,
 * with no blank at either end), the head, the moves made, and the leftmost and rightmost cells
 * the head has visited.
 *
 * API
 *   parseMachine(text, { stay })  Machine, or an Error whose message names the bad item
 *   formatMachine(m)              text; parseMachine(formatMachine(m)) equals m
 *   parseWord(text)               an input word ("" for ε), or an Error
 *   startConfig(m, word)          the start configuration: q0 on cell 0
 *   cellAt(c, i), ruleFor(m, q, a)
 *   step(m, c, tape)              what one move does: halted, stuck (no rule: reject) or moved
 *   run(m, word, tape, cap)       the configuration it halts in, or the one at the cap
 *   configParts(c, tape, keep)    Sipser's u q v, with at most `keep` symbols on each side
 *   formatConfig(c, tape)         "u q v" as one line
 *   tapeText(c)                   the non-blank span with _ inside, or _ for an empty tape
 */
import { STATE } from '../_automata/automaton';
import { compareNames } from '../_graph/graph';

export const BLANK = '_';
/** How the blank is drawn and written in configurations. */
export const BLANK_SHOWN = '␣';
export const ACCEPT = 'accept';
export const REJECT = 'reject';
/** A run stops after this many moves. */
export const CAP = 500;

/** Tape symbols other than the blank. */
export const SYMBOL = /^[A-Za-z0-9#$*+=]$/;

/** Limits that keep the transition table readable on a phone. */
export const MAX_STATES = 10;
export const MAX_SYMBOLS = 8;
export const MAX_RULES = 60;
export const MAX_WORD = 16;

export type Dir = 'L' | 'R' | 'S';
export type TapeKind = 'one-way' | 'two-way';

export interface Rule {
  from: string;
  read: string;
  to: string;
  write: string;
  move: Dir;
}

export interface Machine {
  start: string;
  /** Every state but accept and reject, start first, then in name order. */
  states: string[];
  /** Every symbol read or written, and the blank: digits, letters, others, the blank last. */
  symbols: string[];
  /** Sorted by state (as in `states`), then by symbol (as in `symbols`). */
  rules: Rule[];
}

export interface Config {
  state: string;
  /** The tape's non-blank span: cell `first + k` holds `cells[k]`; no blank at either end. */
  cells: string[];
  first: number;
  head: number;
  moves: number;
  /** The leftmost and rightmost cells the head has visited. */
  lo: number;
  hi: number;
}

export const halting = (q: string) => q === ACCEPT || q === REJECT;

const rank = (c: string) =>
  c === BLANK ? 3 : c >= '0' && c <= '9' ? 0 : /[A-Za-z]/.test(c) ? 1 : 2;

/** Digits, then letters, then the other symbols, the blank last. */
export const compareSymbols = (a: string, b: string): number =>
  rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);

const isSymbol = (c: string) => c === BLANK || SYMBOL.test(c);

/** The canonical machine: states, symbols and rules in order. */
export function makeMachine(start: string, rules: Rule[]): Machine {
  const states = [
    ...new Set([start, ...rules.flatMap((r) => [r.from, r.to])].filter((q) => !halting(q))),
  ].sort((a, b) => (a === start ? -1 : b === start ? 1 : compareNames(a, b)));
  const symbols = [...new Set([BLANK, ...rules.flatMap((r) => [r.read, r.write])])].sort(
    compareSymbols,
  );
  const order = new Map(states.map((q, i) => [q, i]));
  const sorted = rules
    .map((r) => ({ ...r }))
    .sort((r, s) => order.get(r.from)! - order.get(s.from)! || compareSymbols(r.read, s.read));
  return { start, states, symbols, rules: sorted };
}

export function parseMachine(raw: string, o: { stay?: boolean } = {}): Machine | Error {
  const items = raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!items.length) return new Error('Type rules such as "q0 1 -> q1 0 R", separated by ;.');
  let start: string | undefined;
  const rules: Rule[] = [];
  const state = (name: string, item: string): Error | null =>
    STATE.test(name)
      ? null
      : new Error(
          `"${name}" in "${item}" is not a state name: use 1 to 6 letters, digits or _, such as q0.`,
        );
  const symbol = (c: string, item: string): Error | null =>
    isSymbol(c)
      ? null
      : new Error(
          `"${c}" in "${item}" is not a tape symbol: use one letter or digit, one of # $ * + =, or _ for the blank.`,
        );
  for (const item of items) {
    const words = item.split(/\s+/);
    const head = words[0]!.toLowerCase();
    const arrow = /->|→/.test(item);
    if (head === 'start' && !arrow) {
      if (words.length !== 2)
        return new Error(`"${item}": name one start state, as in "start q0".`);
      const bad = state(words[1]!, item);
      if (bad) return bad;
      start = words[1]!;
      continue;
    }
    if ((head === ACCEPT || head === REJECT || head === 'final') && !arrow)
      return new Error(
        `"${item}": the halting states are always called accept and reject. Send a rule to one of them instead, such as "q3 _ -> accept R".`,
      );
    const m = /^(\S+)\s+(\S+)\s*(?:->|→)\s*(.+)$/.exec(item);
    if (!m)
      return new Error(
        `"${item}" is not a rule. Write a rule as "q0 1 -> q1 0 R" (or "q0 1 -> q1 R" to leave the symbol), or name the start state with "start q0".`,
      );
    const from = m[1]!;
    const bad = state(from, item);
    if (bad) return bad;
    if (halting(from))
      return new Error(`"${item}": ${from} halts the machine, so it cannot have rules.`);
    const right = m[3]!.trim().split(/\s+/);
    if (right.length < 2 || right.length > 3)
      return new Error(
        `"${item}" needs a state, a symbol to write (optional) and a move after the arrow, as in "-> q1 0 R".`,
      );
    const to = right[0]!;
    const badTo = state(to, item);
    if (badTo) return badTo;
    const write = right.length === 3 ? right[1]! : null;
    if (write !== null) {
      const badWrite = symbol(write, item);
      if (badWrite) return badWrite;
    }
    const move = right[right.length - 1]!.toUpperCase();
    if (move === 'S' && !o.stay)
      return new Error(
        `"${item}" stays put (S), and the moves are L and R only. Turn on L/R/S moves in Options, or move L or R.`,
      );
    if (move !== 'L' && move !== 'R' && move !== 'S')
      return new Error(
        `"${right[right.length - 1]}" in "${item}" is not a move: use L or R${o.stay ? ', or S to stay' : ''}.`,
      );
    const reads = m[2]!.split(',').filter(Boolean);
    if (!reads.length) return new Error(`"${item}" needs a symbol to read before the arrow.`);
    for (const read of reads) {
      const badRead = symbol(read, item);
      if (badRead) return badRead;
      const rule: Rule = { from, read, to, write: write ?? read, move: move as Dir };
      const old = rules.find((r) => r.from === from && r.read === read);
      if (old) {
        if (old.to === rule.to && old.write === rule.write && old.move === rule.move) continue;
        return new Error(
          `"${item}" gives ${from} a second rule for ${read}. Keep one rule per state and symbol, so the machine is deterministic.`,
        );
      }
      rules.push(rule);
    }
  }
  start ??= rules[0]?.from;
  if (start === undefined)
    return new Error('Add a rule such as "q0 1 -> q1 0 R", or name the start state.');
  const machine = makeMachine(start, rules);
  if (machine.states.length > MAX_STATES)
    return new Error(
      `Use at most ${MAX_STATES} states besides accept and reject, so the table stays readable.`,
    );
  if (machine.symbols.length > MAX_SYMBOLS)
    return new Error(`Use at most ${MAX_SYMBOLS - 1} tape symbols besides the blank.`);
  if (machine.rules.length > MAX_RULES) return new Error(`Use at most ${MAX_RULES} rules.`);
  return machine;
}

/** Rules that leave the symbol alone are grouped and written short: "q1 0,y -> q1 R". */
export function formatMachine(m: Machine): string {
  const groups = new Map<string, { r: Rule; keep: boolean; reads: string[] }>();
  for (const r of m.rules) {
    const keep = r.write === r.read;
    const k = [r.from, r.to, keep ? '' : r.write, r.move, keep].join('\u0000');
    const g = groups.get(k) ?? { r, keep, reads: [] };
    g.reads.push(r.read);
    groups.set(k, g);
  }
  const items = [...groups.values()].map(
    ({ r, keep, reads }) =>
      `${r.from} ${reads.join(',')} -> ${r.to}${keep ? '' : ` ${r.write}`} ${r.move}`,
  );
  if (m.rules[0]?.from !== m.start) items.unshift(`start ${m.start}`);
  return items.join('; ');
}

/** An input word: tape symbols other than the blank, with or without spaces; ε or eps is empty. */
export function parseWord(raw: string): string | Error {
  const w = raw.replace(/\s+/g, '');
  if (w === 'ε' || w === 'eps') return '';
  if (!w) return new Error('Type a word such as 0011, or ε for the empty word.');
  if (/->|→|;/.test(w))
    return new Error('That looks like rules, not a word. Press Load to load a machine.');
  if (w.length > MAX_WORD) return new Error(`Keep the word to ${MAX_WORD} symbols or fewer.`);
  for (const c of w) {
    if (c === BLANK)
      return new Error(
        'The input cannot hold the blank _: the word ends where the blanks begin. Type a word such as 0011.',
      );
    if (!SYMBOL.test(c))
      return new Error(
        `"${c}" is not a tape symbol. Use letters, digits and # $ * + =, or ε for the empty word.`,
      );
  }
  return w;
}

export function startConfig(m: Machine, word: string): Config {
  return { state: m.start, cells: [...word], first: 0, head: 0, moves: 0, lo: 0, hi: 0 };
}

export function cellAt(c: Pick<Config, 'cells' | 'first'>, i: number): string {
  return c.cells[i - c.first] ?? BLANK;
}

export function ruleFor(m: Machine, q: string, a: string): Rule | undefined {
  return m.rules.find((r) => r.from === q && r.read === a);
}

/** The tape after writing `sym` in cell i, trimmed of blanks at both ends. */
export function written(
  c: Pick<Config, 'cells' | 'first'>,
  i: number,
  sym: string,
): { cells: string[]; first: number } {
  const lo = c.cells.length ? Math.min(c.first, i) : i;
  const hi = c.cells.length ? Math.max(c.first + c.cells.length - 1, i) : i;
  const out = Array.from({ length: hi - lo + 1 }, (_, k) =>
    lo + k === i ? sym : cellAt(c, lo + k),
  );
  let a = 0;
  let b = out.length;
  while (a < b && out[a] === BLANK) a++;
  while (b > a && out[b - 1] === BLANK) b--;
  return a === b ? { cells: [], first: 0 } : { cells: out.slice(a, b), first: lo + a };
}

export type StepResult =
  | { kind: 'halted' }
  /** No rule for the state and symbol: the machine rejects without moving. */
  | { kind: 'stuck'; config: Config }
  /** `bumped`: told to move left at the left end of a one-way tape, so the head stayed. */
  | { kind: 'moved'; config: Config; rule: Rule; bumped: boolean };

export function step(m: Machine, c: Config, tape: TapeKind): StepResult {
  if (halting(c.state)) return { kind: 'halted' };
  const rule = ruleFor(m, c.state, cellAt(c, c.head));
  if (!rule) return { kind: 'stuck', config: { ...c, state: REJECT } };
  let head = c.head + (rule.move === 'R' ? 1 : rule.move === 'L' ? -1 : 0);
  const bumped = tape === 'one-way' && head < 0;
  if (bumped) head = 0;
  return {
    kind: 'moved',
    rule,
    bumped,
    config: {
      state: rule.to,
      ...written(c, c.head, rule.write),
      head,
      moves: c.moves + 1,
      lo: Math.min(c.lo, head),
      hi: Math.max(c.hi, head),
    },
  };
}

export type Outcome = 'accept' | 'reject' | 'running';

/**
 * Run from the start configuration. At each configuration: a halting state ends the run; no
 * rule rejects (without a move); after `cap` moves the run stops, still running.
 */
export function run(
  m: Machine,
  word: string,
  tape: TapeKind,
  cap = CAP,
): { config: Config; outcome: Outcome } {
  let c = startConfig(m, word);
  for (;;) {
    if (c.state === ACCEPT) return { config: c, outcome: 'accept' };
    if (c.state === REJECT) return { config: c, outcome: 'reject' };
    const r = step(m, c, tape);
    if (r.kind === 'stuck') return { config: r.config, outcome: 'reject' };
    if (c.moves >= cap) return { config: c, outcome: 'running' };
    if (r.kind === 'moved') c = r.config;
  }
}

export interface ConfigParts {
  /** The cells left of the head (from cell 0 on a one-way tape). */
  u: string;
  q: string;
  /** The head's cell and the cells right of it, up to the last non-blank. */
  v: string;
}

/**
 * Sipser's configuration u q v: the tape is uv, the machine is in state q, and the head is on
 * the first symbol of v. Blanks inside show as ␣. With `keep`, u keeps only its last `keep`
 * symbols and v its first `keep`, with … where symbols were left out.
 */
export function configParts(c: Config, tape: TapeKind, keep = Infinity): ConfigParts {
  const last = c.cells.length ? c.first + c.cells.length - 1 : c.head;
  const left = tape === 'one-way' ? 0 : Math.min(c.head, c.cells.length ? c.first : c.head);
  const right = Math.max(c.head, last);
  const span = (a: number, b: number) =>
    Array.from({ length: Math.max(0, b - a) }, (_, k) => {
      const s = cellAt(c, a + k);
      return s === BLANK ? BLANK_SHOWN : s;
    });
  let u = span(left, c.head);
  let v = span(c.head, right + 1);
  if (u.length > keep) u = ['…', ...u.slice(u.length - keep)];
  if (v.length > keep) v = [...v.slice(0, keep), '…'];
  return { u: u.join(''), q: c.state, v: v.join('') };
}

export function formatConfig(c: Config, tape: TapeKind, keep = Infinity): string {
  const { u, q, v } = configParts(c, tape, keep);
  return u ? `${u} ${q} ${v}` : `${q} ${v}`;
}

/** The non-blank span of the tape, with _ for blanks inside it, or _ for an empty tape. */
export function tapeText(c: Pick<Config, 'cells'>): string {
  return c.cells.length ? c.cells.join('') : BLANK;
}

/** "δ(q0, 0) = (q1, x, R)", with ␣ for the blank. */
export function ruleText(r: Rule): string {
  const s = (a: string) => (a === BLANK ? BLANK_SHOWN : a);
  return `δ(${r.from}, ${s(r.read)}) = (${r.to}, ${s(r.write)}, ${r.move})`;
}
