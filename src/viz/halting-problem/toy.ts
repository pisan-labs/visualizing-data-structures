/**
 * The toy programs behind the halting-problem page. Each one reads its input from a tape and
 * never writes, one numbered line at a time:
 *
 *   accept         A     halt and accept
 *   reject         R     halt and reject
 *   right          >     move the head one cell right (it stays on the end cell)
 *   left           <     move the head one cell left (it stays on cell 0)
 *   goto k         Gk    jump to line k
 *   if end goto k  Ek    jump to line k if the head is on the end cell, past the input
 *   if c goto k    ?ck   jump to line k if the head is on the symbol c
 *
 * Any other line goes on to the next one, and running past the last line rejects. A program's
 * description ⟨M⟩ is its code, the right-hand column above run together ("E6>E3>G1A"), and that
 * is what the other programs read.
 *
 * A program never writes, so its configuration is just (line, head): L·(m + 1) of them on an
 * input of length m. Within that many steps it halts or comes back to a configuration it has
 * been in, and a program that repeats a configuration repeats everything after it: it loops.
 * That cycle check decides halting for these programs, every time. It cannot for a Turing
 * machine, which writes on an unbounded tape and can run forever without ever repeating.
 */

/** The step cap: a safety net that these programs never reach (they repeat well before). */
export const CAP = 1000;

export type Instr =
  | { op: 'accept' }
  | { op: 'reject' }
  | { op: 'right' }
  | { op: 'left' }
  | { op: 'goto'; to: number }
  | { op: 'end'; to: number }
  | { op: 'if'; sym: string; to: number };

/** Symbols that can follow ? in a test: anything a description is made of. */
export const SYMBOLS = 'ARGE?<>123456789';

/** A program's code as instructions, or an error naming the first bad character. */
export function parseCode(code: string): Instr[] | Error {
  const out: Instr[] = [];
  let k = 0;
  const digit = (at: number) => {
    const c = code[at];
    return c !== undefined && c >= '1' && c <= '9' ? Number(c) : null;
  };
  while (k < code.length) {
    const c = code[k]!;
    if (c === 'A' || c === 'R' || c === '>' || c === '<') {
      out.push({ op: c === 'A' ? 'accept' : c === 'R' ? 'reject' : c === '>' ? 'right' : 'left' });
      k += 1;
    } else if (c === 'G' || c === 'E') {
      const to = digit(k + 1);
      if (to === null) return new Error(`"${c}" at ${k} needs a line number after it.`);
      out.push({ op: c === 'G' ? 'goto' : 'end', to });
      k += 2;
    } else if (c === '?') {
      const sym = code[k + 1];
      const to = digit(k + 2);
      if (sym === undefined || !SYMBOLS.includes(sym) || to === null)
        return new Error(`"?" at ${k} needs a symbol and a line number after it.`);
      out.push({ op: 'if', sym, to });
      k += 3;
    } else return new Error(`"${c}" at ${k} is not an instruction.`);
  }
  return out;
}

/** A program's code, written back from its instructions. */
export function codeOf(prog: readonly Instr[]): string {
  return prog
    .map((i) => {
      switch (i.op) {
        case 'accept':
          return 'A';
        case 'reject':
          return 'R';
        case 'right':
          return '>';
        case 'left':
          return '<';
        case 'goto':
          return `G${i.to}`;
        case 'end':
          return `E${i.to}`;
        case 'if':
          return `?${i.sym}${i.to}`;
      }
    })
    .join('');
}

/** One line of a listing: "if end goto 6". */
export function instrText(i: Instr): string {
  switch (i.op) {
    case 'accept':
    case 'reject':
    case 'right':
    case 'left':
      return i.op;
    case 'goto':
      return `goto ${i.to}`;
    case 'end':
      return `if end goto ${i.to}`;
    case 'if':
      return `if ${i.sym} goto ${i.to}`;
  }
}

/** The program as a one-line listing: "1 accept; 2 goto 1". */
export const listing = (prog: readonly Instr[]): string =>
  prog.map((ins, k) => `${k + 1} ${instrText(ins)}`).join('; ');

/** The same program with every reject turned into accept: it accepts exactly when M halts. */
export const acceptOnHalt = (prog: readonly Instr[]): Instr[] =>
  prog.map((i) => (i.op === 'reject' ? { op: 'accept' } : i));

