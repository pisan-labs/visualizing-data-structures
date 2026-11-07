/**
 * A Turing machine with two or three tapes (Sipser 3.13), and Sipser's simulation of it on one
 * tape. The one-tape machine's conventions (src/viz/_turing/machine.ts) carry over: `accept`
 * and `reject` halt, a missing rule rejects, `_` is the blank, every tape is infinite to the
 * right only and a head told to move left at cell 0 stays there. As in Sipser's definition of a
 * multi-tape machine, a head may also stay put (S).
 *
 * Text: one line, items separated by `;` (or new lines). One symbol, write and move per tape,
 * separated by commas:
 *
 *   q0 1,_ -> q1 1,1 R,R     in q0, tape 1 reading 1 and tape 2 a blank: write 1 on both,
 *                            move both heads right, go to q1
 *   q1 0|1,_ -> q1 -,$ S,R   | lists symbols a tape may read; - leaves a tape's symbol alone
 *   q2 0,0 -> q2 R,R         leave out the writes to leave every symbol alone
 *   start q0                 the start state (default: the first rule's state)
 *
 * Tape symbols are those of the one-tape page except #, which the simulation keeps for itself:
 * it separates the tapes on the single tape. At most one rule per state and symbols read.
 *
 * Input: one word per tape, separated by commas ("101,011" puts 101 on tape 1 and 011 on tape 2);
 * tapes left out are blank. Sipser puts the whole input on tape 1, which is a single word.
 *
 * A machine is plain data. `lines` keeps each rule as written (tidied), for the page to show;
 * `rules` has one rule per state and tuple of symbols read, each pointing at its line.
 *
 * The single tape (Sipser's S): # w1 # w2 # … # wk #, every segment at least one cell long, and
 * the cell under each head marked. S's head rests on the first # between moves. One move of M:
 * - format (once): one pass right writing the tape and one back: 2(L − 1) moves for L cells;
 * - read: scan right to the last # (L − 1 moves), noting each marked symbol;
 * - write: scan back to the first # (L − 1 moves), writing at each mark and moving it. A mark
 *   moving right costs 2 more moves (step right, and the step back). A mark moving right onto a
 *   # means that tape needs a new cell: S writes a blank there and shifts everything from the #
 *   on one cell right, a walk to the end and back: 2 moves per cell shifted.
 * The code tabs count S's moves the same way.
 */
import { STATE } from '../_automata/automaton';
import { compareNames } from '../_graph/graph';
import {
  ACCEPT,
  BLANK,
  BLANK_SHOWN,
  MAX_STATES,
  MAX_SYMBOLS,
  MAX_WORD,
  REJECT,
  SYMBOL,
  compareSymbols,
  halting,
  parseWord as parseOneWord,
} from '../_turing/machine';

export { ACCEPT, BLANK, BLANK_SHOWN, REJECT, halting };

export type Move = 'L' | 'R' | 'S';

/** The single tape's separator, kept out of the machine's own symbols. */
export const SEP = '#';
/** In a rule's writes: leave this tape's symbol as it is. */
export const KEEP = '-';
export const MIN_TAPES = 2;
export const MAX_TAPES = 3;
/** Rule lines shown on the page, and rules once | is expanded. */
export const MAX_LINES = 20;
export const MAX_RULES = 120;
/** A run of the k-tape machine stops after this many moves; the simulation after SIM_CAP. */
export const CAP = 500;
export const SIM_CAP = 100;

export interface MtRule {
  from: string;
  read: string[];
  to: string;
  write: string[];
  move: Move[];
  /** The index in `lines` of the rule as written. */
  line: number;
}

export interface MtMachine {
  /** The number of tapes. */
  k: number;
  start: string;
  /** Every state but accept and reject, start first, then in name order. */
  states: string[];
  /** Every symbol read or written, and the blank: digits, letters, others, the blank last. */
  symbols: string[];
  /** The rules as written, tidied: "q0 0|1,_ -> q1 -,$ S,R". */
  lines: string[];
  rules: MtRule[];
}

