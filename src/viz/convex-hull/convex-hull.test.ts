import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import { orient, writePoints, type Vec } from '../../layouts/plane';
import { convexHull, parsePoints } from '.';
import { normalizedHull, type Algorithm, type HullSettings } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

const settings = (algorithm: Algorithm): HullSettings => ({ algorithm });

/**
 * Reference: a point is a corner of the hull exactly when it is not inside, or on, a triangle
 * or segment of the other distinct points. O(n⁴), fine for a test.
 */
function referenceCorners(points: Vec[]): Set<string> {
  const key = (p: Vec) => `${p.x},${p.y}`;
  const pts = [...new Map(points.map((p) => [key(p), p])).values()];
  const onSegment = (p: Vec, a: Vec, b: Vec) =>
    orient(a, b, p) === 0 &&
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y);
  const inTriangle = (p: Vec, a: Vec, b: Vec, c: Vec) => {
    const d1 = orient(a, b, p);
    const d2 = orient(b, c, p);
    const d3 = orient(c, a, p);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
  const corners = new Set<string>();
  for (const p of pts) {
    const others = pts.filter((q) => q !== p);
    let inside = false;
    for (let i = 0; i < others.length && !inside; i++)
      for (let j = i + 1; j < others.length && !inside; j++) {
        if (onSegment(p, others[i]!, others[j]!)) inside = true;
        for (let k = j + 1; k < others.length && !inside; k++)
          if (
            orient(others[i]!, others[j]!, others[k]!) !== 0 &&
            inTriangle(p, others[i]!, others[j]!, others[k]!)
          )
            inside = true;
      }
    if (!inside) corners.add(key(p));
  }
  return corners;
}

const pointArb = fc.record({
  x: fc.integer({ min: 0, max: 12 }),
  y: fc.integer({ min: 0, max: 12 }),
});

