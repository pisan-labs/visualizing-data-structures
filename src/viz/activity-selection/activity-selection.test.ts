import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { practiceSet } from '../../engine/practice';
import { Timeline } from '../../engine/timeline';
import type { PracticeQuestion } from '../../engine/types';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { smallestText } from '../../render/text-size';
import { intervalsText, overlaps, type Interval } from '../_intervals/kit';
import { activitySelection, parseActs } from '.';
import type { Rule } from './model';

/** The reference: the largest set of pairwise compatible activities, by brute force. */
function best(acts: Interval[]): number {
  let most = 0;
  for (let mask = 0; mask < 1 << acts.length; mask++) {
    const set = acts.filter((_, k) => mask & (1 << k));
    if (set.every((a, i) => set.every((b, j) => i >= j || !overlaps(a, b))))
      most = Math.max(most, set.length);
  }
  return most;
}

const actsArb = fc
  .array(fc.tuple(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 1, max: 6 })), {
    minLength: 1,
    maxLength: 9,
  })
  .map((ps) => ps.map(([s, len], k) => ({ id: k + 1, s, f: Math.min(24, s + len) })));

const run = (acts: Interval[], rule: Rule) =>
  new Timeline(activitySelection, { rule }, 1, [['load', intervalsText(acts)], ['select']]);

describe('activity selection', { timeout: 60_000 }, () => {
  it('earliest finish first takes a largest compatible set; the other rules never beat it', () => {
    fc.assert(
      fc.property(actsArb, fc.constantFrom<Rule>('finish', 'shortest', 'start'), (acts, rule) => {
        const t = run(acts, rule);
        for (let k = 0; k < t.length; k++) {
          const { step } = t.at(k);
          const chosen = step.state.acts.filter((a) => step.state.status[a.id - 1] === 'chosen');
          // The chosen set never overlaps, at any step.
          for (const a of chosen)
            for (const b of chosen) if (a !== b) expect(overlaps(a, b)).toBe(false);
        }
        const end = t.entries.at(-1)!.end;
        const chosen = end.acts.filter((a) => end.status[a.id - 1] === 'chosen').length;
        const most = best(acts);
        if (rule === 'finish') expect(chosen).toBe(most);
        else expect(chosen).toBeLessThanOrEqual(most);
        expect(end.status.every((s) => s !== null)).toBe(true);
        expect(t.entries.at(-1)!.steps.at(-1)!.vars?.best).toBe(most);
      }),
      { numRuns: 200 },
    );
  });

  it('shows shortest first and earliest start first falling short', () => {
    const s = run(
      [
        { id: 1, s: 1, f: 5 },
        { id: 2, s: 4, f: 7 },
        { id: 3, s: 6, f: 10 },
      ],
      'shortest',
    );
    expect(s.entries.at(-1)!.steps.at(-1)!.say).toBe(
      'Shortest first chose 1 activity: a2. Earliest finish first would choose 2. This rule is not safe.',
    );
    const e = run(
      [
        { id: 1, s: 1, f: 4 },
        { id: 2, s: 3, f: 5 },
        { id: 3, s: 0, f: 6 },
        { id: 4, s: 5, f: 7 },
      ],
      'finish',
    );
    expect(e.entries.at(-1)!.steps.at(-1)!.say).toMatch(
      /^Earliest finish first chose 2 activities: a1 and a4\./,
    );
  });

  it('reads activities, and refuses what it cannot use', () => {
    expect(parseActs('1-4, 3-5')).toBe('1-4 3-5');
    expect(parseActs('4-4')).toBeInstanceOf(Error);
    expect(parseActs('1-25')).toBeInstanceOf(Error);
    expect(parseActs('1')).toBeInstanceOf(Error);
    const t = new Timeline(activitySelection, { rule: 'finish' }, 1, [
      ['load', 'cat'],
      ['load', 5],
    ]);
    for (const e of t.entries) expect(e.end).toBe(t.initial.state);
  });
});

describe('activity selection practice', () => {
  function questions(kind: string): PracticeQuestion[] {
    const out: PracticeQuestion[] = [];
    for (let seed = 1; out.length < 20 && seed < 400; seed++)
      for (const item of practiceSet(activitySelection, seed, 4))
        if (item.kind.id === kind) out.push(item.question);
    expect(out.length).toBeGreaterThan(5);
    return out;
  }
  const actsOf = (q: PracticeQuestion) =>
    String(q.setup[0]![1])
      .split(' ')
      .map((p, k) => {
        const [s, f] = p.split('-').map(Number);
        return { id: k + 1, s: s!, f: f! };
      });

  it('expects the brute-force best', () => {
    for (const q of questions('count'))
      expect(q.answer).toEqual({ kind: 'number', value: best(actsOf(q)) });
    for (const q of questions('chosen'))
      expect((q.answer as { value: string[] }).value).toHaveLength(best(actsOf(q)));
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(activitySelection, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(activitySelection, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
