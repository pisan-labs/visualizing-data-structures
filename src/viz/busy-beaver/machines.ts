/**
 * Busy beaver machines: n working states A, B, C, ..., the halt state H, and the tape symbols 0
 * (the blank) and 1. Every rule writes a symbol, moves one cell left or right, and goes to a
 * state, and the move into H counts as a move (Radó's convention, and bbchallenge's).
 *
 * Text: the standard compact form, one group of six characters per state, the rule for 0 and
 * then the rule for 1, groups separated by _ (or ;, /, a comma or a new line; spaces are
 * ignored):
 *
 *   1RB1LB_1LA1RH      A reading 0: write 1, move right, go to B; A reading 1: write 1, ...
 *
 * - A rule is a bit, L or R, and a state letter; H (or Z, as bbchallenge writes it) halts.
 * - --- is a missing rule: reaching it stops the machine without a move.
 * - A champion's name (bb1, bb2, bb3, bb3s, bb4) loads that machine.
 *
 * The machine runs on the Turing kit (src/viz/_turing/machine.ts): `kitMachine` turns it into a
 * kit machine whose blank is 0 and whose accept state stands for H, on a tape infinite both ways.
 */
import { ACCEPT, BLANK, makeMachine, type Machine, type Rule } from '../_turing/machine';

export const HALT = 'H';
export const MAX_STATES = 5;

export type Bit = '0' | '1';

export interface BbRule {
  write: Bit;
  move: 'L' | 'R';
  /** A state letter, or H. */
  next: string;
}

export interface BbMachine {
  /** A, B, C, ... in order; A starts. */
  states: string[];
  /** For each state, its rule on 0 and on 1; null is a missing rule. */
  table: Record<string, [BbRule | null, BbRule | null]>;
}

export interface Champion {
  /** What the input box takes: bb2. */
  name: string;
  states: number;
  text: string;
  ones: number;
  moves: number;
  /** Which record the machine holds: the most 1s (Σ), the most moves (S), or both. */
  holds: 'both' | 'ones' | 'moves';
}

/**
 * The champions. For 1, 2 and 4 states one machine holds both records. For 3 states they are
 * two machines: the most 1s is 6 (in 14 moves), and the most moves is 21 (leaving 5 ones).
 */
export const CHAMPIONS: readonly Champion[] = [
  { name: 'bb1', states: 1, text: '1RH---', ones: 1, moves: 1, holds: 'both' },
  { name: 'bb2', states: 2, text: '1RB1LB_1LA1RH', ones: 4, moves: 6, holds: 'both' },
  { name: 'bb3', states: 3, text: '1RB1RH_0RC1RB_1LC1LA', ones: 6, moves: 14, holds: 'ones' },
  { name: 'bb3s', states: 3, text: '1RB1RH_1LB0RC_1LC1LA', ones: 5, moves: 21, holds: 'moves' },
  {
    name: 'bb4',
    states: 4,
    text: '1RB1LB_1LA0LC_1RH1LD_1RD0RA',
    ones: 13,
    moves: 107,
    holds: 'both',
  },
];

/** Σ(n) and S(n), as far as they are known. */
export const RECORDS: readonly { n: number; ones: string; moves: string }[] = [
  { n: 1, ones: '1', moves: '1' },
  { n: 2, ones: '4', moves: '6' },
  { n: 3, ones: '6', moves: '21' },
  { n: 4, ones: '13', moves: '107' },
  { n: 5, ones: '4,098', moves: '47,176,870' },
];

const nameKey = (t: string) => t.toLowerCase().replace(/[\s()-]/g, '');

export function championNamed(t: string): Champion | undefined {
  const k = nameKey(t);
  const alias: Record<string, string> = { bb3steps: 'bb3s', bb3moves: 'bb3s', bb3ones: 'bb3' };
  return CHAMPIONS.find((c) => c.name === (alias[k] ?? k));
}

/** The champion whose machine this is, if it is one. */
export function championOf(m: BbMachine): Champion | undefined {
  const t = formatMachine(m);
  return CHAMPIONS.find((c) => c.text === t);
}

export const stateLetter = (i: number) => String.fromCharCode(65 + i);

const RULE = /^([01])([LR])([A-Z])$/;

export function parseMachine(raw: string): BbMachine | Error {
  const named = championNamed(raw);
  if (named) return parseMachine(named.text);
  const parts = raw
    .split(/[_;/,\n]+/)
    .map((p) => p.replace(/\s+/g, ''))
    .filter(Boolean);
  if (!parts.length)
    return new Error('Type a machine such as 1RB1LB_1LA1RH, or a champion: bb2, bb3, bb3s, bb4.');
  if (parts.length > MAX_STATES)
    return new Error(`Use at most ${MAX_STATES} states, so the table stays readable.`);
  const states = parts.map((_, i) => stateLetter(i));
  const table: BbMachine['table'] = {};
  for (const [i, part] of parts.entries()) {
    const q = states[i]!;
    if (part.length !== 6)
      return new Error(
        `"${part}" (state ${q}) should be two rules of three characters, such as 1RB1LA: the rule for 0, then the rule for 1.`,
      );
    const rules: (BbRule | null)[] = [];
    for (const r of [part.slice(0, 3), part.slice(3)]) {
      if (r === '---') {
        rules.push(null);
        continue;
      }
      const m = RULE.exec(r.toUpperCase());
      if (!m)
        return new Error(
          `"${r}" in state ${q} is not a rule: write a bit, L or R, and a state, such as 1RB, or --- for none.`,
        );
      const next = m[3] === 'Z' ? HALT : m[3]!;
      if (next !== HALT && !states.includes(next))
        return new Error(
          `"${r}" in state ${q} goes to ${next}, but the machine has only ${states.join(', ')} (and H to halt).`,
        );
      rules.push({ write: m[1] as Bit, move: m[2] as 'L' | 'R', next });
    }
    table[q] = [rules[0]!, rules[1]!];
  }
  return { states, table };
}

export const ruleCode = (r: BbRule | null): string => (r ? `${r.write}${r.move}${r.next}` : '---');

export function formatMachine(m: BbMachine): string {
  return m.states.map((q) => m.table[q]!.map(ruleCode).join('')).join('_');
}

/** The machine on the Turing kit: 0 is the blank, and accept stands for H. */
export function kitMachine(m: BbMachine): Machine {
  const rules: Rule[] = [];
  for (const q of m.states)
    m.table[q]!.forEach((r, i) => {
      if (r)
        rules.push({
          from: q,
          read: i ? '1' : BLANK,
          to: r.next === HALT ? ACCEPT : r.next,
          write: r.write === '1' ? '1' : BLANK,
          move: r.move,
        });
    });
  return makeMachine(m.states[0]!, rules);
}

/** How many n-state machines there are: each of the 2n rules has 2 · 2 · (n + 1) choices. */
export const machineCount = (n: number): number => (4 * (n + 1)) ** (2 * n);