export interface Config {
  /** 1-based line about to run (L + 1 means past the last line). */
  line: number;
  /** The head's cell; m, the input's length, is the end cell. */
  head: number;
}

export type Outcome = 'accept' | 'reject' | 'loop' | 'unknown';

export interface RunResult {
  outcome: Outcome;
  /** Lines run: for a halt, the halting line included; for a loop, before the repeat. */
  steps: number;
  /** For a loop: the configuration before step `again` is the one before step `first`. */
  first?: number;
  again?: number;
  /** Ran past the last line (a reject without a reject line). */
  off?: boolean;
  /** The configuration before each step: trace[k] is before step k + 1. */
  trace: Config[];
}

/**
 * Run a program on an input until it halts, repeats a configuration, or reaches the cap.
 * Deterministic and finite: the same answer every time.
 */
export function runProgram(prog: readonly Instr[], input: string, cap = CAP): RunResult {
  const m = input.length;
  const seen = new Map<string, number>();
  const trace: Config[] = [];
  let line = 1;
  let head = 0;
  for (let step = 1; step <= cap; step++) {
    trace.push({ line, head });
    if (line > prog.length) return { outcome: 'reject', steps: step - 1, off: true, trace };
    const key = `${line},${head}`;
    const first = seen.get(key);
    if (first !== undefined) return { outcome: 'loop', steps: step - 1, first, again: step, trace };
    seen.set(key, step);
    const ins = prog[line - 1]!;
    switch (ins.op) {
      case 'accept':
      case 'reject':
        return { outcome: ins.op, steps: step, trace };
      case 'right':
        head = Math.min(m, head + 1);
        line++;
        break;
      case 'left':
        head = Math.max(0, head - 1);
        line++;
        break;
      case 'goto':
        line = ins.to;
        break;
      case 'end':
        line = head === m ? ins.to : line + 1;
        break;
      case 'if':
        line = head < m && input[head] === ins.sym ? ins.to : line + 1;
        break;
    }
  }
  return { outcome: 'unknown', steps: cap, trace };
}

export interface Toy {
  code: string;
  /** What it does, in a few words, for the legend. */
  what: string;
  prog: Instr[];
}

const toy = (code: string, what: string): Toy => {
  const prog = parseCode(code);
  if (prog instanceof Error) throw prog;
  return { code, what, prog };
};

/**
 * The family, in table order. Tables of size 4 to 6 take the first rows. Every entry of every
 * table comes from runProgram; none is written down here.
 */
export const PROGRAMS: readonly Toy[] = [
  toy('A', 'accepts at once'),
  toy('G1', 'loops at once'),
  toy('E6>E3>G1A', 'accepts an even length, loops on an odd one'),
  toy('?A5?G4RG4A', 'accepts if it starts with A, loops on G, else rejects'),
  toy('?R7E5>G1<G1A', 'accepts if it finds an R, else bounces at the end'),
  toy('E4>G1<?A7RA', 'walks to the end, accepts if the last symbol is A'),
];

export const MIN_SIZE = 4;
export const MAX_SIZE = PROGRAMS.length;

/** The longest description, for room on the tape. */
export const LONGEST = Math.max(...PROGRAMS.map((p) => p.code.length));
/** The longest listing, for room in the panel. */
export const MOST_LINES = Math.max(...PROGRAMS.map((p) => p.prog.length));

const cache = new Map<string, RunResult>();

/** Program i run on the description of program j (0-based), computed once. */
export function cell(i: number, j: number): RunResult {
  const key = `${i},${j}`;
  let r = cache.get(key);
  if (!r) {
    r = runProgram(PROGRAMS[i]!.prog, PROGRAMS[j]!.code);
    cache.set(key, r);
  }
  return r;
}

const primeCache = new Map<string, RunResult>();

/** M′ (program i with reject turned into accept) run on the description of program j. */
export function primeCell(i: number, j: number): RunResult {
  const key = `${i},${j}`;
  let r = primeCache.get(key);
  if (!r) {
    r = runProgram(acceptOnHalt(PROGRAMS[i]!.prog), PROGRAMS[j]!.code);
    primeCache.set(key, r);
  }
  return r;
}

export const halts = (o: Outcome): boolean => o === 'accept' || o === 'reject';