const isSymbol = (c: string) => c === BLANK || (SYMBOL.test(c) && c !== SEP);

const symbolError = (c: string, item: string) =>
  c === SEP
    ? new Error(
        `"${item}" uses #, which the one-tape simulation keeps to separate the tapes. Use another symbol, such as $ or =.`,
      )
    : new Error(
        `"${c}" in "${item}" is not a tape symbol: use one letter or digit, one of $ * + =, or _ for the blank.`,
      );

const stateError = (name: string, item: string) =>
  new Error(
    `"${name}" in "${item}" is not a state name: use 1 to 6 letters, digits or _, such as q0.`,
  );

/** "a,b" with spaces around commas and bars removed. */
const tidy = (item: string) => item.replace(/\s*([,|])\s*/g, '$1').trim();

export function parseMachine(raw: string): MtMachine | Error {
  const items = raw.split(/[;\n]/).map(tidy).filter(Boolean);
  if (!items.length) return new Error('Type rules such as "q0 1,_ -> q1 1,1 R,R", separated by ;.');
  let start: string | undefined;
  let k = 0;
  const lines: string[] = [];
  const rules: MtRule[] = [];
  for (const item of items) {
    const words = item.split(/\s+/);
    const head = words[0]!.toLowerCase();
    const arrow = /->|→/.test(item);
    if (head === 'start' && !arrow) {
      if (words.length !== 2)
        return new Error(`"${item}": name one start state, as in "start q0".`);
      if (!STATE.test(words[1]!)) return stateError(words[1]!, item);
      start = words[1]!;
      continue;
    }
    if ((head === ACCEPT || head === REJECT || head === 'final') && !arrow)
      return new Error(
        `"${item}": the halting states are always called accept and reject. Send a rule to one of them instead, such as "q3 _,_ -> accept S,S".`,
      );
    const m = /^(\S+)\s+(.+?)\s*(?:->|→)\s*(.+)$/.exec(item);
    if (!m)
      return new Error(
        `"${item}" is not a rule. Write a rule as "q0 1,_ -> q1 1,1 R,R": the state, a symbol per tape, the arrow, the next state, a symbol to write per tape (optional) and a move per tape.`,
      );
    const from = m[1]!;
    if (!STATE.test(from)) return stateError(from, item);
    if (halting(from))
      return new Error(`"${item}": ${from} halts the machine, so it cannot have rules.`);
    if (/\s/.test(m[2]!))
      return new Error(
        `"${item}": put commas between the tapes' symbols, as in "q0 1,_ -> …", with no spaces.`,
      );
    const reads = m[2]!.split(',');
    if (k === 0) {
      if (reads.length < MIN_TAPES || reads.length > MAX_TAPES)
        return new Error(
          `"${item}" reads ${reads.length} tape${reads.length === 1 ? '' : 's'}. This page runs machines with ${MIN_TAPES} or ${MAX_TAPES} tapes: one symbol per tape, separated by commas, as in "q0 1,_ -> q1 1,1 R,R". For one tape, use the Turing machine page.`,
        );
      k = reads.length;
    } else if (reads.length !== k)
      return new Error(
        `"${item}" reads ${reads.length} tapes, and the rules before it read ${k}. Give every rule one symbol per tape.`,
      );
    const right = m[3]!.trim().split(/\s+/);
    if (right.length < 2 || right.length > 3)
      return new Error(
        `"${item}" needs a state, the symbols to write (optional) and the moves after the arrow, as in "-> q1 1,1 R,R".`,
      );
    const to = right[0]!;
    if (!STATE.test(to)) return stateError(to, item);
    const writes = right.length === 3 ? right[1]!.split(',') : null;
    if (writes && writes.length !== k)
      return new Error(
        `"${item}" writes ${writes.length} symbol${writes.length === 1 ? '' : 's'} for ${k} tapes. Write one per tape (- leaves a tape's symbol alone), or leave the writes out.`,
      );
    for (const w of writes ?? []) if (w !== KEEP && !isSymbol(w)) return symbolError(w, item);
    const moves = right.at(-1)!.toUpperCase().split(',');
    if (moves.length !== k)
      return new Error(`"${item}" gives ${moves.length} moves for ${k} tapes. Give one per tape.`);
    for (const d of moves)
      if (d !== 'L' && d !== 'R' && d !== 'S')
        return new Error(
          `"${d || ' '}" in "${item}" is not a move: use L, R or S (stay), one per tape.`,
        );
    const options: string[][] = [];
    for (const r of reads) {
      const alts = r.split('|');
      for (const a of alts) {
        if (a === '') return new Error(`"${item}" has an empty symbol to read before the arrow.`);
        if (a === KEEP)
          return new Error(
            `"${item}" reads -, which only means "leave it" among the writes. List the symbols to read, such as 0|1.`,
          );
        if (!isSymbol(a)) return symbolError(a, item);
      }
      options.push([...new Set(alts)]);
    }
    const line = lines.length;
    lines.push(
      `${from} ${reads.join(',')} -> ${to}${writes ? ` ${writes.join(',')}` : ''} ${moves.join(',')}`,
    );
    for (const read of product(options)) {
      const rule: MtRule = {
        from,
        read,
        to,
        write: read.map((a, i) => (writes && writes[i] !== KEEP ? writes[i]! : a)),
        move: moves as Move[],
        line,
      };
      const old = rules.find((r) => r.from === from && same(r.read, read));
      if (old) {
        if (old.to === rule.to && same(old.write, rule.write) && same(old.move, rule.move))
          continue;
        return new Error(
          `"${item}" gives ${from} a second rule for ${read.join(',')}, after "${lines[old.line]}". Keep one rule per state and symbols, so the machine is deterministic.`,
        );
      }
      rules.push(rule);
    }
  }
  start ??= rules[0]?.from;
  if (start === undefined)
    return new Error('Add a rule such as "q0 1,_ -> q1 1,1 R,R", or name the start state.');
  if (k === 0) return new Error(`Add a rule for ${start}, such as "${start} 1,_ -> q1 1,1 R,R".`);
  const states = [
    ...new Set([start, ...rules.flatMap((r) => [r.from, r.to])].filter((q) => !halting(q))),
  ].sort((a, b) => (a === start ? -1 : b === start ? 1 : compareNames(a, b)));
  const symbols = [...new Set([BLANK, ...rules.flatMap((r) => [...r.read, ...r.write])])].sort(
    compareSymbols,
  );
  if (states.length > MAX_STATES)
    return new Error(
      `Use at most ${MAX_STATES} states besides accept and reject, so the rules stay readable.`,
    );
  if (symbols.length > MAX_SYMBOLS)
    return new Error(`Use at most ${MAX_SYMBOLS - 1} tape symbols besides the blank.`);
  if (lines.length > MAX_LINES) return new Error(`Use at most ${MAX_LINES} rules.`);
  if (rules.length > MAX_RULES)
    return new Error(
      `Those rules cover ${rules.length} cases once each | is spelled out; keep it to ${MAX_RULES}.`,
    );
  if (start !== rules[0]?.from) lines.unshift(`start ${start}`);
  return { k, start, states, symbols, lines, rules: rules.map((r) => shiftLine(r, lines)) };
}

