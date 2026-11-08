import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { writePoints } from '../../layouts/plane';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { dist2 } from '../_spatial/kit';
import { closestPair, parseInput } from '.';
import { byId, pairs, type Method } from './model';

const pointArb = fc.record({
  x: fc.integer({ min: 0, max: 12 }),
  y: fc.integer({ min: 0, max: 12 }),
});

describe('closest pair', () => {
  it('finds a pair across the dividing line', () => {
    const t = new Timeline(closestPair, { method: 'divide' }, 1, [
      ['load', '1,1 3,9 2,5 5,6 6,6 10,2 9,10 11,6'],
      ['closest'],
    ]);
    const s = t.endState();
    expect(s.d2).toBe(1);
    expect(s.comparisons).toBeLessThan(pairs(8));
  });

  it('does not compare brute force with itself at the end', () => {
    const t = new Timeline(closestPair, { method: 'brute' }, 1, [
      ['load', '1,1 3,9 2,5 5,6'],
      ['closest'],
    ]);
    const say = t.at(t.length - 1).step.say;
    expect(say).toContain('6 comparisons, one for every pair.');
    expect(say).not.toContain('brute force needs');
  });

  it('matches brute force, checks at most 7 points above each strip point, and stays within O(n log n)', () => {
    fc.assert(
      fc.property(
        fc.array(pointArb, { minLength: 2, maxLength: 20 }),
        fc.constantFrom<Method>('divide', 'brute'),
        (pts, method) => {
          const t = new Timeline(closestPair, { method }, 1, [
            ['load', writePoints(pts)],
            ['closest'],
          ]);
          const e = t.entries[1]!;
          let best = Infinity;
          for (let i = 0; i < pts.length; i++)
            for (let j = i + 1; j < pts.length; j++) best = Math.min(best, dist2(pts[i]!, pts[j]!));
          expect(e.end.d2).toBe(best);
          const [a, b] = e.end.answer!;
          expect(dist2(byId(e.end, a), byId(e.end, b))).toBe(best);
          if (method === 'brute') expect(e.end.comparisons).toBe(pairs(pts.length));
          // Divide and conquer is O(n log n), not always below n(n − 1)/2: on 4 points it can
          // make 7 comparisons (one per half, then 5 in the strip) where brute force makes 6.
          else {
            const n = pts.length;
            expect(e.end.comparisons).toBeLessThanOrEqual(8 * n * Math.ceil(Math.log2(n)));
          }
          // Strip checks: consecutive comparisons from one point never reach past 7 others.
          let run = 0;
          let from = -1;
          for (const st of e.steps) {
            if (!st.lines.includes('cp.check')) continue;
            const [p] = st.extra!.compare!;
            run = p === from ? run + 1 : 1;
            from = p;
            expect(run).toBeLessThanOrEqual(7);
            // Every strip point is within δ of the line.
            const call = st.state.calls.at(-1)!;
            for (const id of st.state.strip)
              expect((byId(st.state, id).x - call.xm!) ** 2).toBeLessThan(st.state.stripD2!);
          }
          // The best so far never gets worse inside a call's strip check.
          for (const st of e.steps)
            if (st.state.d2 !== null && st.state.stripD2 !== null && st.lines.includes('cp.check'))
              expect(st.state.d2).toBeLessThanOrEqual(st.state.stripD2);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('parses points', () => {
    expect(parseInput('1,2 3,4')).toBe('1,2 3,4');
    expect(parseInput('12')).toBe(12);
    expect(parseInput('1,13')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(closestPair, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(closestPair, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