describe('convex hull', () => {
  it('finds the corners of a square with points inside and on its edges', () => {
    for (const algorithm of ['graham', 'monotone', 'jarvis'] as const) {
      const t = new Timeline(convexHull, settings(algorithm), 1, [
        ['load', '1,1 5,1 9,1 9,5 9,9 5,9 1,9 1,5 3,3 5,5'],
        ['hull'],
      ]);
      expect(normalizedHull(t.endState()), algorithm).toEqual(['1,1', '9,1', '9,9', '1,9']);
    }
  });

  it('keeps one copy of a repeated point and handles a line', () => {
    const t = new Timeline(convexHull, settings('graham'), 1, [
      ['load', '2,2 8,2 5,8 2,2 8,2'],
      ['hull'],
    ]);
    expect(t.endState().dropped).toHaveLength(2);
    expect(normalizedHull(t.endState())).toEqual(['2,2', '8,2', '5,8']);
    const line = new Timeline(convexHull, settings('jarvis'), 1, [
      ['load', '5,3 1,1 9,5 3,2'],
      ['hull'],
    ]);
    expect(normalizedHull(line.endState())).toEqual(['1,1', '9,5']);
  });

  it('gift wrapping makes (n - 2) tests per corner', () => {
    const t = new Timeline(convexHull, settings('jarvis'), 1, [
      ['load', '1,1 11,1 11,11 1,11 4,5 6,3 8,6 5,8'],
      ['hull'],
    ]);
    expect(t.endState().tests).toBe(4 * 6);
  });

  it('matches a brute-force hull for any points, with every algorithm', () => {
    fc.assert(
      fc.property(
        fc.array(pointArb, { minLength: 0, maxLength: 14 }),
        fc.constantFrom<Algorithm>('graham', 'monotone', 'jarvis'),
        (pts, algorithm) => {
          const calls = pts.length
            ? ([['load', writePoints(pts)], ['hull']] as const)
            : ([['hull']] as const);
          const t = new Timeline(
            convexHull,
            settings(algorithm),
            1,
            calls.map((c) => [...c]),
          );
          const end = t.endState();
          const hull = normalizedHull(end);
          expect(new Set(hull)).toEqual(referenceCorners(pts));
          expect(new Set(hull).size).toBe(hull.length);
          // Counter-clockwise, and strictly convex: every turn around the hull is a left turn.
          const hp = hull.map((k) => {
            const [x, y] = k.split(',').map(Number);
            return { x: x!, y: y! };
          });
          if (hp.length >= 3)
            hp.forEach((p, i) => {
              expect(orient(p, hp[(i + 1) % hp.length]!, hp[(i + 2) % hp.length]!)).toBeGreaterThan(
                0,
              );
            });
          // On every step the chain being built turns left at each inner point, after a push.
          for (let i = 0; i < t.length; i++) {
            const { step } = t.at(i);
            const s = step.state;
            if (algorithm !== 'jarvis' && step.lines.some((l) => l.endsWith('push'))) {
              const ch = s.stack.map((id) => s.points.find((p) => p.id === id)!);
              for (let k = 2; k < ch.length; k++)
                expect(orient(ch[k - 2]!, ch[k - 1]!, ch[k]!)).toBeGreaterThan(0);
            }
            // Each pass pushes a point once, so it pops it at most once (the monotone chain has two).
            expect(s.pops).toBeLessThanOrEqual(2 * s.points.length);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('parses point lists and counts', () => {
    expect(parsePoints('1,2 3,4')).toBe('1,2 3,4');
    expect(parsePoints('(1, 2) (3,4)')).toBe('1,2 3,4');
    expect(parsePoints('8')).toBe(8);
    expect(parsePoints('0')).toBeInstanceOf(Error);
    expect(parsePoints('1,2 13,4')).toBeInstanceOf(Error);
    expect(parsePoints('1.5,2')).toBeInstanceOf(Error);
    expect(parsePoints('cat')).toBeInstanceOf(Error);
  });
});

describe('convex hull narration', () => {
  const run = (algorithm: Algorithm, points: string) =>
    new Timeline(convexHull, settings(algorithm), 1, [['load', points], ['hull']]);

  it('counts one test and one pop in the singular', () => {
    // Was "Graham scan used 1 turn tests" and "2 turn tests and 1 pops".
    expect(run('graham', '1,1 5,1 3,4').entries[1]!.steps.at(-1)!.say).toContain(
      'Graham scan used 1 turn test.',
    );
    expect(run('monotone', '1,1 5,1 3,4').entries[1]!.steps.at(-1)!.say).toContain(
      'used 2 turn tests and 1 pop.',
    );
  });

  it('names the segment of a line, and claims no turns on a chain of two', () => {
    const steps = run('graham', '5,3 1,1 9,5 3,2 11,6 7,4').entries[1]!.steps;
    expect(steps.at(-1)!.say).toContain('the "hull" is the segment from B to E.');
    // Was "The chain now ends B → E, and every turn along it is a left turn."
    expect(steps.find((s) => s.say.startsWith('Push E'))!.say).toBe(
      'Push E. The chain now ends B → E.',
    );
  });

  it('pops both edge points of the collinear-edge example, as its notes say', () => {
    const ex = convexHull.examples.find((e) => e.id === 'collinear-edge')!;
    const t = new Timeline(convexHull, settings('graham'), 1, ex.ops);
    const popped = t.entries[1]!.steps.filter((s) => s.say.startsWith('Pop ')).map((s) => s.say[4]);
    expect(popped).toEqual(['D', 'F']);
    expect(ex.notes).toContain('D and F, are popped by collinear turns');
  });

  it('says "1 pop" in the practice explanation', () => {
    const pops = convexHull.practice!.find((k) => k.id === 'pops')!;
    for (let seed = 1; seed <= 150; seed++) {
      const q = pops.make(makeRng(seed));
      expect(q.explain).not.toMatch(/\b1 pops\b/);
      if (q.answer.kind === 'number' && q.answer.value === 1)
        expect(q.explain).toContain('there is 1 pop.');
    }
  });
});

describe('drawn text size', () => {
  // Axis numbers were 11 units (and the hull's sort order 10): now 13.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(convexHull, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(convexHull, PHONE_STAGE).px).toBeGreaterThanOrEqual(10);
  });
});