/** The rule's line index, counting a "start" line put in front. */
function shiftLine(r: MtRule, lines: string[]): MtRule {
  return lines[0]!.startsWith('start ') ? { ...r, line: r.line + 1 } : r;
}

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

function product(options: string[][]): string[][] {
  return options.reduce<string[][]>(
    (acc, alts) => acc.flatMap((pre) => alts.map((a) => [...pre, a])),
    [[]],
  );
}

/** The machine's text; parseMachine(formatMachine(m)) equals m. */
export const formatMachine = (m: MtMachine): string => m.lines.join('; ');

export function ruleFor(m: MtMachine, q: string, read: readonly string[]): MtRule | undefined {
  return m.rules.find((r) => r.from === q && same(r.read, read));
}

/** How the page shows a symbol: ␣ for the blank. */
export const shown = (a: string) => (a === BLANK ? BLANK_SHOWN : a);

/** "δ(q0, 1, ␣) = (q1, 1, 1, R, R)". */
export function ruleText(r: MtRule): string {
  return `δ(${[r.from, ...r.read.map(shown)].join(', ')}) = (${[r.to, ...r.write.map(shown), ...r.move].join(', ')})`;
}

// ---------------------------------------------------------------------------------------------
// Input

/** One word per tape, separated by commas; ε (or eps, or nothing) for a blank tape. */
export function parseWords(raw: string): string[] | Error {
  const t = raw.replace(/\s+/g, '');
  if (!t) return new Error('Type a word such as 01=01, or ε for blank tapes.');
  if (/->|→|;/.test(t))
    return new Error('That looks like rules, not a word. Press Load to load a machine.');
  const parts = t.split(',');
  if (parts.length > MAX_TAPES)
    return new Error(
      `"${t}" has ${parts.length} words. Give at most one word per tape, separated by commas: at most ${MAX_TAPES}.`,
    );
  const words: string[] = [];
  for (const p of parts) {
    if (p === '' || p === 'ε' || p === 'eps') {
      words.push('');
      continue;
    }
    if (p.includes(SEP))
      return new Error(
        `"${p}" has a #, which the one-tape simulation keeps to separate the tapes. Use another symbol, such as = or $.`,
      );
    const w = parseOneWord(p);
    if (w instanceof Error) return w;
    words.push(w);
  }
  if (words.join('').length > MAX_WORD)
    return new Error(`Keep the input to ${MAX_WORD} symbols or fewer.`);
  return words;
}

