/**
 * Test helpers for the string-matching pages: a reference matcher, inputs for property tests,
 * and the invariants every step of every page must keep. Only tests import this file.
 */
import fc from 'fast-check';
import { expect } from 'vitest';
import type { Timeline } from '../../engine/timeline';
import type { Settings } from '../../engine/types';
import { foundText, type Attempt, type MatchExtra, type MatchState } from './kit';

/** The reference: indexOf in a loop. */
export function refMatches(text: string, pattern: string): number[] {
  const out: number[] = [];
  for (let s = text.indexOf(pattern); s >= 0; s = text.indexOf(pattern, s + 1)) out.push(s);
  return out;
}

/** A text and a pattern over a small alphabet, so matches and near misses are common. */
export const inputArb = (letters = 'AB', maxText = 16, maxPattern = 5) =>
  fc.record({
    text: fc.string({ unit: fc.constantFrom(...letters), minLength: 1, maxLength: maxText }),
    pattern: fc.string({ unit: fc.constantFrom(...letters), minLength: 1, maxLength: maxPattern }),
  });

/** Usually a pattern taken from the text, so there is at least one match. */
export const plantedArb = (letters = 'AB', maxText = 16, maxPattern = 5) =>
  fc
    .tuple(
      fc.string({ unit: fc.constantFrom(...letters), minLength: 1, maxLength: maxText }),
      fc.nat(),
      fc.integer({ min: 1, max: maxPattern }),
    )
    .map(([text, at, len]) => {
      const s = at % text.length;
      return { text, pattern: text.slice(s, s + len) };
    });

/** The shifts a search has reached: its attempts, then the live or the next one. */
export function shiftsOf(state: MatchState): number[] {
  const s = state.search;
  if (!s) return [];
  const tail = s.live ? [s.live.s] : s.next ? [s.next.s] : [];
  return [...s.attempts.map((a) => a.s), ...tail];
}

/** Each comparison recorded in an attempt agrees with the text. */
function checkCells(state: MatchState, a: Attempt) {
  const { text, pattern } = state;
  a.cells.forEach((c, j) => {
    if (c === null) return;
    const same = text[a.s + j] === pattern[j];
    if (c === 'mismatch') expect(same, `shift ${a.s}, P[${j}] mismatch`).toBe(false);
    else expect(same, `shift ${a.s}, P[${j}] ${c}`).toBe(true);
  });
}

/**
 * The invariants of one state: the matches found are exactly the true ones left of the
 * current alignment; shifts only grow and never jump over a match; every recorded comparison
 * is right; the comparison count adds up.
 */
export function checkMatchState(state: MatchState) {
  const s = state.search;
  if (!s) return;
  const truth = refMatches(state.text, state.pattern);
  const shifts = shiftsOf(state);
  const cur = s.live?.s ?? s.next?.s ?? Infinity;
  expect(s.found, 'found so far').toEqual(truth.filter((t) => t < cur));
  for (let k = 0; k + 1 < shifts.length; k++) {
    const [a, b] = [shifts[k]!, shifts[k + 1]!];
    expect(a, 'shifts grow').toBeLessThan(b);
    expect(
      truth.filter((t) => a < t && t < b),
      `the shift from ${a} to ${b} skips no match`,
    ).toEqual([]);
  }
  if (shifts.length) expect(truth.filter((t) => t < shifts[0]!)).toEqual([]);
  if (!s.live && !s.next) {
    for (const t of truth) expect(shifts, `the search reaches the match at ${t}`).toContain(t);
  }
  const all = [...s.attempts, ...(s.live ? [s.live] : [])];
  for (const a of all) checkCells(state, a);
  const compared = all.reduce(
    (sum, a) => sum + a.cells.filter((c) => c === 'match' || c === 'mismatch').length,
    0,
  );
  expect(s.comparisons, 'comparisons add up').toBe(compared);
  for (const a of s.attempts) {
    if (a.end === 'match') expect(truth).toContain(a.s);
    if (a.end === 'mismatch' || a.end === 'spurious') expect(truth).not.toContain(a.s);
  }
}

/** Every step of a timeline keeps the invariants, and its `found` variable agrees. */
export function checkMatchTimeline(t: Timeline<MatchState, Settings, MatchExtra>) {
  for (let k = 0; k < t.length; k++) {
    const { step } = t.at(k);
    checkMatchState(step.state);
    if (step.state.search && step.vars?.found !== undefined)
      expect(step.vars.found).toBe(foundText(step.state.search.found));
  }
}
