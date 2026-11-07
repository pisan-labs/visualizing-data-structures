/**
 * The machines the examples, presets and tests use, in the page's text format. Each one is
 * checked against what it is meant to write in mealy-moore.test.ts.
 */
import { parseMachine, type Machine } from './machine';

export const MACHINES = {
  /** Writes 1 when the input so far ends in 101; the last 1 can start the next 101. */
  detect101:
    'start q0; q0 0 -> q0 / 0; q0 1 -> q1 / 0; q1 0 -> q2 / 0; q1 1 -> q1 / 0; q2 0 -> q0 / 0; q2 1 -> q1 / 1',
  /** The same, but after a 101 it starts over: in 10101 only the first 101 counts. */
  detect101Once:
    'start q0; q0 0 -> q0 / 0; q0 1 -> q1 / 0; q1 0 -> q2 / 0; q1 1 -> q1 / 0; q2 0 -> q0 / 0; q2 1 -> q0 / 1',
  /** The overlapping detector as a Moore machine: q3 means "just read 101". */
  detect101Moore:
    'start q0; q0 / 0; q1 / 0; q2 / 0; q3 / 1; q0 0 -> q0; q0 1 -> q1; q1 0 -> q2; q1 1 -> q1; q2 0 -> q0; q2 1 -> q3; q3 0 -> q2; q3 1 -> q1',
  /** The parity of the 1s read so far: e (even) writes 0, o (odd) writes 1. */
  parity: 'start e; e / 0; o / 1; e 0 -> e; e 1 -> o; o 0 -> o; o 1 -> e',
  /** The remainder mod 3 of the binary number read so far: a bit b takes r to 2r + b. */
  mod3: 'start r0; r0 / 0; r1 / 1; r2 / 2; r0 0 -> r0; r0 1 -> r1; r1 0 -> r2; r1 1 -> r0; r2 0 -> r1; r2 1 -> r2',
  /** Writes 1 when the input changes: q0 last read 0, q1 last read 1 (the line starts at 0). */
  change: 'start q0; q0 0 -> q0 / 0; q0 1 -> q1 / 1; q1 0 -> q0 / 1; q1 1 -> q1 / 0',
  /** Sells at 15 cents: n is a nickel (5), d a dime (10); it writes 1 when it sells. */
  vending:
    'start c0; c0 n -> c5 / 0; c0 d -> c10 / 0; c5 n -> c10 / 0; c5 d -> c0 / 1; c10 n -> c0 / 1; c10 d -> c5 / 1',
  /** A traffic light that moves on when its timer runs out (input 1). */
  traffic:
    'start g; g / G; y / Y; r / R; g 0 -> g; g 1 -> y; y 0 -> y; y 1 -> r; r 0 -> r; r 1 -> g',
} as const;

export type MachineName = keyof typeof MACHINES;

export const machine = (name: MachineName): Machine => parseMachine(MACHINES[name]) as Machine;