/** "01=01", "101,011", or "ε" for blank tapes; trailing blank tapes are left out. */
export function wordsText(words: readonly string[]): string {
  const ws = [...words];
  while (ws.length > 1 && ws.at(-1) === '') ws.pop();
  return ws.every((w) => w === '') ? 'ε' : ws.map((w) => w || 'ε').join(',');
}

// ---------------------------------------------------------------------------------------------
// The k-tape machine

export interface Tape {
  /** From cell 0, with no blank at the end. */
  cells: string[];
  head: number;
  /** The rightmost cell the head has visited. */
  hi: number;
}

export interface MtConfig {
  state: string;
  tapes: Tape[];
  moves: number;
}

export function startConfig(m: MtMachine, words: readonly string[]): MtConfig {
  const tapes = Array.from({ length: m.k }, (_, i) => ({
    cells: [...(words[i] ?? '')],
    head: 0,
    hi: 0,
  }));
  return { state: m.start, tapes, moves: 0 };
}

export const cellAt = (t: Pick<Tape, 'cells'>, i: number): string => t.cells[i] ?? BLANK;

export const under = (c: MtConfig): string[] => c.tapes.map((t) => cellAt(t, t.head));

/** The tape after writing `sym` at cell i, with no blank at the end. */
export function written(cells: readonly string[], i: number, sym: string): string[] {
  const out = [...cells];
  while (out.length <= i) out.push(BLANK);
  out[i] = sym;
  while (out.length && out.at(-1) === BLANK) out.pop();
  return out;
}

export type MtStep =
  | { kind: 'halted' }
  /** No rule for the state and the symbols read: the machine rejects without moving. */
  | { kind: 'stuck'; read: string[]; config: MtConfig }
  /** `bumped[i]`: head i was told to move left at cell 0, so it stayed. */
  | { kind: 'moved'; read: string[]; rule: MtRule; config: MtConfig; bumped: boolean[] };

