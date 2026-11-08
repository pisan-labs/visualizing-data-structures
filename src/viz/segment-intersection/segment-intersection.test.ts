import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';
import { parseInput, segmentIntersection } from '.';
import { byId, crossing, ptCmp, randomSegs, yAt, writeSegs, type Mode, type Seg } from './model';
import { cmp, eq, rat } from './rat';

/** Brute force: every point where two or more segments meet, with the segments there. */
function reference(segs: Seg[]) {
  const pts: { x: ReturnType<typeof rat>; y: ReturnType<typeof rat>; segs: Set<number> }[] = [];
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const c = crossing(segs[i]!, segs[j]!);
      if (!c) continue;
      let p = pts.find((q) => eq(q.x, c.x) && eq(q.y, c.y));
      if (!p) pts.push((p = { ...c, segs: new Set() }));
      p.segs.add(segs[i]!.id).add(segs[j]!.id);
    }
  return pts
    .sort(ptCmp)
    .map((p) => `${p.x.n}/${p.x.d},${p.y.n}/${p.y.d}:${[...p.segs].sort().join('')}`);
}

describe('segment intersection', () => {
  it('reports three segments through one point once', () => {
    const t = new Timeline(segmentIntersection, { mode: 'all' }, 1, [
      ['load', '2,2 10,10 2,10 10,2 0,6 12,6 1,1 4,0'],
      ['sweep'],
    ]);
    const s = t.endState();
    expect(s.hits).toHaveLength(1);
    expect(s.hits[0]!.segs).toEqual([1, 2, 3]);
    expect(eq(s.hits[0]!.x, rat(6))).toBe(true);
  });

  it('matches brute force on random segments, in both modes, and keeps the status in order', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e9 }),
        fc.integer({ min: 2, max: 8 }),
        fc.constantFrom<Mode>('any', 'all'),
        (seed, n, mode) => {
          const list = randomSegs(makeRng(seed), n);
          const t = new Timeline(segmentIntersection, { mode }, 1, [
            ['load', writeSegs(list)],
            ['sweep'],
          ]);
          const end = t.endState();
          const ref = reference(end.segs);
          if (mode === 'all') {
            const got = end.hits.map(
              (h) => `${h.x.n}/${h.x.d},${h.y.n}/${h.y.d}:${h.segs.join('')}`,
            );
            expect(got).toEqual(ref);
          } else {
            expect(end.answer).toBe(ref.length > 0);
            if (end.answer) {
              const [a, b] = end.hits[0]!.segs;
              expect(crossing(byId(end, a!), byId(end, b!))).not.toBeNull();
            }
          }
          // After every status update, the status is sorted by height on the sweep line. (Ties
          // above the event point are crossings still to come, so slopes cannot break them.)
          for (const st of t.entries[1]!.steps) {
            if (!st.lines.includes('bo.update') && !st.lines.includes('any.insert')) continue;
            const s = st.state;
            const x = s.sweep!.x;
            for (let k = 1; k < s.status.length; k++)
              expect(
                cmp(yAt(byId(s, s.status[k - 1]!), x), yAt(byId(s, s.status[k]!), x)),
              ).toBeLessThanOrEqual(0);
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it('parses segments and refuses vertical ones', () => {
    expect(parseInput('1,2 5,6')).toBe('1,2 5,6');
    expect(parseInput('5,6 1,2')).toBe('1,2 5,6');
    expect(parseInput('3')).toBe(3);
    expect(parseInput('1,2 1,6')).toBeInstanceOf(Error);
    expect(parseInput('1,2 5,6 7,7')).toBeInstanceOf(Error);
  });

  it('refuses overlapping collinear segments', () => {
    const t = new Timeline(segmentIntersection, { mode: 'all' }, 1, [['load', '0,0 4,4 2,2 6,6']]);
    expect(t.endState().segs).toHaveLength(0);
  });
});

describe('drawn text size', () => {
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(segmentIntersection, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(segmentIntersection, PHONE_STAGE).px).toBeGreaterThanOrEqual(9);
  });
});
