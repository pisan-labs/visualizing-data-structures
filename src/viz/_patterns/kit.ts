/**
 * The interview-patterns kit (PLAN.md 21.3 to 21.5), shared by every page of the "Coding
 * interviews" pathway that teaches a pattern. This folder has no index.ts, so the registry does
 * not treat it as a page. Import everything from here:
 *
 *   import { approachSetting, approachOf, Work, workVars, PATTERNS, spotItKind } from '../_patterns/kit';
 *
 * 1. THE APPROACH SETTING. Every pattern page runs its main operation two ways: the naive
 *    approach (every pair, every window, sort everything) and the pattern. `approachSetting`
 *    makes the setting (key `approach`, values 'pattern' and 'naive', the pattern listed first);
 *    put `approach: DEFAULT_APPROACH` ('pattern') in the page's defaults and read it with
 *    `approachOf(settings)`. Both approaches must give the same answer, use the same operation
 *    names and make the pseudocode follow the setting. Compare mode then runs "this page with
 *    other options" side by side on the same input.
 *
 * 2. WORK COUNTERS IN VARS, so every pattern page reads the same way:
 *    - one live counter per unit of work, named by the unit as a plural noun ('sums',
 *      'lookups', 'comparisons', 'cells'). Both approaches show the same counters, in the same
 *      order, starting at 0, even a counter one approach never moves. One unit is one O(1)
 *      step; say in the concept page what each counts.
 *    - 'naive total' and 'pattern total': fixed for the whole operation, the sum of the
 *      counters each approach reaches on this input. They are the same on both sides of
 *      compare mode, so a learner on either side sees the gain.
 *    `Work` keeps the counters; `workVars(work, totals)` gives the vars in that order. Put the
 *    page's own variables (k, i, sum...) before them. `work.tally()` words the counters for
 *    narration ("10 sums and 20 lookups").
 *
 * 3. PATTERNS (./patterns.ts): every pattern with its id, short name and page.
 *
 * 4. SPOT IT (./spot-it.ts): `spotItKind({ page, rows })` makes a practice kind from a table
 *    of our own short problem statements and the pattern each calls for: a seeded choice
 *    between the right pattern and three others from PATTERNS, explained by the cue.
 */
import type { Scalar, SettingSpec, Settings } from '../../engine/types';

export { pattern, PATTERNS, type Pattern } from './patterns';
export { spotItKind, type SpotItOptions, type SpotRow } from './spot-it';

// ----- The approach setting -----

export type Approach = 'naive' | 'pattern';

export const DEFAULT_APPROACH: Approach = 'pattern';

const APPROACH_HELP =
  'Both give the same answer. Watch the work counters, or use Compare with this same page to run the two side by side.';

/**
 * The setting that switches between the naive approach and the pattern. `pattern` and `naive`
 * are the option labels, with their cost: 'Running sum and a hash map, O(n)'.
 */
export function approachSetting(o: { pattern: string; naive: string; help?: string }): SettingSpec {
  return {
    kind: 'choice',
    key: 'approach',
    label: 'Approach',
    options: [
      { value: 'pattern', label: o.pattern },
      { value: 'naive', label: o.naive },
    ],
    help: o.help ?? APPROACH_HELP,
  };
}

/** The approach the settings ask for; anything but 'naive' is the pattern. */
export const approachOf = (s: Settings): Approach => (s.approach === 'naive' ? 'naive' : 'pattern');

// ----- Work counters -----

/** What each approach costs on this input: the sum of its counters at the end. */
export interface Totals {
  naive: number;
  pattern: number;
}

export const NAIVE_TOTAL = 'naive total';
export const PATTERN_TOTAL = 'pattern total';

const singular = (unit: string) =>
  unit.endsWith('ies') ? `${unit.slice(0, -3)}y` : unit.endsWith('s') ? unit.slice(0, -1) : unit;

/** The work counters of one run, in a fixed order. Units are plural nouns: 'sums', 'lookups'. */
export class Work {
  private readonly counts = new Map<string, number>();

  constructor(readonly units: readonly string[]) {
    for (const u of units) this.counts.set(u, 0);
  }

  /** Count `by` more of a unit. An unknown unit throws, so a typo fails the page's tests. */
  add(unit: string, by = 1): void {
    const now = this.counts.get(unit);
    if (now === undefined) throw new Error(`Unknown work unit "${unit}".`);
    this.counts.set(unit, now + by);
  }

  get(unit: string): number {
    return this.counts.get(unit) ?? 0;
  }

  /** Every counter added up. */
  get total(): number {
    let t = 0;
    for (const v of this.counts.values()) t += v;
    return t;
  }

  /** The counters, in the order the units were given. */
  vars(): Record<string, number> {
    return Object.fromEntries(this.units.map((u) => [u, this.get(u)]));
  }

  /** "10 sums and 20 lookups"; a counter at 0 reads "no lookups". */
  tally(): string {
    const parts = this.units.map((u) => {
      const v = this.get(u);
      return v === 0 ? `no ${u}` : `${v} ${v === 1 ? singular(u) : u}`;
    });
    return parts.length > 1
      ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
      : (parts[0] ?? '');
  }
}

/** The work vars of a step: the live counters, then 'naive total' and 'pattern total'. */
export function workVars(work: Work, totals: Totals): Record<string, Scalar> {
  return { ...work.vars(), [NAIVE_TOTAL]: totals.naive, [PATTERN_TOTAL]: totals.pattern };
}