export function step(m: MtMachine, c: MtConfig): MtStep {
  if (halting(c.state)) return { kind: 'halted' };
  const read = under(c);
  const rule = ruleFor(m, c.state, read);
  if (!rule) return { kind: 'stuck', read, config: { ...c, state: REJECT } };
  const bumped: boolean[] = [];
  const tapes = c.tapes.map((t, i) => {
    const d = rule.move[i];
    let head = t.head + (d === 'R' ? 1 : d === 'L' ? -1 : 0);
    bumped.push(head < 0);
    if (head < 0) head = 0;
    return { cells: written(t.cells, t.head, rule.write[i]!), head, hi: Math.max(t.hi, head) };
  });
  return {
    kind: 'moved',
    read,
    rule,
    bumped,
    config: { state: rule.to, tapes, moves: c.moves + 1 },
  };
}

export type Outcome = 'accept' | 'reject' | 'running';

/**
 * Run from the start. At each configuration: a halting state ends the run; no rule rejects
 * (without a move); after `cap` moves the run stops, still running.
 */
export function run(
  m: MtMachine,
  words: readonly string[],
  cap = CAP,
): { config: MtConfig; outcome: Outcome } {
  let c = startConfig(m, words);
  for (;;) {
    if (c.state === ACCEPT) return { config: c, outcome: 'accept' };
    if (c.state === REJECT) return { config: c, outcome: 'reject' };
    const r = step(m, c);
    if (r.kind === 'stuck') return { config: r.config, outcome: 'reject' };
    if (c.moves >= cap) return { config: c, outcome: 'running' };
    if (r.kind === 'moved') c = r.config;
  }
}

/** A tape's text from cell 0 to its last non-blank, or _ for a blank tape. */
export const tapeText = (t: Pick<Tape, 'cells'>): string => t.cells.join('') || BLANK;

// ---------------------------------------------------------------------------------------------
// The simulation on one tape

export interface Sim {
  /** S's tape from cell 0: k segments, with a # before, between and after them. */
  cells: string[];
  /** Each tape's mark: the cell of S's tape under that tape's virtual head. */
  dots: number[];
  /** S's head. */
  head: number;
  /** S's moves so far. */
  moves: number;
}

/** The cells of S's tape that hold a #, in order: k + 1 of them. */
export const separators = (s: Pick<Sim, 'cells'>): number[] =>
  s.cells.flatMap((a, i) => (a === SEP ? [i] : []));

/**
 * S's tape for a configuration: # then each tape's cells up to the farther of its last
 * non-blank and the rightmost cell its head has visited (at least one cell), then #. That is
 * exactly what S has: a segment starts as long as its input (at least one cell) and grows by a
 * cell each time its head moves past the end, and a cell of the input erased at the end was
 * visited. With `moves`, S's count so far.
 */
export function encode(c: MtConfig, moves = 0): Sim {
  const cells = [SEP];
  const dots: number[] = [];
  c.tapes.forEach((t) => {
    const n = Math.max(t.cells.length, t.hi + 1, 1);
    dots.push(cells.length + t.head);
    for (let j = 0; j < n; j++) cells.push(cellAt(t, j));
    cells.push(SEP);
  });
  return { cells, dots, head: 0, moves };
}

/** S formats its tape from the input: one pass right writing it, one pass back. */
export function formatTape(m: MtMachine, words: readonly string[]): Sim {
  const s = encode(startConfig(m, words));
  return { ...s, moves: 2 * (s.cells.length - 1) };
}

/** Each tape's contents read back from S's segments, with no blank at the end. */
export function readBack(s: Pick<Sim, 'cells'>): string[] {
  const seps = separators(s);
  return seps.slice(0, -1).map((a, i) => {
    const seg = s.cells.slice(a + 1, seps[i + 1]);
    while (seg.length && seg.at(-1) === BLANK) seg.pop();
    return seg.join('');
  });
}

