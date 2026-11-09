import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Timeline } from '../../engine/timeline';
import { orient, writePoints, type Vec } from '../../layouts/plane';
import { parsePolygonInput, polygon } from '.';
import { isSimple, type PolySettings, type PolyState } from './model';
import { smallestText } from '../../render/text-size';
import { LAPTOP_STAGE, PHONE_STAGE } from '../../render/stage';

const ray: PolySettings = { inside: 'ray' };
const winding: PolySettings = { inside: 'winding' };

const result = (s: PolyState) => s.result!;
const end = (settings: PolySettings, pts: Vec[] | string, ...more: [string, ...number[]][]) =>
  new Timeline(polygon, settings, 1, [
    ['load', typeof pts === 'string' ? pts : writePoints(pts)],
    ...more,
  ]).endState();

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** Reference winding number: add up the angles q sees each edge under. */
function angleWinding(v: Vec[], q: Vec): number {
  let total = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i]!;
    const b = v[(i + 1) % v.length]!;
    const t1 = Math.atan2(a.y - q.y, a.x - q.x);
    const t2 = Math.atan2(b.y - q.y, b.x - q.x);
    let d = t2 - t1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return Math.round(total / (2 * Math.PI));
}

const onBoundary = (v: Vec[], q: Vec) =>
  v.some((a, i) => {
    const b = v[(i + 1) % v.length]!;
    return (
      orient(a, b, q) === 0 &&
      Math.min(a.x, b.x) <= q.x &&
      q.x <= Math.max(a.x, b.x) &&
      Math.min(a.y, b.y) <= q.y &&
      q.y <= Math.max(a.y, b.y)
    );
  });

const coord = fc.integer({ min: 0, max: 12 });
const polyArb = fc
  .array(fc.record({ x: coord, y: coord }), { minLength: 3, maxLength: 8 })
  .map((ps) =>
    ps.filter(
      (p, i) => !(p.x === ps[(i + 1) % ps.length]!.x && p.y === ps[(i + 1) % ps.length]!.y),
    ),
  )
  .filter((ps) => ps.length >= 3);