/** The length of S's tape for a configuration: # plus each segment and its #. */
export function simLength(c: MtConfig): number {
  return encode(c).cells.length;
}

/**
 * S's scan right, from the first # to the last: where S is as it passes each tape's mark (in
 * tape order), then at the last #, and the marked symbols it has read.
 */
export function readSweep(s: Sim): { at: Sim[]; end: Sim; read: string[] } {
  const at = s.dots.map((d) => ({ ...s, head: d, moves: s.moves + (d - s.head) }));
  const last = s.cells.length - 1;
  return {
    at,
    end: { ...s, head: last, moves: s.moves + (last - s.head) },
    read: s.dots.map((d) => s.cells[d]!),
  };
}

export interface WriteEvent {
  /** The tape whose segment S just updated. */
  tape: number;
  /** Its mark moved onto a #, so S shifted the rest of its tape right. */
  shifted: boolean;
  /** Its mark was told to move left from the segment's first cell, so it stayed. */
  bumped: boolean;
  sim: Sim;
}

/**
 * S's scan back, from the last # to the first: at each mark (the last tape first), write the
 * rule's symbol and move the mark. Where S is after each segment, and at the first #.
 */
export function writeSweep(s: Sim, rule: MtRule): { events: WriteEvent[]; end: Sim } {
  const cells = [...s.cells];
  const dots = [...s.dots];
  let head = s.head;
  let moves = s.moves;
  const events: WriteEvent[] = [];
  for (let i = dots.length - 1; i >= 0; i--) {
    const d = dots[i]!;
    moves += head - d;
    head = d;
    cells[d] = rule.write[i]!;
    let shifted = false;
    let bumped = false;
    if (rule.move[i] === 'L') {
      if (cells[d - 1] === SEP) bumped = true;
      else {
        dots[i] = d - 1;
        head = d - 1;
        moves += 1;
      }
    } else if (rule.move[i] === 'R') {
      head = d + 1;
      moves += 1;
      if (cells[d + 1] === SEP) {
        // Carry every cell from the # on one to the right, and walk back.
        moves += 2 * (cells.length - d - 1);
        cells.splice(d + 1, 0, BLANK);
        for (let j = i + 1; j < dots.length; j++) dots[j]! += 1;
        shifted = true;
      }
      dots[i] = d + 1;
    }
    events.push({
      tape: i,
      shifted,
      bumped,
      sim: { cells: [...cells], dots: [...dots], head, moves },
    });
  }
  return { events, end: { cells, dots, head: 0, moves: moves + head } };
}

/** One move of M carried out by S: the read scan and the write scan. */
export function simMove(s: Sim, rule: MtRule): Sim {
  return writeSweep(readSweep(s).end, rule).end;
}

export interface SimRun {
  sim: Sim;
  config: MtConfig;
  outcome: Outcome;
}

/**
 * S on its own: format, then scan and update until M's state (which S keeps in its own) halts,
 * no rule applies (S rejects after the read scan), or M has made `cap` moves and could make
 * another (still running, before that scan). Returns S's tape and M's configuration.
 */
export function simulate(m: MtMachine, words: readonly string[], cap = SIM_CAP): SimRun {
  let c = startConfig(m, words);
  let s = formatTape(m, words);
  for (;;) {
    if (halting(c.state)) return { sim: s, config: c, outcome: c.state as Outcome };
    const r = step(m, c);
    if (r.kind === 'stuck') return { sim: readSweep(s).end, config: r.config, outcome: 'reject' };
    if (r.kind !== 'moved') throw new Error('unreachable');
    if (c.moves >= cap) return { sim: s, config: c, outcome: 'running' };
    s = simMove(s, r.rule);
    c = r.config;
  }
}