describe('polygon algorithms', () => {
  it('works out the curated cases', () => {
    const L = '2,2 10,2 10,5 5,5 5,10 2,10';
    expect(result(end(ray, L, ['area']))).toEqual({ kind: 'area', sum: 78 });
    expect(result(end(ray, L, ['convex']))).toMatchObject({ convex: false });
    expect(result(end(ray, L, ['inside', 5, 7]))).toMatchObject({ where: 'boundary' });
    expect(result(end(ray, L, ['inside', 7, 8]))).toMatchObject({ where: 'outside', count: 0 });
    expect(result(end(ray, '6,1 11,6 6,11 1,6', ['inside', 3, 6]))).toMatchObject({
      where: 'inside',
      count: 1,
    });
    const star = '6,11 9,2 1,7 11,7 3,2';
    expect(result(end(ray, star, ['convex']))).toMatchObject({ convex: false });
    expect(result(end(ray, star, ['inside', 6, 6]))).toMatchObject({ where: 'outside' });
    expect(result(end(winding, star, ['inside', 6, 6]))).toMatchObject({ where: 'inside' });
    expect(result(end(ray, '2,2 2,9 10,9 10,2', ['orientation']))).toMatchObject({
      turn: -56,
    });
  });

  it('says what the star does: right turns, −720°, winding −2', () => {
    const star = '6,11 9,2 1,7 11,7 3,2';
    const t = new Timeline(polygon, winding, 1, [['load', star], ['convex'], ['inside', 6, 6]]);
    const turns = t.entries[1]!.steps.slice(0, -1).map((s) => s.say);
    expect(turns.every((say) => say.includes('a right turn'))).toBe(true);
    expect(t.entries[1]!.steps.at(-1)!.say).toContain('The turns add up to -720°');
    expect(t.entries[2]!.end.result).toMatchObject({ where: 'inside', count: -2 });
    // The concept page and the notes said "turns left at every vertex" and "winding number 2".
    expect(polygon.explain).not.toContain('turns left at every vertex');
    const notes = (id: string) => polygon.examples.find((e) => e.id === id)!.notes;
    expect(notes('star-winding')).toContain('winding number is −2');
    expect(notes('star-even-odd')).toContain('−720°');
  });

  it('says the even-odd rule agrees when the winding number is odd', () => {
    // A triangle traced three times winds around its middle 3 times: 3 crossings, odd.
    const thrice = '2,2 10,2 6,10 2,2 10,2 6,10 2,2 10,2 6,10';
    const say = new Timeline(polygon, winding, 1, [
      ['load', thrice],
      ['inside', 6, 5],
    ]).entries[1]!.steps.at(-1)!.say;
    expect(say).toContain('The winding number is 3, so q is inside.');
    // Was "the even-odd rule would call it outside", which is false for an odd count.
    expect(say).toContain('the even-odd rule agrees, since that is odd');
    expect(end(ray, thrice, ['inside', 6, 5]).result).toMatchObject({ where: 'inside', count: 3 });
  });

  it('explains the half-open rule at the edge it lets through', () => {
    const steps = new Timeline(polygon, ray, 1, [
      ['load', '6,1 11,6 6,11 1,6'],
      ['inside', 3, 6],
    ]).entries[1]!.steps;
    // Was "goes from y = 6 to y = 11, past y = 6".
    expect(steps.find((s) => s.say.startsWith('Edge BC'))!.say).toContain(
      'Its end on the ray counts as below it',
    );
  });

  it('agrees with Pick, angle sums and an edge-by-edge convexity check', () => {
    fc.assert(
      fc.property(polyArb, coord, coord, (v, qx, qy) => {
        const simple = isSimple(v);
        const sum = (result(end(ray, v, ['area'])) as { sum: number }).sum;
        if (simple) {
          // Pick's theorem: area = I + B/2 - 1, counting lattice points.
          const B = v.reduce((t, a, i) => {
            const b = v[(i + 1) % v.length]!;
            return t + gcd(b.x - a.x, b.y - a.y);
          }, 0);
          let I = 0;
          for (let x = 0; x <= 12; x++)
            for (let y = 0; y <= 12; y++) {
              const q = { x, y };
              if (!onBoundary(v, q) && angleWinding(v, q) !== 0) I++;
            }
          expect(Math.abs(sum) / 2).toBe(I + B / 2 - 1);
          const o = result(end(ray, v, ['orientation'])) as { turn: number };
          if (o.turn !== 0) expect(Math.sign(o.turn)).toBe(Math.sign(sum));
        }
        const q = { x: qx, y: qy };
        const r = result(end(ray, v, ['inside', qx, qy])) as { where: string };
        const w = result(end(winding, v, ['inside', qx, qy])) as { where: string };
        if (onBoundary(v, q)) {
          expect(r.where).toBe('boundary');
          expect(w.where).toBe('boundary');
        } else {
          const wn = angleWinding(v, q);
          expect(w.where).toBe(wn !== 0 ? 'inside' : 'outside');
          expect(r.where).toBe(Math.abs(wn) % 2 === 1 ? 'inside' : 'outside');
        }
        // Convex: distinct vertices, nonzero area, every vertex on one side of every edge.
        const distinct = new Set(v.map((p) => `${p.x},${p.y}`)).size === v.length;
        const sides = v.flatMap((a, i) => {
          const b = v[(i + 1) % v.length]!;
          return v.map((c) => Math.sign(orient(a, b, c)));
        });
        const oneSide = !sides.includes(1) || !sides.includes(-1);
        const c = result(end(ray, v, ['convex'])) as { convex: boolean };
        expect(c.convex).toBe(distinct && sum !== 0 && oneSide);
      }),
      { numRuns: 300 },
    );
  });

  it('parses vertex lists, counts and coordinates', () => {
    expect(parsePolygonInput('1,1 5,1 3,4')).toBe('1,1 5,1 3,4');
    expect(parsePolygonInput('7')).toBe(7);
    expect(parsePolygonInput('13')).toBeInstanceOf(Error);
    expect(parsePolygonInput('a,b')).toBeInstanceOf(Error);
  });
});

describe('drawn text size', () => {
  // Axis numbers were 11 units (8.8 px on a laptop), then 13; winding labels 12: now all 14.
  it('stays readable on a laptop and on a phone', () => {
    expect(smallestText(polygon, LAPTOP_STAGE).px).toBeGreaterThanOrEqual(11);
    expect(smallestText(polygon, PHONE_STAGE).px).toBeGreaterThanOrEqual(11);
  });
});
